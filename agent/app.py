import psutil
import time
import os
import sys
import threading
import requests
import uuid
from flask import Flask, request, jsonify
import json
from reputation import ReputationEngine
import random

# -------------------------------
# GLOBAL STATE
# -------------------------------
# global trust_scores, STRIKES, node_stats, QUARANTINED

pending_cases = {}
VOTE_TIMEOUT = 6

trust_scores = {}
DEFAULT_TRUST = 1.0

WEIGHT_THRESHOLD = 2.0
QUARANTINE_THRESHOLD = 0.35

QUARANTINE_TIME = 180 # seconds

QUARANTINED = {}

TRUST_FILE = "/data/trust.json"

INACTIVITY_LIMIT = 120     # seconds
DECAY_RATE = 0.03

MAX_TRUST = 2.0
MIN_TRUST = 0.1

EMA_ALPHA = 0.4
MAX_TRUST_DELTA = 0.08
TRUST_COOLDOWN = 10  # seconds

LAST_TRUST_UPDATE = {}


TRUST_REWARD = 0.06
TRUST_PENALTY = 0.12


STRIKES = {}
MAX_STRIKES = 3
node_stats = {}
# node_stats[node] = {
#   "votes": 0,
#   "last_activity": ts
# }

CHECK_INTERVAL = 2

EVENT_LOG = []
MAX_EVENTS = 50


WHITELIST = ["apt", "apt-get", "dpkg", "curl", "pip"]

reputation = ReputationEngine()

RESTORE_IN_PROGRESS = False

RECOVERY_MODE = False
RECOVERY_COOLDOWN = 30
LAST_RECOVERY = 0

LAB_FREEZE_TRUST = False

BOOT_TIME = time.time()
BOOTSTRAP_GRACE = 25  # seconds

WAL_FILE = "/data/wal.log"

STATE_VERSION = 0
LAST_SYNC = 0
SYNC_INTERVAL = 5

# -------------------------------
# PERSISTENCE HELPERS
# -------------------------------

def load_trust():
    global trust_scores, STRIKES, node_stats

    try:
        with open(TRUST_FILE, "r") as f:
            data = json.load(f)

            trust_scores.update(data.get("trust", {}))
            STRIKES.update(data.get("strikes", {}))
            for node, stats in data.get("stats", {}).items():
                node_stats[node] = {
                    "votes": stats.get("votes", 0),
                    "last_activity": stats.get("last_activity", time.time())
                }

            # Load quarantine state safely
            loaded_q = data.get("quarantine", {})

            # Type guard in case file is corrupted
            if not isinstance(loaded_q, dict):
                print(f"⚠️ [{NODE_NAME}] invalid quarantine format in file, resetting")
                loaded_q = {}

            QUARANTINED.update(loaded_q)

            rep_snap = data.get("reputation", {})
            if rep_snap:
                reputation.load_from_snapshot(rep_snap)
            LAST_TRUST_UPDATE.update(data.get("last_trust_update", {}))

            global STATE_VERSION
            STATE_VERSION = data.get("state_version", 0)

            print(f"📂 [{NODE_NAME}] loaded trust state")
            print(" trust:", trust_scores)
            print(" stats:", node_stats)

    except FileNotFoundError:
        print(f"📂 [{NODE_NAME}] no prior trust file, starting fresh")

def wal_replay():
    global RECOVERY_MODE
    RECOVERY_MODE = True

    if not os.path.exists(WAL_FILE):
        RECOVERY_MODE = False
        return

    print(f"📜 [{NODE_NAME}] replaying WAL")

    try:
        with open(WAL_FILE, "r") as f:
            for line in f:
                if not line.strip():
                    continue

                entry = json.loads(line)
                etype = entry.get("type")

                if etype == "trust_update":
                    trust_scores[entry["node"]] = entry["value"]

                elif etype == "strike_update":
                    STRIKES[entry["node"]] = entry["value"]

                elif etype == "event":
                    EVENT_LOG.append(entry["data"])

                elif etype == "pending_case":
                    cid = entry["case_id"]
                    pending_cases[cid] = entry["data"]

                    # ensure self vote exists after crash recovery
                    pending_cases[cid].setdefault("votes", {})
                    pending_cases[cid]["votes"].setdefault(NODE_NAME, True)
                    pending_cases[cid].setdefault("start", time.time())

        # ✅ WAL replay safety cap
        EVENT_LOG[:] = EVENT_LOG[-MAX_EVENTS:]

        now = time.time()
        for cid in list(pending_cases.keys()):
            start = pending_cases[cid].get("start", now)
            if now - start > VOTE_TIMEOUT:
                pending_cases.pop(cid, None)

    except Exception as e:
        print(f"🔥 [{NODE_NAME}] WAL replay failed: {e}")
    save_trust()
    RECOVERY_MODE = False



