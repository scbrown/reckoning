# Epic: Structured Events

Enable queryable event patterns for AI context and emergence detection.

## Overview

| Field | Value |
|-------|-------|
| **Epic ID** | structured-events |
| **Prefix** | SEVT |
| **Status** | Planning |
| **Dependencies** | entity-evolution |
| **Blocked By** | EVOL-015 (entity-evolution complete) |

## Task Dependency Graph

```
                         [entity-evolution complete]
                                    │
                                    ▼
SEVT-001 ─────────────────────────────────────────────────────────────────┐
(events table migration)                                                   │
    │                                                                      │
    ▼                                                                      │
SEVT-002                                                                   │
(action vocabulary)                                                        │
    │                                                                      │
    ├───────────────────┬───────────────────┐                             │
    ▼                   ▼                   ▼                              │
SEVT-003            SEVT-004            SEVT-005                          │
(EventBuilder)      (ActionClassifier)  (EventRepo extensions)            │
    │                   │                   │                              │
    └───────────────────┴───────────────────┘                             │
                        │                                                  │
                        ▼                                                  │
                    SEVT-006                                               │
                    (PatternObserver)                                      │
                        │                                                  │
                        ▼                                                  │
                    SEVT-007                                               │
                    (EmergenceObserver)                                    │
                        │                                                  │
                        ▼                                                  │
                    SEVT-008                                               │
                    (ContentPipeline integration)                          │
                        │                                                  │
                        ▼                                                  │
                    SEVT-009                                               │
                    (ContextBuilder integration)                           │
                        │                                                  │
                        ▼                                                  │
                    SEVT-010                                               │
                    (API routes)                                           │
                        │                                                  │
                        ▼                                                  │
                    SEVT-011                                               │
                    (DM emergence notifications)                           │
                        │                                                  │
                        ▼                                                  │
                    SEVT-012 ◄─────────────────────────────────────────────┘
                    (documentation)
```

---

## Tasks

### SEVT-001: Extend events table with structured fields

**Status**: todo
**Dependencies**: entity-evolution epic complete
**Blocked By**: EVOL-015

#### Description
Add structured fields to the existing events table for queryable event data.

#### Acceptance Criteria
- [ ] Migration adds columns: event_type, action, actor_type, actor_id, target_type, target_id, witnesses (JSON), tags (JSON)
- [ ] All new columns are nullable (backward compatible)
- [ ] Indexes created on: (game_id, action), (game_id, actor_type, actor_id), (game_id, event_type)
- [ ] Existing events continue to work
- [ ] Migration runs successfully

#### Technical Notes
```sql
ALTER TABLE events ADD COLUMN event_type TEXT;
ALTER TABLE events ADD COLUMN action TEXT;
ALTER TABLE events ADD COLUMN actor_type TEXT;
ALTER TABLE events ADD COLUMN actor_id TEXT;
ALTER TABLE events ADD COLUMN target_type TEXT;
ALTER TABLE events ADD COLUMN target_id TEXT;
ALTER TABLE events ADD COLUMN witnesses TEXT;  -- JSON array
ALTER TABLE events ADD COLUMN tags TEXT;       -- JSON array
```

#### Tests Required
- Migration applies without error
- Existing events queryable after migration
- New columns accept JSON for witnesses/tags
- Indexes improve query performance

---

### SEVT-002: Define action vocabulary constants

**Status**: todo
**Dependencies**: SEVT-001
**Blocked By**: none

#### Description
Create TypeScript constants and types for standardized action vocabulary.

#### Acceptance Criteria
- [ ] File created at `packages/server/src/services/events/action-vocabulary.ts`
- [ ] EventType enum defined with all types
- [ ] Action string constants organized by category:
  - Mercy: spare_enemy, show_mercy, forgive, heal_enemy, release_prisoner
  - Violence: kill, execute, attack_first, threaten, torture
  - Honesty: tell_truth, confess, reveal_secret, keep_promise, lie, deceive, break_promise, withhold_info
  - Social: help, betray, befriend, insult, intimidate, persuade, bribe
  - Exploration: enter_location, examine, search, steal, unlock, destroy
  - Character: level_up, acquire_item, use_ability, rest
