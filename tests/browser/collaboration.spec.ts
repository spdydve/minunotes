import { expect, test } from '@playwright/test';
import { browserFixture, mockBrowserApi } from './fixtures';

test('lists direct shared roots without exposing owner identifiers', async ({ page }) => {
  await mockBrowserApi(page, { includeSharedCollaborations: true, noteAccessRole: 'commenter' });
  await page.goto('/shared');

  await expect(page.getByRole('heading', { name: 'Shared with me' })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: 'Shared' })).toHaveAttribute(
    'aria-current',
    'page'
  );
  await expect(page.getByRole('heading', { name: 'Notes' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Folders' })).toBeVisible();
  await expect(page.getByRole('row', { name: /Source Note Shared Owner Commenter/ })).toBeVisible();
  await expect(page.getByRole('row', { name: /Browser tests Shared Owner Editor/ })).toBeVisible();
  const ownerAvatars = page.locator('[data-avatar-palette]');
  await expect(ownerAvatars).toHaveCount(2);
  expect(await ownerAvatars.nth(0).getAttribute('data-avatar-palette')).toBe(
    await ownerAvatars.nth(1).getAttribute('data-avatar-palette')
  );
  await expect(page.getByText('collaboration_owner_browser')).toHaveCount(0);
});

test('manages owner-shared notes and folders with search and independent pagination', async ({ page }) => {
  await mockBrowserApi(page, { includeSharedByMe: true });
  await page.goto('/shared/by-me');

  await expect(page.getByRole('heading', { name: 'Shared by me' })).toBeVisible();
  await expect(page).toHaveTitle('Shared by me - MinuNotes');
  await expect(page.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: 'Shared' })).toHaveAttribute(
    'aria-current',
    'page'
  );
  const tabs = page.getByRole('navigation', { name: 'Sharing views' });
  await expect(tabs.getByRole('link', { name: 'Shared with me' })).toBeVisible();
  await expect(tabs.getByRole('link', { name: 'Shared by me' })).toHaveAttribute('aria-current', 'page');

  const notesSection = page.getByRole('region', { name: 'Notes' });
  const foldersSection = page.getByRole('region', { name: 'Folders' });
  await expect(foldersSection.getByRole('button', { name: 'Next' })).toBeDisabled();
  const sourceRow = notesSection.getByRole('row', { name: /Source Note/ });
  await expect(sourceRow).toContainText('active collaborators: 2');
  await expect(sourceRow).toContainText('pending invitations: 1');
  await expect(sourceRow).toContainText('On');
  await notesSection.getByRole('button', { name: 'Next' }).click();
  await expect(notesSection.getByRole('row', { name: /Linked Note/ })).toContainText('expired invitations: 1');
  await expect(notesSection.getByRole('button', { name: 'Previous' })).toBeEnabled();
  await expect(foldersSection.getByRole('button', { name: 'Next' })).toBeDisabled();
  await notesSection.getByRole('button', { name: 'Previous' }).click();

  const sharingSearch = page.getByRole('search');
  await sharingSearch.getByRole('searchbox', { name: 'Search shared by me' }).fill('Browser tests');
  await sharingSearch.getByRole('button', { name: 'Search', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Folders' }).getByRole('row', { name: /Browser tests/ })).toBeVisible();
  await expect(page.getByText('No shared notes match “Browser tests”.')).toBeVisible();
  await page.getByRole('button', { name: 'Clear' }).click();

  await page.getByRole('button', { name: `Manage sharing for ${browserFixture.source.title}` }).click();
  await expect(page.getByRole('heading', { name: 'Share note' })).toBeVisible();
  await expect(page.getByText('People with access')).toBeVisible();
  await page.getByRole('button', { name: 'Close share dialog' }).click();

  await page.getByRole('button', { name: `Manage sharing for ${browserFixture.folder.title}` }).click();
  await expect(page.getByRole('heading', { name: 'Share folder' })).toBeVisible();
  await page.getByRole('button', { name: 'Close share dialog' }).click();
});

test('keeps shared management scrolling inside the app shell', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 500 });
  await mockBrowserApi(page, { includeSharedByMe: true });
  await page.goto('/shared/by-me');
  await expect(page.getByRole('heading', { name: 'Shared by me' })).toBeVisible();
  await expect(page.getByRole('row', { name: /Source Note/ })).toBeVisible();
  await expect(page.getByRole('row', { name: /Browser tests/ })).toBeVisible();

  const overflow = await page.evaluate(() => {
    const root = document.querySelector<HTMLElement>('#root');
    const main = document.querySelector<HTMLElement>('main');
    if (!root || !main) throw new Error('App shell is missing');
    return {
      htmlOverflowY: getComputedStyle(document.documentElement).overflowY,
      bodyOverflowY: getComputedStyle(document.body).overflowY,
      rootOverflowY: getComputedStyle(root).overflowY,
      mainOverflowY: getComputedStyle(main).overflowY,
      mainScrolls: main.scrollHeight > main.clientHeight,
    };
  });
  expect(overflow).toEqual({
    htmlOverflowY: 'hidden',
    bodyOverflowY: 'hidden',
    rootOverflowY: 'hidden',
    mainOverflowY: 'auto',
    mainScrolls: true,
  });
});

test('shows empty owner-sharing tables', async ({ page }) => {
  await mockBrowserApi(page);
  await page.goto('/shared/by-me');

  await expect(page.getByText('No notes are currently shared.')).toBeVisible();
  await expect(page.getByText('No folders are currently shared.')).toBeVisible();
});

