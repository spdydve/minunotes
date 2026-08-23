import { expect, test } from '@playwright/test';

test('serves Resources and Getting Started without authentication', async ({ page }) => {
  const privateRequests: string[] = [];
  page.on('request', (request) => {
    if (/\/v1\/(folders|notes|search)/.test(request.url())) privateRequests.push(request.url());
  });

  await page.goto('/resources');

  await expect(page.getByRole('heading', { name: 'Learn to build a calmer, connected workspace.' })).toBeVisible();
  await expect(page.getByRole('link', { name: /Start with Getting started/ })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Learn MinuNotes' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Build with MinuNotes' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Sign in' })).toBeVisible();
  expect(privateRequests).toEqual([]);

  await page.getByRole('link', { name: /Start with Getting started/ }).click();
  await expect(page).toHaveURL('/resources/getting-started');
  await expect(page.getByRole('heading', { name: 'Getting started', level: 1 })).toBeVisible();
  await expect(page).toHaveTitle('Getting started - MinuNotes');
  await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', /Create your first folder/);
  await expect(page.getByRole('navigation', { name: 'Resource guides' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Getting started', exact: true }).first()).toHaveAttribute(
    'aria-current',
    'page'
  );
  expect(privateRequests).toEqual([]);
});

test('keeps guide navigation available on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 720 });
  await page.goto('/resources/getting-started');

  const browser = page.getByText('Browse guides', { exact: true });
  await expect(browser).toBeVisible();
  await browser.click();
  await expect(page.getByRole('navigation', { name: 'Resource guides' })).toBeVisible();
});

test('provides useful navigation for an unknown resource', async ({ page }) => {
  await page.goto('/resources/not-a-guide');

  await expect(page.getByRole('heading', { name: 'That guide does not exist.' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Browse Resources' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Start with Getting started' })).toBeVisible();
});
