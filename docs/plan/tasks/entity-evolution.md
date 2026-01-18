# Epic: Entity Evolution

Track how entities (characters, NPCs, locations) evolve through play via traits and relationships.

## Overview

| Field | Value |
|-------|-------|
| **Epic ID** | entity-evolution |
| **Prefix** | EVOL |
| **Status** | Planning |
| **Dependencies** | None (foundation epic) |
| **Blocked By** | None |

## Task Dependency Graph

```
EVOL-001 ─────────────────────────────────────────────────────────────────┐
(entity_traits migration)                                                  │
    │                                                                      │
    ▼                                                                      │
EVOL-002                                                                   │
(relationships migration)                                                  │
    │                                                                      │
    ▼                                                                      │
EVOL-003                                                                   │
(pending_evolutions migration)                                             │
    │                                                                      │
    ▼                                                                      │
EVOL-004                                                                   │
(trait_catalog migration + seed)                                           │
    │                                                                      │
    ├───────────────────┬───────────────────┐                             │
    ▼                   ▼                   ▼                              │
EVOL-005            EVOL-006            EVOL-007                          │
(TraitRepo)         (RelationshipRepo)  (PendingEvolutionRepo)            │
    │                   │                   │                              │
    └───────────────────┴───────────────────┘                             │
                        │                                                  │
                        ▼                                                  │
                    EVOL-008                                               │
                    (EvolutionService)                                     │
                        │                                                  │
            ┌───────────┴───────────┐                                     │
            ▼                       ▼                                      │
        EVOL-009                EVOL-010                                   │
        (aggregate labels)      (system detection)                         │
            │                       │                                      │
            └───────────────────────┘                                     │
                        │                                                  │
                        ▼                                                  │
                    EVOL-011                                               │
                    (ContentPipeline integration)                          │
                        │                                                  │
                        ▼                                                  │
                    EVOL-012                                               │
                    (ContextBuilder integration)                           │
                        │                                                  │
                        ▼                                                  │
                    EVOL-013                                               │
                    (API routes)                                           │
                        │                                                  │
                        ▼                                                  │
                    EVOL-014                                               │
                    (DM approval UI)                                       │
                        │                                                  │
                        ▼                                                  │
                    EVOL-015 ◄─────────────────────────────────────────────┘
                    (documentation)
```

---

## Tasks

### EVOL-001: Create entity_traits table migration

**Status**: todo
**Dependencies**: none
**Blocked By**: none

#### Description
Create SQLite migration for the `entity_traits` table that stores traits acquired by entities during gameplay.

#### Acceptance Criteria
- [ ] Migration file created in `packages/server/src/db/migrations/`
- [ ] Table has columns: id, game_id, entity_type, entity_id, trait, acquired_turn, source_event_id, status, created_at
- [ ] Foreign key to games(id) with CASCADE delete
- [ ] Foreign key to events(id) for source_event_id (nullable)
- [ ] Unique constraint on (game_id, entity_type, entity_id, trait)
- [ ] Indexes on (game_id, entity_type, entity_id) and (game_id, trait)
- [ ] Migration runs successfully on fresh database
- [ ] Migration is reversible

#### Technical Notes
```sql
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
```

#### Tests Required
- Migration applies without error
- Migration rollback works
- Constraints enforce correctly (duplicate trait rejected, cascade delete works)

---

### EVOL-002: Create relationships table migration

**Status**: todo
**Dependencies**: EVOL-001
**Blocked By**: none

#### Description
Create SQLite migration for the `relationships` table that tracks multi-dimensional relationships between entities.

#### Acceptance Criteria
- [ ] Migration file created
- [ ] Table has columns: id, game_id, from_type, from_id, to_type, to_id, trust, respect, affection, fear, resentment, debt, updated_turn, created_at, updated_at
- [ ] All dimension columns default to appropriate values (0.5 for positive, 0.0 for negative)
- [ ] Dimension values constrained to 0.0-1.0 range (CHECK constraint)
- [ ] Unique constraint on (game_id, from_type, from_id, to_type, to_id)
- [ ] Indexes on from and to entity columns
- [ ] Migration runs successfully

#### Technical Notes
Dimensions:
- trust, respect, affection: default 0.5 (neutral)
- fear, resentment, debt: default 0.0 (none)

#### Tests Required
- Migration applies without error
- CHECK constraint rejects values outside 0.0-1.0
- Unique constraint prevents duplicate relationships

---

### EVOL-003: Create pending_evolutions table migration

**Status**: todo
**Dependencies**: EVOL-002
**Blocked By**: none

#### Description
Create SQLite migration for the `pending_evolutions` table that queues evolution suggestions for DM review.

#### Acceptance Criteria
- [ ] Migration file created
- [ ] Table has columns for both trait and relationship evolutions
- [ ] Status field tracks: pending, approved, edited, refused
- [ ] Foreign keys to games and events tables
- [ ] Index on (game_id, status) for efficient pending queries
- [ ] Migration runs successfully

