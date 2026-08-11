CREATE TABLE homework_revision_recipients (
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  homework_revision_id TEXT NOT NULL REFERENCES homework_revisions(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  guardian_id TEXT NOT NULL REFERENCES guardians(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  recipient_name TEXT NOT NULL,
  recipient_email TEXT NOT NULL,
  resolved_locale TEXT NOT NULL CHECK (resolved_locale IN ('en', 'tr')),
  created_at TEXT NOT NULL,
  PRIMARY KEY (organization_id, homework_revision_id, guardian_id)
);

CREATE INDEX idx_homework_revision_recipients_guardian
  ON homework_revision_recipients(organization_id, guardian_id, homework_revision_id);
