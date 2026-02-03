from flask import Flask, jsonify
import requests
import time
import threading

NODES = ["node1", "node2", "node3"]
SEEN_CASES = set()


app = Flask(__name__)

CLUSTER_STATUS = {}
CLUSTER_EVENTS = []

POLL_INTERVAL = 3
MAX_EVENTS = 200


def poll_nodes():

    while True:
        for node in NODES:
            try:
                base = f"http://{node}:5000"

                status = requests.get(
                    f"{base}/status", timeout=2
                ).json()

                events = requests.get(
                    f"{base}/events", timeout=2
                ).json()

                CLUSTER_STATUS[node] = status

                for e in events:
                    key = f"{e['case_id']}:{e['node']}:{e['time']}"

                    if key not in SEEN_CASES:
                        SEEN_CASES.add(key)
                        CLUSTER_EVENTS.append(e)

                CLUSTER_EVENTS[:] = CLUSTER_EVENTS[-MAX_EVENTS:]

            except Exception as e:
                CLUSTER_STATUS[node] = {
                    "node": node,
                    "error": str(e)
                }

        time.sleep(POLL_INTERVAL)


@app.route("/cluster/status")
def cluster_status():
    return jsonify(CLUSTER_STATUS)


@app.route("/cluster/events")
def cluster_events():
    return jsonify(CLUSTER_EVENTS)


@app.route("/cluster/nodes")
def cluster_nodes():
    return jsonify(list(CLUSTER_STATUS.keys()))


threading.Thread(target=poll_nodes, daemon=True).start()

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=7000)