def save_trust():
    global RESTORE_IN_PROGRESS

    if RESTORE_IN_PROGRESS:
        return
    try:
        os.makedirs(os.path.dirname(TRUST_FILE), exist_ok=True)
        global STATE_VERSION
        STATE_VERSION += 1

        with open(TRUST_FILE, "w") as f:
            json.dump({
                "trust": trust_scores,
                "strikes": STRIKES,
                "stats": node_stats,
                "quarantine": QUARANTINED,
                "reputation": reputation.snapshot(),
                "last_trust_update": LAST_TRUST_UPDATE,
                "state_version": STATE_VERSION
            }, f, indent=2)


        print(f"💾 [{NODE_NAME}] saved trust to {TRUST_FILE}")
        sys.stdout.flush()

    except Exception as e:
        print(f"🔥 [{NODE_NAME}] failed saving trust: {e}")
        sys.stdout.flush()

def apply_trust_update(node, raw_delta):
    if LAB_FREEZE_TRUST:
        print(f"🧊 [{NODE_NAME}] trust frozen, skipping update for {node}")
        return

    now = time.time()

    # Cooldown check
    last = LAST_TRUST_UPDATE.get(node, 0)
    if now - last < TRUST_COOLDOWN:
        print(f"⏳ [{NODE_NAME}] trust update for {node} skipped (cooldown)")
        evaluate_quarantine(node)
        return

    old_trust = trust_scores.get(node, DEFAULT_TRUST)

    # Clamp delta
    delta = max(-MAX_TRUST_DELTA, min(MAX_TRUST_DELTA, raw_delta))

    # EMA target
    target = max(MIN_TRUST, min(MAX_TRUST, old_trust + delta))

    new_trust = (EMA_ALPHA * target) + ((1 - EMA_ALPHA) * old_trust)

    trust_scores[node] = new_trust
    LAST_TRUST_UPDATE[node] = now
    wal_append({
        "type": "trust_update",
        "node": node,
        "value": new_trust,
        "time": now
    })


    print(
        f"🧮 [{NODE_NAME}] trust update {node}: "
        f"{old_trust:.2f} -> {new_trust:.2f} (raw Δ={raw_delta:.3f}, clamped Δ={delta:.3f})"
    )

    save_trust()



# -------------------------------
# NODE CONFIG
# -------------------------------

NODE_NAME = os.getenv("NODE_NAME", "Unknown-Node")

PEERS = os.getenv("PEERS", "").split(",")

for peer in PEERS:
    if peer:
        trust_scores.setdefault(peer, DEFAULT_TRUST)
        STRIKES.setdefault(peer, 0)

trust_scores.setdefault(NODE_NAME, DEFAULT_TRUST)
STRIKES.setdefault(NODE_NAME, 0)


ATTACK_MODE = os.getenv("ATTACK_MODE", "false").lower() == "true"
if ATTACK_MODE:
    print(f"☠️ [{NODE_NAME}] RUNNING IN ATTACK MODE")

ATTACK_PROFILE = {
    "vote_flip_prob": 0.6,
    "false_alert_prob": 0.4,
    "spam_propose_prob": 0.25,
    "skip_vote_prob": 0.2,
    "delay_vote_prob": 0.3,
    "delay_seconds": 5,
}

ATTACK_PROFILE.update({
    "false_propose_prob": 0.35,
})


# Load persisted memory after defaults
load_trust()
wal_replay()

for node in trust_scores:
    if node not in QUARANTINED:
        QUARANTINED[node] = {
            "active": False,
            "until": 0
        }


# -------------------------------
# FLASK APP
# -------------------------------

app = Flask(__name__)

print(f"🛡️ Agent running on {NODE_NAME}")
sys.stdout.flush()

# ==================================================
# RECEIVE FINAL ALERTS (POST-REMEDIATION)
# ==================================================

