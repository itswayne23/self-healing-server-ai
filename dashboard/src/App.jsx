import { useEffect } from "react";
import useStore from "./store/store";
import Sidebar from "./components/Sidebar";
import TopBar from "./components/TopBar";
import EventTicker from "./components/EventTicker";
import NodeInspectionPanel from "./components/NodeInspectionPanel";
import TopologyPanel from "./panels/TopologyPanel";
import ConsensusPanel from "./panels/ConsensusPanel";
import TrustPanel from "./panels/TrustPanel";
import WALPanel from "./panels/WALPanel";
import RecoveryPanel from "./panels/RecoveryPanel";
import ForensicPanel from "./panels/ForensicPanel";
import AlertsPanel from "./panels/AlertsPanel";
import SimulationPanel from "./panels/SimulationPanel";
import ResearchPanel from "./panels/ResearchPanel";
import MetricsPanel from "./panels/MetricsPanel";
import "./App.css";

const PANELS = {
  topology: TopologyPanel,
  consensus: ConsensusPanel,
  trust: TrustPanel,
  wal: WALPanel,
  recovery: RecoveryPanel,
  forensic: ForensicPanel,
  alerts: AlertsPanel,
  simulation: SimulationPanel,
  research: ResearchPanel,
  metrics: MetricsPanel,
};

export default function App() {
  const { activePanel, startPolling, stopPolling } = useStore();
  const ActivePanelComponent = PANELS[activePanel] || TopologyPanel;

  useEffect(() => {
    startPolling();
    return () => stopPolling();
  }, [startPolling, stopPolling]);

  return (
    <div className="app-shell">
      <Sidebar />
      <div className="main-area">
        <TopBar />
        <main className="main-content">
          <ActivePanelComponent />
        </main>
        <EventTicker />
      </div>
      <NodeInspectionPanel />
    </div>
  );
}
