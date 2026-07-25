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

for (const viewport of [
  { width: 320, height: 720 },
  { width: 412, height: 915 },
]) {
  test(`preview content stays contained at ${viewport.width}px`, async ({ page }) => {
    await page.route('**/api/v1/me', (route) =>
      route.fulfill({ status: 401, contentType: 'application/json', body: '{}' }),
    );
    await page.setViewportSize(viewport);
    await page.goto('/ui-preview/dashboard');
    await expect(page.getByRole('heading', { name: /UI showcase/i })).toBeVisible();
    await expect(page.locator('.responsive-table table')).toBeHidden();

    const containment = await page.evaluate(() => {
      const rect = (element: Element) => element.getBoundingClientRect();
      const articles = [...document.querySelectorAll('.mobile-cards article')];
      const studentCard = document.querySelector('.student-preview-card');
      const organizationCard = document.querySelector('.organization-preview-card');
      const loadingCard = document.querySelector('.loading-preview-card');
      const organizationName = document.querySelector(
        '.organization-preview-card .org-identity > span:last-child',
      ) as HTMLElement | null;
      const inside = (child: Element | null, parent: Element | null) => {
        if (!child || !parent) return false;
        const childRect = rect(child);
        const parentRect = rect(parent);
        return (
          childRect.left >= parentRect.left - 0.5 &&
          childRect.right <= parentRect.right + 0.5 &&
          childRect.top >= parentRect.top - 0.5 &&
          childRect.bottom <= parentRect.bottom + 0.5
        );
      };
      const insideViewportWidth = (element: Element | null) => {
        if (!element) return false;
        const elementRect = rect(element);
        return elementRect.left >= -0.5 && elementRect.right <= innerWidth + 0.5;
      };
      return {
        noPageOverflow: document.documentElement.scrollWidth <= innerWidth,
        stacked: articles.every((article, index) => {
          if (index === 0) return true;
          return rect(article).top >= rect(articles[index - 1]).bottom - 0.5;
        }),
        studentsContained: articles.every((article) => inside(article, studentCard)),
        organizationContained: insideViewportWidth(organizationCard),
        loadingContained: insideViewportWidth(loadingCard),
        organizationTruncated:
          Boolean(organizationName) &&
          organizationName!.scrollWidth > organizationName!.clientWidth &&
          getComputedStyle(organizationName!).textOverflow === 'ellipsis',
      };
    });

    expect(containment).toEqual({
      noPageOverflow: true,
      stacked: true,
      studentsContained: true,
      organizationContained: true,
      loadingContained: true,
      organizationTruncated: true,
    });
  });
}
