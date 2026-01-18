# Phase C: Narrative Structure

## Goal

Group turns into scenes with optional connections, enabling narrative arc tracking and scene-based context.

## Why This Phase?

Narrative structure enables:
- Meaningful story segmentation (not just turns)
- Scene-based AI context ("we're in a confrontation scene")
- Branching narrative possibilities
- Foundation for export/comic generation (Phase D)
- Better pacing awareness for AI

## Prerequisites

- Phase A (Entity Evolution) complete
- Phase B (Structured Events) complete
- Existing turn-based system works, we're adding a layer on top

## Database Schema

### New Tables

```sql
-- Scenes group multiple turns into narrative units
CREATE TABLE scenes (
  id TEXT PRIMARY KEY,
  game_id TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  scene_type TEXT,  -- 'exposition', 'confrontation', 'revelation', 'transition', 'climax'
  location_id TEXT REFERENCES areas(id),

  -- Turn boundaries
  started_turn INTEGER,
  completed_turn INTEGER,

  -- Status
  status TEXT NOT NULL DEFAULT 'active',  -- 'pending', 'active', 'completed', 'skipped'

  -- Metadata
  mood TEXT,        -- 'tense', 'peaceful', 'mysterious', 'action', 'emotional'
  stakes TEXT,      -- 'low', 'medium', 'high', 'critical'

  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_scenes_game ON scenes(game_id, status);
CREATE INDEX idx_scenes_turns ON scenes(game_id, started_turn, completed_turn);

-- Connections between scenes (optional branching)
CREATE TABLE scene_connections (
  id TEXT PRIMARY KEY,
  game_id TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  from_scene_id TEXT NOT NULL REFERENCES scenes(id) ON DELETE CASCADE,
  to_scene_id TEXT NOT NULL REFERENCES scenes(id) ON DELETE CASCADE,

  -- Requirements to unlock this connection
  requirements TEXT,  -- JSON: { flags: [], traits: [], relationships: [] }

  -- Metadata
  connection_type TEXT,  -- 'sequential', 'branch', 'convergence', 'optional'
  description TEXT,      -- DM note about this path

  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,

  UNIQUE(from_scene_id, to_scene_id)
);

CREATE INDEX idx_scene_connections_from ON scene_connections(from_scene_id);
CREATE INDEX idx_scene_connections_to ON scene_connections(to_scene_id);

-- Track which scenes are available/unlocked
CREATE TABLE scene_availability (
  game_id TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  scene_id TEXT NOT NULL REFERENCES scenes(id) ON DELETE CASCADE,
  unlocked_turn INTEGER NOT NULL,
  unlocked_by TEXT,  -- event_id or 'initial'

  PRIMARY KEY (game_id, scene_id)
);

-- Scene-specific flags (separate from game-wide flags)
CREATE TABLE scene_flags (
  id TEXT PRIMARY KEY,
  game_id TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  scene_id TEXT NOT NULL REFERENCES scenes(id) ON DELETE CASCADE,
  flag_name TEXT NOT NULL,
  flag_value TEXT NOT NULL DEFAULT 'true',
  set_turn INTEGER NOT NULL,

  UNIQUE(game_id, scene_id, flag_name)
);

CREATE INDEX idx_scene_flags ON scene_flags(game_id, scene_id);
```

### Games Table Extension

```sql
-- Add current scene tracking
ALTER TABLE games ADD COLUMN current_scene_id TEXT REFERENCES scenes(id);
```

## Scene Types

```typescript
enum SceneType {
  Exposition = 'exposition',       // Setting up information
  Confrontation = 'confrontation', // Conflict or tension
  Revelation = 'revelation',       // Discovery or twist
  Transition = 'transition',       // Moving between major beats
  Climax = 'climax',              // High-stakes resolution
  Denouement = 'denouement',      // Aftermath, winding down
  Interlude = 'interlude',        // Character moment, breather
}

enum SceneMood {
  Tense = 'tense',
  Peaceful = 'peaceful',
  Mysterious = 'mysterious',
  Action = 'action',
  Emotional = 'emotional',
  Comedic = 'comedic',
  Ominous = 'ominous',
}

enum SceneStakes {
  Low = 'low',           // Casual interaction
  Medium = 'medium',     // Something to gain/lose
  High = 'high',         // Significant consequences
  Critical = 'critical', // Life/death or story-defining
}
```

