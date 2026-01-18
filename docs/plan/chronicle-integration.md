# Chronicle Integration Plan

## Overview

The Reckoning will integrate with **Chronicle**, a stateful narrative engine that handles story structure, play state, entity evolution, and comic generation. This fundamentally changes Reckoning's architecture—it becomes a thin interface layer while Chronicle owns all narrative state.

## What Is Chronicle?

Chronicle is a WASM module that provides:
- **Story graph** with parallel quest lines and cross-dependencies (powered by chronicle-graph)
- **Entity Evolution System** - Tracks how characters, scenes, and relationships transform through play
- **Scene and dialogue storage**
- **Character definitions** with traits, relationships, and emotion-to-sprite mappings
- **Evolution Rules** - Generated with the world, define how choices affect traits/relationships
- **Asset storage** (pixelsrc definitions) with pre-rendering
- **Play state tracking** (position, context flags, history)
- **Query & Eventing Layer** - Efficient queries and event streams for AI decisions
- **Scene rendering** via pixelsrc
- **Comic generation** from playthroughs
- **Self-contained persistence** - IndexedDB in browser, optional Git sync via OAuth

Repository: `ssh://git@git.lan/stiwi/chronicle.git`

## Architecture Change

### Before: Reckoning Owns Everything

```
┌─────────────────────────────────────────────────────────────┐
│                    THE RECKONING                            │
│                                                             │
│  - AI generation                                            │
│  - DM editing                                               │
│  - Event history (SQLite)                                   │
│  - Game state (SQLite)                                      │
│  - Characters, areas, NPCs (SQLite)                         │
│  - TTS playback                                             │
│  - UI                                                       │
└─────────────────────────────────────────────────────────────┘
```

### After: Chronicle Owns State, Reckoning Owns Interface

```
┌─────────────────────────────────────────────────────────────┐
│                    THE RECKONING                            │
│                  (Interface Layer)                          │
│                                                             │
│  OWNS:                         NO LONGER OWNS:              │
│  - AI orchestration            - Event history              │
│  - DM editing UI               - Game state                 │
│  - TTS playback                - Characters/areas/NPCs      │
│  - Display (scenes, portraits) - Scene rendering            │
│  - Player input                - Asset storage              │
│  - Animation timing                                         │
└─────────────────────────────────┬───────────────────────────┘
                                  │ WASM API
                                  ▼
┌─────────────────────────────────────────────────────────────┐
│                       CHRONICLE                             │
│                   (State + Rendering)                       │
│                                                             │
│  - Story graph (scenes, connections, branches)              │
│  - Scene content (dialogue, character positions)            │
│  - Character definitions (emotions → sprites)               │
│  - Asset storage (pixelsrc JSONL)                           │
│  - Pre-rendered PNGs (sprites, backgrounds, scenes)         │
│  - Play state (current scene, context flags)                │
│  - Play history (for comic generation)                      │
└─────────────────────────────────────────────────────────────┘
```

## Game Flow with Chronicle

### Game Start

1. **Reckoning** calls AI to generate story structure (characters, locations, scenes, dialogue, assets)
2. **Reckoning** sends everything to **Chronicle**:
   - `createStory(config)`
   - `createCharacter(def, pixelsrc)` for each character
   - `createLocation(def, pixelsrc)` for each location
   - `createScene(def)` for each scene
   - `connectScenes()`, `setBranches()`, `setConvergence()` for graph
3. **Chronicle** stores content and pre-renders all assets
4. **Reckoning** calls `startSession()` to begin play

### During Play

1. **Reckoning** asks Chronicle: `getCurrentScene()`, `getDialogue(sceneId)`
2. **Reckoning** asks Chronicle: `renderScene(sceneId)` → PNG bytes
3. **Reckoning** displays scene, plays TTS, shows dialogue
4. For each dialogue line:
   - `getCharacterPortrait(charId, emotion)` → portrait + animation frames
   - Animate portrait while TTS plays
5. Player makes choice
6. **Reckoning** tells Chronicle: `completeScene(sceneId, flags)`
7. **Reckoning** asks Chronicle: `getUnlockedScenes()` → next options
8. Repeat

### DM Goes Off-Script

1. DM wants to do something not in the story graph
2. **Reckoning** calls AI to generate new content
3. **Reckoning** sends to Chronicle:
   - `createScene(newSceneDef)` (if not in closed mode)
   - `storeAssets(newPixelsrc)` (Chronicle renders them)
   - `connectScenes()`, `setConvergence()` to link into graph
4. Play continues with new content

### Game End

1. **Reckoning** calls Chronicle: `generateComic({format: 'pdf'})`
2. **Chronicle** renders comic from play history
3. **Reckoning** displays/saves the comic

## Database Changes

### Tables to Remove

| Table | Replacement |
|-------|-------------|
| `events` | Chronicle's play history |
| `parties` | Chronicle's character storage |
| `characters` | Chronicle's character definitions |
| `areas` | Chronicle's location storage |
| `area_exits` | Chronicle's scene graph |
| `area_objects` | Chronicle's scene content |
| `npcs` | Chronicle's character storage |

