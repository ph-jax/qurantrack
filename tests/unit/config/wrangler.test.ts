import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';

import { describe, expect, it } from 'vitest';

interface WranglerConfig {
  name: string;
  assets: {
    not_found_handling?: string;
    run_worker_first?: string[];
  };
  vars?: Record<string, string>;
  env?: {
    staging?: {
      name?: string;
      vars?: Record<string, string>;
      d1_databases?: Array<{ database_name: string; database_id: string }>;
    };
    production?: {
      name?: string;
      vars?: Record<string, string>;
    };
  };
}

const configSource = readFileSync(resolve(process.cwd(), 'wrangler.jsonc'), 'utf8');
const config = runInNewContext(`(${configSource})`) as WranglerConfig;
const packageJson = JSON.parse(readFileSync(resolve(process.cwd(), 'package.json'), 'utf8')) as {
  scripts: Record<string, string>;
};

describe('Wrangler routing configuration', () => {
  it('runs API requests through the Worker before checking static assets', () => {
    expect(config.assets.run_worker_first).toContain('/api/*');
  });

  it('preserves the SPA fallback for non-API routes', () => {
    expect(config.assets.not_found_handling).toBe('single-page-application');
  });

  it('uses the staging Worker URL only for the staging application base URL', () => {
    expect(config.env?.staging?.vars?.APP_BASE_URL).toBe(
      'https://qurantrack-staging.samet-2fb.workers.dev',
    );
    expect(config.vars?.APP_BASE_URL).toBeUndefined();
    expect(config.env?.production?.vars?.APP_BASE_URL).toBeUndefined();
  });

  it('deploys only the staging build output while preserving dashboard variables', () => {
    const command = packageJson.scripts['deploy:staging'];
    expect(command).toBe(
      'npm run build:staging && wrangler deploy --config dist/qurantrack_preview/wrangler.json --keep-vars',
    );
    expect(command).not.toContain('production');
  });

  it('prevents unqualified and pull-request builds from targeting production', () => {
    expect(config.name).toBe('qurantrack-preview');
    expect(config.env?.production?.name).toBe('qurantrack');
    expect(packageJson.scripts.deploy).toContain('Unqualified deploy disabled');
    expect(packageJson.scripts['build:production']).toContain('CLOUDFLARE_ENV=production');
    expect(packageJson.scripts['deploy:production']).toBe(
      'npm run build:production && wrangler deploy --config dist/qurantrack_preview/wrangler.json --keep-vars',
    );
  });

  it('binds the staging build to the real staging Worker and D1, never preview placeholders', () => {
    const staging = config.env?.staging;
    expect(packageJson.scripts['build:staging']).toContain('CLOUDFLARE_ENV=staging');
    expect(staging?.name).toBe('qurantrack-staging');
    expect(staging?.vars?.ENVIRONMENT).toBe('staging');
    expect(staging?.vars?.APP_BASE_URL).toBe('https://qurantrack-staging.samet-2fb.workers.dev');
    expect(staging?.d1_databases).toEqual([
      expect.objectContaining({
        database_name: 'qurantrack-staging',
        database_id: 'bf824e5e-a67b-4592-950b-16d01cbd5689',
      }),
    ]);
    expect(staging?.d1_databases?.[0]?.database_name).not.toBe('qurantrack-preview');
    expect(staging?.d1_databases?.[0]?.database_id).not.toMatch(/^00000000-/);
  });

  it('requires the public Turnstile site key without exposing it', () => {
    const script = resolve(process.cwd(), 'scripts/validate-staging-build-env.mjs');
    const missing = spawnSync(process.execPath, [script], { encoding: 'utf8', env: {} });
    expect(missing.status).not.toBe(0);
    expect(`${missing.stdout}${missing.stderr}`).toContain(
      'VITE_TURNSTILE_SITE_KEY is required for staging builds',
    );

    const publicSiteKey = 'public-site-key-fixture';
    const configured = spawnSync(process.execPath, [script], {
      encoding: 'utf8',
      env: { VITE_TURNSTILE_SITE_KEY: publicSiteKey },
    });
    expect(configured.status).toBe(0);
    expect(`${configured.stdout}${configured.stderr}`).not.toContain(publicSiteKey);
  });
});
