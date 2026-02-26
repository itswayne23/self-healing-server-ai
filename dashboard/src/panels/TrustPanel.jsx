import { useMemo } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  BarChart,
  Bar,
  Cell,
  AreaChart,
  Area,
} from "recharts";
import useStore from "../store/store";
import { trustColor, formatTimestamp } from "../utils/export";
import { exportToCSV, exportToJSON } from "../utils/export";

const NODE_COLORS = ["#00ff88", "#00aaff", "#a855f7", "#ffae00", "#ff3366"];

export default function TrustPanel() {
  const { clusterStatus, trustHistory, researchMode } = useStore();
  const nodes = Object.keys(clusterStatus);

  const trustOverTime = useMemo(() => {
    const allTimes = new Set();
    Object.values(trustHistory).forEach((hist) =>
      hist.forEach((p) => allTimes.add(p.time)),
    );
    const sorted = [...allTimes].sort();
    return sorted.map((t) => {
      const point = { time: formatTimestamp(t) };
      Object.entries(trustHistory).forEach(([nodeId, hist]) => {
        const match = hist.find((p) => p.time === t);
        point[nodeId] = match?.trust || null;
      });
      return point;
    });
  }, [trustHistory]);

  const trustDistribution = useMemo(() => {
    const buckets = Array.from({ length: 10 }, (_, i) => ({
      range: `${(i * 0.1).toFixed(1)}-${((i + 1) * 0.1).toFixed(1)}`,
      count: 0,
    }));
    Object.values(clusterStatus).forEach((n) => {
      const t = n.trust?.[n.node] || 0;
      const idx = Math.min(9, Math.floor(t * 10));
      buckets[idx].count++;
    });
    return buckets;
  }, [clusterStatus]);

  const strikeCorrelation = useMemo(() => {
    return Object.values(clusterStatus).map((n) => ({
      node: n.node,
      trust: n.trust?.[n.node] || 0,
      strikes: n.strikes?.[n.node] || 0,
    }));
  }, [clusterStatus]);

  const trustEvents = useMemo(() => {
    const events = [];
    Object.entries(trustHistory).forEach(([nodeId, hist]) => {
      hist
        .filter((p) => p.event)
        .forEach((p) => {
          events.push({
            node: nodeId,
            event: p.event,
            trust: p.trust,
            time: p.time,
          });
        });
    });
    return events.sort((a, b) => b.time - a.time).slice(0, 20);
  }, [trustHistory]);

  return (
    <div className="h-full overflow-y-auto space-y-4 pr-1">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-white">
            Trust Analytics Engine
          </h2>
          <p className="text-xs text-[#64748b]">
            Trust evolution, decay curves, anomaly detection
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => exportToCSV(strikeCorrelation, "trust_data.csv")}
            className="px-3 py-1.5 rounded-lg bg-white/5 text-xs text-[#94a3b8] hover:text-white border border-white/10 cursor-pointer"
          >
            Export CSV
          </button>
          <button
            onClick={() => exportToJSON(trustHistory, "trust_timeline.json")}
            className="px-3 py-1.5 rounded-lg bg-white/5 text-xs text-[#94a3b8] hover:text-white border border-white/10 cursor-pointer"
          >
            Export JSON
          </button>
        </div>
      </div>

      {/* Trust Over Time */}
      <div className="glass rounded-xl p-4">
        <h3 className="text-sm font-semibold text-white mb-3">
          Trust Score Over Time (Per Node)
        </h3>
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={trustOverTime}>
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="rgba(255,255,255,0.05)"
            />
            <XAxis
              dataKey="time"
              stroke="#64748b"
              fontSize={9}
              interval="preserveStartEnd"
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
            {nodes.map((nodeId, i) => (
              <Line
                key={nodeId}
                type="monotone"
                dataKey={nodeId}
                stroke={NODE_COLORS[i % NODE_COLORS.length]}
                strokeWidth={2}
                dot={false}
                connectNulls
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
        <div className="flex gap-4 mt-2">
          {nodes.map((n, i) => (
            <div key={n} className="flex items-center gap-1.5">
              <div
                className="w-3 h-0.5 rounded"
                style={{ background: NODE_COLORS[i % NODE_COLORS.length] }}
              />
              <span className="text-[10px] text-[#64748b]">{n}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {/* Trust Distribution */}
        <div className="glass rounded-xl p-4">
          <h3 className="text-sm font-semibold text-white mb-3">
            Trust Distribution
          </h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={trustDistribution}>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="rgba(255,255,255,0.05)"
              />
              <XAxis
                dataKey="range"
                stroke="#64748b"
                fontSize={8}
                angle={-45}
                textAnchor="end"
                height={50}
              />
              <YAxis stroke="#64748b" fontSize={10} />
              <Tooltip
                contentStyle={{
                  background: "rgba(10,14,26,0.95)",
                  border: "1px solid rgba(255,255,255,0.1)",
                  borderRadius: 8,
                  fontSize: 11,
                }}
              />
              <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                {trustDistribution.map((_, i) => (
                  <Cell key={i} fill={trustColor(i * 0.1 + 0.05)} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Strike vs Trust Correlation */}
        <div className="glass rounded-xl p-4">
          <h3 className="text-sm font-semibold text-white mb-3">
            Strike vs Trust
          </h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={strikeCorrelation}>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="rgba(255,255,255,0.05)"
              />
              <XAxis dataKey="node" stroke="#64748b" fontSize={10} />
              <YAxis
                yAxisId="trust"
                domain={[0, 1]}
                stroke="#00ff88"
                fontSize={10}
              />
              <YAxis
                yAxisId="strikes"
                orientation="right"
                stroke="#ff3366"
                fontSize={10}
              />
              <Tooltip
                contentStyle={{
                  background: "rgba(10,14,26,0.95)",
                  border: "1px solid rgba(255,255,255,0.1)",
                  borderRadius: 8,
                  fontSize: 11,
                }}
              />
              <Bar
                yAxisId="trust"
                dataKey="trust"
                fill="#00ff88"
                opacity={0.6}
                radius={[4, 4, 0, 0]}
              />
              <Bar
                yAxisId="strikes"
                dataKey="strikes"
                fill="#ff3366"
                opacity={0.6}
                radius={[4, 4, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Trust Events */}
      <div className="glass rounded-xl p-4">
        <h3 className="text-sm font-semibold text-white mb-3">
          Trust Events & Anomaly Markers
        </h3>
        <div className="space-y-1.5 max-h-48 overflow-y-auto">
          {trustEvents.map((e, i) => (
            <div
              key={i}
              className="flex items-center gap-3 bg-white/5 rounded-lg px-3 py-2"
            >
              <span
                className={`text-xs font-semibold ${e.event === "threshold_breach" ? "text-[#ff3366]" : e.event === "isolation" ? "text-[#ffae00]" : e.event === "reintegration" ? "text-[#00ff88]" : "text-[#00aaff]"}`}
              >
                {e.event === "threshold_breach"
                  ? "⚠️"
                  : e.event === "isolation"
                    ? "🔒"
                    : e.event === "reintegration"
                      ? "✅"
                      : "🔄"}
              </span>
              <span className="text-xs text-white font-medium">{e.node}</span>
              <span className="text-xs text-[#94a3b8]">
                {e.event?.replace(/_/g, " ")}
              </span>
              <span className="text-xs text-[#64748b] ml-auto">
                {formatTimestamp(e.time)}
              </span>
              <span
                className="text-xs font-mono"
                style={{ color: trustColor(e.trust) }}
              >
                {e.trust?.toFixed(3)}
              </span>
            </div>
          ))}
        </div>
      </div>

      {researchMode && (
        <div className="glass rounded-xl p-4 border border-[#a855f7]/20">
          <h3 className="text-sm font-semibold text-[#a855f7] mb-3">
            🔬 Trust Algorithm Parameters
          </h3>
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: "Trust Decay Rate", value: "0.001/cycle" },
              { label: "Recovery Bonus", value: "+0.05 on success" },
              { label: "Strike Penalty", value: "-0.15 per strike" },
              { label: "Min Trust Threshold", value: "0.2" },
              { label: "Isolation Threshold", value: "0.3" },
              { label: "Reintegration Min", value: "0.5" },
            ].map((p, i) => (
              <div key={i} className="bg-white/5 rounded-lg px-3 py-2">
                <span className="text-[10px] text-[#64748b]">{p.label}</span>
                <p className="text-sm font-mono text-[#a855f7]">{p.value}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
