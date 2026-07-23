You are a senior full-stack engineer, security-minded application architect,
database designer, UX designer, technical writer, and release engineer.

Build a complete, working, production-quality web application named:

    QuranTrack

Full product title:

    QuranTrack — Quran Learning & Progress Platform

Turkish descriptive subtitle:

    Kur'an Öğrenme ve Gelişim Platformu

Repository name:

    qurantrack

Preferred production hostname:

    qurantrack.istanbulcenterjax.org

Do not merely write a plan, produce mockups, or return isolated code snippets.
Inspect the repository first. If the repository is empty, scaffold the complete
project.

Implement the application incrementally. After every implementation phase:

1. Run linting.
2. Run TypeScript type checking.
3. Run relevant unit and integration tests.
4. Run the production build.
5. Fix failures before moving forward.
6. Commit the completed phase when Git is available.
7. Update IMPLEMENTATION_PLAN.md and CHANGELOG.md.

Do not claim a feature works unless it was implemented and tested.

If the complete application cannot reasonably be finished in one execution:

- Complete the current phase cleanly.
- Leave the repository in a working state.
- Document exactly what remains.
- Do not leave partially implemented security-sensitive flows.
- Do not pretend unfinished features are complete.

===============================================================================
0. OFFICIAL PRODUCT-NAMING RULES
===============================================================================

The official product name is:

    QuranTrack

Always write it as one word with a capital Q and capital T.

Do not use these names for the new application:

- Kuran Karne
- Quran Karne
- Kuran Takip
- Quran Track

“Quran track” may be used generically only when referring to a program track,
such as Quran Reading, Memorization, Tajweed, or Duas.

Default English title:

    QuranTrack — Quran Learning & Progress Platform

Default English tagline:

    Learn. Practice. Progress.

Alternative descriptive tagline:

    Learning, Progress, and Family Connection

Turkish subtitle:

    Kur'an Öğrenme ve Gelişim Platformu

Apply the QuranTrack name consistently across:

- Source code.
- Package metadata.
- README files.
- PWA manifest.
- Page titles.
- Email templates.
- Database seed data.
- Documentation.
- Deployment instructions.
- Sample screenshots.
- Browser metadata.
- Login pages.
- Parent portal.
- Teacher portal.
- Administrative portal.

The old system should be described only as:

    the legacy Google Sheets/Apps Script report-generation system

The term “report card” must not describe the overall product. QuranTrack is a
continuous learning, progress-management, feedback, homework, and family-
communication platform.

Prefer these product terms:

- Progress Update
- Progress Report
- Learning History
- Quran Learning Progress
- Record Progress
- Publish Progress
- Parent Progress Portal
- Recently Passed Lessons
- Teacher Feedback
- Current Homework
- Program Track
- Level
- Lesson

A printable progress report is one QuranTrack feature, not the identity of the
application.

Default PWA metadata:

    name:
      QuranTrack — Quran Learning & Progress Platform

    short_name:
      QuranTrack

    description:
      Mobile-first Quran learning, progress tracking, teacher feedback,
      homework, and parent communication platform.

Default browser title:

    QuranTrack

Default login heading:

    Welcome to QuranTrack

Default parent portal title:

    QuranTrack Parent Progress Portal

Default teacher actions:

- Record Progress
- Save Draft
- Publish Progress
- Publish & Notify Parent

Default administrative sections:

- Dashboard
- Students
- Teachers
- Classes
- Program
- Progress Reports
- Families
- Notifications
- Settings

===============================================================================
1. PURPOSE
===============================================================================

QuranTrack is a mobile-first Quran learning and progress-management platform for
Peace & Harmony Foundation, Istanbul Center, and similar nonprofit community
organizations.

It must support continuous learning and communication in areas including:

- Quran reading.
- Memorization.
- Tajweed.
- Duas.
- Organization-defined learning tracks.
- Lesson completion.
- Repeated practice.
- Teacher feedback.
- Homework.
- Parent communication.
- Learning history.
- Printable progress reports.

The organization currently uses a legacy Google Sheets/Apps Script report-
generation system that:

- Reads students from a Google Sheet.
- Copies a template sheet.
- Creates a separate spreadsheet for every student.
- Tracks student report links.
- Places generated files in a Google Drive folder.

The legacy approach is fragile, creates Drive clutter, and is difficult for
administrators, teachers, and parents.

Do not reproduce the separate-spreadsheet-per-student architecture.

QuranTrack must provide:

1. A mobile-first, app-like teacher interface.
2. A practical administrator portal.
3. Secure, mobile-friendly parent reports.
4. Email notifications about lesson progress, feedback, and homework.
5. Editable program tracks, levels, and lessons.
6. Multiple nonprofit organizations in one hosted installation.
7. Easy onboarding for sister organizations.
8. An independently deployable, open-source codebase.
9. Data import and export.
10. No required paid subscription or usage-based service.

Expected usage is modest:

- Usually tens or a few hundred students per organization.
- A small number of teachers and administrators.
- A limited number of parent report views and emails.
- No high-volume public traffic.

The application must still be engineered robustly because it stores information
about children and families.

===============================================================================
2. NONPROFIT AND NO-COST CONSTRAINT
===============================================================================

QuranTrack must operate under normal expected usage without requiring a paid
subscription or usage-based paid service.

Required stack:

- React.
- TypeScript.
- Vite.
- Tailwind CSS.
- Cloudflare Workers with Static Assets.
- Cloudflare Vite plugin.
- Cloudflare D1 database.
- Cloudflare Turnstile.
- Google Apps Script email relay.
- An existing Google Workspace or Gmail account for email delivery.
- GitHub for repository hosting.
- Open-source npm packages only.

Do not use:

- Vercel.
- Supabase.
- Firebase.
- AWS.
- Azure.
- Google Cloud paid services.
- Resend.
- SendGrid.
- Mailgun.
- Twilio.
- Stripe.
- Paid authentication services.
- Paid PDF services.
- Paid analytics products.
- R2 as a required dependency.
- Any service that automatically upgrades to a paid plan.
- Any proprietary component library requiring a license.

Cloudflare R2 must not be required for the MVP.

Organization logos may be handled by either:

1. An administrator-provided HTTPS logo URL; or
2. A small optimized PNG, JPEG, or WebP stored in D1 as a data URL.

For uploaded logos:

- Maximum encoded size: 200 KB.
- Reject SVG uploads.
- Validate the MIME type.
- Validate file signatures where practical.
- Resize/compress client-side before upload.
- Allow administrators to remove the logo.
- Do not permit arbitrary HTML or executable content.

The app must operate without a logo.

If a free-tier limit is exceeded:

- Do not enable billing automatically.
- Do not attempt a paid upgrade.
- Fail safely.
- Return a user-friendly service-limit message.
- Log a redacted operational event.
- Preserve existing data.
- Provide an administrator-facing warning.
- Document how to inspect usage.

No third-party free plan is guaranteed forever. Therefore:

- Keep the code portable.
- Keep the database exportable.
- Avoid Cloudflare-specific logic in domain services where reasonable.
- Document how the application could be migrated or self-hosted later.

===============================================================================
3. TECHNICAL ARCHITECTURE
===============================================================================

Build QuranTrack as one full-stack Cloudflare Worker application.

Use:

- React SPA frontend.
- Vite.
- TypeScript in strict mode.
- Tailwind CSS.
- Cloudflare Vite plugin.
- Cloudflare Workers Static Assets.
- Hono for the Worker API router.
- Cloudflare D1 for relational storage.
- Cloudflare Turnstile for bot protection.
- Web Crypto APIs for cryptography.
- GmailApp through an Apps Script relay for email.
- Zod for input validation.
- React Router for client routing.
- i18next or a similarly lightweight internationalization library.
- Vitest for unit tests.
- Playwright for browser tests.
- ESLint.
- Prettier.
- vite-plugin-pwa or an equivalent open-source PWA plugin.

The Worker must serve:

- Static frontend assets.
- SPA fallback routing.
- JSON API routes under `/api/v1/`.
- Authentication endpoints.
- Parent portal endpoints.
- Health endpoints.
- Security headers.

