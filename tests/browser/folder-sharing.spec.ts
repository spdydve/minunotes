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
  await expect(
    page.getByText('This folder is publicly viewable by anyone with the link. Editing is disabled.')
  ).toBeVisible();

  await page.getByRole('button', { name: 'Copy link' }).click();
  await expect(page.getByRole('button', { name: 'Copied' })).toBeVisible();
});

test('moves selected notes from a folder list', async ({ page }) => {
  await mockBrowserApi(page);
  await page.goto(`/folders/${browserFixture.folder.id}`);

  const table = page.locator('table');
  await table.getByLabel(`Select ${browserFixture.source.title}`).check();
  await table.getByLabel(`Select ${browserFixture.target.title}`).check();
  await expect(page.getByText('2 notes selected')).toBeVisible();

  await page.getByRole('button', { name: 'Move' }).click();
  const dialog = page.getByRole('heading', { name: 'Move 2 notes' }).locator('..');
  await expect(page.getByRole('heading', { name: 'Move 2 notes' })).toBeVisible();
  await dialog.getByRole('button', { name: browserFixture.childFolder.title, exact: true }).click();
  await dialog.getByRole('button', { name: 'Move here' }).click();

  await expect(page.getByText('2 notes selected')).toHaveCount(0);
  await expect(page.getByRole('link', { name: browserFixture.source.title })).toHaveCount(0);
  await expect(page.getByRole('link', { name: browserFixture.target.title })).toHaveCount(0);
});

test('keeps rendered table backgrounds constrained to the table width', async ({ page }) => {
  const api = await mockBrowserApi(page);
  api.notes.set(browserFixture.source.id, {
    ...browserFixture.source,
    content: '| name | id |\n| --- | --- |\n| Venue | 123 |',
  });
  await page.goto('/share/folders/folder_share_token');
  await page.getByRole('button', { name: browserFixture.source.title }).click();

  const scroller = page.locator('.notes-minu-renderer .me-renderer-table-scroller');
  const table = scroller.locator('table');
  await expect(table).toBeVisible();

  const [scrollerBox, tableBox] = await Promise.all([scroller.boundingBox(), table.boundingBox()]);
  if (!scrollerBox || !tableBox) throw new Error('Expected rendered table bounds');
  expect(tableBox.width).toBeLessThan(scrollerBox.width);
});

test('renders a public shared folder read-only view', async ({ page }) => {
  await mockBrowserApi(page);
  await page.goto('/share/folders/folder_share_token');

  await expect(page.getByRole('heading', { name: browserFixture.folder.title, level: 2 })).toBeVisible();
  await expect(page.getByRole('button', { name: browserFixture.childFolder.title }).first()).toBeVisible();
  await expect(page.getByRole('button', { name: browserFixture.source.title })).toBeVisible();
  await expect(page.getByRole('cell', { name: 'Folder' }).first()).toBeVisible();

  await page.getByRole('button', { name: browserFixture.source.title }).click();
  await expect(page.getByRole('heading', { name: browserFixture.source.title })).toBeVisible();
  await expect(page.locator('.notes-minu-renderer')).toContainText(browserFixture.source.content);

  await page.getByRole('button', { name: 'Back to folder' }).click();
  await page.getByRole('button', { name: browserFixture.childFolder.title }).first().click();
  await expect(page.getByRole('heading', { name: browserFixture.childFolder.title })).toBeVisible();
  await page.getByRole('button', { name: browserFixture.child.title }).click();
  await expect(page.getByRole('heading', { name: browserFixture.child.title })).toBeVisible();
  await expect(page.locator('.notes-minu-renderer')).toContainText(browserFixture.child.content);
  await expect(page.getByLabel(`Actions for ${browserFixture.folder.title}`)).toHaveCount(0);
});
