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
import { formatTimestamp, exportToCSV, exportToJSON } from "../utils/export";

export default function ConsensusPanel() {
  const { consensusCases, clusterStatus, researchMode } = useStore();
  const nodes = Object.keys(clusterStatus);

  const voteHeatmap = useMemo(() => {
    return consensusCases.slice(0, 10).map((c) => {
      const row = { case_id: c.case_id.slice(-6) };
      nodes.forEach((n) => {
        row[n] =
          c.votes?.[n] === "approve" ? 1 : c.votes?.[n] === "reject" ? -1 : 0;
      });
      return row;
    });
  }, [consensusCases, nodes]);

  const quorumHistory = useMemo(() => {
    return consensusCases.map((c, i) => ({
      idx: i,
      required: c.quorum_required,
      approves: Object.values(c.votes || {}).filter((v) => v === "approve")
        .length,
      total: Object.keys(c.votes || {}).length,
    }));
  }, [consensusCases]);

  return (
    <div className="h-full overflow-y-auto space-y-4 pr-1">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-white">Consensus Monitor</h2>
          <p className="text-xs text-[#64748b]">
            Byzantine-resilient voting, conflict detection, quorum tracking
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => exportToCSV(consensusCases, "consensus_history.csv")}
            className="px-3 py-1.5 rounded-lg bg-white/5 text-xs text-[#94a3b8] hover:text-white border border-white/10 cursor-pointer"
          >
            Export CSV
          </button>
          <button
            onClick={() => exportToJSON(consensusCases, "consensus.json")}
            className="px-3 py-1.5 rounded-lg bg-white/5 text-xs text-[#94a3b8] hover:text-white border border-white/10 cursor-pointer"
          >
            Export JSON
          </button>
        </div>
      </div>

      {/* Active Cases Table */}
      <div className="glass rounded-xl p-4">
        <h3 className="text-sm font-semibold text-white mb-3">Ongoing Cases</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-white/10">
                <th className="text-left py-2 px-2 text-[#64748b] font-medium">
                  Case ID
                </th>
                <th className="text-left py-2 px-2 text-[#64748b] font-medium">
                  Proposer
                </th>
                {nodes.map((n) => (
                  <th
                    key={n}
                    className="text-center py-2 px-2 text-[#64748b] font-medium"
                  >
                    {n}
                  </th>
                ))}
                <th className="text-center py-2 px-2 text-[#64748b] font-medium">
                  Confidence
                </th>
                <th className="text-center py-2 px-2 text-[#64748b] font-medium">
                  Quorum
                </th>
                <th className="text-center py-2 px-2 text-[#64748b] font-medium">
                  Decision
                </th>
                <th className="text-center py-2 px-2 text-[#64748b] font-medium">
                  Byzantine
                </th>
              </tr>
            </thead>
            <tbody>
              {consensusCases.slice(0, 10).map((c, i) => (
                <tr
                  key={i}
                  className="border-b border-white/5 hover:bg-white/5 transition-colors"
                >
                  <td className="py-2 px-2 font-mono text-[#00aaff]">
                    {c.case_id}
                  </td>
                  <td className="py-2 px-2 text-white">{c.proposer}</td>
                  {nodes.map((n) => {
                    const vote = c.votes?.[n];
                    const color =
                      vote === "approve"
                        ? "#00ff88"
                        : vote === "reject"
                          ? "#ff3366"
                          : "#64748b";
                    return (
                      <td key={n} className="text-center py-2 px-2">
                        <span
                          className="px-1.5 py-0.5 rounded text-[10px] font-medium"
                          style={{ background: `${color}20`, color }}
                        >
                          {vote || "—"}
                        </span>
                      </td>
                    );
                  })}
                  <td className="text-center py-2 px-2">
                    <span className="text-[#ffae00] font-medium">
                      {(c.confidence || 0).toFixed(2)}
                    </span>
                  </td>
                  <td className="text-center py-2 px-2 text-[#a855f7]">
                    {c.quorum_required}
                  </td>
                  <td className="text-center py-2 px-2">
                    <span
                      className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${c.decision === "approved" ? "bg-[#00ff88]/20 text-[#00ff88]" : "bg-[#ff3366]/20 text-[#ff3366]"}`}
                    >
                      {c.decision}
                    </span>
                  </td>
                  <td className="text-center py-2 px-2">
                    {c.byzantine_flag ? (
                      <span className="text-[#ff3366] font-bold">⚠️ YES</span>
                    ) : (
                      <span className="text-[#64748b]">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {/* Vote Heatmap */}
        <div className="glass rounded-xl p-4">
          <h3 className="text-sm font-semibold text-white mb-3">
            Vote Agreement Heatmap
          </h3>
          <div className="overflow-x-auto">
            <div className="min-w-max">
              <div className="flex gap-1 mb-1">
                <div className="w-14" />
                {nodes.map((n) => (
                  <div
                    key={n}
                    className="w-12 text-center text-[9px] text-[#64748b]"
                  >
                    {n}
                  </div>
                ))}
              </div>
              {voteHeatmap.map((row, i) => (
                <div key={i} className="flex gap-1 mb-1 items-center">
                  <div className="w-14 text-[9px] text-[#64748b] font-mono truncate">
                    {row.case_id}
                  </div>
                  {nodes.map((n) => {
                    const v = row[n];
                    const bg =
                      v === 1
                        ? "rgba(0,255,136,0.3)"
                        : v === -1
                          ? "rgba(255,51,102,0.3)"
                          : "rgba(255,255,255,0.05)";
                    return (
                      <div
                        key={n}
                        className="w-12 h-7 rounded"
                        style={{ background: bg }}
                      />
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
          <div className="flex gap-3 mt-2">
            <div className="flex items-center gap-1">
              <div
                className="w-3 h-3 rounded"
                style={{ background: "rgba(0,255,136,0.3)" }}
              />
              <span className="text-[9px] text-[#64748b]">Approve</span>
            </div>
            <div className="flex items-center gap-1">
              <div
                className="w-3 h-3 rounded"
                style={{ background: "rgba(255,51,102,0.3)" }}
              />
              <span className="text-[9px] text-[#64748b]">Reject</span>
            </div>
            <div className="flex items-center gap-1">
              <div
                className="w-3 h-3 rounded"
                style={{ background: "rgba(255,255,255,0.05)" }}
              />
              <span className="text-[9px] text-[#64748b]">Abstain</span>
            </div>
          </div>
        </div>

        {/* Quorum Size Graph */}
        <div className="glass rounded-xl p-4">
          <h3 className="text-sm font-semibold text-white mb-3">
            Quorum vs Approvals
          </h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={quorumHistory}>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="rgba(255,255,255,0.05)"
              />
              <XAxis dataKey="idx" stroke="#64748b" fontSize={10} />
              <YAxis stroke="#64748b" fontSize={10} />
              <Tooltip
                contentStyle={{
                  background: "rgba(10,14,26,0.95)",
                  border: "1px solid rgba(255,255,255,0.1)",
                  borderRadius: 8,
                  fontSize: 11,
                }}
              />
              <Bar
                dataKey="approves"
                fill="#00ff88"
                opacity={0.7}
                radius={[4, 4, 0, 0]}
                name="Approvals"
              />
              <Bar
                dataKey="required"
                fill="#a855f7"
                opacity={0.5}
                radius={[4, 4, 0, 0]}
                name="Required"
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Conflict Detection */}
      <div className="glass rounded-xl p-4">
        <h3 className="text-sm font-semibold text-white mb-3">
          Conflict & Anomaly Detection
        </h3>
        <div className="space-y-2">
          {consensusCases
            .filter(
              (c) => c.byzantine_flag || c.double_voting || c.vote_withholding,
            )
            .slice(0, 6)
            .map((c, i) => (
              <div
                key={i}
                className="flex items-center gap-3 bg-[#ff3366]/5 rounded-lg px-3 py-2 border border-[#ff3366]/10"
              >
                <span className="text-[#ff3366] text-sm">⚠️</span>
                <div className="flex-1">
                  <span className="text-xs font-mono text-[#00aaff]">
                    {c.case_id}
                  </span>
                  <div className="flex gap-2 mt-0.5">
                    {c.byzantine_flag && (
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-[#ff3366]/20 text-[#ff3366]">
                        Byzantine
                      </span>
                    )}
                    {c.double_voting && (
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-[#ffae00]/20 text-[#ffae00]">
                        Double Vote
                      </span>
                    )}
                    {c.vote_withholding && (
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-[#ff8800]/20 text-[#ff8800]">
                        Withheld
                      </span>
                    )}
                    {c.slow_responders?.length > 0 && (
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-[#64748b]/20 text-[#94a3b8]">
                        Slow: {c.slow_responders.join(", ")}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          {consensusCases.filter((c) => c.byzantine_flag).length === 0 && (
            <div className="text-center py-4 text-[#64748b] text-xs">
              No conflicts detected
            </div>
          )}
        </div>
      </div>

      {researchMode && (
        <div className="glass rounded-xl p-4 border border-[#a855f7]/20">
          <h3 className="text-sm font-semibold text-[#a855f7] mb-3">
            🔬 Consensus Algorithm Parameters
          </h3>
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: "Quorum Formula", value: "ceil((N+1)/2) + byz_adj" },
              { label: "Byzantine Tolerance", value: "f = floor((N-1)/3)" },
              { label: "Vote Timeout", value: "5000ms" },
              { label: "Confidence Threshold", value: "0.7" },
              { label: "Max Retries", value: "3" },
              { label: "Adaptive Quorum", value: "Enabled" },
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
