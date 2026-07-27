import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';

import { describe, expect, it } from 'vitest';

interface WranglerConfig {
  assets: {
    not_found_handling?: string;
    run_worker_first?: string[];
  };
  env?: {
    staging?: {
      vars?: Record<string, string>;
    };
  };
}

const configSource = readFileSync(resolve(process.cwd(), 'wrangler.jsonc'), 'utf8');
const config = runInNewContext(`(${configSource})`) as WranglerConfig;

describe('Wrangler routing configuration', () => {
  it('runs API requests through the Worker before checking static assets', () => {
    expect(config.assets.run_worker_first).toContain('/api/*');
  });

  it('preserves the SPA fallback for non-API routes', () => {
    expect(config.assets.not_found_handling).toBe('single-page-application');
  });

  it('uses the staging Worker URL as the staging application base URL', () => {
    expect(config.env?.staging?.vars?.APP_BASE_URL).toBe(
      'https://qurantrack-staging.samet-2fb.workers.dev',
    );
  });
});
