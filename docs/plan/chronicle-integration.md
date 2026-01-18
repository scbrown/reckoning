# Chronicle Integration Plan

## Overview

The Reckoning will integrate with **Chronicle**, a stateful narrative engine that handles story structure, play state, asset management, and comic generation. This fundamentally changes Reckoning's architecture—it becomes a thin interface layer while Chronicle owns all narrative state.

## What Is Chronicle?

Chronicle is a WASM module that provides:
- **Story graph** with branching and convergence (powered by beads)
- **Scene and dialogue storage**
- **Character definitions** with emotion-to-sprite mappings
- **Asset storage** (pixelsrc definitions) with pre-rendering
- **Play state tracking** (position, context flags, history)
- **Scene rendering** via pixelsrc
- **Comic generation** from playthroughs

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

## Open Questions

1. **WASM in Node.js**: Need to verify chronicle-wasm works in Node.js (server-side)
2. **State size**: How large can Chronicle's exported state get?
3. **Streaming**: Can Chronicle stream scene renders for large scenes?

## Related Documents

- [Chronicle Product Overview](ssh://git@git.lan/stiwi/chronicle.git/docs/product.md)
- [Chronicle Architecture](ssh://git@git.lan/stiwi/chronicle.git/docs/arch.md)
- [Chronicle Integration API](ssh://git@git.lan/stiwi/chronicle.git/docs/integration.md)
