# Playwright Integration Tests Plan

## Goal

Comprehensive e2e test coverage for Reckoning's core user flows, with focus on:
- Multi-View UI (Party View, DM View, Player View)
- World Seeding flow
- Core DM and Party screen functionality

## Key Design Decision: Mock at SSE Layer

**We mock at the HTTP/SSE layer, not at the subprocess level.**

Rationale:
- Tests focus on UI behavior, not subprocess management
- SSE mocking already exists and works well
- Claude Code spawn logic can be unit tested separately on server
- Keeps tests fast and deterministic

For World Seeding, we mock these endpoints:
- `POST /api/game/:id/seed/start` → returns `{ sessionId }`
- `GET /api/game/:id/seed/events` → SSE stream (console, worldseed, complete events)
- `POST /api/game/:id/seed/input` → accepts DM guidance input

For Multi-View UI, we mock:
- `POST /api/game/:id/join/create` → returns `{ code: "ABC123" }`
- `POST /api/game/:id/join` → validates code, returns session token
- `GET /api/game/:id/events?view=party|dm|player` → filtered SSE per view

## Current State

Existing tests in `packages/client/e2e/`:
- `app.spec.ts` - Welcome screen, new game modal
- `game-flow.spec.ts` - Story generation, DM editor, narrative history, accessibility
- `fixtures.ts` - mockedPage, startGame, waitForGameUI helpers
- `mock-helpers.ts` - TTS mocking, SSE mocking, wizard completion

## Test Suites to Add

### 1. DM Screen Core Functionality (`dm-screen.spec.ts`)

Primary control surface for the game master.

**Tests:**
- [ ] DM screen layout renders correctly (all panels visible)
- [ ] Beat editor displays pending generation
- [ ] Accept button commits content to narrative
- [ ] Edit mode allows inline text changes
- [ ] Regenerate triggers new generation with feedback
- [ ] Scene controls panel is accessible
- [ ] Evolution approval panel shows pending evolutions
- [ ] Emergence notifications appear and can be dismissed
- [ ] Keyboard shortcuts work (if implemented)
- [ ] Status bar shows current game state

### 2. Party Screen Functionality (`party-screen.spec.ts`)

Character display and management.

**Tests:**
- [ ] Party panel displays all characters
- [ ] Character cards show name, class, health bar
- [ ] Health bar reflects current/max health ratio
- [ ] Character avatars render (or placeholders)
- [ ] Clicking character card shows details (if implemented)
- [ ] Stats update when SSE events arrive
- [ ] Hidden traits NOT visible on party display
- [ ] Character order is consistent

### 3. World Seeding Flow (`world-seeding.spec.ts`)

Research agent integration for seeded world generation.

**UI Flow Tests:**
- [ ] World seeding option appears in new game wizard (Step 3: World)
- [ ] Seed prompt textarea accepts natural language input
- [ ] "Begin Research" button triggers session start
- [ ] Research console appears with terminal-style output
- [ ] Console auto-scrolls as content streams in
- [ ] DM input field visible at bottom of console
- [ ] Cancel/Stop button visible during research
- [ ] "Use Partial Results" button appears after some output

**Console Streaming Tests:**
- [ ] Console displays streamed text from SSE `console` events
- [ ] Different message types styled appropriately (if applicable)
- [ ] Long outputs handled without breaking layout
- [ ] Console preserves scroll position when DM scrolls up

**DM Interaction Tests:**
- [ ] DM can type guidance in input field
- [ ] Enter key sends input to `/api/game/:id/seed/input`
- [ ] Sent input echoed in console with `> ` prefix
- [ ] Input field clears after sending

**Completion Tests:**
- [ ] WorldSeed summary displays after `worldseed` SSE event
- [ ] Summary shows source, themes, character count, location count
- [ ] "Accept & Generate World" button visible
- [ ] "Regenerate" button visible
- [ ] Accept proceeds to world generation step
- [ ] Generated world uses seed data

**Error Handling Tests:**
- [ ] Research timeout shows appropriate message
- [ ] Invalid JSON from Claude Code handled gracefully
- [ ] Network error during streaming shows retry option
- [ ] Cancel during research cleans up properly

**SSE Events to Mock:**
```typescript
const MOCK_RESEARCH_EVENTS = [
  { type: 'console', data: 'Researching Die Hard (1988)...\n' },
  { type: 'console', data: 'Found key elements: John McClane, Hans Gruber...\n' },
  { type: 'worldseed', seed: { sourceInspiration: 'Die Hard', ... } },
  { type: 'complete' }
];
```

### 4. Multi-View UI (`multi-view.spec.ts`)

Separate views for different participants.

