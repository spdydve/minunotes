import { expect, test } from '@playwright/test';
import { browserFixture, mockBrowserApi } from './fixtures';

test('uses an anchored dialog for creation and viewing, with full discussion in the Review drawer', async ({
  page,
}) => {
  const api = await mockBrowserApi(page);
  await page.goto(`/notes/${browserFixture.source.id}`);

  const editor = page.locator('.cm-content');
  await expect(editor).toContainText('Start here.');
  await editor.click();
  await page.keyboard.press('ControlOrMeta+A');
  await page.getByRole('button', { name: 'Comment', exact: true }).click();

  const createDialog = page.getByLabel('Add comment');
  await expect(createDialog).toBeVisible();
  await expect(createDialog.getByText('Start here.')).toBeVisible();
  const editorBox = await editor.boundingBox();
  const dialogBox = await createDialog.boundingBox();
  if (!editorBox || !dialogBox) throw new Error('Expected editor and comment dialog bounds');
  expect(dialogBox.y).toBeGreaterThanOrEqual(editorBox.y - 20);
  await createDialog.getByPlaceholder('Leave a comment…').fill('Please review this opening.');
  await createDialog.getByRole('button', { name: 'Comment', exact: true }).click();

  const commentAnchor = page.locator('.me-comment-anchor');
  await expect(commentAnchor).toContainText('Start here.');
  const threadDialog = page.getByRole('dialog', { name: 'Comment thread', exact: true });
  await expect(threadDialog.getByText('Please review this opening.')).toBeVisible();
  await threadDialog.getByRole('button', { name: 'Close comment' }).click();

  const reviewButton = page.getByRole('button', { name: 'Open Review' });
  await expect(reviewButton).toHaveText('');
  await reviewButton.click();
  const drawer = page.getByRole('dialog', { name: 'Review' });
  await expect(drawer).toBeVisible();
  await expect(drawer.getByText('Please review this opening.')).toBeVisible();
  await drawer.getByText('Browser Test User', { exact: true }).first().click();
  await drawer.getByPlaceholder('Reply…').fill('Owner follow-up.');
  await drawer.getByRole('button', { name: 'Reply', exact: true }).click();
  await expect(drawer.getByText('Owner follow-up.')).toBeVisible();
  await drawer.getByRole('button', { name: 'Resolve comment' }).click();
  await expect(drawer.getByRole('button', { name: 'Reopen comment' })).toBeVisible();
  await drawer.getByRole('button', { name: 'Reopen comment' }).click();
  await drawer.getByRole('button', { name: 'Close Review' }).click();

  await commentAnchor.click();
  await expect(threadDialog).toBeVisible();
  await expect(drawer).toBeHidden();

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
  await expect(threadDialog.getByText('The original text could not be reattached.')).toBeVisible();
});

test('creates a whole-line comment from a simple themed gutter icon', async ({ page }) => {
  await mockBrowserApi(page);
  await page.goto(`/notes/${browserFixture.source.id}`);

  const editor = page.locator('.cm-content');
  await editor.click();
  const lineButton = page.getByRole('button', { name: 'Comment on line' });
  await expect(lineButton).toHaveCSS('border-top-width', '0px');
  const usesThemeMutedColor = () =>
    lineButton.evaluate((element) => {
      const probe = document.createElement('span');
      probe.style.color = 'var(--notes-muted)';
      document.body.append(probe);
      const expected = getComputedStyle(probe).color;
      probe.remove();
      return getComputedStyle(element).color === expected;
    });
  await expect.poll(usesThemeMutedColor).toBe(true);
  await lineButton.click();
  const dialog = page.getByLabel('Add comment');
  await expect(dialog.getByText('Start here.')).toBeVisible();
  await dialog.getByPlaceholder('Leave a comment…').fill('Review the complete line.');
  await dialog.getByRole('button', { name: 'Comment', exact: true }).click();
  await expect(page.locator('.me-comment-anchor')).toContainText('Start here.');

  await page.getByLabel('Open settings').click();
  await page.getByLabel('Theme').selectOption('catppuccin-latte');
  await expect(page.locator('html')).toHaveClass(/theme-catppuccin-latte/);
  const existingCommentButton = page.locator('.me-comment-gutter-badge').first();
  await expect
    .poll(() =>
      existingCommentButton.evaluate((element) => {
        const probe = document.createElement('span');
        probe.style.color = 'var(--notes-muted)';
        document.body.append(probe);
        const expected = getComputedStyle(probe).color;
        probe.remove();
        return getComputedStyle(element).color === expected;
      })
    )
    .toBe(true);
});

test('opens Review with the same responsive drawer geometry as Backlinks', async ({ page }) => {
  await mockBrowserApi(page);
  await page.goto(`/notes/${browserFixture.source.id}`);

  await page.getByRole('button', { name: 'Open Review' }).click();
  const desktopDrawer = page.getByRole('dialog', { name: 'Review' });
  await expect(desktopDrawer).toBeVisible();
  await expect(desktopDrawer).toHaveCSS('position', 'fixed');
  const desktopBox = await desktopDrawer.boundingBox();
  expect(desktopBox?.width).toBeCloseTo(384, -1);
  expect(desktopBox?.x).toBeGreaterThan(800);
  await desktopDrawer.getByRole('button', { name: 'Close Review' }).click();

  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Open Review' }).click();
  const mobileDrawer = page.getByRole('dialog', { name: 'Review' });
  await expect(mobileDrawer).toBeVisible();
  const mobileBox = await mobileDrawer.boundingBox();
  expect(mobileBox?.x).toBe(0);
  expect(mobileBox?.width).toBe(390);
  expect(mobileBox?.y).toBeGreaterThan(100);
});
