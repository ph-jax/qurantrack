PRAGMA foreign_keys = ON;

CREATE TABLE organizations (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  logo_url TEXT,
  logo_data_url TEXT,
  primary_color TEXT NOT NULL DEFAULT '#166534',
  default_locale TEXT NOT NULL DEFAULT 'en',
  timezone TEXT NOT NULL DEFAULT 'UTC',
  email_sender_name TEXT NOT NULL,
  email_reply_to TEXT NOT NULL,
  report_title TEXT NOT NULL DEFAULT 'QuranTrack Progress Update',
  missing_update_days INTEGER NOT NULL DEFAULT 14 CHECK (missing_update_days > 0),
  guardian_token_lifetime_days INTEGER NOT NULL DEFAULT 30 CHECK (guardian_token_lifetime_days > 0),
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (length(slug) BETWEEN 2 AND 64 AND slug = lower(slug) AND instr(slug, ' ') = 0 AND substr(slug, 1, 1) != '-' AND substr(slug, -1, 1) != '-'),
  CHECK (length(primary_color) = 7 AND substr(primary_color, 1, 1) = '#')
);

CREATE TABLE organization_settings (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  setting_key TEXT NOT NULL,
  setting_value TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (organization_id, setting_key)
);

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  display_name TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_login_at TEXT
);

