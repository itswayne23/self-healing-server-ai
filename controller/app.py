from flask import Flask, jsonify, request
import requests
import time
import threading
import sqlite3
from pathlib import Path
from flask_cors import CORS
import subprocess
import json

# --- Configuration ---
NODES = ["node1", "node2", "node3"]
SEEN_CASES = set()
MAX_LATENCY = 1.0
MAX_ACTIVE_CASES = 5
POLL_INTERVAL = 3
MAX_EVENTS = 200
SEEN_ANOMALIES = set()
GOVERNANCE_ACTIONS = {}
GOVERNANCE_COOLDOWN = 30  # seconds
NODE_LATENCY = {}
NODE_LAST_SEEN = {}
POLICY_COOLDOWN = 30  # seconds
LAST_POLICY_ACTION = {}
RECOVERY_CANDIDATES = {}
CLUSTER_SNAPSHOTS = {}
SNAPSHOT_VERSION = 0
DEAD_HEALTH_THRESHOLD = 0.25
MAX_QUARANTINE_TIME = 180
dead_nodes = {}
AUTO_REPLACE = True
REPLACEMENT_COOLDOWN = 30
last_replacement = {}
excluded_nodes = set()
DB_PATH = "/app/events.db"

# --- Thread Safety ---
state_lock = threading.RLock()  # ✅ Re-entrant lock for nested state reads

# --- Global State ---
app = Flask(__name__)
CORS(app)
CLUSTER_STATUS = {}
CLUSTER_EVENTS = []  # ✅ Explicitly initialize as list

# Initialize node tracking
for n in NODES:
    NODE_LAST_SEEN[n] = time.time()
    NODE_LATENCY[n] = 0.0

# --- Database Helpers ---
def init_db():
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()
    cur.execute("""
    CREATE TABLE IF NOT EXISTS events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        case_id TEXT,
        node TEXT,
        process TEXT,
        result TEXT,
        weighted REAL,
        time REAL 
    )
    """)
    cur.execute("""
    CREATE TABLE IF NOT EXISTS anomalies (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        node TEXT,
        peer TEXT,
        reason TEXT,
        accuracy REAL,
        total_cases INTEGER,
        severity TEXT,
        time REAL
    )
    """)
    cur.execute("""
    CREATE TABLE IF NOT EXISTS metrics (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        case_id UNIQUE,
        proposer TEXT,
        start_time REAL,
        consensus_time REAL,
        remediation_time REAL,
        result TEXT
    )
    """)
    cur.execute("CREATE INDEX IF NOT EXISTS idx_metrics_case ON metrics(case_id)")
    cur.execute("""
    CREATE TABLE IF NOT EXISTS audit (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        action TEXT,
        actor TEXT,
        target TEXT,
        case_id TEXT,
        metadata TEXT,
        time REAL
    )
    """)
    conn.commit()
    conn.close()

def insert_event(e):
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()
    cur.execute("""
    INSERT INTO events
    (case_id, node, process, result, weighted, time)
    VALUES (?, ?, ?, ?, ?, ?)
    """, (
        e["case_id"],
        e["node"],
        e["process"],
        e["result"],
        e["weighted"],
        e["time"]
    ))
    conn.commit()
    conn.close()

def load_recent_events(limit=200):
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()
    cur.execute("""
    SELECT case_id, node, process, result, weighted, time
    FROM events
    ORDER BY id DESC
    LIMIT ?
    """, (limit,))
    rows = cur.fetchall()
    conn.close()
    return [
        {
            "case_id": r[0],
            "node": r[1],
            "process": r[2],
            "result": r[3],
            "weighted": r[4],
            "time": r[5],
        }
        for r in rows
    ]

def broadcast_penalty(node, penalty):
    with state_lock:
        targets = list(set(NODES + list(CLUSTER_STATUS.keys())))
    
    for target in targets:
        try:
            requests.post(
                f"http://{target}:5000/governance/penalize",
                json={"node": node, "penalty": penalty},
                timeout=5
            )
        except:
            pass

def insert_metric_start(case_id, proposer, start_time):
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()
    cur.execute("""
    INSERT OR IGNORE INTO metrics (case_id, proposer, start_time)
    VALUES (?, ?, ?)
    """, (case_id, proposer, start_time))
    conn.commit()
    conn.close()

def update_metric_consensus(case_id, consensus_time, result):
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()
    cur.execute("""
    UPDATE metrics
    SET consensus_time = ?, result = ?
    WHERE case_id = ?
    """, (consensus_time, result, case_id))
    conn.commit()
    conn.close()

