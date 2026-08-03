import { expect, test } from '@playwright/test';
import { browserFixture, mockBrowserApi } from './fixtures';

test('preserves nested folder context while navigating between folders and notes', async ({ page }) => {
  await mockBrowserApi(page);
  await page.goto(`/notes/${browserFixture.child.id}`);

  const primary = page.getByRole('navigation', { name: 'Primary' });
  const breadcrumb = page.getByRole('navigation', { name: 'Breadcrumb' });
  await expect(primary.getByRole('link', { name: browserFixture.folder.title })).toBeVisible();
  await expect(primary.getByRole('link', { name: browserFixture.childFolder.title })).toHaveAttribute(
    'aria-current',
    'location'
  );
  await expect(breadcrumb.getByRole('link', { name: browserFixture.folder.title })).toBeVisible();
  await expect(breadcrumb.getByRole('link', { name: browserFixture.childFolder.title })).toBeVisible();
  await expect(breadcrumb.getByText(browserFixture.child.title, { exact: true })).toHaveAttribute(
    'aria-current',
    'page'
  );

  await breadcrumb.getByRole('link', { name: browserFixture.childFolder.title }).click();
  await expect(page).toHaveURL(`/folders/${browserFixture.childFolder.id}`);
  await primary.getByRole('link', { name: 'Home', exact: true }).click();
  await expect(page).toHaveURL('/');
});

test('uses a static brand and aligns sidebar controls with desktop breadcrumbs', async ({ page }) => {
  await mockBrowserApi(page);
  await page.goto('/');

  const brand = page.getByText('MinuNotes', { exact: true });
  const collapse = page.getByRole('button', { name: 'Collapse sidebar' });
  const breadcrumb = page.getByRole('navigation', { name: 'Breadcrumb' });
  await expect(page.getByRole('link', { name: 'MinuNotes', exact: true })).toHaveCount(0);
  await expect
    .poll(() => page.locator('html').evaluate((element) => getComputedStyle(element).fontFamily))
    .toContain('system-ui');
  await expect.poll(() => brand.evaluate((element) => getComputedStyle(element).fontFamily)).toContain('ui-monospace');

  const [brandBox, collapseBox, breadcrumbBox] = await Promise.all([
    brand.boundingBox(),
    collapse.boundingBox(),
    breadcrumb.boundingBox(),
  ]);
  if (!brandBox || !collapseBox || !breadcrumbBox) throw new Error('Navigation header elements must be visible');
  const breadcrumbCenter = breadcrumbBox.y + breadcrumbBox.height / 2;
  expect(Math.abs(brandBox.y + brandBox.height / 2 - breadcrumbCenter)).toBeLessThanOrEqual(1);
  expect(Math.abs(collapseBox.y + collapseBox.height / 2 - breadcrumbCenter)).toBeLessThanOrEqual(1);
});

