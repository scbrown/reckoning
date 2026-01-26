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
 * Tone options for world seeds
 */
export type WorldSeedTone =
  | 'dark'
  | 'light'
  | 'comedic'
  | 'dramatic'
  | 'horror'
  | 'adventure';

/**
 * Character role options
 */
export type CharacterRole = 'player' | 'ally' | 'villain' | 'neutral';

/**
 * WorldSeed data structure for testing
 */
export interface WorldSeed {
  $schema: 'worldseed-v1';
  sourceInspiration: string;
  setting: string;
  tone: {
    overall: WorldSeedTone;
    description: string;
  };
  characters: Array<{
    name: string;
    role: CharacterRole;
    description: string;
    suggestedTraits: string[];
    visualDescription: string;
  }>;
  locations: Array<{
    name: string;
    description: string;
    mood: string;
    connectedTo: string[];
    visualDescription: string;
  }>;
  themes: string[];
  visualStyle: {
    era: string;
    aesthetic: string;
    colorPalette: string[];
    lightingMood: string;
  };
  contextSummary: string;
}

/**
 * Evolution types that can be suggested
 */
export type EvolutionType = 'trait_add' | 'trait_remove' | 'relationship_change';

/**
 * Resolution status for pending evolutions
 */
export type EvolutionStatus = 'pending' | 'approved' | 'edited' | 'refused';

/**
 * Entity types that can evolve
 */
export type EntityType = 'player' | 'npc' | 'location' | 'item';

/**
 * Relationship dimensions that can change
 */
export type RelationshipDimension = 'trust' | 'respect' | 'affection' | 'fear' | 'resentment' | 'debt';

/**
 * Pending evolution data structure for testing
 */
export interface PendingEvolution {
  id: string;
  gameId: string;
  turn: number;
  evolutionType: EvolutionType;
  entityType: EntityType;
  entityId: string;
  trait?: string;
  targetType?: EntityType;
  targetId?: string;
  dimension?: RelationshipDimension;
  oldValue?: number;
  newValue?: number;
  reason: string;
  sourceEventId?: string;
  status: EvolutionStatus;
  dmNotes?: string;
  createdAt: string;
  resolvedAt?: string;
}

/**
 * Join code structure for testing
 */
export interface JoinCode {
  id: string;
  code: string;
  gameId: string;
  viewType: 'party' | 'player';
  characterId: string | null;
  expiresAt: string;
  maxUses: number;
  currentUses: number;
  createdAt: string;
}

/**
 * Research console event types
 */
export type ResearchConsoleEventType = 'console' | 'worldseed' | 'error' | 'complete';

/**
 * Research console event for testing
 */
export interface ResearchConsoleEvent {
  type: ResearchConsoleEventType;
  data?: string;
  seed?: WorldSeed;
  message?: string;
}

// =============================================================================
// Test Data
// =============================================================================

/**
 * Sample party with varied character stats for testing
 */
export const TEST_PARTY = [
  {
    id: 'char-warrior-1',
    name: 'Theron the Bold',
    description: 'A battle-scarred veteran with a heart of gold',
    class: 'Warrior',
    stats: { health: 120, maxHealth: 120 },
    traits: ['Brave', 'Loyal', 'Battle-Hardened'],
  },
  {
    id: 'char-mage-1',
    name: 'Lyra Starweaver',
    description: 'A mysterious mage with knowledge of ancient arts',
    class: 'Mage',
    stats: { health: 60, maxHealth: 60 },
    traits: ['Intelligent', 'Curious', 'Secretive'],
  },
  {
    id: 'char-rogue-1',
    name: 'Shadow Whisper',
    description: 'A nimble rogue with questionable morals',
    class: 'Rogue',
    stats: { health: 80, maxHealth: 80 },
    traits: ['Cunning', 'Quick', 'Greedy'],
  },
  {
    id: 'char-healer-1',
    name: 'Father Marcus',
    description: 'A devoted healer seeking redemption',
    class: 'Cleric',
    stats: { health: 70, maxHealth: 70 },
    traits: ['Compassionate', 'Pious', 'Haunted'],
  },
];

/**
 * Sample WorldSeed for testing world seeding functionality
 */