Suggested repository structure:

    qurantrack/
    ├── src/
    │   ├── app/
    │   ├── components/
    │   ├── features/
    │   ├── pages/
    │   ├── hooks/
    │   ├── i18n/
    │   ├── lib/
    │   ├── styles/
    │   ├── types/
    │   └── main.tsx
    ├── worker/
    │   ├── index.ts
    │   ├── api/
    │   │   └── v1/
    │   ├── auth/
    │   ├── db/
    │   ├── middleware/
    │   ├── repositories/
    │   ├── services/
    │   ├── validation/
    │   ├── email/
    │   ├── security/
    │   └── types/
    ├── shared/
    │   ├── constants/
    │   ├── schemas/
    │   ├── types/
    │   └── utilities/
    ├── migrations/
    ├── seeds/
    ├── scripts/
    ├── apps-script-mail-relay/
    │   ├── Code.gs
    │   ├── appsscript.json
    │   └── README.md
    ├── tests/
    │   ├── unit/
    │   ├── integration/
    │   └── e2e/
    ├── docs/
    ├── public/
    ├── wrangler.jsonc
    ├── vite.config.ts
    ├── worker-configuration.d.ts
    ├── .dev.vars.example
    ├── .env.example
    ├── package.json
    ├── tsconfig.json
    ├── README.md
    ├── IMPLEMENTATION_PLAN.md
    ├── CHANGELOG.md
    ├── DEPLOYMENT.md
    ├── ADMIN_GUIDE.md
    ├── TEACHER_GUIDE.md
    ├── PARENT_GUIDE.md
    ├── SISTER_ORG_ONBOARDING.md
    ├── PRIVACY_AND_SECURITY.md
    ├── CONTRIBUTING.md
    └── LICENSE

Recommended Cloudflare names:

    Worker:
      qurantrack

    Production D1:
      qurantrack-production

    Preview/local D1:
      qurantrack-preview

Use one Worker deployment for both the frontend and API.

Configure Workers Static Assets so that:

- `/api/*` invokes Worker API logic.
- SPA navigation falls back to `index.html`.
- Static assets are served efficiently.
- Private API responses are never cached.
- Parent reports are never cached.
- Authentication responses are never cached.

===============================================================================
4. MULTI-ORGANIZATION MODEL
===============================================================================

Build one centrally hosted multi-tenant installation.

The central application should support:

- Peace & Harmony Foundation / Istanbul Center.
- Sister nonprofit organizations.
- Different organization branding.
- Different languages.
- Different program structures.
- Separate administrators and teachers.
- Strict data isolation.

Each organization must have its own:

- Name.
- Slug.
- Logo.
- Primary accent color.
- Default language.
- Time zone.
- Email sender display name.
- Reply-to address.
- Tracks.
- Levels.
- Lessons.
- Classes.
- Teachers.
- Students.
- Guardians.
- Notification templates.
- Report settings.
- Missing-update threshold.

Every organization-owned database record must include `organization_id`.

Never trust `organization_id` supplied by the frontend.

The server must resolve organization scope from:

- The authenticated staff membership; or
- The verified guardian access token.

All database repository methods must require an explicit trusted organization
context.

Implement tenant-isolation tests.

A user may belong to multiple organizations.

When a user belongs to more than one organization:

- Show an organization switcher.
- Store the active organization in the session or signed server-controlled
  context.
- Revalidate membership on every request.
- Do not allow the browser to select an arbitrary organization ID.

Central hosted URL patterns may include:

    /o/:organizationSlug/login
    /app
    /parent/:token

A sister organization using the centrally hosted installation must not need to:

- Clone the repository.
- Create a Cloudflare account.
- Create a database.
- Configure secrets.
- Deploy code.
- Modify source files.

They should receive:

- An invitation.
- An organization-admin account.
- A guided onboarding wizard.

Also document independent self-hosting for organizations that require their own
installation.

===============================================================================
5. CORE DOMAIN MODEL
===============================================================================

Do not assume that one student has only one Quran level.

Students can progress independently in multiple program tracks.

Examples:

- Quran Reading.
- Memorization / Hifz.
- Tajweed.
- Duas.
- Surah Review.
- Organization-defined tracks.

Required hierarchy:

    Program Track
        → Level
            → Lesson

Example:

    Memorization
        → Level 1
            → Fatiha
            → Nas
            → Felak

    Quran Reading
        → Level 1
            → Arabic Letters
            → Connected Letters
            → Basic Vowel Marks

Each student may:

- Be assigned to one or more tracks.
- Have a separate current level in each track.
- Progress at different speeds in each track.
- Practice a lesson multiple times.
- Pass a lesson once.
- Receive homework unrelated to a newly passed lesson.
- Have a chronological learning history.

Admins must be able to:

- Create tracks.
- Edit tracks.
- Reorder tracks.
- Activate/deactivate tracks.
- Create levels.
- Edit levels.
- Reorder levels.
- Activate/deactivate levels.
- Create lessons.
- Edit lessons.
- Reorder lessons.
- Activate/deactivate lessons.
- Duplicate a level and its lessons.
- Bulk paste lessons.
- Import/export tracks, levels, and lessons.

Deactivation must preserve historical records.

Historically referenced tracks, levels, and lessons must not be hard-deleted
through normal UI actions.

===============================================================================
6. DATABASE DESIGN
===============================================================================

Create versioned SQL migrations for Cloudflare D1.

Use:

- SQLite-compatible schema.
- Foreign keys.
- Indexes.
- Prepared statements.
- TEXT IDs generated by the application.
- UUIDs or ULIDs.
- UTC ISO-8601 timestamps.
- `created_at` and `updated_at` where appropriate.
- Soft deletion or activation flags for referenced entities.
- Normalized lowercase emails.
- Foreign-key enforcement.

Create at least the following tables.

-------------------------------------------------------------------------------
6.1 organizations
-------------------------------------------------------------------------------

Fields:

- id
- slug, unique
- name
- logo_url, nullable
- logo_data_url, nullable
- primary_color
- default_locale
- timezone
- email_sender_name
- email_reply_to
- report_title
- missing_update_days
- guardian_token_lifetime_days
- active
- created_at
- updated_at

Validate:

- Slug format.
- Locale.
- Time zone.
- Hex color.
- HTTPS logo URLs.
- Uploaded logo size/type.

-------------------------------------------------------------------------------
6.2 organization_settings
-------------------------------------------------------------------------------

Fields:

- id
- organization_id
- setting_key
- setting_value
- created_at
- updated_at

Constraint:

- Unique organization_id + setting_key.

-------------------------------------------------------------------------------
6.3 users
-------------------------------------------------------------------------------

Fields:

- id
- email, normalized lowercase and unique
- display_name
- active
- created_at
- updated_at
- last_login_at, nullable

Do not store passwords.

-------------------------------------------------------------------------------
6.4 organization_memberships
-------------------------------------------------------------------------------

Fields:

- id
- organization_id
- user_id
- role
- active
- created_at
- updated_at

Roles:

- system_admin
- organization_admin
- teacher
- read_only

Constraint:

- Unique organization_id + user_id.

-------------------------------------------------------------------------------
6.5 login_tokens
-------------------------------------------------------------------------------

Fields:

- id
- email
- token_hash
- organization_hint, nullable
- expires_at
- used_at, nullable
- request_ip_hash
- created_at

Never store plaintext login tokens.

-------------------------------------------------------------------------------
6.6 sessions
-------------------------------------------------------------------------------

Fields:

- id
- user_id
- token_hash
- active_organization_id, nullable
- expires_at
- absolute_expires_at
- last_seen_at
- created_at
- revoked_at, nullable
- user_agent_hash, nullable
- ip_hash, nullable

Never store plaintext session tokens.

-------------------------------------------------------------------------------
6.7 program_tracks
-------------------------------------------------------------------------------

Fields:

- id
- organization_id
- code
- name
- description, nullable
- sort_order
- active
- created_at
- updated_at

Constraint:

- Unique organization_id + code.

-------------------------------------------------------------------------------
6.8 levels
-------------------------------------------------------------------------------

Fields:

- id
- organization_id
- track_id
- code
- name
- description, nullable
- sort_order
- active
- created_at
- updated_at

Constraint:

- Unique organization_id + track_id + code.

-------------------------------------------------------------------------------
6.9 lessons
-------------------------------------------------------------------------------

Fields:

- id
- organization_id
- level_id
- code
- name
- description, nullable
- sort_order
- default_homework, nullable
- active
- created_at
- updated_at

Constraint:

- Unique organization_id + level_id + code.

-------------------------------------------------------------------------------
6.10 classes
-------------------------------------------------------------------------------

Fields:

- id
- organization_id
- name
- description, nullable
- meeting_schedule, nullable
- active
- created_at
- updated_at

-------------------------------------------------------------------------------
6.11 class_teachers
-------------------------------------------------------------------------------

Fields:

- class_id
- user_id
- primary_teacher
- created_at

Composite primary key:

- class_id + user_id.

Validate that the teacher belongs to the same organization.

-------------------------------------------------------------------------------
6.12 students
-------------------------------------------------------------------------------

Fields:

- id
- organization_id
- external_id, nullable
- first_name, nullable
- last_name, nullable
- display_name
- active
- notes, nullable
- created_at
- updated_at

Constraint:

- Unique organization_id + external_id when external_id is present.

Do not require the name to be split when the source data provides only one full
name.

-------------------------------------------------------------------------------
6.13 class_enrollments
-------------------------------------------------------------------------------

Fields:

- id
- organization_id
- class_id
- student_id
- active
- enrolled_at
- withdrawn_at, nullable
- created_at
- updated_at

