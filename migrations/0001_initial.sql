CREATE TABLE IF NOT EXISTS reports(id TEXT PRIMARY KEY,workspace_id TEXT NOT NULL,created_at TEXT NOT NULL,decision TEXT NOT NULL,transaction_digest TEXT NOT NULL,report_raw TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS reports_workspace_created ON reports(workspace_id,created_at DESC);

