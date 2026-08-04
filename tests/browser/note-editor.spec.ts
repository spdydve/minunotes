import { expect, test } from '@playwright/test';
import { browserFixture, mockBrowserApi } from './fixtures';

test('autosaves editor content and preserves it after reload', async ({ page }) => {
  const api = await mockBrowserApi(page);
  await page.goto(`/notes/${browserFixture.source.id}`);

  const editor = page.locator('.cm-content');
  await expect(editor).toBeVisible();
  await expect.poll(() => editor.evaluate((element) => getComputedStyle(element).fontFamily)).toContain('system-ui');
  await editor.click();
  await page.keyboard.press('End');
  await page.keyboard.type(' Updated.');

  await api.expectSavedContent('Start here. Updated.');
  await page.reload();
  await expect(page.locator('.cm-content')).toContainText('Start here. Updated.');
});

test('switches between live and source editing and autosaves raw markdown changes', async ({ page }) => {
  const api = await mockBrowserApi(page);
  const markdown = '![Browser image](https://example.com/source-mode.png)';
  api.notes.set(browserFixture.source.id, { ...browserFixture.source, content: markdown });
  await page.goto(`/notes/${browserFixture.source.id}`);

  await expect(page.locator('.me-image-wrapper')).toBeVisible();
  await page.getByLabel('Open note actions').click();
  await page.getByRole('button', { name: 'Source mode', exact: true }).click();

  const editor = page.locator('.cm-content');
  await expect(page.locator('.me-image-wrapper')).toHaveCount(0);
  await expect(editor).toContainText(markdown);
  await expect.poll(() => editor.evaluate((element) => getComputedStyle(element).fontFamily)).toContain('ui-monospace');

  await editor.click();
  await page.keyboard.press('End');
  await page.keyboard.type('\n\nEdited in source.');
  await api.expectSavedContent(`${markdown}\n\nEdited in source.`);

  await page.getByLabel('Open note actions').click();
  await page.getByRole('button', { name: 'Live mode', exact: true }).click();
  await expect(page.locator('.me-image-wrapper')).toBeVisible();
});

test('renders callouts and Mermaid diagrams in live mode', async ({ page }) => {
  const api = await mockBrowserApi(page);
  api.notes.set(browserFixture.source.id, {
    ...browserFixture.source,
    content: '> [!TIP]\n> Review before publishing.\n\n```mermaid\nflowchart LR\n  Draft --> Publish\n```',
  });
  await page.goto(`/notes/${browserFixture.source.id}`);

  await expect(page.locator('.me-callout-label--tip')).toBeVisible();
  const diagram = page.locator('.me-mermaid-block');
  await expect(diagram).toHaveClass(/me-mermaid-block--ready/, { timeout: 15_000 });
  await expect(diagram.locator('svg')).toBeVisible();

  const nodeFill = () =>
    diagram
      .locator('svg .node rect')
      .first()
      .evaluate((element) => getComputedStyle(element).fill);
  const darkNodeFill = await nodeFill();
  await page.getByLabel('Open settings').click();
  await page.getByLabel('Theme').selectOption('catppuccin-latte');
  await expect(page.locator('html')).toHaveClass(/theme-catppuccin-latte/);
  await expect.poll(nodeFill).not.toBe(darkNodeFill);
});

test('converts rich HTML paste into portable Markdown', async ({ page }) => {
  const api = await mockBrowserApi(page);
  await page.goto(`/notes/${browserFixture.source.id}`);

  const editor = page.locator('.cm-content');
  await editor.click();
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+A' : 'Control+A');
  await editor.evaluate((element) => {
    const clipboardData = new DataTransfer();
    clipboardData.setData('text/html', '<h2>Imported heading</h2><p><strong>Bold</strong> text</p>');
    clipboardData.setData('text/plain', 'Imported heading\nBold text');
    element.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData }));
  });

  await expect.poll(() => api.saveRequests.at(-1)?.body.content).toContain('## Imported heading');
  await expect.poll(() => api.saveRequests.at(-1)?.body.content).toContain('**Bold** text');
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

test('links, opens, and unlinks a canvas node while preserving its external URL', async ({ page }) => {
  const api = await mockBrowserApi(page);
  api.notes.set(browserFixture.canvas.id, {
    ...browserFixture.canvas,
    content: JSON.stringify({
      nodes: [
        {
          id: 'node_link',
          type: 'text',
          text: 'Canvas topic',
          x: 0,
          y: 0,
          width: 180,
          height: 80,
          url: 'https://example.com/reference',
        },
      ],
      edges: [],
    }),
  });
  await page.goto(`/notes/${browserFixture.canvas.id}`);

  const node = () => page.locator('[data-minucanvas-node-id="node_link"]');
  await expect(node()).toBeVisible();
  await node().click({ button: 'right' });
  await page.getByRole('button', { name: 'Link to note…', exact: true }).click();
  await expect(page.getByLabel('Close note link dialog')).toBeVisible();
  await expect(page.getByPlaceholder('Search notes...')).toHaveValue('');
  await page.getByLabel('Close note link dialog').click();
  await expect(page.getByRole('dialog', { name: 'Link node to note' })).toHaveCount(0);

  await node().click({ button: 'right' });
  await page.getByRole('button', { name: 'Link to note…', exact: true }).click();
  await expect(page.getByPlaceholder('Search notes...')).toHaveValue('');
  await page.getByPlaceholder('Search notes...').fill('Target');
  await page.getByRole('button', { name: /Target Note/ }).click();

  await expect
    .poll(() => {
      const content = api.notes.get(browserFixture.canvas.id)?.content;
      if (!content) return null;
      return JSON.parse(content).nodes[0]?.minunotes?.link?.id;
    })
    .toBe(browserFixture.target.id);

  await node().click({ button: 'right' });
  await expect(page.getByRole('button', { name: 'Edit link…', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Remove note link', exact: true }).click();

  await expect
    .poll(() => {
      const content = api.notes.get(browserFixture.canvas.id)?.content;
      if (!content) return null;
      const linkedNode = JSON.parse(content).nodes[0];
      return { internalLink: linkedNode?.minunotes?.link ?? null, url: linkedNode?.url };
    })
    .toEqual({ internalLink: null, url: 'https://example.com/reference' });

  await node().click({ button: 'right' });
  await page.getByRole('button', { name: 'Link to note…', exact: true }).click();
  await page.getByPlaceholder('Search notes...').fill('Target');
  await page.getByRole('button', { name: /Target Note/ }).click();
  await expect
    .poll(() => {
      const content = api.notes.get(browserFixture.canvas.id)?.content;
      if (!content) return null;
      return JSON.parse(content).nodes[0]?.minunotes?.link?.id;
    })
    .toBe(browserFixture.target.id);

  const popupPromise = page.waitForEvent('popup');
  await page.getByLabel('Open linked note: Canvas topic').click();
  const targetPage = await popupPromise;
  await expect(targetPage).toHaveURL(new RegExp(`/notes/${browserFixture.target.id}$`));
  await targetPage.close();
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