def insert_audit(action, actor=None, target=None, case_id=None, metadata=None):
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()
    cur.execute("""
    INSERT INTO audit (action, actor, target, case_id, metadata, time)
    VALUES (?, ?, ?, ?, ?, ?)
    """, (
        action,
        actor,
        target,
        case_id,
        json.dumps(metadata or {}),
        time.time()
    ))
    conn.commit()
    conn.close()

def discover_nodes():
    try:
        result = subprocess.run(
            ["docker", "ps", "--format", "{{.Names}}"],
            capture_output=True,
            text=True
        )
        containers = result.stdout.strip().split("\n")
        dynamic = [
            name for name in containers
            if name.startswith("node")
        ]
        return dynamic
    except Exception as e:
        print(f"⚠️ node discovery failed: {e}")
        return []

def poll_nodes():
    while True:
        current_nodes = list(set(NODES + discover_nodes()))
        
        for node in current_nodes:
            with state_lock:
                if node in excluded_nodes:
                    continue

            try:
                base = f"http://{node}:5000"
                should_evaluate_policy = False
                health = 0.0

                # ---- STATUS ----
                start = time.time()
                status_data = {}
                latency = MAX_LATENCY
                online = False
                rep_data = {}
                snap_data = {}
                events_data = []

                try:
                    resp = requests.get(f"{base}/status", timeout=5)
                    latency = time.time() - start
                    status_data = resp.json()
                    online = True
                except Exception as e:
                    status_data = {"error": str(e)}
                    online = False
                    latency = MAX_LATENCY

                # ---- REPUTATION ----
                try:
                    rep_resp = requests.get(f"{base}/reputation", timeout=5)
                    rep_data = rep_resp.json()
                except Exception as e:
                    rep_data = {"reputation_error": str(e)}

                # ---- STATE SNAPSHOT ----
                try:
                    snap_resp = requests.get(f"{base}/state/snapshot", timeout=5)
                    snap_data = snap_resp.json()
                except Exception as e:
                    snap_data = {"error": str(e)}

                # ---- EVENTS ----
                try:
                    events_resp = requests.get(f"{base}/events", timeout=5)
                    events_data = events_resp.json()
                except:
                    events_data = []

                # ✅ Acquire lock for ALL global updates
                with state_lock:
                    NODE_LATENCY[node] = latency
                    NODE_LAST_SEEN[node] = time.time()
                    
                    CLUSTER_STATUS.setdefault(node, {})
                    CLUSTER_STATUS[node].update(status_data)
                    CLUSTER_STATUS[node]["online"] = online
                    CLUSTER_STATUS[node]["reputation"] = rep_data
                    
                    global SNAPSHOT_VERSION
                    SNAPSHOT_VERSION += 1
                    CLUSTER_SNAPSHOTS[node] = snap_data

                    # Process Events ✅ FIXED: was "for e in events_"
                    for e in events_data:
                        key = f"{e['case_id']}:{e['node']}:{e['time']}"
                        if key not in SEEN_CASES:
                            SEEN_CASES.add(key)
                            start_time = e.get("start_time")
                            if start_time:
                                insert_metric_start(e["case_id"], e["node"], start_time)
                            insert_event(e)
                            insert_audit(
                                action="consensus_result",
                                actor=e["node"],
                                case_id=e["case_id"],
                                metadata={
                                    "result": e["result"],
                                    "weighted": e["weighted"]
                                }
                            )
                            if e["result"] in ("terminated", "rejected"):
                                update_metric_consensus(e["case_id"], e["time"], e["result"])
                            CLUSTER_EVENTS.append(e)
                    
                    CLUSTER_EVENTS[:] = CLUSTER_EVENTS[-MAX_EVENTS:]

                    # Compute Health
                    if "error" not in CLUSTER_STATUS[node]:
                        health = compute_node_health(node, CLUSTER_STATUS[node])
                    else:
                        health = 0.0
                    CLUSTER_STATUS[node]["health"] = health

                    # Identity override logic
                    if node in dead_nodes:
                        replacement_alive = any(
                            n.startswith(f"{node}_r")
                            and n in CLUSTER_STATUS
                            and "error" not in CLUSTER_STATUS[n]
                            and CLUSTER_STATUS[n].get("health", 0) > 0.5
                            for n in list(CLUSTER_STATUS.keys())
                        )
                        if replacement_alive:
                            print(f"🧷 Quarantining returning original {node} (replacement active)")
                            excluded_nodes.add(node)
                            continue

                    # Death detection
                    q = CLUSTER_STATUS[node].get("quarantined", {}).get(node, {})
                    quarantined = q.get("active", False)
                    until = q.get("until", 0)
                    too_long = quarantined and time.time() > (until + MAX_QUARANTINE_TIME)
                    is_replacement = "_r" in node

                    if not is_replacement and (health < DEAD_HEALTH_THRESHOLD or too_long):
                        if node not in dead_nodes:
                            reason = "low_health" if health < DEAD_HEALTH_THRESHOLD else "stuck_quarantine"
                            dead_nodes[node] = {
                                "time": time.time(),
                                "reason": reason
                            }
                            excluded_nodes.add(node)
                            print(f"💀 Node marked dead: {node} reason={reason}")

                    # Run Policy
                    if "error" not in CLUSTER_STATUS[node]:
                        should_evaluate_policy = True

                if should_evaluate_policy:
                    evaluate_policy(node, health)

                # Spawn replacement outside lock
                if node in dead_nodes and AUTO_REPLACE:
                    last = last_replacement.get(node, 0)
                    if time.time() - last >= REPLACEMENT_COOLDOWN:
                        spawn_replacement(node)

            except Exception as e:
                with state_lock:
                    CLUSTER_STATUS[node] = {
                        "node": node,
                        "error": str(e),
                        "online": False,
                    }

        time.sleep(POLL_INTERVAL)

