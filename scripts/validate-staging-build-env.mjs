import process from 'node:process';

const siteKey = process.env.VITE_TURNSTILE_SITE_KEY?.trim();

if (!siteKey) {
  throw new Error('VITE_TURNSTILE_SITE_KEY is required for staging builds');
}

process.stdout.write('Staging build variables validated\n');