test('shows owner-sharing load errors', async ({ page }) => {
  await mockBrowserApi(page, { sharedByMeLoadFails: true });
  await page.goto('/shared/by-me');

  await expect(page.getByRole('heading', { name: 'Unable to load shared notes' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Unable to load shared folders' })).toBeVisible();
});

test('invitation landing safely continues an unauthenticated recipient to email authentication', async ({ page }) => {
  await mockBrowserApi(page, { sessionEmail: null, collaborationInvitation: {} });
  await page.goto('/invite/invitation_token');

  const invitationHeading = page.getByRole('heading', { name: 'You’re invited' });
  await expect(invitationHeading).toBeVisible();
  const invitationCard = invitationHeading.locator('..');
  const [cardBox, viewport] = await Promise.all([
    invitationCard.boundingBox(),
    page.evaluate(() => ({
      width: window.innerWidth,
      height: window.innerHeight,
    })),
  ]);
  expect(cardBox).not.toBeNull();
  expect(Math.abs((cardBox?.x ?? 0) + (cardBox?.width ?? 0) / 2 - viewport.width / 2)).toBeLessThan(2);
  expect(Math.abs((cardBox?.y ?? 0) + (cardBox?.height ?? 0) / 2 - viewport.height / 2)).toBeLessThan(2);
  await expect(page.getByText('Shared Owner shared “Source Note”')).toBeVisible();
  await expect(page.getByText(/Note · Commenter · Invited as b••••••@example.com/)).toBeVisible();
  const continueLink = page.getByRole('link', { name: 'Continue with email' });
  await expect(continueLink).toHaveAttribute('href', '/auth?redirect=%2Finvite%2Finvitation_token');
});

test('matching recipient accepts an invitation and opens the shared note', async ({ page }) => {
  await mockBrowserApi(page, { collaborationInvitation: {}, noteAccessRole: 'commenter' });
  await page.goto('/invite/invitation_token');

  await expect(page.getByText('Signed in as browser@example.com')).toBeVisible();
  await page.getByRole('button', { name: 'Accept invitation' }).click();
  await expect(page).toHaveURL(`/notes/${browserFixture.source.id}`);
  await expect(page.locator('.cm-content')).toContainText('Start here.');
  await expect(page.getByText('commenter', { exact: true })).toBeVisible();
});

test('mismatched recipient cannot accept an invitation', async ({ page }) => {
  await mockBrowserApi(page, {
    sessionEmail: 'wrong@example.com',
    collaborationInvitation: { acceptStatus: 403 },
  });
  await page.goto('/invite/invitation_token');

  await page.getByRole('button', { name: 'Accept invitation' }).click();
  await expect(page.getByText('This account does not match the invited email.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Accept invitation' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible();
  await expect(page).toHaveURL('/invite/invitation_token');
});

test('viewer sees a read-only note without review or owner controls', async ({ page }) => {
  await mockBrowserApi(page, { noteAccessRole: 'viewer' });
  await page.goto(`/notes/${browserFixture.source.id}`);

  await expect(page.getByText('viewer', { exact: true })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Untitled note' })).toHaveAttribute('readonly', '');
  await expect(page.locator('.cm-content')).toHaveAttribute('contenteditable', 'false');
  await expect(page.getByRole('button', { name: 'Open Review' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Open note actions' })).toHaveCount(0);
});

test('commenter can open Review but cannot edit or use note actions', async ({ page }) => {
  await mockBrowserApi(page, { noteAccessRole: 'commenter' });
  await page.goto(`/notes/${browserFixture.source.id}`);

  await expect(page.getByText('commenter', { exact: true })).toBeVisible();
  await expect(page.locator('.cm-content')).toHaveAttribute('contenteditable', 'false');
  await page.getByRole('button', { name: 'Open Review' }).click();
  await expect(page.getByText('Review', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Open note actions' })).toHaveCount(0);
});

test('role downgrade and revocation take effect on the next note load', async ({ page }) => {
  const api = await mockBrowserApi(page, { noteAccessRole: 'editor' });
  await page.goto(`/notes/${browserFixture.source.id}`);
  await expect(page.locator('.cm-content')).toHaveAttribute('contenteditable', 'true');

  api.setNoteAccessRole('commenter');
  await page.reload();
  await expect(page.locator('.cm-content')).toHaveAttribute('contenteditable', 'false');
  await expect(page.getByRole('button', { name: 'Open Review' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Open note actions' })).toHaveCount(0);

  api.setNoteAccessRole(null);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Note not found' })).toBeVisible();
  await expect(page.getByText('This note does not exist or you do not have access to it.')).toBeVisible();
});

test('editor can save content while owner-only note actions remain hidden', async ({ page }) => {
  const api = await mockBrowserApi(page, { noteAccessRole: 'editor' });
  await page.goto(`/notes/${browserFixture.source.id}`);

  const editor = page.locator('.cm-content');
  await expect(editor).toHaveAttribute('contenteditable', 'true');
  await editor.click();
  await page.keyboard.press('End');
  await page.keyboard.type(' Shared edit.');
  await api.expectSavedContent('Start here. Shared edit.');

  await page.getByRole('button', { name: 'Open note actions' }).click();
  await expect(page.getByRole('button', { name: 'Details', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Source mode', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Share', exact: true })).toHaveCount(0);
  await expect(page.getByText('Move to Trash', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Version history', exact: true })).toHaveCount(0);
});
