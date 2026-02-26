import { create } from "zustand";
import { generateMockState } from "../utils/mockData";
import * as api from "./api";

const useStore = create((set, get) => ({
  // Connection
  connected: false,
  useMock: false,
  pollInterval: 3000,
  deterministicReplay: false,

  // Cluster data
  clusterStatus: {},
  clusterHealth: {},
  consensusCases: [],
  trustHistory: {},
  walData: { nodes: {}, majority_hash: "" },
  recoveryData: {},
  forensicLogs: [],
  alerts: [],
  clusterMetrics: {
    total_nodes: 0,
    healthy_nodes: 0,
    quorum_size: 0,
    active_cases: 0,
    compromised_nodes: 0,
    recovery_count: 0,
    avg_trust: 0,
    cluster_health_index: 0,
  },
  metricsHistory: [],
  events: [],
  stats: {},
  quarantine: {},
  reputation: {},
  deadNodes: {},
  snapshots: {},
  anomalies: {},

  // UI State
  activePanel: "topology",
  selectedNode: null,
  inspectionOpen: false,
  researchMode: false,
  experimentMode: false,
  sidebarCollapsed: false,

  // Alert state
  alertHistory: [],
  acknowledgedAlerts: new Set(),

  // Actions
  setActivePanel: (panel) => set({ activePanel: panel }),
  setSelectedNode: (node) =>
    set({ selectedNode: node, inspectionOpen: !!node }),
  closeInspection: () => set({ inspectionOpen: false, selectedNode: null }),
  toggleResearchMode: () => set((s) => ({ researchMode: !s.researchMode })),
  toggleExperimentMode: () =>
    set((s) => ({ experimentMode: !s.experimentMode })),
  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
  toggleMock: () => set((s) => ({ useMock: !s.useMock })),
  toggleDeterministic: () =>
    set((s) => ({ deterministicReplay: !s.deterministicReplay })),

  acknowledgeAlert: (id) =>
    set((s) => {
      const newAck = new Set(s.acknowledgedAlerts);
      newAck.add(id);
      return { acknowledgedAlerts: newAck };
    }),

  // Sparkline history
  sparklineData: {
    total_nodes: [],
    healthy_nodes: [],
    active_cases: [],
    compromised_nodes: [],
    avg_trust: [],
    cluster_health_index: [],
  },

  // fetch from real API
  fetchFromAPI: async () => {
    try {
      const [
        status,
        health,
        events,
        trust,
        audit,
        metrics,
        quarantine,
        reputation,
        dead,
        snapshots,
        anomalies,
        stats,
        recoveryCandidates,
      ] = await Promise.all([
        api.fetchClusterStatus(),
        api.fetchClusterHealth(),
        api.fetchClusterEvents(),
        api.fetchClusterTrust(),
        api.fetchClusterAudit(),
        api.fetchClusterMetrics(),
        api.fetchClusterQuarantine(),
        api.fetchClusterReputation(),
        api.fetchClusterDead(),
        api.fetchClusterSnapshots(),
        api.fetchClusterAnomalies(),
        api.fetchStats(),
        api.fetchClusterRecoveryCandidates(),
      ]);

      const nodeIds = Object.keys(status);

      // 1. Calculate Cluster Metrics
      const liveMetrics = {
        total_nodes: nodeIds.length,
        healthy_nodes: Object.values(health).filter((h) => h > 0.7).length,
        quorum_size: Math.ceil((nodeIds.length + 1) / 2),
        active_cases: Object.values(status).reduce(
          (s, n) => s + (n.active_cases || 0),
          0,
        ),
        compromised_nodes: Object.values(health).filter((h) => h < 0.3).length,
        recovery_count: Object.keys(dead).length,
        avg_trust:
          Object.values(status).reduce((s, n) => {
            const t = n.trust || {};
            const nodeName =
              n.node || Object.keys(status).find((k) => status[k] === n);
            return s + (t[nodeName] || 0.5);
          }, 0) / (nodeIds.length || 1),
        cluster_health_index:
          Object.values(health).reduce((s, h) => s + h, 0) /
          (nodeIds.length || 1),
      };

      // 2. Map Consensus Cases
      const consensusCases = events
        .filter((e) => e.case_id)
        .map((e) => ({
          ...e,
          votes: e.votes || {},
          confidence: e.weighted || e.confidence || 0,
          quorum_required:
            e.quorum_required || Math.ceil((nodeIds.length + 1) / 2),
        }))
        .slice(0, 50);

      // 3. Map WAL Data
      const walNodes = {};
      Object.keys(snapshots.nodes || {}).forEach((node) => {
        const snap = snapshots.nodes[node];
        if (snap.payload) {
          const payload = snap.payload;
          walNodes[node] = {
            size: payload.node_stats?.wal_size || 0,
            entries: payload.node_stats?.wal_entries || 0,
            hash: snap.hash || "—",
            last_snapshot: payload.node_stats?.last_snapshot || 0,
            restore_success: payload.node_stats?.restore_success || 0,
            restore_failure: payload.node_stats?.restore_failure || 0,
          };
        }
      });
      const walData = {
        nodes: walNodes,
        majority_hash: snapshots.majority_hash || snapshots.hash || "",
      };

      // 4. Map Recovery Data
      const recoveryData = {};
      Object.entries(recoveryCandidates).forEach(([node, status]) => {
        if (status === "recover" || status === "replace") {
          recoveryData[node] = {
            stages: [
              {
                stage: "detection",
                completed: true,
                timestamp: Date.now() - 30000,
              },
              {
                stage: "isolation",
                completed: true,
                timestamp: Date.now() - 15000,
              },
              {
                stage: "quarantine",
                completed: true,
                timestamp: Date.now() - 5000,
              },
              { stage: "state_sync_request", active: true },
              { stage: "wal_replay", active: false },
              { stage: "hash_verification", active: false },
              { stage: "trust_recalibration", active: false },
              { stage: "reintegration", active: false },
            ],
            sync_source: "controller",
            recovery_time: 0,
            validation_success: false,
            rollback_count: 0,
          };
        }
      });

      // 5. Map Alerts from Anomalies
      const activeAlerts = [];
      Object.values(anomalies)
        .flat()
        .forEach((a) => {
          activeAlerts.push({
            id: `anomaly_${a.node}_${a.peer}_${a.severity}`,
            category: "byzantine_detection",
            severity: a.severity || "warning",
            node: a.peer,
            message: `Anomaly: ${a.reason} on ${a.peer} (acc: ${a.accuracy})`,
            time: (a.time || Date.now() / 1000) * 1000,
            acknowledged: false,
          });
        });

      // 6. Update Sparklines (only if metrics changed significantly or every N polls)
      const newSparkline = { ...get().sparklineData };
      Object.keys(newSparkline).forEach((key) => {
        const arr = [...newSparkline[key], liveMetrics[key] || 0];
        newSparkline[key] = arr.slice(-20);
      });

      set({
        connected: true,
        clusterStatus: status,
        clusterHealth: health,
        events,
        quarantine,
        reputation,
        deadNodes: dead,
        snapshots,
        anomalies,
        stats,
        forensicLogs: audit,
        clusterMetrics: liveMetrics,
        consensusCases,
        walData,
        recoveryData,
        alerts: activeAlerts,
        sparklineData: newSparkline,
        alertHistory: [
          ...get().alertHistory,
          ...activeAlerts.filter(
            (a) => !get().alertHistory.find((h) => h.id === a.id),
          ),
        ].slice(-100),
      });
    } catch (err) {
      set({ connected: false });
    }
  },

  // refresh with mock data
  refreshMock: () => {
    const state = get();
    const mock = generateMockState(state.deterministicReplay);

    // Update sparklines
    const newSparkline = { ...state.sparklineData };
    Object.keys(newSparkline).forEach((key) => {
      const arr = [...newSparkline[key], mock.clusterMetrics[key] || 0];
      newSparkline[key] = arr.slice(-20);
    });

    set({
      ...mock,
      sparklineData: newSparkline,
      alertHistory: [
        ...state.alertHistory,
        ...mock.alerts.filter(
          (a) => !state.alertHistory.find((h) => h.id === a.id),
        ),
      ].slice(-100),
    });
  },

  // Main poll
  poll: () => {
    const state = get();
    if (state.useMock) {
      state.refreshMock();
    } else {
      state.fetchFromAPI();
    }
  },

  // Simulation actions
  simulate: {
    maliciousNode: (nodeId) => {
      set((s) => {
        const status = { ...s.clusterStatus };
        if (status[nodeId]) {
          status[nodeId] = {
            ...status[nodeId],
            status: "compromised",
            trust: { ...status[nodeId].trust, [nodeId]: 0.1 },
          };
        }
        return {
          clusterStatus: status,
          alerts: [
            ...s.alerts,
            {
              id: `sim_${Date.now()}`,
              category: "byzantine_detection",
              severity: "critical",
              node: nodeId,
              message: `Simulated malicious behavior on ${nodeId}`,
              time: Date.now(),
              acknowledged: false,
            },
          ],
        };
      });
    },
    networkPartition: (nodeId) => {
      set((s) => {
        const status = { ...s.clusterStatus };
        if (status[nodeId]) {
          status[nodeId] = {
            ...status[nodeId],
            online: false,
            status: "quarantined",
          };
        }
        return {
          clusterStatus: status,
          alerts: [
            ...s.alerts,
            {
              id: `sim_${Date.now()}`,
              category: "network_partition",
              severity: "critical",
              node: nodeId,
              message: `Simulated network partition on ${nodeId}`,
              time: Date.now(),
              acknowledged: false,
            },
          ],
        };
      });
    },
    conflictingVotes: () => {
      set((s) => {
        const newCase = {
          case_id: `sim_case_${Date.now()}`,
          proposer: "node1",
          votes: {
            node1: "approve",
            node2: "reject",
            node3: "approve",
            node4: "reject",
            node5: "reject",
          },
          confidence: 0.4,
          quorum_required: 3,
          decision: "rejected",
          byzantine_flag: true,
          time: Date.now() / 1000,
          double_voting: true,
          vote_withholding: false,
          slow_responders: ["node4"],
        };
        return { consensusCases: [newCase, ...s.consensusCases] };
      });
    },
    delayHeartbeat: (nodeId) => {
      set((s) => {
        const status = { ...s.clusterStatus };
        if (status[nodeId]) {
          status[nodeId] = {
            ...status[nodeId],
            last_heartbeat: Date.now() - 30000,
            latency: 999,
            status: "degraded",
          };
        }
        return { clusterStatus: status };
      });
    },
    corruptWAL: (nodeId) => {
      set((s) => {
        const wal = { ...s.walData, nodes: { ...s.walData.nodes } };
        if (wal.nodes[nodeId]) {
          wal.nodes[nodeId] = {
            ...wal.nodes[nodeId],
            hash: "CORRUPTED_" + Date.now(),
            restore_failure: (wal.nodes[nodeId].restore_failure || 0) + 1,
          };
        }
        return {
          walData: wal,
          alerts: [
            ...s.alerts,
            {
              id: `sim_${Date.now()}`,
              category: "hash_mismatch",
              severity: "critical",
              node: nodeId,
              message: `WAL corruption simulated on ${nodeId}`,
              time: Date.now(),
              acknowledged: false,
            },
          ],
        };
      });
    },
    triggerRecovery: (nodeId) => {
      set((s) => {
        const rec = { ...s.recoveryData };
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
        rec[nodeId] = {
          stages: stages.map((st, i) => ({
            stage: st,
            completed: i === 0,
            active: i === 1,
            timestamp: i === 0 ? Date.now() : null,
          })),
          recovery_time: 0,
          sync_source: "node1",
          validation_success: false,
          rollback_count: 0,
          started: Date.now(),
        };
        return { recoveryData: rec };
      });
    },
    trustReset: (nodeId) => {
      set((s) => {
        const status = { ...s.clusterStatus };
        if (status[nodeId]) {
          const trust = {};
          Object.keys(status[nodeId].trust || {}).forEach((k) => {
            trust[k] = 0.5;
          });
          status[nodeId] = {
            ...status[nodeId],
            trust,
            strikes: Object.fromEntries(
              Object.keys(status[nodeId].strikes || {}).map((k) => [k, 0]),
            ),
          };
        }
        return { clusterStatus: status };
      });
    },
    quorumRecalc: () => {
      set((s) => ({
        clusterMetrics: {
          ...s.clusterMetrics,
          quorum_size: Math.ceil((s.clusterMetrics.total_nodes + 1) / 2),
        },
        alerts: [
          ...s.alerts,
          {
            id: `sim_${Date.now()}`,
            category: "byzantine_detection",
            severity: "info",
            node: "cluster",
            message: "Quorum recalculated",
            time: Date.now(),
            acknowledged: false,
          },
        ],
      }));
    },
  },

  // Polling lifecycle
  _pollTimer: null,
  startPolling: () => {
    const state = get();
    // Initial poll
    state.poll();
    // Set interval
    const timer = setInterval(() => {
      get().poll();
    }, state.pollInterval);
    set({ _pollTimer: timer });
  },
  stopPolling: () => {
    const state = get();
    if (state._pollTimer) {
      clearInterval(state._pollTimer);
      set({ _pollTimer: null });
    }
  },
}));

export default useStore;
