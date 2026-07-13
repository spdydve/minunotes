import { expect, test } from '@playwright/test';
import { browserFixture, mockBrowserApi } from './fixtures';

test('enables and copies a read-only folder share link', async ({ context, page }) => {
  await context.grantPermissions(['clipboard-write']);
  await mockBrowserApi(page);
  await page.goto(`/folders/${browserFixture.folder.id}`);

  await page.getByRole('main').getByLabel(`Actions for ${browserFixture.folder.title}`).click();
  await page.getByRole('button', { name: 'Share' }).click();
  await expect(page.getByRole('heading', { name: 'Share folder' })).toBeVisible();

  await page.getByRole('combobox').selectOption('read');
  await expect(page.getByText('This folder is publicly viewable by anyone with the link. Editing is disabled.')).toBeVisible();

  await page.getByRole('button', { name: 'Copy link' }).click();
  await expect(page.getByRole('button', { name: 'Copied' })).toBeVisible();
});

test('renders a public shared folder read-only view', async ({ page }) => {
  await mockBrowserApi(page);
  await page.goto('/share/folders/folder_share_token');

  await expect(page.getByRole('heading', { name: browserFixture.folder.title })).toBeVisible();
  await expect(page.getByRole('button', { name: /Source Note/ })).toBeVisible();
  await expect(page.getByRole('heading', { name: browserFixture.source.title })).toBeVisible();
  await expect(page.locator('.cm-content')).toContainText(browserFixture.source.content);
  await expect(page.getByLabel(`Actions for ${browserFixture.folder.title}`)).toHaveCount(0);
});
