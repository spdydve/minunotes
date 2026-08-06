import { expect, type Page, test } from '@playwright/test';
import { browserFixture, mockBrowserApi } from './fixtures';

function trashRow(page: Page, title: string) {
  return page.getByRole('listitem').filter({ hasText: title });
}

test('shows recoverable content separately from the active tree and blocks direct reads', async ({ page }) => {
  await mockBrowserApi(page);
  await page.goto('/trash');

  await expect(page).toHaveTitle('Trash - MinuNotes');
  await expect(page.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: 'Trash' })).toHaveAttribute(
    'aria-current',
    'page'
  );
  await expect(page.getByRole('heading', { name: 'Folders' })).toBeVisible();
  await expect(page.getByText(browserFixture.trashedFolder.title)).toBeVisible();
  await expect(page.getByText('2 subfolders · 3 notes')).toBeVisible();
  await expect(page.getByText(browserFixture.trashedNote.title)).toBeVisible();
  await expect(page.getByText(browserFixture.trashedTemplate.title)).toBeVisible();
  await expect(page.getByText('Original parent unavailable', { exact: false })).toBeVisible();
  await expect(page.getByText('Original folder unavailable', { exact: false })).toBeVisible();
  await expect(page.getByText(/30 days|automatically deleted/i)).toHaveCount(0);

  await page.goto(`/notes/${browserFixture.trashedNote.id}`);
  await expect(page.getByRole('heading', { name: 'Note not found' })).toBeVisible();

  await page.goto(`/folders/${browserFixture.trashedFolder.id}`);
  await expect(page.getByRole('heading', { name: 'Folder not found' })).toBeVisible();

  await page.goto(`/share/note_share_${browserFixture.trashedNote.id}`);
  await expect(page.getByRole('heading', { name: 'Shared note unavailable' })).toBeVisible();
});

test('shows a trashed folder batch as a nested hierarchy on demand', async ({ page }) => {
  await mockBrowserApi(page);
  await page.goto('/trash');

  const row = trashRow(page, browserFixture.trashedFolder.title);
  await expect(page.getByText('Project overview')).toHaveCount(0);
  await row.getByRole('button', { name: 'View contents' }).click();

  const contents = row.getByText(`Contents of ${browserFixture.trashedFolder.title}`).locator('..');
  await expect(contents.getByText('Project overview')).toBeVisible();
  const research = contents.getByRole('listitem').filter({ hasText: 'Research' }).first();
  await expect(research).toContainText('Competitor notes');
  await expect(research).toContainText('Archive');
  await expect(research).toContainText('Planning board');
  await expect(contents.getByText('Canvas')).toBeVisible();

  await row.getByRole('button', { name: 'Hide contents' }).click();
  await expect(page.getByText('Project overview')).toHaveCount(0);
});

test('restores a note to its original folder and opens it', async ({ page }) => {
  const fixture = await mockBrowserApi(page);
  await page.goto('/trash');

  await trashRow(page, browserFixture.trashedNote.title)
    .getByRole('button', { name: `Restore ${browserFixture.trashedNote.title}` })
    .click();

  await expect(page).toHaveURL(`/notes/${browserFixture.trashedNote.id}`);
  await expect(page.locator('input[placeholder="Untitled note"]')).toHaveValue(browserFixture.trashedNote.title);
  expect(fixture.trashNotes.map((note) => note.id)).not.toContain(browserFixture.trashedNote.id);
  expect(fixture.trashMutationRequests.at(-1)).toMatchObject({
    method: 'POST',
    path: `/trash/notes/${browserFixture.trashedNote.id}/restore`,
    body: {},
  });
});

test('chooses a destination for a template whose original folder is unavailable', async ({ page }) => {
  const fixture = await mockBrowserApi(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Open menu' }).click();
  await page.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: 'Trash' }).click();
  await expect(page.getByRole('main').getByRole('heading', { name: 'Trash', exact: true })).toBeVisible();

  const restoreButton = trashRow(page, browserFixture.trashedTemplate.title).getByRole('button', {
    name: `Restore ${browserFixture.trashedTemplate.title}`,
  });
  await restoreButton.focus();
  await page.keyboard.press('Enter');

  const dialog = page.getByRole('dialog', { name: 'Choose a restore destination' });
  const destination = dialog.getByRole('combobox', { name: 'Destination folder' });
  await expect(destination).toBeFocused();
  await destination.selectOption(browserFixture.childFolder.id);
  await dialog.getByRole('button', { name: 'Restore', exact: true }).click();

  await expect(page).toHaveURL(`/notes/${browserFixture.trashedTemplate.id}`);
  expect(fixture.trashMutationRequests.at(-1)).toMatchObject({
    path: `/trash/notes/${browserFixture.trashedTemplate.id}/restore`,
    body: { folderId: browserFixture.childFolder.id },
  });
});

