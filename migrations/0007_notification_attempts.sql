CREATE TABLE notification_attempts (
  id TEXT PRIMARY KEY,
  notification_log_id TEXT NOT NULL REFERENCES notification_log(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  attempt_number INTEGER NOT NULL CHECK (attempt_number > 0),
  status TEXT NOT NULL CHECK (status IN ('pending', 'sent', 'failed')),
  error_code TEXT,
  error_message TEXT,
  request_id TEXT,
  attempted_at TEXT NOT NULL,
  completed_at TEXT,
  UNIQUE (notification_log_id, attempt_number)
);

CREATE INDEX idx_notification_attempts_log
  ON notification_attempts(organization_id, notification_log_id, attempt_number);
