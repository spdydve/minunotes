import { expect, test } from '@playwright/test';
import { browserFixture, mockBrowserApi } from './fixtures';

test('moves a nested folder subtree to Trash and removes it from active navigation', async ({ page }) => {
  const fixture = await mockBrowserApi(page);
  await page.goto(`/folders/${browserFixture.folder.id}`);

  await page
    .getByRole('main')
    .getByRole('button', { name: `Actions for ${browserFixture.folder.title}` })
    .click();
  await page.getByText('Move to Trash', { exact: true }).click();
  const dialog = page.getByRole('alertdialog');
  await expect(dialog.getByRole('heading', { name: 'Move folder to Trash?' })).toBeVisible();
  await expect(dialog.getByText(/subfolders, and their notes/)).toBeVisible();
  await expect(dialog.getByRole('textbox')).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Move to Trash' }).click();

  await expect(page).toHaveURL('/');
  const primary = page.getByRole('navigation', { name: 'Primary' });
  await expect(primary.getByRole('link', { name: browserFixture.folder.title })).toHaveCount(0);
  await expect(primary.getByRole('link', { name: browserFixture.childFolder.title })).toHaveCount(0);
  expect(fixture.folders).toEqual([]);
  expect(fixture.notes.size).toBe(0);
});
