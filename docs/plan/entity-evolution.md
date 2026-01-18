# Phase A: Entity Evolution

## Goal

Track how entities (characters, NPCs, locations) evolve through play via traits and relationships.

## Why This First?

Entity evolution enables:
- Richer AI context (knowing a character is "haunted" changes generation)
- Emergent narrative (resentful NPCs can become villains)
- The Pattern Engine pillar (detect and challenge player patterns)
- Foundation for Phases B and C

## Database Schema

### New Tables

```sql
-- Tracks traits acquired by entities
CREATE TABLE entity_traits (
  id TEXT PRIMARY KEY,
  game_id TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL,  -- 'player', 'character', 'npc', 'location'
  entity_id TEXT NOT NULL,
  trait TEXT NOT NULL,
  acquired_turn INTEGER NOT NULL,
  source_event_id TEXT REFERENCES events(id),
  status TEXT NOT NULL DEFAULT 'active',  -- 'active', 'faded', 'removed'
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,

  UNIQUE(game_id, entity_type, entity_id, trait)
);

CREATE INDEX idx_entity_traits_entity ON entity_traits(game_id, entity_type, entity_id);
CREATE INDEX idx_entity_traits_trait ON entity_traits(game_id, trait);

-- Tracks multi-dimensional relationships between entities
CREATE TABLE relationships (
  id TEXT PRIMARY KEY,
  game_id TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  from_type TEXT NOT NULL,
  from_id TEXT NOT NULL,
  to_type TEXT NOT NULL,
  to_id TEXT NOT NULL,

  -- Dimensions (0.0 to 1.0)
  trust REAL NOT NULL DEFAULT 0.5,
  respect REAL NOT NULL DEFAULT 0.5,
  affection REAL NOT NULL DEFAULT 0.5,
  fear REAL NOT NULL DEFAULT 0.0,
  resentment REAL NOT NULL DEFAULT 0.0,
  debt REAL NOT NULL DEFAULT 0.0,

  updated_turn INTEGER NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,

  UNIQUE(game_id, from_type, from_id, to_type, to_id)
);

CREATE INDEX idx_relationships_from ON relationships(game_id, from_type, from_id);
CREATE INDEX idx_relationships_to ON relationships(game_id, to_type, to_id);

-- Pending evolution suggestions for DM review
CREATE TABLE pending_evolutions (
  id TEXT PRIMARY KEY,
  game_id TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  turn INTEGER NOT NULL,
  evolution_type TEXT NOT NULL,  -- 'trait_add', 'trait_remove', 'relationship_change'
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,

  -- For traits
  trait TEXT,

  -- For relationships
  target_type TEXT,
  target_id TEXT,
  dimension TEXT,
  old_value REAL,
  new_value REAL,

  reason TEXT NOT NULL,  -- AI-generated explanation
  source_event_id TEXT REFERENCES events(id),
  status TEXT NOT NULL DEFAULT 'pending',  -- 'pending', 'approved', 'edited', 'refused'
  dm_notes TEXT,

  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  resolved_at DATETIME
);

CREATE INDEX idx_pending_evolutions_game ON pending_evolutions(game_id, status);
```

### Trait Catalog Table (Optional)

```sql
-- Predefined trait vocabulary
CREATE TABLE trait_catalog (
  trait TEXT PRIMARY KEY,
  category TEXT NOT NULL,  -- 'moral', 'emotional', 'capability', 'reputation'
  description TEXT,
  opposites TEXT  -- JSON array of opposing traits
);

-- Seed data
INSERT INTO trait_catalog (trait, category, description, opposites) VALUES
  ('honorable', 'moral', 'Keeps promises, fights fairly', '["ruthless", "deceitful"]'),
  ('ruthless', 'moral', 'Will do anything to achieve goals', '["honorable", "merciful"]'),
  ('merciful', 'moral', 'Shows compassion to enemies', '["ruthless", "cruel"]'),
  ('pragmatic', 'moral', 'Prioritizes practical outcomes', '["idealistic"]'),
  ('idealistic', 'moral', 'Holds to principles despite cost', '["pragmatic", "corruptible"]'),
  ('corruptible', 'moral', 'Can be swayed from principles', '["idealistic", "honorable"]'),

  ('haunted', 'emotional', 'Troubled by past events', '["serene"]'),
  ('hopeful', 'emotional', 'Believes in positive outcomes', '["bitter", "cynical"]'),
  ('bitter', 'emotional', 'Resentful of past wrongs', '["hopeful", "serene"]'),
  ('serene', 'emotional', 'At peace despite circumstances', '["volatile", "haunted"]'),
  ('volatile', 'emotional', 'Prone to sudden emotional shifts', '["serene", "guarded"]'),
  ('guarded', 'emotional', 'Keeps emotions hidden', '["volatile"]'),

  ('battle-hardened', 'capability', 'Experienced in combat', '["naive"]'),
  ('scholarly', 'capability', 'Well-read and knowledgeable', NULL),
  ('street-wise', 'capability', 'Knows how to survive', '["naive"]'),
  ('naive', 'capability', 'Inexperienced with the world', '["street-wise", "battle-hardened"]'),
  ('cunning', 'capability', 'Clever and strategic', NULL),
  ('broken', 'capability', 'Damaged by experiences', NULL),

  ('feared', 'reputation', 'Others are afraid', '["beloved"]'),
  ('beloved', 'reputation', 'Others feel affection', '["feared", "notorious"]'),
  ('notorious', 'reputation', 'Known for bad deeds', '["beloved", "mysterious"]'),
  ('mysterious', 'reputation', 'Little is known about them', '["notorious", "legendary"]'),
  ('disgraced', 'reputation', 'Fallen from honor', '["legendary"]'),
  ('legendary', 'reputation', 'Known for great deeds', '["disgraced", "mysterious"]');
```