@app.route("/alert", methods=["POST"])
def receive_alert():
    data = request.json

    print(f"📩 [{NODE_NAME}] Final alert: {data}")

    # ==================================================
    # 😈 FINAL ALERT FALSIFICATION ATTACK
    # ==================================================

    if ATTACK_MODE and random.random() < ATTACK_PROFILE["false_propose_prob"]:
        print(f"😈 [{NODE_NAME}] falsifying alert payload")

        if data["result"] == "terminated":
            data["result"] = "allowed"
        else:
            data["result"] = "terminated"

        print(f"😈 [{NODE_NAME}] forged alert => {data}")


    proposer = data.get("node")
    result = data.get("result")

    if not proposer:
        return jsonify({"status": "invalid_alert"}), 400

    now = time.time()
    # --- Ensure proposer exists in trust system ---
    trust_scores.setdefault(proposer, DEFAULT_TRUST)
    STRIKES.setdefault(proposer, 0)
    QUARANTINED.setdefault(proposer, {"active": False, "until": 0})


    node_stats.setdefault(proposer, {
        "votes": 0,
        "last_activity": now
    })

    node_stats[proposer]["last_activity"] = now


    # --- Reputation engine only ---
    if result == "terminated":
        reputation.record_success(proposer)
        apply_trust_update(proposer, +TRUST_REWARD)
        STRIKES[proposer] = 0
    else:
        reputation.record_false(proposer)
        apply_trust_update(proposer, -TRUST_PENALTY)
        if not LAB_FREEZE_TRUST:
            STRIKES[proposer] = STRIKES.get(proposer, 0) + 1

    wal_append({
        "type": "strike_update",
        "node": proposer,
        "value": STRIKES[proposer],
        "time": time.time()
    })



    print(
        f"📊 [{NODE_NAME}] updated trust: {trust_scores} "
        f"stats={node_stats} strikes={STRIKES}"
    )
    sys.stdout.flush()

    evaluate_quarantine(proposer)

    print(f"📊 [{NODE_NAME}] trust={trust_scores} strikes={STRIKES}")
    sys.stdout.flush()

    return jsonify({"status": "ack"}), 200

# ==================================================
# RECEIVE PROPOSAL
# ==================================================

@app.route("/propose", methods=["POST"])
def receive_proposal():
    if RECOVERY_MODE:
        print(f"🧬 [{NODE_NAME}] ignoring proposal (recovery mode)")
        return jsonify({"status": "recovery_mode"}), 200

    if QUARANTINED.get(NODE_NAME, {}).get("active"):
        print(f"🚫 [{NODE_NAME}] ignoring proposal (self quarantined)")
        return jsonify({"status": "quarantined"}), 200

    data = request.json
    case_id = data["case_id"]

    print(f"🗳️ [{NODE_NAME}] proposal received: {data}")
    sys.stdout.flush()

    vote = True

    proposer = data["from"]

    try:
        url = f"http://{proposer}:5000/vote"
        requests.post(
            url,
            json={
                "case_id": case_id,
                "from": NODE_NAME,
                "vote": vote
            },
            timeout=2
        )
    except Exception as e:
        print(f"⚠️ vote send failed: {e}")

    return jsonify({"status": "vote_sent"}), 200

# ==================================================
# RECEIVE VOTE
# ==================================================

@app.route("/vote", methods=["POST"])
def receive_vote():
    if RECOVERY_MODE:
        print(f"🧬 [{NODE_NAME}] ignoring vote (recovery mode)")
        return jsonify({"status": "recovery_mode"}), 200
    if QUARANTINED.get(NODE_NAME, {}).get("active"):
        print(f"🚫 [{NODE_NAME}] ignoring vote (self quarantined)")
        return jsonify({"status": "quarantined"}), 200

    data = request.json
    case_id = data["case_id"]

    voter = data["from"]
    # ==================================================
    # 😈 ADVERSARIAL BEHAVIOR: DELAY VOTING
    # ==================================================

    if ATTACK_MODE and random.random() < ATTACK_PROFILE["delay_vote_prob"]:
        delay = ATTACK_PROFILE["delay_seconds"]
        print(f"⏳☠️ [{NODE_NAME}] delaying vote on {case_id} by {delay}s")
        time.sleep(delay)

    vote = data["vote"]

    print(f"🗳️ [{NODE_NAME}] vote received from {voter}: {vote}")

    # -------------------------------
    # Node stats bookkeeping
    # -------------------------------

    if voter not in node_stats:
        node_stats[voter] = {
            "votes": 0,
            "last_activity": time.time()
        }

    node_stats[voter]["votes"] += 1
    node_stats[voter]["last_activity"] = time.time()

    # ==================================================
    # 😈 STAGE 9: ADVERSARIAL BEHAVIOR INJECTION
    # ==================================================

    if ATTACK_MODE:

        r = random.random()

        # Skip vote entirely
        if r < ATTACK_PROFILE["skip_vote_prob"]:
            print(f"😈 [{NODE_NAME}] skipping vote for {case_id}")
            return jsonify({"status": "ignored"}), 200

        # Flip vote
        if r < ATTACK_PROFILE["vote_flip_prob"]:
            vote = not vote
            print(f"😈 [{NODE_NAME}] flipped vote for {case_id}")

    # ==================================================
    # Store final vote
    # ==================================================

    if case_id in pending_cases:
        pending_cases[case_id]["votes"][voter] = vote

    return jsonify({"status": "ack"}), 200

