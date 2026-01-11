/**
 * Mock Helpers for E2E Tests
 *
 * Utilities for mocking EXTERNAL services only (AI, TTS).
 * The real backend handles all game logic.
 */

import type { Page, Route } from '@playwright/test';

// =============================================================================
// Types
// =============================================================================

export interface MockGameConfig {
  party?: Array<{
    id: string;
    name: string;
    description?: string;
    class?: string;
    stats?: { health: number; maxHealth: number };
  }>;
  narrativeHistory?: Array<{
    id: string;
    type: string;
    content: string;
  }>;
}

export interface MockSSEEvent {
  type: string;
  data: Record<string, unknown>;
}

/**
 * Mock TTS to return instantly (for faster tests)
 * This mocks the client-side TTS API endpoint
 */
export async function mockTTSInstant(page: Page): Promise<void> {
  await page.route('**/api/tts/**', async (route) => {
    // Return a minimal valid MP3 audio response (silent)
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
}

/**
 * Wait for loading overlay to disappear
 */
export async function waitForLoadingComplete(page: Page): Promise<void> {
  await page.waitForSelector('#loading-overlay:not(.active)', { timeout: 60000 });
}

/**
 * Get text content from narrator output
 */
export async function getNarratorText(page: Page): Promise<string> {
  const narrator = page.locator('.narrator-entries');
  return (await narrator.textContent()) ?? '';
}

/**
 * Wait for generation to complete
 * Watches for the editor status to change from generating to editing
 */
export async function waitForGeneration(page: Page): Promise<void> {
  // Wait for loading overlay to hide
  await waitForLoadingComplete(page);

  // Wait for editor to show content
  await page.waitForSelector('.dm-editor-textarea:not(:empty)', { timeout: 60000 });
}

/**
 * Complete the new game wizard with a character name
 */
export async function completeNewGameWizard(page: Page, playerName = 'Test Hero'): Promise<void> {
  // Click new game button
  await page.click('#new-game-btn');

  // Wait for modal
  await page.waitForSelector('[role="dialog"]', { timeout: 5000 });

  // Fill character name
  const nameInput = page.locator('input[placeholder*="name" i]').first();
  await nameInput.fill(playerName);

  // Navigate through wizard steps
  let hasMoreSteps = true;
  while (hasMoreSteps) {
    const nextBtn = page.locator('button:has-text("Next")');
    if (await nextBtn.isVisible({ timeout: 1000 })) {
      await nextBtn.click();
      await page.waitForTimeout(300);
    } else {
      hasMoreSteps = false;
    }
  }

  // Click final button to start game
  const startButtons = [
    'button:has-text("Begin Adventure")',
    'button:has-text("Begin")',
    'button:has-text("Start Game")',
    'button:has-text("Start")',
    'button:has-text("Create")',
  ];

  for (const selector of startButtons) {
    const btn = page.locator(selector);
    if (await btn.isVisible({ timeout: 500 })) {
      await btn.click();
      break;
    }
  }

  // Wait for game UI
  await page.waitForSelector('#game-ui.active', { timeout: 60000 });
}

// =============================================================================
// Game API Mocks
// =============================================================================

/**
 * Mock game API endpoints with custom configuration
 * This sets up route interception for game state endpoints
 */
export async function mockGameAPI(page: Page, config: MockGameConfig = {}): Promise<void> {
  const gameId = 'test-game-' + Date.now();

  // Mock POST /api/game/new - create new game
  await page.route('**/api/game/new', async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        gameId,
        session: {
          id: gameId,
          playerName: 'Test Hero',
          party: config.party ?? [],
          narrativeHistory: config.narrativeHistory ?? [],
          currentArea: { name: 'Starting Area', npcs: [] },
        },
      }),
    });
  });

  // Mock GET /api/game/:id - get game state
  await page.route('**/api/game/*', async (route: Route, request) => {
    const url = request.url();

    // Skip if it's a nested route like /api/game/:id/events
    if (url.includes('/events') || url.includes('/next') || url.includes('/submit')) {
      await route.continue();
      return;
    }

    // Handle GET /api/game/:id
    if (request.method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          session: {
            id: gameId,
            playerName: 'Test Hero',
            party: config.party ?? [],
            narrativeHistory: config.narrativeHistory ?? [],
            currentArea: { name: 'Starting Area', npcs: [] },
          },
          editorState: {
            pending: null,
            editedContent: '',
            status: 'idle',
          },
        }),
      });
    } else {
      await route.continue();
    }
  });
}

/**
 * Mock SSE events endpoint to emit predefined events
 * Events are sent after a short delay to simulate real behavior
 */
export async function mockSSEEvents(page: Page, events: MockSSEEvent[]): Promise<void> {
  await page.route('**/api/game/*/events', async (route: Route) => {
    // Build SSE response body
    const sseBody = events
      .map((event) => `event: ${event.type}\ndata: ${JSON.stringify(event.data)}\n\n`)
      .join('');

    await route.fulfill({
      status: 200,
      contentType: 'text/event-stream',
      headers: {
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
      body: sseBody,
    });
  });
}
