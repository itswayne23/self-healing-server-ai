import axios from "axios";

const API_BASE = "/api";

const api = axios.create({
  baseURL: API_BASE,
  timeout: 5000,
});

export const fetchClusterStatus = () =>
  api.get("/cluster/status").then((r) => r.data);
export const fetchClusterEvents = () =>
  api.get("/cluster/events").then((r) => r.data);
export const fetchClusterNodes = () =>
  api.get("/cluster/nodes").then((r) => r.data);
export const fetchHistory = () => api.get("/history").then((r) => r.data);
export const fetchStats = () => api.get("/stats").then((r) => r.data);
export const fetchClusterTrust = () =>
  api.get("/cluster/trust").then((r) => r.data);
export const fetchClusterQuarantine = () =>
  api.get("/cluster/quarantine").then((r) => r.data);
export const fetchClusterQuarantineTimers = () =>
  api.get("/cluster/quarantine_timers").then((r) => r.data);
export const fetchClusterReputation = () =>
  api.get("/cluster/reputation").then((r) => r.data);
export const fetchClusterAnomalies = () =>
  api.get("/cluster/anomalies").then((r) => r.data);
export const fetchClusterMetrics = () =>
  api.get("/cluster/metrics").then((r) => r.data);
export const fetchClusterHealth = () =>
  api.get("/cluster/health").then((r) => r.data);
export const fetchClusterRecoveryCandidates = () =>
  api.get("/cluster/recovery_candidates").then((r) => r.data);
export const fetchClusterSnapshots = () =>
  api.get("/cluster/snapshots").then((r) => r.data);
export const fetchClusterDead = () =>
  api.get("/cluster/dead").then((r) => r.data);
export const fetchClusterAudit = () =>
  api.get("/cluster/audit").then((r) => r.data);
export const fetchAuditNode = (node) =>
  api.get(`/cluster/audit/node/${node}`).then((r) => r.data);
export const fetchAuditCase = (caseId) =>
  api.get(`/cluster/audit/case/${caseId}`).then((r) => r.data);
export const fetchNodeTimeline = (node) =>
  api.get(`/cluster/timeline/${node}`).then((r) => r.data);
export const fetchExplainCase = (caseId) =>
  api.get(`/cluster/explain/${caseId}`).then((r) => r.data);

export const triggerRecovery = (node) =>
  api.post("/cluster/recover", { node }).then((r) => r.data);

export default api;
