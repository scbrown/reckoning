/**
 * Playwright Test Fixtures
 *
 * Custom fixtures for E2E testing the Reckoning client.
 *
 * IMPORTANT: Tests run against the REAL backend server.
 * Only external services (AI generation, ElevenLabs TTS) are mocked.
 */

import { test as base, expect, Page } from '@playwright/test';

/**
 * Custom fixture types
 */
export interface ReckoningFixtures {
  /** Page with external services mocked (AI, TTS) */
  mockedPage: Page;
  /** Helper to start a new game through the wizard */
  startGame: (playerName?: string) => Promise<string>;
  /** Helper to wait for game UI to be ready */
  waitForGameUI: () => Promise<void>;
}

/**
 * Extended test with custom fixtures
 */
export const test = base.extend<ReckoningFixtures>({
  mockedPage: async ({ page }, use) => {
    // Only mock external services - let real backend handle everything else
    await mockExternalServices(page);
    await use(page);
  },

  startGame: async ({ page }, use) => {
    const startGame = async (playerName = 'Test Hero'): Promise<string> => {
      // Mock external services first
      await mockExternalServices(page);

      // Navigate to app
      await page.goto('/');

      // Click new game button
      await page.click('#new-game-btn');

      // Wait for modal to appear
      await page.waitForSelector('[role="dialog"]', { timeout: 5000 });

      // Step 1: Character - Fill in name
      const nameInput = page.locator('input[placeholder*="name" i]').first();
      await nameInput.fill(playerName);

      // Click Next through each wizard step
      // Step 1 -> Step 2 (Party)
      await page.click('button:has-text("Next")');
      await page.waitForTimeout(300);

      // Step 2 -> Step 3 (World)
      const nextBtn2 = page.locator('button:has-text("Next")');
      if (await nextBtn2.isVisible({ timeout: 2000 })) {
        await nextBtn2.click();
        await page.waitForTimeout(300);
      }

      // Step 3: World - Click "Generate World" to go to Step 4 (Review)
      const generateWorldBtn = page.locator('button:has-text("Generate World")');
      if (await generateWorldBtn.isVisible({ timeout: 2000 })) {
        await generateWorldBtn.click();
        await page.waitForTimeout(300);
      }

      // Step 4: Review - Click Begin Adventure or similar
      const beginBtn = page.locator('button:has-text("Begin Adventure"), button:has-text("Begin"), button:has-text("Start"), button:has-text("Create")');
      if (await beginBtn.isVisible({ timeout: 2000 })) {
        await beginBtn.click();
      }

      // Wait for game UI to appear
      await page.waitForSelector('#game-ui.active', { timeout: 30000 });

      // Return the game ID from URL or state if available
      return 'test-game';
    };
    await use(startGame);
  },

  waitForGameUI: async ({ page }, use) => {
    const waitForGameUI = async () => {
      await page.waitForSelector('#game-ui.active', { timeout: 30000 });
      // Wait for initial components to render
      await page.waitForTimeout(500);
    };
    await use(waitForGameUI);
  },
});

/**
 * Mock only external services (AI and TTS)
 * The real backend handles all game logic
 */
async function mockExternalServices(page: Page): Promise<void> {
  // Mock ElevenLabs TTS API calls
  // The server calls ElevenLabs - we intercept at the server's outbound level
  // But since we can't intercept server-side calls from Playwright,
  // we mock the client-side TTS endpoint to return instant audio
  await page.route('**/api/tts/speak', async (route) => {
    // Return a minimal valid MP3 audio response (silent)
    // This is a valid MP3 frame header for silence
    const silentMp3 = Buffer.from([
      0xff, 0xfb, 0x90, 0x00, 0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    ]);
    await route.fulfill({
      status: 200,
      contentType: 'audio/mpeg',
      body: silentMp3,
    });
  });

  // Note: AI generation mocking needs to happen at server level
  // via environment variables or a test mode flag.
  // For now, tests that require AI responses will use the real AI
  // or the server should be started with AI_MOCK=true
}

/**
 * Re-export expect for convenience
 */
export { expect };