# ==================================================
# PROPOSE INCIDENT
# ==================================================


def propose_to_peers(payload):

    if QUARANTINED.get(NODE_NAME, {}).get("active"):
        print(f"🚫 [{NODE_NAME}] cannot propose while quarantined")
        return None

    # Create a unique ID for this specific incident
    case_id = str(uuid.uuid4())

    # Initialize the case in our local memory
    pending_cases[case_id] = {
        "votes": {NODE_NAME: True}, # We automatically vote 'Yes'
        "start": time.time(),
        "payload": payload
    }
    wal_append({
        "type": "pending_case",
        "case_id": case_id,
        "data": pending_cases[case_id],
        "time": time.time()
    })



    payload["case_id"] = case_id
    payload["start_time"] = pending_cases[case_id]["start"]

    # Tell every peer about this incident
    for peer in PEERS:
        if not peer: continue
        try:
            requests.post(f"http://{peer}:5000/propose", json=payload, timeout=2)
        except Exception as e:
            print(f"⚠️ proposal failed to {peer}: {e}")

    return case_id

def broadcast_final(payload):
    # Tell every peer the final result (e.g., "terminated")
    for peer in PEERS:
        if not peer: continue
        try:
            requests.post(f"http://{peer}:5000/alert", json=payload, timeout=2)
        except Exception as e:
            print(f"⚠️ final broadcast failed: {e}")

@app.route("/status")
def status():
    return jsonify({
        "node": NODE_NAME,
        "trust": trust_scores,
        "strikes": STRIKES,
        "active_cases": len(pending_cases),
        "quarantined": QUARANTINED,
        "adaptive_quorum": get_adaptive_threshold(),
    })

@app.route("/events")
def events():
    return jsonify(EVENT_LOG)

@app.route("/reputation")
def reputation_snapshot():
    return jsonify({
        "node_stats": node_stats,
        "engine": reputation.snapshot()
    })

@app.route("/governance/penalize", methods=["POST"])
def governance_penalize():
    data = request.json
    node = data["node"]
    penalty = data.get("penalty", 0.1)

    if node == NODE_NAME:
        return jsonify({"status": "ignored_self"})

    if QUARANTINED.get(node, {}).get("active"):
        return jsonify({"status": "ignored_quarantined"})

    trust_scores.setdefault(node, DEFAULT_TRUST)
    STRIKES.setdefault(node, 0)
    QUARANTINED.setdefault(node, {"active": False, "until": 0})
    apply_trust_update(node, -penalty)
    evaluate_quarantine(node)
    save_trust()

    return jsonify({"status": "applied"})

@app.route("/governance/quarantine", methods=["POST"])
def governance_quarantine():
    data = request.json
    node = data["node"]
    duration = data.get("duration", 180)

    if node == NODE_NAME:
        QUARANTINED[NODE_NAME] = {
            "active": True,
            "until": time.time() + duration
        }
        save_trust()
        print(f"🚨 [{NODE_NAME}] force quarantined by controller")
        return jsonify({"status": "self_quarantined"})

    QUARANTINED.setdefault(node, {"active": False, "until": 0})
    QUARANTINED[node] = {
        "active": True,
        "until": time.time() + duration
    }

    save_trust()
    print(f"🚨 [{NODE_NAME}] peer {node} quarantined by policy")
    return jsonify({"status": "peer_quarantined"})

