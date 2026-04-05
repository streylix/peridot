import { test as setup, expect } from '@playwright/test';

const authFile = 'playwright/.auth/user.json';

setup('authenticate', async ({ page }) => {
  await page.goto('/');

  // Should see the login form
  await expect(page.locator('input[placeholder="Email"]')).toBeVisible();

  // Fill login
  await page.fill('input[placeholder="Email"]', 'admin@peridot.app');
  await page.fill('input[placeholder="Password"]', 'changeme123');
  await page.click('button.login-btn');

  // Wait for the app to load (sidebar logo appears)
  await expect(page.locator('.logo h1')).toBeVisible({ timeout: 10_000 });

  // Save auth state
  await page.context().storageState({ path: authFile });
});
