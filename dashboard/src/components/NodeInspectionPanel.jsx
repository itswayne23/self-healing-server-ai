import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  CartesianGrid,
} from "recharts";
import {
  FiX,
  FiCpu,
  FiActivity,
  FiShield,
  FiDatabase,
  FiRefreshCw,
  FiFileText,
  FiCheckCircle,
  FiHeart,
} from "react-icons/fi";
import useStore from "../store/store";
import { formatTimestamp, statusColor, trustColor } from "../utils/export";

const TABS = [
  { id: "overview", label: "Overview", icon: FiCpu },
  { id: "trust", label: "Trust Timeline", icon: FiShield },
  { id: "strikes", label: "Strike History", icon: FiActivity },
  { id: "wal", label: "WAL Monitor", icon: FiDatabase },
  { id: "recovery", label: "Recovery", icon: FiRefreshCw },
  { id: "forensic", label: "Forensic Logs", icon: FiFileText },
  { id: "consensus", label: "Consensus", icon: FiCheckCircle },
  { id: "health", label: "Health Metrics", icon: FiHeart },
];

export default function NodeInspectionPanel() {
  const {
    inspectionOpen,
    selectedNode,
    closeInspection,
    clusterStatus,
    trustHistory,
    walData,
    recoveryData,
    forensicLogs,
    consensusCases,
  } = useStore();
  const [activeTab, setActiveTab] = useState("overview");

  if (!inspectionOpen || !selectedNode) return null;

  const nodeData = clusterStatus[selectedNode] || {};
  const nodeTrust = nodeData.trust?.[selectedNode] || 0;
  const nodeStrikes = nodeData.strikes?.[selectedNode] || 0;
  const trustHist = trustHistory[selectedNode] || [];
  const walInfo = walData?.nodes?.[selectedNode] || {};
  const recInfo = recoveryData?.[selectedNode];
  const nodeLogs = forensicLogs.filter(
    (l) =>
      l.node === selectedNode ||
      l.actor === selectedNode ||
      l.target === selectedNode,
  );
  const nodeCases = consensusCases.filter((c) => c.votes?.[selectedNode]);

  return (
    <AnimatePresence>
      <motion.div
        className="fixed right-0 top-0 h-full w-[420px] glass-bright z-50 flex flex-col shadow-2xl"
        initial={{ x: 420 }}
        animate={{ x: 0 }}
        exit={{ x: 420 }}
        transition={{ type: "spring", damping: 25 }}
      >
        {/* Header */}
        <div className="p-4 border-b border-white/5 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center text-lg font-bold"
              style={{
                background: `${statusColor(nodeData.status)}20`,
                color: statusColor(nodeData.status),
              }}
            >
              {selectedNode?.slice(-1)}
            </div>
            <div>
              <h3 className="text-white font-semibold">{selectedNode}</h3>
              <div className="flex items-center gap-2">
                <span
                  className="text-xs px-1.5 py-0.5 rounded-full"
                  style={{
                    background: `${statusColor(nodeData.status)}20`,
                    color: statusColor(nodeData.status),
                  }}
                >
                  {nodeData.status || "unknown"}
                </span>
                <span className="text-xs text-[#64748b]">
                  {nodeData.role || "follower"}
                </span>
              </div>
            </div>
          </div>
          <button
            onClick={closeInspection}
            className="text-[#64748b] hover:text-white p-1 cursor-pointer"
          >
            <FiX size={20} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex overflow-x-auto border-b border-white/5 px-2 shrink-0">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-1.5 px-3 py-2.5 text-xs font-medium whitespace-nowrap transition-all border-b-2 cursor-pointer ${
                  activeTab === tab.id
                    ? "text-[#00ff88] border-[#00ff88]"
                    : "text-[#64748b] border-transparent hover:text-white"
                }`}
              >
                <Icon size={12} />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {activeTab === "overview" && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                {[
                  {
                    label: "Trust",
                    value: nodeTrust.toFixed(3),
                    color: trustColor(nodeTrust),
                  },
                  {
                    label: "Strikes",
                    value: nodeStrikes,
                    color: nodeStrikes > 2 ? "#ff3366" : "#00ff88",
                  },
                  {
                    label: "Active Cases",
                    value: nodeData.active_cases || 0,
                    color: "#ffae00",
                  },
                  {
                    label: "CPU Usage",
                    value: `${(nodeData.cpu || 0).toFixed(1)}%`,
                    color: "#00aaff",
                  },
                  {
                    label: "Memory",
                    value: `${(nodeData.memory || 0).toFixed(1)}%`,
                    color: "#a855f7",
                  },
                  {
                    label: "Latency",
                    value: `${(nodeData.latency || 0).toFixed(0)}ms`,
                    color: "#06d6a0",
                  },
                  {
                    label: "Msg Delay",
                    value: `${(nodeData.message_delay || 0).toFixed(0)}ms`,
                    color: "#ffae00",
                  },
                  {
                    label: "Vote Consistency",
                    value: `${((nodeData.vote_consistency || 0) * 100).toFixed(1)}%`,
                    color: "#00ff88",
                  },
                  {
                    label: "Snapshot Age",
                    value: `${nodeData.snapshot_age || 0}s`,
                    color: "#64748b",
                  },
                  {
                    label: "Quorum Weight",
                    value: nodeData.quorum_weight || 0,
                    color: "#a855f7",
                  },
                ].map((m, i) => (
                  <div key={i} className="bg-white/5 rounded-lg p-3">
                    <span className="text-[10px] uppercase tracking-wider text-[#64748b]">
                      {m.label}
                    </span>
                    <p
                      className="text-lg font-bold mt-0.5"
                      style={{ color: m.color }}
                    >
                      {m.value}
                    </p>
                  </div>
                ))}
              </div>
              <div className="bg-white/5 rounded-lg p-3">
                <span className="text-[10px] uppercase tracking-wider text-[#64748b]">
                  Integrity Hash
                </span>
                <p className="text-xs font-mono text-[#00aaff] mt-1 break-all">
                  {nodeData.integrity_hash || "N/A"}
                </p>
              </div>
              <div className="bg-white/5 rounded-lg p-3">
                <span className="text-[10px] uppercase tracking-wider text-[#64748b]">
                  Suspicion Flags
                </span>
                <div className="flex flex-wrap gap-1 mt-1">
                  {nodeStrikes > 2 && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#ff3366]/20 text-[#ff3366]">
                      High Strikes
                    </span>
                  )}
                  {nodeTrust < 0.4 && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#ffae00]/20 text-[#ffae00]">
                      Low Trust
                    </span>
                  )}
                  {(nodeData.latency || 0) > 150 && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#ff8800]/20 text-[#ff8800]">
                      High Latency
                    </span>
                  )}
                  {nodeData.in_recovery && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#00aaff]/20 text-[#00aaff]">
                      In Recovery
                    </span>
                  )}
                  {nodeStrikes <= 2 &&
                    nodeTrust >= 0.4 &&
                    !nodeData.in_recovery &&
                    (nodeData.latency || 0) <= 150 && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#00ff88]/20 text-[#00ff88]">
                        None
                      </span>
                    )}
                </div>
              </div>
            </div>
          )}

          {activeTab === "trust" && (
            <div>
              <h4 className="text-sm font-semibold text-white mb-3">
                Trust Score Over Time
              </h4>
              <ResponsiveContainer width="100%" height={200}>
                <LineChart
                  data={trustHist.map((p, i) => ({
                    i,
                    trust: p.trust,
                    time: formatTimestamp(p.time),
                  }))}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="rgba(255,255,255,0.05)"
                  />
                  <XAxis dataKey="i" tick={false} />
                  <YAxis domain={[0, 1]} stroke="#64748b" fontSize={10} />
                  <Tooltip
                    contentStyle={{
                      background: "rgba(10,14,26,0.95)",
                      border: "1px solid rgba(255,255,255,0.1)",
                      borderRadius: 8,
                      fontSize: 11,
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="trust"
                    stroke="#00ff88"
                    strokeWidth={2}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
              <div className="mt-3 space-y-1">
                {trustHist
                  .filter((p) => p.event)
                  .map((p, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs">
                      <span className="text-[#ffae00]">⚡</span>
                      <span className="text-[#94a3b8]">
                        {formatTimestamp(p.time)}
                      </span>
                      <span className="text-white">{p.event}</span>
                    </div>
                  ))}
              </div>
            </div>
          )}

          {activeTab === "strikes" && (
            <div>
              <h4 className="text-sm font-semibold text-white mb-3">
                Strike Count by Peer
              </h4>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart
                  data={Object.entries(nodeData.strikes || {}).map(
                    ([n, s]) => ({ node: n, strikes: s }),
                  )}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="rgba(255,255,255,0.05)"
                  />
                  <XAxis dataKey="node" stroke="#64748b" fontSize={10} />
                  <YAxis stroke="#64748b" fontSize={10} />
                  <Tooltip
                    contentStyle={{
                      background: "rgba(10,14,26,0.95)",
                      border: "1px solid rgba(255,255,255,0.1)",
                      borderRadius: 8,
                      fontSize: 11,
                    }}
                  />
                  <Bar dataKey="strikes" fill="#ff3366" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {activeTab === "wal" && (
            <div className="space-y-3">
              <h4 className="text-sm font-semibold text-white">WAL Status</h4>
              {[
                { label: "WAL Size", value: `${walInfo.size || 0} bytes` },
                {
                  label: "Growth Rate",
                  value: `${(walInfo.growth_rate || 0).toFixed(1)} B/s`,
                },
                { label: "Entries", value: walInfo.entries || 0 },
                {
                  label: "Last Snapshot",
                  value: formatTimestamp(walInfo.last_snapshot),
                },
                { label: "Hash", value: walInfo.hash || "N/A" },
                {
                  label: "Restore Attempts",
                  value: walInfo.restore_attempts || 0,
                },
                {
                  label: "Success / Failure",
                  value: `${walInfo.restore_success || 0} / ${walInfo.restore_failure || 0}`,
                },
              ].map((item, i) => (
                <div
                  key={i}
                  className="flex justify-between items-center bg-white/5 rounded-lg px-3 py-2"
                >
                  <span className="text-xs text-[#64748b]">{item.label}</span>
                  <span
                    className={`text-xs font-mono ${item.label === "Hash" ? "text-[#00aaff]" : "text-white"}`}
                  >
                    {item.value}
                  </span>
                </div>
              ))}
            </div>
          )}

          {activeTab === "recovery" && (
            <div>
              <h4 className="text-sm font-semibold text-white mb-3">
                Recovery Progress
              </h4>
              {recInfo ? (
                <div className="space-y-2">
                  {recInfo.stages.map((s, i) => (
                    <div
                      key={i}
                      className={`flex items-center gap-3 px-3 py-2 rounded-lg ${s.completed ? "bg-[#00ff88]/10" : s.active ? "bg-[#00aaff]/10" : "bg-white/5"}`}
                    >
                      <div
                        className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${s.completed ? "bg-[#00ff88] text-black" : s.active ? "bg-[#00aaff] text-white animate-pulse" : "bg-white/10 text-[#64748b]"}`}
                      >
                        {s.completed ? "✓" : i + 1}
                      </div>
                      <div className="flex-1">
                        <span
                          className={`text-xs font-medium ${s.completed ? "text-[#00ff88]" : s.active ? "text-[#00aaff]" : "text-[#64748b]"}`}
                        >
                          {s.stage.replace(/_/g, " ")}
                        </span>
                      </div>
                      {s.timestamp && (
                        <span className="text-[10px] text-[#64748b]">
                          {formatTimestamp(s.timestamp)}
                        </span>
                      )}
                    </div>
                  ))}
                  <div className="mt-3 bg-white/5 rounded-lg p-3 space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="text-[#64748b]">Sync Source</span>
                      <span className="text-white">{recInfo.sync_source}</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-[#64748b]">Rollback Count</span>
                      <span className="text-white">
                        {recInfo.rollback_count}
                      </span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-[#64748b]">Validation</span>
                      <span
                        className={
                          recInfo.validation_success
                            ? "text-[#00ff88]"
                            : "text-[#ff3366]"
                        }
                      >
                        {recInfo.validation_success ? "Success" : "Pending"}
                      </span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-center py-8 text-[#64748b] text-sm">
                  No active recovery for this node
                </div>
              )}
            </div>
          )}

          {activeTab === "forensic" && (
            <div className="space-y-2">
              <h4 className="text-sm font-semibold text-white mb-2">
                Recent Events
              </h4>
              {nodeLogs.slice(0, 20).map((l, i) => (
                <div key={i} className="bg-white/5 rounded-lg p-2">
                  <div className="flex items-center justify-between mb-1">
                    <span
                      className="text-[10px] px-1.5 py-0.5 rounded"
                      style={{
                        background: `${severityToColor(l.severity)}20`,
                        color: severityToColor(l.severity),
                      }}
                    >
                      {l.severity}
                    </span>
                    <span className="text-[10px] text-[#64748b]">
                      {formatTimestamp(l.time)}
                    </span>
                  </div>
                  <p className="text-xs text-white">
                    {l.action}: {l.actor} → {l.target}
                  </p>
                </div>
              ))}
              {nodeLogs.length === 0 && (
                <div className="text-center py-4 text-[#64748b] text-sm">
                  No events found
                </div>
              )}
            </div>
          )}

          {activeTab === "consensus" && (
            <div className="space-y-2">
              <h4 className="text-sm font-semibold text-white mb-2">
                Consensus Participation
              </h4>
              {nodeCases.slice(0, 10).map((c, i) => (
                <div key={i} className="bg-white/5 rounded-lg p-2">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-mono text-[#00aaff]">
                      {c.case_id}
                    </span>
                    <span
                      className={`text-[10px] px-1.5 py-0.5 rounded ${c.decision === "approved" ? "bg-[#00ff88]/20 text-[#00ff88]" : "bg-[#ff3366]/20 text-[#ff3366]"}`}
                    >
                      {c.decision}
                    </span>
                  </div>
                  <p className="text-xs text-[#94a3b8]">
                    Vote:{" "}
                    <span className="text-white font-medium">
                      {c.votes[selectedNode]}
                    </span>
                  </p>
                  {c.byzantine_flag && (
                    <span className="text-[10px] text-[#ff3366]">
                      ⚠️ Byzantine flag
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}

          {activeTab === "health" && (
            <div className="space-y-3">
              <h4 className="text-sm font-semibold text-white">
                Health Breakdown
              </h4>
              {[
                {
                  label: "Overall Health",
                  value: (nodeData.health || 0) * 100,
                  color: trustColor(nodeData.health || 0),
                },
                { label: "CPU", value: nodeData.cpu || 0, color: "#00aaff" },
                {
                  label: "Memory",
                  value: nodeData.memory || 0,
                  color: "#a855f7",
                },
                {
                  label: "Vote Consistency",
                  value: (nodeData.vote_consistency || 0) * 100,
                  color: "#00ff88",
                },
              ].map((m, i) => (
                <div key={i} className="bg-white/5 rounded-lg p-3">
                  <div className="flex justify-between text-xs mb-1.5">
                    <span className="text-[#64748b]">{m.label}</span>
                    <span style={{ color: m.color }}>
                      {m.value.toFixed(1)}%
                    </span>
                  </div>
                  <div className="w-full h-2 bg-white/5 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{
                        width: `${Math.min(100, m.value)}%`,
                        background: m.color,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

function severityToColor(sev) {
  return (
    { info: "#00aaff", warning: "#ffae00", critical: "#ff3366" }[sev] ||
    "#94a3b8"
  );
}