test('restores a folder at top level when its original parent is unavailable', async ({ page }) => {
  const fixture = await mockBrowserApi(page);
  await page.goto('/trash');

  await trashRow(page, browserFixture.trashedFolder.title)
    .getByRole('button', { name: `Restore ${browserFixture.trashedFolder.title}` })
    .click();

  await expect(page).toHaveURL(`/folders/${browserFixture.trashedFolder.id}`);
  expect(fixture.folders).toContainEqual(
    expect.objectContaining({ id: browserFixture.trashedFolder.id, parentFolderId: null })
  );
  expect(fixture.trashFolders).toEqual([]);
});

test('requires typed confirmation, traps focus, and permanently deletes an item', async ({ page }) => {
  const fixture = await mockBrowserApi(page);
  await page.goto('/trash');
  const row = trashRow(page, browserFixture.trashedNote.title);
  const trigger = row.getByRole('button', { name: 'Permanently delete' });
  await trigger.click();

  let dialog = page.getByRole('alertdialog', { name: `Permanently delete ${browserFixture.trashedNote.title}?` });
  const input = dialog.getByRole('textbox', { name: `Type delete to confirm ${browserFixture.trashedNote.title}` });
  await expect(input).toBeFocused();
  await expect(dialog.getByRole('button', { name: 'Permanently delete' })).toBeDisabled();
  await page.keyboard.press('Shift+Tab');
  await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(input).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();

  await trigger.click();
  dialog = page.getByRole('alertdialog', { name: `Permanently delete ${browserFixture.trashedNote.title}?` });
  await dialog.getByRole('textbox').fill('delete');
  await dialog.getByRole('button', { name: 'Permanently delete' }).click();
  await expect(page.getByText(browserFixture.trashedNote.title)).toHaveCount(0);
  expect(fixture.trashMutationRequests.at(-1)).toMatchObject({
    method: 'DELETE',
    path: `/trash/notes/${browserFixture.trashedNote.id}`,
  });
});

test('permanently deletes a nested folder batch after confirmation', async ({ page }) => {
  const fixture = await mockBrowserApi(page);
  await page.goto('/trash');
  const row = trashRow(page, browserFixture.trashedFolder.title);
  await row.getByRole('button', { name: 'Permanently delete' }).click();

  const dialog = page.getByRole('alertdialog', {
    name: `Permanently delete ${browserFixture.trashedFolder.title}?`,
  });
  await expect(dialog.getByText(/including 2 subfolders and 3 notes/)).toBeVisible();
  await dialog.getByRole('textbox').fill('delete');
  await dialog.getByRole('button', { name: 'Permanently delete' }).click();

  await expect(page.getByText(browserFixture.trashedFolder.title)).toHaveCount(0);
  expect(fixture.trashFolders).toEqual([]);
  expect(fixture.trashMutationRequests.at(-1)).toMatchObject({
    method: 'DELETE',
    path: `/trash/folders/${browserFixture.trashedFolder.id}`,
  });
});

test('keeps stale restore and permanent-delete errors actionable', async ({ page }) => {
  await mockBrowserApi(page, { trashMutationFails: true });
  await page.goto('/trash');

  await trashRow(page, browserFixture.trashedNote.title)
    .getByRole('button', { name: `Restore ${browserFixture.trashedNote.title}` })
    .click();
  await expect(page.getByRole('alert')).toHaveText('Trashed note not found');
  await expect(page).toHaveURL('/trash');

  await trashRow(page, browserFixture.trashedTemplate.title)
    .getByRole('button', { name: `Restore ${browserFixture.trashedTemplate.title}` })
    .click();
  const restoreDialog = page.getByRole('dialog', { name: 'Choose a restore destination' });
  await restoreDialog.getByRole('button', { name: 'Restore', exact: true }).click();
  await expect(restoreDialog.getByRole('alert')).toHaveText('Trashed note not found');
  await expect(restoreDialog).toBeVisible();
  await restoreDialog.getByRole('button', { name: 'Cancel' }).click();

  const row = trashRow(page, browserFixture.trashedFolder.title);
  await row.getByRole('button', { name: 'Permanently delete' }).click();
  const dialog = page.getByRole('alertdialog');
  await dialog.getByRole('textbox').fill('delete');
  await dialog.getByRole('button', { name: 'Permanently delete' }).click();
  await expect(dialog.getByRole('alert')).toHaveText('Trashed folder not found');
  await expect(dialog).toBeVisible();
});

test('shows accessible empty and load-error states', async ({ page }) => {
  await mockBrowserApi(page, { emptyTrash: true });
  await page.goto('/trash');
  await expect(page.getByRole('heading', { name: 'Trash is empty' })).toBeVisible();

  const errorPage = await page.context().newPage();
  await mockBrowserApi(errorPage, { trashLoadFails: true });
  await errorPage.goto('/trash');
  const alert = errorPage.getByRole('alert');
  await expect(alert.getByText('Unable to load Trash')).toBeVisible();
  await expect(alert.getByRole('button', { name: 'Try again' })).toBeVisible();
});
