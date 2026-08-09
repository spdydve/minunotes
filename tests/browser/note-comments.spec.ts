import { expect, test } from '@playwright/test';
import { browserFixture, mockBrowserApi } from './fixtures';

test('creates, replies to, resolves, reopens, and remaps an anchored Review thread', async ({ page }) => {
  const api = await mockBrowserApi(page);
  await page.goto(`/notes/${browserFixture.source.id}`);

  const editor = page.locator('.cm-content');
  await expect(editor).toContainText('Start here.');
  await editor.click();
  await page.keyboard.press('ControlOrMeta+A');
  await page.getByRole('button', { name: 'Comment', exact: true }).click();

  const panel = page.getByLabel('Review comments');
  await expect(panel).toBeVisible();
  await expect(panel.getByText('Start here.')).toBeVisible();
  await panel.getByPlaceholder('Leave a comment…').fill('Please review this opening.');
  await panel.getByRole('button', { name: 'Comment', exact: true }).click();

  const commentAnchor = page.locator('.me-comment-anchor');
  await expect(commentAnchor).toContainText('Start here.');
  await expect(panel.getByText('Please review this opening.')).toBeVisible();
  await panel.getByRole('button', { name: 'Close Review' }).click();
  await expect(panel).toBeHidden();
  await commentAnchor.click();
  await expect(panel).toBeVisible();
  await panel.getByPlaceholder('Reply…').fill('Owner follow-up.');
  await panel.getByRole('button', { name: 'Reply', exact: true }).click();
  await expect(panel.getByText('Owner follow-up.')).toBeVisible();

  await panel.getByRole('button', { name: 'Resolve comment' }).click();
  await expect(panel.getByRole('button', { name: 'Reopen comment' })).toBeVisible();
  await panel.getByRole('button', { name: 'Reopen comment' }).click();
  await expect(panel.getByRole('button', { name: 'Resolve comment' })).toBeVisible();

  await editor.click();
  await page.keyboard.press('Home');
  await page.keyboard.type('Before ');
  await api.expectSavedContent('Before Start here.');
  await expect
    .poll(() => api.commentRequests.find((request) => request.path.endsWith('/anchor'))?.body)
    .toMatchObject({
      anchor: { from: 7, to: 18, quote: 'Start here.', documentHash: 'hash_2' },
    });

  await editor.click();
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.type('Replacement');
  await api.expectSavedContent('Replacement');
  await expect
    .poll(() => api.commentRequests.filter((request) => request.path.endsWith('/anchor')).at(-1)?.body)
    .toMatchObject({ anchor: { quote: 'Start here.', detached: true, documentHash: 'hash_3' } });
  await expect(panel.getByText('The commented text changed and could not be reattached.')).toBeVisible();
});

test('creates a whole-line comment from the editor gutter', async ({ page }) => {
  await mockBrowserApi(page);
  await page.goto(`/notes/${browserFixture.source.id}`);

  const editor = page.locator('.cm-content');
  await editor.click();
  await page.getByRole('button', { name: 'Comment on line' }).click();
  const panel = page.getByLabel('Review comments');
  await expect(panel.getByText('Start here.')).toBeVisible();
  await panel.getByPlaceholder('Leave a comment…').fill('Review the complete line.');
  await panel.getByRole('button', { name: 'Comment', exact: true }).click();
  await expect(page.locator('.me-comment-anchor')).toContainText('Start here.');
});

test('opens Review as a narrow-screen panel', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockBrowserApi(page);
  await page.goto(`/notes/${browserFixture.source.id}`);

  await page.getByRole('button', { name: 'Open Review' }).click();
  const panel = page.getByLabel('Review comments');
  await expect(panel).toBeVisible();
  await expect(panel.getByText('No comments yet.')).toBeVisible();
  await expect(panel).toHaveCSS('position', 'fixed');
});
