import { useMemo } from "react";
import {
  LineChart,
  Line,
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Cell,
  AreaChart,
  Area,
} from "recharts";
import useStore from "../store/store";
import { trustColor } from "../utils/export";

export default function MetricsPanel() {
  const { clusterMetrics, sparklineData, clusterStatus, clusterHealth } =
    useStore();
  const nodes = Object.keys(clusterStatus);

  const healthData = useMemo(() => {
    return nodes.map((n) => ({
      node: n,
      health: clusterHealth[n] || clusterStatus[n]?.health || 0,
      trust: clusterStatus[n]?.trust?.[n] || 0,
    }));
  }, [clusterHealth, clusterStatus, nodes]);

  const kpiCards = [
    {
      label: "Total Nodes",
      value: clusterMetrics.total_nodes,
      icon: "🖥️",
      color: "#00aaff",
      key: "total_nodes",
    },
    {
      label: "Healthy Nodes",
      value: clusterMetrics.healthy_nodes,
      icon: "✅",
      color: "#00ff88",
      key: "healthy_nodes",
    },
    {
      label: "Quorum Size",
      value: clusterMetrics.quorum_size,
      icon: "🗳️",
      color: "#a855f7",
      key: null,
    },
    {
      label: "Active Cases",
      value: clusterMetrics.active_cases,
      icon: "📋",
      color: "#ffae00",
      key: "active_cases",
    },
    {
      label: "Compromised",
      value: clusterMetrics.compromised_nodes,
      icon: "🚨",
      color: "#ff3366",
      key: "compromised_nodes",
    },
    {
      label: "Recovery Count",
      value: clusterMetrics.recovery_count,
      icon: "🔄",
      color: "#00aaff",
      key: null,
    },
    {
      label: "Avg Trust",
      value: (clusterMetrics.avg_trust || 0).toFixed(3),
      icon: "🛡️",
      color: trustColor(clusterMetrics.avg_trust),
      key: "avg_trust",
    },
    {
      label: "Health Index",
      value: (clusterMetrics.cluster_health_index || 0).toFixed(3),
      icon: "💚",
      color: trustColor(clusterMetrics.cluster_health_index),
      key: "cluster_health_index",
    },
  ];

  return (
    <div className="h-full overflow-y-auto space-y-4 pr-1">
      <div>
        <h2 className="text-lg font-bold text-white">Global Cluster Metrics</h2>
        <p className="text-xs text-[#64748b]">
          Real-time cluster-wide performance indicators with rolling trends
        </p>
      </div>

      {/* KPI Grid */}
      <div className="grid grid-cols-4 gap-3">
        {kpiCards.map((kpi, i) => (
          <div key={i} className="glass rounded-xl p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-lg">{kpi.icon}</span>
              {kpi.key && sparklineData[kpi.key]?.length > 2 && (
                <ResponsiveContainer width={50} height={20}>
                  <LineChart
                    data={sparklineData[kpi.key].map((v, j) => ({ j, v }))}
                  >
                    <Line
                      type="monotone"
                      dataKey="v"
                      stroke={kpi.color}
                      strokeWidth={1.5}
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>
            <span className="text-xl font-bold" style={{ color: kpi.color }}>
              {kpi.value}
            </span>
            <p className="text-[10px] text-[#64748b] mt-1">{kpi.label}</p>
          </div>
        ))}
      </div>

      {/* Health Distribution */}
      <div className="glass rounded-xl p-4">
        <h3 className="text-sm font-semibold text-white mb-3">
          Node Health vs Trust
        </h3>
        <ResponsiveContainer width="100%" height={250}>
          <BarChart data={healthData}>
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="rgba(255,255,255,0.05)"
            />
            <XAxis dataKey="node" stroke="#64748b" fontSize={10} />
            <YAxis domain={[0, 1]} stroke="#64748b" fontSize={10} />
            <Tooltip
              contentStyle={{
                background: "rgba(10,14,26,0.95)",
                border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: 8,
                fontSize: 11,
              }}
            />
            <Bar
              dataKey="health"
              name="Health"
              fill="#00aaff"
              opacity={0.7}
              radius={[4, 4, 0, 0]}
            />
            <Bar
              dataKey="trust"
              name="Trust"
              fill="#00ff88"
              opacity={0.7}
              radius={[4, 4, 0, 0]}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Trend Charts */}
      <div className="grid grid-cols-2 gap-4">
        <div className="glass rounded-xl p-4">
          <h3 className="text-sm font-semibold text-white mb-3">
            Avg Trust Trend
          </h3>
          <ResponsiveContainer width="100%" height={160}>
            <AreaChart
              data={(sparklineData.avg_trust || []).map((v, i) => ({ i, v }))}
            >
              <defs>
                <linearGradient id="trustGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#00ff88" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="#00ff88" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="rgba(255,255,255,0.05)"
              />
              <YAxis domain={[0, 1]} stroke="#64748b" fontSize={10} />
              <Tooltip
                contentStyle={{
                  background: "rgba(10,14,26,0.95)",
                  border: "1px solid rgba(255,255,255,0.1)",
                  borderRadius: 8,
                  fontSize: 11,
                }}
              />
              <Area
                type="monotone"
                dataKey="v"
                stroke="#00ff88"
                fill="url(#trustGrad)"
                strokeWidth={2}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="glass rounded-xl p-4">
          <h3 className="text-sm font-semibold text-white mb-3">
            Health Index Trend
          </h3>
          <ResponsiveContainer width="100%" height={160}>
            <AreaChart
              data={(sparklineData.cluster_health_index || []).map((v, i) => ({
                i,
                v,
              }))}
            >
              <defs>
                <linearGradient id="healthGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#00aaff" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="#00aaff" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="rgba(255,255,255,0.05)"
              />
              <YAxis domain={[0, 1]} stroke="#64748b" fontSize={10} />
              <Tooltip
                contentStyle={{
                  background: "rgba(10,14,26,0.95)",
                  border: "1px solid rgba(255,255,255,0.1)",
                  borderRadius: 8,
                  fontSize: 11,
                }}
              />
              <Area
                type="monotone"
                dataKey="v"
                stroke="#00aaff"
                fill="url(#healthGrad)"
                strokeWidth={2}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Per-Node Summary */}
      <div className="glass rounded-xl p-4">
        <h3 className="text-sm font-semibold text-white mb-3">
          Per-Node Summary
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-white/10">
                <th className="text-left py-2 text-[#64748b]">Node</th>
                <th className="text-center py-2 text-[#64748b]">Status</th>
                <th className="text-center py-2 text-[#64748b]">Trust</th>
                <th className="text-center py-2 text-[#64748b]">Health</th>
                <th className="text-center py-2 text-[#64748b]">Strikes</th>
                <th className="text-center py-2 text-[#64748b]">Cases</th>
                <th className="text-center py-2 text-[#64748b]">Role</th>
              </tr>
            </thead>
            <tbody>
              {Object.values(clusterStatus).map((n, i) => {
                const trust = n.trust?.[n.node] || 0;
                const strikes = n.strikes?.[n.node] || 0;
                return (
                  <tr
                    key={i}
                    className="border-b border-white/5 hover:bg-white/5"
                  >
                    <td className="py-2 text-white font-medium">{n.node}</td>
                    <td className="text-center py-2">
                      <span
                        className="text-[10px] px-1.5 py-0.5 rounded"
                        style={{
                          background: `${trustColor(trust)}20`,
                          color: trustColor(trust),
                        }}
                      >
                        {n.status}
                      </span>
                    </td>
                    <td
                      className="text-center py-2 font-mono"
                      style={{ color: trustColor(trust) }}
                    >
                      {trust.toFixed(3)}
                    </td>
                    <td
                      className="text-center py-2 font-mono"
                      style={{ color: trustColor(n.health || 0) }}
                    >
                      {(n.health || 0).toFixed(3)}
                    </td>
                    <td
                      className="text-center py-2"
                      style={{ color: strikes > 0 ? "#ff3366" : "#64748b" }}
                    >
                      {strikes}
                    </td>
                    <td className="text-center py-2 text-[#ffae00]">
                      {n.active_cases || 0}
                    </td>
                    <td className="text-center py-2 text-[#64748b]">
                      {n.role || "follower"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
