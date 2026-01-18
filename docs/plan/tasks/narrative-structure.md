# Epic: Narrative Structure

Group turns into scenes with optional connections and requirements.

## Overview

| Field | Value |
|-------|-------|
| **Epic ID** | narrative-structure |
| **Prefix** | NARR |
| **Status** | Planning |
| **Dependencies** | structured-events |
| **Blocked By** | SEVT-012 (structured-events complete) |

## Task Dependency Graph

```
                        [structured-events complete]
                                    │
                                    ▼
NARR-001 ─────────────────────────────────────────────────────────────────┐
(scenes table migration)                                                   │
    │                                                                      │
    ▼                                                                      │
NARR-002                                                                   │
(scene_connections migration)                                              │
    │                                                                      │
    ▼                                                                      │
NARR-003                                                                   │
(scene_availability migration)                                             │
    │                                                                      │
    ▼                                                                      │
NARR-004                                                                   │
(scene_flags migration + games.current_scene_id)                          │
    │                                                                      │
    ├───────────────────┬───────────────────┐                             │
    ▼                   ▼                   ▼                              │
NARR-005            NARR-006            NARR-007                          │
(SceneRepo)         (ConnectionRepo)    (AvailabilityRepo)                │
    │                   │                   │                              │
    └───────────────────┴───────────────────┘                             │
                        │                                                  │
                        ▼                                                  │
                    NARR-008                                               │
                    (SceneManager)                                         │
                        │                                                  │
            ┌───────────┴───────────┐                                     │
            ▼                       ▼                                      │
        NARR-009                NARR-010                                   │
        (boundary detection)    (requirement eval)                         │
            │                       │                                      │
            └───────────────────────┘                                     │
                        │                                                  │
                        ▼                                                  │
                    NARR-011                                               │
                    (GameEngine integration)                               │
                        │                                                  │
                        ▼                                                  │
                    NARR-012                                               │
                    (ContextBuilder integration)                           │
                        │                                                  │
                        ▼                                                  │
                    NARR-013                                               │
                    (API routes)                                           │
                        │                                                  │
                        ▼                                                  │
                    NARR-014                                               │
                    (Scene management UI)                                  │
                        │                                                  │
                        ▼                                                  │
                    NARR-015 ◄─────────────────────────────────────────────┘
                    (documentation)
```

---

## Tasks

### NARR-001: Create scenes table migration

**Status**: todo
**Dependencies**: structured-events epic complete
**Blocked By**: SEVT-012

#### Description
Create SQLite migration for the `scenes` table that groups turns into narrative units.

#### Acceptance Criteria
- [ ] Migration file created
- [ ] Table has columns: id, game_id, name, description, scene_type, location_id, started_turn, completed_turn, status, mood, stakes, created_at, updated_at
- [ ] Foreign key to games(id) with CASCADE delete
- [ ] Foreign key to areas(id) for location_id (nullable)
- [ ] scene_type accepts: exposition, confrontation, revelation, transition, climax, denouement, interlude
- [ ] status accepts: pending, active, completed, skipped
- [ ] mood accepts: tense, peaceful, mysterious, action, emotional, comedic, ominous
- [ ] stakes accepts: low, medium, high, critical
- [ ] Indexes on (game_id, status) and (game_id, started_turn, completed_turn)
- [ ] Migration runs successfully

