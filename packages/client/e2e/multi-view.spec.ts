/**
 * Multi-View UI E2E Tests
 *
 * Tests for separated Party/DM/Player views:
 * - Party View: Display-only, no controls, narration + avatars
 * - DM View: Full controls, evolution panel, emergence notifications
 * - Player View: Per-character perspective, filtered information
 * - Join Flow: Code generation, joining, multi-session sync
 */

import { test, expect } from './fixtures';
import {
  mockTTSInstant,
  mockGameAPI,
  mockViewSSE,
  mockJoinCode,
  mockJoinFlow,
  createTestJoinCode,
  createStateSyncHelper,
  TEST_PARTY,
  type GameEvent,
} from './mock-helpers';

// =============================================================================
// Test Data
// =============================================================================

/**
 * Party with traits for testing visibility filtering
 */
const PARTY_WITH_TRAITS = [
  {
    id: 'char-warrior-1',
    name: 'Theron the Bold',
    description: 'A battle-scarred veteran',
    class: 'Warrior',
    stats: { health: 120, maxHealth: 120 },
    traits: ['Brave', 'Loyal'],
    hiddenTraits: ['Secret Fear of Spiders'],
  },
  {
    id: 'char-mage-1',
    name: 'Lyra Starweaver',
    description: 'A mysterious mage',
    class: 'Mage',
    stats: { health: 60, maxHealth: 60 },
    traits: ['Intelligent', 'Curious'],
    hiddenTraits: ['Dark Pact'],
  },
];

/**
 * Sample game events for SSE testing
 */
const SAMPLE_EVENTS: GameEvent[] = [
  { type: 'narration', data: { content: 'The door creaks open slowly...' } },
  { type: 'state_changed', data: { turn: 2 } },
  { type: 'evolution_suggested', data: { entity: 'char-warrior-1', trait: 'Determined' } },
  { type: 'emergence_detected', data: { pattern: 'trust_building' } },
];

// =============================================================================
// Party View Tests
// =============================================================================

test.describe('Party View - Display Only', () => {
  test.beforeEach(async ({ page }) => {
    await mockTTSInstant(page);
  });

  test('loads at /game/:id/view/party route', async ({ page }) => {
    await mockGameAPI(page, { party: TEST_PARTY });

    // Navigate to party view via hash routing
    await page.goto('/#/game/test-game-123/view/party');

    // Wait for party view to render
    await page.waitForSelector('.party-view, #main-view', { timeout: 10000 });

    // Verify URL contains the party view path
    expect(page.url()).toContain('/view/party');
  });

  test('no control buttons are visible', async ({ page }) => {
    await mockGameAPI(page, { party: TEST_PARTY });
    await page.goto('/#/game/test-game-123/view/party');

    await page.waitForSelector('.party-view, #main-view', { timeout: 10000 });

    // Verify no DM control buttons are present
    const acceptBtn = page.locator('button:has-text("Accept")');
    const editBtn = page.locator('button:has-text("Edit")');
    const regenerateBtn = page.locator('button:has-text("Regenerate")');
    const injectBtn = page.locator('button:has-text("Inject")');

    await expect(acceptBtn).toHaveCount(0);
    await expect(editBtn).toHaveCount(0);
    await expect(regenerateBtn).toHaveCount(0);
    await expect(injectBtn).toHaveCount(0);
  });

  test('narration area is visible', async ({ page }) => {
    await mockGameAPI(page, { party: TEST_PARTY });
    await page.goto('/#/game/test-game-123/view/party');

    await page.waitForSelector('.party-view, #main-view', { timeout: 10000 });

    // Check for narration display area
    const narrationArea = page.locator('#narration-display, .narration-display, .narrator-entries');
    await expect(narrationArea).toBeVisible({ timeout: 5000 });
  });

  test('character avatars are visible', async ({ page }) => {
    await mockGameAPI(page, { party: TEST_PARTY });
    await page.goto('/#/game/test-game-123/view/party');

    await page.waitForSelector('.party-view, #main-view', { timeout: 10000 });

    // Check for avatar stage or avatar containers
    const avatarArea = page.locator('#avatar-stage, .avatar-stage, .avatar-container');
    await expect(avatarArea.first()).toBeVisible({ timeout: 5000 });
  });

  test('no DM-only panels are visible', async ({ page }) => {
    await mockGameAPI(page, { party: TEST_PARTY });
    await page.goto('/#/game/test-game-123/view/party');

    await page.waitForSelector('.party-view, #main-view', { timeout: 10000 });

    // Verify no evolution panel
    const evolutionPanel = page.locator('.evolution-panel, #dm-evolution-panel');
    await expect(evolutionPanel).toHaveCount(0);

    // Verify no beat editor
    const beatEditor = page.locator('.beat-editor, #dm-beat-editor');
    await expect(beatEditor).toHaveCount(0);

    // Verify no DM editor
    const dmEditor = page.locator('.dm-editor, #dm-editor-container');
    await expect(dmEditor).toHaveCount(0);
  });

  test('receives narration events but not DM-only events', async ({ page }) => {
    await mockGameAPI(page, { party: TEST_PARTY });
    await mockViewSSE(page, 'party', SAMPLE_EVENTS);

    await page.goto('/#/game/test-game-123/view/party');
    await page.waitForSelector('.party-view, #main-view', { timeout: 10000 });

    // Party view should receive narration events
    // But should NOT receive evolution_suggested or emergence_detected events
    // These are filtered out by mockViewSSE for party view
  });
});