#### Technical Notes
This table stores both trait additions/removals and relationship changes. The `evolution_type` field determines which columns are relevant.

#### Tests Required
- Migration applies without error
- Can store both trait and relationship evolutions
- Status transitions work correctly

---

### EVOL-004: Create trait_catalog table with seed data

**Status**: todo
**Dependencies**: EVOL-003
**Blocked By**: none

#### Description
Create SQLite migration for the `trait_catalog` table and seed it with the predefined trait vocabulary.

#### Acceptance Criteria
- [ ] Migration creates trait_catalog table
- [ ] Table has: trait (PK), category, description, opposites (JSON)
- [ ] Seed data includes all traits from 4 categories:
  - Moral: honorable, ruthless, merciful, pragmatic, idealistic, corruptible
  - Emotional: haunted, hopeful, bitter, serene, volatile, guarded
  - Capability: battle-hardened, scholarly, street-wise, naive, cunning, broken
  - Reputation: feared, beloved, notorious, mysterious, disgraced, legendary
- [ ] Each trait has description and opposites array
- [ ] Migration runs successfully

#### Technical Notes
The trait catalog is reference data, not per-game data. It defines the vocabulary available for entity_traits.

#### Tests Required
- Migration applies without error
- All 24 traits seeded correctly
- Can query traits by category
- Opposites stored as valid JSON arrays

---

### EVOL-005: Implement TraitRepository

**Status**: todo
**Dependencies**: EVOL-004
**Blocked By**: none

#### Description
Implement the TraitRepository class for CRUD operations on entity traits.

#### Acceptance Criteria
- [ ] Class created at `packages/server/src/db/repositories/trait-repository.ts`
- [ ] Methods implemented:
  - `addTrait(params)`: Add trait to entity, handle duplicate gracefully
  - `removeTrait(params)`: Set status to 'removed'
  - `findByEntity(gameId, entityType, entityId)`: Get active traits
  - `findByTrait(gameId, trait)`: Find all entities with trait
  - `getTraitHistory(gameId, entityType, entityId)`: All traits including removed
  - `getTraitCatalog(category?)`: Get available traits
- [ ] TypeScript types defined for all inputs/outputs
- [ ] Exported from repository index

#### Technical Notes
Use the existing repository pattern from other repositories in the codebase.

#### Tests Required
- Unit tests for each method
- Test duplicate trait handling (upsert behavior)
- Test status transitions (active → removed)
- Test trait catalog queries

---

### EVOL-006: Implement RelationshipRepository

**Status**: todo
**Dependencies**: EVOL-004
**Blocked By**: none

#### Description
Implement the RelationshipRepository class for CRUD operations on entity relationships.

#### Acceptance Criteria
- [ ] Class created at `packages/server/src/db/repositories/relationship-repository.ts`
- [ ] Methods implemented:
  - `upsert(params)`: Create or update relationship
  - `findBetween(gameId, entityA, entityB)`: Get relationship in either direction
  - `findByEntity(gameId, entityType, entityId)`: All relationships involving entity
  - `findByThreshold(gameId, dimension, threshold, comparison)`: Find by dimension value
  - `updateDimension(id, dimension, value, turn)`: Update single dimension
- [ ] TypeScript types for RelationshipDimensions interface
- [ ] Exported from repository index

#### Technical Notes
Relationships are directional (A→B is different from B→A). `findBetween` should check both directions.

#### Tests Required
- Unit tests for each method
- Test upsert creates and updates correctly
- Test bidirectional lookup
- Test threshold queries (gte, lte)
- Test dimension value clamping (0.0-1.0)

---

### EVOL-007: Implement PendingEvolutionRepository

**Status**: todo
**Dependencies**: EVOL-004
**Blocked By**: none

#### Description
Implement the PendingEvolutionRepository class for managing evolution suggestions awaiting DM review.

#### Acceptance Criteria
- [ ] Class created at `packages/server/src/db/repositories/pending-evolution-repository.ts`
- [ ] Methods implemented:
  - `create(params)`: Create pending evolution
  - `findById(id)`: Get single pending evolution
  - `findPending(gameId)`: Get all pending for game
  - `resolve(id, status, dmNotes?)`: Mark as approved/edited/refused
  - `update(id, changes)`: Update pending evolution (for edits)
  - `deleteByGame(gameId)`: Clean up on game delete
- [ ] TypeScript types for PendingEvolution interface
- [ ] Exported from repository index

#### Technical Notes
Status flow: pending → approved/edited/refused. Once resolved, cannot be changed.

#### Tests Required
- Unit tests for each method
- Test status transitions
- Test that resolved evolutions cannot be re-resolved
- Test game cleanup cascades

---

