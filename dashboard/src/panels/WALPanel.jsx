import { useMemo } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Cell,
} from "recharts";
import useStore from "../store/store";
import { trustColor, formatTimestamp } from "../utils/export";

export default function WALPanel() {
  const { walData, clusterStatus, researchMode } = useStore();
  const nodes = Object.keys(walData?.nodes || {});

  const walSizeData = useMemo(() => {
    return nodes.map((n) => ({
      node: n,
      size: (walData.nodes[n]?.size || 0) / 1024,
      entries: walData.nodes[n]?.entries || 0,
    }));
  }, [walData, nodes]);

  const hashComparison = useMemo(() => {
    return nodes.map((n) => ({
      node: n,
      hash: walData.nodes[n]?.hash || "—",
      matches: walData.nodes[n]?.hash === walData.majority_hash,
    }));
  }, [walData, nodes]);

  return (
    <div className="h-full overflow-y-auto space-y-4 pr-1">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-white">
            WAL & State Replication
          </h2>
          <p className="text-xs text-[#64748b]">
            Write-Ahead Log monitoring, snapshot comparison, integrity
            validation
          </p>
        </div>
      </div>

      {/* WAL Size Chart */}
      <div className="glass rounded-xl p-4">
        <h3 className="text-sm font-semibold text-white mb-3">
          WAL Size per Node (KB)
        </h3>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={walSizeData}>
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
            <Bar dataKey="size" radius={[4, 4, 0, 0]}>
              {walSizeData.map((_, i) => (
                <Cell
                  key={i}
                  fill={
                    ["#00ff88", "#00aaff", "#a855f7", "#ffae00", "#ff3366"][
                      i % 5
                    ]
                  }
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Node WAL Details */}
      <div className="grid grid-cols-1 gap-3">
        {nodes.map((n) => {
          const w = walData.nodes[n] || {};
          const match = w.hash === walData.majority_hash;
          return (
            <div
              key={n}
              className={`glass rounded-xl p-4 border ${match ? "border-white/5" : "border-[#ff3366]/30 glow-red"}`}
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-white">{n}</span>
                  {!match && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#ff3366]/20 text-[#ff3366] font-medium">
                      INTEGRITY MISMATCH
                    </span>
                  )}
                </div>
                <span className="text-[10px] text-[#64748b]">
                  {w.entries || 0} entries
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="bg-white/5 rounded-lg px-3 py-2">
                  <span className="text-[#64748b]">Size</span>
                  <p className="text-white font-medium">
                    {((w.size || 0) / 1024).toFixed(1)} KB
                  </p>
                </div>
                <div className="bg-white/5 rounded-lg px-3 py-2">
                  <span className="text-[#64748b]">Growth Rate</span>
                  <p className="text-white font-medium">
                    {(w.growth_rate || 0).toFixed(1)} B/s
                  </p>
                </div>
                <div className="bg-white/5 rounded-lg px-3 py-2">
                  <span className="text-[#64748b]">Snapshot Freq</span>
                  <p className="text-white font-medium">
                    {w.snapshot_frequency || 0}s
                  </p>
                </div>
                <div className="bg-white/5 rounded-lg px-3 py-2">
                  <span className="text-[#64748b]">Last Snapshot</span>
                  <p className="text-white font-medium">
                    {formatTimestamp(w.last_snapshot)}
                  </p>
                </div>
                <div className="bg-white/5 rounded-lg px-3 py-2 col-span-2">
                  <span className="text-[#64748b]">Hash</span>
                  <p
                    className={`font-mono text-xs ${match ? "text-[#00ff88]" : "text-[#ff3366]"}`}
                  >
                    {w.hash || "N/A"}
                  </p>
                </div>
                <div className="bg-white/5 rounded-lg px-3 py-2">
                  <span className="text-[#64748b]">Restore Attempts</span>
                  <p className="text-white font-medium">
                    {w.restore_attempts || 0}
                  </p>
                </div>
                <div className="bg-white/5 rounded-lg px-3 py-2">
                  <span className="text-[#64748b]">Success / Fail</span>
                  <p className="text-white font-medium">
                    <span className="text-[#00ff88]">
                      {w.restore_success || 0}
                    </span>{" "}
                    /{" "}
                    <span className="text-[#ff3366]">
                      {w.restore_failure || 0}
                    </span>
                  </p>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* State Divergence */}
      <div className="glass rounded-xl p-4">
        <h3 className="text-sm font-semibold text-white mb-3">
          State Hash Comparison
        </h3>
        <div className="bg-white/5 rounded-lg px-3 py-2 mb-3">
          <span className="text-[10px] text-[#64748b]">Majority Hash</span>
          <p className="text-xs font-mono text-[#00ff88]">
            {walData.majority_hash || "N/A"}
          </p>
        </div>
        <div className="space-y-1.5">
          {hashComparison.map((h, i) => (
            <div
              key={i}
              className="flex items-center gap-3 bg-white/5 rounded-lg px-3 py-2"
            >
              <span className="text-xs text-white font-medium w-16">
                {h.node}
              </span>
              <span
                className={`text-xs font-mono flex-1 ${h.matches ? "text-[#00ff88]" : "text-[#ff3366]"}`}
              >
                {h.hash}
              </span>
              <span
                className={`text-[10px] px-1.5 py-0.5 rounded ${h.matches ? "bg-[#00ff88]/20 text-[#00ff88]" : "bg-[#ff3366]/20 text-[#ff3366]"}`}
              >
                {h.matches ? "✓ Match" : "✗ Diverged"}
              </span>
            </div>
          ))}
        </div>
      </div>

      {researchMode && (
        <div className="glass rounded-xl p-4 border border-[#a855f7]/20">
          <h3 className="text-sm font-semibold text-[#a855f7] mb-3">
            🔬 WAL Algorithm Parameters
          </h3>
          <div className="grid grid-cols-2 gap-3 text-xs">
            {[
              { label: "Compaction Threshold", value: "1000 entries" },
              { label: "Snapshot Interval", value: "60s" },
              { label: "Hash Algorithm", value: "SHA-256" },
              { label: "Replay Strategy", value: "Sequential" },
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
