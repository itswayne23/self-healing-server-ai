export function exportToCSV(data, filename = "export.csv") {
  if (!data || data.length === 0) return;
  const headers = Object.keys(data[0]);
  const csv = [
    headers.join(","),
    ...data.map((row) =>
      headers
        .map((h) => {
          const val = row[h];
          if (typeof val === "object")
            return `"${JSON.stringify(val).replace(/"/g, '""')}"`;
          if (typeof val === "string" && val.includes(",")) return `"${val}"`;
          return val;
        })
        .join(","),
    ),
  ].join("\n");

  downloadFile(csv, filename, "text/csv");
}

export function exportToJSON(data, filename = "export.json") {
  const json = JSON.stringify(data, null, 2);
  downloadFile(json, filename, "application/json");
}

function downloadFile(content, filename, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function formatTimestamp(ts) {
  if (!ts) return "—";
  const d = new Date(typeof ts === "number" && ts < 1e12 ? ts * 1000 : ts);
  return d.toLocaleTimeString("en-US", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function formatDuration(ms) {
  if (!ms) return "—";
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m ${s % 60}s`;
  return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
}

export function statusColor(status) {
  const map = {
    healthy: "#00ff88",
    degraded: "#ffae00",
    suspect: "#ff8800",
    compromised: "#ff3366",
    quarantined: "#ff3366",
    in_recovery: "#00aaff",
  };
  return map[status] || "#94a3b8";
}

export function severityColor(sev) {
  const map = { info: "#00aaff", warning: "#ffae00", critical: "#ff3366" };
  return map[sev] || "#94a3b8";
}

export function trustColor(trust) {
  if (trust > 0.8) return "#00ff88";
  if (trust > 0.6) return "#06d6a0";
  if (trust > 0.4) return "#ffae00";
  if (trust > 0.2) return "#ff8800";
  return "#ff3366";
}