Prevent duplicate active enrollment for the same class/student pair.

-------------------------------------------------------------------------------
6.14 student_track_levels
-------------------------------------------------------------------------------

Fields:

- id
- organization_id
- student_id
- track_id
- current_level_id
- started_at
- updated_at

Constraint:

- Unique organization_id + student_id + track_id.

Validate that the level belongs to the selected track.

-------------------------------------------------------------------------------
6.15 guardians
-------------------------------------------------------------------------------

Fields:

- id
- organization_id
- name
- email, normalized lowercase
- phone, nullable
- active
- created_at
- updated_at

Avoid unnecessary duplication of guardians within an organization.

-------------------------------------------------------------------------------
6.16 student_guardians
-------------------------------------------------------------------------------

Fields:

- id
- organization_id
- student_id
- guardian_id
- relationship, nullable
- primary_contact
- receive_notifications
- created_at
- updated_at

Constraint:

- Unique student_id + guardian_id.

A guardian may be linked to multiple students.

A student may be linked to multiple guardians.

-------------------------------------------------------------------------------
6.17 progress_updates
-------------------------------------------------------------------------------

A progress update represents one teacher report for one student on one date.

Fields:

- id
- organization_id
- student_id
- class_id, nullable
- teacher_user_id
- update_date
- overall_comment, nullable
- homework, nullable
- status
- published_at, nullable
- created_at
- updated_at

Statuses:

- draft
- published

Published updates must not be silently overwritten.

If a published update is corrected:

- Preserve an audit trail.
- Record the previous values or revision metadata.
- Do not erase history without an administrator-visible record.

-------------------------------------------------------------------------------
6.18 progress_update_items
-------------------------------------------------------------------------------

One progress update may contain multiple lesson outcomes.

Fields:

- id
- organization_id
- progress_update_id
- track_id
- level_id
- lesson_id
- outcome
- item_comment, nullable
- created_at
- updated_at

Outcomes:

- passed
- practiced
- needs_practice
- assigned

Only `passed` completes a lesson.

Repeated practice must remain in history.

-------------------------------------------------------------------------------
6.19 student_lesson_status
-------------------------------------------------------------------------------

Maintain a current summary for efficient report rendering.

Fields:

- id
- organization_id
- student_id
- lesson_id
- current_status
- first_passed_at, nullable
- last_activity_at
- last_progress_update_id
- created_at
- updated_at

Constraint:

- Unique organization_id + student_id + lesson_id.

When publishing progress, use `D1Database.batch()` with prepared statements for
the related progress, item, status, and audit writes so the sequence is rolled
back if one statement fails.

Make publication idempotent.

A retried request must not create duplicate updates or notifications.

-------------------------------------------------------------------------------
6.20 guardian_access_tokens
-------------------------------------------------------------------------------

Fields:

- id
- organization_id
- guardian_id
- token_hash
- expires_at
- last_used_at, nullable
- revoked_at, nullable
- created_at

Generate at least 32 random bytes.

Encode the plaintext value as base64url for the parent link.

Store only SHA-256 hashes.

A guardian token should display every student linked to that guardian and allowed
by the organization.

-------------------------------------------------------------------------------
6.21 notification_log
-------------------------------------------------------------------------------

Fields:

- id
- organization_id
- guardian_id, nullable
- student_id, nullable
- progress_update_id, nullable
- recipient_email
- notification_type
- subject
- status
- error_code, nullable
- error_message, nullable
- attempted_at, nullable
- sent_at, nullable
- created_at
- deduplication_key, nullable

Statuses:

- pending
- sent
- failed
- skipped

Create a unique or guarded deduplication mechanism for applicable notifications.

-------------------------------------------------------------------------------
6.22 audit_log
-------------------------------------------------------------------------------

Fields:

- id
- organization_id, nullable
- actor_user_id, nullable
- action
- entity_type
- entity_id
- summary
- metadata_json, nullable
- request_id, nullable
- created_at

Never store:

- Passwords.
- Raw tokens.
- Session cookies.
- Email bodies.
- Parent report URLs containing tokens.
- Secrets.
- Excessive student data.

-------------------------------------------------------------------------------
6.23 rate_limit_events
-------------------------------------------------------------------------------

Create a lightweight rate-limit table only if needed for persistent rate limits.

Alternatively, use short-lived signed counters where practical.

Fields may include:

- id
- key_hash
- action
- window_started_at
- count
- expires_at

Do not store raw IP addresses.

-------------------------------------------------------------------------------
6.24 legacy_import_jobs
-------------------------------------------------------------------------------

Fields:

- id
- organization_id
- created_by_user_id
- status
- dry_run
- started_at
- finished_at, nullable
- summary_json, nullable
- error_message, nullable
- created_at

Statuses:

- pending
- validating
- ready
- importing
- completed
- failed

-------------------------------------------------------------------------------
6.25 legacy_import_errors
-------------------------------------------------------------------------------

Fields:

- id
- import_job_id
- source_file
- source_row
- field_name, nullable
- error_code
- error_message
- raw_value_redacted, nullable
- created_at

===============================================================================
7. AUTHENTICATION
===============================================================================

Implement passwordless email magic-link authentication for staff.

Do not implement passwords.

Staff login flow:

1. User opens an organization-aware login page.
2. User enters an email address.
3. Browser obtains a Cloudflare Turnstile token.
4. Worker validates Turnstile server-side.
5. Normalize the email.
6. Check whether the email has an active membership.
7. Apply rate limits by normalized email hash and IP hash.
8. Return the same generic response whether the email is recognized or not.
9. Generate a cryptographically secure, single-use login token.
10. Store only the token hash.
11. Set a 15-minute expiration.
12. Send the magic link through the Apps Script email relay.
13. On link verification, atomically mark the token as used.
14. Create a secure session.
15. Set an HttpOnly, Secure, SameSite=Lax cookie.
16. Redirect to the application.
17. Record the login in the audit log.

Session requirements:

- Use at least 32 random bytes.
- Store only the session token hash.
- Rotate the session token after successful login.
- Use inactivity expiration.
- Use absolute expiration.
- Revalidate membership status.
- Support logout.
- Support “revoke all sessions.”
- Update `last_seen_at` without excessive database writes.
- Reject revoked sessions.
- Reject expired sessions.
- Never store auth tokens in localStorage.
- Never expose session tokens to client JavaScript.
- Verify Origin for state-changing requests.
- Add CSRF protection where needed.
- Use consistent 401 and 403 responses.

Do not reveal whether a user email exists in the system.

Provide a secure bootstrap process for the first system administrator.

Possible bootstrap approach:

- A CLI script accepts an email.
- Inserts or activates the initial system admin membership.
- Requires explicit production confirmation.
- Does not contain a default credential.
- Documents how to revoke bootstrap access afterward.

===============================================================================
8. AUTHORIZATION
===============================================================================

All authorization must be enforced in the Worker.

Do not rely on hidden buttons or client-side checks.

Roles:

-------------------------------------------------------------------------------
8.1 system_admin
-------------------------------------------------------------------------------

Can:

- Create organizations.
- Activate/deactivate organizations.
- Invite organization administrators.
- View platform health.
- View migration status.
- Assist with support actions.

System admins must not casually browse student records.

Implement explicit support access:

- Require selecting an organization.
- Require a support reason.
- Create an audit record.
- Display a visible support-mode banner.
- Make support mode time-limited where practical.

-------------------------------------------------------------------------------
8.2 organization_admin
-------------------------------------------------------------------------------

Can manage within their organization:

- Settings.
- Memberships.
- Teachers.
- Classes.
- Tracks.
- Levels.
- Lessons.
- Students.
- Guardians.
- Imports.
- Progress reports.
- Notifications.
- Parent links.
- Data exports.
- Organization branding.

-------------------------------------------------------------------------------
8.3 teacher
-------------------------------------------------------------------------------

Can:

- View assigned classes.
- View students enrolled in assigned classes.
- View progress history for assigned students.
- Save drafts.
- Publish updates.
- Notify guardians when permitted.
- Correct their own recent updates according to organization policy.

Cannot:

- Manage organization settings.
- Manage unrelated classes.
- View unrelated students.
- Invite users.
- Perform organization-wide exports.

-------------------------------------------------------------------------------
8.4 read_only
-------------------------------------------------------------------------------

Can view authorized internal reports.

Cannot create, update, publish, delete, import, or notify.

===============================================================================
9. GUARDIAN ACCESS
===============================================================================

Parents and guardians must not require:

- A Google account.
- A staff login.
- A password.
- Spreadsheet access.

Use secure guardian access tokens.

Guardian token requirements:

