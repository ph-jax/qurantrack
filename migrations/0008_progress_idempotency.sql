ALTER TABLE progress_updates ADD COLUMN idempotency_key TEXT;
CREATE UNIQUE INDEX idx_progress_updates_idempotency
  ON progress_updates(organization_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

ALTER TABLE student_lesson_status ADD COLUMN latest_published_at TEXT;