export const TEST_WORLD_SEED: WorldSeed = {
  $schema: 'worldseed-v1',
  sourceInspiration: 'A tale of redemption in a world torn by magical conflict',
  setting: 'The Shattered Kingdoms - a realm where ancient magic has fractured reality itself',
  tone: {
    overall: 'dramatic',
    description: 'Epic fantasy with moments of dark humor and genuine emotional depth',
  },
  characters: [
    {
      name: 'Theron the Bold',
      role: 'player',
      description: 'A battle-scarred veteran seeking to atone for past failures',
      suggestedTraits: ['Brave', 'Loyal', 'Battle-Hardened', 'Guilt-Ridden'],
      visualDescription: 'Tall, broad-shouldered warrior with silver-streaked hair and a prominent scar across his left cheek',
    },
    {
      name: 'The Veiled Queen',
      role: 'villain',
      description: 'A sorceress who believes destruction is the only path to renewal',
      suggestedTraits: ['Intelligent', 'Ruthless', 'Tragic', 'Visionary'],
      visualDescription: 'Ethereal figure draped in shadow, with glowing violet eyes visible beneath a dark veil',
    },
    {
      name: 'Old Mira',
      role: 'ally',
      description: 'A wise herbalist who knows more than she lets on',
      suggestedTraits: ['Mysterious', 'Helpful', 'Ancient', 'Mischievous'],
      visualDescription: 'Hunched elderly woman with knowing eyes and hands stained green from years of herb work',
    },
    {
      name: 'Captain Reeves',
      role: 'neutral',
      description: 'A mercenary captain who follows the highest bidder',
      suggestedTraits: ['Pragmatic', 'Professional', 'Amoral', 'Reliable'],
      visualDescription: 'Weathered soldier with military bearing and a collection of mismatched armor',
    },
  ],
  locations: [
    {
      name: 'The Fractured Citadel',
      description: 'The ruined capital where reality bends and shifts unpredictably',
      mood: 'Eerie and unstable, with moments of haunting beauty',
      connectedTo: ['The Whispering Woods', 'The Sunken Road'],
      visualDescription: 'Massive stone towers suspended at impossible angles, with shimmering portals flickering between them',
    },
    {
      name: 'The Whispering Woods',
      description: 'An ancient forest where the trees remember everything',
      mood: 'Mysterious and watchful, with an undercurrent of ancient power',
      connectedTo: ['The Fractured Citadel', 'Haven Village'],
      visualDescription: 'Towering silver-barked trees with luminescent leaves that whisper secrets to those who listen',
    },
    {
      name: 'Haven Village',
      description: 'A refugee settlement built from the ruins of the old world',
      mood: 'Hopeful but fragile, a candle against the darkness',
      connectedTo: ['The Whispering Woods'],
      visualDescription: 'Ramshackle buildings of salvaged stone and wood, protected by makeshift walls and desperate prayers',
    },
    {
      name: 'The Sunken Road',
      description: 'An underground highway built by a forgotten civilization',
      mood: 'Oppressive and claustrophobic, with hints of lost grandeur',
      connectedTo: ['The Fractured Citadel'],
      visualDescription: 'Vast tunnels of carved obsidian, lit by dying magical crystals and echoing with distant sounds',
    },
  ],
  themes: [
    'Redemption and the cost of past mistakes',
    'The tension between preservation and necessary change',
    'Finding hope in broken places',
    'The weight of leadership and responsibility',
  ],
  visualStyle: {
    era: 'Post-apocalyptic fantasy',
    aesthetic: 'Ruined grandeur meets desperate survival',
    colorPalette: ['Deep violet', 'Silver', 'Charred orange', 'Moss green', 'Storm gray'],
    lightingMood: 'Twilight ambiance with dramatic magical illumination',
  },
  contextSummary: 'In the aftermath of the Shattering, a band of unlikely heroes must navigate a fractured world where reality itself is unstable. They seek to stop the Veiled Queen from completing a ritual that would destroy what remains of civilization, while grappling with their own past failures and the question of whether some things are worth saving.',
};

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
  // Wait for loading overlay to either be hidden or not have the active class
  await page.waitForFunction(
    () => {
      const overlay = document.getElementById('loading-overlay');
      if (!overlay) return true;
      // Check if it's hidden or doesn't have the active class
      const isHidden = getComputedStyle(overlay).display === 'none' ||
                       getComputedStyle(overlay).visibility === 'hidden' ||
                       getComputedStyle(overlay).opacity === '0';
      const isNotActive = !overlay.classList.contains('active');
      return isHidden || isNotActive;
    },
    { timeout: 60000 }
  );
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
 * Wizard steps: Character -> Party -> World -> Review
 */