- At least 32 random bytes.
- Base64url plaintext in the link.
- SHA-256 hash stored in D1.
- Configurable expiration.
- Revocable.
- Rotatable.
- Last-used timestamp.
- Rate-limited validation attempts.
- No sequential IDs in the URL.
- No parent email in the URL.
- No student ID in the URL.
- No organization ID in the URL.
- `Cache-Control: no-store`.
- `Referrer-Policy: no-referrer`.
- Avoid loading third-party scripts on parent report pages.
- Do not expose drafts.
- Do not expose inactive internal data except where necessary for history.

A guardian token opens one guardian portal.

The portal may display multiple linked children.

Provide administrator actions:

- Generate link.
- Copy link.
- Send link.
- Rotate link.
- Revoke link.
- View expiration.
- Preview parent portal.
- Review last-used date.

Do not display the plaintext token again after initial generation unless the app
generates a new token.

===============================================================================
10. MOBILE-FIRST EXPERIENCE
===============================================================================

The application must feel like a real mobile app when opened in a phone browser.

Required design behavior:

- Responsive from 320 px upward.
- No horizontal overflow.
- Large touch targets, approximately 44 px minimum.
- Mobile bottom navigation.
- Desktop sidebar where appropriate.
- Sticky primary actions.
- Cards instead of wide tables on phones.
- Single-column forms on small screens.
- Clear typography.
- Accessible labels.
- Keyboard support.
- Visible focus states.
- Safe-area inset support.
- Skeleton loading states.
- Empty-state guidance.
- Success confirmations.
- Error recovery.
- Confirmation for destructive actions.
- Unsaved-change warnings.
- Optimistic UI only when failure recovery is reliable.
- Respect reduced-motion preferences.
- Avoid excessive animations.
- Full Turkish character support.
- English and Turkish interface.
- Organization-configurable default language.

PWA requirements:

- Installable manifest.
- Icons.
- Theme color.
- App shell caching.
- Offline-friendly navigation shell.
- Do not cache private API data.
- Do not cache student reports.
- Do not cache guardian portal responses.
- Do not silently save sensitive student data indefinitely.
- Temporary unsaved form state may be retained in sessionStorage.
- Saving and publishing require a network connection.
- Clearly indicate offline state.

Mobile teacher navigation:

- Home
- Classes
- Students
- Reports
- More

Mobile administrator navigation:

- Dashboard
- Students
- Program
- Reports
- Settings

===============================================================================
11. REQUIRED APPLICATION SCREENS
===============================================================================

-------------------------------------------------------------------------------
11.1 Public staff login
-------------------------------------------------------------------------------

Include:

- Organization branding.
- QuranTrack branding.
- Email field.
- Turnstile.
- “Send Secure Sign-In Link.”
- Generic confirmation message.
- Language switcher.
- Troubleshooting text.
- Accessibility support.
- Loading and failure states.

Do not reveal whether an email is registered.

-------------------------------------------------------------------------------
11.2 Magic-link verification
-------------------------------------------------------------------------------

Include:

- Loading state.
- Expired-link message.
- Already-used-link message.
- Invalid-link message.
- Request-new-link action.
- Safe redirect.
- No token exposure after verification.

-------------------------------------------------------------------------------
11.3 Staff dashboard
-------------------------------------------------------------------------------

Organization administrator dashboard:

- Active students.
- Active teachers.
- Active classes.
- Published updates this week.
- Students without recent updates.
- Pending notifications.
- Failed notifications.
- Recent activity.
- Quick actions.
- Import status.
- Setup-completion status.

Teacher dashboard:

- Assigned classes.
- Students needing an update.
- Recent drafts.
- Recent published updates.
- Fast “Record Progress” action.
- Failed parent notifications connected to their updates.
- Upcoming or current homework where useful.

-------------------------------------------------------------------------------
11.4 Class list
-------------------------------------------------------------------------------

Teacher sees assigned classes only.

Include:

- Search.
- Student count.
- Last class activity.
- Meeting schedule.
- Tap-friendly cards.
- Missing-update summary.

Admins may see all organization classes.

-------------------------------------------------------------------------------
11.5 Class detail
-------------------------------------------------------------------------------

Include:

- Class name.
- Assigned teachers.
- Student cards.
- Student tracks and current levels.
- Last update date.
- Missing-update indicator.
- Search.
- Filters.
- Record-progress action.
- Mobile-friendly card layout.

-------------------------------------------------------------------------------
11.6 Student detail
-------------------------------------------------------------------------------

Include:

- Display name.
- Active class enrollment.
- Guardians.
- Assigned tracks.
- Current level for every track.
- Recently passed lessons.
- Recently practiced lessons.
- Latest teacher feedback.
- Current homework.
- Published learning-history timeline.
- Drafts visible only to authorized staff.
- Record Progress action.
- Print-friendly progress report.
- Admin-only edit action.
- Parent-portal preview for admins.

Do not show sensitive internal notes to parents.

-------------------------------------------------------------------------------
11.7 Record Progress
-------------------------------------------------------------------------------

This is the most important teacher screen.

Required flow:

1. Confirm class and student.
2. Display each assigned program track.
3. Display the current level in each track.
4. Display lessons in configured order.
5. Visually distinguish:
   - Already passed.
   - Current or next.
   - Not reached.
   - Previously practiced.
   - Inactive historical lesson.
6. Let the teacher choose one or more lessons.
7. For every selected lesson choose:
   - Passed.
   - Practiced.
   - Needs Practice.
   - Assigned.
8. Add an optional lesson-specific note.
9. Add overall teacher feedback.
10. Add homework.
11. Save Draft.
12. Publish Progress.
13. Publish & Notify Parent.

Support repeated practice.

Do not block a teacher from recording practice for an already passed lesson.

Warnings:

- Lesson already passed.
- No selected lesson, feedback, or homework.
- Missing guardian email when notification is requested.
- Unsaved changes.
- Student is inactive.
- Teacher is no longer assigned.
- Selected level does not match assigned track.
- Duplicate submission retry.

After publication:

- Show whether progress was saved.
- Show whether notification succeeded.
- If email fails, make clear that progress was still saved.
- Offer retry when authorized.

-------------------------------------------------------------------------------
11.8 Program administration
-------------------------------------------------------------------------------

Provide separate screens for:

- Program Tracks.
- Levels.
- Lessons.

Capabilities:

- Create.
- Edit.
- Reorder.
- Activate/deactivate.
- Search.
- Filter.
- Duplicate track structure where appropriate.
- Duplicate a level and lessons.
- Bulk paste lesson names.
- CSV import.
- CSV export.
- Show usage count.
- Warn before deactivation.
- Prevent hard deletion of historically referenced items.
- Drag-and-drop ordering on desktop where accessible.
- Up/down controls as an accessible alternative.
- Mobile-friendly card editing.

-------------------------------------------------------------------------------
11.9 Student administration
-------------------------------------------------------------------------------

Capabilities:

- Create student.
- Edit student.
- Deactivate/reactivate student.
- Assign classes.
- Assign tracks.
- Assign current levels independently by track.
- Link guardians.
- Select primary guardian.
- Set notification preferences.
- Search.
- Filter.
- CSV import/export.
- Bulk class assignment.
- Bulk track assignment.
- Bulk level assignment with confirmation.
- Duplicate detection.
- Legacy-ID support.
- Display validation errors clearly.

-------------------------------------------------------------------------------
11.10 Teacher and membership administration
-------------------------------------------------------------------------------

Capabilities:

- Invite by email.
- Assign role.
- Assign classes.
- Activate/deactivate.
- Resend sign-in link.
- Revoke sessions.
- Review last activity.
- Remove class assignment.
- Prevent removal of the last active organization administrator without
  confirmation and a replacement.

-------------------------------------------------------------------------------
11.11 Guardian administration
-------------------------------------------------------------------------------

Capabilities:

- Create guardian.
- Edit guardian.
- Link to multiple children.
- Set relationship.
- Set primary contact.
- Enable/disable notifications.
- Generate parent portal link.
- Rotate link.
- Revoke link.
- Resend link.
- Preview parent portal.
- View last-used date.
- Detect duplicate guardian email.
- Merge duplicates only through a careful administrator workflow with audit log.

-------------------------------------------------------------------------------
11.12 Parent Progress Portal
-------------------------------------------------------------------------------

This must be especially simple and mobile-friendly.

Include:

- Organization branding.
- QuranTrack branding.
- Guardian greeting.
- All linked children.
- Child selector when necessary.
- Current tracks.
- Current level in each track.
- Latest published progress update.
- Recently passed lessons.
- Recently practiced lessons.
- Teacher feedback.
- Current homework.
- Update date.
- Learning-history timeline.
- Completion progress for the current level.
- Print button.
- Print stylesheet.
- Browser “Save as PDF” guidance.
- Language toggle.
- Expired-link message.
- Request-new-link contact guidance.

Do not include:

- Admin controls.
- Staff navigation.
- Drafts.
- Internal IDs.
- Internal notes.
- Unrelated children.
- Unrelated organizations.
- Raw teacher email.
- Audit data.

Teacher name should be shown only when organization settings allow it.