def anomaly_watchdog():
    while True:
        try:
            _ = cluster_anomalies_internal()
        except Exception as e:
            print(f"anomaly watchdog error: {e}")
        time.sleep(5)

def cluster_anomalies_internal():
    anomalies = {}
    with state_lock:
        status_copy = dict(CLUSTER_STATUS)
        excluded_copy = set(excluded_nodes)
    
    for node, data in status_copy.items():
        if node in excluded_copy:
            continue

        rep = data.get("reputation", {})
        engine = rep.get("engine", {})
        flags = []

        for peer, metrics in engine.items():
            total = metrics.get("total", 0)
            acc = metrics.get("accuracy", 1.0)
            if total < 3:
                continue

            severity = anomaly_severity({
                "accuracy": acc,
                "total_cases": total
            })
            if not severity:
                continue

            anomaly_record = {
                "node": node,
                "peer": peer,
                "reason": "low_accuracy",
                "severity": severity,
                "accuracy": round(acc, 2),
                "total_cases": total
            }
            flags.append(anomaly_record)

            key = f"{node}:{peer}:{severity}"
            penalty = None
            
            with state_lock:
                if key not in SEEN_ANOMALIES:
                    SEEN_ANOMALIES.add(key)
                    insert_anomaly(anomaly_record)

                now = time.time()
                last = GOVERNANCE_ACTIONS.get(peer, 0)
                if now - last > GOVERNANCE_COOLDOWN:
                    if severity == "high":
                        penalty = 0.15
                    if severity == "critical":
                        penalty = 0.25
                    if penalty:
                        GOVERNANCE_ACTIONS[peer] = now

            if penalty:
                broadcast_penalty(peer, penalty)
                insert_audit(
                    action="penalty",
                    actor=node,
                    target=peer,
                    metadata={"severity": severity, "penalty": penalty}
                )

        if flags:
            anomalies[node] = flags
    return anomalies

def generate_explanation(event):
    node = event["node"]
    result = event["result"]
    weighted = event.get("weighted", 0)
    verdict = (
        "The cluster reached consensus and terminated the process. "
        if result == "terminated"
        else "The cluster rejected remediation due to insufficient trust-weighted votes. "
    )
    confidence = "high" if weighted >= 2 else "low"
    return (
        f"Incident detected by {node}.  "
        f"{verdict}  "
        f"The weighted vote score was {weighted:.2f}, giving {confidence} confidence  "
        f"that the behavior was malicious. "
    )

