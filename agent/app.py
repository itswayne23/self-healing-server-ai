import psutil
import time
import os
import sys
import threading
import requests
import uuid
from flask import Flask, request, jsonify
import json

# -------------------------------
# GLOBAL STATE
# -------------------------------

pending_cases = {}
VOTE_TIMEOUT = 6

trust_scores = {}
DEFAULT_TRUST = 1.0

WEIGHT_THRESHOLD = 2.0

TRUST_FILE = "/app/trust.json"

TRUST_DECAY = 0.01
TRUST_DECAY_INTERVAL = 10   # seconds

TRUST_REWARD = 0.05
TRUST_PENALTY = 0.15


STRIKES = {}
MAX_STRIKES = 3

CHECK_INTERVAL = 2

WHITELIST = ["apt", "apt-get", "dpkg", "curl", "pip"]

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

            print(f"📂 [{NODE_NAME}] loaded trust state: {trust_scores}")
    except FileNotFoundError:
        print(f"📂 [{NODE_NAME}] no prior trust file, starting fresh")


def save_trust():
    with open(TRUST_FILE, "w") as f:
        json.dump(
            {"trust": trust_scores, "strikes": STRIKES},
            f,
            indent=2
        )


def trust_decay_loop():
    print(f"⏳ [{NODE_NAME}] trust decay thread started")
    sys.stdout.flush()

    while True:
        time.sleep(TRUST_DECAY_INTERVAL)

        changed = False

        for node in list(trust_scores.keys()):
            old = trust_scores[node]

            trust_scores[node] = max(
                0.1,
                trust_scores[node] - TRUST_DECAY
            )

            if trust_scores[node] != old:
                changed = True

        if changed:
            print(
                f"⏳ [{NODE_NAME}] trust decay applied: {trust_scores}"
            )
            sys.stdout.flush()

            save_trust()

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

    if proposer in trust_scores:

        if result == "terminated":
            trust_scores[proposer] += TRUST_REWARD
            STRIKES[proposer] = 0

        else:
            trust_scores[proposer] = max(
                0.1,
                trust_scores[proposer] - TRUST_PENALTY
            )
            STRIKES[proposer] = STRIKES.get(proposer, 0) + 1

        print(
            f"📊 [{NODE_NAME}] updated trust: {trust_scores} "
            f"strikes={STRIKES}"
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

    if case_id in pending_cases:
        pending_cases[case_id]["votes"][data["from"]] = data["vote"]

    return jsonify({"status": "ack"}), 200

# ==================================================
# PROPOSE INCIDENT
# ==================================================

def propose_to_peers(payload):

    case_id = str(uuid.uuid4())

    pending_cases[case_id] = {
        "votes": {NODE_NAME: True},
        "start": time.time(),
        "payload": payload
    }

    payload["case_id"] = case_id

    for peer in PEERS:
        if not peer:
            continue

        print(f"📨 [{NODE_NAME}] proposing {case_id} to {peer}")

        try:
            requests.post(
                f"http://{peer}:5000/propose",
                json=payload,
                timeout=2
            )
        except Exception as e:
            print(f"⚠️ proposal failed to {peer}: {e}")

    return case_id

# ==================================================
# FINAL BROADCAST
# ==================================================

def broadcast_final(payload):

    for peer in PEERS:
        if not peer:
            continue

        print(f"📡 [{NODE_NAME}] broadcasting FINAL to {peer}")

        try:
            requests.post(
                f"http://{peer}:5000/alert",
                json=payload,
                timeout=2
            )
        except Exception as e:
            print(f"⚠️ final broadcast failed: {e}")

# ==================================================
# MONITOR LOOP
# ==================================================

def monitor_loop():

    print(f"🛡️ Security thread started on {NODE_NAME}")

    while True:

        for proc in psutil.process_iter(["pid", "name"]):

            try:
                cpu = proc.cpu_percent(interval=0.3)
                name = proc.info.get("name", "unknown")

                if cpu > 40 and not any(w in name.lower() for w in WHITELIST):

                    print(
                        f"🚨 [{NODE_NAME}] Suspicious {name} "
                        f"PID={proc.pid} CPU={cpu}"
                    )

                    payload = {
                        "from": NODE_NAME,
                        "process": name,
                        "pid": proc.pid,
                        "cpu": cpu,
                        "time": time.time()
                    }

                    case_id = propose_to_peers(payload)

                    killed = False

                    while time.time() - pending_cases[case_id]["start"] < VOTE_TIMEOUT:

                        votes = pending_cases[case_id]["votes"]
                        weighted_sum = 0.0

                        for voter, decision in votes.items():
                            if decision:
                                weighted_sum += trust_scores.get(voter, 1.0)

                        print(
                            f"⚖️ [{NODE_NAME}] weighted={weighted_sum:.2f} "
                            f"threshold={WEIGHT_THRESHOLD} votes={votes}"
                        )

                        if weighted_sum >= WEIGHT_THRESHOLD:

                            print(
                                f"⚖️ [{NODE_NAME}] quorum reached for {case_id}. "
                                "Executing remediation."
                            )

                            try:
                                proc.kill()
                                killed = True
                                print(
                                    f"✅ [{NODE_NAME}] process terminated "
                                    "after consensus"
                                )
                            except:
                                pass

                            break

                        time.sleep(0.4)

                    if killed:

                        final_payload = {
                            "case_id": case_id,
                            "node": NODE_NAME,
                            "result": "terminated",
                            "process": name
                        }

                        broadcast_final(final_payload)

                    else:
                        print(
                            f"❌ [{NODE_NAME}] weighted threshold NOT reached for {case_id}"
                        )
                        sys.stdout.flush()

                        STRIKES[NODE_NAME] = STRIKES.get(NODE_NAME, 0) + 1
                        trust_scores[NODE_NAME] = max(
                            0.1,
                            trust_scores.get(NODE_NAME, 1.0) - TRUST_PENALTY
                        )

                        print(
                            f"📉 [{NODE_NAME}] penalized for false alarm. "
                            f"trust={trust_scores[NODE_NAME]} strikes={STRIKES[NODE_NAME]}"
                        )
                        sys.stdout.flush()

                        save_trust()


                        pending_cases.pop(case_id, None)

            except (psutil.NoSuchProcess, psutil.AccessDenied):
                pass

        time.sleep(CHECK_INTERVAL)

# def decay_loop():

#     while True:
#         time.sleep(60)

#         for n in trust_scores:
#             trust_scores[n] = max(
#                 0.5,
#                 trust_scores[n] - TRUST_DECAY
#             )

#         print(f"⏳ [{NODE_NAME}] trust decay applied: {trust_scores}")
#         sys.stdout.flush()

#         save_trust()


# ==================================================
# START THREAD + SERVER
# ==================================================

threading.Thread(target=monitor_loop, daemon=True).start()
threading.Thread(target=trust_decay_loop, daemon=True).start()
# threading.Thread(target=decay_loop, daemon=True).start()

print("🌐 Starting HTTP server...")
sys.stdout.flush()

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000)
