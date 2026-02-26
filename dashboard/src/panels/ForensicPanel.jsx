import { useState, useMemo } from "react";
import useStore from "../store/store";
import {
  formatTimestamp,
  severityColor,
  exportToCSV,
  exportToJSON,
} from "../utils/export";

const EVENT_TYPE_OPTIONS = [
  "all",
  "vote_cast",
  "vote_conflict",
  "trust_update",
  "strike_increment",
  "quorum_recalculation",
  "hash_mismatch",
  "wal_replay",
  "recovery_trigger",
  "isolation_event",
  "reintegration_event",
];
const SEVERITY_OPTIONS = ["all", "info", "warning", "critical"];

export default function ForensicPanel() {
  const { forensicLogs, clusterStatus } = useStore();
  const nodes = Object.keys(clusterStatus);

  const [search, setSearch] = useState("");
  const [filterNode, setFilterNode] = useState("all");
  const [filterType, setFilterType] = useState("all");
  const [filterSeverity, setFilterSeverity] = useState("all");
  const [expandedLog, setExpandedLog] = useState(null);

  const filtered = useMemo(() => {
    return forensicLogs.filter((l) => {
      if (
        filterNode !== "all" &&
        l.node !== filterNode &&
        l.actor !== filterNode &&
        l.target !== filterNode
      )
        return false;
      if (
        filterType !== "all" &&
        l.event_type !== filterType &&
        l.action !== filterType
      )
        return false;
      if (filterSeverity !== "all" && l.severity !== filterSeverity)
        return false;
      if (
        search &&
        !JSON.stringify(l).toLowerCase().includes(search.toLowerCase())
      )
        return false;
      return true;
    });
  }, [forensicLogs, search, filterNode, filterType, filterSeverity]);

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-bold text-white">Forensic Audit Log</h2>
          <p className="text-xs text-[#64748b]">
            {filtered.length} events found
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => exportToCSV(filtered, "forensic_logs.csv")}
            className="px-3 py-1.5 rounded-lg bg-white/5 text-xs text-[#94a3b8] hover:text-white border border-white/10 cursor-pointer"
          >
            CSV
          </button>
          <button
            onClick={() => exportToJSON(filtered, "forensic_logs.json")}
            className="px-3 py-1.5 rounded-lg bg-white/5 text-xs text-[#94a3b8] hover:text-white border border-white/10 cursor-pointer"
          >
            JSON
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-2 mb-3 flex-wrap shrink-0">
        <input
          type="text"
          placeholder="Search logs..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white outline-none focus:border-[#00ff88]/30 w-48"
        />
        <select
          value={filterNode}
          onChange={(e) => setFilterNode(e.target.value)}
          className="bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white outline-none"
        >
          <option value="all">All Nodes</option>
          {nodes.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
        <select
          value={filterType}
          onChange={(e) => setFilterType(e.target.value)}
          className="bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white outline-none"
        >
          {EVENT_TYPE_OPTIONS.map((t) => (
            <option key={t} value={t}>
              {t === "all" ? "All Types" : t.replace(/_/g, " ")}
            </option>
          ))}
        </select>
        <select
          value={filterSeverity}
          onChange={(e) => setFilterSeverity(e.target.value)}
          className="bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white outline-none"
        >
          {SEVERITY_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {s === "all" ? "All Severities" : s}
            </option>
          ))}
        </select>
      </div>

      {/* Log Entries */}
      <div className="flex-1 overflow-y-auto space-y-1.5 min-h-0">
        {filtered.map((log, i) => (
          <div
            key={log.id || i}
            className="glass rounded-lg px-3 py-2 hover:bg-white/5 transition-colors cursor-pointer"
            onClick={() => setExpandedLog(expandedLog === i ? null : i)}
          >
            <div className="flex items-center gap-3">
              <span
                className="text-[10px] px-1.5 py-0.5 rounded font-medium"
                style={{
                  background: `${severityColor(log.severity)}20`,
                  color: severityColor(log.severity),
                }}
              >
                {log.severity || "info"}
              </span>
              <span className="text-xs text-white font-medium flex-1">
                {(log.event_type || log.action || "").replace(/_/g, " ")}
              </span>
              <span className="text-[10px] text-[#64748b]">
                {log.node || log.actor}
              </span>
              <span className="text-[10px] text-[#64748b]">
                {formatTimestamp(log.time)}
              </span>
            </div>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-[10px] text-[#94a3b8]">
                {log.actor} → {log.target}
                {log.case_id && (
                  <span className="text-[#00aaff] ml-1 font-mono">
                    {log.case_id}
                  </span>
                )}
              </span>
            </div>

            {/* Expanded JSON */}
            {expandedLog === i && (
              <div className="mt-2 bg-black/30 rounded-lg p-3 border border-white/5">
                <pre className="text-[10px] font-mono text-[#94a3b8] whitespace-pre-wrap break-all">
                  {JSON.stringify(log.metadata || log, null, 2)}
                </pre>
              </div>
            )}
          </div>
        ))}
        {filtered.length === 0 && (
          <div className="text-center py-8 text-[#64748b] text-sm">
            No matching logs found
          </div>
        )}
      </div>
    </div>
  );
}