@app.route("/state/snapshot")
def state_snapshot():
    return jsonify({
        "node": NODE_NAME,
        "trust": trust_scores,
        "strikes": STRIKES,
        "quarantined": QUARANTINED,
        "reputation": reputation.snapshot(),
        "node_stats": node_stats,
        "events": EVENT_LOG[-20:],   # last 20 events only
        "timestamp": time.time()
    })

@app.route("/state/digest")
def state_digest():
    return jsonify({
        "node": NODE_NAME,
        "version": STATE_VERSION,
        "timestamp": time.time(),
        "trust_hash": hash(json.dumps(trust_scores, sort_keys=True)),
    })


@app.route("/state/restore", methods=["POST"])
def state_restore():
    global RESTORE_IN_PROGRESS, reputation, RECOVERY_MODE

    data = request.json

    if not data:
        return jsonify({"status": "no_data"}), 400

    print(f"🧬 [{NODE_NAME}] restoring state from controller")

    RESTORE_IN_PROGRESS = True
    print("engine before restore:", reputation.snapshot())

    try:
        trust_scores.clear()
        trust_scores.update(data.get("trust", {}))

        STRIKES.clear()
        STRIKES.update(data.get("strikes", {}))

        QUARANTINED.clear()
        QUARANTINED.update(data.get("quarantined", {}))

        node_stats.clear()
        node_stats.update(data.get("node_stats", {}))

        rep = data.get("reputation", {})
        reputation.records = {}
        if rep:
            reputation.load_from_snapshot(rep)

        # restore events safely
        EVENT_LOG.clear()
        EVENT_LOG.extend(data.get("events", []))

        save_trust()

    finally:
        RESTORE_IN_PROGRESS = False
        RECOVERY_MODE = False
        print(f"🩺 [{NODE_NAME}] recovery complete, rejoining cluster")

    return jsonify({"status": "restored"}), 200


# ==================================================
# MONITOR LOOP
# ==================================================
def get_adaptive_threshold():
    if LAB_FREEZE_TRUST:
        return WEIGHT_THRESHOLD

    active_nodes = []
    trust_sum = 0.0

    for node, t in trust_scores.items():
        if QUARANTINED.get(node, {}).get("active"):
            continue
        active_nodes.append(node)
        trust_sum += t

    if not active_nodes:
        return WEIGHT_THRESHOLD  # fallback

    avg_trust = trust_sum / len(active_nodes)

    adaptive = WEIGHT_THRESHOLD * (1 + (1 - avg_trust))

    # Clamp
    adaptive = max(1.5, adaptive)
    adaptive = min(adaptive, len(active_nodes))

    print(
        f"🎯 [{NODE_NAME}] adaptive quorum={adaptive:.2f} "
        f"(avg_trust={avg_trust:.2f}, active_nodes={len(active_nodes)})"
    )

    return adaptive

