import { expect, test } from '@playwright/test';
import { browserFixture, mockBrowserApi } from './fixtures';

test('autosaves editor content and preserves it after reload', async ({ page }) => {
  const api = await mockBrowserApi(page);
  await page.goto(`/notes/${browserFixture.source.id}`);

  const editor = page.locator('.cm-content');
  await expect(editor).toBeVisible();
  await editor.click();
  await page.keyboard.press('End');
  await page.keyboard.type(' Updated.');

  await api.expectSavedContent('Start here. Updated.');
  await page.reload();
  await expect(page.locator('.cm-content')).toContainText('Start here. Updated.');
});

test('inserts a heading through the slash-command menu', async ({ page }) => {
  const api = await mockBrowserApi(page);
  await page.goto(`/notes/${browserFixture.source.id}`);

  const editor = page.locator('.cm-content');
  await expect(editor).toBeVisible();
  await editor.click();
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+A' : 'Control+A');
  await page.keyboard.press('Backspace');
  await page.keyboard.type('/');

  await page.getByText('Heading 1', { exact: true }).click();
  await page.keyboard.type('Browser heading');
  await api.expectSavedContent('# Browser heading');
});

test('inserts an external image through the app image picker', async ({ page }) => {
  const api = await mockBrowserApi(page);
  await page.goto(`/notes/${browserFixture.source.id}`);

  await page.getByLabel('Insert image').click();
  await page.getByRole('button', { name: 'Link', exact: true }).click();
  await page.getByPlaceholder('Paste the image link…').fill('https://example.com/browser.png');
  await page.getByRole('button', { name: 'Embed image' }).click();

  await expect
    .poll(() => api.notes.get(browserFixture.source.id)?.content)
    .toContain('https://example.com/browser.png');
});

test('uploads an app-owned image and saves its stable attachment URL', async ({ page }) => {
  const api = await mockBrowserApi(page);
  await page.goto(`/notes/${browserFixture.source.id}`);

  await page.getByLabel('Insert image').click();
  await page.locator('input[type="file"]').setInputFiles({
    name: 'browser.png',
    mimeType: 'image/png',
    buffer: Buffer.from([137, 80, 78, 71]),
  });

  await expect
    .poll(() => api.notes.get(browserFixture.source.id)?.content)
    .toContain('/internal/attachments/attachment_browser/content');
});

test('keeps the editor open and reports an app-owned image upload failure', async ({ page }) => {
  await mockBrowserApi(page, { uploadFails: true });
  await page.goto(`/notes/${browserFixture.source.id}`);

  await page.getByLabel('Insert image').click();
  await page.locator('input[type="file"]').setInputFiles({
    name: 'browser.png',
    mimeType: 'image/png',
    buffer: Buffer.from([137, 80, 78, 71]),
  });

  await expect(page.getByText('Attachment storage unavailable').first()).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Add an image' })).toBeVisible();
});

test('persists a canvas edit through reload', async ({ page }) => {
  const api = await mockBrowserApi(page);
  await page.goto(`/notes/${browserFixture.canvas.id}`);

  await expect(page.locator('.notes-minu-canvas')).toBeVisible();
  await page.getByRole('button', { name: 'Rectangle (R)' }).click();
  await page.getByLabel('Canvas editor').click({ position: { x: 400, y: 300 } });

  await expect.poll(() => api.notes.get(browserFixture.canvas.id)?.content).toContain('rectangle');
  await page.reload();
  await expect(page.locator('.notes-minu-canvas')).toBeVisible();
  await expect(page.locator('[data-minucanvas-node-id]')).toHaveCount(1);
});

test('inserts an ID-backed wikilink selected from note suggestions', async ({ page }) => {
  const api = await mockBrowserApi(page);
  await page.goto(`/notes/${browserFixture.source.id}`);

  const editor = page.locator('.cm-content');
  await expect(editor).toBeVisible();
  await editor.click();
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+A' : 'Control+A');
  await page.keyboard.type('[[');

  await page.getByText(browserFixture.target.title, { exact: true }).click();
  await api.expectSavedContent(`[[${browserFixture.target.id}|${browserFixture.target.title}]]`);

  await page
    .getByText(`[[${browserFixture.target.id}|${browserFixture.target.title}]]`, { exact: true })
    .click({ modifiers: [process.platform === 'darwin' ? 'Meta' : 'Control'] });
  await expect(page).toHaveURL(new RegExp(`/notes/${browserFixture.target.id}$`));
});

test('refreshes wikilink suggestions while typing an open wikilink query', async ({ page }) => {
  const api = await mockBrowserApi(page);
  await page.goto(`/notes/${browserFixture.source.id}`);

  const editor = page.locator('.cm-content');
  await expect(editor).toBeVisible();
  await editor.click();
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+A' : 'Control+A');
  await page.keyboard.type('[[');

  api.notes.set('note_fresh_target', {
    ...browserFixture.target,
    id: 'note_fresh_target',
    title: 'Fresh Target',
    content: 'Fresh target content.',
  });

  await page.keyboard.type('Fresh');
  await page.getByText('Fresh Target', { exact: true }).click();
  await api.expectSavedContent('[[note_fresh_target|Fresh Target]]');
});
