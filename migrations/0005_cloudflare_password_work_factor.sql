-- Rebuild the credential table because SQLite cannot alter a CHECK constraint in place.
-- Foreign-key enforcement remains enabled; deferred checking keeps the rebuild atomic.
PRAGMA defer_foreign_keys = ON;

CREATE TABLE user_password_credentials_cloudflare (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  algorithm TEXT NOT NULL CHECK (algorithm IN ('PBKDF2-HMAC-SHA-256')),
  work_factor INTEGER NOT NULL CHECK (work_factor >= 100000),
  salt TEXT NOT NULL CHECK (length(salt) >= 22),
  password_hash TEXT NOT NULL CHECK (length(password_hash) >= 43),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  password_changed_at TEXT NOT NULL
);

INSERT INTO user_password_credentials_cloudflare (
  user_id,
  algorithm,
  work_factor,
  salt,
  password_hash,
  created_at,
  updated_at,
  password_changed_at
)
SELECT
  user_id,
  algorithm,
  work_factor,
  salt,
  password_hash,
  created_at,
  updated_at,
  password_changed_at
FROM user_password_credentials;

DROP TABLE user_password_credentials;
ALTER TABLE user_password_credentials_cloudflare RENAME TO user_password_credentials;
