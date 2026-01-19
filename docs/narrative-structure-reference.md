---
title: "Narrative Structure Reference"
type: reference
status: active
created: 2026-01-19
updated: 2026-01-19
authors:
  - agent
related:
  - ./plan/narrative-structure.md
tags:
  - narrative-structure
  - scenes
  - connections
  - api
  - dm-guide
---

# Narrative Structure Reference

This document provides comprehensive documentation for the Narrative Structure system, which groups gameplay turns into meaningful scenes with optional branching connections.

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Data Model](#data-model)
3. [API Reference](#api-reference)
4. [Scene Types and Usage](#scene-types-and-usage)
5. [Mood and Stakes Guidelines](#mood-and-stakes-guidelines)
6. [Connection Requirements Syntax](#connection-requirements-syntax)
7. [DM Guide](#dm-guide)
8. [Developer Guide](#developer-guide)
9. [Example Scene Flows](#example-scene-flows)

---

## Architecture Overview

The Narrative Structure system enables meaningful story segmentation by grouping turns into scenes. This provides:

- **Story structure**: Group related turns into narrative units
- **AI context**: Give the AI awareness of scene mood, stakes, and type
- **Branching possibilities**: Define conditional paths between scenes
- **Export foundation**: Enable scene-based comic/story generation
- **Pacing awareness**: Help AI maintain appropriate tension

### Key Components

```
packages/server/src/
├── services/
│   └── scene/
│       ├── scene-manager.ts         # Core scene orchestrator
│       └── types.ts                 # Type definitions & events
├── db/repositories/
│   ├── scene-repository.ts          # Scene CRUD operations
│   ├── scene-connection-repository.ts  # Scene connections
│   └── scene-availability-repository.ts  # Unlock tracking
└── routes/
    └── scene.ts                     # API endpoints

packages/client/src/
└── components/
    └── scene-panel.ts               # DM scene management UI
```

### System Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                        SceneManager                              │
│  (Coordinates scene lifecycle, availability, connections)        │
└────────────────────────────┬────────────────────────────────────┘
                             │
         ┌───────────────────┼───────────────────┐
         │                   │                   │
         ▼                   ▼                   ▼
┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐
│ SceneRepository │ │ SceneConnection │ │ SceneAvailability│
│                 │ │    Repository   │ │    Repository   │
│ - Create/Read   │ │                 │ │                 │
│ - Start/Complete│ │ - Path linking  │ │ - Unlock scenes │
│ - Abandon       │ │ - Requirements  │ │ - Track when    │
└─────────────────┘ └─────────────────┘ └─────────────────┘
```

---

## Data Model

### Scene

A scene groups multiple turns into a narrative unit with metadata.

| Field | Type | Description |
|-------|------|-------------|
| `id` | string (UUID) | Unique identifier |
| `gameId` | string (UUID) | Parent game |
| `name` | string \| null | Display name |
| `description` | string \| null | Brief description |
| `sceneType` | string \| null | Scene category (see [Scene Types](#scene-types-and-usage)) |
| `locationId` | string \| null | Optional area reference |
| `startedTurn` | number | Turn when scene started |
| `completedTurn` | number \| null | Turn when scene ended |
| `status` | SceneStatus | Current state |
| `mood` | string \| null | Emotional tone (see [Mood Guidelines](#mood-and-stakes-guidelines)) |
| `stakes` | string \| null | What's at risk |
| `createdAt` | string (ISO) | Creation timestamp |
| `updatedAt` | string (ISO) | Last update timestamp |

### Scene Status

| Status | Description |
|--------|-------------|
| `active` | Currently in progress or available |
| `completed` | Successfully ended |
| `abandoned` | Ended without completion |

### Scene Connection

Connections define paths between scenes with optional requirements.

| Field | Type | Description |
|-------|------|-------------|
| `id` | string (UUID) | Unique identifier |
| `gameId` | string (UUID) | Parent game |
| `fromSceneId` | string (UUID) | Source scene |
| `toSceneId` | string (UUID) | Target scene |
| `connectionType` | ConnectionType | Type of link |
| `requirements` | ConnectionRequirements \| null | Conditions to traverse |
| `description` | string \| null | DM notes |
| `createdAt` | string (ISO) | Creation timestamp |

### Connection Types

| Type | Description | Use Case |
|------|-------------|----------|
| `path` | Standard navigation | Normal scene transitions |
| `conditional` | Requires conditions | Locked paths based on progress |
| `hidden` | Not visible until triggered | Secret passages, surprises |
| `one-way` | Cannot return | Point of no return |
| `teleport` | Instant transition | Magical transport, flashbacks |

### Scene Availability

Tracks which scenes are unlocked for a game.

| Field | Type | Description |
|-------|------|-------------|
| `gameId` | string (UUID) | Parent game |
| `sceneId` | string (UUID) | Unlocked scene |
| `unlockedTurn` | number | When unlocked |
| `unlockedBy` | string \| null | What triggered the unlock |
| `createdAt` | string (ISO) | Creation timestamp |

---

## API Reference

All scene endpoints are prefixed with `/api/scene`.

### List Scenes

```
GET /api/scene/:gameId
GET /api/scene/:gameId?limit=50&offset=0
```

Returns all scenes for a game, ordered by started turn.

**Query Parameters:**
- `limit` (optional): Max results (1-1000, default 100)
- `offset` (optional): Skip results (default 0)

**Response:**
```json
{
  "scenes": [
    {
      "id": "uuid",
      "gameId": "game-uuid",
      "name": "The Tavern Encounter",
      "description": "The party meets a mysterious stranger",
      "sceneType": "social",
      "locationId": "area-uuid",
      "startedTurn": 5,
      "completedTurn": 12,
      "status": "completed",
      "mood": "mysterious",
      "stakes": "Information about the artifact",
      "createdAt": "2026-01-19T12:00:00Z",
      "updatedAt": "2026-01-19T12:30:00Z"
    }
  ],
  "pagination": {
    "limit": 100,
    "offset": 0,
    "count": 1
  }
}
```

### Create Scene

```
POST /api/scene/:gameId
```

Creates a new scene. By default, scenes are auto-unlocked.

**Request Body:**
```json
{
  "turn": 5,
  "name": "Confrontation in the Ruins",
  "description": "The party faces the cult leader",
  "sceneType": "confrontation",
  "locationId": "area-uuid",
  "mood": "tense",
  "stakes": "The fate of the village",
  "autoUnlock": true,
  "unlockedBy": "player_choice"
}
```

**Required Fields:**
- `turn` (number): Current game turn

**Optional Fields:**
- `name` (string, max 200): Scene title
- `description` (string, max 2000): Scene description
- `sceneType` (string, max 100): Scene category
- `locationId` (UUID): Associated area
- `mood` (string, max 100): Emotional tone
- `stakes` (string, max 500): What's at risk
- `autoUnlock` (boolean): Auto-unlock scene (default true)
- `unlockedBy` (string, max 200): What triggered creation

**Response:**
```json
{
  "scene": { ... }
}
```

### Get Available Scenes

```
GET /api/scene/:gameId/available
```

Returns scenes that are unlocked and have 'active' status.

**Response:**
```json
{
  "scenes": [ ... ]
}
```

### Get Current Scene

```
GET /api/scene/:gameId/current
```

Returns the game's current active scene.

**Response:**
```json
{
  "scene": { ... }  // or null if no active scene
}
```

### Get Scene Details

```
GET /api/scene/:gameId/:sceneId
```

Returns detailed scene summary with connections.

**Response:**
```json
{
  "scene": { ... },
  "eventCount": 15,
  "isCurrentScene": true,
  "isUnlocked": true,
  "unlockedTurn": 5,
  "connections": [
    {
      "id": "conn-uuid",
      "toSceneId": "scene-uuid",
      "connectionType": "path",
      "description": "Through the forest"
    }
  ],
  "connectedScenes": [ ... ]
}
```

### Start Scene

```
POST /api/scene/:gameId/:sceneId/start
```

Starts a scene, making it the current active scene.

**Request Body:**
```json
{
  "turn": 13
}
```

**Behavior:**
- Sets scene status to 'active'
- Records the starting turn
- Updates `games.current_scene_id`
- Auto-unlocks if not already unlocked
- Emits `scene:started` event

**Response:**
```json
{
  "scene": { ... }
}
```

**Error Cases:**
- `SCENE_NOT_FOUND` (404): Scene doesn't exist
- `SCENE_ALREADY_COMPLETED` (400): Cannot start completed scene
- `INVALID_TRANSITION` (400): Scene was abandoned

### Complete Scene

```
POST /api/scene/:gameId/:sceneId/complete
```

Completes a scene, ending it successfully.

**Request Body:**
```json
{
  "turn": 20
}
```

**Behavior:**
- Sets scene status to 'completed'
- Records the completion turn
- Clears `games.current_scene_id` if this was active
- Emits `scene:completed` event

**Response:**
```json
{
  "scene": { ... }
}
```

### Create Connection

```
POST /api/scene/:gameId/connections
```

Creates a connection between two scenes.

**Request Body:**
```json
{
  "fromSceneId": "scene-uuid-1",
  "toSceneId": "scene-uuid-2",
  "connectionType": "conditional",
  "description": "Only accessible after defeating the guardian",
  "requirements": {
    "flags": ["guardian_defeated"],
    "traits": ["brave"],
    "stats": { "strength": 15 }
  }
}
```

**Required Fields:**
- `fromSceneId` (UUID): Source scene
- `toSceneId` (UUID): Destination scene

**Optional Fields:**
- `connectionType` (enum): path, conditional, hidden, one-way, teleport
- `description` (string, max 500): DM notes
- `requirements` (object): Traversal conditions

**Response:**
```json
{
  "connection": { ... }
}
```

### List Connections

```
GET /api/scene/:gameId/connections
GET /api/scene/:gameId/connections?fromSceneId=uuid
```

Returns connections, optionally filtered by source scene.

**Response:**
```json
{
  "connections": [ ... ]
}
```

---

## Scene Types and Usage

Scene types help the AI understand narrative context and maintain appropriate tone.

### Standard Scene Types

| Type | Description | AI Behavior |
|------|-------------|-------------|
| `exploration` | Discovering new areas | Emphasize discovery, hidden details, atmosphere |
| `combat` | Fighting encounters | Focus on action, tactics, danger |
| `social` | Character interactions | Emphasize dialogue, relationships, emotions |
| `puzzle` | Problem-solving | Present clues, allow experimentation |
| `rest` | Downtime and recovery | Quiet moments, character development |
| `transition` | Moving between beats | Brief, purposeful scene changes |

### Narrative Scene Types

| Type | Description | When to Use |
|------|-------------|-------------|
| `exposition` | Setting up information | Beginning a new plot thread |
| `confrontation` | Conflict or tension | Facing antagonists or hard choices |
| `revelation` | Discovery or twist | Major plot reveals |
| `climax` | High-stakes resolution | Peak dramatic moments |
| `denouement` | Aftermath, winding down | After major events |
| `interlude` | Character moments | Breathing room between tension |

### Custom Scene Types

Games can define custom scene types. The system accepts any string up to 100 characters. Consider documenting custom types in your game notes.

### Scene Type Selection Guidelines

1. **Match the primary activity**: If the scene involves fighting, use `combat` even if there's dialogue
2. **Consider player intent**: What are the players trying to accomplish?
3. **Think about AI context**: What tone should generated content have?
4. **Allow flexibility**: Scenes can change type mid-way if the focus shifts

---

## Mood and Stakes Guidelines

### Mood

Mood sets the emotional tone for AI-generated content.

| Mood | Description | Content Style |
|------|-------------|---------------|
| `tense` | Danger, uncertainty | Short sentences, ominous details |
| `peaceful` | Calm, safe | Relaxed pacing, pleasant details |
| `mysterious` | Unknown, curious | Hints, shadows, unanswered questions |
| `action` | Fast-paced, exciting | Dynamic verbs, quick cuts |
| `emotional` | Character-focused | Internal thoughts, meaningful pauses |
| `comedic` | Lighthearted, funny | Wordplay, absurdity, relief |
| `ominous` | Foreboding | Dark imagery, warnings |

### Combining Moods

You can combine moods with a slash or comma:
- `tense, mysterious` - Suspenseful unknown
- `emotional/peaceful` - Bittersweet calm
- `comedic, action` - Slapstick combat

### Stakes

Stakes indicate what's at risk and how urgently the scene matters.

| Stakes | Description | AI Behavior |
|--------|-------------|-------------|
| `low` | Casual interaction | Relaxed, no pressure |
| `medium` | Something to gain/lose | Moderate tension |
| `high` | Significant consequences | Serious, weighty decisions |
| `critical` | Life/death or story-defining | Maximum intensity |

### Stakes Descriptions

Rather than just using the level keyword, provide context:
- `"The artifact's location"` - Information stakes
- `"Mira's trust"` - Relationship stakes
- `"The village's survival"` - External stakes
- `"Face your past"` - Personal stakes

---

## Connection Requirements Syntax

Connections can have requirements that must be met before the path is available. Requirements are ANDed together - all conditions must pass.

### Requirements Structure

```typescript
interface ConnectionRequirements {
  flags?: string[];           // Game flags that must be set
  traits?: string[];          // Player traits that must be present
  relationships?: RelationshipRequirement[];  // Relationship thresholds
}

interface RelationshipRequirement {
  entityType: 'player' | 'character' | 'npc' | 'location';
  entityId: string;
  dimension: 'trust' | 'respect' | 'affection' | 'fear' | 'resentment' | 'debt';
  minValue?: number;    // Dimension must be >= this (0.0 to 1.0)
  maxValue?: number;    // Dimension must be <= this (0.0 to 1.0)
}
```

### Flag Requirements

Flags are simple boolean conditions. If a flag is in the list, it must be set to `true`.

```json
{
  "requirements": {
    "flags": ["door_key_found", "guardian_defeated"]
  }
}
```

This connection requires both `door_key_found` AND `guardian_defeated` to be true.

### Trait Requirements

Trait requirements check if the player has specific traits.

```json
{
  "requirements": {
    "traits": ["brave", "honorable"]
  }
}
```

The player must have both the `brave` and `honorable` traits.

### Relationship Requirements

Relationship requirements check specific dimension values.

```json
{
  "requirements": {
    "relationships": [
      {
        "entityType": "npc",
        "entityId": "npc-merchant-1",
        "dimension": "trust",
        "minValue": 0.7
      },
      {
        "entityType": "npc",
        "entityId": "npc-guard-1",
        "dimension": "fear",
        "maxValue": 0.3
      }
    ]
  }
}
```

This requires:
- Trust with the merchant to be at least 0.7
- Fear from the guard to be at most 0.3

### Combining Requirements

All requirement types can be combined:

```json
{
  "requirements": {
    "flags": ["secret_passage_discovered"],
    "traits": ["cunning"],
    "relationships": [
      {
        "entityType": "npc",
        "entityId": "npc-thief-guild",
        "dimension": "respect",
        "minValue": 0.5
      }
    ]
  }
}
```

### Requirement Evaluation

Requirements are evaluated by `SceneManager.evaluateRequirements()`:

```typescript
const context: RequirementContext = {
  flags: { "door_key_found": true, "guardian_defeated": false },
  playerTraits: ["brave", "merciful"],
  relationships: [ /* relationship objects */ ]
};

const canTraverse = sceneManager.evaluateRequirements(requirements, context);
```

---

## DM Guide

### Understanding Scenes

Scenes are organizational containers that:
1. Group related turns together
2. Provide context to the AI
3. Enable branching story paths
4. Support export/archival features

### Creating Scenes

Use the Scene Panel (+) button or create programmatically. Consider:

1. **Name**: Short, memorable title
2. **Description**: What happens in this scene
3. **Type**: Match the primary activity
4. **Mood**: Set the emotional tone
5. **Stakes**: What's at risk

### When to Start a New Scene

Start a new scene when:
- The party moves to a new location
- The narrative focus shifts significantly
- Tension level changes dramatically
- A new conflict or challenge begins
- Returning from a time skip

### When to End a Scene

End a scene when:
- The immediate goal is achieved or abandoned
- The party leaves the location
- A natural narrative pause occurs
- The mood/stakes shift significantly
- You want to mark a chapter break

### Scene Lifecycle

```
┌─────────────────┐
│ Create Scene    │
│ (auto-unlocked) │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Scene Available │
│ (can be started)│
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Scene Active    │◄──── Events occur (turns)
│ (current scene) │
└────────┬────────┘
         │
    ┌────┴────┐
    │         │
    ▼         ▼
┌───────┐ ┌───────────┐
│Complete│ │  Abandon  │
└───────┘ └───────────┘
```

### Freeform Mode

Games can run without scenes - the feature is optional. When no scene is active:
- All turn-based functionality works normally
- AI doesn't receive scene context
- Scenes can be added later retroactively

### Managing Connections

Use connections to:
- Define obvious paths (type: `path`)
- Create gated content (type: `conditional`)
- Add surprises (type: `hidden`)
- Create dramatic moments (type: `one-way`)
- Enable flashbacks/teleportation (type: `teleport`)

### Tips for Effective Scene Management

1. **Don't over-segment**: 5-20 turns per scene is typical
2. **Name scenes memorably**: "The Bridge Ambush" not "Scene 7"
3. **Set mood early**: Establish tone in the first turn
4. **Adjust stakes dynamically**: Update if situation changes
5. **Use connections sparingly**: Not every scene needs connections
6. **Trust the AI**: Scene context improves generation quality

---

## Developer Guide

### Using SceneManager

The `SceneManager` is the primary service for scene operations:

```typescript
import { SceneManager } from './services/scene/scene-manager.js';

const sceneManager = new SceneManager({
  sceneRepo,
  availabilityRepo,
  connectionRepo,
  gameRepo,
  eventEmitter,  // Optional
});

// Create a scene
const scene = sceneManager.createScene({
  gameId,
  turn: currentTurn,
  name: 'The Final Confrontation',
  sceneType: 'climax',
  mood: 'tense',
  stakes: 'Everything',
});

// Start a scene
const started = sceneManager.startScene({
  gameId,
  sceneId: scene.id,
  turn: currentTurn,
});

// Complete a scene
const completed = sceneManager.completeScene({
  gameId,
  sceneId: scene.id,
  turn: currentTurn,
});

// Get available scenes
const available = sceneManager.getAvailableScenes(gameId);

// Get scene summary
const summary = sceneManager.getSceneSummary(gameId, sceneId);

// Get current scene
const current = sceneManager.getCurrentScene(gameId);

// Get connected scenes
const connected = sceneManager.getConnectedScenes(gameId, sceneId);

// Evaluate requirements
const canTraverse = sceneManager.evaluateRequirements(requirements, context);
```

### Event Emission

SceneManager emits events for system integration:

```typescript
type SceneEvent =
  | { type: 'scene:created'; scene: Scene }
  | { type: 'scene:started'; scene: Scene; gameId: string }
  | { type: 'scene:completed'; scene: Scene; gameId: string }
  | { type: 'scene:abandoned'; scene: Scene; gameId: string };

const sceneManager = new SceneManager({
  // ...repos...
  eventEmitter: {
    emit(event) {
      switch (event.type) {
        case 'scene:created':
          // Notify UI of new scene
          break;
        case 'scene:started':
          // Update game state, notify players
          break;
        case 'scene:completed':
          // Check for unlocked connections
          break;
        case 'scene:abandoned':
          // Handle early exit
          break;
      }
    },
  },
});
```

### Integration with GameEngine

```typescript
// In game-engine
async processAction(gameId: string, action: PlayerAction) {
  const game = await this.gameRepo.findById(gameId);
  const currentScene = await this.sceneManager.getCurrentScene(gameId);

  // Include scene context in content generation
  const content = await this.contentPipeline.generate({
    gameId,
    action,
    sceneContext: currentScene ? {
      name: currentScene.name,
      type: currentScene.sceneType,
      mood: currentScene.mood,
      stakes: currentScene.stakes,
    } : null,
  });

  return content;
}
```

### Integration with ContextBuilder

```typescript
// In context-builder
async buildContext(gameId: string): Promise<GenerationContext> {
  const currentScene = await this.sceneManager.getCurrentScene(gameId);
  const availableScenes = await this.sceneManager.getAvailableScenes(gameId);

  return {
    // ...existing context...

    currentScene: currentScene ? {
      name: currentScene.name,
      type: currentScene.sceneType,
      mood: currentScene.mood,
      stakes: currentScene.stakes,
      turnCount: await this.countTurnsInScene(currentScene),
    } : null,

    availableScenes: availableScenes.map(s => ({
      id: s.id,
      name: s.name,
      type: s.sceneType,
    })),
  };
}
```

### AI Prompt Integration

Include scene context in AI prompts:

```
## Current Scene

You are in scene: "The Merchant's Dilemma"
- Type: social
- Mood: tense
- Stakes: The merchant's cooperation
- Events so far: 8

Maintain consistency with the tense mood. Focus on dialogue and
relationship dynamics. The stakes involve gaining or losing the
merchant's willingness to help.

## Available Transitions

If this scene concludes, these paths are available:
- "The Back Alley" (hidden, requires: trust > 0.6)
- "The Market Square" (path)
```

### Extending Scene Types

Add custom scene types by extending the UI dropdown and documenting them:

```typescript
// In scene-panel.ts or a constants file
const SCENE_TYPES = [
  // Standard
  { value: 'exploration', label: 'Exploration' },
  { value: 'combat', label: 'Combat' },
  { value: 'social', label: 'Social' },
  { value: 'puzzle', label: 'Puzzle' },
  { value: 'rest', label: 'Rest' },
  { value: 'transition', label: 'Transition' },
  // Narrative
  { value: 'exposition', label: 'Exposition' },
  { value: 'confrontation', label: 'Confrontation' },
  { value: 'revelation', label: 'Revelation' },
  { value: 'climax', label: 'Climax' },
  // Custom for your game
  { value: 'flashback', label: 'Flashback' },
  { value: 'dream', label: 'Dream Sequence' },
];
```

### Testing Scenes

```typescript
import { SceneManager } from './services/scene/scene-manager.js';

describe('SceneManager', () => {
  it('should create and start a scene', () => {
    const scene = sceneManager.createScene({
      gameId,
      turn: 1,
      name: 'Test Scene',
    });

    expect(scene.id).toBeDefined();
    expect(scene.status).toBe('active');

    const started = sceneManager.startScene({
      gameId,
      sceneId: scene.id,
      turn: 1,
    });

    expect(started.startedTurn).toBe(1);
  });

  it('should evaluate requirements correctly', () => {
    const requirements = {
      flags: ['key_found'],
      traits: ['brave'],
    };

    const passingContext = {
      flags: { key_found: true },
      playerTraits: ['brave', 'honorable'],
      relationships: [],
    };

    expect(sceneManager.evaluateRequirements(requirements, passingContext)).toBe(true);

    const failingContext = {
      flags: { key_found: false },
      playerTraits: ['brave'],
      relationships: [],
    };

    expect(sceneManager.evaluateRequirements(requirements, failingContext)).toBe(false);
  });
});
```

---

## Example Scene Flows

### Linear Story

A straightforward narrative with sequential scenes.

```
[Opening Scene] ──path──► [Tavern Meeting] ──path──► [Forest Journey]
                                                            │
                                                            ▼
                                                    [Cave Entrance]
                                                            │
                                                            ▼
                                                    [Final Chamber]
```

**Setup:**
```json
// Scene 1 → Scene 2
{ "connectionType": "path", "description": "After finishing drinks" }

// Scene 2 → Scene 3
{ "connectionType": "path", "description": "Heading into the forest" }
```

### Branching Path

Player choice determines which scene comes next.

```
                           ┌──conditional──► [Sneak In]
                           │                      │
[Outside the Castle] ──────┤                      │
                           │                      ▼
                           └──conditional──► [Storm Gate] ──► [Throne Room]
                                                  │
                                                  │
                                                  ▼
                                             [Dungeon]
```

**Setup:**
```json
// To "Sneak In" - requires stealth
{
  "connectionType": "conditional",
  "requirements": {
    "traits": ["cunning"],
    "relationships": [
      { "entityType": "npc", "entityId": "guard-captain", "dimension": "trust", "minValue": 0.6 }
    ]
  }
}

// To "Storm Gate" - requires strength
{
  "connectionType": "conditional",
  "requirements": {
    "flags": ["army_recruited"]
  }
}
```

### Hub and Spoke

A central location with multiple optional paths.

```
              ┌──path──► [Blacksmith]
              │
              ├──path──► [Temple]
              │
[Town Square] ┼──path──► [Tavern]
              │
              ├──hidden──► [Thieves Guild]
              │
              └──path──► [Main Road Out]
```

**Setup:**
```json
// Hidden path to Thieves Guild
{
  "connectionType": "hidden",
  "requirements": {
    "flags": ["secret_symbol_recognized"]
  },
  "description": "Only visible to those who know the sign"
}
```

### Point of No Return

A dramatic one-way transition.

```
[Preparation Scene] ──one-way──► [Final Battle]
        │
        │ (characters can prepare, gather allies, etc.)
        │
        └──path──► [Last Chance Shop]
```

**Setup:**
```json
// One-way to final battle
{
  "connectionType": "one-way",
  "description": "Once you cross, there's no turning back"
}
```

### Flashback Structure

Using teleport connections for non-linear storytelling.

```
[Present Day] ──teleport──► [10 Years Ago]
      ▲                           │
      │                           │
      └────────teleport───────────┘
```

**Setup:**
```json
// Teleport to flashback
{
  "connectionType": "teleport",
  "description": "Memory triggered by the old photograph"
}

// Return from flashback
{
  "connectionType": "teleport",
  "description": "The memory fades, returning to present"
}
```

### Complex Adventure

A full adventure structure combining multiple patterns.

```
[Village Square] ──path──► [Forest Edge] ──conditional──► [Ancient Ruins]
       │                        │                              │
       │                        └──path──► [Bandit Camp]       │
       │                                        │              │
       └──hidden──► [Secret Cave]               │              │
                         │                      │              │
                         ▼                      ▼              ▼
                    [Underground] ──path──► [River Crossing] ──path──► [Mountain Pass]
                                                                           │
                                                                    one-way│
                                                                           ▼
                                                                    [Dragon's Lair]
                                                                           │
                                                                           ▼
                                                                    [Ending Scene]
```

This structure allows:
- Multiple paths to the same destination
- Optional content (Secret Cave)
- Gated content (Ancient Ruins requires a key)
- Dramatic climax (one-way to Dragon's Lair)

---

## Quick Reference

### Scene Creation Checklist

- [ ] Meaningful name
- [ ] Appropriate scene type
- [ ] Mood that matches the tone
- [ ] Stakes that clarify what matters
- [ ] Optional: description for context
- [ ] Optional: location reference

### Connection Planning Checklist

- [ ] Source and destination scenes exist
- [ ] Appropriate connection type
- [ ] Requirements are achievable
- [ ] Description helps DM remember purpose
- [ ] No accidental self-connections

### API Quick Reference

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/scene/:gameId` | GET | List scenes |
| `/api/scene/:gameId` | POST | Create scene |
| `/api/scene/:gameId/available` | GET | List available |
| `/api/scene/:gameId/current` | GET | Get current |
| `/api/scene/:gameId/:sceneId` | GET | Get details |
| `/api/scene/:gameId/:sceneId/start` | POST | Start scene |
| `/api/scene/:gameId/:sceneId/complete` | POST | Complete scene |
| `/api/scene/:gameId/connections` | GET | List connections |
| `/api/scene/:gameId/connections` | POST | Create connection |
