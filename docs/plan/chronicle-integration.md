# Chronicle Integration Plan

## Overview

Chronicle represents a set of narrative engine capabilities that Reckoning will adopt incrementally. Rather than building Chronicle as a separate WASM module, we'll evolve Reckoning's existing systems toward Chronicle's vision.

**Approach**: Build Chronicle concepts directly into Reckoning, with the option to extract as a standalone library later if there's demand.

## Why Evolutionary?

Reckoning already has a solid foundation:
- SQLite with events, areas, characters, NPCs
- GameEngine orchestrating content generation
- StateManager with event commitment and broadcasting
- DM editor workflow

Building a separate WASM module would require complex integration for minimal benefit. Instead, we'll enhance what exists.

## Chronicle Concepts → Reckoning Features

| Chronicle Concept | Reckoning Implementation |
|-------------------|-------------------------|
| Entity Evolution | New tables + EvolutionService |
| Structured Events | Enhanced events table + EventBuilder |
| Story Graph | New scenes table + SceneGraph service |
| Relationship Tracking | New relationships table + queries |
| Query Layer | Repository methods + ContextBuilder enhancements |
| Export Layer | Future: TOML/JSON export for Git persistence |

## Implementation Phases

### Phase A: Trait & Relationship Foundation
**Goal**: Track how entities evolve through play.

Add:
- `entity_traits` table (entity_type, entity_id, trait, acquired_turn, source_event_id)
- `relationships` table (from_type, from_id, to_type, to_id, dimension, value, updated_turn)
- EvolutionService for trait/relationship management
- DM approval flow for suggested evolutions

See: [Entity Evolution](./entity-evolution.md)

### Phase B: Structured Events
**Goal**: Enable queryable event patterns for AI context.

Enhance:
- Extend `events` table with structured fields (action, actor, targets, witnesses, tags)
- EventBuilder service to construct events from AI output
- Query methods for pattern detection (mercy count, betrayal history, etc.)
- Background observers for emergence detection

See: [Structured Events](./structured-events.md)

### Phase C: Narrative Structure
**Goal**: Group turns into scenes with optional branching.

Add:
- `scenes` table (id, game_id, name, status, started_turn, completed_turn)
- `scene_connections` table (from_scene, to_scene, requirements)
- SceneManager service
- Scene-based context for AI generation

See: [Narrative Structure](./narrative-structure.md)

### Phase D: Export Layer (Backlog)
**Goal**: Git-diffable game state for persistence and sharing.

Future:
- Export game state as TOML/JSON files
- Import capability for loading exported games
- Optional Git commit on save
- Comic/transcript generation from exported state

## How Evolution Maps to the Four Pillars

| Reckoning Pillar | Implementation |
|------------------|----------------|
| **Unreliable Self** | Traits visible to DM, hidden from player; AI interprets differently per character |
| **History as Text** | Events table as source of truth; derived state (traits, relationships) computed |
| **Pattern Engine** | Structured event queries; background observers detect player patterns |
| **Living Chronicle & Trial** | Relationship tracking enables emergent villains; scene structure supports narrative arcs |

## Entity Evolution Design

### Predefined Trait Catalog

Traits come from a predefined vocabulary (expandable over time):

**Moral Compass**: honorable, ruthless, merciful, pragmatic, idealistic, corruptible
**Emotional State**: haunted, hopeful, bitter, serene, volatile, guarded
**Capability/Growth**: battle-hardened, scholarly, street-wise, naive, cunning, broken
**Reputation**: feared, beloved, notorious, mysterious, disgraced, legendary

### Multi-Dimensional Relationships

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

### DM Approval Flow

```
Game Event → System Detects Evolution → Pending Queue → DM Reviews
                                                           │
                                               ┌───────────┼───────────┐
                                               ▼           ▼           ▼
                                           [Approve]   [Edit]     [Refuse]
```

Integrates with existing DM editor pattern.

## Structured Events Design

### Event Structure

```typescript
interface StructuredEvent {
  id: string;
  game_id: string;
  turn: number;
  timestamp: string;

  // Structured fields (Phase B additions)
  event_type: EventType;
  action: string;           // "spare_enemy", "steal_item", "enter_location"
  actor_type: EntityType;
  actor_id: string;
  target_type?: EntityType;
  target_id?: string;
  location_id: string;
  witnesses: string[];      // JSON array of entity refs
  tags: string[];           // JSON array for flexible categorization

  // Existing fields
  content: string;          // Narrative text
  speaker?: string;
  original_generated?: string;
}

enum EventType {
  PlayerChoice = 'player_choice',
  PlayerAction = 'player_action',
  NPCAction = 'npc_action',
  Dialogue = 'dialogue',
  WorldEvent = 'world_event',
  Discovery = 'discovery',
  Combat = 'combat',
}
```

