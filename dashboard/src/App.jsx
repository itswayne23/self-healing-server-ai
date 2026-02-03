import { useEffect, useState } from "react";
import axios from "axios";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
} from "recharts";

const API = "http://localhost:7000";

function App() {
  const [status, setStatus] = useState({});
  const [events, setEvents] = useState([]);
  const [stats, setStats] = useState({});

  useEffect(() => {
    const fetchData = async () => {
      try {
        const s = await axios.get(`${API}/cluster/status`);
        const e = await axios.get(`${API}/history`);
        const st = await axios.get(`${API}/stats`);

        setStatus(s.data);
        setEvents(e.data.slice(0, 20));
        setStats(st.data);
      } catch (err) {
        console.error("API error:", err);
      }
    };

    fetchData();
    const t = setInterval(fetchData, 3000);
    return () => clearInterval(t);
  }, []);

  const trustData = Object.values(status).map((n) => ({
    node: n.node,
    trust: n.trust[n.node] || 0,
  }));

  return (
    <div style={{ padding: 20, fontFamily: "Arial" }}>
      <h1>🛡️ Self-Healing Cluster Dashboard</h1>

      {/* NODE STATUS */}
      <h2>Cluster Nodes</h2>
      <div style={{ display: "flex", gap: 20 }}>
        {Object.values(status).map((n) => (
          <div
            key={n.node}
            style={{
              border: "1px solid #ccc",
              padding: 10,
              width: 180,
            }}
          >
            <h3>{n.node}</h3>
            <p>Active Cases: {n.active_cases}</p>
            <p>Strike Count: {n.strikes[n.node] || 0}</p>
            <p>Trust: {n.trust[n.node]?.toFixed(2)}</p>
          </div>
        ))}
      </div>

      {/* TRUST GRAPH */}
      <h2>Trust Scores</h2>
      <BarChart width={500} height={300} data={trustData}>
        <XAxis dataKey="node" />
        <YAxis domain={[0, 2]} />
        <Tooltip />
        <Bar dataKey="trust" />
      </BarChart>

      {/* INCIDENT FEED */}
      <h2>Recent Incidents</h2>
      <table border="1" cellPadding="6">
        <thead>
          <tr>
            <th>Case</th>
            <th>Node</th>
            <th>Process</th>
            <th>Result</th>
            <th>Weight</th>
          </tr>
        </thead>
        <tbody>
          {events.map((e, i) => (
            <tr key={i}>
              <td>{e.case_id.slice(0, 6)}</td>
              <td>{e.node}</td>
              <td>{e.process}</td>
              <td>{e.result}</td>
              <td>{e.weighted.toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* STATS */}
      <h2>Cluster Stats</h2>
      <pre>{JSON.stringify(stats, null, 2)}</pre>
    </div>
  );
}

export default App;