**Join Flow Tests (Jackbox-style):**
- [ ] DM can create join code via "Invite Players" button
- [ ] Join code displays prominently (large, readable)
- [ ] Code is 4-6 alphanumeric characters
- [ ] Direct link with code embedded works (`/join/ABC123`)
- [ ] Join page shows game name and DM name
- [ ] Player enters display name on join
- [ ] Invalid code shows clear error
- [ ] Expired code shows "game ended" message
- [ ] Successful join redirects to Party View

**Party View Tests:**
- [ ] Party View loads at `/game/:id/view/party`
- [ ] Display-only mode (no control buttons anywhere)
- [ ] Narration text displays with proper styling
- [ ] Character avatars visible in stage area
- [ ] Scene background renders
- [ ] TTS audio plays automatically (mocked for tests)
- [ ] Speech bubbles appear during dialogue
- [ ] No DM controls visible (Accept/Edit/Regenerate hidden)
- [ ] No evolution/emergence panels visible
- [ ] No beat editor visible
- [ ] Full-screen mode available
- [ ] Works on TV/projector (10ft UI readable)

**DM View Tests:**
- [ ] DM View loads at `/game/:id/view/dm`
- [ ] Requires authentication (redirect if not DM)
- [ ] All controls visible (beat editor, scene controls)
- [ ] Evolution approval panel functional
- [ ] Emergence notifications visible
- [ ] Hidden traits visible (marked as hidden)
- [ ] True relationship values shown
- [ ] Can approve/edit/regenerate content
- [ ] Party View preview panel shows what party sees
- [ ] Actions in DM View trigger updates in other views

**Player View Tests:**
- [ ] Player View loads at `/game/:id/view/player/:charId`
- [ ] Requires player authentication for that character
- [ ] Shows character's subjective perspective
- [ ] Own traits visible (including hidden ones they know)
- [ ] Other characters' hidden traits NOT visible
- [ ] Perceived relationships shown (not true values)
- [ ] Personal inventory visible
- [ ] Mobile-friendly layout (touch-friendly controls)
- [ ] Can submit actions for their character

**SSE Filtering Tests:**
- [ ] Party View receives: narration, scene changes, dialogue
- [ ] Party View does NOT receive: evolution_suggested, emergence_detected
- [ ] DM View receives: all events
- [ ] Player View receives: narration, own trait changes, filtered relationships
- [ ] Player View does NOT receive: other players' hidden events

**Multi-View Sync Tests (requires multiple browser contexts):**
- [ ] DM approves beat → Party View shows narration
- [ ] DM triggers scene change → all views update
- [ ] Player action submitted → DM sees it
- [ ] Latency acceptable (events appear within 1s)

**SSE Events to Mock (per view type):**
```typescript
// Party view receives filtered events
const PARTY_VIEW_EVENTS = [
  { type: 'narration', data: { content: 'The door opens...' } },
  { type: 'scene_change', data: { area: 'Dungeon' } },
];

// DM view receives everything
const DM_VIEW_EVENTS = [
  ...PARTY_VIEW_EVENTS,
  { type: 'evolution_suggested', data: { entity: 'guard', trait: 'suspicious' } },
  { type: 'emergence_detected', data: { pattern: 'alliance forming' } },
];

// Player view receives character-specific events
const PLAYER_VIEW_EVENTS = [
  ...PARTY_VIEW_EVENTS,
  { type: 'trait_revealed', data: { character: 'self', trait: 'cursed' } },
];
```

### 5. Scene & Navigation (`scene-navigation.spec.ts`)

Area transitions and scene management.

**Tests:**
- [ ] Current area name displays
- [ ] Scene transitions update UI
- [ ] Scene background changes on transition
- [ ] NPCs in area are listed
- [ ] Scene boundary detection triggers transition options

## Test Infrastructure Updates

### New Fixtures Needed

```typescript
// fixtures.ts additions
interface MultiViewFixtures {
  /** Start game and get URLs for all views */
  gameWithViews: {
    gameId: string;
    partyViewUrl: string;
    dmViewUrl: string;
    playerViewUrl: (charId: string) => string;
  };

  /** Open multiple browser contexts for multi-view testing */
  multiContext: {
    dmPage: Page;
    partyPage: Page;
    playerPage: Page;
  };
}
```

### New Mock Helpers Needed

