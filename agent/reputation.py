import time

class ReputationEngine:
    def __init__(self):
        self.stats = {}

    def ensure_node(self, node):
        if node not in self.stats:
            self.stats[node] = {
                "total": 0,
                "success": 0,
                "false": 0,
                "last_activity": time.time(),
            }

    def record_success(self, node):
        self.ensure_node(node)
        s = self.stats[node]
        s["total"] += 1
        s["success"] += 1
        s["last_activity"] = time.time()

    def record_false(self, node):
        self.ensure_node(node)
        s = self.stats[node]
        s["total"] += 1
        s["false"] += 1
        s["last_activity"] = time.time()

    def accuracy(self, node):
        self.ensure_node(node)
        s = self.stats[node]
        if s["total"] == 0:
            return 1.0
        return s["success"] / s["total"]

    def snapshot(self):
        out = {}
        for node, s in self.stats.items():
            acc = self.accuracy(node)
            out[node] = {
                **s,
                "accuracy": round(acc, 3),
            }
        return out

    def load_from_snapshot(self, snapshot):
        if not snapshot:
            return

        self.engine = snapshot