def monitor_loop():
    print(f"🛡️ Security thread started on {NODE_NAME}")

    while True:
        for proc in psutil.process_iter(["pid", "name"]):
            try:
                # 1. Check for suspicious process
                cpu = proc.cpu_percent(interval=0.3)
                name = proc.info.get("name", "unknown")
                suspicious = cpu > 40 and not any(w in name.lower() for w in WHITELIST)

                # 😈 Attacker may fabricate incidents
                if ATTACK_MODE and random.random() < ATTACK_PROFILE["false_alert_prob"]:
                    suspicious = True
                    print(f"☠️ [{NODE_NAME}] fabricated suspicious activity")
                # if ATTACK_MODE and random.random() < ATTACK_PROFILE["spam_propose_prob"]:
                #     print(f"💣 [{NODE_NAME}] spamming proposals")
                #     for _ in range(3):
                #         suspicious = True


                if suspicious:
                    print(f"🚨 [{NODE_NAME}] Suspicious {name} PID={proc.pid} CPU={cpu}")

                    payload = {
                        "from": NODE_NAME,
                        "process": name,
                        "pid": proc.pid,
                        "cpu": cpu,
                        "time": time.time()
                    }

                    # 2. Start the proposal
                    case_id = propose_to_peers(payload)
                    if not case_id:
                        continue
                    killed = False

                    # 3. Voting Window
                    while time.time() - pending_cases[case_id]["start"] < VOTE_TIMEOUT:
                        votes = pending_cases[case_id]["votes"]
                        weighted_sum = 0.0

                        for voter, decision in votes.items():
                            if not decision:
                                continue

                            # --- Stage 8: reputation + quarantine aware weighting ---

                            t = trust_scores.get(voter, DEFAULT_TRUST)

                            # Ignore quarantined nodes
                            if QUARANTINED.get(voter, {}).get("active"):
                                print(f"🚫 [{NODE_NAME}] ignoring {voter} vote (quarantined)")
                                continue

                            # Reputation-weighted vote
                            acc = reputation.accuracy(voter)

                            weighted_sum += t * acc


                        threshold = get_adaptive_threshold()

                        print(
                            f"⚖️ [{NODE_NAME}] weighted={weighted_sum:.2f} "
                            f"threshold={threshold:.2f}"
                        )


                        # 4. Check if we have enough weight to act
                        if weighted_sum >= threshold:
                            print(f"⚖️ [{NODE_NAME}] quorum reached. Executing remediation.")
                            try:
                                proc.kill()
                                killed = True
                                print(f"✅ [{NODE_NAME}] process terminated.")
                            except (psutil.NoSuchProcess, psutil.AccessDenied):
                                killed = True # Consider it a success if it's already gone
                            break

                        time.sleep(0.4)

                    # 5. Finalize the case
                    if killed:
                        final_payload = {
                            "case_id": case_id,
                            "node": NODE_NAME,
                            "result": "terminated",
                            "process": name
                        }
                        broadcast_final(final_payload)

                        EVENT_LOG.append({
                            "case_id": case_id,
                            "process": name,
                            "node": NODE_NAME,
                            "result": "terminated",
                            "weighted": weighted_sum,
                            "time": time.time(),
                            "start_time": pending_cases[case_id]["start"]
                        })
                        wal_append({
                            "type": "event",
                            "data": EVENT_LOG[-1],
                            "time": time.time()
                        })


                    else:
                        # Penalty for false alarm
                        print(f"❌ [{NODE_NAME}] weighted threshold NOT reached for {case_id}")
                        if not LAB_FREEZE_TRUST:
                            STRIKES[NODE_NAME] = STRIKES.get(NODE_NAME, 0) + 1
                        wal_append({
                            "type": "strike_update",
                            "node": NODE_NAME,
                            "value": STRIKES[NODE_NAME],
                            "time": time.time()
                        })


                        apply_trust_update(NODE_NAME, -TRUST_PENALTY)
                        evaluate_quarantine(NODE_NAME)
                        reputation.record_false(NODE_NAME)

                        node_stats.setdefault(NODE_NAME, {
                            "votes": 0,
                            "last_activity": time.time()
                        })

                        # node_stats[NODE_NAME]["false"] += 1
                        node_stats[NODE_NAME]["last_activity"] = time.time()

                        EVENT_LOG.append({
                            "case_id": case_id,
                            "process": name,
                            "node": NODE_NAME,
                            "result": "rejected",
                            "weighted": weighted_sum,
                            "time": time.time(),
                            "start_time": pending_cases[case_id]["start"]
                        })
                        wal_append({
                            "type": "event",
                            "data": EVENT_LOG[-1],
                            "time": time.time()
                        })


                    # Cleanup
                    pending_cases.pop(case_id, None)
                    EVENT_LOG[:] = EVENT_LOG[-MAX_EVENTS:]
                    wal_compact()

            except (psutil.NoSuchProcess, psutil.AccessDenied):
                pass

        time.sleep(CHECK_INTERVAL)