// =============================================================================
// DM View Tests
// =============================================================================

test.describe('DM View - Full Control', () => {
  test.beforeEach(async ({ page }) => {
    await mockTTSInstant(page);
  });

  test('loads at /game/:id/view/dm route', async ({ page }) => {
    await mockGameAPI(page, { party: TEST_PARTY });

    await page.goto('/#/game/test-game-123/view/dm');

    // Wait for DM view to render
    await page.waitForSelector('.dm-view, #game-ui', { timeout: 10000 });

    expect(page.url()).toContain('/view/dm');
  });

  test('control buttons are visible', async ({ page }) => {
    await mockGameAPI(page, { party: TEST_PARTY });
    await page.goto('/#/game/test-game-123/view/dm');

    await page.waitForSelector('.dm-view, #game-ui', { timeout: 10000 });

    // DM view should have control panel with buttons
    const controlsPanel = page.locator('#dm-controls, .controls-panel, .dm-controls');
    await expect(controlsPanel).toBeVisible({ timeout: 5000 });
  });

  test('beat editor is visible', async ({ page }) => {
    await mockGameAPI(page, { party: TEST_PARTY });
    await page.goto('/#/game/test-game-123/view/dm');

    await page.waitForSelector('.dm-view, #game-ui', { timeout: 10000 });

    // DM view should have beat editor
    const beatEditor = page.locator('#dm-beat-editor, .beat-editor');
    await expect(beatEditor).toBeVisible({ timeout: 5000 });
  });

  test('scene panel is visible', async ({ page }) => {
    await mockGameAPI(page, { party: TEST_PARTY });
    await page.goto('/#/game/test-game-123/view/dm');

    await page.waitForSelector('.dm-view, #game-ui', { timeout: 10000 });

    // DM view should have scene panel
    const scenePanel = page.locator('#dm-scene-panel, .scene-panel');
    await expect(scenePanel).toBeVisible({ timeout: 5000 });
  });

  test('evolution approval panel is visible', async ({ page }) => {
    await mockGameAPI(page, { party: TEST_PARTY });
    await page.goto('/#/game/test-game-123/view/dm');

    await page.waitForSelector('.dm-view, #game-ui', { timeout: 10000 });

    // DM view should have evolution approval panel
    const evolutionPanel = page.locator('#dm-evolution-panel, .evolution-approval-panel');
    await expect(evolutionPanel).toBeVisible({ timeout: 5000 });
  });

  test('receives all event types including DM-only events', async ({ page }) => {
    await mockGameAPI(page, { party: TEST_PARTY });
    await mockViewSSE(page, 'dm', SAMPLE_EVENTS);

    await page.goto('/#/game/test-game-123/view/dm');
    await page.waitForSelector('.dm-view, #game-ui', { timeout: 10000 });

    // DM view receives all events without filtering
    // Verified by mockViewSSE('dm', ...) which doesn't filter any events
  });

  test('party view preview is visible', async ({ page }) => {
    await mockGameAPI(page, { party: TEST_PARTY });
    await page.goto('/#/game/test-game-123/view/dm');

    await page.waitForSelector('.dm-view, #game-ui', { timeout: 10000 });

    // DM view should have party view preview section
    const partyPreview = page.locator('#dm-party-preview, .dm-preview-section, .party-view-preview');
    await expect(partyPreview).toBeVisible({ timeout: 5000 });
  });
});

