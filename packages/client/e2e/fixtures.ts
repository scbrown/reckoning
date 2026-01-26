/**
 * Playwright Test Fixtures
 *
 * Custom fixtures for E2E testing the Reckoning client.
 *
 * IMPORTANT: Tests run against the REAL backend server.
 * Only external services (AI generation, ElevenLabs TTS) are mocked.
 */

import { test as base, expect, Page, BrowserContext } from '@playwright/test';

/**
 * View URLs returned from gameWithViews fixture
 */
export interface GameViewURLs {
  gameId: string;
  dmUrl: string;
  partyUrl: string;
  playerUrl: (characterId: string) => string;
}

/**
 * Multi-context fixture for multi-view testing
 */
export interface MultiContext {
  /** DM view browser context */
  dmContext: BrowserContext;
  /** DM view page */
  dmPage: Page;
  /** Party view browser context */
  partyContext: BrowserContext;
  /** Party view page */
  partyPage: Page;
  /** Create a new player context */
  createPlayerContext: (characterId?: string) => Promise<{ context: BrowserContext; page: Page }>;
  /** Cleanup all contexts */
  cleanup: () => Promise<void>;
}

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
  /** Start game and get URLs for all views (DM, party, player) */
  gameWithViews: (playerName?: string) => Promise<GameViewURLs>;
  /** Create multiple browser contexts for multi-view testing */
  multiContext: (gameId: string) => Promise<MultiContext>;
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

  gameWithViews: async ({ page }, use) => {
    const gameWithViews = async (playerName = 'Test Hero'): Promise<GameViewURLs> => {
      // Mock external services
      await mockExternalServices(page);

      // Navigate to app
      await page.goto('/');

      // Start a new game through the wizard
      await page.click('#new-game-btn');
      await page.waitForSelector('[role="dialog"]', { timeout: 5000 });

      // Step 1: Character - Fill in name
      const nameInput = page.locator('input[placeholder*="name" i]').first();
      await nameInput.fill(playerName);

      // Navigate through wizard steps
      await page.click('button:has-text("Next")');
      await page.waitForTimeout(300);

      const nextBtn2 = page.locator('button:has-text("Next")');
      if (await nextBtn2.isVisible({ timeout: 2000 })) {
        await nextBtn2.click();
        await page.waitForTimeout(300);
      }

      const generateWorldBtn = page.locator('button:has-text("Generate World")');
      if (await generateWorldBtn.isVisible({ timeout: 2000 })) {
        await generateWorldBtn.click();
        await page.waitForTimeout(300);
      }

      const beginBtn = page.locator('button:has-text("Begin Adventure"), button:has-text("Begin"), button:has-text("Start"), button:has-text("Create")');
      if (await beginBtn.isVisible({ timeout: 2000 })) {
        await beginBtn.click();
      }

      // Wait for game UI
      await page.waitForSelector('#game-ui.active', { timeout: 30000 });

      // Extract game ID from URL or page state
      const url = page.url();
      const gameIdMatch = url.match(/\/game\/([^/?]+)/);
      const gameId = gameIdMatch ? gameIdMatch[1] : 'test-game-' + Date.now();

      // Return view URLs
      const baseUrl = new URL(page.url()).origin;
      return {
        gameId,
        dmUrl: `${baseUrl}/game/${gameId}?view=dm`,
        partyUrl: `${baseUrl}/game/${gameId}?view=party`,
        playerUrl: (characterId: string) => `${baseUrl}/game/${gameId}?view=player&character=${characterId}`,
      };
    };
    await use(gameWithViews);
  },

  multiContext: async ({ browser }, use) => {
    const contexts: BrowserContext[] = [];

    const multiContext = async (gameId: string): Promise<MultiContext> => {
      // Create DM context
      const dmContext = await browser.newContext();
      contexts.push(dmContext);
      const dmPage = await dmContext.newPage();
      await mockExternalServices(dmPage);

      // Create party context
      const partyContext = await browser.newContext();
      contexts.push(partyContext);
      const partyPage = await partyContext.newPage();
      await mockExternalServices(partyPage);

      // Helper to create player contexts
      const createPlayerContext = async (characterId?: string): Promise<{ context: BrowserContext; page: Page }> => {
        const context = await browser.newContext();
        contexts.push(context);
        const page = await context.newPage();
        await mockExternalServices(page);
        return { context, page };
      };

      // Cleanup helper
      const cleanup = async (): Promise<void> => {
        for (const ctx of contexts) {
          await ctx.close();
        }
        contexts.length = 0;
      };

      return {
        dmContext,
        dmPage,
        partyContext,
        partyPage,
        createPlayerContext,
        cleanup,
      };
    };

    await use(multiContext);

    // Auto-cleanup after test
    for (const ctx of contexts) {
      await ctx.close();
    }
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
