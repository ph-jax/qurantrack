CREATE TABLE homework_revisions (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  progress_update_id TEXT NOT NULL REFERENCES progress_updates(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  previous_homework TEXT,
  new_homework TEXT,
  changed_by_user_id TEXT NOT NULL REFERENCES users(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  notification_requested INTEGER NOT NULL CHECK (notification_requested IN (0, 1)),
  operation_key TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (organization_id, progress_update_id, operation_key)
);

CREATE INDEX idx_homework_revisions_progress
  ON homework_revisions(organization_id, progress_update_id, created_at DESC);

ALTER TABLE notification_log ADD COLUMN source_revision_id TEXT REFERENCES homework_revisions(id) ON UPDATE CASCADE ON DELETE RESTRICT;

CREATE INDEX idx_notification_log_revision
  ON notification_log(organization_id, source_revision_id, guardian_id);