-------------------------------------------------------------------------------
11.13 Reports
-------------------------------------------------------------------------------

Organization admin reports:

- Progress updates by date range.
- Progress by teacher.
- Progress by class.
- Students without updates during a configurable period.
- Lesson completion summary.
- Track and level progress.
- Notification status.
- Failed emails.
- Parent portal link status.
- CSV export.
- Print-friendly individual report.
- Bulk send latest progress reports.
- Retry failed notifications.

Teacher reports:

- Assigned students only.
- Recent progress.
- Missing updates.
- Drafts.
- Published reports.
- Export only when organization policy allows.

Use pagination for potentially large datasets.

-------------------------------------------------------------------------------
11.14 Organization settings
-------------------------------------------------------------------------------

Include:

- Organization name.
- Slug.
- Logo URL or upload.
- Primary color.
- Time zone.
- Default locale.
- Progress-report title.
- Missing-update threshold.
- Guardian-token lifetime.
- Email sender display name.
- Reply-to email.
- Email subject template.
- Email HTML template.
- Email plain-text template.
- Notification defaults.
- Whether teacher names appear to guardians.
- Terminology customization where practical.
- Maintenance-mode setting.
- Application version display.

Validate all settings.

Preview branding and parent report before saving.

-------------------------------------------------------------------------------
11.15 System administration
-------------------------------------------------------------------------------

System administrators can:

- Create organizations.
- Deactivate/reactivate organizations.
- Invite organization admins.
- Review application health.
- Review migration status.
- Review free-tier operational warnings.
- Enter audited support mode.
- Exit support mode.
- Review application version.

Do not expose secrets or raw tokens.

===============================================================================
12. EMAIL RELAY USING GOOGLE APPS SCRIPT
===============================================================================

Do not use a paid transactional email provider.

Create a complete Apps Script email relay in:

    apps-script-mail-relay/Code.gs

Also create:

    apps-script-mail-relay/appsscript.json
    apps-script-mail-relay/README.md

The relay will be deployed by an organization under an existing Google Workspace
or Gmail account.

It may send from an alias attached to the executing account.

Use GmailApp when a configured From alias is required.

Do not hard-code:

- Shared secret.
- Allowed sender alias.
- Default reply-to.
- Allowed application origin.
- Organization display name.
- Test recipient.

Store configuration in Apps Script PropertiesService.

The relay must expose `doPost(e)` and perform these steps:

1. Safely parse JSON.
2. Reject malformed requests.
3. Accept:
   - timestamp
   - nonce
   - eventType
   - recipient
   - subject
   - textBody
   - htmlBody
   - replyTo
   - requestedAlias
   - signature
4. Reject timestamps outside a short configured window.
5. Reconstruct a canonical signed payload.
6. Verify HMAC-SHA256 using the shared secret.
7. Use constant-time comparison where practical.
8. Prevent nonce replay using CacheService and/or PropertiesService.
9. Validate recipient email format.
10. Limit subject and body lengths.
11. Confirm the requested alias appears in `GmailApp.getAliases()`.
12. Fall back safely to the executing account if no alias is allowed.
13. Set a configurable display name.
14. Set reply-to when valid.
15. Send plain-text and HTML bodies.
16. Return structured JSON.
17. Avoid logging full email bodies.
18. Avoid logging parent report tokens.
19. Avoid logging student details.
20. Use LockService where necessary.
21. Include configuration setup helpers.
22. Include a test function that sends only to the deploying account.
23. Include a function that lists configured aliases safely.
24. Include deployment documentation.
25. Include alias configuration guidance.
26. Include instructions for deploying a new Apps Script version.

Expected relay request response:

Success:

    {
      "ok": true,
      "messageId": "optional-redacted-value"
    }

Failure:

    {
      "ok": false,
      "error": {
        "code": "SIGNATURE_INVALID",
        "message": "User-safe message"
      }
    }

The Cloudflare Worker must:

- Store MAIL_RELAY_URL as a Worker secret or environment variable.
- Store MAIL_RELAY_SECRET as a Worker secret.
- Never expose either value to React.
- Sign every request.
- Use a unique nonce.
- Use a current timestamp.
- Record delivery results in notification_log.
- Retry one transient failure.
- Not retry signature or validation failures.
- Continue saving published progress if email fails.
- Tell the teacher that publication succeeded but email failed.
- Avoid logging full tokens and email content.

Email types:

- Staff magic-link login.
- Staff invitation.
- Parent progress notification.
- Parent portal link.
- Bulk latest-progress summary.
- Guardian email-change verification if implemented.

Parent progress email must include:

- Organization name.
- QuranTrack name.
- Student display name.
- Update date.
- Newly passed or practiced lessons.
- Teacher feedback.
- Homework.
- Secure View Full Progress button.
- Plain-text fallback.
- Reply-to address.
- No internal database IDs.

Escape all user-provided content before inserting it into HTML.

Organization administrators may edit email templates.

Template placeholders may include:

- {{organizationName}}
- {{studentName}}
- {{updateDate}}
- {{lessonSummary}}
- {{teacherFeedback}}
- {{homework}}
- {{parentPortalUrl}}
- {{teacherName}}

Implement safe placeholder rendering.

Do not implement arbitrary executable templates.

===============================================================================
13. PROGRESS PUBLICATION AND NOTIFICATIONS
===============================================================================

Teacher actions:

- Save Draft.
- Publish Progress.
- Publish & Notify Parent.

Saving a draft:

- Requires teacher authorization.
- Saves progress update and items.
- Does not change student completion status.
- Does not notify guardians.
- May be edited by the authorized teacher.
- Must not appear in the parent portal.

Publishing must:

1. Revalidate teacher authorization.
2. Validate student/class relationship.
3. Validate tracks, levels, and lessons.
4. Validate selected outcomes.
5. Create or update the progress update.
6. Create progress items.
7. Update student_lesson_status.
8. Record an audit event.
9. Use a D1 batch for related database writes.
10. Complete database writes before email is attempted.
11. Attempt notification only after successful publication.
12. Record each notification attempt.
13. Return separate publication and email statuses.
14. Be idempotent.
15. Avoid duplicate notifications.

Bulk notification must:

- Be organization-admin-only.
- Show recipient count before sending.
- Require confirmation.
- Exclude opted-out guardians.
- Exclude invalid or missing emails.
- Avoid duplicate sends for the same update.
- Process in manageable batches.
- Return progress status to the UI.
- Avoid holding one browser request open indefinitely.
- Support retrying failed items.
- Preserve an audit trail.

For the initial release, manual bulk sending is sufficient.

Create an optional future design for scheduled weekly summaries, but:

- Keep it disabled by default.
- Do not make scheduled processing necessary for the MVP.
- Do not require a paid Cloudflare feature.
- Document it separately.

===============================================================================
14. DYNAMIC PROGRESS REPORTS
===============================================================================

Do not create separate Google spreadsheets for students.

Generate reports dynamically from D1.

Distinguish:

- Progress Update:
  One teacher submission for one student.

- Learning History:
  Chronological published updates.

- Progress Report:
  Parent-facing or printable summary.

- Current Lesson Status:
  Most recent status summary.

- Passed Lesson:
  Successfully completed.

- Practiced Lesson:
  Reviewed without newly completing it.

- Homework:
  Current teacher assignment.

Each progress report should show:

- Organization.
- Student.
- Report date.
- Assigned tracks.
- Current level in every track.
- Recently passed lessons.
- Recently practiced lessons.
- Latest teacher feedback.
- Current homework.
- Progress timeline.
- Current-level completion count.
- Teacher name when permitted.
- Print-friendly layout.

Provide:

- Internal staff view.
- Secure parent view.
- Browser print view.
- Browser save-as-PDF guidance.
- CSV export for administrators.

Do not implement a paid or external server-side PDF service.

===============================================================================
15. LEGACY GOOGLE SHEETS IMPORT
===============================================================================

The organization currently has a Google Sheets backend with these tabs and
columns.

Settings:

    key
    value
    description

Students:

    studentId
    studentName
    parentName
    parentEmail
    levelId
    classId
    teacherId
    active
    notes

Teachers:

    teacherId
    teacherName
    teacherEmail
    active
    notes

Classes:

    classId
    className
    teacherId
    active
    notes

Levels:

    levelId
    levelName
    sortOrder
    active

Lessons:

    lessonId
    levelId
    lessonName
    sortOrder
    defaultHomework
    active

Progress:

    progressId
    timestamp
    studentId
    lessonId
    passed
    teacherId
    teacherComment
    homework
    notifyParent
    parentNotified
    notifiedAt

ParentTokens:

    token
    studentId
    parentEmail
    active
    createdAt
    expiresAt

EmailLog:

    emailLogId
    timestamp
    studentId
    parentEmail
    subject
    status
    message

Implement a CSV import wizard.

Requirements:

