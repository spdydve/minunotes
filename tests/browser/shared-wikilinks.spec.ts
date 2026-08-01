import { expect, test } from '@playwright/test';
import { browserFixture, mockBrowserApi } from './fixtures';

test('renders source-bound resolved and unresolved links in a shared note', async ({ page }) => {
  await mockBrowserApi(page);
  await page.goto(`/share/note_share_${browserFixture.linked.id}`);

  const byTitle = page.locator(`a.me-wikilink[data-wikilink-target="Target Note"]`);
  const byId = page.locator(`a.me-wikilink[data-wikilink-target="${browserFixture.target.id}"]`);
  const missing = page.locator(`a.me-wikilink[data-wikilink-target="Missing Note"]`);

  await expect(byTitle).toHaveClass(/me-wikilink--resolved/);
  await expect(byTitle).toHaveAttribute('href', `/share/note_share_${browserFixture.target.id}`);
  await expect(byId).toHaveAttribute('href', `/share/note_share_${browserFixture.target.id}`);
  await expect(missing).toHaveClass(/me-wikilink--unknown/);
  await expect(missing).not.toHaveAttribute('href', /.+/);

  await byTitle.click();
  await expect(page).toHaveURL(`/share/note_share_${browserFixture.target.id}`);
  await expect(page.getByRole('heading', { name: browserFixture.target.title })).toBeVisible();
});

test('loads and navigates folder-shared notes through the note search parameter', async ({ page }) => {
  await mockBrowserApi(page);
  await page.goto(`/share/folders/folder_share_token?note=${browserFixture.linked.id}`);

  await expect(page.getByRole('heading', { name: browserFixture.linked.title })).toBeVisible();
  const target = page.locator(`a.me-wikilink[data-wikilink-target="Target Note"]`);
  const missing = page.locator(`a.me-wikilink[data-wikilink-target="Missing Note"]`);
  await expect(target).toHaveAttribute('href', `/share/folders/folder_share_token?note=${browserFixture.target.id}`);
  await expect(missing).not.toHaveAttribute('href', /.+/);

  await target.click();
  await expect(page).toHaveURL(`/share/folders/folder_share_token?note=${browserFixture.target.id}`);
  await expect(page.getByRole('heading', { name: browserFixture.target.title })).toBeVisible();

  await page.getByRole('button', { name: 'Back to folder' }).click();
  await expect(page).toHaveURL('/share/folders/folder_share_token');
  await page.getByRole('button', { name: browserFixture.linked.title }).click();
  await expect(page).toHaveURL(`/share/folders/folder_share_token?note=${browserFixture.linked.id}`);
});
