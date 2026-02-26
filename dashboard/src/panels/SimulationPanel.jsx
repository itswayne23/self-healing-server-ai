import { useState } from "react";
import useStore from "../store/store";

export default function SimulationPanel() {
  const {
    simulate,
    clusterStatus,
    experimentMode,
    toggleExperimentMode,
    deterministicReplay,
    toggleDeterministic,
  } = useStore();
  const nodes = Object.keys(clusterStatus);
  const [selectedTarget, setSelectedTarget] = useState(nodes[0] || "node1");
  const [lastAction, setLastAction] = useState(null);

  const handleAction = (actionName, fn) => {
    fn();
    setLastAction({ name: actionName, time: new Date().toLocaleTimeString() });
  };

  const simActions = [
    {
      label: "Simulate Malicious Node",
      icon: "💀",
      color: "#ff3366",
      desc: "Mark node as compromised with trust=0.1",
      fn: () => simulate.maliciousNode(selectedTarget),
    },
    {
      label: "Network Partition",
      icon: "🌐",
      color: "#ff8800",
      desc: "Disconnect node from cluster mesh",
      fn: () => simulate.networkPartition(selectedTarget),
    },
    {
      label: "Inject Conflicting Votes",
      icon: "🗳️",
      color: "#a855f7",
      desc: "Create a case with conflicting votes and Byzantine flag",
      fn: () => simulate.conflictingVotes(),
    },
    {
      label: "Delay Heartbeat",
      icon: "💓",
      color: "#ffae00",
      desc: "Set heartbeat delay to 30s, latency to 999ms",
      fn: () => simulate.delayHeartbeat(selectedTarget),
    },
    {
      label: "Corrupt WAL",
      icon: "🔗",
      color: "#ff3366",
      desc: "Replace WAL hash with corrupted value",
      fn: () => simulate.corruptWAL(selectedTarget),
    },
    {
      label: "Trigger Recovery",
      icon: "🔄",
      color: "#00aaff",
      desc: "Start 8-stage recovery pipeline",
      fn: () => simulate.triggerRecovery(selectedTarget),
    },
    {
      label: "Force Trust Reset",
      icon: "🔧",
      color: "#06d6a0",
      desc: "Reset all trust scores to 0.5, clear strikes",
      fn: () => simulate.trustReset(selectedTarget),
    },
    {
      label: "Recalculate Quorum",
      icon: "📊",
      color: "#a855f7",
      desc: "Trigger adaptive quorum recalculation",
      fn: () => simulate.quorumRecalc(),
    },
  ];

  return (
    <div className="h-full overflow-y-auto space-y-4 pr-1">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-white">
            Simulation Control Panel
          </h2>
          <p className="text-xs text-[#64748b]">
            Inject faults and observe system behavior
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={toggleExperimentMode}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${experimentMode ? "bg-[#ff3366]/20 text-[#ff3366] border border-[#ff3366]/30" : "bg-white/5 text-[#64748b] border border-white/10"}`}
          >
            {experimentMode ? "🔴 Experiment ON" : "⚪ Experiment OFF"}
          </button>
          <button
            onClick={toggleDeterministic}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${deterministicReplay ? "bg-[#a855f7]/20 text-[#a855f7] border border-[#a855f7]/30" : "bg-white/5 text-[#64748b] border border-white/10"}`}
          >
            {deterministicReplay ? "🔁 Deterministic" : "🎲 Random"}
          </button>
        </div>
      </div>

      {/* Target Node Selector */}
      <div className="glass rounded-xl p-4">
        <h3 className="text-sm font-semibold text-white mb-3">Target Node</h3>
        <div className="flex gap-2 flex-wrap">
          {nodes.map((n) => (
            <button
              key={n}
              onClick={() => setSelectedTarget(n)}
              className={`px-3 py-2 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                selectedTarget === n
                  ? "bg-[#00aaff]/20 text-[#00aaff] border border-[#00aaff]/30"
                  : "bg-white/5 text-[#94a3b8] border border-white/10 hover:text-white"
              }`}
            >
              {n}
            </button>
          ))}
        </div>
      </div>

      {/* Action Buttons */}
      <div className="grid grid-cols-2 gap-3">
        {simActions.map((action, i) => (
          <button
            key={i}
            onClick={() => handleAction(action.label, action.fn)}
            disabled={!experimentMode}
            className={`glass rounded-xl p-4 text-left transition-all cursor-pointer group ${
              experimentMode
                ? "hover:bg-white/10 hover:scale-[1.02]"
                : "opacity-40 cursor-not-allowed"
            }`}
            style={{
              borderColor: experimentMode ? `${action.color}20` : "transparent",
              borderWidth: 1,
            }}
          >
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xl">{action.icon}</span>
              <span className="text-xs font-semibold text-white">
                {action.label}
              </span>
            </div>
            <p className="text-[10px] text-[#64748b] leading-relaxed">
              {action.desc}
            </p>
          </button>
        ))}
      </div>

      {!experimentMode && (
        <div className="glass rounded-xl p-4 border border-[#ffae00]/20 text-center">
          <span className="text-[#ffae00] text-sm">⚠️</span>
          <p className="text-xs text-[#ffae00] mt-1">
            Enable Experiment Mode in the top bar to activate simulation
            controls
          </p>
        </div>
      )}

      {/* Last Action */}
      {lastAction && (
        <div className="glass rounded-xl p-3 border border-[#00ff88]/20">
          <div className="flex items-center gap-2">
            <span className="text-[#00ff88]">✓</span>
            <span className="text-xs text-white">{lastAction.name}</span>
            <span className="text-[10px] text-[#64748b] ml-auto">
              {lastAction.time}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
