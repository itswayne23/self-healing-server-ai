import psutil
import time
import os
import sys
import threading
import requests
from flask import Flask, request, jsonify

# --- Node identity ---
NODE_NAME = os.getenv("NODE_NAME", "Unknown-Node")
PEERS = os.getenv("PEERS", "").split(",")

WHITELIST = ["apt", "apt-get", "dpkg", "curl", "pip"]

CHECK_INTERVAL = 2

app = Flask(__name__)

print(f"🛡️ Agent running on {NODE_NAME}")
sys.stdout.flush()


# --------------------------------------------------
# Receive alerts from peers
# --------------------------------------------------
@app.route("/alert", methods=["POST"])
def receive_alert():
    data = request.json
    print(f"📩 [{NODE_NAME}] Alert received: {data}")
    sys.stdout.flush()
    return jsonify({"status": "ack"}), 200


# --------------------------------------------------
# Send alert to peers
# --------------------------------------------------
def broadcast_alert(payload):
    for peer in PEERS:
        if not peer:
            continue

        print(f"📡 [{NODE_NAME}] sending alert to {peer}")
        sys.stdout.flush()

        url = f"http://{peer}:5000/alert"

        try:
            requests.post(url, json=payload, timeout=2)
        except Exception as e:
            print(f"⚠️ [{NODE_NAME}] could not contact {peer}: {e}")
            sys.stdout.flush()


# --------------------------------------------------
# Monitoring loop
# --------------------------------------------------
def monitor_loop():
    print(f"🛡️ Security agent background thread started on {NODE_NAME}")
    sys.stdout.flush()

    while True:
        for proc in psutil.process_iter(["pid", "name"]):
            try:
                cpu = proc.cpu_percent(interval=0.2)
                name = proc.info.get("name", "unknown")

                if cpu > 40 and not any(w in name.lower() for w in WHITELIST):

                    print(
                        f"🚨 [{NODE_NAME}] Suspicious {name} "
                        f"PID={proc.pid} CPU={cpu}"
                    )
                    sys.stdout.flush()

                    proc.kill()

                    print(f"✅ [{NODE_NAME}] Process terminated")
                    sys.stdout.flush()

                    payload = {
                        "from": NODE_NAME,
                        "process": name,
                        "pid": proc.pid,
                        "cpu": cpu,
                        "time": time.time()
                    }

                    broadcast_alert(payload)

            except (psutil.NoSuchProcess, psutil.AccessDenied):
                pass

        time.sleep(CHECK_INTERVAL)


# --------------------------------------------------
# Start everything
# --------------------------------------------------
threading.Thread(target=monitor_loop, daemon=True).start()

print("🌐 Starting HTTP server...")
sys.stdout.flush()

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000)