```typescript
// mock-helpers.ts additions

interface ResearchEvent {
  type: 'console' | 'worldseed' | 'complete' | 'error';
  data?: string;
  seed?: WorldSeed;
  message?: string;
}

/** Mock world seeding API and SSE events */
export async function mockResearchSession(
  page: Page,
  events: ResearchEvent[],
  options?: { sessionId?: string; delay?: number }
): Promise<void> {
  const sessionId = options?.sessionId ?? 'test-session-123';

  // Mock session start
  await page.route('**/api/game/*/seed/start', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ sessionId }),
    });
  });

  // Mock SSE endpoint for research events
  await page.route('**/api/game/*/seed/events*', async (route) => {
    const sseBody = events
      .map(e => `event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`)
      .join('');
    await route.fulfill({
      status: 200,
      contentType: 'text/event-stream',
      body: sseBody,
    });
  });

  // Mock input endpoint
  await page.route('**/api/game/*/seed/input', async (route) => {
    await route.fulfill({ status: 200, body: JSON.stringify({ sent: true }) });
  });
}

/** Mock join code creation and validation */
export async function mockJoinFlow(
  page: Page,
  code: string,
  gameInfo?: { gameName?: string; dmName?: string }
): Promise<void> {
  // Mock code creation
  await page.route('**/api/game/*/join/create', async (route) => {
    await route.fulfill({
      status: 200,
      body: JSON.stringify({ code, expiresAt: new Date(Date.now() + 3600000).toISOString() }),
    });
  });

  // Mock code validation
  await page.route('**/api/game/*/join', async (route) => {
    const body = JSON.parse(await route.request().postData() ?? '{}');
    if (body.code === code) {
      await route.fulfill({
        status: 200,
        body: JSON.stringify({
          valid: true,
          gameId: 'test-game',
          gameName: gameInfo?.gameName ?? 'Test Adventure',
          dmName: gameInfo?.dmName ?? 'Test DM',
          token: 'session-token-xyz',
        }),
      });
    } else {
      await route.fulfill({ status: 400, body: JSON.stringify({ error: 'Invalid code' }) });
    }
  });
}

/** Mock SSE with view-specific filtering */
export async function mockViewSSE(
  page: Page,
  viewType: 'party' | 'dm' | 'player',
  events: GameEvent[]
): Promise<void> {
  await page.route('**/api/game/*/events*', async (route) => {
    const url = new URL(route.request().url());
    const requestedView = url.searchParams.get('view');

    // Filter events based on view type
    const filteredEvents = events.filter(e => {
      if (requestedView === 'party') {
        return !['evolution_suggested', 'emergence_detected', 'dm_only'].includes(e.type);
      }
      return true; // DM gets everything
    });

    const sseBody = filteredEvents
      .map(e => `event: ${e.type}\ndata: ${JSON.stringify(e.data)}\n\n`)
      .join('');

    await route.fulfill({
      status: 200,
      contentType: 'text/event-stream',
      body: sseBody,
    });
  });
}
```

## File Structure

```
packages/client/e2e/
├── app.spec.ts              # Existing - welcome, new game
├── game-flow.spec.ts        # Existing - story, editor, accessibility
├── dm-screen.spec.ts        # NEW - DM controls and panels
├── party-screen.spec.ts     # NEW - character display
├── world-seeding.spec.ts    # NEW - research agent flow
├── multi-view.spec.ts       # NEW - Party/DM/Player views
├── scene-navigation.spec.ts # NEW - area transitions
├── fixtures.ts              # Extended with multi-view fixtures
└── mock-helpers.ts          # Extended with new mocks
```

## Test Data

### Sample Characters
```typescript
const TEST_PARTY = [
  { id: 'hero-1', name: 'Aldric', class: 'Paladin', health: 85, maxHealth: 100 },
  { id: 'hero-2', name: 'Lyra', class: 'Mage', health: 45, maxHealth: 60 },
  { id: 'hero-3', name: 'Thorne', class: 'Rogue', health: 70, maxHealth: 70 },
];
```

### Sample WorldSeed
```typescript
const TEST_WORLD_SEED = {
  source: 'The Princess Bride',
  themes: ['true love', 'revenge', 'adventure'],
  factions: ['Florin', 'Guilder', 'Pirates'],
  keyLocations: ['Fire Swamp', 'Cliffs of Insanity', 'Castle'],
  archetypes: ['farm boy hero', 'princess', 'masked avenger'],
};
```

## Running Tests

```bash
# All e2e tests
pnpm --filter @reckoning/client test:e2e

# Specific suite
pnpm --filter @reckoning/client test:e2e dm-screen

# UI mode for debugging
pnpm --filter @reckoning/client test:e2e:ui

# Headed mode
pnpm --filter @reckoning/client test:e2e:headed
```

## CI Considerations

- Tests mock external services (AI, TTS)
- Real backend runs for true integration testing
- Multi-view tests need multiple browser contexts
- World seeding tests may need longer timeouts (research takes time)