- Accept files individually.
- Accept multiple selected files.
- Identify the source tab from filename or user selection.
- Let the administrator map columns.
- Let the administrator choose a default program track for imported levels and
  lessons.
- Preview rows before committing.
- Validate emails.
- Validate booleans.
- Validate IDs.
- Validate dates.
- Validate references.
- Show row-level errors.
- Support dry run.
- Support upsert by legacy ID.
- Preserve legacy IDs in external_id or migration metadata.
- Avoid partial silent imports.
- Use D1 batch operations.
- Produce an import summary.
- Produce a downloadable error CSV.
- Record import jobs.
- Record audit events.
- Allow cancelling before commit.
- Do not log complete sensitive files.

Student import behavior:

- Preserve studentName as display_name.
- Split first and last name only when confidently possible.
- Create guardians from parentName and parentEmail.
- Link guardians to students.
- Avoid duplicate guardians when the same parent email appears for siblings.
- Create class enrollments.
- Create teacher memberships or staged teacher invitations.
- Map the legacy level to a selected default track.
- Create student_track_levels.

Progress import behavior:

- Convert passed=TRUE to a published progress update item with `passed`.
- Preserve timestamp.
- Preserve teacher feedback.
- Preserve homework.
- Preserve teacher relationship when identifiable.
- Group records sensibly when multiple lessons share the same student and
  timestamp.
- Do not fabricate missing data silently.

ParentTokens import behavior:

- Never import plaintext legacy tokens into guardian_access_tokens.
- Generate new secure guardian tokens after import.
- Explain that old links will not work.

EmailLog import behavior:

- Import only when explicitly selected.
- Treat as historical/audit information.
- Do not use it to suppress new notifications unless clearly mapped.

Also provide command-line import utilities using Node and Wrangler for technical
administrators.

===============================================================================
16. ORGANIZATION ONBOARDING
===============================================================================

Implement system-admin organization creation.

System admin flow:

1. Create organization.
2. Set slug.
3. Set name.
4. Set locale.
5. Set time zone.
6. Set color and branding.
7. Invite organization administrator.
8. Optionally seed standard tracks and lessons.
9. Activate organization.

Organization-admin onboarding wizard:

1. Confirm organization details.
2. Set branding.
3. Choose English or Turkish.
4. Configure email sender display name and reply-to.
5. Create or import tracks.
6. Create or import levels.
7. Create or import lessons.
8. Add teachers.
9. Create classes.
10. Import students and guardians.
11. Review duplicate warnings.
12. Generate guardian links.
13. Preview parent portal.
14. Send test email.
15. Review setup checklist.
16. Finish onboarding.

The onboarding wizard must:

- Save progress.
- Allow returning later.
- Show incomplete steps.
- Avoid requiring code changes.
- Include plain-language guidance.
- Include sample data only when explicitly selected.
- Clearly separate demo and production records.

===============================================================================
17. SECURITY AND PRIVACY
===============================================================================

This application stores information about children.

Apply strong privacy defaults.

Mandatory protections:

- No public student directory.
- No sequential parent URLs.
- No plaintext login tokens.
- No plaintext session tokens.
- No plaintext guardian tokens.
- No secrets in frontend code.
- No direct D1 access from the browser.
- Tenant authorization on every server query.
- Prepared SQL statements only.
- Zod validation.
- Secure cookies.
- Rate limiting.
- Turnstile validation server-side.
- HMAC-signed email relay requests.
- Output escaping.
- Safe HTML email rendering.
- Content Security Policy.
- X-Content-Type-Options: nosniff.
- Referrer-Policy.
- Permissions-Policy.
- Cache-Control: no-store for private responses.
- Minimal PII in logs.
- Redacted emails in operational errors.
- Redacted tokens.
- Request IDs.
- Confirmation for bulk/destructive actions.
- Soft deletion/deactivation for historical entities.
- Audit administrative changes.
- Data export capability.
- Data deletion/anonymization tools.
- Session revocation.
- Parent-token rotation.
- Organization-isolation tests.
- No third-party analytics.
- No advertising trackers.
- No social media tracking pixels.

Do not claim legal compliance with:

- FERPA.
- COPPA.
- GDPR.
- HIPAA.
- Any other legal framework.

Document technical privacy controls and state that legal compliance requires
professional review.

Security headers must be applied to both SPA and API responses where appropriate.

CSP should avoid `unsafe-eval`.

Avoid `unsafe-inline` where practical.

Do not use third-party CDN scripts in production.

Bundle application dependencies.

===============================================================================
18. OPERATIONAL ROBUSTNESS
===============================================================================

Add:

- Consistent API errors.
- Request IDs.
- Health endpoint.
- Version endpoint.
- Database migration status.
- Empty-state guidance.
- Import previews.
- Duplicate detection.
- Referential-integrity checks.
- Audit history.
- Failed-email retry.
- CSV exports.
- Organization backup instructions.
- D1 export instructions.
- D1 restore instructions.
- Seed data.
- Demo organization.
- Demo users.
- Demo students.
- Demo guardian data using clearly fake addresses.
- Feature flags.
- Maintenance mode.
- Version display.
- Free-tier usage warning documentation.

Health endpoint must reveal no secrets.

Example:

    GET /api/v1/health

Response:

    {
      "ok": true,
      "data": {
        "status": "healthy",
        "version": "x.y.z"
      },
      "requestId": "..."
    }

Do not include:

- Database IDs.
- Account identifiers.
- Secret values.
- Email relay URL.
- Environment-variable values.

Create maintenance mode that:

- Allows system administrators.
- Blocks normal writes.
- Displays a friendly page.
- Does not expose technical details.

===============================================================================
19. API DESIGN
===============================================================================

Use a versioned JSON API:

    /api/v1/