## Services

### SceneRepository

```typescript
// packages/server/src/db/repositories/scene-repository.ts

export class SceneRepository {
  constructor(private db: Database) {}

  async create(scene: CreateSceneParams): Promise<Scene> {
    const id = generateId();
    this.db.prepare(`
      INSERT INTO scenes (id, game_id, name, description, scene_type, location_id, status, mood, stakes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, scene.gameId, scene.name, scene.description, scene.sceneType,
           scene.locationId, scene.status || 'pending', scene.mood, scene.stakes);
    return this.findById(id);
  }

  async findById(id: string): Promise<Scene | null> {
    return this.db.prepare('SELECT * FROM scenes WHERE id = ?').get(id);
  }

  async findByGame(gameId: string): Promise<Scene[]> {
    return this.db.prepare(`
      SELECT * FROM scenes WHERE game_id = ? ORDER BY started_turn ASC NULLS LAST
    `).all(gameId);
  }

  async findActive(gameId: string): Promise<Scene | null> {
    return this.db.prepare(`
      SELECT * FROM scenes WHERE game_id = ? AND status = 'active'
    `).get(gameId);
  }

  async findAvailable(gameId: string): Promise<Scene[]> {
    return this.db.prepare(`
      SELECT s.* FROM scenes s
      JOIN scene_availability sa ON s.id = sa.scene_id
      WHERE s.game_id = ? AND s.status = 'pending'
    `).all(gameId);
  }

  async startScene(sceneId: string, turn: number): Promise<void> {
    this.db.prepare(`
      UPDATE scenes SET status = 'active', started_turn = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(turn, sceneId);
  }

  async completeScene(sceneId: string, turn: number): Promise<void> {
    this.db.prepare(`
      UPDATE scenes SET status = 'completed', completed_turn = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(turn, sceneId);
  }

  async getEventsInScene(sceneId: string): Promise<StructuredEvent[]> {
    const scene = await this.findById(sceneId);
    if (!scene || !scene.started_turn) return [];

    const endTurn = scene.completed_turn || Infinity;
    return this.db.prepare(`
      SELECT * FROM events
      WHERE game_id = ? AND turn >= ? AND turn <= ?
      ORDER BY turn ASC
    `).all(scene.game_id, scene.started_turn, endTurn);
  }
}
```

### SceneConnectionRepository

```typescript
// packages/server/src/db/repositories/scene-connection-repository.ts

export class SceneConnectionRepository {
  constructor(private db: Database) {}