test('keeps the narrow sidebar scrollbar unobtrusive without disabling scroll', async ({ page }) => {
  const api = await mockBrowserApi(page);
  for (let index = 0; index < 20; index += 1) {
    api.folders.push({
      ...browserFixture.folder,
      id: `folder_scroll_${index}`,
      title: `Scrollable folder ${index + 1}`,
    });
  }
  await page.setViewportSize({ width: 1280, height: 420 });
  await page.goto('/');

  const primary = page.getByRole('navigation', { name: 'Primary' });
  const [sidebarBox, primaryBox] = await Promise.all([page.locator('aside').boundingBox(), primary.boundingBox()]);
  if (!sidebarBox || !primaryBox) throw new Error('Sidebar navigation must be visible');
  expect(Math.abs(primaryBox.x + primaryBox.width - (sidebarBox.x + sidebarBox.width))).toBeLessThanOrEqual(1);
  await expect.poll(() => primary.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(true);
  await expect.poll(() => primary.evaluate((element) => getComputedStyle(element).scrollbarWidth)).toBe('thin');
  await primary.hover();
  await page.mouse.wheel(0, 300);
  await expect.poll(() => primary.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
});

test('supports Home to folder to note navigation with browser history', async ({ page }) => {
  await mockBrowserApi(page);
  await page.goto('/');

  const primary = page.getByRole('navigation', { name: 'Primary' });
  await expect(primary.getByRole('link', { name: 'Home', exact: true })).toHaveAttribute('aria-current', 'page');
  await primary.getByRole('link', { name: browserFixture.folder.title }).click();
  await page.getByRole('link', { name: browserFixture.childFolder.title }).click();
  await page.getByRole('link', { name: browserFixture.child.title }).click();
  await expect(page).toHaveURL(`/notes/${browserFixture.child.id}`);

  await page.goBack();
  await expect(page).toHaveURL(`/folders/${browserFixture.childFolder.id}`);
  await page.goForward();
  await expect(page).toHaveURL(`/notes/${browserFixture.child.id}`);
});

test('saves a markdown note before structural folder navigation proceeds', async ({ page }) => {
  const api = await mockBrowserApi(page);
  await page.goto(`/notes/${browserFixture.source.id}`);

  const editor = page.locator('.cm-content');
  await editor.click();
  await page.keyboard.press('End');
  await page.keyboard.type(' Navigating.');
  await page
    .getByRole('navigation', { name: 'Breadcrumb' })
    .getByRole('link', { name: browserFixture.folder.title })
    .click();

  await expect(page).toHaveURL(`/folders/${browserFixture.folder.id}`);
  await api.expectSavedContent('Start here. Navigating.');
});

test('uses Templates as the parent while editing a template', async ({ page }) => {
  const api = await mockBrowserApi(page);
  const template = {
    ...browserFixture.source,
    id: 'note_template',
    title: 'Weekly template',
    type: 'template' as const,
  };
  api.notes.set(template.id, template);

  await page.goto(`/notes/${template.id}`);

  const primary = page.getByRole('navigation', { name: 'Primary' });
  const breadcrumb = page.getByRole('navigation', { name: 'Breadcrumb' });
  await expect(primary.getByRole('link', { name: 'Templates' })).toHaveAttribute('aria-current', 'page');
  await expect(breadcrumb.getByRole('link', { name: 'Templates' })).toBeVisible();
  await expect(breadcrumb.getByText(template.title, { exact: true })).toHaveAttribute('aria-current', 'page');

  await breadcrumb.getByRole('link', { name: 'Templates' }).click();
  await expect(page).toHaveURL('/templates');
});

test('shows route-aware mobile navigation and active folder context', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockBrowserApi(page);
  await page.goto(`/notes/${browserFixture.child.id}`);

  await expect(page.getByRole('heading', { name: browserFixture.child.title, exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Open menu' }).click();
  const primary = page.getByRole('navigation', { name: 'Primary' });
  await expect(primary.getByRole('link', { name: browserFixture.childFolder.title })).toHaveAttribute(
    'aria-current',
    'location'
  );
  await page.getByRole('button', { name: 'Close menu' }).click();

  await page.getByRole('link', { name: `Go to ${browserFixture.childFolder.title}` }).click();
  await expect(page).toHaveURL(`/folders/${browserFixture.childFolder.id}`);
  await expect(page.getByRole('heading', { name: browserFixture.childFolder.title, level: 1 })).toBeVisible();
});

test('opens search with recent notes and restores trigger focus on Escape', async ({ page }) => {
  await mockBrowserApi(page);
  await page.goto('/');

  const searchButton = page.getByRole('button', { name: 'Search', exact: true });
  await expect(searchButton).toHaveAttribute('title', `Search (${process.platform === 'darwin' ? '⌘K' : 'Ctrl+K'})`);
  await searchButton.click();
  const dialog = page.getByRole('dialog', { name: 'Search notes' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('option', { name: new RegExp(browserFixture.source.title) })).toBeVisible();
  await expect(dialog.getByRole('textbox', { name: 'Search notes or folders' })).toBeFocused();

  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(searchButton).toBeFocused();
});

test('navigates keyboard-only search while the desktop sidebar is collapsed', async ({ page }) => {
  await mockBrowserApi(page);
  await page.goto('/');
  await page.getByRole('button', { name: 'Collapse sidebar' }).click();

  await page.keyboard.press('Control+k');
  const dialog = page.getByRole('dialog', { name: 'Search notes' });
  const input = dialog.getByRole('textbox', { name: 'Search notes or folders' });
  await input.fill('Child');
  await expect(dialog.getByRole('option', { name: new RegExp(browserFixture.childFolder.title) })).toBeVisible();
  await expect(dialog.getByRole('option', { name: new RegExp(browserFixture.child.title) })).toBeVisible();
  await input.press('ArrowDown');
  await input.press('Enter');

  await expect(page).toHaveURL(`/notes/${browserFixture.child.id}`);
  await expect(dialog).toBeHidden();
});

test('navigates to a folder from search with normal history', async ({ page }) => {
  await mockBrowserApi(page);
  await page.goto('/');
  await expect(page.getByRole('navigation', { name: 'Primary' })).toBeVisible();
  await page.keyboard.press('Control+k');

  const dialog = page.getByRole('dialog', { name: 'Search notes' });
  const input = dialog.getByRole('textbox', { name: 'Search notes or folders' });
  await input.fill('Browser tests');
  await input.press('Enter');
  await expect(page).toHaveURL(`/folders/${browserFixture.folder.id}`);
  await page.goBack();
  await expect(page).toHaveURL('/');
});

test('supports mobile search and backlink navigation with focus restoration', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockBrowserApi(page);
  await page.goto(`/notes/${browserFixture.target.id}`);

  const backlinksButton = page.getByRole('button', { name: /Open backlinks/ });
  await expect(backlinksButton).toBeVisible();
  await backlinksButton.click();
  const backlinksDialog = page.getByRole('dialog', { name: 'Backlinks' });
  await expect(backlinksDialog).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(backlinksDialog).toBeHidden();
  await expect(backlinksButton).toBeFocused();

  await page.getByRole('button', { name: 'Open menu' }).click();
  const searchButton = page.getByRole('button', { name: 'Search', exact: true });
  await searchButton.click();
  const searchDialog = page.getByRole('dialog', { name: 'Search notes' });
  await expect(searchDialog).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(searchButton).toBeFocused();

  await page.getByRole('button', { name: 'Close menu' }).click();
  await backlinksButton.click();
  await backlinksDialog.getByRole('link', { name: new RegExp(browserFixture.linked.title) }).click();
  await expect(page).toHaveURL(`/notes/${browserFixture.linked.id}`);
});

test('creates a top-level folder from the Folders section and opens it', async ({ page }) => {
  await mockBrowserApi(page);
  await page.goto('/');

  const primary = page.getByRole('navigation', { name: 'Primary' });
  const trigger = primary.getByRole('button', { name: 'Create top-level folder' });
  await trigger.click();
  const dialog = page.getByRole('dialog', { name: 'Create top-level folder' });
  const submit = dialog.getByRole('button', { name: 'Create folder' });
  await expect(submit).toBeDisabled();
  await dialog.getByRole('textbox', { name: 'Folder name' }).fill('New workspace');
  await submit.click();

  await expect(dialog).toBeHidden();
  await expect(page).toHaveURL('/folders/folder_created_3');
  await expect(primary.getByRole('link', { name: 'New workspace' })).toHaveAttribute('aria-current', 'page');
});

test('creates subfolders from the parent action menu without leaving the folder', async ({ page }) => {
  const api = await mockBrowserApi(page);
  await page.goto(`/folders/${browserFixture.folder.id}`);
  await page
    .getByRole('main')
    .getByRole('button', { name: `Actions for ${browserFixture.folder.title}` })
    .click();
  await page.getByRole('button', { name: 'Add subfolder' }).click();

  const dialog = page.getByRole('dialog', { name: 'Create subfolder' });
  await expect(dialog.getByText(`Add a folder under ${browserFixture.folder.title}.`)).toBeVisible();
  await dialog.getByRole('textbox', { name: 'Folder name' }).fill('Created child');
  await dialog.getByRole('button', { name: 'Create folder' }).click();

  await expect(dialog).toBeHidden();
  await expect(page).toHaveURL(`/folders/${browserFixture.folder.id}`);
  await expect
    .poll(() => api.folders.find((folder) => folder.title === 'Created child')?.parentFolderId)
    .toBe(browserFixture.folder.id);
});

test('keeps the folder dialog open and reports creation failures', async ({ page }) => {
  await mockBrowserApi(page, { folderCreateFails: true });
  await page.goto('/');
  await page
    .getByRole('navigation', { name: 'Primary' })
    .getByRole('button', { name: 'Create top-level folder' })
    .click();

  const dialog = page.getByRole('dialog', { name: 'Create top-level folder' });
  await dialog.getByRole('textbox', { name: 'Folder name' }).fill('Unavailable folder');
  await dialog.getByRole('button', { name: 'Create folder' }).click();

  await expect(dialog.getByRole('alert')).toContainText('Folder creation unavailable');
  await expect(dialog).toBeVisible();
  await expect(page).toHaveURL('/');
});

test('closes the mobile drawer after creating a top-level folder', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockBrowserApi(page);
  await page.goto('/');
  await page.getByRole('button', { name: 'Open menu' }).click();
  await page
    .getByRole('navigation', { name: 'Primary' })
    .getByRole('button', { name: 'Create top-level folder' })
    .click();

  const dialog = page.getByRole('dialog', { name: 'Create top-level folder' });
  await dialog.getByRole('textbox', { name: 'Folder name' }).fill('Mobile workspace');
  await dialog.getByRole('button', { name: 'Create folder' }).click();

  await expect(page).toHaveURL('/folders/folder_created_3');
  await expect(page.getByRole('button', { name: 'Close menu' })).toBeHidden();
});

test('persists desktop sidebar and folder expansion preferences', async ({ page }) => {
  await mockBrowserApi(page);
  await page.goto(`/folders/${browserFixture.folder.id}`);

  await page
    .getByRole('navigation', { name: 'Primary' })
    .getByRole('button', { name: `Expand ${browserFixture.folder.title}` })
    .click();
  await expect(
    page.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: browserFixture.childFolder.title })
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: browserFixture.childFolder.title })
  ).toBeVisible();

  await page.getByRole('button', { name: 'Collapse sidebar' }).click();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Expand sidebar' })).toBeVisible();
  await page.getByRole('button', { name: 'Expand sidebar' }).click();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Collapse sidebar' })).toBeVisible();
});

