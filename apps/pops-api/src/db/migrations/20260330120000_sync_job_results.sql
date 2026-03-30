CREATE TABLE IF NOT EXISTS sync_job_results (
  id            TEXT PRIMARY KEY,
  job_type      TEXT NOT NULL,
  status        TEXT NOT NULL,
  started_at    TEXT NOT NULL,
  completed_at  TEXT,
  duration_ms   INTEGER,
  progress      TEXT,
  result        TEXT,
  error         TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_sync_job_results_type_completed
  ON sync_job_results(job_type, completed_at);