CREATE TABLE organization_memberships (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  user_id TEXT NOT NULL REFERENCES users(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  role TEXT NOT NULL CHECK (role IN ('system_admin', 'organization_admin', 'teacher', 'read_only')),
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (organization_id, user_id)
);

CREATE TABLE login_tokens (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL COLLATE NOCASE,
  token_hash TEXT NOT NULL UNIQUE,
  organization_hint TEXT,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  request_ip_hash TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  token_hash TEXT NOT NULL UNIQUE,
  active_organization_id TEXT REFERENCES organizations(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  expires_at TEXT NOT NULL,
  absolute_expires_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  revoked_at TEXT,
  user_agent_hash TEXT,
  ip_hash TEXT
);

CREATE TABLE program_tracks (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (organization_id, code)
);

CREATE TABLE levels (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  track_id TEXT NOT NULL REFERENCES program_tracks(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (organization_id, track_id, code)
);

CREATE TABLE lessons (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  level_id TEXT NOT NULL REFERENCES levels(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  default_homework TEXT,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (organization_id, level_id, code)
);

CREATE TABLE classes (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  name TEXT NOT NULL,
  description TEXT,
  meeting_schedule TEXT,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE class_teachers (
  class_id TEXT NOT NULL REFERENCES classes(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  user_id TEXT NOT NULL REFERENCES users(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  primary_teacher INTEGER NOT NULL DEFAULT 0 CHECK (primary_teacher IN (0, 1)),
  created_at TEXT NOT NULL,
  PRIMARY KEY (class_id, user_id)
);

CREATE TABLE students (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  external_id TEXT,
  first_name TEXT,
  last_name TEXT,
  display_name TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (organization_id, external_id)
);

CREATE TABLE class_enrollments (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  class_id TEXT NOT NULL REFERENCES classes(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  student_id TEXT NOT NULL REFERENCES students(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  enrolled_at TEXT NOT NULL,
  withdrawn_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX idx_class_enrollments_one_active ON class_enrollments(organization_id, class_id, student_id) WHERE active = 1;

CREATE TABLE student_track_levels (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  student_id TEXT NOT NULL REFERENCES students(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  track_id TEXT NOT NULL REFERENCES program_tracks(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  current_level_id TEXT NOT NULL REFERENCES levels(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  started_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (organization_id, student_id, track_id)
);

CREATE TABLE guardians (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  name TEXT NOT NULL,
  email TEXT NOT NULL COLLATE NOCASE,
  phone TEXT,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (organization_id, email)
);

CREATE TABLE student_guardians (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  student_id TEXT NOT NULL REFERENCES students(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  guardian_id TEXT NOT NULL REFERENCES guardians(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  relationship TEXT,
  primary_contact INTEGER NOT NULL DEFAULT 0 CHECK (primary_contact IN (0, 1)),
  receive_notifications INTEGER NOT NULL DEFAULT 1 CHECK (receive_notifications IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (student_id, guardian_id)
);

CREATE TABLE progress_updates (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  student_id TEXT NOT NULL REFERENCES students(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  class_id TEXT REFERENCES classes(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  teacher_user_id TEXT NOT NULL REFERENCES users(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  update_date TEXT NOT NULL,
  overall_comment TEXT,
  homework TEXT,
  status TEXT NOT NULL CHECK (status IN ('draft', 'published')),
  published_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE progress_update_items (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  progress_update_id TEXT NOT NULL REFERENCES progress_updates(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  track_id TEXT NOT NULL REFERENCES program_tracks(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  level_id TEXT NOT NULL REFERENCES levels(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  lesson_id TEXT NOT NULL REFERENCES lessons(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  outcome TEXT NOT NULL CHECK (outcome IN ('passed', 'practiced', 'needs_practice', 'assigned')),
  item_comment TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE student_lesson_status (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  student_id TEXT NOT NULL REFERENCES students(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  lesson_id TEXT NOT NULL REFERENCES lessons(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  current_status TEXT NOT NULL CHECK (current_status IN ('passed', 'practiced', 'needs_practice', 'assigned')),
  first_passed_at TEXT,
  last_activity_at TEXT NOT NULL,
  last_progress_update_id TEXT NOT NULL REFERENCES progress_updates(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (organization_id, student_id, lesson_id)
);

CREATE TABLE guardian_access_tokens (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  guardian_id TEXT NOT NULL REFERENCES guardians(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  last_used_at TEXT,
  revoked_at TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE notification_log (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  guardian_id TEXT REFERENCES guardians(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  student_id TEXT REFERENCES students(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  progress_update_id TEXT REFERENCES progress_updates(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  recipient_email TEXT NOT NULL COLLATE NOCASE,
  notification_type TEXT NOT NULL,
  subject TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'sent', 'failed', 'skipped')),
  error_code TEXT,
  error_message TEXT,
  attempted_at TEXT,
  sent_at TEXT,
  created_at TEXT NOT NULL,
  deduplication_key TEXT,
  UNIQUE (organization_id, deduplication_key)
);

CREATE TABLE audit_log (
  id TEXT PRIMARY KEY,
  organization_id TEXT REFERENCES organizations(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  actor_user_id TEXT REFERENCES users(id) ON UPDATE CASCADE ON DELETE SET NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  summary TEXT NOT NULL,
  metadata_json TEXT,
  request_id TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE legacy_import_jobs (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  created_by_user_id TEXT NOT NULL REFERENCES users(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  status TEXT NOT NULL CHECK (status IN ('pending','validating','ready','importing','completed','failed')),
  dry_run INTEGER NOT NULL CHECK (dry_run IN (0, 1)),
  started_at TEXT NOT NULL,
  finished_at TEXT,
  summary_json TEXT,
  error_message TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE legacy_import_errors (
  id TEXT PRIMARY KEY,
  import_job_id TEXT NOT NULL REFERENCES legacy_import_jobs(id) ON UPDATE CASCADE ON DELETE CASCADE,
  source_file TEXT NOT NULL,
  source_row INTEGER NOT NULL,
  field_name TEXT,
  error_code TEXT NOT NULL,
  error_message TEXT NOT NULL,
  raw_value_redacted TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX idx_memberships_org_role ON organization_memberships(organization_id, role, active);
CREATE INDEX idx_tracks_org_active ON program_tracks(organization_id, active, sort_order);
CREATE INDEX idx_levels_org_track ON levels(organization_id, track_id, active, sort_order);
CREATE INDEX idx_lessons_org_level ON lessons(organization_id, level_id, active, sort_order);
CREATE INDEX idx_classes_org_active ON classes(organization_id, active);
CREATE INDEX idx_class_teachers_user ON class_teachers(organization_id, user_id);
CREATE INDEX idx_students_org_active ON students(organization_id, active, display_name);
CREATE INDEX idx_guardians_org_active_email ON guardians(organization_id, active, email);
CREATE INDEX idx_student_guardians_guardian ON student_guardians(organization_id, guardian_id);
CREATE INDEX idx_progress_updates_student_date ON progress_updates(organization_id, student_id, update_date DESC);
CREATE INDEX idx_progress_items_update ON progress_update_items(organization_id, progress_update_id);
CREATE INDEX idx_lesson_status_student ON student_lesson_status(organization_id, student_id);
CREATE INDEX idx_guardian_tokens_guardian ON guardian_access_tokens(organization_id, guardian_id);
CREATE INDEX idx_notification_log_status ON notification_log(organization_id, status, created_at);
CREATE INDEX idx_audit_log_entity ON audit_log(organization_id, entity_type, entity_id, created_at);
CREATE INDEX idx_import_errors_job ON legacy_import_errors(import_job_id, source_row);
