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



def poll_nodes():

    while True:
        for node in NODES:
            try:
                base = f"http://{node}:5000"

                # ---- STATUS ----
                status = requests.get(
                    f"{base}/status", timeout=2
                ).json()

                CLUSTER_STATUS[node] = status

                # ---- REPUTATION (Stage 8) ----
                try:
                    rep = requests.get(
                        f"{base}/reputation", timeout=2
                    ).json()

                    CLUSTER_STATUS[node]["reputation"] = rep

                except Exception as e:
                    CLUSTER_STATUS[node]["reputation_error"] = str(e)

                # ---- EVENTS ----
                events = requests.get(
                    f"{base}/events", timeout=2
                ).json()

                for e in events:
                    key = f"{e['case_id']}:{e['node']}:{e['time']}"

                    if key not in SEEN_CASES:
                        SEEN_CASES.add(key)
                        insert_event(e)
                        CLUSTER_EVENTS.append(e)

                CLUSTER_EVENTS[:] = CLUSTER_EVENTS[-MAX_EVENTS:]

            except Exception as e:
                CLUSTER_STATUS[node] = {
                    "node": node,
                    "error": str(e),
                    "online": False,
                }

        time.sleep(POLL_INTERVAL)


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



init_db()
CLUSTER_EVENTS[:] = load_recent_events()

threading.Thread(target=poll_nodes, daemon=True).start()

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=7000)