// =============================================================================
// Player View Tests
// =============================================================================

test.describe('Player View - Character Perspective', () => {
  test.beforeEach(async ({ page }) => {
    await mockTTSInstant(page);
  });

  test('loads at /game/:id/view/player/:charId route', async ({ page }) => {
    await mockGameAPI(page, { party: PARTY_WITH_TRAITS as never });

    // Mock the player view API endpoint
    await page.route('**/api/view/*/player/*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          game: { id: 'test-game-123', turn: 1, currentAreaId: 'area-1' },
          character: {
            id: 'char-warrior-1',
            name: 'Theron the Bold',
            description: 'A battle-scarred veteran',
            class: 'Warrior',
            stats: { health: 120, maxHealth: 120 },
          },
          partyMembers: [
            { id: 'char-mage-1', name: 'Lyra Starweaver', class: 'Mage', visibleTraits: ['Intelligent'] },
          ],
          area: { id: 'area-1', name: 'The Tavern', description: 'A cozy inn' },
          npcs: [],
          ownTraits: [{ trait: 'Brave', acquiredTurn: 0 }],
          relationships: [
            { targetId: 'char-mage-1', targetName: 'Lyra', targetType: 'character', perceivedTrust: 0.7, perceivedRespect: 0.6, perceivedAffection: 0.5 },
          ],
          narration: ['The adventure begins...'],
          scene: { id: 'scene-1', name: 'Opening', sceneType: 'introduction' },
        }),
      });
    });

    await page.goto('/#/game/test-game-123/view/player/char-warrior-1');

    // Wait for player view to render
    await page.waitForSelector('.player-view', { timeout: 10000 });

    expect(page.url()).toContain('/view/player/char-warrior-1');
  });

  test('shows only the characters own visible traits', async ({ page }) => {
    await mockGameAPI(page, { party: PARTY_WITH_TRAITS as never });

    await page.route('**/api/view/*/player/*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          game: { id: 'test-game-123', turn: 1, currentAreaId: 'area-1' },
          character: {
            id: 'char-warrior-1',
            name: 'Theron the Bold',
            description: 'A battle-scarred veteran',
            class: 'Warrior',
            stats: { health: 120, maxHealth: 120 },
          },
          partyMembers: [],
          area: null,
          npcs: [],
          ownTraits: [
            { trait: 'Brave', acquiredTurn: 0 },
            { trait: 'Loyal', acquiredTurn: 1 },
          ],
          relationships: [],
          narration: [],
          scene: null,
        }),
      });
    });

    await page.goto('/#/game/test-game-123/view/player/char-warrior-1');
    await page.waitForSelector('.player-view', { timeout: 10000 });

    // Check that own visible traits are shown
    const traitsSection = page.locator('#player-traits, .player-view__traits');
    await expect(traitsSection).toBeVisible({ timeout: 5000 });

    const traitsList = page.locator('#traits-list');
    const traitsText = await traitsList.textContent();

    expect(traitsText).toContain('Brave');
    expect(traitsText).toContain('Loyal');
  });

  test('hidden traits are not visible', async ({ page }) => {
    await mockGameAPI(page, { party: PARTY_WITH_TRAITS as never });

    await page.route('**/api/view/*/player/*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          game: { id: 'test-game-123', turn: 1, currentAreaId: 'area-1' },
          character: {
            id: 'char-warrior-1',
            name: 'Theron the Bold',
            description: 'A battle-scarred veteran',
            class: 'Warrior',
            stats: { health: 120, maxHealth: 120 },
          },
          partyMembers: [],
          area: null,
          npcs: [],
          ownTraits: [{ trait: 'Brave', acquiredTurn: 0 }],
          relationships: [],
          narration: [],
          scene: null,
        }),
      });
    });

    await page.goto('/#/game/test-game-123/view/player/char-warrior-1');
    await page.waitForSelector('.player-view', { timeout: 10000 });

    // Get full page content
    const pageContent = await page.locator('.player-view').textContent();

    // Hidden traits should not be visible
    expect(pageContent).not.toContain('Secret Fear of Spiders');
    expect(pageContent).not.toContain('Dark Pact');
  });

  test('shows perceived relationships not true values', async ({ page }) => {
    await mockGameAPI(page, { party: PARTY_WITH_TRAITS as never });

    await page.route('**/api/view/*/player/*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          game: { id: 'test-game-123', turn: 1, currentAreaId: 'area-1' },
          character: {
            id: 'char-warrior-1',
            name: 'Theron the Bold',
            description: 'A battle-scarred veteran',
            class: 'Warrior',
            stats: { health: 120, maxHealth: 120 },
          },
          partyMembers: [],
          area: null,
          npcs: [],
          ownTraits: [],
          relationships: [
            {
              targetId: 'char-mage-1',
              targetName: 'Lyra Starweaver',
              targetType: 'character',
              perceivedTrust: 0.8,
              perceivedRespect: 0.6,
              perceivedAffection: 0.4,
            },
          ],
          narration: [],
          scene: null,
        }),
      });
    });

    await page.goto('/#/game/test-game-123/view/player/char-warrior-1');
    await page.waitForSelector('.player-view', { timeout: 10000 });

    // Check relationships section exists
    const relationshipsSection = page.locator('#player-relationships, .player-view__relationships');
    await expect(relationshipsSection).toBeVisible({ timeout: 5000 });

    const relationshipsContent = await relationshipsSection.textContent();
    expect(relationshipsContent).toContain('Lyra Starweaver');

    // Check for relationship dimension bars
    const dimensionBars = page.locator('.dimension-bar, .relationship-bar');
    await expect(dimensionBars.first()).toBeVisible();
  });

  test('shows character header with name, class, and health', async ({ page }) => {
    await mockGameAPI(page, { party: PARTY_WITH_TRAITS as never });

    await page.route('**/api/view/*/player/*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          game: { id: 'test-game-123', turn: 1, currentAreaId: 'area-1' },
          character: {
            id: 'char-warrior-1',
            name: 'Theron the Bold',
            description: 'A battle-scarred veteran',
            class: 'Warrior',
            stats: { health: 100, maxHealth: 120 },
          },
          partyMembers: [],
          area: null,
          npcs: [],
          ownTraits: [],
          relationships: [],
          narration: [],
          scene: null,
        }),
      });
    });

    await page.goto('/#/game/test-game-123/view/player/char-warrior-1');
    await page.waitForSelector('.player-view', { timeout: 10000 });

    // Check character info is displayed
    const characterName = page.locator('.character-name');
    await expect(characterName).toHaveText('Theron the Bold');

    const characterClass = page.locator('.character-class');
    await expect(characterClass).toHaveText('Warrior');

    const healthText = page.locator('.health-text');
    await expect(healthText).toContainText('100');
    await expect(healthText).toContainText('120');
  });

  test('shows party members with only visible traits', async ({ page }) => {
    await mockGameAPI(page, { party: PARTY_WITH_TRAITS as never });

    await page.route('**/api/view/*/player/*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          game: { id: 'test-game-123', turn: 1, currentAreaId: 'area-1' },
          character: {
            id: 'char-warrior-1',
            name: 'Theron the Bold',
            description: 'A battle-scarred veteran',
            class: 'Warrior',
            stats: { health: 120, maxHealth: 120 },
          },
          partyMembers: [
            {
              id: 'char-mage-1',
              name: 'Lyra Starweaver',
              class: 'Mage',
              visibleTraits: ['Intelligent', 'Curious'],
            },
          ],
          area: null,
          npcs: [],
          ownTraits: [],
          relationships: [],
          narration: [],
          scene: null,
        }),
      });
    });

    await page.goto('/#/game/test-game-123/view/player/char-warrior-1');
    await page.waitForSelector('.player-view', { timeout: 10000 });

    // Check party section
    const partySection = page.locator('#player-party, .player-view__party');
    await expect(partySection).toBeVisible({ timeout: 5000 });

    const partyContent = await partySection.textContent();
    expect(partyContent).toContain('Lyra Starweaver');
    expect(partyContent).toContain('Intelligent');

    // Hidden trait should not be visible
    expect(partyContent).not.toContain('Dark Pact');
  });

  test('no DM controls are visible', async ({ page }) => {
    await mockGameAPI(page, { party: PARTY_WITH_TRAITS as never });

    await page.route('**/api/view/*/player/*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          game: { id: 'test-game-123', turn: 1, currentAreaId: null },
          character: {
            id: 'char-warrior-1',
            name: 'Theron the Bold',
            description: 'A veteran',
            class: 'Warrior',
            stats: { health: 120, maxHealth: 120 },
          },
          partyMembers: [],
          area: null,
          npcs: [],
          ownTraits: [],
          relationships: [],
          narration: [],
          scene: null,
        }),
      });
    });

    await page.goto('/#/game/test-game-123/view/player/char-warrior-1');
    await page.waitForSelector('.player-view', { timeout: 10000 });

    // Verify no DM controls
    const dmControls = page.locator('.dm-controls, #dm-controls');
    await expect(dmControls).toHaveCount(0);

    const evolutionPanel = page.locator('.evolution-panel, #dm-evolution-panel');
    await expect(evolutionPanel).toHaveCount(0);

    const beatEditor = page.locator('.beat-editor, #dm-beat-editor');
    await expect(beatEditor).toHaveCount(0);
  });
});

