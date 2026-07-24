import { expect, test } from '@playwright/test';

test('320px login is usable without horizontal overflow', async ({ page }) => {
  await page.route('**/api/v1/me', (route) =>
    route.fulfill({ status: 401, contentType: 'application/json', body: '{}' }),
  );
  await page.setViewportSize({ width: 320, height: 720 });
  await page.goto('/login');
  await expect(page.getByRole('heading', { name: /QuranTrack/i })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
});

test('development showcase changes student table to cards at 320px', async ({ page }) => {
  await page.route('**/api/v1/me', (route) =>
    route.fulfill({ status: 401, contentType: 'application/json', body: '{}' }),
  );
  await page.setViewportSize({ width: 320, height: 720 });
  await page.goto('/ui-preview');
  await expect(page.getByRole('heading', { name: /UI showcase/i })).toBeVisible();
  await expect(page.locator('.responsive-table table')).toBeHidden();
  await expect(page.locator('.mobile-cards')).toBeVisible();
  await page.getByRole('button', { name: /More navigation/i }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
});