- [ ] Type for all valid actions (union type)
- [ ] Helper functions: `isActionInCategory(action, category)`, `getActionCategory(action)`
- [ ] Exported from package

#### Technical Notes
Actions should be lowercase, snake_case for consistency with database storage.

#### Tests Required
- All actions defined
- Category helpers work correctly
- Type checking prevents invalid actions

---

### SEVT-003: Implement EventBuilder service

**Status**: todo
**Dependencies**: SEVT-002
**Blocked By**: none

#### Description
Create EventBuilder service that constructs structured events from AI-generated content.

#### Acceptance Criteria
- [ ] Class created at `packages/server/src/services/events/event-builder.ts`
- [ ] Methods implemented:
  - `buildFromGeneration(params)`: Parse AI output into StructuredEvent
  - `determineActor(generationType, metadata)`: Identify actor from context
  - `extractTargets(content, metadata)`: Extract targets from narrative or metadata
  - `extractWitnesses(content, actor, targets)`: Find witnesses
  - `generateTags(action, content)`: Auto-tag based on action and content
- [ ] Handles both AI-provided metadata and inference from content
- [ ] Returns complete StructuredEvent object

#### Technical Notes
Priority for fields:
1. AI-provided metadata (if present)
2. Inference from content (if metadata missing)
3. Default/empty values

#### Tests Required
- Unit tests for each extraction method
- Test with AI metadata present
- Test with metadata missing (inference path)
- Test tag generation rules
- Integration test with sample AI outputs

---

### SEVT-004: Implement ActionClassifier service

**Status**: todo
**Dependencies**: SEVT-002
**Blocked By**: none

#### Description
Create ActionClassifier that classifies narrative content into standardized actions.

#### Acceptance Criteria
- [ ] Class created at `packages/server/src/services/events/action-classifier.ts`
- [ ] Methods implemented:
  - `classify(content)`: Main classification method
  - `matchesMercyPatterns(content)`: Regex patterns for mercy
  - `matchesViolencePatterns(content)`: Regex patterns for violence
  - Similar for other categories
  - `aiClassify(content)`: AI fallback for unclear content
- [ ] Rule-based classification is fast (no AI call)
- [ ] AI fallback only when rules don't match
- [ ] Classification confidence score returned

#### Technical Notes
Patterns should be case-insensitive and handle common variations:
- "spared the guard" → spare_enemy
- "let him go" → spare_enemy
- "showed mercy" → show_mercy

#### Tests Required
- Unit tests for each pattern matcher
- Test common phrases for each action
- Test fallback to AI classification
- Performance test (rule-based should be < 1ms)

---

### SEVT-005: Extend EventRepository with structured queries

**Status**: todo
**Dependencies**: SEVT-001
**Blocked By**: none

#### Description
Add query methods to EventRepository for structured event queries.

#### Acceptance Criteria
- [ ] Methods added to existing EventRepository:
  - `findByActions(gameId, actions[])`: Events matching any action
  - `countByActions(gameId, actions[])`: Count events by action
  - `findByActor(gameId, actorType, actorId)`: Events by actor
  - `findByTarget(gameId, targetType, targetId)`: Events by target
  - `findWitnessedBy(gameId, witnessType, witnessId)`: Events witnessed by entity
  - `findByTag(gameId, tag)`: Events with tag
  - `getActionSummary(gameId, actorType, actorId)`: Action counts for entity
- [ ] JSON queries for witnesses and tags work correctly
- [ ] All methods return StructuredEvent[]

#### Technical Notes
SQLite JSON queries:
```sql
-- Find events witnessed by specific NPC
WHERE witnesses LIKE '%"id":"npc_123"%'
```

#### Tests Required
- Unit tests for each query method
- Test JSON field queries
- Test with empty results
- Performance test with many events

---

### SEVT-006: Implement PatternObserver service

**Status**: todo
**Dependencies**: SEVT-005
**Blocked By**: none

#### Description
Create PatternObserver that analyzes player behavior patterns from event history.