def trust_decay_loop():

    print(f"🧬 [{NODE_NAME}] adaptive trust engine started")

    while True:
        if LAB_FREEZE_TRUST:
            time.sleep(5)
            continue

        time.sleep(20)

        now = time.time()

        scores = list(trust_scores.values())
        if not scores:
            continue

        median = sorted(scores)[len(scores)//2]

        for node, score in trust_scores.items():

            if QUARANTINED.get(node, {}).get("active"):
                continue

            last = node_stats.get(node, {}).get("last_activity", now)

            idle = now - last

            # only decay long-idle low performers
            if idle < INACTIVITY_LIMIT:
                continue

            if score > median:
                continue
            print(f"🧬 [{NODE_NAME}] decay candidate {node} idle={idle:.1f}s score={score:.2f}")
            last_update = LAST_TRUST_UPDATE.get(node, 0)
            if now - last_update >= TRUST_COOLDOWN:
                apply_trust_update(node, -DECAY_RATE)

            evaluate_quarantine(node)

def quarantine_watchdog():

    while True:
        if LAB_FREEZE_TRUST:
            time.sleep(5)
            continue

        now = time.time()

        for node, q in QUARANTINED.items():
            if q["active"] and now > q["until"]:
                q["active"] = False
                STRIKES[node] = 0
                print(f"🩺 [{NODE_NAME}] reintegrated {node}")
                save_trust()

        time.sleep(5)

def evaluate_quarantine(node):
    if LAB_FREEZE_TRUST:
        return

    q = QUARANTINED.setdefault(node, {"active": False, "until": 0})

    if q["active"]:
        return

    if STRIKES.get(node, 0) >= MAX_STRIKES or \
       trust_scores.get(node, DEFAULT_TRUST) < QUARANTINE_THRESHOLD:

        q = QUARANTINED.get(node, {"active": False})

        if not q["active"]:
            QUARANTINED[node] = {
                "active": True,
                "until": time.time() + QUARANTINE_TIME
            }

            print(f"🚨 [{NODE_NAME}] quarantined {node}")
            save_trust()
            sys.stdout.flush()


def attacker_spam_loop():
    while True:
        if ATTACK_MODE and random.random() < ATTACK_PROFILE["spam_propose_prob"]:

            fake = {
                "from": NODE_NAME,
                "process": "benign-daemon",
                "pid": random.randint(1000, 9999),
                "cpu": random.uniform(1, 10),
                "time": time.time()
            }

            print(f"😈 [{NODE_NAME}] spamming fake proposal")

            propose_to_peers(fake)

        time.sleep(5)

def fetch_peer_snapshots():
    snapshots = []

    for peer in PEERS:
        if not peer or peer == NODE_NAME:
            continue

        try:
            r = requests.get(f"http://{peer}:5000/state/snapshot", timeout=2)
            snap = r.json()

            if snap.get("trust"):
                snapshots.append(snap)

        except Exception as e:
            print(f"⚠️ [{NODE_NAME}] snapshot fetch failed from {peer}: {e}")

    return snapshots

def self_recovery_loop():
    global RECOVERY_MODE, LAST_RECOVERY

    while True:
        time.sleep(10)

        now = time.time()

        # Cooldown
        if now - LAST_RECOVERY < RECOVERY_COOLDOWN:
            continue

        trust_empty = not trust_scores or all(v == DEFAULT_TRUST for v in trust_scores.values())
        rep_empty = not reputation.snapshot()

        bootstrap_phase = (time.time() - BOOT_TIME) < BOOTSTRAP_GRACE

        if not bootstrap_phase and (trust_empty or rep_empty):

            print(f"🆘 [{NODE_NAME}] state corruption detected, requesting recovery")

            RECOVERY_MODE = True
            LAST_RECOVERY = now

            try:
                restored = quorum_restore()

                if not restored:
                    try:
                        requests.post(
                            "http://controller:7000/cluster/recover",
                            json={"node": NODE_NAME},
                            timeout=3
                        )
                    except Exception as e:
                        print(f"⚠️ recovery request failed: {e}")

            except Exception as e:
                print(f"⚠️ recovery request failed: {e}")

def wal_append(entry):
    try:
        os.makedirs(os.path.dirname(WAL_FILE), exist_ok=True)

        with open(WAL_FILE, "a") as f:
            f.write(json.dumps(entry) + "\n")

    except Exception as e:
        print(f"🔥 [{NODE_NAME}] WAL write failed: {e}")

def replica_sync_loop():
    global LAST_SYNC

    while True:
        time.sleep(SYNC_INTERVAL)

        if RECOVERY_MODE:
            continue

        for peer in PEERS:
            if not peer or peer == NODE_NAME:
                continue

            try:
                r = requests.get(f"http://{peer}:5000/state/digest", timeout=2)
                digest = r.json()

                peer_version = digest.get("version", 0)

                if peer_version > STATE_VERSION:
                    print(f"🔄 [{NODE_NAME}] pulling newer state from {peer}")

                    snap = requests.get(
                        f"http://{peer}:5000/state/snapshot",
                        timeout=3
                    ).json()

                    merge_state(snap)

            except Exception as e:
                print(f"⚠️ [{NODE_NAME}] replica sync failed from {peer}: {e}")

def wal_compact():
    if len(EVENT_LOG) < 20:
        return

    try:
        with open(WAL_FILE, "w") as f:
            for e in EVENT_LOG[-50:]:
                f.write(json.dumps({
                    "type": "event",
                    "data": e
                }) + "\n")

        print(f"🧹 [{NODE_NAME}] WAL compacted")

    except Exception as e:
        print(f"🔥 WAL compact failed: {e}")

def select_quorum_snapshot(snaps):
    if not snaps:
        return None

    # Sort by timestamp (newest first)
    snaps = sorted(snaps, key=lambda x: x.get("timestamp", 0), reverse=True)

    # Count similar snapshots by trust hash
    counts = {}

    for s in snaps:
        key = json.dumps(s.get("trust", {}), sort_keys=True)
        counts.setdefault(key, []).append(s)

    # Find majority
    required = max(1, (len(PEERS) // 2))

    for group in counts.values():
        if len(group) >= required:
            print(f"🧬 [{NODE_NAME}] quorum snapshot selected")
            return group[0]

    # fallback: newest
    print(f"🧬 [{NODE_NAME}] no quorum match, using newest snapshot")
    return snaps[0]

def quorum_restore():
    global RESTORE_IN_PROGRESS, RECOVERY_MODE

    print(f"🧬 [{NODE_NAME}] attempting peer quorum restore")

    snaps = fetch_peer_snapshots()
    snap = select_quorum_snapshot(snaps)

    if not snap:
        print(f"⚠️ [{NODE_NAME}] no peer snapshots available")
        return False

    RESTORE_IN_PROGRESS = True

    try:
        trust_scores.clear()
        trust_scores.update(snap.get("trust", {}))

        STRIKES.clear()
        STRIKES.update(snap.get("strikes", {}))

        QUARANTINED.clear()
        QUARANTINED.update(snap.get("quarantined", {}))

        # never keep self quarantined after recovery
        QUARANTINED.setdefault(NODE_NAME, {"active": False, "until": 0})
        QUARANTINED[NODE_NAME]["active"] = False
        QUARANTINED[NODE_NAME]["until"] = 0

        node_stats.clear()
        node_stats.update(snap.get("node_stats", {}))

        reputation.records = {}
        reputation.load_from_snapshot(snap.get("reputation", {}))

        EVENT_LOG.clear()
        EVENT_LOG.extend(snap.get("events", []))

        LAST_TRUST_UPDATE.clear()
        LAST_TRUST_UPDATE.update(snap.get("last_trust_update", {}))
        
        save_trust()

        print(f"🩺 [{NODE_NAME}] quorum restore successful")
        return True

    finally:
        RESTORE_IN_PROGRESS = False
        RECOVERY_MODE = False

def merge_state(remote):
    global RESTORE_IN_PROGRESS

    RESTORE_IN_PROGRESS = True

    try:
        for node, t in remote.get("trust", {}).items():
            trust_scores[node] = max(trust_scores.get(node, MIN_TRUST), t)

        for node, s in remote.get("strikes", {}).items():
            STRIKES[node] = max(STRIKES.get(node, 0), s)

        for node, q in remote.get("quarantined", {}).items():
            QUARANTINED[node] = q

        for node, stats in remote.get("node_stats", {}).items():
            node_stats.setdefault(node, stats)

        reputation.load_from_snapshot(remote.get("reputation", {}))

        EVENT_LOG.extend(remote.get("events", []))
        EVENT_LOG[:] = EVENT_LOG[-MAX_EVENTS:]

        save_trust()

        print(f"🔄 [{NODE_NAME}] state merged from peer")

    finally:
        RESTORE_IN_PROGRESS = False


# ==================================================
# START THREAD + SERVER
# ==================================================

threading.Thread(target=monitor_loop, daemon=True).start()
threading.Thread(target=trust_decay_loop,daemon=True).start()
threading.Thread(target=quarantine_watchdog, daemon=True).start()
threading.Thread(target=attacker_spam_loop, daemon=True).start()
threading.Thread(target=self_recovery_loop, daemon=True).start()
threading.Thread(target=replica_sync_loop, daemon=True).start()


print("🌐 Starting HTTP server...")
sys.stdout.flush()

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000)
