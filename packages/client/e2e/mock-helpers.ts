/**
 * Mock Helpers for E2E Tests
 *
 * Utilities for mocking API responses and game state in tests.
 */

import type { Page } from '@playwright/test';

/**
 * Mock game state data
 */
export interface MockGameState {
  gameId: string;
  playerId: string;
  currentAreaId: string;
  turn: number;
}

/**
 * Mock area data
 */
export interface MockArea {
  id: string;
  name: string;
  description: string;
  exits: Array<{
    direction: string;
    targetAreaId: string;
    description: string;
    locked?: boolean;
  }>;
  npcs: Array<{
    id: string;
    name: string;
    description: string;
    disposition: 'hostile' | 'unfriendly' | 'neutral' | 'friendly' | 'allied';
  }>;
}

/**
 * Mock character data
 */
export interface MockCharacter {
  id: string;
  name: string;
  description: string;
  class: string;
  stats: {
    health: number;
    maxHealth: number;
  };
}

/**
 * Default mock data
 */
export const DEFAULT_MOCK_GAME: MockGameState = {
  gameId: 'test-game-123',
  playerId: 'test-player-456',
  currentAreaId: 'area-tavern',
  turn: 1,
};

export const DEFAULT_MOCK_AREA: MockArea = {
  id: 'area-tavern',
  name: 'The Crossroads Tavern',
  description: 'A weathered stone building with a crooked chimney.',
  exits: [
    { direction: 'North', targetAreaId: 'area-road', description: 'A cobblestone road.' },
    { direction: 'East', targetAreaId: 'area-forest', description: 'A dark forest path.' },
  ],
  npcs: [
    {
      id: 'npc-innkeeper',
      name: 'Marta the Innkeeper',
      description: 'A stout woman with kind eyes.',
      disposition: 'friendly',
    },
  ],
};

export const DEFAULT_MOCK_PARTY: MockCharacter[] = [
  {
    id: 'char-player',
    name: 'Test Hero',
    description: 'A brave adventurer.',
    class: 'Warrior',
    stats: { health: 100, maxHealth: 100 },
  },
  {
    id: 'char-companion',
    name: 'Luna',
    description: 'A mysterious mage.',
    class: 'Mage',
    stats: { health: 60, maxHealth: 60 },
  },
];

/**
 * Mock API responses for a specific game state
 */
export async function mockGameAPI(
  page: Page,
  options: {
    game?: Partial<MockGameState>;
    area?: Partial<MockArea>;
    party?: MockCharacter[];
    generatedContent?: string;
  } = {}
): Promise<void> {
  const game = { ...DEFAULT_MOCK_GAME, ...options.game };
  const area = { ...DEFAULT_MOCK_AREA, ...options.area };
  const party = options.party ?? DEFAULT_MOCK_PARTY;
  const content = options.generatedContent ?? 'The scene unfolds before you...';

  // Mock game state endpoint
  await page.route(`**/api/game/${game.gameId}`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        ...game,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }),
    });
  });

  // Mock area endpoint
  await page.route(`**/api/area/${area.id}`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(area),
    });
  });

  // Mock party endpoint
  await page.route('**/api/party', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ members: party }),
    });
  });

  // Mock generation endpoint
  await page.route(`**/api/game/${game.gameId}/next`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        content,
        turn: game.turn + 1,
      }),
    });
  });
}

/**
 * Mock SSE events
 */
export async function mockSSEEvents(
  page: Page,
  events: Array<{ type: string; data: Record<string, unknown> }>
): Promise<void> {
  const eventStream = events
    .map((e) => `event: ${e.type}\ndata: ${JSON.stringify(e.data)}\n\n`)
    .join('');

  await page.route('**/api/events', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'text/event-stream',
      body: `data: {"type":"connected"}\n\n${eventStream}`,
    });
  });
}

/**
 * Mock TTS to return instantly (for faster tests)
 */
export async function mockTTSInstant(page: Page): Promise<void> {
  await page.route('**/api/tts/**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'audio/mpeg',
      body: Buffer.from([]),
    });
  });
}

/**
 * Wait for loading overlay to disappear
 */
export async function waitForLoadingComplete(page: Page): Promise<void> {
  await page.waitForSelector('#loading-overlay:not(.active)', { timeout: 30000 });
}

/**
 * Get text content from narrator output
 */
export async function getNarratorText(page: Page): Promise<string> {
  const narrator = page.locator('#narrator-output');
  return await narrator.textContent() ?? '';
}