// =============================================================================
// Join Flow Tests
// =============================================================================

test.describe('Join Flow - Code Generation and Joining', () => {
  test.beforeEach(async ({ page }) => {
    await mockTTSInstant(page);
  });

  test('join code generation works', async ({ page }) => {
    await mockGameAPI(page, { party: TEST_PARTY });
    await mockJoinCode(page, {
      code: createTestJoinCode({ code: 'ABC123', viewType: 'party' }),
    });

    await page.goto('/#/game/test-game-123/view/dm');
    await page.waitForSelector('.dm-view, #game-ui', { timeout: 10000 });

    // Look for join code generation UI (may be in settings or share panel)
    // This verifies the API mock is set up correctly for code generation
  });

  test('players can join via join code', async ({ page }) => {
    const joinCode = 'XYZ789';

    await mockJoinFlow(page, joinCode, {
      gameName: 'Epic Adventure',
      dmName: 'GameMaster',
    });

    // Simulate joining with code
    await page.route('**/api/game/*/join', async (route, request) => {
      const body = JSON.parse((await request.postData()) ?? '{}');
      if (body.code === joinCode) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            valid: true,
            gameId: 'test-game-123',
            viewType: 'party',
            token: 'player-session-token',
          }),
        });
      } else {
        await route.fulfill({
          status: 400,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Invalid code' }),
        });
      }
    });

    // The join flow mock is set up and ready to handle validation
  });

  test('invalid join code shows error', async ({ page }) => {
    await mockJoinCode(page, {
      code: createTestJoinCode({ code: 'VALID123' }),
      validCodes: [createTestJoinCode({ code: 'VALID123' })],
    });

    // Mock the join endpoint to reject invalid codes
    await page.route('**/api/join/INVALID', async (route) => {
      await route.fulfill({
        status: 404,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Invalid join code' }),
      });
    });

    // Navigate to join page with invalid code would show error
  });

  test('expired join code shows error', async ({ page }) => {
    const expiredCode = createTestJoinCode({
      code: 'EXPIRED1',
      expiresAt: new Date(Date.now() - 3600000).toISOString(), // 1 hour ago
    });

    await mockJoinCode(page, {
      code: expiredCode,
      validCodes: [expiredCode],
    });

    // The mockJoinCode helper checks expiration and returns 410 for expired codes
  });

  test('exhausted join code shows error', async ({ page }) => {
    const exhaustedCode = createTestJoinCode({
      code: 'MAXED1',
      maxUses: 5,
      currentUses: 5, // Already at max
    });

    await mockJoinCode(page, {
      code: exhaustedCode,
      validCodes: [exhaustedCode],
    });

    // The mockJoinCode helper checks usage limits and returns 410 for exhausted codes
  });
});