def compute_node_health(node, data):
    trust_map = data.get("trust", {})
    rep_engine = data.get("reputation", {}).get("engine", {})
    active_cases = data.get("active_cases", 0)
    
    avg_trust = (
        sum(trust_map.values()) / len(trust_map)
        if trust_map else 1.0
    )
    accuracy = rep_engine.get(node, {}).get("accuracy", 1.0)
    
    with state_lock:
        latency = NODE_LATENCY.get(node, MAX_LATENCY)
        last_seen = NODE_LAST_SEEN.get(node, 0)
    
    latency_score = max(0.0, min(1.0, 1 - (latency / MAX_LATENCY)))
    stability_score = max(0.0, min(1.0, 1 - (active_cases / MAX_ACTIVE_CASES)))
    health = (
        0.4 * avg_trust +
        0.3 * accuracy +
        0.2 * latency_score +
        0.1 * stability_score
    )
    offline_time = time.time() - last_seen
    is_offline = data.get("online") is False or "error" in data
    if is_offline:
        if offline_time > 5:
            health *= 0.5
        if offline_time > 10:
            health = 0.0
    health = max(0.0, min(1.0, health))
    return round(health, 3)

def evaluate_policy(node, health):
    now = time.time()
    with state_lock:
        last = LAST_POLICY_ACTION.get(node, 0)
        if now - last < POLICY_COOLDOWN:
            return
        LAST_POLICY_ACTION[node] = now

    if 0.65 > health >= 0.45:
        broadcast_penalty(node, 0.05)
        with state_lock:
            RECOVERY_CANDIDATES[node] = "monitor"
    elif 0.45 > health >= 0.3:
        broadcast_penalty(node, 0.1)
        with state_lock:
            RECOVERY_CANDIDATES[node] = "recover"
    elif health < 0.3:
        broadcast_penalty(node, 0.2)
        force_quarantine(node)
        with state_lock:
            RECOVERY_CANDIDATES[node] = "replace"

def force_quarantine(node):
    with state_lock:
        targets = list(set(NODES + list(CLUSTER_STATUS.keys())))
    
    for target in targets:
        try:
            requests.post(
                f"http://{target}:5000/governance/quarantine",
                json={"node": node, "duration": 180},
                timeout=5
            )
        except:
            pass
    insert_audit(action="quarantine", actor="controller", target=node)

def spawn_replacement(node_name):
    new_node = f"{node_name}_r{int(time.time())}"
    print(f"♻️ Spawning replacement for {node_name} → {new_node}")
    image = f"self-healing-server-{node_name}"
    volume = f"self-healing-server_{node_name}-data:/data"
    
    with state_lock:
        peers = ", ".join(list(set(NODES + list(CLUSTER_STATUS.keys()))))

    try:
        subprocess.run([
            "docker", "run", "-d",
            "--name", new_node,
            "--network", "self-healing-server_cluster-net",
            "--label", "com.docker.compose.project=self-healing-server",
            "-e", f"NODE_NAME={new_node}",
            "-e", f"PEERS={peers}",
            "-v", volume,
            image
        ], check=True)
    except Exception as e:
        print(f"❌ spawn failed for {node_name}: {e}")
    
    with state_lock:
        last_replacement[node_name] = time.time()

# --- Flask Routes ---

@app.route("/cluster/status")
def cluster_status():
    with state_lock:
        return jsonify(dict(CLUSTER_STATUS))

@app.route("/cluster/events")
def cluster_events():
    with state_lock:
        return jsonify(list(CLUSTER_EVENTS))

@app.route("/cluster/nodes")
def cluster_nodes():
    with state_lock:
        return jsonify(list(CLUSTER_STATUS.keys()))

@app.route("/history")
def history():
    return jsonify(load_recent_events(500))

@app.route("/stats")
def stats():
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()
    cur.execute("SELECT node, COUNT(*) FROM events GROUP BY node")
    per_node = dict(cur.fetchall())
    cur.execute("SELECT result, COUNT(*) FROM events GROUP BY result")
    per_result = dict(cur.fetchall())
    conn.close()
    return jsonify({
        "events_total": sum(per_node.values()),
        "by_node": per_node,
        "by_result": per_result
    })

@app.route("/cluster/explain/<case_id>")
def explain_case(case_id):
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()
    row = cur.execute("""
    SELECT case_id, node, process, result, weighted, time
    FROM events
    WHERE case_id = ?
    ORDER BY time DESC
    LIMIT 1
    """, (case_id,)).fetchone()
    conn.close()
    if not row:
        return jsonify({"error": "case not found"}), 404
    event = {
        "case_id": row[0],
        "node": row[1],
        "process": row[2],
        "result": row[3],
        "weighted": row[4],
        "time": row[5],
    }
    explanation = generate_explanation(event)
    return jsonify({
        "case_id": case_id,
        "explanation": explanation,
        "raw": event,
    })

