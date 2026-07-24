import { describe, expect, it } from 'vitest';

import worker from '../../worker';

interface HealthBody {
  ok: boolean;
  data: {
    status: string;
    version: string;
  };
  requestId: string;
}

describe('health endpoint', () => {
  it('returns a safe health envelope', async () => {
    const response = await worker.fetch(new Request('https://qurantrack.test/api/v1/health'), {
      APP_VERSION: '0.1.0-test',
    });
    const body = (await response.json()) as HealthBody;

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      ok: true,
      data: { status: 'healthy', version: '0.1.0-test' },
    });
    expect(body.requestId).toEqual(expect.any(String));
    expect(JSON.stringify(body)).not.toContain('MAIL_RELAY');
  });
});