### Query Patterns

```typescript
// Count merciful actions
const mercyCount = await eventRepo.countByActions(gameId, [
  'spare_enemy', 'show_mercy', 'forgive'
]);

// Get events involving an NPC
const npcHistory = await eventRepo.findByEntity(gameId, 'npc', npcId);

// Find witnesses to betrayals
const witnesses = await eventRepo.findWitnessesOf(gameId, ['betray', 'deceive']);
```

## Background Observers

### Emergence Observer

Monitors for emergent narrative opportunities:

```typescript
class EmergenceObserver {
  async onEventCommitted(event: StructuredEvent) {
    // Check relationship thresholds
    const relationships = await relationshipRepo.findByEntity(
      event.actor_type, event.actor_id
    );

    for (const rel of relationships) {
      if (rel.resentment >= 0.6 && rel.respect >= 0.4) {
        // Respected but resentful - rival potential
        await this.proposeRivalArc(rel);
      }
      if (rel.fear >= 0.7 && rel.resentment >= 0.5) {
        // Terrified and resentful - villain potential
        await this.proposeVillainEmergence(rel);
      }
    }
  }
}
```

### Pattern Observer

Tracks player behavioral patterns:

```typescript
class PatternObserver {
  async getPlayerPatterns(gameId: string): Promise<PlayerPatterns> {
    const events = await eventRepo.findByActorType(gameId, 'player');

    return {
      mercyRatio: this.calculateRatio(events, ['spare', 'mercy'], ['kill', 'execute']),
      honestyRatio: this.calculateRatio(events, ['truth', 'confess'], ['lie', 'deceive']),
      violenceFirst: this.calculateInitiationPattern(events, 'combat'),
      // ... more patterns
    };
  }
}
```

## Context Building Enhancement

```typescript
async function buildGenerationContext(gameId: string): Promise<Context> {
  const game = await gameRepo.findById(gameId);
  const recentEvents = await eventRepo.getRecent(gameId, 10);
  const area = await areaRepo.findById(game.currentAreaId);

  // Phase A additions
  const playerTraits = await traitRepo.findByEntity('player', game.playerId);
  const npcRelationships = await relationshipRepo.findInvolving('player', game.playerId);

  // Phase B additions
  const patterns = await patternObserver.getPlayerPatterns(gameId);
  const pendingEvolutions = await evolutionRepo.getPending(gameId);

  return {
    game,
    area,
    recentEvents,
    playerTraits,
    relationships: npcRelationships.map(r => ({
      with: r.toName,
      label: computeAggregateLabel(r),
      dimensions: r,
    })),
    patterns,
    pendingEvolutions,
  };
}
```

## Migration Strategy

Each phase is **additive** - no breaking changes to existing functionality:

1. **Phase A**: Add new tables, new service. Existing code unchanged.
2. **Phase B**: Add columns to events table (nullable), new service. Existing events still work.
3. **Phase C**: Add new tables for scenes. Scenes are optional - games work without them.

## Open Questions

1. **Evolution rules**: Should rules be generated with the world, or use a standard set?
2. **Trait limits**: How many traits can an entity have? Should old traits fade?
3. **Relationship decay**: Do relationships drift toward neutral over time without interaction?
4. **Scene auto-detection**: Can we infer scene boundaries from events, or must DM mark them?

## Related Documents

- [Entity Evolution](./entity-evolution.md)
- [Structured Events](./structured-events.md)
- [Narrative Structure](./narrative-structure.md)
- [Export Layer](./export-layer.md)
- [Chronicle Vision](ssh://git@git.lan/stiwi/chronicle.git/docs/product.md) - Long-term vision

## Task Breakdown

See [tasks/](./tasks/) for detailed task breakdowns with dependencies:
- [tasks/entity-evolution.md](./tasks/entity-evolution.md)
- [tasks/structured-events.md](./tasks/structured-events.md)
- [tasks/narrative-structure.md](./tasks/narrative-structure.md)
- [tasks/export-layer.md](./tasks/export-layer.md)
