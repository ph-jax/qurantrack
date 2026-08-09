import { beforeEach, describe, expect, it, vi } from 'vitest';

const { validateSession } = vi.hoisted(() => ({ validateSession: vi.fn() }));
vi.mock('../../../worker/auth/service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../worker/auth/service')>()),
  validateSession,
}));

import app from '../../../worker/index';
import type { Role } from '../../../worker/auth/service';

const input = {
  name: 'Updated Center',
  primaryColor: '#123456',
  defaultLocale: 'tr',
  timezone: 'Europe/Istanbul',
  emailSenderName: 'Updated Center',
  emailReplyTo: 'reply@example.test',
  emailSenderAlias: null,
  reportTitle: 'Progress',
  missingUpdateDays: 10,
  guardianTokenLifetimeDays: 20,
  logoUrl: null,
  logoDataUrl: null,
};
const settingsFor = (organizationId: string) => ({ ...input, organizationId });

function row(
  id: string,
  name: string,
): {
  id: string;
  name: string;
  primary_color: string;
  default_locale: 'en' | 'tr';
  timezone: string;
  email_sender_name: string;
  email_reply_to: string;
  email_sender_alias: string | null;
  report_title: string;
  missing_update_days: number;
  guardian_token_lifetime_days: number;
  logo_url: string | null;
  logo_data_url: string | null;
  updated_at: string;
} {
  return {
    id,
    name,
    primary_color: '#0f766e',
    default_locale: 'en',
    timezone: 'UTC',
    email_sender_name: name,
    email_reply_to: 'reply@example.test',
    email_sender_alias: null,
    report_title: 'Report',
    missing_update_days: 14,
    guardian_token_lifetime_days: 30,
    logo_url: null,
    logo_data_url: null,
    updated_at: '2026-01-01T00:00:00.000Z',
  };
}

function database() {
  const rows = new Map([
    ['org-a', row('org-a', 'Organization A')],
    ['org-b', row('org-b', 'Organization B')],
  ]);
  const updateBindings: unknown[][] = [];
  return {
    rows,
    updateBindings,
    DB: {
      prepare(sql: string) {
        return {
          bind(...values: unknown[]) {
            return {
              first: async () => rows.get(String(values[0])) ?? null,
              run: async () => {
                if (sql.startsWith('UPDATE organizations')) {
                  updateBindings.push(values);
                  const id = String(values[13]);
                  const current = rows.get(id);
                  if (current)
                    rows.set(id, {
                      ...current,
                      name: String(values[0]),
                      primary_color: String(values[1]),
                      default_locale: values[2] as 'en' | 'tr',
                      timezone: String(values[3]),
                      email_sender_name: String(values[4]),
                      email_reply_to: String(values[5]),
                      email_sender_alias: values[6] as string | null,
                      report_title: String(values[7]),
                      missing_update_days: Number(values[8]),
                      guardian_token_lifetime_days: Number(values[9]),
                      logo_url: values[10] as string | null,
                      logo_data_url: values[11] as string | null,
                      updated_at: String(values[12]),
                    });
                }
                return { meta: { changes: 1 } };
              },
            };
          },
        };
      },
    } as unknown as D1Database,
  };
}

function authenticate(role: Role, organizationId = 'org-a') {
  validateSession.mockResolvedValue({
    userId: 'user-1',
    email: 'staff@example.test',
    organizationId,
    role,
    sessionId: 'session-1',
  });
}

function request(method: 'GET' | 'PATCH', body?: unknown) {
  return new Request('http://local/api/v1/organization/settings', {
    method,
    headers: { cookie: 'qurantrack_session=test-token', 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

describe('organization settings API authorization and isolation', () => {
  beforeEach(() => validateSession.mockReset());

  it('requires authentication for GET and PATCH', async () => {
    const db = database();
    const get = await app.request('/api/v1/organization/settings', {}, { DB: db.DB });
    const patch = await app.request(
      '/api/v1/organization/settings',
      { method: 'PATCH' },
      { DB: db.DB },
    );
    expect(get.status).toBe(401);
    expect(patch.status).toBe(401);
  });

  it.each(['teacher', 'read_only'] as Role[])(
    'returns 403 when %s attempts GET and PATCH',
    async (role) => {
      authenticate(role);
      expect((await app.fetch(request('GET'), { DB: database().DB })).status).toBe(403);
      expect(
        (await app.fetch(request('PATCH', settingsFor('org-a')), { DB: database().DB })).status,
      ).toBe(403);
    },
  );

  it.each(['system_admin', 'organization_admin'] as Role[])(
    'allows %s to GET and PATCH',
    async (role) => {
      authenticate(role);
      expect((await app.fetch(request('GET'), { DB: database().DB })).status).toBe(200);
      const response = await app.fetch(request('PATCH', settingsFor('org-a')), {
        DB: database().DB,
      });
      expect(response.status).toBe(200);
      expect((await response.json()) as { settings: unknown }).toMatchObject({ settings: input });
    },
  );

  it('allows matching IDs and binds only the session tenant for GET and PATCH', async () => {
    authenticate('organization_admin', 'org-a');
    const db = database();
    const get = await app.fetch(request('GET'), { DB: db.DB });
    expect(((await get.json()) as { settings: { id: string } }).settings.id).toBe('org-a');

    const response = await app.fetch(request('PATCH', settingsFor('org-a')), {
      DB: db.DB,
    });
    expect(response.status).toBe(200);
    expect(db.updateBindings[0][13]).toBe('org-a');
    expect(db.rows.get('org-a')?.name).toBe('Updated Center');
    expect(db.rows.get('org-b')?.name).toBe('Organization B');
  });

  it('rejects settings loaded for A after the session switches to B without updating either', async () => {
    authenticate('organization_admin', 'org-b');
    const db = database();
    const response = await app.fetch(request('PATCH', settingsFor('org-a')), { DB: db.DB });
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ error: { code: 'STALE_ORGANIZATION' } });
    expect(db.updateBindings).toHaveLength(0);
    expect(db.rows.get('org-a')?.name).toBe('Organization A');
    expect(db.rows.get('org-b')?.name).toBe('Organization B');
  });

  it('does not let a browser-provided organization ID select another tenant', async () => {
    authenticate('organization_admin', 'org-a');
    const db = database();
    const response = await app.fetch(request('PATCH', settingsFor('org-b')), { DB: db.DB });
    expect(response.status).toBe(409);
    expect(db.updateBindings).toHaveLength(0);
    expect(db.rows.get('org-b')?.name).toBe('Organization B');
  });

  it('does not execute an update for invalid input', async () => {
    authenticate('organization_admin');
    const db = database();
    const response = await app.fetch(
      request('PATCH', { ...settingsFor('org-a'), primaryColor: 'red' }),
      { DB: db.DB },
    );
    expect(response.status).toBe(400);
    expect(db.updateBindings).toHaveLength(0);
    expect(db.rows.get('org-a')?.name).toBe('Organization A');
  });
});