@app.route("/cluster/trust")
def cluster_trust():
    with state_lock:
        snapshot = {}
        for node, data in CLUSTER_STATUS.items():
            if node in excluded_nodes:
                continue
            snapshot[node] = {
                "trust": data.get("trust"),
                "strikes": data.get("strikes"),
                "active_cases": data.get("active_cases"),
            }
    return jsonify(snapshot)

@app.route("/cluster/quarantine")
def cluster_quarantine():
    with state_lock:
        snap = {}
        for node, data in CLUSTER_STATUS.items():
            if node in excluded_nodes:
                continue
            snap[node] = data.get("quarantined", {})
    return jsonify(snap)

@app.route("/cluster/quarantine_timers")
def cluster_quarantine_timers():
    timers = {}
    now = time.time()
    with state_lock:
        for node, data in CLUSTER_STATUS.items():
            if node in excluded_nodes:
                continue
            q = data.get("quarantined", {})
            timers[node] = {}
            for peer, info in q.items():
                if info.get("active"):
                    remaining = int(info.get("until", 0) - now)
                    timers[node][peer] = max(0, remaining)
                else:
                    timers[node][peer] = 0
    return jsonify(timers)

@app.route("/cluster/reputation")
def cluster_reputation():
    with state_lock:
        snap = {}
        for node, data in CLUSTER_STATUS.items():
            if node in excluded_nodes:
                continue
            snap[node] = data.get("reputation", {})
    return jsonify(snap)

@app.route("/cluster/anomalies")
def cluster_anomalies():
    return jsonify(cluster_anomalies_internal())

@app.route("/cluster/metrics")
def cluster_metrics():
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()
    rows = cur.execute("""
    SELECT case_id, proposer, start_time, consensus_time, result
    FROM metrics
    """).fetchall()
    conn.close()
    output = []
    for r in rows:
        latency = round(r[3] - r[2], 2) if r[3] else None
        output.append({
            "case_id": r[0],
            "proposer": r[1],
            "latency": latency,
            "result": r[4]
        })
    return jsonify(output)

@app.route("/cluster/health")
def cluster_health():
    health_map = {}
    with state_lock:
        for node, data in CLUSTER_STATUS.items():
            if node in excluded_nodes:
                continue
            # ✅ FIXED: was "if 'error' in"
            if "error" in data:
                health_map[node] = 0.0
                continue
            health_map[node] = compute_node_health(node, data)
    return jsonify(health_map)

@app.route("/cluster/recovery_candidates")
def cluster_recovery_candidates():
    with state_lock:
        return jsonify(dict(RECOVERY_CANDIDATES))

@app.route("/cluster/snapshots")
def cluster_snapshots():
    with state_lock:
        return jsonify({
            "version": SNAPSHOT_VERSION,
            "nodes": dict(CLUSTER_SNAPSHOTS)
        })

@app.route("/cluster/recover", methods=["POST"])
def cluster_recover():
    data = request.json
    node = data.get("node")
    
    with state_lock:
        if node not in CLUSTER_SNAPSHOTS:
            return jsonify({"status": "unknown_node"}), 404
        donor = None
        for peer, snap in CLUSTER_SNAPSHOTS.items():
            if peer != node and snap.get("trust"):
                donor = snap
                break
    
    if not donor:
        return jsonify({"status": "no_donor"}), 500

    print(f"🩺 recovery requested by {node}")
    insert_audit(action="recovery_start", actor="controller", target=node)

    try:
        requests.post(
            f"http://{node}:5000/state/restore",
            json=donor,
            timeout=5
        )
    except:
        pass
    insert_audit(action="recovery_complete", actor="controller", target=node)
    return jsonify({"status": "recovery_sent"})

@app.route("/cluster/dead")
def cluster_dead():
    with state_lock:
        return jsonify(dict(dead_nodes))

@app.route("/cluster/audit")
def audit_all():
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()
    rows = cur.execute("""
    SELECT action, actor, target, case_id, metadata, time
    FROM audit
    ORDER BY id DESC
    LIMIT 500
    """).fetchall()
    conn.close()
    return jsonify([
        {
            "action": r[0],
            "actor": r[1],
            "target": r[2],
            "case_id": r[3],
            "metadata": json.loads(r[4]),
            "time": r[5]
        }
        for r in rows
    ])

