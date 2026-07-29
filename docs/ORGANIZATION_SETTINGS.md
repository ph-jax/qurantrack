# Organization settings

Phase 3A exposes `GET /api/v1/organization/settings` to authenticated members and `PATCH /api/v1/organization/settings` to `system_admin` and `organization_admin` roles. Neither operation accepts an organization ID as its tenant selector: both use the active organization ID established by the validated server session.

The PATCH body is a complete settings representation and includes the organization ID attached to the loaded representation as a stale-form guard. The server compares that value with the active organization from the validated session and returns `409 STALE_ORGANIZATION` without updating when they differ. The browser value is never used as the tenant selector; the prepared update remains bound only to the trusted session organization. Validation occurs before the single prepared `UPDATE`, so invalid input leaves every existing value unchanged. Supported locales are `en` and `tr`; time zones must be recognized IANA identifiers; colors use six-digit hex; external logos require HTTPS; day values are integers from 1 through 365; and email addresses are normalized and validated. An optional From alias is accepted only when it is already in the server-side approved allowlist. The allowlist itself is never returned.

## Logo safety

The browser scales images to at most 512 pixels on either side and encodes WebP with progressively lower quality until it fits. The server is authoritative: it permits only PNG, JPEG, and WebP data URLs, checks the declared MIME type against magic bytes, and caps the complete encoded data URL at 200 KiB. SVG is unsupported. Clearing the stored data URL removes an uploaded logo; an optional HTTPS URL can remain as fallback.

The necessary columns already existed in migrations `0001_core_schema.sql` and `0002_organization_email_sender_alias.sql`; Phase 3A therefore adds no migration.
