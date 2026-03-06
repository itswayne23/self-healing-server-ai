import os
import json
import statistics
import pandas as pd
import matplotlib.pyplot as plt

BASE_DIR = "experiments"
SCENARIOS = ["benign", "attack1", "attack2"]

os.makedirs("figures", exist_ok=True)

results = {
    "scenario": [],
    "detections": [],
    "latency": [],
    "vote_weight": [],
    "precision": [],
    "recall": [],
    "quarantines": []
}


def load_json(path):
    with open(path) as f:
        return json.load(f)


def load_ground_truth(path):
    if not os.path.exists(path):
        return {}
    with open(path) as f:
        return json.load(f)


for scenario in SCENARIOS:

    scenario_path = os.path.join(BASE_DIR, scenario)

    if not os.path.exists(scenario_path):
        continue

    for run in os.listdir(scenario_path):

        run_path = os.path.join(scenario_path, run)

        events_file = os.path.join(run_path, "events.json")
        ground_file = os.path.join(run_path, "ground_truth.json")

        if not os.path.exists(events_file):
            continue

        events = load_json(events_file)
        ground_truth = load_ground_truth(ground_file)

        detections = 0
        latencies = []
        weights = []

        tp = 0
        fp = 0
        fn = 0
        quarantine_count = 0

        for e in events:

            process = e.get("process")
            node = e.get("node")
            result = e.get("result")

            malicious = "miner" in process or "python" in process

            if result == "terminated":
                detections += 1

            if result == "terminated" and malicious:
                tp += 1

            elif result == "terminated" and not malicious:
                fp += 1

            elif result != "terminated" and malicious:
                fn += 1

            if "start_time" in e and "time" in e:
                latencies.append(e["time"] - e["start_time"])

            if "weighted" in e:
                weights.append(e["weighted"])

            if e.get("weighted", 0) < 1:
                quarantine_count += 1

        avg_latency = statistics.mean(latencies) if latencies else 0
        avg_weight = statistics.mean(weights) if weights else 0

        precision = tp / (tp + fp) if (tp + fp) else 0
        recall = tp / (tp + fn) if (tp + fn) else 0

        results["scenario"].append(scenario)
        results["detections"].append(detections)
        results["latency"].append(avg_latency)
        results["vote_weight"].append(avg_weight)
        results["precision"].append(precision)
        results["recall"].append(recall)
        results["quarantines"].append(quarantine_count)


df = pd.DataFrame(results)

print("\n===== EXPERIMENT SUMMARY =====\n")
print(df.groupby("scenario").mean())

df.to_csv("analysis_results.csv", index=False)


# -------------------------------
# Detection Count
# -------------------------------

plt.figure(figsize=(8,5))

df.groupby("scenario")["detections"].mean().plot(kind="bar")

plt.title("Average Detection Count")
plt.ylabel("Detections")
plt.xlabel("Scenario")

plt.savefig("figures/detection_count.png", dpi=300)
plt.close()


# -------------------------------
# Detection Accuracy
# -------------------------------

plt.figure(figsize=(8,5))

df.groupby("scenario")["precision"].mean().plot(kind="bar")

plt.title("Detection Precision")
plt.ylabel("Precision")
plt.xlabel("Scenario")

plt.savefig("figures/detection_accuracy.png", dpi=300)
plt.close()


# -------------------------------
# Recall Graph
# -------------------------------

plt.figure(figsize=(8,5))

df.groupby("scenario")["recall"].mean().plot(kind="bar")

plt.title("Detection Recall")
plt.ylabel("Recall")
plt.xlabel("Scenario")

plt.savefig("figures/detection_recall.png", dpi=300)
plt.close()


# -------------------------------
# Consensus Latency
# -------------------------------

plt.figure(figsize=(8,5))

df.groupby("scenario")["latency"].mean().plot(kind="bar")

plt.title("Average Consensus Latency")
plt.ylabel("Seconds")
plt.xlabel("Scenario")

plt.savefig("figures/consensus_latency.png", dpi=300)
plt.close()


# -------------------------------
# Vote Weight
# -------------------------------

plt.figure(figsize=(8,5))

df.groupby("scenario")["vote_weight"].mean().plot(kind="bar")

plt.title("Average Vote Weight")
plt.ylabel("Weight")
plt.xlabel("Scenario")

plt.savefig("figures/vote_weight.png", dpi=300)
plt.close()


# -------------------------------
# Quarantine Events
# -------------------------------

plt.figure(figsize=(8,5))

df.groupby("scenario")["quarantines"].mean().plot(kind="bar")

plt.title("Average Quarantine Events")
plt.ylabel("Count")
plt.xlabel("Scenario")

plt.savefig("figures/quarantine_events.png", dpi=300)
plt.close()


# -------------------------------
# Latency Distribution
# -------------------------------

plt.figure(figsize=(8,5))

for scenario in SCENARIOS:

    subset = df[df["scenario"] == scenario]

    plt.hist(subset["latency"], alpha=0.5, label=scenario)

plt.legend()
plt.xlabel("Latency (seconds)")
plt.ylabel("Frequency")
plt.title("Consensus Latency Distribution")

plt.savefig("figures/latency_distribution.png", dpi=300)
plt.close()


print("\nAnalysis complete.")
print("Graphs saved in /figures")
print("CSV table saved as analysis_results.csv")