@app.route("/cluster/audit/node/<node>")
def audit_node(node):
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()
    rows = cur.execute("""
    SELECT action, actor, target, case_id, metadata, time
    FROM audit
    WHERE actor = ? OR target = ?
    ORDER BY id DESC
    LIMIT 200
    """, (node, node)).fetchall()
    conn.close()
    return jsonify([
        {
            "action": r[0],
            "actor": r[1],
            "target": r[2],
            "case_id": r[3],
            "metadata": json.loads(r[4]),
            "time": r[5]
        }
        for r in rows
    ])

@app.route("/cluster/audit/case/<case_id>")
def audit_case(case_id):
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()
    rows = cur.execute("""
    SELECT action, actor, target, metadata, time
    FROM audit
    WHERE case_id = ?
    ORDER BY time ASC
    """, (case_id,)).fetchall()
    conn.close()
    return jsonify([
        {
            "time": r[4],
            "event": r[0],
            "actor": r[1],
            "target": r[2],
            "metadata": json.loads(r[3])
        }
        for r in rows
    ])

@app.route("/cluster/timeline/<node>")
def node_timeline(node):
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()
    rows = cur.execute("""
    SELECT action, actor, target, metadata, time
    FROM audit
    WHERE actor = ? OR target = ?
    ORDER BY time ASC
    """, (node, node)).fetchall()
    conn.close()
    return jsonify([
        {
            "time": r[4],
            "event": r[0],
            "actor": r[1],
            "target": r[2],
            "metadata": json.loads(r[3])
        }
        for r in rows
    ])

# --- Helpers ---

def anomaly_severity(a):
    acc = a.get("accuracy", 1.0)
    total = a.get("total_cases", 0)
    if total < 3:
        return None
    if acc < 0.15 and total >= 8:
        return "critical"
    if acc < 0.25 and total >= 5:
        return "high"
    if acc < 0.4:
        return "medium"
    return None

def insert_anomaly(a):
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()
    cur.execute("""
    INSERT INTO anomalies (node, peer, reason, severity, accuracy, total_cases, time)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    """, (
        a["node"],
        a["peer"],
        a["reason"],
        a["severity"],
        a["accuracy"],
        a["total_cases"],
        time.time()
    ))
    conn.commit()
    conn.close()

def governance_feedback(peer, severity):
    penalty = {
        "medium": 0.05,
        "high": 0.1,
        "critical": 0.2
    }.get(severity, 0)
    if penalty > 0:
        broadcast_penalty(peer, penalty)

def replica_sync_loop():
    while True:
        time.sleep(10)
        with state_lock:
            snaps_copy = dict(CLUSTER_SNAPSHOTS)
            status_copy = dict(CLUSTER_STATUS)
        
        if not snaps_copy:
            continue

        for node, snap in snaps_copy.items():
            if "error" in snap:
                continue
            is_amnesiac = (
                not snap.get("node_stats") or
                not snap.get("reputation") or
                len(snap.get("events", [])) == 0
            )
            if not is_amnesiac:
                continue

            print(f"🧠 {node} detected amnesia")
            donor_node = None
            best_health = 0

            for peer in status_copy.keys():
                if peer == node:
                    continue
                peer_snap = snaps_copy.get(peer)
                if not peer_snap or "error" in peer_snap:
                    continue
                if (
                    not peer_snap.get("node_stats") or
                    len(peer_snap.get("events", [])) == 0
                ):
                    continue
                peer_status = status_copy.get(peer, {})
                h = peer_status.get("health", 0)
                peer_trust_map = peer_status.get("trust", {})
                avg_trust = (
                    sum(peer_trust_map.values()) / len(peer_trust_map)
                    if peer_trust_map else 1.0
                )
                if h < 0.6 or avg_trust < 0.6:
                    continue
                if h > best_health:
                    donor_node = peer
                    best_health = h

            if not donor_node:
                print(f"⚠️ no valid donor for {node}")
                continue

            donor = snaps_copy[donor_node]
            try:
                r = requests.post(
                    f"http://{node}:5000/state/restore",
                    json=donor,
                    timeout=5
                )
                print(f"🧬 restored {node} from {donor_node} status={r.status_code}")
            except Exception as e:
                print(f"❌ restore failed {node}: {e}")

# --- Startup ---
init_db()
with state_lock:
    CLUSTER_EVENTS[:] = load_recent_events()

threading.Thread(target=poll_nodes, daemon=True).start()
threading.Thread(target=anomaly_watchdog, daemon=True).start()
threading.Thread(target=replica_sync_loop, daemon=True).start()

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=7000, threaded=True)
