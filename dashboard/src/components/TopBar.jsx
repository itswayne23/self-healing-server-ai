import { useMemo } from "react";
import { LineChart, Line, ResponsiveContainer } from "recharts";
import useStore from "../store/store";
import { trustColor } from "../utils/export";

function Sparkline({ data, color = "#00ff88", height = 24 }) {
  const chartData = data.map((v, i) => ({ i, v }));
  return (
    <ResponsiveContainer width={60} height={height}>
      <LineChart data={chartData}>
        <Line
          type="monotone"
          dataKey="v"
          stroke={color}
          strokeWidth={1.5}
          dot={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

export default function TopBar() {
  const {
    clusterMetrics,
    sparklineData,
    useMock,
    toggleMock,
    researchMode,
    toggleResearchMode,
    experimentMode,
    toggleExperimentMode,
  } = useStore();

  const kpis = useMemo(
    () => [
      {
        label: "Total Nodes",
        value: clusterMetrics.total_nodes,
        key: "total_nodes",
        color: "#00aaff",
      },
      {
        label: "Healthy",
        value: clusterMetrics.healthy_nodes,
        key: "healthy_nodes",
        color: "#00ff88",
      },
      {
        label: "Quorum",
        value: clusterMetrics.quorum_size,
        key: null,
        color: "#a855f7",
      },
      {
        label: "Active Cases",
        value: clusterMetrics.active_cases,
        key: "active_cases",
        color: "#ffae00",
      },
      {
        label: "Compromised",
        value: clusterMetrics.compromised_nodes,
        key: "compromised_nodes",
        color: "#ff3366",
      },
      {
        label: "Avg Trust",
        value: (clusterMetrics.avg_trust || 0).toFixed(2),
        key: "avg_trust",
        color: trustColor(clusterMetrics.avg_trust),
      },
      {
        label: "Health Index",
        value: (clusterMetrics.cluster_health_index || 0).toFixed(2),
        key: "cluster_health_index",
        color: trustColor(clusterMetrics.cluster_health_index),
      },
    ],
    [clusterMetrics],
  );

  return (
    <header className="h-14 glass-bright border-b border-white/5 flex items-center justify-between px-4 z-20 shrink-0">
      {/* KPIs */}
      <div className="flex items-center gap-4 overflow-x-auto">
        {kpis.map((kpi) => (
          <div key={kpi.label} className="flex items-center gap-2 shrink-0">
            <div className="flex flex-col">
              <span className="text-[10px] uppercase tracking-wider text-[#64748b]">
                {kpi.label}
              </span>
              <span className="text-sm font-bold" style={{ color: kpi.color }}>
                {kpi.value}
              </span>
            </div>
            {kpi.key && sparklineData[kpi.key]?.length > 2 && (
              <Sparkline data={sparklineData[kpi.key]} color={kpi.color} />
            )}
          </div>
        ))}
      </div>

      {/* Controls */}
      <div className="flex items-center gap-2 shrink-0">
        <button
          onClick={toggleExperimentMode}
          className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all cursor-pointer ${experimentMode ? "bg-[#ff3366]/20 text-[#ff3366] border border-[#ff3366]/30" : "bg-white/5 text-[#64748b] border border-white/10 hover:text-white"}`}
        >
          🧪 Experiment
        </button>
        <button
          onClick={toggleResearchMode}
          className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all cursor-pointer ${researchMode ? "bg-[#a855f7]/20 text-[#a855f7] border border-[#a855f7]/30" : "bg-white/5 text-[#64748b] border border-white/10 hover:text-white"}`}
        >
          🔬 Research
        </button>
        <button
          onClick={toggleMock}
          className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all cursor-pointer ${useMock ? "bg-[#00aaff]/20 text-[#00aaff] border border-[#00aaff]/30" : "bg-white/5 text-[#64748b] border border-white/10 hover:text-white"}`}
        >
          {useMock ? "📡 Mock" : "🌐 Live"}
        </button>
        <div className="flex items-center gap-1.5 ml-2">
          <div className="w-2 h-2 rounded-full bg-[#00ff88] animate-pulse" />
          <span className="text-[10px] text-[#64748b]">LIVE</span>
        </div>
      </div>
    </header>
  );
}