### Tables to Keep

| Table | Purpose |
|-------|---------|
| `games` | Minimal: game ID, Chronicle session ref |
| `editor_state` | DM editing is still Reckoning's job |
| `saves` | Points to Chronicle state export |

### New Pattern

```typescript
// Old: Query database for game state
const area = await areaRepo.findById(game.currentAreaId);
const characters = await characterRepo.findByPartyId(partyId);

// New: Query Chronicle
const sceneId = chronicle.getCurrentScene();
const scene = chronicle.getScene(sceneId);
const dialogue = chronicle.getDialogue(sceneId);
```

## Code Changes Required

### New Dependencies

```json
// package.json
{
  "dependencies": {
    "chronicle-wasm": "^0.1.0"
  }
}
```

### Services to Modify

**GameEngine** (`packages/server/src/services/game-engine/index.ts`)
- Remove direct database state management
- Add Chronicle WASM instance
- Route state queries through Chronicle

**ContentPipeline** (`packages/server/src/services/game-engine/content-pipeline.ts`)
- After DM approves content, send to Chronicle (not SQLite)
- For scene completion, call `chronicle.completeScene()`

**StateManager** (`packages/server/src/services/game-engine/state-manager.ts`)
- Replace SQLite event recording with Chronicle API
- `commitEvent()` → `chronicle.recordDialogue()` + `chronicle.completeScene()`

**ContextBuilder** (`packages/server/src/services/ai/context-builder.ts`)
- Get context from Chronicle instead of database
- `chronicle.getContextFlags()`, `chronicle.getScene()`, etc.

### New Services

**ChronicleService** (`packages/server/src/services/chronicle/index.ts`)
```typescript
import init, { Chronicle } from 'chronicle-wasm';

export class ChronicleService {
  private chronicle: Chronicle;

  async initialize(): Promise<void> {
    await init();
    this.chronicle = new Chronicle();
  }

  async createStory(config: StoryConfig): Promise<void> {
    this.chronicle.createStory(config);
  }

  async renderScene(sceneId: string): Promise<Uint8Array> {
    return this.chronicle.renderScene(sceneId);
  }

  // ... wrap all Chronicle API methods
}
```

### Client Changes

**Scene Display**
- Receive PNG from server (Chronicle renders it)
- Display directly (no client-side rendering)

**Portrait Animation**
- Receive animation frames from server
- Sync to TTS playback timing