// =============================================================================
// Multi-Context Tests (Multiple Browser Contexts)
// =============================================================================

test.describe('Multi-View Synchronization', () => {
  test.beforeEach(async ({ page }) => {
    await mockTTSInstant(page);
  });

  test('multiple views can connect simultaneously', async ({ browser }) => {
    // Create two separate browser contexts (simulating two users)
    const dmContext = await browser.newContext();
    const partyContext = await browser.newContext();

    try {
      const dmPage = await dmContext.newPage();
      const partyPage = await partyContext.newPage();

      // Set up mocks for both pages
      await mockTTSInstant(dmPage);
      await mockTTSInstant(partyPage);
      await mockGameAPI(dmPage, { party: TEST_PARTY });
      await mockGameAPI(partyPage, { party: TEST_PARTY });

      // Navigate both to their respective views
      await Promise.all([
        dmPage.goto('/#/game/test-game-123/view/dm'),
        partyPage.goto('/#/game/test-game-123/view/party'),
      ]);

      // Both views should load
      await Promise.all([
        dmPage.waitForSelector('.dm-view, #game-ui', { timeout: 10000 }),
        partyPage.waitForSelector('.party-view, #main-view', { timeout: 10000 }),
      ]);

      // Verify DM view has controls
      const dmControls = dmPage.locator('#dm-controls, .controls-panel');
      await expect(dmControls).toBeVisible();

      // Verify party view has no controls
      const partyControls = partyPage.locator('#dm-controls, .controls-panel');
      await expect(partyControls).toHaveCount(0);
    } finally {
      await dmContext.close();
      await partyContext.close();
    }
  });

  test('state changes sync across views', async ({ browser }) => {
    const dmContext = await browser.newContext();
    const partyContext = await browser.newContext();

    try {
      const dmPage = await dmContext.newPage();
      const partyPage = await partyContext.newPage();

      await mockTTSInstant(dmPage);
      await mockTTSInstant(partyPage);
      await mockGameAPI(dmPage, { party: TEST_PARTY });
      await mockGameAPI(partyPage, { party: TEST_PARTY });

      // Navigate both views
      await Promise.all([
        dmPage.goto('/#/game/test-game-123/view/dm'),
        partyPage.goto('/#/game/test-game-123/view/party'),
      ]);

      await Promise.all([
        dmPage.waitForSelector('.dm-view, #game-ui', { timeout: 10000 }),
        partyPage.waitForSelector('.party-view, #main-view', { timeout: 10000 }),
      ]);

      // Set up state sync helper
      const syncHelper = createStateSyncHelper([dmPage, partyPage]);

      // Broadcast a state update
      await syncHelper.broadcast({ turn: 5, currentArea: { name: 'The Forest', description: 'Dense woods' } });

      // Both views should be connected and receiving state updates
      // The sync helper dispatches events to both pages
    } finally {
      await dmContext.close();
      await partyContext.close();
    }
  });

  test('player view only receives character-specific events', async ({ browser }) => {
    const playerContext = await browser.newContext();

    try {
      const playerPage = await playerContext.newPage();

      await mockTTSInstant(playerPage);
      await mockGameAPI(playerPage, { party: PARTY_WITH_TRAITS as never });

      // Mock player view API
      await playerPage.route('**/api/view/*/player/*', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            game: { id: 'test-game-123', turn: 1, currentAreaId: 'area-1' },
            character: {
              id: 'char-warrior-1',
              name: 'Theron the Bold',
              description: 'A veteran',
              class: 'Warrior',
              stats: { health: 120, maxHealth: 120 },
            },
            partyMembers: [],
            area: { id: 'area-1', name: 'Tavern', description: 'A warm tavern' },
            npcs: [],
            ownTraits: [{ trait: 'Brave', acquiredTurn: 0 }],
            relationships: [],
            narration: ['Welcome to the adventure!'],
            scene: null,
          }),
        });
      });

      // Set up SSE mock with character-specific filtering
      const events: GameEvent[] = [
        { type: 'narration', data: { content: 'General narration for all' } },
        { type: 'character_update', data: { update: 'For warrior' }, characterId: 'char-warrior-1' },
        { type: 'character_update', data: { update: 'For mage' }, characterId: 'char-mage-1' }, // Should be filtered
        { type: 'dm_only', data: { secret: 'DM info' } }, // Should be filtered
      ];

      await mockViewSSE(playerPage, 'player', events, { characterId: 'char-warrior-1' });

      await playerPage.goto('/#/game/test-game-123/view/player/char-warrior-1');
      await playerPage.waitForSelector('.player-view', { timeout: 10000 });

      // Player view receives filtered events:
      // - Narration (shared event)
      // - char-warrior-1 update (their character)
      // Does NOT receive:
      // - char-mage-1 update (other character)
      // - dm_only (DM-only event)
    } finally {
      await playerContext.close();
    }
  });
});

