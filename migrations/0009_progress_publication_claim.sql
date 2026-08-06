CREATE TABLE progress_publication_claims (
  progress_update_id TEXT PRIMARY KEY REFERENCES progress_updates(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  claimed_at TEXT NOT NULL
);
