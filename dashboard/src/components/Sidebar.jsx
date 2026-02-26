import { motion } from "framer-motion";
import {
  FiGrid,
  FiActivity,
  FiShield,
  FiDatabase,
  FiRefreshCw,
  FiFileText,
  FiAlertTriangle,
  FiPlay,
  FiCpu,
  FiBarChart2,
  FiChevronLeft,
  FiChevronRight,
} from "react-icons/fi";
import useStore from "../store/store";

const NAV_ITEMS = [
  { id: "topology", icon: FiGrid, label: "Topology" },
  { id: "consensus", icon: FiActivity, label: "Consensus" },
  { id: "trust", icon: FiShield, label: "Trust Analytics" },
  { id: "wal", icon: FiDatabase, label: "WAL & State" },
  { id: "recovery", icon: FiRefreshCw, label: "Recovery" },
  { id: "forensic", icon: FiFileText, label: "Forensic Logs" },
  { id: "alerts", icon: FiAlertTriangle, label: "Alerts" },
  { id: "simulation", icon: FiPlay, label: "Simulation" },
  { id: "research", icon: FiCpu, label: "Research Mode" },
  { id: "metrics", icon: FiBarChart2, label: "Global Metrics" },
];

export default function Sidebar() {
  const {
    activePanel,
    setActivePanel,
    selectedNode,
    setSelectedNode,
    clusterStatus,
    sidebarCollapsed,
    toggleSidebar,
    connected,
    useMock,
  } = useStore();
  const nodes = Object.keys(clusterStatus);

  return (
    <motion.aside
      className={`h-full flex flex-col glass-bright z-30 transition-all duration-300 ${sidebarCollapsed ? "w-16" : "w-56"}`}
      initial={{ x: -100, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      transition={{ duration: 0.4 }}
    >
      {/* Header */}
      <div className="p-4 border-b border-white/5 flex items-center justify-between">
        {!sidebarCollapsed && (
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#00ff88] to-[#00aaff] flex items-center justify-center text-black font-bold text-sm">
              SC
            </div>
            <div>
              <h2 className="text-sm font-semibold text-white">Cluster SOC</h2>
              <span className="text-[10px] text-[#64748b]">v3.0.0</span>
            </div>
          </div>
        )}
        <button
          onClick={toggleSidebar}
          className="text-[#64748b] hover:text-white transition-colors p-1"
        >
          {sidebarCollapsed ? (
            <FiChevronRight size={16} />
          ) : (
            <FiChevronLeft size={16} />
          )}
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-2 px-2">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = activePanel === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setActivePanel(item.id)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg mb-0.5 transition-all duration-200 group cursor-pointer ${
                isActive
                  ? "bg-[#00ff88]/10 text-[#00ff88]"
                  : "text-[#94a3b8] hover:bg-white/5 hover:text-white"
              }`}
              title={sidebarCollapsed ? item.label : undefined}
            >
              <Icon
                size={18}
                className={
                  isActive
                    ? "text-[#00ff88]"
                    : "text-[#64748b] group-hover:text-white"
                }
              />
              {!sidebarCollapsed && (
                <span className="text-sm font-medium">{item.label}</span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Node Selector */}
      {!sidebarCollapsed && nodes.length > 0 && (
        <div className="px-3 py-2 border-t border-white/5">
          <label className="text-[10px] uppercase tracking-wider text-[#64748b] mb-1 block">
            Node Inspector
          </label>
          <select
            value={selectedNode || ""}
            onChange={(e) => setSelectedNode(e.target.value || null)}
            className="w-full bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-sm text-white outline-none focus:border-[#00ff88]/40"
          >
            <option value="">Select node...</option>
            {nodes.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Footer */}
      <div className="p-3 border-t border-white/5">
        <div className="flex items-center gap-2">
          <div
            className={`w-2 h-2 rounded-full ${connected || useMock ? "bg-[#00ff88] animate-pulse" : "bg-[#ff3366]"}`}
          />
          {!sidebarCollapsed && (
            <span className="text-xs text-[#94a3b8]">
              {useMock ? "Mock Mode" : connected ? "Connected" : "Disconnected"}
            </span>
          )}
        </div>
      </div>
    </motion.aside>
  );
}
