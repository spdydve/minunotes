import { expect, type Page, test } from '@playwright/test';
import { browserFixture, mockBrowserApi } from './fixtures';

async function confirmMoveToTrash(page: Page) {
  await page.getByText('Move to Trash', { exact: true }).click();
  const dialog = page.getByRole('alertdialog');
  await expect(dialog.getByRole('heading', { name: 'Move note to Trash?' })).toBeVisible();
  await expect(dialog.getByRole('textbox')).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Move to Trash' }).click();
  await expect(dialog).toHaveCount(0);
}

async function moveTableNoteToTrash(page: Page, title: string) {
  const row = page.getByRole('row').filter({ hasText: title });
  await row.getByRole('button', { name: 'Open note actions' }).click();
  await confirmMoveToTrash(page);
  await expect(row).toHaveCount(0);
}

test('moves an open note to Trash without typed confirmation', async ({ page }) => {
  const fixture = await mockBrowserApi(page);
  await page.goto(`/notes/${browserFixture.source.id}`);

  await page.getByRole('button', { name: 'Open note actions' }).click();
  await confirmMoveToTrash(page);

  await expect(page).toHaveURL(`/folders/${browserFixture.folder.id}`);
  expect(fixture.notes.has(browserFixture.source.id)).toBe(false);
});

test('moves notes to Trash from folder and Recent Notes tables', async ({ page }) => {
  const fixture = await mockBrowserApi(page);
  await page.goto(`/folders/${browserFixture.folder.id}`);
  await moveTableNoteToTrash(page, browserFixture.source.title);
  expect(fixture.notes.has(browserFixture.source.id)).toBe(false);

  await page.goto('/');
  await moveTableNoteToTrash(page, browserFixture.target.title);
  expect(fixture.notes.has(browserFixture.target.id)).toBe(false);
});

test('keeps the confirmation open when moving to Trash fails', async ({ page }) => {
  const fixture = await mockBrowserApi(page, { noteTrashFails: true });
  await page.goto(`/notes/${browserFixture.source.id}`);

  await page.getByRole('button', { name: 'Open note actions' }).click();
  await page.getByText('Move to Trash', { exact: true }).click();
  const dialog = page.getByRole('alertdialog');
  await dialog.getByRole('button', { name: 'Move to Trash' }).click();

  await expect(dialog).toBeVisible();
  await expect(dialog.getByText('Trash is temporarily unavailable')).toBeVisible();
  expect(fixture.notes.has(browserFixture.source.id)).toBe(true);
});

test('moves a template to Trash from Templates', async ({ page }) => {
  const fixture = await mockBrowserApi(page);
  await page.goto('/templates');

  await moveTableNoteToTrash(page, browserFixture.template.title);
  expect(fixture.notes.has(browserFixture.template.id)).toBe(false);
});