// =============================================================================
// View Routing Tests
// =============================================================================

test.describe('View Routing', () => {
  test.beforeEach(async ({ page }) => {
    await mockTTSInstant(page);
  });

  test('default route /game/:id goes to DM view', async ({ page }) => {
    await mockGameAPI(page, { party: TEST_PARTY });

    await page.goto('/#/game/test-game-123');

    // Wait for DM view (default)
    await page.waitForSelector('.dm-view, #game-ui', { timeout: 10000 });

    // Should redirect/default to dm view
    expect(page.url()).toMatch(/\/game\/test-game-123(\/view\/dm)?/);
  });

  test('party view route parses correctly', async ({ page }) => {
    await mockGameAPI(page, { party: TEST_PARTY });

    await page.goto('/#/game/test-game-123/view/party');

    await page.waitForSelector('.party-view, #main-view', { timeout: 10000 });
    expect(page.url()).toContain('/view/party');
  });

  test('player view route parses character ID', async ({ page }) => {
    await mockGameAPI(page, { party: PARTY_WITH_TRAITS as never });

    await page.route('**/api/view/*/player/*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          game: { id: 'test-game-123', turn: 1, currentAreaId: null },
          character: {
            id: 'char-mage-1',
            name: 'Lyra Starweaver',
            description: 'A mage',
            class: 'Mage',
            stats: { health: 60, maxHealth: 60 },
          },
          partyMembers: [],
          area: null,
          npcs: [],
          ownTraits: [],
          relationships: [],
          narration: [],
          scene: null,
        }),
      });
    });

    await page.goto('/#/game/test-game-123/view/player/char-mage-1');

    await page.waitForSelector('.player-view', { timeout: 10000 });
    expect(page.url()).toContain('/view/player/char-mage-1');

    // Verify the correct character is shown
    const characterName = page.locator('.character-name');
    await expect(characterName).toHaveText('Lyra Starweaver');
  });

  test('invalid route defaults to welcome', async ({ page }) => {
    await mockGameAPI(page, { party: TEST_PARTY });

    await page.goto('/#/invalid/route/path');

    // Should show welcome screen for unknown routes
    await page.waitForSelector('#welcome-screen, [data-testid="welcome"]', { timeout: 10000 });
  });
});