export async function completeNewGameWizard(page: Page, playerName = 'Test Hero'): Promise<void> {
  // Click new game button
  await page.click('#new-game-btn');

  // Wait for modal
  await page.waitForSelector('[role="dialog"]', { timeout: 5000 });

  // Step 1: Character - Fill in name and click Next
  const nameInput = page.locator('input[placeholder*="name" i]').first();
  if (await nameInput.isVisible({ timeout: 2000 })) {
    await nameInput.fill(playerName);
  }

  // Click Next to go to Step 2 (Party)
  const nextBtn1 = page.locator('button:has-text("Next")');
  if (await nextBtn1.isVisible({ timeout: 2000 })) {
    await nextBtn1.click();
    await page.waitForTimeout(300);
  }

  // Step 2: Party - Click Next to go to Step 3 (World)
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

  // Step 4: Review - Click "Begin Adventure" to start the game
  const startButtons = [
    'button:has-text("Begin Adventure")',
    'button:has-text("Begin")',
    'button:has-text("Start Game")',
    'button:has-text("Start")',
    'button:has-text("Create")',
  ];

  for (const selector of startButtons) {
    const btn = page.locator(selector);
    if (await btn.isVisible({ timeout: 2000 })) {
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

// =============================================================================
// World Seeding Mocks
// =============================================================================

/**
 * Mock research session events for world seeding
 * Simulates the SSE stream from Claude Code research process
 */
export async function mockResearchSession(
  page: Page,
  options: {
    sessionId?: string;
    consoleOutput?: string[];
    worldSeed?: WorldSeed;
    error?: string;
    delayMs?: number;
  } = {}
): Promise<void> {
  const {
    sessionId = 'test-session-' + Date.now(),
    consoleOutput = [
      'Starting research session...\n',
      'Analyzing source material...\n',
      'Generating world seed...\n',
      'Research complete.\n',
    ],
    worldSeed = TEST_WORLD_SEED,
    error,
    delayMs = 100,
  } = options;

  await page.route('**/api/game/*/seed/events*', async (route: Route) => {
    const events: ResearchConsoleEvent[] = [];

    // Add console output events
    for (const output of consoleOutput) {
      events.push({ type: 'console', data: output });
    }

    // Add worldseed or error event
    if (error) {
      events.push({ type: 'error', message: error });
    } else {
      events.push({ type: 'worldseed', seed: worldSeed });
    }

    // Add completion event
    events.push({ type: 'complete' });

    // Build SSE response
    const sseBody = events
      .map((event) => `data: ${JSON.stringify(event)}\n\n`)
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

  // Mock the input endpoint
  await page.route('**/api/game/*/seed/input', async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, sessionId }),
    });
  });
}

// =============================================================================
// Evolution Approval Mocks
// =============================================================================

/**
 * Create a sample pending evolution for testing
 */
export function createTestEvolution(
  overrides: Partial<PendingEvolution> = {}
): PendingEvolution {
  const now = new Date().toISOString();
  return {
    id: 'evo-' + Date.now(),
    gameId: 'test-game',
    turn: 1,
    evolutionType: 'trait_add',
    entityType: 'player',
    entityId: 'char-warrior-1',
    trait: 'Determined',
    reason: 'After facing impossible odds, the character has developed an unshakeable resolve.',
    status: 'pending',
    createdAt: now,
    ...overrides,
  };
}

/**
 * Mock pending evolution API and events
 * Simulates the evolution approval flow
 */
export async function mockPendingEvolution(
  page: Page,
  evolutions: PendingEvolution[] = [createTestEvolution()]
): Promise<void> {
  // Mock the evolutions endpoint
  await page.route('**/api/game/*/evolutions', async (route: Route, request) => {
    if (request.method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ evolutions }),
      });
    } else {
      await route.continue();
    }
  });

  // Mock individual evolution actions
  await page.route('**/api/game/*/evolutions/*', async (route: Route, request) => {
    const url = request.url();
    const evolutionId = url.match(/evolutions\/([^/?]+)/)?.[1];
    const method = request.method();

    if (method === 'POST' || method === 'PATCH') {
      // Handle approve/edit/refuse actions
      const body = request.postDataJSON();
      const action = body?.action || 'approve';

      const evolution = evolutions.find((e) => e.id === evolutionId);
      if (evolution) {
        evolution.status = action === 'refuse' ? 'refused' : action === 'edit' ? 'edited' : 'approved';
        evolution.resolvedAt = new Date().toISOString();
        if (body?.dmNotes) {
          evolution.dmNotes = body.dmNotes;
        }
      }

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, evolution }),
      });
    } else {
      await route.continue();
    }
  });

  // Inject SSE event for new evolutions
  await mockSSEEvents(page, [
    {
      type: 'evolution_pending',
      data: { evolutions },
    },
  ]);
}