## Services

### TraitRepository

```typescript
// packages/server/src/db/repositories/trait-repository.ts

export class TraitRepository {
  constructor(private db: Database) {}

  async addTrait(params: {
    gameId: string;
    entityType: EntityType;
    entityId: string;
    trait: string;
    turn: number;
    sourceEventId?: string;
  }): Promise<EntityTrait> {
    // Insert trait, handle conflict (already has trait)
  }

  async removeTrait(params: {
    gameId: string;
    entityType: EntityType;
    entityId: string;
    trait: string;
  }): Promise<void> {
    // Set status to 'removed'
  }

  async findByEntity(
    gameId: string,
    entityType: EntityType,
    entityId: string
  ): Promise<EntityTrait[]> {
    // Get active traits for entity
  }

  async findByTrait(gameId: string, trait: string): Promise<EntityTrait[]> {
    // Find all entities with this trait
  }

  async getTraitHistory(
    gameId: string,
    entityType: EntityType,
    entityId: string
  ): Promise<EntityTrait[]> {
    // All traits including faded/removed
  }
}
```

### RelationshipRepository

```typescript
// packages/server/src/db/repositories/relationship-repository.ts

export class RelationshipRepository {
  constructor(private db: Database) {}

  async upsert(params: {
    gameId: string;
    fromType: EntityType;
    fromId: string;
    toType: EntityType;
    toId: string;
    dimensions: Partial<RelationshipDimensions>;
    turn: number;
  }): Promise<Relationship> {
    // Create or update relationship
  }

  async findBetween(
    gameId: string,
    entityA: { type: EntityType; id: string },
    entityB: { type: EntityType; id: string }
  ): Promise<Relationship | null> {
    // Get relationship in either direction
  }

  async findByEntity(
    gameId: string,
    entityType: EntityType,
    entityId: string
  ): Promise<Relationship[]> {
    // All relationships involving this entity
  }

  async findByThreshold(
    gameId: string,
    dimension: keyof RelationshipDimensions,
    threshold: number,
    comparison: 'gte' | 'lte'
  ): Promise<Relationship[]> {
    // Find relationships where dimension crosses threshold
  }
}
```

### EvolutionService

```typescript
// packages/server/src/services/evolution/index.ts

export class EvolutionService {
  constructor(
    private traitRepo: TraitRepository,
    private relationshipRepo: RelationshipRepository,
    private pendingRepo: PendingEvolutionRepository,
    private eventBus: EventBus
  ) {}

  // Called after AI generates content, extracts potential evolutions
  async detectEvolutions(
    gameId: string,
    event: GameEvent,
    aiSuggestions?: EvolutionSuggestion[]
  ): Promise<PendingEvolution[]> {
    const pending: PendingEvolution[] = [];

    // AI can suggest evolutions explicitly
    if (aiSuggestions) {
      for (const suggestion of aiSuggestions) {
        pending.push(await this.pendingRepo.create({
          gameId,
          turn: event.turn,
          ...suggestion,
          sourceEventId: event.id,
          status: 'pending',
        }));
      }
    }

    // System can also detect based on rules
    // (e.g., third mercy action → suggest 'merciful' trait)
    const systemDetected = await this.detectSystemEvolutions(gameId, event);
    pending.push(...systemDetected);

    return pending;
  }

  // DM approves a pending evolution
  async approve(pendingId: string, dmNotes?: string): Promise<void> {
    const pending = await this.pendingRepo.findById(pendingId);

    if (pending.evolutionType === 'trait_add') {
      await this.traitRepo.addTrait({
        gameId: pending.gameId,
        entityType: pending.entityType,
        entityId: pending.entityId,
        trait: pending.trait!,
        turn: pending.turn,
        sourceEventId: pending.sourceEventId,
      });
    } else if (pending.evolutionType === 'relationship_change') {
      await this.relationshipRepo.upsert({
        gameId: pending.gameId,
        fromType: pending.entityType,
        fromId: pending.entityId,
        toType: pending.targetType!,
        toId: pending.targetId!,
        dimensions: { [pending.dimension!]: pending.newValue! },
        turn: pending.turn,
      });
    }

    await this.pendingRepo.resolve(pendingId, 'approved', dmNotes);
    this.eventBus.emit('evolution:applied', pending);
  }

  // DM edits then approves
  async edit(pendingId: string, changes: Partial<PendingEvolution>): Promise<void> {
    await this.pendingRepo.update(pendingId, changes);
    await this.approve(pendingId);
  }

  // DM refuses
  async refuse(pendingId: string, dmNotes?: string): Promise<void> {
    await this.pendingRepo.resolve(pendingId, 'refused', dmNotes);
  }

  // Compute aggregate label for display
  computeAggregateLabel(rel: RelationshipDimensions): AggregateLabel {
    // High trust + high affection + high respect = devoted
    if (rel.trust > 0.7 && rel.affection > 0.7 && rel.respect > 0.6) {
      return 'devoted';
    }
    // High fear + high resentment = terrified (potential villain)
    if (rel.fear > 0.7 && rel.resentment > 0.5) {
      return 'terrified';
    }
    // High respect + high resentment = rival
    if (rel.respect > 0.5 && rel.resentment > 0.5) {
      return 'rival';
    }
    // ... more rules
    return 'indifferent';
  }
}
```