#### Technical Notes
```sql
CREATE TABLE scenes (
  id TEXT PRIMARY KEY,
  game_id TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  scene_type TEXT,
  location_id TEXT REFERENCES areas(id),
  started_turn INTEGER,
  completed_turn INTEGER,
  status TEXT NOT NULL DEFAULT 'pending',
  mood TEXT,
  stakes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

#### Tests Required
- Migration applies without error
- Enum constraints work (invalid values rejected)
- Foreign key constraints work
- Turn tracking works correctly

---

### NARR-002: Create scene_connections table migration

**Status**: todo
**Dependencies**: NARR-001
**Blocked By**: none

#### Description
Create SQLite migration for the `scene_connections` table that defines possible paths between scenes.

#### Acceptance Criteria
- [ ] Migration file created
- [ ] Table has columns: id, game_id, from_scene_id, to_scene_id, requirements (JSON), connection_type, description, created_at
- [ ] Foreign keys to games and scenes tables with CASCADE delete
- [ ] Unique constraint on (from_scene_id, to_scene_id)
- [ ] connection_type accepts: sequential, branch, convergence, optional
- [ ] Indexes on from_scene_id and to_scene_id
- [ ] Migration runs successfully

#### Technical Notes
Requirements JSON structure:
```json
{
  "flags": ["has_key", "talked_to_guard"],
  "traits": ["merciful"],
  "relationships": [
    { "entityType": "npc", "entityId": "captain", "dimension": "trust", "minValue": 0.6 }
  ]
}
```

#### Tests Required
- Migration applies without error
- JSON requirements stored correctly
- Unique constraint prevents duplicate connections
- Cascade delete works

---

### NARR-003: Create scene_availability table migration

**Status**: todo
**Dependencies**: NARR-002
**Blocked By**: none

#### Description
Create SQLite migration for tracking which scenes are unlocked for a game.

#### Acceptance Criteria
- [ ] Migration file created
- [ ] Table has columns: game_id, scene_id (composite PK), unlocked_turn, unlocked_by
- [ ] Foreign keys to games and scenes
- [ ] unlocked_by stores event_id or 'initial' for starting scenes
- [ ] Migration runs successfully

#### Technical Notes
This table tracks when scenes became available, separate from scenes.status which tracks if they've been started/completed.

#### Tests Required
- Migration applies without error
- Composite primary key works
- Can query available scenes efficiently

---

### NARR-004: Create scene_flags migration and add current_scene_id to games

**Status**: todo
**Dependencies**: NARR-003
**Blocked By**: none

#### Description
Create scene_flags table for scene-specific flags and add current_scene_id to games table.

#### Acceptance Criteria
- [ ] scene_flags table created with: id, game_id, scene_id, flag_name, flag_value, set_turn
- [ ] Unique constraint on (game_id, scene_id, flag_name)
- [ ] games table has new column: current_scene_id (nullable, FK to scenes)
- [ ] Index on (game_id, scene_id) for scene_flags
- [ ] Migration runs successfully

#### Technical Notes
Scene flags are separate from game-wide flags. They reset when scene changes.

#### Tests Required
- Migration applies without error
- Scene flags queryable by scene
- current_scene_id nullable (games can have no active scene)

---

### NARR-005: Implement SceneRepository

**Status**: todo
**Dependencies**: NARR-004
**Blocked By**: none

#### Description
Implement the SceneRepository class for CRUD operations on scenes.

#### Acceptance Criteria
- [ ] Class created at `packages/server/src/db/repositories/scene-repository.ts`
- [ ] Methods implemented:
  - `create(scene)`: Create new scene
  - `findById(id)`: Get single scene
  - `findByGame(gameId)`: All scenes for game
  - `findActive(gameId)`: Currently active scene
  - `findAvailable(gameId)`: Pending scenes that are unlocked
  - `startScene(sceneId, turn)`: Set active, record start turn
  - `completeScene(sceneId, turn)`: Set completed, record end turn
  - `getEventsInScene(sceneId)`: Events within scene turn range
- [ ] TypeScript types for Scene, SceneType, SceneMood, SceneStakes
- [ ] Exported from repository index

#### Technical Notes
getEventsInScene queries events table where turn between started_turn and completed_turn.

#### Tests Required
- Unit tests for each method
- Test scene lifecycle (pending → active → completed)
- Test events in scene query
- Test available scenes filtering

---

### NARR-006: Implement SceneConnectionRepository

**Status**: todo
**Dependencies**: NARR-004
**Blocked By**: none

#### Description
Implement the SceneConnectionRepository class for managing scene connections.

#### Acceptance Criteria
- [ ] Class created at `packages/server/src/db/repositories/scene-connection-repository.ts`
- [ ] Methods implemented:
  - `create(connection)`: Create connection
  - `findById(id)`: Get single connection
  - `findFromScene(sceneId)`: Outgoing connections
  - `findToScene(sceneId)`: Incoming connections
  - `getUnlockedConnections(gameId, fromSceneId, gameState)`: Filter by requirements
  - `delete(id)`: Remove connection
- [ ] TypeScript types for SceneConnection, SceneRequirements
- [ ] Exported from repository index

#### Technical Notes
getUnlockedConnections evaluates requirements against current game state.

#### Tests Required
- Unit tests for each method
- Test requirement evaluation
- Test with various requirement types (flags, traits, relationships)

---

### NARR-007: Implement SceneAvailabilityRepository

**Status**: todo
**Dependencies**: NARR-004
**Blocked By**: none

#### Description
Implement the SceneAvailabilityRepository for tracking unlocked scenes.

#### Acceptance Criteria
- [ ] Class created at `packages/server/src/db/repositories/scene-availability-repository.ts`
- [ ] Methods implemented:
  - `unlock(gameId, sceneId, unlockedBy)`: Mark scene available
  - `isUnlocked(gameId, sceneId)`: Check if scene available
  - `getUnlocked(gameId)`: All unlocked scene IDs
  - `getUnlockInfo(gameId, sceneId)`: When/how unlocked
- [ ] TypeScript types for SceneAvailability
- [ ] Exported from repository index

#### Tests Required
- Unit tests for each method
- Test unlock idempotency (unlock twice = no error)
- Test unlock info retrieval

---

### NARR-008: Implement SceneManager service

**Status**: todo
**Dependencies**: NARR-005, NARR-006, NARR-007
**Blocked By**: none

#### Description
Implement the core SceneManager service that coordinates scene operations.

#### Acceptance Criteria
- [ ] Class created at `packages/server/src/services/scenes/scene-manager.ts`
- [ ] Constructor accepts SceneRepo, ConnectionRepo, AvailabilityRepo, GameRepo, EventBus
- [ ] Methods implemented:
  - `createScene(params)`: Create scene, auto-unlock if no requirements
  - `startScene(gameId, sceneId)`: Complete current, start new
  - `completeScene(gameId, sceneId?)`: End current scene, check unlocks
  - `getAvailableScenes(gameId)`: Unlocked pending scenes
  - `getSceneSummary(sceneId)`: Scene with event count and participants
- [ ] Emits events: 'scene:started', 'scene:completed', 'scene:unlocked'
- [ ] Updates games.current_scene_id

#### Technical Notes
Scene transitions should:
1. Complete current scene if any
2. Check connections for newly unlocked scenes
3. Start new scene
4. Update game state

#### Tests Required
- Unit tests for each method
- Test scene lifecycle transitions
- Test unlock cascade (complete scene → unlock connected)
- Test event emission
- Integration test with database

---

### NARR-009: Implement scene boundary detection

**Status**: todo
**Dependencies**: NARR-008
**Blocked By**: SEVT-005 (event queries)

#### Description
Implement automatic scene boundary suggestion based on game events.

#### Acceptance Criteria
- [ ] Method `suggestSceneBoundary(gameId, turn)` added to SceneManager
- [ ] Detects boundary conditions:
  - Location change (arrival event)
  - Major confrontation resolved (combat_end tag)
  - Significant mood shift
  - Long scene (> N turns)
- [ ] Returns boolean (suggest end) or continues
- [ ] Configurable thresholds
- [ ] Does not auto-end scenes, only suggests

#### Technical Notes
Suggestions are advisory - DM decides whether to end scene.

#### Tests Required
- Unit tests for each boundary condition
- Test location change detection
- Test threshold configuration
- Test with no boundary (returns false)

---

### NARR-010: Implement requirement evaluation

**Status**: todo
**Dependencies**: NARR-008
**Blocked By**: EVOL-005, EVOL-006 (trait/relationship repos)

#### Description
Implement evaluation of scene connection requirements against game state.

#### Acceptance Criteria
- [ ] Method `evaluateRequirements(requirements, gameState)` added to SceneManager
- [ ] Evaluates:
  - flags: All specified flags must be set
  - traits: Player must have all specified traits
  - relationships: Dimension values must meet thresholds
- [ ] Returns boolean
- [ ] Handles null/missing requirements (returns true)
- [ ] Handles missing relationship (returns false for that requirement)

#### Technical Notes
GameState structure:
```typescript
interface GameState {
  flags: Record<string, boolean>;
  playerTraits: string[];
  relationships: Relationship[];
}
```

#### Tests Required
- Unit tests for each requirement type
- Test combined requirements (all must pass)
- Test missing data handling
- Test edge cases (empty requirements)

---

### NARR-011: Integrate SceneManager with GameEngine

**Status**: todo
**Dependencies**: NARR-009, NARR-010
**Blocked By**: none

#### Description
Update GameEngine to support scene operations.

#### Acceptance Criteria
- [ ] GameEngine constructor accepts SceneManager
- [ ] Methods added:
  - `startScene(gameId, sceneId)`: Start specific scene
  - `endScene(gameId)`: End current scene
  - `getAvailableScenes(gameId)`: Proxy to SceneManager
- [ ] generateNext() includes scene boundary suggestion
- [ ] Scene events broadcast via SSE
- [ ] Existing functionality unchanged (scenes optional)

#### Technical Notes
Scenes are optional - game works without any scenes. Only add scene context if scene exists.

#### Tests Required
- Integration test: scene lifecycle through GameEngine
- Test boundary suggestion broadcast
- Test without scenes (backward compatible)
- Test SSE broadcasts

---

### NARR-012: Integrate SceneManager with ContextBuilder

**Status**: todo
**Dependencies**: NARR-008
**Blocked By**: SEVT-009 (ContextBuilder has patterns)

#### Description
Update ContextBuilder to include scene context in AI generation.

#### Acceptance Criteria
- [ ] ContextBuilder constructor accepts SceneManager
- [ ] `buildContext()` includes:
  - Current scene (name, type, mood, stakes, turn count)
  - Available next scenes (if any)
  - Scene history summary
- [ ] Context formatted for AI consumption
- [ ] Handles no active scene gracefully

#### Technical Notes
Format for AI:
```
Current Scene: "Tavern Confrontation"
- Type: confrontation
- Mood: tense
- Stakes: medium
- Turns in scene: 5