// =============================================================================
// Join Code Mocks
// =============================================================================

/**
 * Create a sample join code for testing
 */
export function createTestJoinCode(
  overrides: Partial<JoinCode> = {}
): JoinCode {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000); // 24 hours from now

  return {
    id: 'jc-' + Date.now(),
    code: 'ABC123',
    gameId: 'test-game',
    viewType: 'party',
    characterId: null,
    expiresAt: expiresAt.toISOString(),
    maxUses: 5,
    currentUses: 0,
    createdAt: now.toISOString(),
    ...overrides,
  };
}

/**
 * Mock join code generation and validation
 */
export async function mockJoinCode(
  page: Page,
  options: {
    code?: JoinCode;
    validCodes?: JoinCode[];
  } = {}
): Promise<void> {
  const {
    code = createTestJoinCode(),
    validCodes = [code],
  } = options;

  // Mock join code generation
  await page.route('**/api/game/*/join-codes', async (route: Route, request) => {
    if (request.method() === 'POST') {
      const body = request.postDataJSON();
      const newCode = createTestJoinCode({
        gameId: body?.gameId || 'test-game',
        viewType: body?.viewType || 'party',
        characterId: body?.characterId || null,
      });

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ joinCode: newCode }),
      });
    } else if (request.method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ joinCodes: validCodes }),
      });
    } else {
      await route.continue();
    }
  });

  // Mock join code validation/consumption
  await page.route('**/api/join/*', async (route: Route, request) => {
    const url = request.url();
    const codeValue = url.match(/join\/([^/?]+)/)?.[1]?.toUpperCase();

    const matchedCode = validCodes.find((c) => c.code === codeValue);

    if (!matchedCode) {
      await route.fulfill({
        status: 404,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Invalid join code' }),
      });
      return;
    }

    const now = new Date().toISOString();
    if (matchedCode.expiresAt < now) {
      await route.fulfill({
        status: 410,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Join code expired' }),
      });
      return;
    }

    if (matchedCode.currentUses >= matchedCode.maxUses) {
      await route.fulfill({
        status: 410,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Join code exhausted' }),
      });
      return;
    }

    // Consume the code
    matchedCode.currentUses++;

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        gameId: matchedCode.gameId,
        viewType: matchedCode.viewType,
        characterId: matchedCode.characterId,
      }),
    });
  });
}

// =============================================================================
// Multi-View State Sync
// =============================================================================

/**
 * Simulate SSE state sync across multiple views
 * Broadcasts state changes to all provided pages
 */
export async function syncViewState(
  pages: Page[],
  stateUpdate: Record<string, unknown>
): Promise<void> {
  const sseEvent: MockSSEEvent = {
    type: 'state_changed',
    data: { state: stateUpdate },
  };

  // Send state update to all pages via SSE mock
  for (const page of pages) {
    await page.evaluate(
      ({ eventType, eventData }) => {
        // Dispatch a custom event that the SSE service would handle
        const event = new CustomEvent('sse-message', {
          detail: { type: eventType, data: eventData },
        });
        window.dispatchEvent(event);
      },
      { eventType: sseEvent.type, eventData: sseEvent.data }
    );
  }
}

/**
 * Create a state sync helper that tracks state across views
 */
export function createStateSyncHelper(pages: Page[]): {
  broadcast: (update: Record<string, unknown>) => Promise<void>;
  updateParty: (party: typeof TEST_PARTY) => Promise<void>;
  updateNarrative: (entries: Array<{ id: string; type: string; content: string }>) => Promise<void>;
  updateArea: (area: { name: string; description: string }) => Promise<void>;
} {
  return {
    broadcast: async (update) => {
      await syncViewState(pages, update);
    },
    updateParty: async (party) => {
      await syncViewState(pages, { party });
    },
    updateNarrative: async (entries) => {
      await syncViewState(pages, { narrativeHistory: entries });
    },
    updateArea: async (area) => {
      await syncViewState(pages, { currentArea: area });
    },
  };
}
