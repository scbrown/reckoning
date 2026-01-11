/**
 * Playwright Test Fixtures
 *
 * Custom fixtures for E2E testing the Reckoning client.
 */

import { test as base, expect, Page } from '@playwright/test';

/**
 * Custom fixture types
 */
export interface ReckoningFixtures {
  /** Page with mocked API responses */
  mockedPage: Page;
  /** Helper to start a new game */
  startGame: (playerName?: string) => Promise<void>;
  /** Helper to wait for game UI to be ready */
  waitForGameUI: () => Promise<void>;
}

/**
 * Extended test with custom fixtures
 */
export const test = base.extend<ReckoningFixtures>({
  mockedPage: async ({ page }, use) => {
    // Set up API mocks before each test
    await setupAPIMocks(page);
    await use(page);
  },

  startGame: async ({ page }, use) => {
    const startGame = async (playerName = 'Test Hero') => {
      // Click new game button
      await page.click('#new-game-btn');

      // Fill in player name in modal
      const nameInput = page.locator('input[placeholder*="name" i]');
      if (await nameInput.isVisible()) {
        await nameInput.fill(playerName);
      }

      // Click begin/start button
      const beginBtn = page.locator('button:has-text("Begin"), button:has-text("Start")');
      if (await beginBtn.isVisible()) {
        await beginBtn.click();
      }

      // Wait for game UI to appear
      await page.waitForSelector('#game-ui.active', { timeout: 10000 });
    };
    await use(startGame);
  },

  waitForGameUI: async ({ page }, use) => {
    const waitForGameUI = async () => {
      await page.waitForSelector('#game-ui.active', { timeout: 10000 });
      // Wait for components to render
      await page.waitForTimeout(500);
    };
    await use(waitForGameUI);
  },
});

/**
 * Set up API mocks for testing
 */
async function setupAPIMocks(page: Page): Promise<void> {
  // Mock game creation
  await page.route('**/api/game', async (route) => {
    if (route.request().method() === 'POST') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'test-game-id',
          playerId: 'test-player-id',
          currentAreaId: 'area-1',
          turn: 0,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }),
      });
    } else {
      await route.continue();
    }
  });

  // Mock game next (generation)
  await page.route('**/api/game/*/next', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        content: 'You stand at the entrance of a dark cave. A cold wind blows from within.',
        turn: 1,
      }),
    });
  });

  // Mock TTS endpoint
  await page.route('**/api/tts/speak', async (route) => {
    // Return a minimal valid audio response
    await route.fulfill({
      status: 200,
      contentType: 'audio/mpeg',
      body: Buffer.from([]),
    });
  });

  // Mock SSE endpoint
  await page.route('**/api/events', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'text/event-stream',
      body: 'data: {"type":"connected"}\n\n',
    });
  });

  // Mock save/load endpoints
  await page.route('**/api/saves', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ saves: [] }),
    });
  });
}

/**
 * Re-export expect for convenience
 */
export { expect };