**Choices**
- Receive from server (from Chronicle's dialogue)
- Send selection back to server

## Migration Path

### Phase 1: Chronicle Integration (New Games)

1. Add ChronicleService to server
2. New games use Chronicle for state
3. Old database tables ignored for new games
4. Both paths work during transition

### Phase 2: Remove Legacy Code

1. Remove database repositories for deprecated tables
2. Remove old state management code
3. Clean up database schema

### Phase 3: Comic Generation

1. Add comic generation UI
2. Call Chronicle's `generateComic()` on game end
3. Display/download comic

## Benefits

1. **Simpler Reckoning**: Less state management code
2. **Comic generation**: Built into Chronicle
3. **Pre-rendered assets**: No rendering delay
4. **Unified state**: One source of truth (Chronicle)
5. **Offline capable**: After initial generation, Chronicle has everything

## Entity Evolution Integration

Chronicle's Entity Evolution System directly supports Reckoning's Four Pillars. This is where the philosophical vision meets implementation.

### How Evolution Maps to the Four Pillars

| Reckoning Pillar | Chronicle Feature |
|------------------|-------------------|
| **Unreliable Self** | Perspective layer on evolution events; same event viewed differently |
| **History as Text** | Dual-layer history (events + derived state); text-based, AI-queryable |
| **Pattern Engine** | Evolution queries for trait patterns; relationship tracking |
| **Living Chronicle & Trial** | Evolution summaries; thread tracking for emergent narratives |

### Structured Events (Reckoning → Chronicle)

Reckoning constructs structured events from AI-generated narrative and sends them to Chronicle:

```typescript
interface GameEvent {
  id: string;
  turn: number;
  type: EventType;           // PlayerChoice, NPCAction, CombatResult, etc.
  action: string;            // "spare_enemy", "steal_item", "betray_ally"
  actor: EntityId;
  targets: EntityId[];
  witnesses: EntityId[];
  location: LocationId;
  tags: string[];
  narrative?: string;        // For logging, not rule evaluation
}

// Reckoning sends event, Chronicle evaluates rules
const result = await chronicle.submitEvent(event);
// result: { triggeredRules, pendingEvolutions, appliedEffects }
```

### Evolution Rules (Generated with World)

When Reckoning generates a new world, it also generates evolution rules that are stored in Chronicle:

```typescript
// During world generation
async function generateWorld(): Promise<void> {
  // AI generates world content...
  const world = await ai.generateWorld(config);

  // AI also generates evolution rules for this world
  const rules = await ai.generateEvolutionRules(world);

  // Send both to Chronicle
  await chronicle.createStory(world.config);
  for (const rule of rules) {
    await chronicle.addRule(rule);
  }
}
```

Rules are **hidden from the player** - they see narrative choices, not trait mechanics.

### DM Approval Flow for Evolution

Chronicle auto-detects evolution events, but the DM has final say:

```
Game Event → Chronicle Detects → Pending Queue → DM Reviews
                                                    │
                                        ┌───────────┼───────────┐
                                        ▼           ▼           ▼
                                    [Approve]   [Edit]     [Refuse]
```

This integrates with Reckoning's existing DM editor pattern - evolution suggestions appear alongside narrative content for review.

### Multi-Dimensional Relationships

Chronicle tracks relationships with numeric dimensions:

```typescript
interface RelationshipDimensions {
  trust: number;      // 0.0 - 1.0
  respect: number;
  affection: number;
  fear: number;
  resentment: number;
  debt: number;
}

// Aggregate labels computed from dimensions
type AggregateLabel =
  | 'devoted' | 'allied' | 'friendly' | 'respectful'
  | 'intimidated' | 'rival' | 'complicated' | 'obligated'
  | 'terrified' | 'hostile' | 'contemptuous'
  | 'indifferent' | 'ambivalent';
```

This enables nuanced NPC reactions - an NPC can respect you but also fear you.

### Reckoning's Background Processes

Reckoning runs background processes that query Chronicle to make AI decisions:

**Villain Emergence Observer:**
```typescript
class EmergenceObserver {
  constructor(private chronicle: Chronicle, private ai: AIService) {
    // Subscribe to relationship changes
    chronicle.events.watchThreshold(
      { dimension: 'resentment', gte: 0.6 },
      (event) => this.evaluateEmergence(event.entity)
    );
  }

  async evaluateEmergence(entityId: EntityId) {
    // Query Chronicle for full context
    const summary = await chronicle.getEvolutionSummary(entityId);
    const threads = await chronicle.query.threads({
      where: { involves: entityId, status: 'open' }
    });

    // AI decides if this should become a villain
    const potential = await ai.evaluate({
      prompt: "Evaluate villain emergence potential",
      context: { summary, threads }
    });

    if (potential.score > 0.7) {
      await this.proposeVillainArc(entityId, potential);
    }
  }
}
```

**Pattern Engine Integration:**
```typescript
// Query Chronicle for player patterns
const mercyCount = await chronicle.query.events({
  where: { action: { in: ['spare_enemy', 'show_mercy', 'forgive'] } }
}).length;

const hasTraitMerciful = await chronicle.getTraits('protagonist')
  .includes('merciful');

// Use for Pattern Engine targeting
if (mercyCount > 3 && hasTraitMerciful) {
  // Generate scenario that challenges mercy
}
```

### Context Building for AI Generation

When generating narrative, Reckoning queries Chronicle for rich context:

```typescript
async function buildGenerationContext(sceneId: SceneId): Promise<Context> {
  const sceneContext = await chronicle.getSceneContext(sceneId);

  return {
    scene: sceneContext.scene,
    characters: sceneContext.characters.map(c => ({
      name: c.character.name,
      traits: c.traits,
      relationships: c.relevantRelationships.map(r =>
        `${r.aggregateLabel} toward ${r.to.name}`
      ),
    })),
    callbackOpportunities: sceneContext.callbackOpportunities,
    activeThreads: sceneContext.activeThreads,
  };
}
```

### Persistence: Chronicle Owns It

Chronicle handles its own persistence - Reckoning has **zero involvement**:

- **Primary storage**: IndexedDB (browser) or filesystem (Node)
- **Git sync**: Optional, OAuth on demand, no tokens stored
- **Reckoning's role**: Just calls `chronicle.init()` and uses the API

```typescript
// Reckoning initialization - that's it
const chronicle = new Chronicle();
await chronicle.init('story-id');
await chronicle.load();

// Player wants to backup to GitHub
// Chronicle handles everything including OAuth popup
await chronicle.syncToGit('user/my-story', 'Session end backup');
```

## Open Questions

1. **WASM in Node.js**: Need to verify chronicle-wasm works in Node.js (server-side)
2. **State size**: How large can Chronicle's exported state get?
3. **Streaming**: Can Chronicle stream scene renders for large scenes?
4. **Rule generation prompts**: What prompts generate good evolution rules during world gen?
5. **Evolution UI**: How does DM review pending evolutions alongside narrative?

## Related Documents

- [Chronicle Product Overview](ssh://git@git.lan/stiwi/chronicle.git/docs/product.md)
- [Chronicle Architecture](ssh://git@git.lan/stiwi/chronicle.git/docs/arch.md)
- [Chronicle Entity Evolution](ssh://git@git.lan/stiwi/chronicle.git/docs/plan/entity-evolution.md)
- [Chronicle Story Graph](ssh://git@git.lan/stiwi/chronicle.git/docs/plan/story-graph.md)
