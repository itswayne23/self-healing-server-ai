const NODE_IDS = ["node1", "node2", "node3", "node4", "node5"];
const STATUSES = [
  "healthy",
  "healthy",
  "healthy",
  "degraded",
  "suspect",
  "compromised",
  "quarantined",
  "in_recovery",
];
const ROLES = ["leader", "follower", "follower", "follower", "observer"];
const EVENT_TYPES = [
  "vote_cast",
  "vote_conflict",
  "trust_update",
  "strike_increment",
  "quorum_recalculation",
  "hash_mismatch",
  "wal_replay",
  "recovery_trigger",
  "isolation_event",
  "reintegration_event",
];
const SEVERITIES = ["info", "warning", "critical"];
const ALERT_CATEGORIES = [
  "byzantine_detection",
  "trust_below_threshold",
  "strike_limit_reached",
  "node_isolation",
  "hash_mismatch",
  "network_partition",
  "consensus_failure",
  "recovery_failure",
];

let tick = 0;
let deterministicSeed = 42;

function seededRandom() {
  deterministicSeed = (deterministicSeed * 16807 + 0) % 2147483647;
  return deterministicSeed / 2147483647;
}

function rand(min = 0, max = 1) {
  return min + Math.random() * (max - min);
}

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function generateNodeState(nodeId, idx) {
  const baseTrust = 0.5 + Math.sin(tick * 0.02 + idx) * 0.3 + rand(-0.05, 0.05);
  const trust = Math.max(0, Math.min(1, baseTrust));
  const strikes =
    trust < 0.4
      ? Math.floor(rand(2, 5))
      : trust < 0.7
        ? Math.floor(rand(0, 2))
        : 0;
  const status =
    trust > 0.8
      ? "healthy"
      : trust > 0.6
        ? "degraded"
        : trust > 0.4
          ? "suspect"
          : trust > 0.2
            ? "compromised"
            : "quarantined";
  const inRecovery = status === "quarantined" && Math.random() > 0.5;

  return {
    node: nodeId,
    trust: Object.fromEntries(
      NODE_IDS.map((n) => [n, n === nodeId ? trust : 0.5 + rand(-0.3, 0.3)]),
    ),
    strikes: Object.fromEntries(
      NODE_IDS.map((n) => [n, n === nodeId ? strikes : Math.floor(rand(0, 3))]),
    ),
    active_cases: Math.floor(rand(0, 8)),
    status,
    in_recovery: inRecovery,
    quarantined: {},
    adaptive_quorum: {
      required: 3,
      total: 5,
      formula: "ceil((N+1)/2) + byzantine_adjust",
    },
    warm_start: Math.random() > 0.8,
    recovery_confidence: inRecovery ? rand(0.2, 0.9) : 1.0,
    role: ROLES[idx] || "follower",
    quorum_weight: trust > 0.5 ? 1.0 : 0.5,
    health: trust * 0.4 + rand(0.2, 0.5),
    cpu: rand(10, 90),
    memory: rand(20, 85),
    latency: rand(1, 200),
    message_delay: rand(0, 50),
    vote_consistency: rand(0.7, 1.0),
    integrity_hash: Math.random().toString(36).substring(2, 18),
    snapshot_age: Math.floor(rand(5, 300)),
    last_heartbeat: Date.now() - Math.floor(rand(0, 10000)),
    online: status !== "quarantined" || Math.random() > 0.3,
  };
}

function generateConsensusCase(idx) {
  const caseId = `case_${1000 + idx}`;
  const votes = {};
  const voteTypes = ["approve", "approve", "approve", "reject", "abstain"];
  NODE_IDS.forEach((n, i) => {
    votes[n] = pick(voteTypes);
  });

  const approves = Object.values(votes).filter((v) => v === "approve").length;
  const rejects = Object.values(votes).filter((v) => v === "reject").length;
  const byzantineFlag =
    rejects >= 2 ||
    Object.values(votes).filter((v) => v === "abstain").length >= 2;

  return {
    case_id: caseId,
    proposer: pick(NODE_IDS),
    votes,
    confidence: rand(0.5, 1.0),
    quorum_required: 3,
    decision: approves >= 3 ? "approved" : "rejected",
    byzantine_flag: byzantineFlag,
    time: Date.now() / 1000 - idx * 60,
    payload_hash: Math.random().toString(36).substring(2, 14),
    double_voting: Math.random() > 0.9,
    vote_withholding: Math.random() > 0.85,
    slow_responders: Math.random() > 0.7 ? [pick(NODE_IDS)] : [],
  };
}

function generateTrustHistory() {
  const history = {};
  NODE_IDS.forEach((nodeId, idx) => {
    const points = [];
    for (let i = 0; i < 60; i++) {
      const t =
        0.5 + Math.sin(i * 0.1 + idx) * 0.3 + (Math.random() - 0.5) * 0.1;
      points.push({
        time: Date.now() - (60 - i) * 60000,
        trust: Math.max(0, Math.min(1, t)),
        event:
          i % 15 === 0
            ? pick([
                "threshold_breach",
                "isolation",
                "reintegration",
                "trust_reset",
              ])
            : null,
      });
    }
    history[nodeId] = points;
  });
  return history;
}