## Integration Points

### ContentPipeline Changes

```typescript
// In content-pipeline.ts

async generateContent(gameId: string, type: GenerationType): Promise<GeneratedContent> {
  // ... existing generation logic ...

  // NEW: Ask AI to suggest evolutions
  const evolutionSuggestions = await this.extractEvolutionSuggestions(aiResponse);

  // NEW: Detect and queue evolutions
  if (evolutionSuggestions.length > 0 || this.hasSignificantAction(aiResponse)) {
    await this.evolutionService.detectEvolutions(gameId, event, evolutionSuggestions);
  }

  return content;
}
```

### ContextBuilder Changes

```typescript
// In context-builder.ts

async buildContext(gameId: string): Promise<GenerationContext> {
  // ... existing context building ...

  // NEW: Add trait context
  const playerTraits = await this.traitRepo.findByEntity(gameId, 'player', playerId);
  const npcTraits = await this.getNpcTraitsInArea(gameId, areaId);

  // NEW: Add relationship context
  const relationships = await this.relationshipRepo.findByEntity(gameId, 'player', playerId);

  return {
    ...existingContext,
    playerTraits: playerTraits.map(t => t.trait),
    npcContext: npcs.map(npc => ({
      ...npc,
      traits: npcTraits[npc.id] || [],
      relationshipToPlayer: this.formatRelationship(relationships.find(r =>
        r.toType === 'npc' && r.toId === npc.id
      )),
    })),
  };
}
```

### DM Editor Integration

Pending evolutions appear in the DM editor alongside narrative content:

```typescript
// New editor state field
interface EditorState {
  // ... existing fields ...
  pendingEvolutions: PendingEvolution[];
}

// DM can approve/edit/refuse each evolution independently of narrative
```

## AI Prompt Changes

Add to generation prompts:

```
## Character Context

The player character has these traits: [traits]

NPCs in this scene:
- [NPC name]: [traits], [relationship label] toward player
  - Trust: [value], Respect: [value], Fear: [value], etc.

## Evolution Suggestions

If this scene involves significant character moments, suggest trait or relationship changes:

{
  "evolutions": [
    {
      "type": "trait_add",
      "entity": "player",
      "trait": "merciful",
      "reason": "Spared the wounded enemy despite tactical disadvantage"
    },
    {
      "type": "relationship_change",
      "from": "npc:guard_captain",
      "to": "player",
      "dimension": "respect",
      "change": +0.2,
      "reason": "Witnessed player's honorable combat"
    }
  ]
}
```

## Tasks

### Database
- [ ] Create migration for `entity_traits` table
- [ ] Create migration for `relationships` table
- [ ] Create migration for `pending_evolutions` table
- [ ] Create migration for `trait_catalog` table with seed data

### Repositories
- [ ] Implement TraitRepository
- [ ] Implement RelationshipRepository
- [ ] Implement PendingEvolutionRepository
- [ ] Add repository tests

### Services
- [ ] Implement EvolutionService
- [ ] Implement aggregate label computation
- [ ] Add system evolution detection rules
- [ ] Add service tests

### Integration
- [ ] Update ContentPipeline to detect evolutions
- [ ] Update ContextBuilder to include traits/relationships
- [ ] Update AI prompts for evolution suggestions
- [ ] Update EditorState to include pending evolutions

### API
- [ ] Add GET /api/game/:id/evolutions (pending)
- [ ] Add POST /api/game/:id/evolutions/:eid/approve
- [ ] Add POST /api/game/:id/evolutions/:eid/edit
- [ ] Add POST /api/game/:id/evolutions/:eid/refuse
- [ ] Add GET /api/game/:id/traits/:entityType/:entityId
- [ ] Add GET /api/game/:id/relationships/:entityType/:entityId

### Client
- [ ] Add evolution review UI in DM editor
- [ ] Add trait display for entities
- [ ] Add relationship display (optional, DM-only)

## Acceptance Criteria

- [ ] Traits can be added to any entity (player, NPC, location)
- [ ] Relationships track 6 dimensions between entities
- [ ] AI suggests evolutions during content generation
- [ ] DM can approve, edit, or refuse pending evolutions
- [ ] Context builder includes traits and relationships for AI
- [ ] Aggregate labels computed correctly from dimensions
- [ ] All existing functionality continues to work