### EVOL-008: Implement EvolutionService

**Status**: todo
**Dependencies**: EVOL-005, EVOL-006, EVOL-007
**Blocked By**: none

#### Description
Implement the core EvolutionService that coordinates trait and relationship management.

#### Acceptance Criteria
- [ ] Class created at `packages/server/src/services/evolution/index.ts`
- [ ] Constructor accepts TraitRepo, RelationshipRepo, PendingEvolutionRepo, EventBus
- [ ] Methods implemented:
  - `detectEvolutions(gameId, event, aiSuggestions?)`: Queue pending evolutions
  - `approve(pendingId, dmNotes?)`: Apply approved evolution
  - `edit(pendingId, changes)`: Edit and apply evolution
  - `refuse(pendingId, dmNotes?)`: Refuse evolution
  - `getEntitySummary(gameId, entityType, entityId)`: Get traits + relationships
- [ ] Emits events on evolution applied: 'evolution:trait_added', 'evolution:relationship_changed'
- [ ] TypeScript types exported

#### Technical Notes
This service is the main entry point for evolution operations. It coordinates between repositories and emits events for other parts of the system.

#### Tests Required
- Unit tests for each method
- Test approve flow (pending → applied)
- Test edit flow (pending → modified → applied)
- Test refuse flow (pending → refused)
- Test event emission
- Integration test with real database

---

### EVOL-009: Implement aggregate label computation

**Status**: todo
**Dependencies**: EVOL-008
**Blocked By**: none

#### Description
Implement the algorithm that computes human-readable relationship labels from numeric dimensions.

#### Acceptance Criteria
- [ ] Function `computeAggregateLabel(dimensions: RelationshipDimensions): AggregateLabel`
- [ ] Returns one of: devoted, allied, friendly, respectful, intimidated, rival, complicated, obligated, terrified, hostile, contemptuous, indifferent, ambivalent
- [ ] Rules documented in code comments
- [ ] Edge cases handled (all zeros, all maxed, etc.)
- [ ] Exported from evolution service

#### Technical Notes
Example rules:
- devoted: trust > 0.7 && affection > 0.7 && respect > 0.6
- terrified: fear > 0.7 && resentment > 0.5
- rival: respect > 0.5 && resentment > 0.5
- indifferent: all dimensions near 0.5 or 0.0

#### Tests Required
- Unit tests for each label condition
- Test edge cases (boundary values)
- Test that exactly one label is returned
- Test all dimensions at default values → indifferent

---

### EVOL-010: Implement system evolution detection

**Status**: todo
**Dependencies**: EVOL-008
**Blocked By**: none

#### Description
Implement rules-based evolution detection that suggests evolutions based on game events without AI input.

#### Acceptance Criteria
- [ ] Method `detectSystemEvolutions(gameId, event)` added to EvolutionService
- [ ] Detects trait suggestions based on repeated actions:
  - 3+ mercy actions → suggest 'merciful' trait
  - 3+ lethal actions → suggest 'ruthless' trait
  - 3+ deception actions → suggest pattern
- [ ] Detects relationship changes based on event targets:
  - Positive action toward NPC → increase appropriate dimensions
  - Negative action toward NPC → decrease trust, increase resentment
- [ ] Rules are configurable (not hardcoded thresholds)
- [ ] Returns array of PendingEvolution objects

#### Technical Notes
This runs after every event commit. Should be efficient - use cached action counts where possible.

#### Tests Required
- Unit tests for each detection rule
- Test threshold behavior (2 actions = no suggestion, 3 = suggestion)
- Test that suggestions don't duplicate existing traits
- Performance test with many events

---

### EVOL-011: Integrate EvolutionService with ContentPipeline

**Status**: todo
**Dependencies**: EVOL-010
**Blocked By**: none

#### Description
Update ContentPipeline to detect evolutions after AI generates content.

#### Acceptance Criteria
- [ ] ContentPipeline constructor accepts EvolutionService
- [ ] After content generation, call `evolutionService.detectEvolutions()`
- [ ] AI prompt updated to optionally suggest evolutions in response
- [ ] AI suggestions parsed from response metadata
- [ ] Pending evolutions created and queued for DM review
- [ ] Existing content generation flow unchanged

#### Technical Notes
AI can suggest evolutions in its response:
```json
{
  "narrative": "...",
  "evolutions": [
    { "type": "trait_add", "entity": "player", "trait": "merciful", "reason": "..." }
  ]
}
```

#### Tests Required
- Integration test: generate content → evolutions detected
- Test AI suggestions parsed correctly
- Test system detection runs alongside AI suggestions
- Test backward compatibility (old responses without evolutions)

---

### EVOL-012: Integrate EvolutionService with ContextBuilder

**Status**: todo
**Dependencies**: EVOL-011
**Blocked By**: none

