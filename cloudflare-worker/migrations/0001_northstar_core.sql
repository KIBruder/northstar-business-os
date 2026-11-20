-- Northstar central storage schema (Cloudflare D1 / SQLite)
-- All rows are tenant-scoped by the authenticated Cloudflare Access subject.
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS workspaces (
  id TEXT NOT NULL,
  owner_sub TEXT NOT NULL,
  payload_json TEXT NOT NULL CHECK (json_valid(payload_json)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  PRIMARY KEY (owner_sub, id)
);
CREATE INDEX IF NOT EXISTS idx_workspaces_owner_updated
  ON workspaces(owner_sub, updated_at DESC);

CREATE TABLE IF NOT EXISTS products (
  id TEXT NOT NULL,
  owner_sub TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  payload_json TEXT NOT NULL CHECK (json_valid(payload_json)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  PRIMARY KEY (owner_sub, id),
  FOREIGN KEY (owner_sub, workspace_id) REFERENCES workspaces(owner_sub, id)
);
CREATE INDEX IF NOT EXISTS idx_products_workspace_updated
  ON products(owner_sub, workspace_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS posts (
  id TEXT NOT NULL,
  owner_sub TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  payload_json TEXT NOT NULL CHECK (json_valid(payload_json)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  PRIMARY KEY (owner_sub, id),
  FOREIGN KEY (owner_sub, workspace_id) REFERENCES workspaces(owner_sub, id)
);
CREATE INDEX IF NOT EXISTS idx_posts_workspace_updated
  ON posts(owner_sub, workspace_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS activities (
  id TEXT NOT NULL,
  owner_sub TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  payload_json TEXT NOT NULL CHECK (json_valid(payload_json)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  PRIMARY KEY (owner_sub, id),
  FOREIGN KEY (owner_sub, workspace_id) REFERENCES workspaces(owner_sub, id)
);
CREATE INDEX IF NOT EXISTS idx_activities_workspace_updated
  ON activities(owner_sub, workspace_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS agent_tasks (
  id TEXT NOT NULL,
  owner_sub TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  payload_json TEXT NOT NULL CHECK (json_valid(payload_json)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  PRIMARY KEY (owner_sub, id),
  FOREIGN KEY (owner_sub, workspace_id) REFERENCES workspaces(owner_sub, id)
);
CREATE INDEX IF NOT EXISTS idx_agent_tasks_workspace_updated
  ON agent_tasks(owner_sub, workspace_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS finance_transactions (
  id TEXT NOT NULL,
  owner_sub TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  payload_json TEXT NOT NULL CHECK (json_valid(payload_json)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  PRIMARY KEY (owner_sub, id),
  FOREIGN KEY (owner_sub, workspace_id) REFERENCES workspaces(owner_sub, id)
);
CREATE INDEX IF NOT EXISTS idx_finance_workspace_updated
  ON finance_transactions(owner_sub, workspace_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS settings (
  id TEXT NOT NULL,
  owner_sub TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  payload_json TEXT NOT NULL CHECK (json_valid(payload_json)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  PRIMARY KEY (owner_sub, id),
  FOREIGN KEY (owner_sub, workspace_id) REFERENCES workspaces(owner_sub, id)
);
CREATE INDEX IF NOT EXISTS idx_settings_workspace_updated
  ON settings(owner_sub, workspace_id, updated_at DESC);