Suggested endpoint groups:

    /api/v1/auth/*
    /api/v1/me
    /api/v1/organizations/*
    /api/v1/memberships/*
    /api/v1/tracks/*
    /api/v1/levels/*
    /api/v1/lessons/*
    /api/v1/classes/*
    /api/v1/students/*
    /api/v1/guardians/*
    /api/v1/progress/*
    /api/v1/reports/*
    /api/v1/notifications/*
    /api/v1/imports/*
    /api/v1/settings/*
    /api/v1/system/*

Use consistent envelopes.

Success:

    {
      "ok": true,
      "data": {},
      "requestId": "..."
    }

Error:

    {
      "ok": false,
      "error": {
        "code": "VALIDATION_ERROR",
        "message": "User-safe message",
        "fields": {}
      },
      "requestId": "..."
    }

Do not return:

- Stack traces.
- Raw SQL errors.
- Secret values.
- Internal filesystem paths.
- Raw token hashes.

Use pagination for list endpoints.

Pagination response should include:

- items
- page
- pageSize
- total when reasonably efficient
- hasNextPage

Set reasonable maximum page sizes.

Implement idempotency keys for publication and bulk notification actions.

===============================================================================
20. INTERNATIONALIZATION
===============================================================================

Support:

- English.
- Turkish.

Requirements:

- All interface strings from translation files.
- No scattered hard-coded UI strings.
- Locale-aware dates.
- Locale-aware time formatting.
- Proper Turkish characters.
- Language selector.
- Organization default language.
- User preference where practical.
- Parent portal language toggle.
- Email templates in both languages.
- Fallback to English.
- Test missing-key behavior.

Do not machine-translate Quran lesson names automatically.

Lesson names and descriptions are administrator-provided content.

===============================================================================
21. BRANDING
===============================================================================

Official brand:

    QuranTrack

Full title:

    QuranTrack — Quran Learning & Progress Platform

Default organization:

    Peace & Harmony Foundation

Do not hard-code organization-specific information outside seed/default
configuration.

Visual direction:

- Mobile-first.
- Calm and respectful.
- Clean cards.
- Warm neutral backgrounds.
- Configurable accent color.
- Large touch targets.
- Clear progress indicators.
- Minimal decorative imagery.
- No childish cartoon style.
- Appropriate for children, teenagers, adults, teachers, and parents.
- English and Turkish.
- Preserve uploaded logo aspect ratios.
- No invented organization logo.
- No copyrighted artwork.
- No real student data in screenshots.
- Avoid spreadsheet-like layouts in normal workflows.

Use neutral placeholder QuranTrack branding.

===============================================================================
22. TESTING
===============================================================================

Create meaningful tests.

Do not create placeholder tests that always pass.

-------------------------------------------------------------------------------
22.1 Unit tests
-------------------------------------------------------------------------------

Test:

- Secure token generation.
- Base64url encoding.
- SHA-256 token hashing.
- HMAC email signatures.
- Constant-time comparison helper.
- Session expiration.
- Login-token expiration.
- Authorization helpers.
- Tenant scoping.
- Email normalization.
- CSV parsing.
- Boolean parsing.
- Date parsing.
- Validation.
- Progress status transitions.
- Lesson completion calculation.
- Repeated-practice behavior.
- Notification deduplication.
- Email-template escaping.
- English translations.
- Turkish translations.
- Locale date formatting.
- Logo validation.
- Request-ID generation.

-------------------------------------------------------------------------------
22.2 Integration tests
-------------------------------------------------------------------------------

Test:

- Create organization.
- Create system admin.
- Invite organization admin.
- Create tracks.
- Create levels.
- Create lessons.
- Create teacher.
- Create class.
- Assign teacher.
- Create student.
- Create guardian.
- Link guardian.
- Enroll student.
- Assign student track/level.
- Save draft.
- Verify draft is not visible to parent.
- Publish progress.
- Update lesson status.
- Record audit log.
- Generate guardian token.
- Load parent portal.
- Block another guardian.
- Block another organization.
- Revoke guardian token.
- Rotate guardian token.
- Log successful email.
- Log failed email.
- Retry failed email.
- Import legacy CSV.
- Reject invalid import references.
- Preserve publication if email fails.

-------------------------------------------------------------------------------
22.3 Playwright E2E tests
-------------------------------------------------------------------------------

Use mobile viewport tests.

Required flows:

1. Staff requests magic link.
2. Teacher opens assigned class.
3. Teacher selects student.
4. Teacher records practiced lesson.
5. Teacher records passed lesson.
6. Teacher saves draft.
7. Teacher publishes progress.
8. Teacher requests parent notification.
9. Parent opens secure report.
10. Parent switches children.
11. Admin creates a track.
12. Admin creates and reorders levels.
13. Admin creates and reorders lessons.
14. Admin imports sample CSV.
15. Unauthorized user is blocked.
16. Parent token cannot access unrelated data.
17. Revoked parent token fails.
18. App has no horizontal overflow at 320 px.
19. Keyboard navigation works for main actions.
20. Offline state prevents saving with a clear message.

Use Cloudflare Turnstile test keys or mock Turnstile in automated testing.

-------------------------------------------------------------------------------
22.4 Required commands
-------------------------------------------------------------------------------

Create these commands:

    npm run dev
    npm run build
    npm run preview
    npm run lint
    npm run format
    npm run format:check
    npm run typecheck
    npm run test
    npm run test:watch
    npm run test:e2e
    npm run db:migrate:local
    npm run db:migrate:remote
    npm run db:seed:local
    npm run deploy

All must be documented.

Before declaring completion, these must pass:

    npm run lint
    npm run format:check
    npm run typecheck
    npm run test
    npm run build

Run E2E tests where the environment supports browser execution.

Report honestly if E2E tests could not be executed.

===============================================================================
23. LOCAL DEVELOPMENT
===============================================================================

Document exact steps for a new developer.

Include:

1. Required Node version.
2. npm installation.
3. Cloudflare Wrangler login.
4. Creating local environment files.
5. Creating local D1.
6. Applying migrations.
7. Seeding demo data.
8. Starting Vite/Worker development.
9. Running unit tests.
10. Running E2E tests.
11. Testing the Apps Script relay locally or against a test deployment.
12. Resetting local data.
13. Inspecting local D1.
14. Creating a system admin.
15. Creating a demo organization.

Provide `.dev.vars.example`.

Do not commit live secrets.

Example variable names:

    SESSION_SIGNING_SECRET
    TOKEN_HASH_PEPPER
    MAIL_RELAY_URL
    MAIL_RELAY_SECRET
    TURNSTILE_SITE_KEY
    TURNSTILE_SECRET_KEY
    APP_BASE_URL
    ENVIRONMENT

Frontend-accessible variables must be explicitly separated.

Never place secrets in `VITE_*` variables.

===============================================================================
24. DEPLOYMENT
===============================================================================

Provide exact deployment documentation for Cloudflare Workers with Static Assets.

Include:

1. Create Cloudflare account.
2. Install dependencies.
3. Log in through Wrangler.
4. Create production D1 database.
5. Add D1 binding to wrangler.jsonc.
6. Apply remote migrations.
7. Configure Worker secrets.
8. Configure Turnstile.
9. Configure SPA static-asset routing.
10. Build application.
11. Deploy Worker.
12. Attach custom domain.
13. Verify HTTPS.
14. Deploy Apps Script mail relay.
15. Configure Gmail alias.
16. Configure relay Script Properties.
17. Add Worker relay secrets.
18. Send test login email.
19. Send test parent email.
20. Bootstrap first system administrator.
21. Create first organization.
22. Verify parent portal.
23. Verify security headers.
24. Verify no private caching.
25. Verify database export.

Preferred production domain:

    qurantrack.istanbulcenterjax.org

Use `wrangler.jsonc`.

Configure:

- Worker name.
- Compatibility date.
- Main Worker entry.
- Static assets.
- SPA fallback.
- D1 binding.
- Environment variables.
- Preview/production environments where practical.

Do not include real IDs in committed examples.

Provide rollback instructions.

Provide D1 backup/export instructions.

Provide D1 Time Travel restore guidance where available, but do not rely on it as
the only backup.

===============================================================================
25. GITHUB AND RELEASE WORKFLOW
===============================================================================

The repository should be usable as a private GitHub repository.

Recommended branch model:

- main
- feature branches

Create:

- `.gitignore`
- Pull request template.
- Issue templates if useful.
- Optional GitHub Actions workflow for lint, type checking, tests, and build.

Do not require GitHub Actions for deployment.

Manual deployment through Wrangler must work.

If a CI workflow is included:

- Use only free-compatible actions.
- Do not expose secrets.
- Do not deploy pull requests to production.
- Run lint, type checking, tests, and build.
- Keep deployment optional.

Use semantic versioning.

Display application version in the system settings screen.

Create a CHANGELOG.

License the project under the MIT License.

===============================================================================
26. DATA EXPORT, BACKUP, AND DELETION
===============================================================================

Organization administrators must be able to export organization-owned data.

Provide CSV exports for:

- Students.
- Guardians.
- Classes.
- Teachers/memberships.
- Tracks.
- Levels.
- Lessons.
- Progress updates.
- Progress items.
- Notifications.

Provide a complete organization export format.

System administrators should be able to export the D1 database through documented
Wrangler commands.

Deletion/anonymization behavior:

- Do not casually hard-delete progress history.
- Allow student deactivation.
- Allow guardian deactivation.
- Provide an administrator workflow to anonymize a student when legally or
  operationally required.
- Require confirmation.
- Record audit event.
- Clearly explain what is retained.
- Do not leave orphaned records.
- Do not claim legal sufficiency.

===============================================================================
27. DOCUMENTATION FOR NONTECHNICAL USERS
===============================================================================

Write complete guides.

-------------------------------------------------------------------------------
27.1 ADMIN_GUIDE.md
-------------------------------------------------------------------------------

Cover:

- Signing in.
- Initial setup.
- Organization settings.
- Adding teachers.
- Creating classes.
- Creating tracks.
- Creating levels.
- Creating lessons.
- Reordering lessons.
- Adding students.
- Linking guardians.
- Importing students.
- Assigning levels.
- Reviewing progress.
- Reviewing missing updates.
- Sending parent reports.
- Retrying failed emails.
- Rotating parent links.
- Exporting data.
- Deactivating records.
- Understanding drafts vs published progress.
- Troubleshooting common errors.

Use plain language.

Represent screenshots with descriptive placeholders where actual screenshots
cannot be generated.

-------------------------------------------------------------------------------
27.2 TEACHER_GUIDE.md
-------------------------------------------------------------------------------

Cover:

- Signing in.
- Opening a class.
- Choosing a student.
- Understanding tracks and levels.
- Marking passed lessons.
- Recording practice.
- Recording needs-practice.
- Assigning a lesson.
- Adding feedback.
- Adding homework.
- Saving drafts.
- Publishing.
- Publishing and notifying.
- Correcting a report.
- Understanding notification failures.
- Mobile use.

-------------------------------------------------------------------------------
27.3 PARENT_GUIDE.md
-------------------------------------------------------------------------------

Cover:

- Opening the secure link.
- Switching children.
- Reading levels and tracks.
- Reading teacher feedback.
- Viewing homework.
- Viewing learning history.
- Printing.
- Saving as PDF.
- Changing language.
- Handling expired links.
- Requesting a replacement link.
- Keeping the link private.

-------------------------------------------------------------------------------
27.4 DEPLOYMENT.md
-------------------------------------------------------------------------------

Write for a moderately technical administrator.

Assume no prior Cloudflare experience.

Include exact commands and expected outputs where practical.

-------------------------------------------------------------------------------
27.5 SISTER_ORG_ONBOARDING.md
-------------------------------------------------------------------------------

Write for nontechnical organization administrators.

Explain:

- How invitation works.
- How to configure branding.
- How to add teachers.
- How to import students.
- How to define their Quran program.
- How parent links work.
- How to export their data.
- Who controls centrally hosted data.
- How to request support.

Clearly distinguish:

- Central hosted organization onboarding.
- Independent self-hosting.

-------------------------------------------------------------------------------
27.6 PRIVACY_AND_SECURITY.md
-------------------------------------------------------------------------------

Describe:

- Data stored.
- Token security.
- Staff authentication.
- Parent access.
- Tenant isolation.
- Logging policy.
- Data exports.
- Data deletion/anonymization.
- Email relay.
- Backups.
- Technical limitations.
- Need for legal review.

Do not make unsupported compliance claims.

===============================================================================
28. DEMO AND SEED DATA
===============================================================================

Create safe demo data.

Include:

- Demo organization.
- English and Turkish settings.
- Two program tracks.
- Multiple levels.
- Several lessons.
- Two teachers.
- Two classes.
- Several fictional students.
- Fictional guardians.
- Sample progress.
- Sample homework.
- Sample notifications.

Use clearly fake email domains such as:

    example.com

Do not use real children’s names or contact information.

Make it easy to reset local demo data.

Production deployment must not automatically load demo records.

===============================================================================
29. IMPLEMENTATION PHASES
===============================================================================

Follow this order.

-------------------------------------------------------------------------------
Phase 0 — Repository inspection and planning
-------------------------------------------------------------------------------

- Inspect repository.
- Create IMPLEMENTATION_PLAN.md.
- Document assumptions.
- Scaffold project.
- Configure TypeScript.
- Configure Tailwind.
- Configure Cloudflare Vite plugin.
- Configure Hono.
- Configure linting.
- Configure formatting.
- Configure Vitest.
- Configure Playwright.
- Configure PWA.
- Create basic Worker/static-asset deployment.
- Verify local hello-world application.

-------------------------------------------------------------------------------
Phase 1 — Database and core domain
-------------------------------------------------------------------------------

- Create D1 migrations.
- Add foreign keys and indexes.
- Create repositories.
- Create domain services.
- Create validation schemas.
- Add seed data.
- Add local database commands.
- Test tenant-scoped repositories.

-------------------------------------------------------------------------------
Phase 2 — Authentication and authorization
-------------------------------------------------------------------------------

- Magic-link requests.
- Turnstile validation.
- Login tokens.
- Sessions.
- Cookies.
- Memberships.
- Roles.
- Tenant middleware.
- Logout.
- Session revocation.
- Bootstrap system admin.
- Apps Script email relay.
- Authentication tests.

-------------------------------------------------------------------------------
Phase 3 — Organization and program administration
-------------------------------------------------------------------------------

- Organization setup.
- Branding.
- Membership management.
- Tracks.
- Levels.
- Lessons.
- Reordering.
- Activation/deactivation.
- Mobile admin navigation.
- Onboarding wizard.

-------------------------------------------------------------------------------
Phase 4 — Teachers, classes, students, and guardians
-------------------------------------------------------------------------------

- Teacher management.
- Class management.
- Class assignment.
- Student management.
- Enrollment.
- Track/level assignment.
- Guardian management.
- Guardian links.
- Parent-token management.

-------------------------------------------------------------------------------
Phase 5 — Teacher progress workflow
-------------------------------------------------------------------------------

- Teacher dashboard.
- Class list.
- Class detail.
- Student detail.
- Record Progress.
- Drafts.
- Publication.
- D1 batch updates.
- Lesson-status summary.
- Audit log.
- Idempotency.
- Mobile polish.

-------------------------------------------------------------------------------
Phase 6 — Parent portal and notifications
-------------------------------------------------------------------------------

- Guardian-token validation.
- Parent portal.
- Multiple children.
- Progress history.
- Print view.
- English/Turkish.
- Parent emails.
- Notification log.
- Retry.
- Bulk sending.

-------------------------------------------------------------------------------
Phase 7 — Import, export, and reports
-------------------------------------------------------------------------------

- Legacy CSV import wizard.
- Validation.
- Dry run.
- Import results.
- CSV exports.
- Missing-update reports.
- Teacher reports.
- Class reports.
- Notification reports.
- Organization export.

-------------------------------------------------------------------------------
Phase 8 — Security, PWA, and quality
-------------------------------------------------------------------------------

- Security headers.
- Rate limiting.
- Cache controls.
- CSP.
- Accessibility.
- 320 px testing.
- Offline state.
- PWA installability.
- Session hardening.
- Parent-token hardening.
- Tenant-isolation tests.

-------------------------------------------------------------------------------
Phase 9 — Documentation and release
-------------------------------------------------------------------------------

- Complete all guides.
- Production deployment test.
- Migration test.
- Email relay test.
- Build verification.
- Version release.
- CHANGELOG.
- Final limitations.
- Deployment checklist.

After every phase:

    npm run lint
    npm run format:check
    npm run typecheck
    npm run test
    npm run build

Fix failures before continuing.

===============================================================================
30. ACCEPTANCE CRITERIA
===============================================================================

QuranTrack is complete only when all of these are true:

1. A system administrator can create an organization.
2. An organization administrator can finish onboarding without editing code.
3. An administrator can create program tracks.
4. An administrator can create levels under tracks.
5. An administrator can create lessons under levels.
6. Tracks, levels, and lessons can be reordered.
7. Historically used program items are deactivated rather than destructively
   deleted.
8. A student can have separate levels in separate tracks.
9. An administrator can create teachers.
10. An administrator can create classes.
11. Teachers can be assigned to classes.
12. Students can be enrolled in classes.
13. Guardians can be linked to multiple children.
14. Staff can request a magic link.
15. Magic links expire and are single-use.
16. Staff sessions use secure cookies.
17. Teachers see only assigned classes and students.
18. Teachers can save drafts.
19. Drafts are not visible to parents.
20. Teachers can publish multiple lesson outcomes in one update.
21. Passed lessons update the current completion summary.
22. Repeated practice remains in history.
23. Teachers can add overall feedback.
24. Teachers can add homework without passing a lesson.
25. Publication is preserved when email delivery fails.
26. Email failure is clearly shown.
27. Notification attempts are logged.
28. Duplicate notification attempts are prevented.
29. Guardians can open a secure link without a Google account.
30. Guardians can see all linked children.
31. Guardians cannot see another family’s information.
32. Guardians cannot see another organization’s information.
33. Guardian links can expire.
34. Guardian links can be revoked.
35. Guardian links can be rotated.
36. Parent report works at 320 px.
37. Parent responses use no-store caching.
38. Parent portal has English and Turkish.
39. Staff UI has English and Turkish.
40. Parent report can be printed or saved as PDF through the browser.
41. Admin can import the existing Google Sheets CSV structure.
42. Admin can preview import results.
43. Admin can run a dry import.
44. Admin can download import errors.
45. Legacy plaintext parent tokens are not imported.
46. Admin can export organization data.
47. Cross-organization tests pass.
48. Email relay verifies HMAC.
49. Email relay rejects replayed nonces.
50. Email relay only uses approved aliases.
51. Login, session, and guardian plaintext tokens are never stored.
52. Private APIs are not cached.
53. The application is installable as a PWA.
54. The app shows a clear offline state.
55. The app does not require a paid service.
56. The app builds for Cloudflare Workers.
57. The app uses D1.
58. The frontend and API deploy as one Worker.
59. The Apps Script relay is documented.
60. The initial system-admin bootstrap is documented.
61. The first-organization setup is documented.
62. All operational guides are complete.
63. Linting passes.
64. Formatting checks pass.
65. Type checking passes.
66. Unit tests pass.
67. Integration tests pass.
68. Production build passes.
69. E2E tests pass where browser execution is available.
70. Remaining limitations are stated honestly.

===============================================================================
31. FINAL OUTPUT EXPECTATIONS
===============================================================================

At the end of the work:

1. Summarize the architecture.
2. List major files created.
3. List database migrations.
4. List local setup commands.
5. List test commands.
6. List deployment commands.
7. List required D1 bindings.
8. List Worker variables.
9. List Worker secrets.
10. Explain Apps Script relay deployment.
11. Explain Gmail alias configuration.
12. Explain first-admin bootstrap.
13. Explain first-organization onboarding.
14. Explain legacy CSV migration.
15. Explain backup/export.
16. Report lint results.
17. Report type-check results.
18. Report unit-test results.
19. Report integration-test results.
20. Report E2E-test results.
21. Report production-build results.
22. State remaining limitations.
23. Do not claim untested functionality works.
24. Do not leave real credentials.
25. Do not leave real personal information.
26. Do not leave major security-sensitive TODOs.
27. Use the MIT License.

Begin now by:

1. Inspecting the repository.
2. Creating IMPLEMENTATION_PLAN.md.
3. Recording architectural decisions.
4. Scaffolding the QuranTrack project with React, TypeScript, Vite, the
   Cloudflare Vite plugin, Workers Static Assets, Hono, and D1.
5. Implementing Phase 0.
6. Running lint, type checking, tests, and build.
7. Fixing all failures before proceeding.
