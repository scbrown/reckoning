# Playwright Integration Tests Plan

## Goal

Comprehensive e2e test coverage for Reckoning's core user flows, with focus on:
- Multi-View UI (Party View, DM View, Player View)
- World Seeding flow
- Core DM and Party screen functionality

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

**Tests:**
- [ ] World seeding option appears in new game wizard
- [ ] Entering seed prompt opens research console
- [ ] Research console streams Claude Code output
- [ ] DM can see progress in real-time
- [ ] Cancel button stops research session
- [ ] Completed research shows WorldSeed summary
- [ ] WorldSeed can be accepted or regenerated
- [ ] Accepted WorldSeed proceeds to world generation
- [ ] Generated world reflects seed themes

### 4. Multi-View UI (`multi-view.spec.ts`)

Separate views for different participants.

**Party View Tests:**
- [ ] Party View loads at `/game/:id/view/party`
- [ ] Display-only (no control buttons visible)
- [ ] Narration text displays and animates
- [ ] Character avatars visible
- [ ] Scene background renders
- [ ] TTS audio plays (mocked for tests)
- [ ] No DM controls visible
- [ ] No evolution/emergence panels

**DM View Tests:**
- [ ] DM View loads at `/game/:id/view/dm`
- [ ] All controls visible (beat editor, scene controls)
- [ ] Evolution approval panel functional
- [ ] Emergence notifications visible
- [ ] Party View preview panel (if implemented)
- [ ] Can control game while Party View shows results

**Player View Tests:**
- [ ] Player View loads at `/game/:id/view/player/:charId`
- [ ] Shows only that character's perspective
- [ ] Hidden traits not visible
- [ ] Perceived relationships shown (not true values)
- [ ] Mobile-friendly layout
- [ ] Personal inventory visible

**Join Flow Tests:**
- [ ] Join code generation works
- [ ] Players can join via code
- [ ] Direct link join works
- [ ] Multiple sessions can connect

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

/** Mock world seeding research session */
export async function mockResearchSession(page: Page, events: ResearchEvent[]): Promise<void>;

/** Mock evolution approval flow */
export async function mockPendingEvolution(page: Page, evolution: PendingEvolution): Promise<void>;

/** Mock join code generation */
export async function mockJoinCode(page: Page, code: string): Promise<void>;

/** Simulate SSE state sync across views */
export async function syncViewState(pages: Page[], event: GameEvent): Promise<void>;
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
