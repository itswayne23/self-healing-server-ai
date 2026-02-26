import { useMemo } from "react";
import useStore from "../store/store";
import { formatTimestamp, severityColor } from "../utils/export";

const CATEGORY_ICONS = {
  byzantine_detection: "🔍",
  trust_below_threshold: "📉",
  strike_limit_reached: "⚡",
  node_isolation: "🔒",
  hash_mismatch: "🔗",
  network_partition: "🌐",
  consensus_failure: "🗳️",
  recovery_failure: "🔄",
};

export default function AlertsPanel() {
  const { alerts, alertHistory, acknowledgeAlert, acknowledgedAlerts } =
    useStore();

  const categoryCounts = useMemo(() => {
    const counts = {};
    alerts.forEach((a) => {
      counts[a.category] = (counts[a.category] || 0) + 1;
    });
    return counts;
  }, [alerts]);

  const severityCounts = useMemo(() => {
    const counts = { info: 0, warning: 0, critical: 0 };
    alerts.forEach((a) => {
      counts[a.severity] = (counts[a.severity] || 0) + 1;
    });
    return counts;
  }, [alerts]);

  const sortedAlerts = useMemo(() => {
    const sevOrder = { critical: 0, warning: 1, info: 2 };
    return [...alerts].sort(
      (a, b) => (sevOrder[a.severity] || 2) - (sevOrder[b.severity] || 2),
    );
  }, [alerts]);

  return (
    <div className="h-full overflow-y-auto space-y-4 pr-1">
      <div>
        <h2 className="text-lg font-bold text-white">Real-Time Alert Engine</h2>
        <p className="text-xs text-[#64748b]">
          {
            alerts.filter(
              (a) => !a.acknowledged && !acknowledgedAlerts.has(a.id),
            ).length
          }{" "}
          unacknowledged alerts
        </p>
      </div>

      {/* Severity Summary */}
      <div className="grid grid-cols-3 gap-3">
        {[
          {
            label: "Critical",
            count: severityCounts.critical,
            color: "#ff3366",
          },
          { label: "Warning", count: severityCounts.warning, color: "#ffae00" },
          { label: "Info", count: severityCounts.info, color: "#00aaff" },
        ].map((s, i) => (
          <div
            key={i}
            className="glass rounded-xl p-3 text-center"
            style={{ borderColor: `${s.color}30`, borderWidth: 1 }}
          >
            <span className="text-2xl font-bold" style={{ color: s.color }}>
              {s.count}
            </span>
            <p className="text-[10px] text-[#64748b] mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Severity Heatmap Grid */}
      <div className="glass rounded-xl p-4">
        <h3 className="text-sm font-semibold text-white mb-3">
          Category Heatmap
        </h3>
        <div className="grid grid-cols-4 gap-2">
          {Object.entries(CATEGORY_ICONS).map(([cat, icon]) => {
            const count = categoryCounts[cat] || 0;
            const intensity = Math.min(1, count / 5);
            return (
              <div
                key={cat}
                className="rounded-lg p-2.5 text-center transition-all"
                style={{
                  background: `rgba(255, 51, 102, ${intensity * 0.3})`,
                  border: `1px solid rgba(255, 51, 102, ${intensity * 0.2})`,
                }}
              >
                <span className="text-lg">{icon}</span>
                <p className="text-[9px] text-[#94a3b8] mt-1">
                  {cat.replace(/_/g, " ")}
                </p>
                <span className="text-sm font-bold text-white">{count}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Alert List */}
      <div className="glass rounded-xl p-4">
        <h3 className="text-sm font-semibold text-white mb-3">Active Alerts</h3>
        <div className="space-y-2 max-h-80 overflow-y-auto">
          {sortedAlerts.map((alert, i) => {
            const isAcked =
              alert.acknowledged || acknowledgedAlerts.has(alert.id);
            return (
              <div
                key={alert.id || i}
                className={`rounded-lg px-3 py-2.5 border transition-all ${
                  isAcked
                    ? "bg-white/5 border-white/5 opacity-60"
                    : `bg-white/5 border-l-2`
                }`}
                style={
                  !isAcked
                    ? { borderLeftColor: severityColor(alert.severity) }
                    : undefined
                }
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-sm">
                      {CATEGORY_ICONS[alert.category] || "⚠️"}
                    </span>
                    <span
                      className="text-[10px] px-1.5 py-0.5 rounded font-medium"
                      style={{
                        background: `${severityColor(alert.severity)}20`,
                        color: severityColor(alert.severity),
                      }}
                    >
                      {alert.severity}
                    </span>
                    <span className="text-xs text-white">{alert.message}</span>
                  </div>
                  {!isAcked && (
                    <button
                      onClick={() => acknowledgeAlert(alert.id)}
                      className="text-[10px] px-2 py-1 rounded bg-white/10 text-[#94a3b8] hover:text-white hover:bg-white/20 cursor-pointer"
                    >
                      ACK
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-[10px] text-[#64748b]">
                    {alert.node}
                  </span>
                  <span className="text-[10px] text-[#64748b]">•</span>
                  <span className="text-[10px] text-[#64748b]">
                    {formatTimestamp(alert.time)}
                  </span>
                  {isAcked && (
                    <span className="text-[10px] text-[#00ff88]">
                      ✓ Acknowledged
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Alert History */}
      <div className="glass rounded-xl p-4">
        <h3 className="text-sm font-semibold text-white mb-3">
          Alert History ({alertHistory.length})
        </h3>
        <div className="space-y-1 max-h-48 overflow-y-auto">
          {alertHistory
            .slice(-20)
            .reverse()
            .map((a, i) => (
              <div
                key={i}
                className="flex items-center gap-2 text-[10px] py-1 border-b border-white/5"
              >
                <span style={{ color: severityColor(a.severity) }}>●</span>
                <span className="text-[#94a3b8] flex-1 truncate">
                  {a.message}
                </span>
                <span className="text-[#64748b]">
                  {formatTimestamp(a.time)}
                </span>
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}
