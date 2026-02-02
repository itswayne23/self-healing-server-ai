📘 README.md — Distributed Self-Healing Server with Cooperative Intrusion Response
🛡️ Project Title

Distributed Self-Healing Server System with Quorum-Based Intrusion Response and Adaptive Trust

📌 Problem Statement

Modern server infrastructures face frequent attacks such as Denial-of-Service (DoS), resource exhaustion, and malicious processes.
Traditional systems either:

• rely on centralized monitoring
• react locally without coordination
• generate false positives
• cannot adapt to unreliable nodes
• lose state after crashes

This project addresses these limitations by designing a distributed, cooperative, and adaptive self-healing system where:

Nodes independently detect suspicious activity, consult peers, reach quorum, execute remediation, learn from past outcomes, and persist reputation across restarts.

🧠 Core Idea

Each node runs a security agent that:

1️⃣ monitors local processes
2️⃣ proposes incidents to peers
3️⃣ collects votes
4️⃣ applies weighted quorum
5️⃣ performs remediation
6️⃣ broadcasts results
7️⃣ updates trust and strike counters
8️⃣ decays reputation over time
9️⃣ persists state to disk

No single node has unilateral control.

The cluster behaves like a collective immune system.

🏗️ System Architecture
🔷 High-Level Components

• Agent Service (per node)
• Flask API Server
• Monitoring Engine (psutil)
• Quorum & Voting Module
• Trust & Strike Manager
• Persistence Layer (trust.json)
• Attack Simulator Scripts
• Docker Multi-Node Testbed

📊 Architecture Diagram
                    ┌───────────────────────────┐
                    │        Docker Network      │
                    │        (cluster-net)       │
                    └───────────────────────────┘

 ┌────────────┐        ┌────────────┐        ┌────────────┐
 │   Node1    │◀──────▶│   Node2    │◀──────▶│   Node3    │
 └────────────┘        └────────────┘        └────────────┘
 │ Agent App  │        │ Agent App  │        │ Agent App  │
 │ Flask API  │        │ Flask API  │        │ Flask API  │
 │ Monitor    │        │ Monitor    │        │ Monitor    │
 │ Trust DB   │        │ Trust DB   │        │ Trust DB   │
 └─────┬──────┘        └─────┬──────┘        └─────┬──────┘
       │                       │                       │
       ▼                       ▼                       ▼
 Process Scan           Peer Verification        Peer Verification
 CPU/Memory             Vote Aggregation         Vote Aggregation

                   ───────── Decision Fabric ─────────
                     Proposal → Vote → Quorum → Heal

🧱 Development Stages
✅ Stage 1 — Single Node Healing

• local monitoring
• suspicious process detection
• restart / kill
• Dockerized node

✅ Stage 2 — Cooperative Alerts

• multi-node cluster
• peer communication
• alert broadcasting
• no unilateral action

✅ Stage 3 — Quorum Remediation

• voting system
• quorum enforcement
• delayed action
• cluster notifications

✅ Stage 4 — Experimental Evaluation + Adaptive Trust

• weighted voting
• trust scores
• strike counters
• trust decay
• persistence across restarts
• false-positive penalties
• recovery metrics
• attack simulation

🔜 Stage 5 (Planned)

• ML-based anomaly detection
• React dashboard
• visualization
• ROC curves
• multi-host testing

🧪 Testing Methodology
🔬 Attack Types Simulated

• CPU flood
• fork bombs
• infinite loops
• port scans
• process storms
• fake alerts
• node failure

📈 Metrics Collected

• detection latency
• quorum convergence time
• remediation success rate
• false positive count
• trust evolution
• strike counts
• recovery duration
• restart persistence

🔁 Example Tests
TEST — Trust Decay

Wait 60s → trust decreases gradually.

TEST — Strike Reset

Fail → strikes increase.
Succeed → strikes reset.

TEST — Restart Persistence

Restart node → trust.json restored.

📊 Results (Summary)

Observed during local Docker experiments:

✔ quorum prevents false alarms
✔ adaptive trust reduces noisy nodes
✔ decay prevents stale reputations
✔ state survives restarts
✔ cluster remains stable under DoS
✔ peers continue voting when one node is overloaded

Graphs and CSV metrics are stored in /experiments/.

<!-- 📸 Screenshots (Coming Soon) -->

⚠️ Limitations

Current version:

• runs on local Docker hosts
• trust divergence possible between nodes
• no cryptographic signing yet
• Flask dev server only
• no ML detector yet
• no UI dashboard yet
• no cross-VM deployment

🚀 Future Work

Planned upgrades:

• cluster-wide reputation synchronization
• TLS between agents
• signed alerts
• Byzantine fault tolerance
• Raft-based state replication
• ML anomaly detection
• React monitoring dashboard
• Kubernetes deployment
• WAN latency experiments
• auto-scaling
• Prometheus + Grafana integration

🏁 How to Run
docker compose build
docker compose up


Check logs:

docker logs -f node1


Inspect trust state:

docker exec -it node1 cat /app/trust.json

🎯 Why This Project Matters

This system demonstrates:

✔ distributed consensus
✔ fault tolerance
✔ adaptive reputation
✔ intrusion response
✔ self-healing orchestration
✔ experimental methodology

It bridges cybersecurity, distributed systems, and autonomic computing.