#### Acceptance Criteria
- [ ] Class created at `packages/server/src/services/observers/pattern-observer.ts`
- [ ] Methods implemented:
  - `getPlayerPatterns(gameId, playerId)`: Full pattern analysis
  - `calculateRatio(events, positiveActions, negativeActions)`: Ratio calculation
  - `calculateViolenceInitiation(gameId, playerId)`: Who starts fights
  - `classifySocialApproach(summary)`: aggressive/diplomatic/mixed
  - `inferDominantTraits(summary)`: Trait suggestions from patterns
- [ ] PlayerPatterns interface includes:
  - mercyRatio, honestyRatio, violenceInitiation, explorationTendency
  - socialApproach enum
  - dominantTraits array
- [ ] Efficient queries (cached where possible)

#### Technical Notes
Ratios should return 0.5 when no data available (neutral assumption).

#### Tests Required
- Unit tests for each pattern calculation
- Test with no events (neutral patterns)
- Test with extreme patterns (all mercy, all violence)
- Test trait inference thresholds

---

### SEVT-007: Implement EmergenceObserver service

**Status**: todo
**Dependencies**: SEVT-006, entity-evolution epic
**Blocked By**: EVOL-008 (EvolutionService)

#### Description
Create EmergenceObserver that detects narrative emergence opportunities (villain/ally emergence).

#### Acceptance Criteria
- [ ] Class created at `packages/server/src/services/observers/emergence-observer.ts`
- [ ] Methods implemented:
  - `onEventCommitted(event)`: Main hook after event commit
  - `checkVillainEmergence(gameId, entityType, entityId)`: Villain conditions
  - `checkAllyEmergence(gameId, event, witness)`: Ally conditions
  - `calculateConfidence(relationship, historyLength)`: Confidence scoring
- [ ] EmergenceOpportunity interface includes:
  - type: 'villain_emergence' | 'ally_emergence' | 'rival_emergence'
  - entityType, entityId
  - confidence (0-1)
  - context (relationship, recent events, traits)
- [ ] Integrates with RelationshipRepository for threshold checks

#### Technical Notes
Villain conditions:
- resentment >= 0.6 AND (fear >= 0.5 OR trust <= 0.2)
- More history = higher confidence

Ally conditions:
- Witnessed positive player action
- trust >= 0.6 AND respect >= 0.5

#### Tests Required
- Unit tests for each emergence type
- Test threshold boundary conditions
- Test confidence calculation
- Integration test with relationship data

---

### SEVT-008: Integrate EventBuilder with ContentPipeline

**Status**: todo
**Dependencies**: SEVT-003, SEVT-004, SEVT-007
**Blocked By**: none

#### Description
Update ContentPipeline to use EventBuilder for structured event creation.

#### Acceptance Criteria
- [ ] ContentPipeline constructor accepts EventBuilder, EmergenceObserver
- [ ] After AI generation, call `eventBuilder.buildFromGeneration()`
- [ ] Structured event passed to StateManager.commitEvent()
- [ ] After commit, call `emergenceObserver.onEventCommitted()`
- [ ] Emergence opportunities queued for DM notification
- [ ] AI prompt updated to request structured metadata in response
- [ ] Backward compatible with old response format

#### Technical Notes
New AI response format:
```json
{
  "narrative": "The guard watches as you lower your sword...",
  "metadata": {
    "action": "spare_enemy",
    "actor": { "type": "player", "id": "player" },
    "targets": [{ "type": "npc", "id": "guard_captain" }]
  }
}
```

#### Tests Required
- Integration test: full generation flow
- Test structured event created correctly
- Test emergence detection runs
- Test backward compatibility

---

### SEVT-009: Integrate PatternObserver with ContextBuilder

**Status**: todo
**Dependencies**: SEVT-006
**Blocked By**: EVOL-012 (ContextBuilder integration)

#### Description
Update ContextBuilder to include player patterns in AI generation context.

#### Acceptance Criteria
- [ ] ContextBuilder constructor accepts PatternObserver
- [ ] `buildContext()` includes:
  - Player patterns (mercy ratio, honesty ratio, etc.)
  - Inferred dominant traits
  - Social approach classification
- [ ] Emergence opportunities (if any pending) included
- [ ] Context formatted for AI consumption

#### Technical Notes
Format for AI:
```
Player behavioral patterns:
- Shows mercy: 73% of the time
- Honesty: 45% (tends toward deception)
- Social approach: diplomatic
- Inferred traits: merciful, cunning
```

