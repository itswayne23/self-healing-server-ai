import { useEffect, useState, useRef } from "react";
import useStore from "../store/store";
import { formatTimestamp, severityColor } from "../utils/export";

export default function EventTicker() {
  const { alerts, forensicLogs } = useStore();
  const [events, setEvents] = useState([]);
  const containerRef = useRef(null);

  useEffect(() => {
    const combined = [
      ...alerts.map((a) => ({
        text: `[${a.severity?.toUpperCase()}] ${a.message}`,
        color: severityColor(a.severity),
        time: a.time,
      })),
      ...forensicLogs
        .slice(0, 10)
        .map((l) => ({
          text: `${l.action} on ${l.target} by ${l.actor}`,
          color: "#94a3b8",
          time: l.time * 1000,
        })),
    ]
      .sort((a, b) => b.time - a.time)
      .slice(0, 20);
    setEvents(combined);
  }, [alerts, forensicLogs]);

  return (
    <div className="h-7 glass border-t border-white/5 flex items-center overflow-hidden px-4 shrink-0 z-20">
      <div className="flex items-center gap-1.5 shrink-0 mr-3">
        <div className="w-1.5 h-1.5 rounded-full bg-[#ff3366] animate-pulse" />
        <span className="text-[10px] uppercase tracking-wider text-[#64748b] font-semibold">
          Events
        </span>
      </div>
      <div ref={containerRef} className="flex-1 overflow-hidden relative">
        <div className="flex items-center gap-6 animate-ticker whitespace-nowrap">
          {events.map((e, i) => (
            <span
              key={i}
              className="text-[11px] shrink-0"
              style={{ color: e.color }}
            >
              {e.text}
            </span>
          ))}
          {events.length === 0 && (
            <span className="text-[11px] text-[#64748b]">No events yet</span>
          )}
        </div>
      </div>
    </div>
  );
}
