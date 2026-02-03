import { useEffect, useState, useMemo } from "react";
import "./App.css";

import axios from "axios";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  LineChart,
  Line,
  CartesianGrid,
  ResponsiveContainer,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
} from "recharts";

const API = "http://localhost:7000";

// Modern color palette
const COLORS = {
  primary: "#6366f1",
  secondary: "#8b5cf6",
  success: "#10b981",
  warning: "#f59e0b",
  danger: "#ef4444",
  info: "#06b6d4",
  dark: "#0f172a",
  card: "rgba(30, 41, 59, 0.7)",
};

function App() {
  const [status, setStatus] = useState({});
  const [events, setEvents] = useState([]);
  const [stats, setStats] = useState({});
  const [loading, setLoading] = useState(true);

  const [filterNode, setFilterNode] = useState("all");
  const [filterResult, setFilterResult] = useState("all");
  const [search, setSearch] = useState("");

  const [view, setView] = useState("overview");

  const [lastUpdate, setLastUpdate] = useState(null);
  const [toast, setToast] = useState(null);
  const [knownCases, setKnownCases] = useState(new Set());
  const [selectedNode, setSelectedNode] = useState(null);

  // Simulated data for demo (remove in production)
  useEffect(() => {
    const mockData = {
      status: {
        node1: { node: "node1", trust: { node1: 0.95 }, active_cases: 3, strikes: { node1: 0 } },
        node2: { node: "node2", trust: { node2: 0.82 }, active_cases: 5, strikes: { node2: 1 } },
        node3: { node: "node3", trust: { node3: 0.45 }, active_cases: 8, strikes: { node3: 3 } },
        node4: { node: "node4", trust: { node4: 0.91 }, active_cases: 2, strikes: { node4: 0 } },
      },
      events: Array.from({ length: 20 }, (_, i) => ({
        case_id: `case-${Math.random().toString(36).substr(2, 9)}`,
        node: `node${Math.floor(Math.random() * 4) + 1}`,
        process: `proc-${Math.floor(Math.random() * 100)}`,
        result: Math.random() > 0.7 ? "terminated" : Math.random() > 0.5 ? "rejected" : "allowed",
        weighted: Math.random() * 10,
        time: Date.now() / 1000 - i * 300,
      })),
      stats: { total_incidents: 156, resolved: 142, active_threats: 3, avg_response_time: "2.3s" },
    };

    setStatus(mockData.status);
    setEvents(mockData.events);
    setStats(mockData.stats);
    setLoading(false);
    setLastUpdate(new Date().toLocaleTimeString());
  }, []);

  useEffect(() => {
    if (loading) return;
    
    const fetchData = async () => {
      try {
        const s = await axios.get(`${API}/cluster/status`);
        const e = await axios.get(`${API}/history`);
        const st = await axios.get(`${API}/stats`);

        setStatus(s.data);
        setEvents(e.data.slice(0, 20));
        setStats(st.data);
        setLastUpdate(new Date().toLocaleTimeString());

        setKnownCases((prev) => {
          const next = new Set(prev);
          e.data.forEach((ev) => {
            if (!next.has(ev.case_id)) {
              setToast(ev);
              setTimeout(() => setToast(null), 5000);
              next.add(ev.case_id);
            }
          });
          return next;
        });
      } catch (err) {
        console.error("API error:", err);
      }
    };

    fetchData();
    const t = setInterval(fetchData, 3000);
    return () => clearInterval(t);
  }, [loading]);

  const trustData = useMemo(() => 
    Object.values(status).map((n) => ({
      node: n.node,
      trust: n.trust[n.node] || 0,
      active: n.active_cases,
      strikes: n.strikes[n.node] || 0,
    })), [status]);

  const nodeClass = (trust) => {
    if (trust > 0.9) return "node-good";
    if (trust > 0.6) return "node-warn";
    return "node-bad";
  };

  const filteredEvents = useMemo(() => 
    events.filter((e) => {
      if (filterNode !== "all" && e.node !== filterNode) return false;
      if (filterResult !== "all" && e.result !== filterResult) return false;
      if (search && !e.case_id.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    }), [events, filterNode, filterResult, search]);

  const timelineData = useMemo(() => 
    filteredEvents
      .map((e) => ({
        time: new Date(e.time * 1000).toLocaleTimeString(),
        weight: e.weighted,
        result: e.result,
      }))
      .reverse(), [filteredEvents]);

  const pieData = useMemo(() => {
    const counts = events.reduce((acc, e) => {
      acc[e.result] = (acc[e.result] || 0) + 1;
      return acc;
    }, {});
    return Object.entries(counts).map(([name, value]) => ({ name, value }));
  }, [events]);

  const activeIncidents = events.filter(e => e.result === "terminated").length;

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="spinner"></div>
        <p>Initializing Security Operations Center...</p>
      </div>
    );
  }

  return (
    <div className="app-shell">
      {/* Animated Background */}
      <div className="ambient-bg">
        <div className="blob blob-1"></div>
        <div className="blob blob-2"></div>
        <div className="blob blob-3"></div>
      </div>

      {/* SIDEBAR */}
      <aside className="sidebar">
        <div className="sidebar-header">
          <div className="logo">
            <div className="logo-icon">🛡️</div>
            <div>
              <h2>Cluster SOC</h2>
              <span className="version">v2.0.4</span>
            </div>
          </div>
        </div>

        <nav className="nav-menu">
          {[
            { id: "overview", icon: "🖥", label: "Overview" },
            { id: "incidents", icon: "🚨", label: "Incidents", badge: activeIncidents },
            { id: "stats", icon: "📊", label: "Analytics" },
            { id: "ai", icon: "🤖", label: "AI Analyst", beta: true },
          ].map((item) => (
            <div
              key={item.id}
              className={`nav-item ${view === item.id ? "active" : ""}`}
              onClick={() => setView(item.id)}
            >
              <span className="nav-icon">{item.icon}</span>
              <span className="nav-label">{item.label}</span>
              {item.badge > 0 && <span className="nav-badge">{item.badge}</span>}
              {item.beta && <span className="beta-tag">BETA</span>}
            </div>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="status-indicator">
            <div className="pulse-dot"></div>
            <span>System Operational</span>
          </div>
          <div className="connection-status">
            <div className="connection-bar"></div>
            <div className="connection-bar"></div>
            <div className="connection-bar"></div>
            <div className="connection-bar"></div>
          </div>
        </div>
      </aside>

      {/* MAIN */}
      <main className="main">
        {/* HEADER */}
        <header className="header">
          <div className="header-left">
            <h1>Self-Healing Cluster Dashboard</h1>
            <div className="breadcrumb">
              <span>Security</span>
              <span className="separator">/</span>
              <span className="current">{view.charAt(0).toUpperCase() + view.slice(1)}</span>
            </div>
          </div>
          <div className="header-right">
            <div className="search-box">
              <input 
                type="text" 
                placeholder="Global search..." 
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <span className="search-icon">🔍</span>
            </div>
            <div className="header-actions">
              <button className="icon-btn">🔔</button>
              <button className="icon-btn">⚙️</button>
              <div className="user-avatar">👤</div>
            </div>
          </div>
        </header>

        {/* OVERVIEW */}
        {view === "overview" && (
          <>
            {/* KPI Cards */}
            <div className="kpi-grid">
              <div className="kpi-card">
                <div className="kpi-icon" style={{ background: "rgba(99, 102, 241, 0.2)" }}>🖥️</div>
                <div className="kpi-content">
                  <h3>{Object.keys(status).length}</h3>
                  <p>Active Nodes</p>
                  <span className="trend up">+2 this week</span>
                </div>
              </div>
              <div className="kpi-card">
                <div className="kpi-icon" style={{ background: "rgba(239, 68, 68, 0.2)" }}>🚨</div>
                <div className="kpi-content">
                  <h3>{activeIncidents}</h3>
                  <p>Active Threats</p>
                  <span className="trend down">-12% vs last hour</span>
                </div>
              </div>
              <div className="kpi-card">
                <div className="kpi-icon" style={{ background: "rgba(16, 185, 129, 0.2)" }}>✅</div>
                <div className="kpi-content">
                  <h3>{stats.resolved || 142}</h3>
                  <p>Resolved Today</p>
                  <span className="trend up">98.2% success rate</span>
                </div>
              </div>
              <div className="kpi-card">
                <div className="kpi-icon" style={{ background: "rgba(245, 158, 11, 0.2)" }}>⚡</div>
                <div className="kpi-content">
                  <h3>{stats.avg_response_time || "2.3s"}</h3>
                  <p>Avg Response</p>
                  <span className="trend neutral">Target: &lt;3s</span>
                </div>
              </div>
            </div>

            <div className="dashboard-grid">
              {/* Node Status */}
              <div className="dashboard-card wide">
                <div className="card-header">
                  <h2>Cluster Health</h2>
                  <button className="btn-secondary">View All</button>
                </div>
                <div className="nodes-grid">
                  {Object.values(status).map((n) => (
                    <div
                      key={n.node}
                      className={`node-card ${nodeClass(n.trust[n.node])} ${selectedNode === n.node ? 'selected' : ''}`}
                      onClick={() => setSelectedNode(selectedNode === n.node ? null : n.node)}
                    >
                      <div className="node-header">
                        <div className="node-status-dot"></div>
                        <h3>{n.node}</h3>
                        <span className={`trust-badge ${nodeClass(n.trust[n.node])}`}>
                          {(n.trust[n.node] * 100).toFixed(0)}%
                        </span>
                      </div>
                      <div className="node-metrics">
                        <div className="metric">
                          <span className="metric-label">Active Cases</span>
                          <span className="metric-value">{n.active_cases}</span>
                        </div>
                        <div className="metric">
                          <span className="metric-label">Strikes</span>
                          <span className="metric-value" style={{ color: n.strikes[n.node] > 0 ? '#ef4444' : '#10b981' }}>
                            {n.strikes[n.node] || 0}
                          </span>
                        </div>
                      </div>
                      <div className="trust-bar">
                        <div 
                          className="trust-fill" 
                          style={{ width: `${(n.trust[n.node] || 0) * 100}%` }}
                        ></div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Trust Chart */}
              <div className="dashboard-card">
                <div className="card-header">
                  <h2>Trust Distribution</h2>
                </div>
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={trustData}>
                    <defs>
                      <linearGradient id="trustGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={COLORS.primary} />
                        <stop offset="100%" stopColor={COLORS.secondary} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                    <XAxis dataKey="node" stroke="#64748b" fontSize={12} />
                    <YAxis domain={[0, 1]} stroke="#64748b" fontSize={12} />
                    <Tooltip 
                      contentStyle={{ 
                        background: "rgba(15, 23, 42, 0.9)", 
                        border: "1px solid rgba(255,255,255,0.1)",
                        borderRadius: "8px"
                      }} 
                    />
                    <Bar dataKey="trust" fill="url(#trustGradient)" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Incident Distribution */}
              <div className="dashboard-card">
                <div className="card-header">
                  <h2>Incident Types</h2>
                </div>
                <ResponsiveContainer width="100%" height={250}>
                  <PieChart>
                    <Pie
                      data={pieData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={80}
                      paddingAngle={5}
                      dataKey="value"
                    >
                      {pieData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={[COLORS.danger, COLORS.warning, COLORS.success][index % 3]} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
                <div className="legend">
                  {pieData.map((entry, index) => (
                    <div key={entry.name} className="legend-item">
                      <div className="legend-dot" style={{ background: [COLORS.danger, COLORS.warning, COLORS.success][index % 3] }}></div>
                      <span>{entry.name}</span>
                      <strong>{entry.value}</strong>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </>
        )}

        {/* INCIDENTS */}
        {view === "incidents" && (
          <>
            {toast && toast.result === "terminated" && (
              <div className="alert-banner critical">
                <div className="alert-icon">🚨</div>
                <div className="alert-content">
                  <h4>Critical Incident Detected</h4>
                  <p>Immediate attention required on {toast.node}</p>
                </div>
                <button className="alert-action">Investigate</button>
              </div>
            )}

            <div className="dashboard-card full-width">
              <div className="card-header">
                <h2>Incident Management</h2>
                <div className="header-actions-group">
                  <div className="filter-group">
                    <div className="search-input">
                      <input
                        placeholder="Search case ID..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                      />
                      <span>🔍</span>
                    </div>
                    
                    <select
                      className="filter-select"
                      value={filterNode}
                      onChange={(e) => setFilterNode(e.target.value)}
                    >
                      <option value="all">All Nodes</option>
                      {Object.values(status).map((n) => (
                        <option key={n.node} value={n.node}>
                          {n.node}
                        </option>
                      ))}
                    </select>

                    <select
                      className="filter-select"
                      value={filterResult}
                      onChange={(e) => setFilterResult(e.target.value)}
                    >
                      <option value="all">All Results</option>
                      <option value="terminated">Terminated</option>
                      <option value="rejected">Rejected</option>
                      <option value="allowed">Allowed</option>
                    </select>
                  </div>
                  <button className="btn-primary">Export Report</button>
                </div>
              </div>

              <div className="table-container">
                <table className="modern-table">
                  <thead>
                    <tr>
                      <th>Case ID</th>
                      <th>Node</th>
                      <th>Process</th>
                      <th>Result</th>
                      <th>Severity</th>
                      <th>Time</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredEvents.map((e, i) => (
                      <tr
                        key={i}
                        className={knownCases.has(e.case_id) ? "" : "row-new"}
                      >
                        <td>
                          <div className="case-id">
                            <div className="case-avatar">{e.case_id.slice(0, 2).toUpperCase()}</div>
                            <span>{e.case_id.slice(0, 8)}...</span>
                          </div>
                        </td>
                        <td>
                          <span className="node-tag">{e.node}</span>
                        </td>
                        <td>{e.process}</td>
                        <td>
                          <span className={`status-badge ${e.result}`}>
                            {e.result === "terminated" && "⛔"}
                            {e.result === "rejected" && "⚠️"}
                            {e.result === "allowed" && "✅"}
                            {e.result}
                          </span>
                        </td>
                        <td>
                          <div className="severity-bar">
                            <div 
                              className="severity-fill" 
                              style={{ width: `${(e.weighted / 10) * 100}%`, background: e.weighted > 7 ? '#ef4444' : e.weighted > 4 ? '#f59e0b' : '#10b981' }}
                            ></div>
                            <span>{e.weighted.toFixed(1)}</span>
                          </div>
                        </td>
                        <td className="time-cell">{new Date(e.time * 1000).toLocaleString()}</td>
                        <td>
                          <button className="action-btn">Details</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="dashboard-card full-width">
              <div className="card-header">
                <h2>Threat Timeline</h2>
                <div className="time-range">
                  <button className="time-btn active">1H</button>
                  <button className="time-btn">6H</button>
                  <button className="time-btn">24H</button>
                  <button className="time-btn">7D</button>
                </div>
              </div>
              <ResponsiveContainer width="100%" height={300}>
                <AreaChart data={timelineData}>
                  <defs>
                    <linearGradient id="colorWeight" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={COLORS.primary} stopOpacity={0.3}/>
                      <stop offset="95%" stopColor={COLORS.primary} stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <XAxis dataKey="time" stroke="#64748b" fontSize={12} />
                  <YAxis stroke="#64748b" fontSize={12} />
                  <Tooltip 
                    contentStyle={{ 
                      background: "rgba(15, 23, 42, 0.9)", 
                      border: "1px solid rgba(255,255,255,0.1)",
                      borderRadius: "8px"
                    }}
                  />
                  <Area 
                    type="monotone" 
                    dataKey="weight" 
                    stroke={COLORS.primary} 
                    fillOpacity={1} 
                    fill="url(#colorWeight)" 
                    strokeWidth={2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </>
        )}

        {/* STATS */}
        {view === "stats" && (
          <div className="stats-layout">
            <div className="dashboard-card">
              <div className="card-header">
                <h2>Performance Metrics</h2>
              </div>
              <div className="stats-grid">
                {Object.entries(stats).map(([key, value]) => (
                  <div key={key} className="stat-item">
                    <span className="stat-label">{key.replace(/_/g, ' ').toUpperCase()}</span>
                    <span className="stat-value">{value}</span>
                  </div>
                ))}
              </div>
            </div>
            
            <div className="dashboard-card full-width">
              <div className="card-header">
                <h2>System Health</h2>
              </div>
              <pre className="json-viewer">{JSON.stringify(stats, null, 2)}</pre>
            </div>
          </div>
        )}

        {/* AI */}
        {view === "ai" && (
          <div className="ai-container">
            <div className="dashboard-card ai-welcome">
              <div className="ai-icon">🤖</div>
              <h2>AI Security Analyst</h2>
              <p>Advanced threat detection and automated response recommendations powered by machine learning.</p>
              <div className="ai-features">
                <div className="ai-feature">
                  <div className="feature-icon">🔍</div>
                  <h4>Anomaly Detection</h4>
                  <p>Real-time behavioral analysis</p>
                </div>
                <div className="ai-feature">
                  <div className="feature-icon">📊</div>
                  <h4>Predictive Analytics</h4>
                  <p>Forecast potential threats</p>
                </div>
                <div className="ai-feature">
                  <div className="feature-icon">⚡</div>
                  <h4>Auto-Remediation</h4>
                  <p>Instant threat neutralization</p>
                </div>
              </div>
              <button className="btn-primary btn-large">Initialize AI Analysis</button>
            </div>
          </div>
        )}

        {/* Live Indicator */}
        <div className="live-indicator">
          <div className="live-dot"></div>
          <span>Live</span>
          <span className="update-time">Updated {lastUpdate}</span>
        </div>
      </main>

      {/* TOAST */}
      {toast && (
        <div className={`toast ${toast.result === "terminated" ? "critical" : ""}`}>
          <div className="toast-icon">{toast.result === "terminated" ? "🚨" : "ℹ️"}</div>
          <div className="toast-content">
            <h4>New Incident Detected</h4>
            <p>{toast.node} • {toast.process}</p>
            <small>{toast.case_id.slice(0, 12)}</small>
          </div>
          <button className="toast-close" onClick={() => setToast(null)}>×</button>
        </div>
      )}
    </div>
  );
}

export default App;