#### Tests Required
- Unit test: context includes patterns
- Test pattern formatting
- Test with no pattern data
- Integration test with full context build

---

### SEVT-010: Add Structured Events API routes

**Status**: todo
**Dependencies**: SEVT-005, SEVT-006
**Blocked By**: none

#### Description
Add REST API routes for querying structured events and patterns.

#### Acceptance Criteria
- [ ] Routes added to `packages/server/src/routes/events.ts` (or new file)
- [ ] Endpoints implemented:
  - `GET /api/game/:id/events/by-action?actions=[]` - Query by actions
  - `GET /api/game/:id/events/by-actor/:type/:entityId` - Query by actor
  - `GET /api/game/:id/events/by-target/:type/:entityId` - Query by target
  - `GET /api/game/:id/patterns` - Get player patterns
  - `GET /api/game/:id/emergence` - Get pending emergence opportunities
- [ ] Query parameters validated
- [ ] Pagination supported for event queries
- [ ] Error handling for invalid parameters

#### Technical Notes
Action query accepts comma-separated list: `?actions=spare_enemy,show_mercy`

#### Tests Required
- API tests for each endpoint
- Test query parameter validation
- Test pagination
- Test empty results

---

### SEVT-011: Implement DM emergence notifications

**Status**: todo
**Dependencies**: SEVT-007, SEVT-010
**Blocked By**: EVOL-014 (DM approval UI exists)

#### Description
Add UI notifications for DM when emergence opportunities are detected.

#### Acceptance Criteria
- [ ] Emergence opportunities appear in DM notifications area
- [ ] Each opportunity shows:
  - Entity name and type
  - Emergence type (villain, ally, rival)
  - Confidence score
  - Key factors (relationship dimensions, recent events)
- [ ] DM can dismiss or acknowledge
- [ ] Acknowledged opportunities saved for narrative context
- [ ] SSE updates when new opportunities detected

#### Technical Notes
This is advisory only - emergence opportunities suggest narrative directions but don't force anything.

#### Tests Required
- Component renders opportunities
- Dismiss action removes from list
- Acknowledge action marks for context
- SSE updates work

---

### SEVT-012: Write structured events documentation

**Status**: todo
**Dependencies**: SEVT-011
**Blocked By**: none

#### Description
Write comprehensive documentation for the structured events system.

#### Acceptance Criteria
- [ ] API documentation for all event query endpoints
- [ ] Action vocabulary reference
- [ ] Pattern analysis explanation
- [ ] Emergence detection rules documented
- [ ] Integration guide for extending action vocabulary
- [ ] Developer guide for adding new pattern types

#### Technical Notes
Include examples of how patterns influence AI generation.

#### Tests Required
- Documentation review for accuracy
- Code examples tested

---

## Summary

| Task | Title | Dependencies |
|------|-------|--------------|
| SEVT-001 | Extend events table with structured fields | entity-evolution |
| SEVT-002 | Define action vocabulary constants | SEVT-001 |
| SEVT-003 | Implement EventBuilder service | SEVT-002 |
| SEVT-004 | Implement ActionClassifier service | SEVT-002 |
| SEVT-005 | Extend EventRepository with structured queries | SEVT-001 |
| SEVT-006 | Implement PatternObserver service | SEVT-005 |
| SEVT-007 | Implement EmergenceObserver service | SEVT-006, EVOL-008 |
| SEVT-008 | Integrate with ContentPipeline | SEVT-003, SEVT-004, SEVT-007 |
| SEVT-009 | Integrate with ContextBuilder | SEVT-006, EVOL-012 |
| SEVT-010 | Add Structured Events API routes | SEVT-005, SEVT-006 |
| SEVT-011 | Implement DM emergence notifications | SEVT-007, SEVT-010, EVOL-014 |
| SEVT-012 | Write documentation | SEVT-011 |

## Cross-Epic Dependencies

- SEVT-007 (EmergenceObserver) depends on EVOL-008 (EvolutionService) for relationship queries
- SEVT-009 depends on EVOL-012 (ContextBuilder already has evolution data)
- SEVT-011 depends on EVOL-014 (DM UI exists)