Available next scenes:
- "The Chase" (requires: talked_to_witness)
- "Dead End" (always available)
```

#### Tests Required
- Unit test: context includes scene
- Test with no active scene
- Test available scenes inclusion
- Integration test with full context

---

### NARR-013: Add Scene API routes

**Status**: todo
**Dependencies**: NARR-008
**Blocked By**: none

#### Description
Add REST API routes for scene management.

#### Acceptance Criteria
- [ ] Routes created at `packages/server/src/routes/scenes.ts`
- [ ] Endpoints implemented:
  - `GET /api/game/:id/scenes` - List all scenes
  - `POST /api/game/:id/scenes` - Create scene
  - `GET /api/game/:id/scenes/available` - Get available scenes
  - `GET /api/game/:id/scenes/current` - Get current scene
  - `POST /api/game/:id/scenes/:sid/start` - Start scene
  - `POST /api/game/:id/scenes/:sid/complete` - Complete scene
  - `GET /api/game/:id/scenes/:sid` - Get scene details
  - `POST /api/game/:id/scenes/:sid/connections` - Add connection
- [ ] Request validation with Zod schemas
- [ ] Error handling for invalid transitions
- [ ] Routes registered in server

#### Technical Notes
Scene creation should validate scene_type, mood, stakes values.

#### Tests Required
- API tests for each endpoint
- Test invalid scene transitions (start completed scene)
- Test connection creation
- Test authorization

---

### NARR-014: Implement Scene management UI

**Status**: todo
**Dependencies**: NARR-013
**Blocked By**: EVOL-014 (DM UI exists)

#### Description
Add UI components for DM to manage scenes.

#### Acceptance Criteria
- [ ] Scene indicator in game view showing current scene
- [ ] DM scene panel with:
  - Current scene details (type, mood, stakes)
  - "End Scene" button
  - Available next scenes to start
  - Scene creation form
- [ ] Scene timeline/history view
- [ ] Boundary suggestion notification
- [ ] Scene selection when multiple available
- [ ] Integrates with existing DM tools layout

#### Technical Notes
Scene panel should be collapsible to not clutter DM view.

#### Tests Required
- Component renders current scene
- End scene triggers API call
- Scene selection works
- Create scene form validates
- Timeline shows scene history

---

### NARR-015: Write narrative structure documentation

**Status**: todo
**Dependencies**: NARR-014
**Blocked By**: none

#### Description
Write comprehensive documentation for the narrative structure system.

#### Acceptance Criteria
- [ ] API documentation for all scene endpoints
- [ ] Scene types and when to use each
- [ ] Mood and stakes guidelines
- [ ] Connection requirements syntax
- [ ] DM guide for scene management
- [ ] Developer guide for extending scene types
- [ ] Examples of scene flows

#### Technical Notes
Include visual diagrams of example scene graphs.

#### Tests Required
- Documentation review for accuracy
- Code examples tested

---

## Summary

| Task | Title | Dependencies |
|------|-------|--------------|
| NARR-001 | Create scenes table migration | structured-events |
| NARR-002 | Create scene_connections table migration | NARR-001 |
| NARR-003 | Create scene_availability table migration | NARR-002 |
| NARR-004 | Create scene_flags migration + games.current_scene_id | NARR-003 |
| NARR-005 | Implement SceneRepository | NARR-004 |
| NARR-006 | Implement SceneConnectionRepository | NARR-004 |
| NARR-007 | Implement SceneAvailabilityRepository | NARR-004 |
| NARR-008 | Implement SceneManager service | NARR-005, NARR-006, NARR-007 |
| NARR-009 | Implement scene boundary detection | NARR-008, SEVT-005 |
| NARR-010 | Implement requirement evaluation | NARR-008, EVOL-005, EVOL-006 |
| NARR-011 | Integrate with GameEngine | NARR-009, NARR-010 |
| NARR-012 | Integrate with ContextBuilder | NARR-008, SEVT-009 |
| NARR-013 | Add Scene API routes | NARR-008 |
| NARR-014 | Implement Scene management UI | NARR-013, EVOL-014 |
| NARR-015 | Write documentation | NARR-014 |

## Cross-Epic Dependencies

- NARR-009 depends on SEVT-005 for event queries
- NARR-010 depends on EVOL-005, EVOL-006 for trait/relationship checks
- NARR-012 depends on SEVT-009 (ContextBuilder already has patterns)
- NARR-014 depends on EVOL-014 (DM UI exists)
