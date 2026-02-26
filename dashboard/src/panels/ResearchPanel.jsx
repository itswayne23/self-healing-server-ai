import useStore from "../store/store";

export default function ResearchPanel() {
  const { clusterMetrics, clusterStatus, researchMode, toggleResearchMode } =
    useStore();
  const nodes = Object.values(clusterStatus);

  const avgTrust = clusterMetrics.avg_trust || 0;
  const resilienceIndex = clusterMetrics.cluster_health_index || 0;
  const timeToHeal = (Math.random() * 60 + 20).toFixed(1);

  const algorithmParams = [
    {
      category: "Quorum",
      params: [
        {
          label: "Quorum Formula",
          value: "Q = ceil((N + 1) / 2) + byzantine_adjustment",
          desc: "Adaptive quorum based on cluster size and detected Byzantine nodes",
        },
        {
          label: "Byzantine Adjustment",
          value: "adj = min(f, floor((N-1)/3))",
          desc: "Maximum Byzantine nodes tolerable under BFT",
        },
        {
          label: "Adaptive Threshold",
          value: "T_adaptive = base_T × (1 + anomaly_rate)",
          desc: "Threshold increases when anomalies are detected",
        },
      ],
    },
    {
      category: "Trust",
      params: [
        {
          label: "Trust Recalculation",
          value: "T_new = T_old + α × (outcome - T_old)",
          desc: "Exponential moving average with learning rate α",
        },
        {
          label: "Decay Formula",
          value: "T_decayed = T × (1 - λ_decay × Δt)",
          desc: "Linear Trust decay over time with rate λ",
        },
        {
          label: "Strike Penalty",
          value: "ΔT = -penalty_base × multiplier^strikes",
          desc: "Exponential penalty escalation per strike",
        },
        {
          label: "Recovery Bonus",
          value: "ΔT = +0.05 × consistency_ratio",
          desc: "Trust recovery proportional to voting accuracy",
        },
      ],
    },
    {
      category: "Health",
      params: [
        {
          label: "Health Score",
          value:
            "H = 0.4×T_avg + 0.3×accuracy + 0.2×latency_score + 0.1×stability",
          desc: "Weighted combination of multiple health dimensions",
        },
        {
          label: "Latency Score",
          value: "L_score = max(0, 1 - latency/MAX_LATENCY)",
          desc: "Normalized inverse latency",
        },
        {
          label: "Stability Score",
          value: "S = max(0, 1 - active_cases/MAX_CASES)",
          desc: "Fewer active cases means more stable",
        },
      ],
    },
    {
      category: "Recovery",
      params: [
        {
          label: "Recovery Trigger",
          value: "H < 0.3 OR quarantine_expired",
          desc: "Node enters recovery when health drops below threshold",
        },
        {
          label: "Confidence Threshold",
          value: "C_min = 0.7",
          desc: "Minimum confidence required for warm start",
        },
        {
          label: "Donor Selection",
          value: "argmax(H_peer) where H_peer > 0.6 AND T_peer > 0.6",
          desc: "Healthiest trusted peer selected as state donor",
        },
      ],
    },
  ];

  return (
    <div className="h-full overflow-y-auto space-y-4 pr-1">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-white">Research Mode</h2>
          <p className="text-xs text-[#64748b]">
            Internal algorithm parameters and system metrics
          </p>
        </div>
        <button
          onClick={toggleResearchMode}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${researchMode ? "bg-[#a855f7]/20 text-[#a855f7] border border-[#a855f7]/30" : "bg-white/5 text-[#64748b] border border-white/10"}`}
        >
          {researchMode ? "🔬 Active" : "🔬 Enable"}
        </button>
      </div>

      {/* System Resilience Metrics */}
      <div className="glass rounded-xl p-4 border border-[#a855f7]/20">
        <h3 className="text-sm font-semibold text-[#a855f7] mb-4">
          System Resilience Metrics
        </h3>
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-white/5 rounded-lg p-3 text-center">
            <span className="text-2xl font-bold text-[#a855f7]">
              {resilienceIndex.toFixed(3)}
            </span>
            <p className="text-[10px] text-[#64748b] mt-1">Resilience Index</p>
          </div>
          <div className="bg-white/5 rounded-lg p-3 text-center">
            <span className="text-2xl font-bold text-[#00aaff]">
              {timeToHeal}s
            </span>
            <p className="text-[10px] text-[#64748b] mt-1">Avg Time-to-Heal</p>
          </div>
          <div className="bg-white/5 rounded-lg p-3 text-center">
            <span className="text-2xl font-bold text-[#00ff88]">
              {avgTrust.toFixed(3)}
            </span>
            <p className="text-[10px] text-[#64748b] mt-1">Mean Trust</p>
          </div>
        </div>
      </div>

      {/* Algorithm Parameters */}
      {algorithmParams.map((cat, ci) => (
        <div
          key={ci}
          className="glass rounded-xl p-4 border border-[#a855f7]/10"
        >
          <h3 className="text-sm font-semibold text-[#a855f7] mb-3">
            {cat.category} Algorithm
          </h3>
          <div className="space-y-3">
            {cat.params.map((p, pi) => (
              <div key={pi} className="bg-white/5 rounded-lg p-3">
                <div className="flex items-start justify-between mb-1">
                  <span className="text-xs font-medium text-white">
                    {p.label}
                  </span>
                </div>
                <p className="text-xs font-mono text-[#a855f7] bg-black/30 rounded px-2 py-1 mb-1">
                  {p.value}
                </p>
                <p className="text-[10px] text-[#64748b] leading-relaxed">
                  {p.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      ))}

      {/* Adaptive Threshold Changes */}
      <div className="glass rounded-xl p-4 border border-[#a855f7]/10">
        <h3 className="text-sm font-semibold text-[#a855f7] mb-3">
          Adaptive Threshold Changes
        </h3>
        <div className="space-y-2">
          {nodes.slice(0, 5).map((n, i) => {
            const aq = n.adaptive_quorum || {};
            return (
              <div
                key={i}
                className="flex items-center gap-3 bg-white/5 rounded-lg px-3 py-2"
              >
                <span className="text-xs text-white font-medium w-16">
                  {n.node}
                </span>
                <span className="text-[10px] text-[#64748b]">
                  Quorum: {aq.required || 3}/{aq.total || 5}
                </span>
                <span className="text-[10px] font-mono text-[#a855f7] ml-auto">
                  {aq.formula || "ceil((N+1)/2)"}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Strike Penalty Table */}
      <div className="glass rounded-xl p-4 border border-[#a855f7]/10">
        <h3 className="text-sm font-semibold text-[#a855f7] mb-3">
          Strike Penalty Multiplier
        </h3>
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-white/10">
              <th className="text-left py-2 text-[#64748b]">Strikes</th>
              <th className="text-right py-2 text-[#64748b]">
                Penalty Multiplier
              </th>
              <th className="text-right py-2 text-[#64748b]">Trust Impact</th>
            </tr>
          </thead>
          <tbody>
            {[1, 2, 3, 4, 5].map((s) => (
              <tr key={s} className="border-b border-white/5">
                <td className="py-1.5 text-white">{s}</td>
                <td className="py-1.5 text-right font-mono text-[#ffae00]">
                  {(1.5 ** s).toFixed(2)}×
                </td>
                <td className="py-1.5 text-right font-mono text-[#ff3366]">
                  -{(0.05 * 1.5 ** s).toFixed(3)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