test('shows folder context on Recent Notes', async ({ page }) => {
  await mockBrowserApi(page);
  await page.goto('/');

  const main = page.getByRole('main');
  const sourceLink = main.getByRole('link', { name: browserFixture.source.title });
  await expect(sourceLink).toBeVisible();
  await expect(main.getByRole('link', { name: browserFixture.folder.title }).first()).toBeVisible();
});

test('keeps long breadcrumbs discoverable and horizontally scrollable', async ({ page }) => {
  await page.setViewportSize({ width: 800, height: 700 });
  const api = await mockBrowserApi(page);
  api.folders[0].title = `Projects ${'with a very long name '.repeat(8)}`;
  api.folders[1].title = `Research ${'with another long name '.repeat(8)}`;
  await page.goto(`/notes/${browserFixture.child.id}`);

  const breadcrumb = page.getByRole('navigation', { name: 'Breadcrumb' });
  await expect(breadcrumb).toBeVisible();
  await expect(breadcrumb.getByRole('link', { name: api.folders[0].title })).toHaveAttribute(
    'title',
    api.folders[0].title
  );
  expect(await breadcrumb.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(true);
});

test('renders unknown routes with a useful Home escape', async ({ page }) => {
  await mockBrowserApi(page);
  await page.goto('/does-not-exist');

  await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible();
  await expect(page).toHaveTitle('Page not found - MinuNotes');
  await page.getByRole('link', { name: 'Go to Home' }).click();
  await expect(page).toHaveURL('/');
});

test('redirects legacy folder template settings before rendering', async ({ page }) => {
  await mockBrowserApi(page);
  await page.goto(`/folders/${browserFixture.folder.id}/templates`);

  await expect(page).toHaveURL(`/folders/${browserFixture.folder.id}/settings`);
  await expect(page.getByText('Opening folder settings...')).toHaveCount(0);
  await expect(page).toHaveTitle(`${browserFixture.folder.title} settings - MinuNotes`);
});

test('sets descriptive titles for authenticated and shared routes', async ({ page }) => {
  await mockBrowserApi(page);

  await page.goto('/');
  await expect(page).toHaveTitle('Recent notes - MinuNotes');
  await page.goto(`/folders/${browserFixture.folder.id}`);
  await expect(page).toHaveTitle(`${browserFixture.folder.title} - MinuNotes`);
  await page.goto(`/notes/${browserFixture.source.id}/activity`);
  await expect(page).toHaveTitle(`${browserFixture.source.title} activity - MinuNotes`);
  await page.goto('/templates');
  await expect(page).toHaveTitle('Templates - MinuNotes');
  await page.goto('/resources/markdown-editor');
  await expect(page).toHaveTitle('Markdown and editor - MinuNotes');
  await page.goto(`/share/note_share_${browserFixture.linked.id}`);
  await expect(page).toHaveTitle(`${browserFixture.linked.title} - MinuNotes`);
  await page.goto('/share/folders/folder_share_token');
  await expect(page).toHaveTitle(`${browserFixture.folder.title} - MinuNotes`);
  await page.goto(`/share/folders/folder_share_token?note=${browserFixture.target.id}`);
  await expect(page).toHaveTitle(`${browserFixture.target.title} - MinuNotes`);
});

test('shows one consolidated folder settings destination', async ({ page }) => {
  await mockBrowserApi(page);
  await page.goto(`/folders/${browserFixture.folder.id}`);

  await page
    .getByRole('main')
    .getByRole('button', { name: `Actions for ${browserFixture.folder.title}` })
    .click();
  await expect(page.getByRole('button', { name: 'Settings', exact: true })).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Template settings' })).toHaveCount(0);
});

test('shows note context on the activity route', async ({ page }) => {
  await mockBrowserApi(page);
  await page.goto(`/notes/${browserFixture.source.id}/activity`);

  const breadcrumb = page.getByRole('navigation', { name: 'Breadcrumb' });
  await expect(breadcrumb.getByRole('link', { name: browserFixture.source.title })).toBeVisible();
  await expect(breadcrumb.getByText('Activity', { exact: true })).toHaveAttribute('aria-current', 'page');
  await page.getByRole('link', { name: 'Back to note' }).click();
  await expect(page).toHaveURL(`/notes/${browserFixture.source.id}`);
});
