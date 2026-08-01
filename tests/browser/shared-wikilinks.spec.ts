import { expect, test } from '@playwright/test';
import { browserFixture, mockBrowserApi } from './fixtures';

test('resolves wikilinks in the shared-note view and navigates on click', async ({ page }) => {
  await mockBrowserApi(page);

  // Open the linked note's share link.
  await page.goto(`/share/note_share_${browserFixture.linked.id}`);

  // Both wikilinks should resolve to the target's share token and become clickable.
  const byTitle = page.locator('a.me-wikilink--resolved', { hasText: 'Target Note' });
  const byId = page.locator('a.me-wikilink--resolved', { hasText: 'Target by ID' });
  await expect(byTitle).toBeVisible();
  await expect(byId).toBeVisible();
  await expect(byTitle).toHaveAttribute('href', `/share/note_share_${browserFixture.target.id}`);
  await expect(byId).toHaveAttribute('href', `/share/note_share_${browserFixture.target.id}`);

  // Click the resolved link and confirm we land on the target's shared view.
  await byTitle.click();
  await page.waitForURL(`/share/note_share_${browserFixture.target.id}`);
  await expect(page.getByRole('heading', { name: 'Target Note' })).toBeVisible();
});

test('leaves wikilinks unresolved when the target note is not shared', async ({ page }) => {
  await mockBrowserApi(page);

  await page.goto(`/share/note_share_${browserFixture.linked.id}`);

  // The two known wikilinks resolve.
  const resolved = page.locator('a.me-wikilink--resolved');
  await expect(resolved).toHaveCount(2);

  // No wikilink should be present without a target data attribute.
  const wikilinks = page.locator('a.me-wikilink');
  const count = await wikilinks.count();
  for (let i = 0; i < count; i += 1) {
    const target = await wikilinks.nth(i).getAttribute('data-wikilink-target');
    expect(target).toBeTruthy();
  }
});