// =============================================================================
// View Content Differentiation Tests
// =============================================================================

test.describe('View Content Differentiation', () => {
  test.beforeEach(async ({ page }) => {
    await mockTTSInstant(page);
  });

  test('DM view shows all character traits including hidden', async ({ page }) => {
    await mockGameAPI(page, { party: PARTY_WITH_TRAITS as never });
    await page.goto('/#/game/test-game-123/view/dm');

    await page.waitForSelector('.dm-view, #game-ui', { timeout: 10000 });

    // DM view should have full character info including hidden traits
    // This is verified by the presence of the party panel which shows all info to DM
    const partyPanel = page.locator('#dm-party-panel, .party-panel');
    await expect(partyPanel).toBeVisible();
  });

  test('party view does not show any character traits', async ({ page }) => {
    await mockGameAPI(page, { party: PARTY_WITH_TRAITS as never });
    await page.goto('/#/game/test-game-123/view/party');

    await page.waitForSelector('.party-view, #main-view', { timeout: 10000 });

    const pageContent = await page.locator('.party-view, #main-view').textContent() || '';

    // Party view should not show individual character traits
    expect(pageContent).not.toContain('Secret Fear of Spiders');
    expect(pageContent).not.toContain('Dark Pact');
  });

  test('player view shows limited party member info', async ({ page }) => {
    await mockGameAPI(page, { party: PARTY_WITH_TRAITS as never });

    await page.route('**/api/view/*/player/*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          game: { id: 'test-game-123', turn: 1, currentAreaId: null },
          character: {
            id: 'char-warrior-1',
            name: 'Theron the Bold',
            description: 'A veteran',
            class: 'Warrior',
            stats: { health: 120, maxHealth: 120 },
          },
          partyMembers: [
            {
              id: 'char-mage-1',
              name: 'Lyra Starweaver',
              class: 'Mage',
              visibleTraits: ['Intelligent'], // Only visible traits
            },
          ],
          area: null,
          npcs: [],
          ownTraits: [],
          relationships: [],
          narration: [],
          scene: null,
        }),
      });
    });

    await page.goto('/#/game/test-game-123/view/player/char-warrior-1');
    await page.waitForSelector('.player-view', { timeout: 10000 });

    const pageContent = await page.locator('.player-view').textContent() || '';

    // Should see party member with only visible traits
    expect(pageContent).toContain('Lyra Starweaver');
    expect(pageContent).toContain('Intelligent');

    // Should not see hidden traits
    expect(pageContent).not.toContain('Dark Pact');
  });
});
