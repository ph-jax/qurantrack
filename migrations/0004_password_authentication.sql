PRAGMA foreign_keys = ON;

CREATE TABLE user_password_credentials (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  algorithm TEXT NOT NULL CHECK (algorithm IN ('PBKDF2-HMAC-SHA-256')),
  work_factor INTEGER NOT NULL CHECK (work_factor >= 600000),
  salt TEXT NOT NULL CHECK (length(salt) >= 22),
  password_hash TEXT NOT NULL CHECK (length(password_hash) >= 43),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  password_changed_at TEXT NOT NULL
);

CREATE TABLE password_reset_tokens (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  consumed_at TEXT,
  invalidated_at TEXT,
  request_ip_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  CHECK (consumed_at IS NULL OR invalidated_at IS NULL)
);
CREATE INDEX idx_password_reset_user_active
  ON password_reset_tokens(user_id, expires_at)
  WHERE consumed_at IS NULL AND invalidated_at IS NULL;
CREATE INDEX idx_password_reset_expiry ON password_reset_tokens(expires_at);

CREATE TABLE authentication_rate_limits (
  purpose TEXT NOT NULL,
  subject_hash TEXT NOT NULL,
  window_started_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  attempt_count INTEGER NOT NULL DEFAULT 1 CHECK (attempt_count >= 1),
  PRIMARY KEY (purpose, subject_hash),
  CHECK (purpose IN ('password_account', 'password_ip', 'magic_link_account', 'magic_link_ip', 'reset_account', 'reset_ip'))
);
CREATE INDEX idx_auth_rate_limits_expiry ON authentication_rate_limits(expires_at);