#### Description
Update ContextBuilder to include traits and relationships in AI generation context.

#### Acceptance Criteria
- [ ] ContextBuilder constructor accepts TraitRepo, RelationshipRepo
- [ ] `buildContext()` includes:
  - Player traits array
  - NPC traits for NPCs in current area
  - Relationships involving player (with aggregate labels)
- [ ] Context formatted for AI consumption
- [ ] Pending evolutions optionally included
- [ ] Existing context fields unchanged

#### Technical Notes
Format for AI:
```
The player has traits: [merciful, haunted]
NPCs present:
- Guard Captain: [battle-hardened, honorable], rival toward player
```

#### Tests Required
- Unit test: context includes traits
- Unit test: context includes relationships with labels
- Integration test: full context build with evolution data
- Test empty traits/relationships handled gracefully

---

### EVOL-013: Add Evolution API routes

**Status**: todo
**Dependencies**: EVOL-012
**Blocked By**: none

#### Description
Add REST API routes for evolution management.

#### Acceptance Criteria
- [ ] Routes created at `packages/server/src/routes/evolution.ts`
- [ ] Endpoints implemented:
  - `GET /api/game/:id/evolutions` - List pending evolutions
  - `POST /api/game/:id/evolutions/:eid/approve` - Approve evolution
  - `POST /api/game/:id/evolutions/:eid/edit` - Edit and approve
  - `POST /api/game/:id/evolutions/:eid/refuse` - Refuse evolution
  - `GET /api/game/:id/traits/:entityType/:entityId` - Get entity traits
  - `GET /api/game/:id/relationships/:entityType/:entityId` - Get entity relationships
- [ ] Request/response validation with Zod schemas
- [ ] Error handling for not found, invalid state
- [ ] Routes registered in server

#### Technical Notes
Follow existing route patterns in the codebase for consistency.

#### Tests Required
- API tests for each endpoint
- Test authentication/authorization
- Test validation errors
- Test not found handling

---

### EVOL-014: Implement DM approval UI

**Status**: todo
**Dependencies**: EVOL-013
**Blocked By**: none

#### Description
Add UI components for DM to review and manage pending evolutions.

#### Acceptance Criteria
- [ ] Component created at `packages/client/src/components/dm/EvolutionApproval.tsx`
- [ ] Shows list of pending evolutions with:
  - Entity name and type
  - Evolution type (trait add, relationship change)
  - Suggested change and reason
  - Source event context
- [ ] Actions for each: Approve, Edit, Refuse
- [ ] Edit modal allows modifying the evolution
- [ ] Integrates with existing DM editor layout
- [ ] Real-time updates via SSE when evolutions added

#### Technical Notes
Should appear alongside narrative approval in DM editor, not as a separate view.

#### Tests Required
- Component renders pending evolutions
- Approve action calls API and updates UI
- Edit modal works correctly
- Refuse action works
- SSE updates reflected in UI

---

### EVOL-015: Write entity evolution documentation

**Status**: todo
**Dependencies**: EVOL-014
**Blocked By**: none

#### Description
Write comprehensive documentation for the entity evolution system.

#### Acceptance Criteria
- [ ] API documentation for all evolution endpoints
- [ ] Architecture documentation explaining:
  - Data model (traits, relationships, pending)
  - Service interactions
  - Event flow (generation → detection → approval → application)
- [ ] DM guide for using evolution features
- [ ] Developer guide for extending trait catalog
- [ ] Aggregate label rules documented
- [ ] Migration guide (if needed)

#### Technical Notes
Documentation should live in `docs/` and be linked from README.

#### Tests Required
- Documentation review for accuracy
- Code examples tested and working
- API docs match implementation

---

## Summary

| Task | Title | Dependencies |
|------|-------|--------------|
| EVOL-001 | Create entity_traits table migration | none |
| EVOL-002 | Create relationships table migration | EVOL-001 |
| EVOL-003 | Create pending_evolutions table migration | EVOL-002 |
| EVOL-004 | Create trait_catalog table with seed data | EVOL-003 |
| EVOL-005 | Implement TraitRepository | EVOL-004 |
| EVOL-006 | Implement RelationshipRepository | EVOL-004 |
| EVOL-007 | Implement PendingEvolutionRepository | EVOL-004 |
| EVOL-008 | Implement EvolutionService | EVOL-005, EVOL-006, EVOL-007 |
| EVOL-009 | Implement aggregate label computation | EVOL-008 |
| EVOL-010 | Implement system evolution detection | EVOL-008 |
| EVOL-011 | Integrate with ContentPipeline | EVOL-010 |
| EVOL-012 | Integrate with ContextBuilder | EVOL-011 |
| EVOL-013 | Add Evolution API routes | EVOL-012 |
| EVOL-014 | Implement DM approval UI | EVOL-013 |
| EVOL-015 | Write documentation | EVOL-014 |
