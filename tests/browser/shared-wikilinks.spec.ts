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

  const codeBlocks = page.locator('.me-static-codeblock');
  await expect(codeBlocks).toHaveCount(3);
  await expect(codeBlocks.first().locator('.me-lang-label')).toHaveText('ts');
  await expect(codeBlocks.first()).toHaveCSS('border-top-style', 'solid');
  await expect(codeBlocks.first().locator('.me-codeblock-header')).toHaveCSS('display', 'flex');
  await expect(codeBlocks.first().locator('.me-codeblock-body')).toHaveCSS('overflow-x', 'auto');
  await expect(codeBlocks.first().getByRole('button', { name: 'Copy code' })).toBeVisible();
  await expect(codeBlocks.nth(1).locator('.me-lang-label')).toHaveText('unknownlang');
  await expect(codeBlocks.nth(1).locator('.me-codeblock-body')).toContainText('fallback code');
  await expect(codeBlocks.nth(2).locator('.me-lang-label')).toHaveCount(0);

  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await codeBlocks.first().getByRole('button', { name: 'Copy code' }).click();
  await expect(codeBlocks.first().getByRole('button', { name: 'Copy code' })).toHaveText('Copied');
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toContain('const answer: number = 42;');

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
