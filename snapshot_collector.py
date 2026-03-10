import requests
import time
import json

BASE = "http://localhost:7000"

duration = 600  # experiment length in seconds (10 minutes) ← UPDATED
interval = 5     # snapshot every 5 seconds
max_retries = 3  # retry failed requests up to 3 times
retry_delay = 1  # wait 1 second between retries

trust_snaps = []
quarantine_snaps = []
anomaly_snaps = []

start = time.time()

print(f"Starting snapshot collection for {duration//60} minutes...")
print(f"Interval: {interval}s | Expected snapshots: ~{duration//interval} per endpoint\n")

def fetch_with_retry(url, max_retries=max_retries):
    """Helper function to fetch JSON with retry logic."""
    for attempt in range(max_retries):
        try:
            return requests.get(url, timeout=10).json()
        except requests.exceptions.RequestException as e:
            if attempt == max_retries - 1:
                raise  # Last attempt failed, re-raise exception
            print(f"  ⚠️  Retry {attempt+1}/{max_retries} for {url}")
            time.sleep(retry_delay)

while time.time() - start < duration:
    now = time.time()
    elapsed = round(now - start, 2)
    progress = round(elapsed / duration * 100, 1)

    try:
        # Collect snapshots with retry support
        trust = fetch_with_retry(f"{BASE}/cluster/trust")
        trust_snaps.append({"timestamp": now, "trust_matrix": trust})

        quarantine = fetch_with_retry(f"{BASE}/cluster/quarantine")
        quarantine_snaps.append({"timestamp": now, "quarantine_status": quarantine})

        anomalies = fetch_with_retry(f"{BASE}/cluster/anomalies")
        anomaly_snaps.append({"timestamp": now, "anomalies": anomalies})

        # Progress output with carriage return for in-place update
        print(f"\r[{progress:>5}%] @{elapsed:6.1f}s | Snapshots: {len(trust_snaps)}", end="", flush=True)

    except Exception as e:
        print(f"\n❌ Snapshot error at {elapsed}s: {e}")

    time.sleep(interval)

# Final newline after progress loop
print("\n\nCollecting final state...")

# Save final outputs
try:
    incidents = fetch_with_retry(f"{BASE}/history")
    final_status = fetch_with_retry(f"{BASE}/cluster/status")

    with open("incidents.json", "w") as f:
        json.dump(incidents, f, indent=2)
    with open("trust_snapshots.json", "w") as f:
        json.dump(trust_snaps, f, indent=2)
    with open("quarantine_snapshots.json", "w") as f:
        json.dump(quarantine_snaps, f, indent=2)
    with open("anomalies.json", "w") as f:
        json.dump(anomaly_snaps, f, indent=2)
    with open("final_status.json", "w") as f:
        json.dump(final_status, f, indent=2)

    print("✅ Snapshot collection complete!")
    print(f"📁 Files saved: incidents.json, trust_snapshots.json, quarantine_snapshots.json, anomalies.json, final_status.json")
    print(f"📊 Total snapshots collected: {len(trust_snaps)} per endpoint")

except Exception as e:
    print(f"❌ Error saving final data: {e}")