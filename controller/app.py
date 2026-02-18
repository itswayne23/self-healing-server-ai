from flask import Flask, jsonify
import requests
import time
import threading
import sqlite3
from pathlib import Path
from flask_cors import CORS



NODES = ["node1", "node2", "node3"]
SEEN_CASES = set()


app = Flask(__name__)
CORS(app)


CLUSTER_STATUS = {}
CLUSTER_EVENTS = []

POLL_INTERVAL = 3
MAX_EVENTS = 200

SEEN_ANOMALIES = set()
GOVERNANCE_ACTIONS = {}
GOVERNANCE_COOLDOWN = 30  # seconds

NODE_LATENCY = {}
NODE_LAST_SEEN = {}
for n in NODES:
    NODE_LAST_SEEN[n] = time.time()
    NODE_LATENCY[n] = 0.0


DB_PATH = "/app/events.db"

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
    for target in NODES:
        try:
            requests.post(
                f"http://{target}:5000/governance/penalize",
                json={"node": node, "penalty": penalty},
                timeout=2
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


def poll_nodes():

    while True:
        for node in NODES:
            try:
                base = f"http://{node}:5000"

                # ---- STATUS ----
                start = time.time()
                try:
                    resp = requests.get(f"{base}/status", timeout=2)
                    latency = time.time() - start

                    status = resp.json()

                    NODE_LATENCY[node] = latency
                    NODE_LAST_SEEN[node] = time.time()
                    CLUSTER_STATUS[node] = status

                except Exception as e:
                    CLUSTER_STATUS.setdefault(node, {})
                    CLUSTER_STATUS[node]["error"] = str(e)
                    CLUSTER_STATUS[node]["online"] = False

                    NODE_LATENCY[node] = MAX_LATENCY

                # ---- REPUTATION (Stage 8) ----
                try:
                    rep = requests.get(
                        f"{base}/reputation", timeout=2
                    ).json()

                    CLUSTER_STATUS[node]["reputation"] = rep

                except Exception as e:
                    CLUSTER_STATUS[node]["reputation_error"] = str(e)

                # ---- EVENTS ----
                try:
                    events = requests.get(
                        f"{base}/events", timeout=2
                    ).json()
                except:
                    events = []


                for e in events:
                    key = f"{e['case_id']}:{e['node']}:{e['time']}"

                    if key not in SEEN_CASES:
                        SEEN_CASES.add(key)

                        start_time = e.get("start_time")

                        if start_time:
                            insert_metric_start(e["case_id"], e["node"], start_time)

                        insert_event(e)

                        # 🔹 Metric consensus if final
                        if e["result"] in ("terminated", "rejected"):
                            update_metric_consensus(e["case_id"], e["time"], e["result"])

                        CLUSTER_EVENTS.append(e)

                CLUSTER_EVENTS[:] = CLUSTER_EVENTS[-MAX_EVENTS:]
                # ✅ attach health directly (optional but recommended)
                if "error" not in CLUSTER_STATUS[node]:
                    CLUSTER_STATUS[node]["health"] = compute_node_health(
                        node, CLUSTER_STATUS[node]
                    )
                else:
                    CLUSTER_STATUS[node]["health"] = 0.0


            except Exception as e:
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

    for node, data in CLUSTER_STATUS.items():

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
                "node": node,          # observer node
                "peer": peer,          # suspicious peer
                "reason": "low_accuracy",
                "severity": severity,
                "accuracy": round(acc, 2),
                "total_cases": total
            }

            flags.append(anomaly_record)

            # 🗄️ DEDUP LOGGING (only log once per severity level)
            key = f"{node}:{peer}:{severity}"

            if key not in SEEN_ANOMALIES:
                SEEN_ANOMALIES.add(key)
                insert_anomaly(anomaly_record)

            # 🔥 GOVERNANCE ENFORCEMENT (cooldown controlled)
            now = time.time()
            last = GOVERNANCE_ACTIONS.get(peer, 0)

            if now - last > GOVERNANCE_COOLDOWN:

                if severity == "high":
                    broadcast_penalty(peer, 0.15)

                if severity == "critical":
                    broadcast_penalty(peer, 0.25)

                GOVERNANCE_ACTIONS[peer] = now

        if flags:
            anomalies[node] = flags

    return anomalies


