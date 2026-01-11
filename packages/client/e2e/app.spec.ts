/**
 * Main Application E2E Tests
 *
 * Tests for the core application flow.
 */

import { test, expect } from './fixtures';

test.describe('Welcome Screen', () => {
  test('displays welcome screen on load', async ({ page }) => {
    await page.goto('/');

    // Check title
    await expect(page).toHaveTitle(/Reckoning/);

    // Check welcome screen elements
    await expect(page.locator('#welcome-screen h1')).toContainText('The Reckoning');
    await expect(page.locator('#new-game-btn')).toBeVisible();
    await expect(page.locator('#load-game-btn')).toBeVisible();
  });

  test('shows tagline on welcome screen', async ({ page }) => {
    await page.goto('/');

    const tagline = page.locator('.tagline');
    await expect(tagline).toContainText('judged');
  });
});

test.describe('New Game Flow', () => {
  test('clicking new game opens modal', async ({ mockedPage }) => {
    await mockedPage.goto('/');
    await mockedPage.click('#new-game-btn');

    // Modal should appear with input for player name
    await expect(mockedPage.locator('.modal, [role="dialog"]')).toBeVisible({ timeout: 5000 });
  });
});

test.describe('Game UI', () => {
  test('game UI is hidden initially', async ({ page }) => {
    await page.goto('/');

    const gameUI = page.locator('#game-ui');
    await expect(gameUI).not.toHaveClass(/active/);
  });
});