  async create(connection: CreateConnectionParams): Promise<SceneConnection> {
    const id = generateId();
    this.db.prepare(`
      INSERT INTO scene_connections (id, game_id, from_scene_id, to_scene_id, requirements, connection_type, description)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, connection.gameId, connection.fromSceneId, connection.toSceneId,
           JSON.stringify(connection.requirements), connection.connectionType, connection.description);
    return this.findById(id);
  }

  async findFromScene(sceneId: string): Promise<SceneConnection[]> {
    return this.db.prepare(`
      SELECT * FROM scene_connections WHERE from_scene_id = ?
    `).all(sceneId);
  }

  async findToScene(sceneId: string): Promise<SceneConnection[]> {
    return this.db.prepare(`
      SELECT * FROM scene_connections WHERE to_scene_id = ?
    `).all(sceneId);
  }

  async getUnlockedConnections(
    gameId: string,
    fromSceneId: string,
    gameState: GameState
  ): Promise<SceneConnection[]> {
    const connections = await this.findFromScene(fromSceneId);
    return connections.filter(c => this.requirementsMet(c.requirements, gameState));
  }

  private requirementsMet(requirements: SceneRequirements | null, state: GameState): boolean {
    if (!requirements) return true;

    // Check flag requirements
    if (requirements.flags) {
      for (const flag of requirements.flags) {
        if (!state.flags[flag]) return false;
      }
    }

    // Check trait requirements
    if (requirements.traits) {
      for (const trait of requirements.traits) {
        if (!state.playerTraits.includes(trait)) return false;
      }
    }

    // Check relationship requirements
    if (requirements.relationships) {
      for (const req of requirements.relationships) {
        const rel = state.relationships.find(r =>
          r.toType === req.entityType && r.toId === req.entityId
        );
        if (!rel || rel[req.dimension] < req.minValue) return false;
      }
    }

    return true;
  }
}
```

### SceneManager

```typescript
// packages/server/src/services/scenes/scene-manager.ts

export class SceneManager {
  constructor(
    private sceneRepo: SceneRepository,
    private connectionRepo: SceneConnectionRepository,
    private availabilityRepo: SceneAvailabilityRepository,
    private gameRepo: GameRepository,
    private eventBus: EventBus
  ) {}

  // Create a new scene (DM or AI initiated)
  async createScene(params: CreateSceneParams): Promise<Scene> {
    const scene = await this.sceneRepo.create(params);

    // If no requirements, make immediately available
    if (!params.requirements) {
      await this.availabilityRepo.unlock(params.gameId, scene.id, 'initial');
    }

    return scene;
  }

  // Start an available scene
  async startScene(gameId: string, sceneId: string): Promise<Scene> {
    const game = await this.gameRepo.findById(gameId);

    // Complete current scene if any
    if (game.currentSceneId) {
      await this.completeScene(gameId, game.currentSceneId);
    }

    await this.sceneRepo.startScene(sceneId, game.turn);
    await this.gameRepo.setCurrentScene(gameId, sceneId);

    const scene = await this.sceneRepo.findById(sceneId);
    this.eventBus.emit('scene:started', { gameId, scene });

    return scene!;
  }

  // Complete the current scene
  async completeScene(gameId: string, sceneId?: string): Promise<void> {
    const game = await this.gameRepo.findById(gameId);
    const targetSceneId = sceneId || game.currentSceneId;

    if (!targetSceneId) return;

    await this.sceneRepo.completeScene(targetSceneId, game.turn);

    // Check for newly unlocked scenes
    const connections = await this.connectionRepo.findFromScene(targetSceneId);
    const gameState = await this.buildGameState(gameId);

    for (const connection of connections) {
      if (this.connectionRepo.requirementsMet(connection.requirements, gameState)) {
        await this.availabilityRepo.unlock(gameId, connection.to_scene_id, game.turn);
        this.eventBus.emit('scene:unlocked', {
          gameId,
          sceneId: connection.to_scene_id,
        });
      }
    }

    await this.gameRepo.setCurrentScene(gameId, null);
    this.eventBus.emit('scene:completed', { gameId, sceneId: targetSceneId });
  }

  // Get available next scenes
  async getAvailableScenes(gameId: string): Promise<Scene[]> {
    return this.sceneRepo.findAvailable(gameId);
  }

  // Get scene summary for context
  async getSceneSummary(sceneId: string): Promise<SceneSummary> {
    const scene = await this.sceneRepo.findById(sceneId);
    const events = await this.sceneRepo.getEventsInScene(sceneId);

    return {
      scene,
      eventCount: events.length,
      turnRange: {
        start: scene?.started_turn,
        end: scene?.completed_turn,
      },
      keyActions: this.extractKeyActions(events),
      participants: this.extractParticipants(events),
    };
  }

  // Auto-detect scene boundaries (optional helper)
  async suggestSceneBoundary(gameId: string, turn: number): Promise<boolean> {
    const recentEvents = await this.eventRepo.getRecent(gameId, 5);

    // Suggest scene end if:
    // - Location changed
    // - Major confrontation resolved
    // - Significant time passed (in narrative)
    // - Mood shift detected

    const lastEvent = recentEvents[0];
    if (lastEvent?.event_type === 'arrival') return true;
    if (lastEvent?.tags?.includes('confrontation_end')) return true;

    return false;
  }
}
```

## Integration Points

### GameEngine Changes

```typescript
// In game-engine/index.ts

async generateNext(gameId: string): Promise<GeneratedContent> {
  // NEW: Include scene context in generation
  const currentScene = await this.sceneManager.getCurrentScene(gameId);

  const content = await this.contentPipeline.generate(gameId, {
    scene: currentScene,
  });

  // NEW: Check for scene boundary suggestion
  if (await this.sceneManager.suggestSceneBoundary(gameId, game.turn)) {
    await this.broadcastSceneBoundarySuggestion(gameId);
  }

  return content;
}

// DM can manually end scene
async endScene(gameId: string): Promise<void> {
  await this.sceneManager.completeScene(gameId);
}

// DM can start a specific available scene
async startScene(gameId: string, sceneId: string): Promise<void> {
  await this.sceneManager.startScene(gameId, sceneId);
}
```

### ContextBuilder Changes

```typescript
// In context-builder.ts

async buildContext(gameId: string): Promise<GenerationContext> {
  // ... existing context ...

  // NEW: Scene context
  const currentScene = await this.sceneRepo.findActive(gameId);
  const sceneSummary = currentScene
    ? await this.sceneManager.getSceneSummary(currentScene.id)
    : null;

  const availableScenes = await this.sceneManager.getAvailableScenes(gameId);

  return {
    ...existingContext,

    // Scene context
    currentScene: currentScene ? {
      name: currentScene.name,
      type: currentScene.scene_type,
      mood: currentScene.mood,
      stakes: currentScene.stakes,
      turnCount: sceneSummary?.eventCount || 0,
    } : null,

    availableScenes: availableScenes.map(s => ({
      id: s.id,
      name: s.name,
      type: s.scene_type,
    })),
  };
}
```

### AI Prompt Changes

```
## Current Scene

You are in scene: "[Scene Name]"
- Type: [exposition/confrontation/revelation/etc.]
- Mood: [tense/peaceful/mysterious/etc.]
- Stakes: [low/medium/high/critical]
- Events so far in scene: [count]

Maintain consistency with the scene's mood and stakes. If this scene feels
like it's reaching a natural conclusion, indicate that in your response.

## Available Next Scenes

If the current scene concludes, these scenes could follow:
- [Scene A]: [brief description]
- [Scene B]: [brief description]

Or the DM may create a new scene based on player actions.
```

## DM Workflow

### Scene Creation

DM can create scenes:
1. **Manually**: Define name, type, mood, stakes, requirements
2. **From AI suggestion**: AI proposes scene based on narrative direction
3. **On the fly**: Quick scene during play ("Starting a new scene: Tavern Confrontation")

### Scene Flow

```
[No active scene]
     │
     ▼
DM selects from available scenes OR creates new
     │
     ▼
[Scene Active] ─────────────────────────────┐
     │                                       │
     ├── Events occur (turns)               │
     │                                       │
     ├── System suggests boundary ──────────┤
     │                                       │
     └── DM ends scene ─────────────────────┘
     │
     ▼
[Scene Completed]
     │
     ▼
Connections checked → New scenes unlocked
     │
     ▼
[No active scene] (cycle repeats)
```

### Optional: Freeform Mode

Games can run without scenes entirely:
- `current_scene_id` stays null
- All turn-based functionality works
- Scenes are purely organizational, not required

## Tasks

### Database
- [ ] Create migration for `scenes` table
- [ ] Create migration for `scene_connections` table
- [ ] Create migration for `scene_availability` table
- [ ] Create migration for `scene_flags` table
- [ ] Add `current_scene_id` to games table

### Repositories
- [ ] Implement SceneRepository
- [ ] Implement SceneConnectionRepository
- [ ] Implement SceneAvailabilityRepository
- [ ] Implement SceneFlagRepository
- [ ] Add repository tests

### Services
- [ ] Implement SceneManager
- [ ] Implement scene boundary detection
- [ ] Add service tests

### Integration
- [ ] Update GameEngine with scene operations
- [ ] Update ContextBuilder with scene context
- [ ] Update AI prompts for scene awareness
- [ ] Add scene events to SSE broadcast

### API
- [ ] Add GET /api/game/:id/scenes
- [ ] Add POST /api/game/:id/scenes (create)
- [ ] Add POST /api/game/:id/scenes/:sid/start
- [ ] Add POST /api/game/:id/scenes/:sid/complete
- [ ] Add GET /api/game/:id/scenes/available
- [ ] Add POST /api/game/:id/scenes/:sid/connections

### Client
- [ ] Add scene indicator in game UI
- [ ] Add scene management in DM tools
- [ ] Add scene selection when multiple available
- [ ] Show scene history/timeline

## Acceptance Criteria

- [ ] Scenes can be created with type, mood, stakes
- [ ] Scenes track start/end turns
- [ ] Scene connections define possible paths
- [ ] Requirements can gate scene availability
- [ ] AI receives scene context in prompts
- [ ] DM can manually start/end scenes
- [ ] System suggests scene boundaries
- [ ] Games work without scenes (optional feature)
- [ ] All existing functionality unchanged