function generateWALData() {
  const wal = {};
  NODE_IDS.forEach((nodeId, idx) => {
    const size = 1024 + Math.floor(tick * rand(10, 50)) + idx * 512;
    wal[nodeId] = {
      size,
      growth_rate: rand(5, 50),
      snapshot_frequency: Math.floor(rand(30, 120)),
      last_snapshot: Date.now() - Math.floor(rand(10000, 60000)),
      hash: Math.random().toString(36).substring(2, 18),
      restore_attempts: Math.floor(rand(0, 5)),
      restore_success: Math.floor(rand(0, 3)),
      restore_failure: Math.floor(rand(0, 2)),
      entries: Math.floor(size / 64),
    };
  });

  const hashes = Object.values(wal).map((w) => w.hash);
  const majority = hashes.sort(
    (a, b) =>
      hashes.filter((h) => h === b).length -
      hashes.filter((h) => h === a).length,
  )[0];

  return { nodes: wal, majority_hash: majority };
}

function generateRecoveryData() {
  const stages = [
    "detection",
    "isolation",
    "quarantine",
    "state_sync_request",
    "wal_replay",
    "hash_verification",
    "trust_recalibration",
    "reintegration",
  ];
  const recoveries = {};

  NODE_IDS.forEach((nodeId) => {
    if (Math.random() > 0.6) {
      const currentStage = Math.floor(rand(0, stages.length));
      const stageData = stages.map((s, i) => ({
        stage: s,
        completed: i < currentStage,
        active: i === currentStage,
        timestamp:
          i < currentStage ? Date.now() - (stages.length - i) * 5000 : null,
      }));

      recoveries[nodeId] = {
        stages: stageData,
        recovery_time: rand(10, 120),
        sync_source: pick(NODE_IDS.filter((n) => n !== nodeId)),
        validation_success: Math.random() > 0.3,
        rollback_count: Math.floor(rand(0, 3)),
        started: Date.now() - Math.floor(rand(30000, 120000)),
      };
    }
  });

  return recoveries;
}

function generateForensicLogs(count = 50) {
  const logs = [];
  for (let i = 0; i < count; i++) {
    logs.push({
      id: `log_${Date.now()}_${i}`,
      time: Date.now() / 1000 - i * rand(10, 120),
      node: pick(NODE_IDS),
      event_type: pick(EVENT_TYPES),
      severity: pick(SEVERITIES),
      action: pick([
        "vote_cast",
        "penalty",
        "quarantine",
        "recovery_start",
        "recovery_complete",
        "trust_update",
      ]),
      actor: pick(NODE_IDS),
      target: pick(NODE_IDS),
      case_id: `case_${Math.floor(rand(1000, 1050))}`,
      metadata: {
        detail: `Auto-generated forensic event #${i}`,
        accuracy: rand(0.1, 1.0),
        penalty: rand(0, 0.25),
      },
    });
  }
  return logs;
}

function generateAlerts() {
  const alerts = [];
  const count = Math.floor(rand(3, 12));
  for (let i = 0; i < count; i++) {
    alerts.push({
      id: `alert_${Date.now()}_${i}`,
      category: pick(ALERT_CATEGORIES),
      severity: pick(SEVERITIES),
      node: pick(NODE_IDS),
      message: `${pick(ALERT_CATEGORIES).replace(/_/g, " ")} detected on ${pick(NODE_IDS)}`,
      time: Date.now() - i * Math.floor(rand(5000, 60000)),
      acknowledged: Math.random() > 0.7,
    });
  }
  return alerts;
}

export function generateMockState(useDeterministic = false) {
  tick++;
  if (useDeterministic) {
    deterministicSeed = 42 + tick;
  }

  const nodeStates = {};
  NODE_IDS.forEach((id, idx) => {
    nodeStates[id] = generateNodeState(id, idx);
  });

  const healthMap = {};
  NODE_IDS.forEach((id) => {
    healthMap[id] = nodeStates[id].health;
  });

  return {
    clusterStatus: nodeStates,
    clusterHealth: healthMap,
    consensusCases: Array.from({ length: 8 }, (_, i) =>
      generateConsensusCase(i),
    ),
    trustHistory: generateTrustHistory(),
    walData: generateWALData(),
    recoveryData: generateRecoveryData(),
    forensicLogs: generateForensicLogs(),
    alerts: generateAlerts(),
    clusterMetrics: {
      total_nodes: NODE_IDS.length,
      healthy_nodes: Object.values(nodeStates).filter(
        (n) => n.status === "healthy",
      ).length,
      quorum_size: 3,
      active_cases: Object.values(nodeStates).reduce(
        (s, n) => s + n.active_cases,
        0,
      ),
      compromised_nodes: Object.values(nodeStates).filter(
        (n) => n.status === "compromised" || n.status === "quarantined",
      ).length,
      recovery_count: Object.keys(generateRecoveryData()).length,
      avg_trust:
        Object.values(nodeStates).reduce(
          (s, n) => s + (n.trust[n.node] || 0),
          0,
        ) / NODE_IDS.length,
      cluster_health_index:
        Object.values(healthMap).reduce((s, h) => s + h, 0) / NODE_IDS.length,
    },
    metricsHistory: [],
  };
}

export { NODE_IDS, EVENT_TYPES, SEVERITIES, ALERT_CATEGORIES };
