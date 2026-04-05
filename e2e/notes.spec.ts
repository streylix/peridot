import { test, expect, Page } from '@playwright/test';

async function waitForApp(page: Page) {
  await page.goto('/');
  await expect(page.locator('.logo h1')).toBeVisible({ timeout: 10_000 });
}

function uid() {
  return `_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
}

test.describe('Note CRUD', () => {
  test('create a new note via sidebar button', async ({ page }) => {
    await waitForApp(page);
    const title = `NewNote${uid()}`;

    await page.locator('.new-note-btn').first().click();
    const editor = page.locator('#inner-note');
    await expect(editor).toBeVisible({ timeout: 5_000 });

    await editor.click();
    await page.keyboard.type(title);
    await page.waitForTimeout(500);

    await expect(page.locator('.note-item').filter({ hasText: title }).first()).toBeVisible();
  });

  test('note content persists after navigating away and back', async ({ page }) => {
    await waitForApp(page);
    const titleA = `PersistA${uid()}`;
    const titleB = `PersistB${uid()}`;

    // Create first note
    await page.locator('.new-note-btn').first().click();
    let editor = page.locator('#inner-note');
    await expect(editor).toBeVisible({ timeout: 5_000 });
    await editor.click();
    await page.keyboard.type(titleA);
    await page.waitForTimeout(500);

    // Create second note
    await page.locator('.new-note-btn').first().click();
    await page.waitForTimeout(300);
    editor = page.locator('#inner-note');
    await editor.click();
    await page.keyboard.type(titleB);
    await page.waitForTimeout(500);

    // Click back on first note
    await page.locator('.note-item').filter({ hasText: titleA }).first().click();
    await page.waitForTimeout(300);

    await expect(page.locator('#inner-note')).toContainText(titleA);
  });

  test('edit an existing note', async ({ page }) => {
    await waitForApp(page);
    const title = `EditMe${uid()}`;

    await page.locator('.new-note-btn').first().click();
    const editor = page.locator('#inner-note');
    await expect(editor).toBeVisible({ timeout: 5_000 });
    await editor.click();
    await page.keyboard.type(title);
    await page.waitForTimeout(500);

    await page.keyboard.press('Enter');
    await page.keyboard.type('Appended line');
    await page.waitForTimeout(500);

    await expect(editor).toContainText('Appended line');
  });

  test('delete a note', async ({ page }) => {
    await waitForApp(page);
    const title = `DeleteMe${uid()}`;

    await page.locator('.new-note-btn').first().click();
    const editor = page.locator('#inner-note');
    await expect(editor).toBeVisible({ timeout: 5_000 });
    await editor.click();
    await page.keyboard.type(title);
    await page.waitForTimeout(500);

    const noteItem = page.locator('.note-item').filter({ hasText: title }).first();
    await expect(noteItem).toBeVisible();

    page.on('dialog', dialog => dialog.accept());
    await noteItem.click({ button: 'right' });
    await page.waitForTimeout(300);

    // Click the Delete button inside the context menu (info-menu)
    const deleteBtn = page.locator('.info-menu .info-menu-button', { hasText: /^Delete$/ });
    await expect(deleteBtn).toBeVisible({ timeout: 3_000 });
    await deleteBtn.click();
    await page.waitForTimeout(500);
    await expect(page.locator('.note-item').filter({ hasText: title })).toHaveCount(0);
  });
});

test.describe('Folder operations', () => {
  test('create a folder', async ({ page }) => {
    await waitForApp(page);
    await page.locator('.new-note-btn').nth(1).click();
    await page.waitForTimeout(500);
    await expect(page.locator('.folder-item').first()).toBeVisible({ timeout: 5_000 });
  });
});

test.describe('Sidebar', () => {
  test('toggle sidebar visibility', async ({ page }) => {
    await waitForApp(page);

    const sidebar = page.locator('#sidebar');
    await expect(sidebar).toBeVisible();

    await page.locator('#move-menu').click();
    await expect(sidebar).toHaveClass(/hidden/);

    await page.locator('#move-menu').click();
    await expect(sidebar).not.toHaveClass(/hidden/);
  });

  test('search filters notes', async ({ page }) => {
    await waitForApp(page);
    const title = `Search${uid()}`;

    await page.locator('.new-note-btn').first().click();
    const editor = page.locator('#inner-note');
    await expect(editor).toBeVisible({ timeout: 5_000 });
    await editor.click();
    await page.keyboard.type(title);
    await page.waitForTimeout(500);

    await page.fill('#note-search', title);
    await page.waitForTimeout(300);
    await expect(page.locator('.note-item').filter({ hasText: title }).first()).toBeVisible();

    await page.fill('#note-search', 'xyznonexistent999');
    await page.waitForTimeout(300);
    await expect(page.locator('.note-item').filter({ hasText: title })).toHaveCount(0);
  });
});

test.describe('Authentication', () => {
  test('shows login screen when not authenticated', async ({ browser }) => {
    const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const page = await context.newPage();
    await page.goto('http://localhost:5173');
    await expect(page.locator('input[placeholder="Email"]')).toBeVisible({ timeout: 10_000 });
    await context.close();
  });

  test('login with valid credentials', async ({ browser }) => {
    const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const page = await context.newPage();
    await page.goto('http://localhost:5173');
    await expect(page.locator('input[placeholder="Email"]')).toBeVisible({ timeout: 10_000 });
    await page.fill('input[placeholder="Email"]', 'admin@peridot.app');
    await page.fill('input[placeholder="Password"]', 'changeme123');
    await page.click('button.login-btn');
    await expect(page.locator('.logo h1')).toBeVisible({ timeout: 10_000 });
    await context.close();
  });

  test('login with bad credentials shows error', async ({ browser }) => {
    const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const page = await context.newPage();
    await page.goto('http://localhost:5173');
    await expect(page.locator('input[placeholder="Email"]')).toBeVisible({ timeout: 10_000 });
    await page.fill('input[placeholder="Email"]', 'bad@bad.com');
    await page.fill('input[placeholder="Password"]', 'wrong');
    await page.click('button.login-btn');
    await expect(page.locator('.login-error')).toBeVisible({ timeout: 5_000 });
    await context.close();
  });
});
