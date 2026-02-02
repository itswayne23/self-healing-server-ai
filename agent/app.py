import psutil
import time
import os
import sys
import threading
import requests
import uuid
from flask import Flask, request, jsonify

# -------------------------------
# GLOBAL STATE
# -------------------------------
pending_cases = {}
VOTE_TIMEOUT = 6     # seconds
QUORUM = 2           # 2 of 3 nodes

trust_scores = {}
DEFAULT_TRUST = 1.0
TRUST_REWARD = 0.05
TRUST_PENALTY = 0.1
WEIGHT_THRESHOLD = 2.0



# -------------------------------
# NODE CONFIG
# -------------------------------
NODE_NAME = os.getenv("NODE_NAME", "Unknown-Node")
PEERS = os.getenv("PEERS", "").split(",")
for peer in PEERS:
    if peer:
        trust_scores[peer] = DEFAULT_TRUST

trust_scores[NODE_NAME] = DEFAULT_TRUST


WHITELIST = ["apt", "apt-get", "dpkg", "curl", "pip"]

CHECK_INTERVAL = 2

app = Flask(__name__)

print(f"🛡️ Agent running on {NODE_NAME}")
sys.stdout.flush()

# ==================================================
# RECEIVE FINAL ALERTS (POST-ACTION INFO)
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
        else:
            trust_scores[proposer] -= TRUST_PENALTY

    print(f"📊 [{NODE_NAME}] updated trust: {trust_scores}")
    sys.stdout.flush()

    return jsonify({"status": "ack"}), 200


# ==================================================
# RECEIVE PROPOSAL FROM PEER
# ==================================================
@app.route("/propose", methods=["POST"])
def receive_proposal():
    data = request.json
    case_id = data["case_id"]

    print(f"🗳️ [{NODE_NAME}] proposal received: {data}")
    sys.stdout.flush()

    # Stage-3 simple logic: always YES
    vote = True

    proposer = data["from"]

    try:
        url = f"http://{proposer}:5000/vote"
        requests.post(url, json={
            "case_id": case_id,
            "from": NODE_NAME,
            "vote": vote
        }, timeout=2)
    except Exception as e:
        print(f"⚠️ vote send failed: {e}")
        sys.stdout.flush()

    return jsonify({"status": "vote_sent"}), 200


# ==================================================
# RECEIVE VOTE
# ==================================================
@app.route("/vote", methods=["POST"])
def receive_vote():
    data = request.json
    case_id = data["case_id"]

    print(f"🗳️ [{NODE_NAME}] vote received: {data}")
    sys.stdout.flush()

    if case_id in pending_cases:
        pending_cases[case_id]["votes"][data["from"]] = data["vote"]

    return jsonify({"status": "ack"}), 200


# ==================================================
# PROPOSE INCIDENT TO PEERS
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

        print(f"📨 [{NODE_NAME}] proposing case {case_id} to {peer}")
        sys.stdout.flush()

        try:
            requests.post(
                f"http://{peer}:5000/propose",
                json=payload,
                timeout=2
            )
        except Exception as e:
            print(f"⚠️ proposal failed to {peer}: {e}")
            sys.stdout.flush()

    return case_id


# ==================================================
# BROADCAST FINAL RESULT AFTER ACTION
# ==================================================
def broadcast_final(payload):

    for peer in PEERS:
        if not peer:
            continue

        print(f"📡 [{NODE_NAME}] broadcasting FINAL result to {peer}")
        sys.stdout.flush()

        try:
            requests.post(
                f"http://{peer}:5000/alert",
                json=payload,
                timeout=2
            )
        except Exception as e:
            print(f"⚠️ final broadcast failed: {e}")
            sys.stdout.flush()


# ==================================================
# MONITOR LOOP (STAGE-3 BRAIN)
# ==================================================
def monitor_loop():

    print(f"🛡️ Security agent background thread started on {NODE_NAME}")
    sys.stdout.flush()

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
                    sys.stdout.flush()

                    payload = {
                        "from": NODE_NAME,
                        "process": name,
                        "pid": proc.pid,
                        "cpu": cpu,
                        "time": time.time()
                    }

                    # -----------------------
                    # PROPOSE TO PEERS
                    # -----------------------
                    case_id = propose_to_peers(payload)

                    # -----------------------
                    # WAIT FOR QUORUM
                    # -----------------------
                    killed = False

                    while time.time() - pending_cases[case_id]["start"] < VOTE_TIMEOUT:

                        votes = pending_cases[case_id]["votes"]
                        weighted_sum = 0.0

                        for voter, decision in votes.items():
                            if decision:
                                weighted_sum += trust_scores.get(voter, 1.0)

                        print(
                            f"⚖️ [{NODE_NAME}] weighted votes = {weighted_sum:.2f} "
                            f"(threshold={WEIGHT_THRESHOLD}) from {votes}"
                        )
                        sys.stdout.flush()

                        if weighted_sum >= WEIGHT_THRESHOLD:


                            print(
                                f"⚖️ [{NODE_NAME}] ⚖️ weighted threshold reached for {case_id}. "
                                "Executing remediation."
                            )
                            sys.stdout.flush()

                            try:
                                proc.kill()
                                killed = True
                                print(
                                    f"✅ [{NODE_NAME}] Process terminated "
                                    "after consensus"
                                )
                                sys.stdout.flush()
                            except:
                                pass

                            break

                        time.sleep(0.4)

                    # -----------------------
                    # OUTCOME
                    # -----------------------
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
                            f"❌ [{NODE_NAME}] quorum NOT reached for {case_id}"
                        )
                        sys.stdout.flush()

                        pending_cases.pop(case_id, None)

            except (psutil.NoSuchProcess, psutil.AccessDenied):
                pass

        time.sleep(CHECK_INTERVAL)


# ==================================================
# START THREAD + HTTP SERVER
# ==================================================
threading.Thread(target=monitor_loop, daemon=True).start()

print("🌐 Starting HTTP server...")
sys.stdout.flush()

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000)
