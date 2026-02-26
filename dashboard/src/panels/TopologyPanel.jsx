import { useMemo, useCallback } from "react";
import { motion } from "framer-motion";
import useStore from "../store/store";
import { statusColor, trustColor } from "../utils/export";

const STATUS_LABELS = {
  healthy: "Healthy",
  degraded: "Degraded",
  suspect: "Suspect",
  compromised: "Compromised",
  quarantined: "Quarantined",
  in_recovery: "In Recovery",
};

export default function TopologyPanel() {
  const { clusterStatus, setSelectedNode, researchMode } = useStore();
  const nodes = useMemo(() => Object.values(clusterStatus), [clusterStatus]);

  const handleNodeClick = useCallback(
    (nodeId) => {
      setSelectedNode(nodeId);
    },
    [setSelectedNode],
  );

  // Calculate layout positions in a circle
  const positions = useMemo(() => {
    const cx = 400,
      cy = 280,
      r = 180;
    return nodes.map((_, i) => {
      const angle = (2 * Math.PI * i) / nodes.length - Math.PI / 2;
      return { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) };
    });
  }, [nodes.length]);

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-bold text-white">Cluster Topology</h2>
          <p className="text-xs text-[#64748b]">
            Interactive network graph — click nodes to inspect
          </p>
        </div>
        <div className="flex items-center gap-3">
          {Object.entries(STATUS_LABELS).map(([key, label]) => (
            <div key={key} className="flex items-center gap-1.5">
              <div
                className="w-2 h-2 rounded-full"
                style={{ background: statusColor(key) }}
              />
              <span className="text-[10px] text-[#64748b]">{label}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="flex-1 glass rounded-2xl overflow-hidden relative min-h-0">
        <svg
          width="100%"
          height="100%"
          viewBox="0 0 800 560"
          className="select-none"
        >
          {/* Grid pattern */}
          <defs>
            <pattern
              id="grid"
              width="40"
              height="40"
              patternUnits="userSpaceOnUse"
            >
              <path
                d="M 40 0 L 0 0 0 40"
                fill="none"
                stroke="rgba(255,255,255,0.02)"
                strokeWidth="0.5"
              />
            </pattern>
            <filter id="glow">
              <feGaussianBlur stdDeviation="4" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            <filter id="redGlow">
              <feDropShadow
                dx="0"
                dy="0"
                stdDeviation="8"
                floodColor="#ff3366"
                floodOpacity="0.6"
              />
            </filter>
            <filter id="blueGlow">
              <feDropShadow
                dx="0"
                dy="0"
                stdDeviation="8"
                floodColor="#00aaff"
                floodOpacity="0.6"
              />
            </filter>
          </defs>
          <rect width="800" height="560" fill="url(#grid)" />

          {/* Connection lines */}
          {positions.map((p1, i) =>
            positions.map((p2, j) => {
              if (j <= i) return null;
              const n1 = nodes[i],
                n2 = nodes[j];
              const bothOnline = n1?.online !== false && n2?.online !== false;
              return (
                <line
                  key={`${i}-${j}`}
                  x1={p1.x}
                  y1={p1.y}
                  x2={p2.x}
                  y2={p2.y}
                  stroke={
                    bothOnline
                      ? "rgba(255,255,255,0.08)"
                      : "rgba(255,51,102,0.15)"
                  }
                  strokeWidth={bothOnline ? 1 : 1}
                  strokeDasharray={bothOnline ? undefined : "6 4"}
                />
              );
            }),
          )}

          {/* Nodes */}
          {nodes.map((node, i) => {
            const pos = positions[i];
            if (!pos) return null;
            const trust = node.trust?.[node.node] || 0;
            const color = statusColor(node.status);
            const isCompromised =
              node.status === "compromised" || node.status === "quarantined";
            const isRecovery =
              node.in_recovery || node.status === "in_recovery";

            return (
              <g
                key={node.node}
                onClick={() => handleNodeClick(node.node)}
                className="cursor-pointer"
              >
                {/* Outer pulse ring */}
                <circle
                  cx={pos.x}
                  cy={pos.y}
                  r={42}
                  fill="none"
                  stroke={color}
                  strokeWidth={1}
                  opacity={0.3}
                >
                  <animate
                    attributeName="r"
                    values="42;50;42"
                    dur="2s"
                    repeatCount="indefinite"
                  />
                  <animate
                    attributeName="opacity"
                    values="0.3;0;0.3"
                    dur="2s"
                    repeatCount="indefinite"
                  />
                </circle>

                {/* Trust ring */}
                <circle
                  cx={pos.x}
                  cy={pos.y}
                  r={36}
                  fill="none"
                  stroke={trustColor(trust)}
                  strokeWidth={3}
                  opacity={0.5}
                  strokeDasharray={`${trust * 226} ${(1 - trust) * 226}`}
                  strokeLinecap="round"
                  transform={`rotate(-90, ${pos.x}, ${pos.y})`}
                />

                {/* Main circle */}
                <circle
                  cx={pos.x}
                  cy={pos.y}
                  r={32}
                  fill="rgba(17,24,39,0.9)"
                  stroke={color}
                  strokeWidth={1.5}
                  filter={
                    isCompromised
                      ? "url(#redGlow)"
                      : isRecovery
                        ? "url(#blueGlow)"
                        : undefined
                  }
                />

                {/* Heartbeat indicator */}
                <circle cx={pos.x} cy={pos.y} r={4} fill={color} opacity={0.8}>
                  <animate
                    attributeName="r"
                    values="3;5;3"
                    dur="1.5s"
                    repeatCount="indefinite"
                  />
                  <animate
                    attributeName="opacity"
                    values="0.8;0.3;0.8"
                    dur="1.5s"
                    repeatCount="indefinite"
                  />
                </circle>

                {/* Node ID */}
                <text
                  x={pos.x}
                  y={pos.y - 6}
                  textAnchor="middle"
                  fill="white"
                  fontSize="11"
                  fontWeight="600"
                >
                  {node.node}
                </text>

                {/* Trust score */}
                <text
                  x={pos.x}
                  y={pos.y + 8}
                  textAnchor="middle"
                  fill={trustColor(trust)}
                  fontSize="10"
                  fontWeight="500"
                >
                  {trust.toFixed(2)}
                </text>

                {/* Status label below */}
                <text
                  x={pos.x}
                  y={pos.y + 50}
                  textAnchor="middle"
                  fill={color}
                  fontSize="9"
                  fontWeight="500"
                >
                  {STATUS_LABELS[node.status] || node.status}
                </text>

                {/* Role badge */}
                <rect
                  x={pos.x - 18}
                  y={pos.y - 50}
                  width={36}
                  height={14}
                  rx={7}
                  fill={`${color}30`}
                />
                <text
                  x={pos.x}
                  y={pos.y - 40}
                  textAnchor="middle"
                  fill={color}
                  fontSize="8"
                  fontWeight="600"
                >
                  {(node.role || "follower").toUpperCase().slice(0, 6)}
                </text>

                {/* Strike indicator */}
                {(node.strikes?.[node.node] || 0) > 0 && (
                  <>
                    <circle
                      cx={pos.x + 26}
                      cy={pos.y - 26}
                      r={8}
                      fill="#ff3366"
                    />
                    <text
                      x={pos.x + 26}
                      y={pos.y - 22}
                      textAnchor="middle"
                      fill="white"
                      fontSize="8"
                      fontWeight="bold"
                    >
                      {node.strikes[node.node]}
                    </text>
                  </>
                )}

                {/* Active cases badge */}
                {(node.active_cases || 0) > 0 && (
                  <>
                    <circle
                      cx={pos.x - 26}
                      cy={pos.y - 26}
                      r={8}
                      fill="#ffae00"
                    />
                    <text
                      x={pos.x - 26}
                      y={pos.y - 22}
                      textAnchor="middle"
                      fill="black"
                      fontSize="8"
                      fontWeight="bold"
                    >
                      {node.active_cases}
                    </text>
                  </>
                )}

                {researchMode && (
                  <text
                    x={pos.x}
                    y={pos.y + 62}
                    textAnchor="middle"
                    fill="#64748b"
                    fontSize="7"
                  >
                    QW:{node.quorum_weight || 0} | H:
                    {(node.health || 0).toFixed(2)}
                  </text>
                )}
              </g>
            );
          })}

          {/* Center cluster info */}
          <text
            x="400"
            y="275"
            textAnchor="middle"
            fill="rgba(255,255,255,0.15)"
            fontSize="12"
            fontWeight="500"
          >
            CLUSTER MESH
          </text>
          <text
            x="400"
            y="290"
            textAnchor="middle"
            fill="rgba(255,255,255,0.08)"
            fontSize="9"
          >
            {nodes.length} NODES ACTIVE
          </text>
        </svg>
      </div>
    </div>
  );
}
