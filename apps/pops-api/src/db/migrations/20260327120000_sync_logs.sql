CREATE TABLE IF NOT EXISTS sync_logs (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  synced_at     TEXT NOT NULL,
  movies_synced INTEGER NOT NULL DEFAULT 0,
  tv_shows_synced INTEGER NOT NULL DEFAULT 0,
  errors        TEXT,
  duration_ms   INTEGER
);

CREATE INDEX IF NOT EXISTS idx_sync_logs_synced_at ON sync_logs(synced_at);
