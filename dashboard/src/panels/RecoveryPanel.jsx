import useStore from "../store/store";
import {
  formatTimestamp,
  formatDuration,
  statusColor,
  exportToJSON,
} from "../utils/export";

const STAGES = [
  "detection",
  "isolation",
  "quarantine",
  "state_sync_request",
  "wal_replay",
  "hash_verification",
  "trust_recalibration",
  "reintegration",
];
const STAGE_LABELS = {
  detection: "Detection",
  isolation: "Isolation",
  quarantine: "Quarantine",
  state_sync_request: "State Sync",
  wal_replay: "WAL Replay",
  hash_verification: "Hash Verify",
  trust_recalibration: "Trust Recalib.",
  reintegration: "Reintegration",
};

export default function RecoveryPanel() {
  const { recoveryData, clusterStatus, researchMode } = useStore();
  const recoveryNodes = Object.keys(recoveryData);

  return (
    <div className="h-full overflow-y-auto space-y-4 pr-1">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-white">Autonomous Recovery</h2>
          <p className="text-xs text-[#64748b]">
            Staged recovery workflow, progress tracking, validation status
          </p>
        </div>
        <button
          onClick={() => exportToJSON(recoveryData, "recovery_metrics.json")}
          className="px-3 py-1.5 rounded-lg bg-white/5 text-xs text-[#94a3b8] hover:text-white border border-white/10 cursor-pointer"
        >
          Export
        </button>
      </div>

      {recoveryNodes.length === 0 && (
        <div className="glass rounded-xl p-8 text-center">
          <div className="text-3xl mb-3">✅</div>
          <h3 className="text-white font-semibold mb-1">All Nodes Healthy</h3>
          <p className="text-xs text-[#64748b]">No active recovery processes</p>
        </div>
      )}

      {recoveryNodes.map((nodeId) => {
        const rec = recoveryData[nodeId];
        const completedStages = rec.stages.filter((s) => s.completed).length;
        const progress = (completedStages / rec.stages.length) * 100;

        return (
          <div
            key={nodeId}
            className="glass rounded-xl p-4 border border-[#00aaff]/20 glow-blue"
          >
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-[#00aaff]/20 flex items-center justify-center">
                  <span className="text-[#00aaff] text-lg">🔄</span>
                </div>
                <div>
                  <h3 className="text-white font-semibold">{nodeId}</h3>
                  <span className="text-[10px] text-[#64748b]">
                    Recovery in progress • {completedStages}/{rec.stages.length}{" "}
                    stages
                  </span>
                </div>
              </div>
              <div className="text-right">
                <span className="text-xs text-[#00aaff] font-medium">
                  {progress.toFixed(0)}%
                </span>
                <div className="w-24 h-1.5 bg-white/10 rounded-full mt-1">
                  <div
                    className="h-full bg-[#00aaff] rounded-full transition-all duration-500"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>
            </div>

            {/* Stage Progress */}
            <div className="relative pl-6 space-y-0">
              {rec.stages.map((stage, i) => (
                <div key={i} className="relative pb-4">
                  {/* Connecting line */}
                  {i < rec.stages.length - 1 && (
                    <div
                      className={`absolute left-[-14px] top-6 w-0.5 h-full ${stage.completed ? "bg-[#00ff88]" : "bg-white/10"}`}
                    />
                  )}

                  <div className="flex items-center gap-3">
                    {/* Stage indicator */}
                    <div
                      className={`absolute left-[-18px] w-4 h-4 rounded-full flex items-center justify-center text-[8px] font-bold ${
                        stage.completed
                          ? "bg-[#00ff88] text-black"
                          : stage.active
                            ? "bg-[#00aaff] text-white animate-pulse"
                            : "bg-white/10 text-[#64748b]"
                      }`}
                    >
                      {stage.completed ? "✓" : i + 1}
                    </div>

                    <div className="flex-1 flex items-center justify-between">
                      <span
                        className={`text-xs font-medium ${stage.completed ? "text-[#00ff88]" : stage.active ? "text-[#00aaff]" : "text-[#64748b]"}`}
                      >
                        {STAGE_LABELS[stage.stage] || stage.stage}
                      </span>
                      {stage.timestamp && (
                        <span className="text-[10px] text-[#64748b]">
                          {formatTimestamp(stage.timestamp)}
                        </span>
                      )}
                      {stage.active && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#00aaff]/20 text-[#00aaff]">
                          Active
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Recovery Details */}
            <div className="grid grid-cols-2 gap-2 mt-3 text-xs">
              <div className="bg-white/5 rounded-lg px-3 py-2">
                <span className="text-[#64748b]">Recovery Time</span>
                <p className="text-white font-medium">
                  {rec.recovery_time
                    ? `${rec.recovery_time.toFixed(1)}s`
                    : "In progress"}
                </p>
              </div>
              <div className="bg-white/5 rounded-lg px-3 py-2">
                <span className="text-[#64748b]">Sync Source</span>
                <p className="text-white font-medium">{rec.sync_source}</p>
              </div>
              <div className="bg-white/5 rounded-lg px-3 py-2">
                <span className="text-[#64748b]">Validation</span>
                <p
                  className={
                    rec.validation_success
                      ? "text-[#00ff88] font-medium"
                      : "text-[#ffae00] font-medium"
                  }
                >
                  {rec.validation_success ? "Success" : "Pending"}
                </p>
              </div>
              <div className="bg-white/5 rounded-lg px-3 py-2">
                <span className="text-[#64748b]">Rollback Count</span>
                <p className="text-white font-medium">{rec.rollback_count}</p>
              </div>
            </div>
          </div>
        );
      })}

      {researchMode && (
        <div className="glass rounded-xl p-4 border border-[#a855f7]/20">
          <h3 className="text-sm font-semibold text-[#a855f7] mb-3">
            🔬 Recovery Algorithm Parameters
          </h3>
          <div className="grid grid-cols-2 gap-3 text-xs">
            {[
              { label: "Max Recovery Time", value: "120s" },
              { label: "Confidence Threshold", value: "0.7" },
              { label: "Min Peer State", value: "1 peer" },
              { label: "Sync Interval", value: "5s" },
              { label: "Time-to-Heal (avg)", value: "45s" },
              { label: "Resilience Index", value: "0.85" },
            ].map((p, i) => (
              <div key={i} className="bg-white/5 rounded-lg px-3 py-2">
                <span className="text-[#64748b]">{p.label}</span>
                <p className="font-mono text-[#a855f7]">{p.value}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