def generate_explanation(event):
    node = event["node"]
    result = event["result"]
    weighted = event.get("weighted", 0)

    verdict = (
        "The cluster reached consensus and terminated the process."
        if result == "terminated"
        else "The cluster rejected remediation due to insufficient trust-weighted votes."
    )

    confidence = "high" if weighted >= 2 else "low"

    return (
        f"Incident detected by {node}. "
        f"{verdict} "
        f"The weighted vote score was {weighted:.2f}, giving {confidence} confidence "
        f"that the behavior was malicious."
    )

MAX_LATENCY = 1.0
MAX_ACTIVE_CASES = 5

def compute_node_health(node, data):
    trust_map = data.get("trust", {})
    rep_engine = data.get("reputation", {}).get("engine", {})
    active_cases = data.get("active_cases", 0)

    # --- avg trust ---
    avg_trust = (
        sum(trust_map.values()) / len(trust_map)
        if trust_map else 1.0
    )

    # --- reputation accuracy ---
    accuracy = rep_engine.get(node, {}).get("accuracy", 1.0)

    # --- latency score ---
    latency = NODE_LATENCY.get(node, MAX_LATENCY)
    latency_score = max(0.0, min(1.0, 1 - (latency / MAX_LATENCY)))

    # --- stability score ---
    stability_score = max(
        0.0,
        min(1.0, 1 - (active_cases / MAX_ACTIVE_CASES))
    )

    health = (
        0.4 * avg_trust +
        0.3 * accuracy +
        0.2 * latency_score +
        0.1 * stability_score
    )

    last_seen = NODE_LAST_SEEN.get(node, 0)
    offline_time = time.time() - last_seen

    is_offline = data.get("online") is False or "error" in data

    if is_offline:
        if offline_time > 5:
            health *= 0.5
        if offline_time > 10:
            health = 0.0


    return round(health, 3)



@app.route("/cluster/status")
def cluster_status():
    return jsonify(CLUSTER_STATUS)


@app.route("/cluster/events")
def cluster_events():
    return jsonify(CLUSTER_EVENTS)


@app.route("/cluster/nodes")
def cluster_nodes():
    return jsonify(list(CLUSTER_STATUS.keys()))


@app.route("/history")
def history():
    return jsonify(load_recent_events(500))


@app.route("/stats")
def stats():
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()

    cur.execute("""
        SELECT node, COUNT(*) 
        FROM events
        GROUP BY node
    """)

    per_node = dict(cur.fetchall())

    cur.execute("""
        SELECT result, COUNT(*)
        FROM events
        GROUP BY result
    """)

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

    row = cur.execute(
        """
        SELECT case_id, node, process, result, weighted, time
        FROM events
        WHERE case_id = ?
        ORDER BY time DESC
        LIMIT 1
        """,
        (case_id,),
    ).fetchone()

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

    snapshot = {}

    for node, data in CLUSTER_STATUS.items():
        snapshot[node] = {
            "trust": data.get("trust"),
            "strikes": data.get("strikes"),
            "active_cases": data.get("active_cases"),
        }

    return jsonify(snapshot)

@app.route("/cluster/quarantine")
def cluster_quarantine():
    snap = {}

    for node, data in CLUSTER_STATUS.items():
        snap[node] = data.get("quarantined", {})

    return jsonify(snap)

@app.route("/cluster/quarantine_timers")
def cluster_quarantine_timers():

    timers = {}
    now = time.time()

    for node, data in CLUSTER_STATUS.items():
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

    snap = {}

    for node, data in CLUSTER_STATUS.items():
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
        if r[3]:
            latency = round(r[3] - r[2], 2)
        else:
            latency = None

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

    for node, data in CLUSTER_STATUS.items():
        if "error" in data:
            health_map[node] = 0.0
            continue

        health_map[node] = compute_node_health(node, data)

    return jsonify(health_map)


def anomaly_severity(a):
    acc = a.get("accuracy", 1.0)
    total = a.get("total_cases", 0)

    if total < 3:
        return None   # not enough data

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


init_db()
CLUSTER_EVENTS[:] = load_recent_events()

threading.Thread(target=poll_nodes, daemon=True).start()
threading.Thread(target=anomaly_watchdog, daemon=True).start()

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=7000)
