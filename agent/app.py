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

# -------------------------------
# GLOBAL STATE
# -------------------------------

pending_cases = {}
VOTE_TIMEOUT = 6

trust_scores = {}
DEFAULT_TRUST = 1.0

WEIGHT_THRESHOLD = 2.0
QUARANTINE_THRESHOLD = 0.35

TRUST_FILE = "/data/trust.json"

INACTIVITY_LIMIT = 120     # seconds
DECAY_RATE = 0.03

MAX_TRUST = 2.0
MIN_TRUST = 0.1

TRUST_REWARD = 0.06
TRUST_PENALTY = 0.12


STRIKES = {}
MAX_STRIKES = 3
node_stats = {}
# node_stats[node] = {
#   "votes": 0,
#   "correct": 0,
#   "false": 0,
#   "last_activity": ts
# }

CHECK_INTERVAL = 2

EVENT_LOG = []
MAX_EVENTS = 50


WHITELIST = ["apt", "apt-get", "dpkg", "curl", "pip"]

reputation = ReputationEngine()


# -------------------------------
# PERSISTENCE HELPERS
# -------------------------------

def load_trust():
    global trust_scores, STRIKES

    try:
        with open(TRUST_FILE, "r") as f:
            data = json.load(f)
            trust_scores.update(data.get("trust", {}))
            STRIKES.update(data.get("strikes", {}))
            node_stats.update(data.get("stats", {}))

            print(f"📂 [{NODE_NAME}] loaded trust state: {trust_scores}")
    except FileNotFoundError:
        print(f"📂 [{NODE_NAME}] no prior trust file, starting fresh")


def save_trust():
    try:
        os.makedirs(os.path.dirname(TRUST_FILE), exist_ok=True)

        with open(TRUST_FILE, "w") as f:
            json.dump({
    "trust": trust_scores,
    "strikes": STRIKES,
    "stats": node_stats
}, f, indent=2)


        print(f"💾 [{NODE_NAME}] saved trust to {TRUST_FILE}")
        sys.stdout.flush()

    except Exception as e:
        print(f"🔥 [{NODE_NAME}] failed saving trust: {e}")
        sys.stdout.flush()




# -------------------------------
# NODE CONFIG
# -------------------------------

NODE_NAME = os.getenv("NODE_NAME", "Unknown-Node")

PEERS = os.getenv("PEERS", "").split(",")

for peer in PEERS:
    if peer:
        trust_scores[peer] = DEFAULT_TRUST
        STRIKES[peer] = 0

trust_scores[NODE_NAME] = DEFAULT_TRUST
STRIKES[NODE_NAME] = 0

# Load persisted memory after defaults
load_trust()

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

    proposer = data.get("node")
    result = data.get("result")

    now = time.time()

    if proposer not in node_stats:
        node_stats[proposer] = {
            "votes": 0,
            "correct": 0,
            "false": 0,
            "last_activity": now
        }

    node_stats[proposer]["last_activity"] = now

    # --- Reputation engine hook ---
    if proposer in trust_scores:
        if result == "terminated":
            reputation.record_success(proposer)
        else:
            reputation.record_false(proposer)


    if result == "terminated":

        trust_scores[proposer] = min(
            MAX_TRUST,
            trust_scores.get(proposer, DEFAULT_TRUST) + TRUST_REWARD
        )

        node_stats[proposer]["correct"] += 1
        STRIKES[proposer] = 0

    else:

        trust_scores[proposer] = max(
            MIN_TRUST,
            trust_scores.get(proposer, DEFAULT_TRUST) - TRUST_PENALTY
        )

        node_stats[proposer]["false"] += 1
        STRIKES[proposer] = STRIKES.get(proposer, 0) + 1

    print(
        f"📊 [{NODE_NAME}] updated trust: {trust_scores} "
        f"stats={node_stats} strikes={STRIKES}"
    )
    sys.stdout.flush()

    save_trust()



    print(f"📊 [{NODE_NAME}] trust={trust_scores} strikes={STRIKES}")
    sys.stdout.flush()

    return jsonify({"status": "ack"}), 200

# ==================================================
# RECEIVE PROPOSAL
# ==================================================

@app.route("/propose", methods=["POST"])
def receive_proposal():
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
    data = request.json
    case_id = data["case_id"]

    print(f"🗳️ [{NODE_NAME}] vote received: {data}")

    voter = data["from"]

    if voter not in node_stats:
        node_stats[voter] = {
            "votes": 0,
            "correct": 0,
            "false": 0,
            "last_activity": time.time()
        }

    node_stats[voter]["votes"] += 1
    node_stats[voter]["last_activity"] = time.time()

    if case_id in pending_cases:
        pending_cases[case_id]["votes"][voter] = data["vote"]


    return jsonify({"status": "ack"}), 200

# ==================================================
# PROPOSE INCIDENT
# ==================================================


def propose_to_peers(payload):
    # Create a unique ID for this specific incident
    case_id = str(uuid.uuid4())

    # Initialize the case in our local memory
    pending_cases[case_id] = {
        "votes": {NODE_NAME: True}, # We automatically vote 'Yes'
        "start": time.time(),
        "payload": payload
    }

    payload["case_id"] = case_id

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
        "active_cases": len(pending_cases)
    })

@app.route("/events")
def events():
    return jsonify(EVENT_LOG)

@app.route("/reputation")
def reputation_snapshot():
    return jsonify(reputation.snapshot())



# ==================================================
# MONITOR LOOP
# ==================================================

def monitor_loop():
    print(f"🛡️ Security thread started on {NODE_NAME}")

    while True:
        for proc in psutil.process_iter(["pid", "name"]):
            try:
                # 1. Check for suspicious process
                cpu = proc.cpu_percent(interval=0.3)
                name = proc.info.get("name", "unknown")

                if cpu > 40 and not any(w in name.lower() for w in WHITELIST):
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
                            if t < QUARANTINE_THRESHOLD:
                                print(f"🚫 [{NODE_NAME}] ignoring {voter} vote (quarantined)")
                                continue

                            # Reputation-weighted vote
                            acc = reputation.accuracy(voter)

                            weighted_sum += t * acc


                        print(f"⚖️ [{NODE_NAME}] weighted={weighted_sum:.2f} threshold={WEIGHT_THRESHOLD}")

                        # 4. Check if we have enough weight to act
                        if weighted_sum >= WEIGHT_THRESHOLD:
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
                            "time": time.time()
                        })
                    else:
                        # Penalty for false alarm
                        print(f"❌ [{NODE_NAME}] weighted threshold NOT reached for {case_id}")
                        STRIKES[NODE_NAME] = STRIKES.get(NODE_NAME, 0) + 1
                        trust_scores[NODE_NAME] = max(0.1, trust_scores.get(NODE_NAME, 1.0) - TRUST_PENALTY)
                        reputation.record_false(NODE_NAME)
                        
                        save_trust()

                        EVENT_LOG.append({
                            "case_id": case_id,
                            "process": name,
                            "node": NODE_NAME,
                            "result": "rejected",
                            "weighted": weighted_sum,
                            "time": time.time()
                        })

                    # Cleanup
                    pending_cases.pop(case_id, None)
                    EVENT_LOG[:] = EVENT_LOG[-MAX_EVENTS:]

            except (psutil.NoSuchProcess, psutil.AccessDenied):
                pass

        time.sleep(CHECK_INTERVAL)
def trust_decay_loop():

    print(f"🧬 [{NODE_NAME}] adaptive trust engine started")

    while True:

        time.sleep(20)

        now = time.time()

        scores = list(trust_scores.values())
        if not scores:
            continue

        median = sorted(scores)[len(scores)//2]

        changed = False

        for node, score in trust_scores.items():

            last = node_stats.get(node, {}).get("last_activity", now)

            idle = now - last

            # only decay long-idle low performers
            if idle < INACTIVITY_LIMIT:
                continue

            if score > median:
                continue

            new = max(
                MIN_TRUST,
                score - DECAY_RATE
            )

            if new != score:
                trust_scores[node] = new
                changed = True

        if changed:
            save_trust()

def inactivity_decay_loop():

    while True:
        time.sleep(15)

        now = time.time()

        for node, stats in node_stats.items():

            idle = now - stats.get("last_activity", now)

            if idle > INACTIVITY_LIMIT:

                old = trust_scores.get(node, DEFAULT_TRUST)

                trust_scores[node] = max(
                    MIN_TRUST,
                    old - DECAY_RATE
                )

                print(
                    f"📉 [{NODE_NAME}] inactivity decay on {node}: "
                    f"{old:.2f} -> {trust_scores[node]:.2f}"
                )

                save_trust()




# ==================================================
# START THREAD + SERVER
# ==================================================

threading.Thread(target=monitor_loop, daemon=True).start()
threading.Thread(target=trust_decay_loop,daemon=True).start()
threading.Thread(target=inactivity_decay_loop,daemon=True).start()


print("🌐 Starting HTTP server...")
sys.stdout.flush()

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000)
