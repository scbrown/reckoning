---
title: "Entity Evolution Reference"
type: reference
status: active
created: 2026-01-18
updated: 2026-01-18
authors:
  - agent
related:
  - ./plan/entity-evolution.md
tags:
  - entity-evolution
  - traits
  - relationships
  - api
  - dm-guide
---

# Entity Evolution Reference

This document provides comprehensive documentation for the Entity Evolution system, which tracks how characters, NPCs, locations, and the player change through gameplay.

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Data Model](#data-model)
3. [API Reference](#api-reference)
4. [Service Interactions](#service-interactions)
5. [Event Flow](#event-flow)
6. [DM Guide](#dm-guide)
7. [Developer Guide](#developer-guide)
8. [Aggregate Label Rules](#aggregate-label-rules)

---

## Architecture Overview

The Entity Evolution system consists of two complementary subsystems:

### Entity Evolution (Traits & Relationships)

Tracks how entities change through gameplay via:

- **Traits**: Categorical personality/capability attributes organized into four categories (moral, emotional, capability, reputation)
- **Relationships**: Multi-dimensional connections between entities with six emotional/relational dimensions

### Art Evolution (Visual Evolution)

Evolves character artwork across game progression via:

- **Triggers**: Act transitions, major story events, trait changes, equipment changes
- **Strategies**: Palette swaps, composition layering, full regeneration

### Key Components

```
packages/server/src/
├── services/
│   ├── evolution/
│   │   ├── evolution-service.ts      # Core orchestrator
│   │   ├── system-evolution-detector.ts  # Rules-based detection
│   │   └── types.ts                  # Type definitions
│   └── art-evolution/
│       ├── art-evolution-service.ts  # Visual art evolution
│       └── types.ts                  # Art evolution types
├── db/repositories/
│   ├── trait-repository.ts           # Trait CRUD operations
│   ├── relationship-repository.ts    # Relationship CRUD operations
│   └── pending-evolution-repository.ts  # Evolution queue
└── routes/
    └── evolution.ts                  # API endpoints
```

---

## Data Model

### Entity Types

The system supports four entity types across all evolution features:

| Type | Description |
|------|-------------|
| `player` | The main player character |
| `character` | Party members/companions |
| `npc` | Non-player characters |
| `location` | Locations/areas that can evolve |

### Traits

Traits are categorical attributes that describe an entity's personality, capabilities, or reputation.

#### Trait Catalog

The system includes 24 predefined traits across 4 categories:

**Moral Traits**

| Trait | Description | Opposites |
|-------|-------------|-----------|
| `honorable` | Keeps promises, fights fairly | ruthless, deceitful |
| `ruthless` | Will do anything to achieve goals | honorable, merciful |
| `merciful` | Shows compassion to enemies | ruthless, cruel |
| `pragmatic` | Prioritizes practical outcomes | idealistic |
| `idealistic` | Holds to principles despite cost | pragmatic, corruptible |
| `corruptible` | Can be swayed from principles | idealistic, honorable |

**Emotional Traits**

| Trait | Description | Opposites |
|-------|-------------|-----------|
| `haunted` | Troubled by past events | serene |
| `hopeful` | Believes in positive outcomes | bitter, cynical |
| `bitter` | Resentful of past wrongs | hopeful, serene |
| `serene` | At peace despite circumstances | volatile, haunted |
| `volatile` | Prone to sudden emotional shifts | serene, guarded |
| `guarded` | Keeps emotions hidden | volatile |

**Capability Traits**

| Trait | Description | Opposites |
|-------|-------------|-----------|
| `battle-hardened` | Experienced in combat | naive |
| `scholarly` | Well-read and knowledgeable | - |
| `street-wise` | Knows how to survive | naive |
| `naive` | Inexperienced with the world | street-wise, battle-hardened |
| `cunning` | Clever and strategic | - |
| `broken` | Damaged by experiences | - |

**Reputation Traits**

| Trait | Description | Opposites |
|-------|-------------|-----------|
| `feared` | Others are afraid | beloved |
| `beloved` | Others feel affection | feared, notorious |
| `notorious` | Known for bad deeds | beloved, mysterious |
| `mysterious` | Little is known about them | notorious, legendary |
| `disgraced` | Fallen from honor | legendary |
| `legendary` | Known for great deeds | disgraced, mysterious |

#### Trait Status

Traits can have one of three statuses:

| Status | Description |
|--------|-------------|
| `active` | Currently affecting the entity |
| `faded` | No longer strongly applies but part of history |
| `removed` | Explicitly removed from the entity |

### Relationships

Relationships track multi-dimensional connections between entities using six dimensions, each valued from 0.0 to 1.0:

| Dimension | Default | Description |
|-----------|---------|-------------|
| `trust` | 0.5 | How much one entity trusts another |
| `respect` | 0.5 | Admiration for abilities or character |
| `affection` | 0.5 | Emotional warmth and care |
| `fear` | 0.0 | Apprehension or terror |
| `resentment` | 0.0 | Grudges and negative feelings |
| `debt` | 0.0 | Sense of obligation |

### Pending Evolutions

Evolution suggestions are queued for DM review before being applied:

| Status | Description |
|--------|-------------|
| `pending` | Awaiting DM review |
| `approved` | DM approved and applied |
| `edited` | DM modified and then approved |
| `refused` | DM rejected |

### Evolution Types

| Type | Description |
|------|-------------|
| `trait_add` | Add a new trait to an entity |
| `trait_remove` | Remove a trait from an entity |
| `relationship_change` | Modify a relationship dimension |

---

## API Reference

All evolution endpoints are prefixed with `/api/evolution`.

### List Pending Evolutions

```
GET /api/evolution/:gameId
GET /api/evolution/:gameId?all=true
```

Returns pending evolutions for a game. Use `all=true` to include resolved evolutions.

**Response:**
```json
{
  "evolutions": [
    {
      "id": "uuid",
      "gameId": "game-uuid",
      "turn": 5,
      "evolutionType": "trait_add",
      "entityType": "player",
      "entityId": "player-1",
      "trait": "merciful",
      "reason": "Spared the wounded enemy",
      "status": "pending",
      "createdAt": "2026-01-18T12:00:00Z"
    }
  ]
}
```

### Get Evolution by ID

```
GET /api/evolution/:gameId/:evolutionId
```

Returns a specific evolution.

**Response:**
```json
{
  "evolution": { ... }
}
```

### Approve Evolution

```
POST /api/evolution/:gameId/:evolutionId/approve
```

Approves a pending evolution and applies it.

**Request Body:**
```json
{
  "dmNotes": "Optional notes about the approval"
}
```

**Response:**
```json
{
  "evolution": { ... }  // Updated evolution with status: "approved"
}
```

### Edit and Approve Evolution

```
POST /api/evolution/:gameId/:evolutionId/edit
```

Modifies an evolution and then approves it.

**Request Body:**
```json
{
  "trait": "ruthless",           // For trait evolutions
  "targetType": "npc",           // For relationship evolutions
  "targetId": "npc-1",
  "dimension": "trust",
  "oldValue": 0.5,
  "newValue": 0.7,
  "reason": "Updated reason",
  "dmNotes": "Modified the suggestion"
}
```

**Response:**
```json
{
  "evolution": { ... }  // Updated evolution with status: "edited"
}
```

### Refuse Evolution

```
POST /api/evolution/:gameId/:evolutionId/refuse
```

Rejects a pending evolution.

**Request Body:**
```json
{
  "dmNotes": "Optional explanation for refusal"
}
```

**Response:**
```json
{
  "evolution": { ... }  // Updated evolution with status: "refused"
}
```

### Get Entity Traits

```
GET /api/evolution/:gameId/traits/:entityType/:entityId
```

Returns all active traits for an entity.

**Response:**
```json
{
  "entityType": "player",
  "entityId": "player-1",
  "traits": [
    {
      "id": "trait-uuid",
      "trait": "merciful",
      "acquiredTurn": 5,
      "status": "active"
    }
  ]
}
```

### Get Entity Relationships

```
GET /api/evolution/:gameId/relationships/:entityType/:entityId
```

Returns all relationships for an entity.

**Response:**
```json
{
  "entityType": "player",
  "entityId": "player-1",
  "relationships": [
    {
      "id": "rel-uuid",
      "targetType": "npc",
      "targetId": "npc-1",
      "dimensions": {
        "trust": 0.7,
        "respect": 0.8,
        "affection": 0.5,
        "fear": 0.0,
        "resentment": 0.1,
        "debt": 0.2
      },
      "updatedTurn": 10
    }
  ]
}
```

### Get Entity Summary

```
GET /api/evolution/:gameId/entity/:entityType/:entityId
```

Returns a full entity summary with traits and labeled relationships.

**Response:**
```json
{
  "entity": {
    "entityType": "player",
    "entityId": "player-1",
    "traits": ["merciful", "honorable"],
    "relationships": [
      {
        "targetType": "npc",
        "targetId": "npc-1",
        "label": "ally",
        "dimensions": {
          "trust": 0.7,
          "respect": 0.8,
          "affection": 0.5,
          "fear": 0.0,
          "resentment": 0.1,
          "debt": 0.2
        }
      }
    ]
  }
}
```

### Get Trait Catalog

```
GET /api/evolution/catalog/traits
```

Returns the predefined trait vocabulary.

**Response:**
```json
{
  "traits": [
    {
      "trait": "honorable",
      "category": "moral",
      "description": "Keeps promises, fights fairly",
      "opposites": ["ruthless", "deceitful"]
    }
  ]
}
```

---

## Service Interactions

### EvolutionService

The core orchestrator for entity evolution.

```typescript
import { EvolutionService } from './services/evolution/evolution-service.js';

const evolutionService = new EvolutionService({
  traitRepo,
  relationshipRepo,
  pendingRepo,
  eventEmitter,  // Optional
});

// Queue evolution suggestions for DM review
const pending = evolutionService.detectEvolutions(gameId, event, aiSuggestions);

// Process DM decisions
evolutionService.approve(pendingId, dmNotes);
evolutionService.edit(pendingId, changes, dmNotes);
evolutionService.refuse(pendingId, dmNotes);

// Get entity data for AI context
const summary = evolutionService.getEntitySummary(gameId, entityType, entityId);

// Compute relationship labels
const label = evolutionService.computeAggregateLabel(dimensions);
```

### SystemEvolutionDetector

Rules-based evolution detection without AI.

```typescript
import {
  detectTraitsFromEvent,
  detectRelationshipsFromEvent,
  detectTraitsFromPatterns,
} from './services/evolution/system-evolution-detector.js';

// Detect traits from a single event
const traitDetections = detectTraitsFromEvent(event, actorType, actorId);

// Detect relationship changes
const relDetections = detectRelationshipsFromEvent(event, actorType, actorId, targetType, targetId);

// Detect patterns across multiple events
const patternDetections = detectTraitsFromPatterns(events, actorType, actorId, threshold);
```

### ArtEvolutionService

Manages visual art evolution.

```typescript
import { ArtEvolutionService } from './services/art-evolution/art-evolution-service.js';

const artService = new ArtEvolutionService({
  eventEmitter,       // Optional
  customTraitMappings, // Optional
});

// Process a trigger and get evolution request
const request = artService.processTrigger(triggerContext);

// Execute the evolution
const result = await artService.evolve(request);

// Archive art before changes
artService.archiveArt(gameId, entityType, entityId, source, spriteName, turn, trigger);

// Get evolution history
const history = artService.getHistory(gameId, entityType, entityId);
```

---

## Event Flow

### Evolution Detection Flow

```
┌─────────────────┐
│  Game Event     │
│  (narration,    │
│   action, etc.) │
└────────┬────────┘
         │
         ▼
┌─────────────────┐     ┌─────────────────┐
│  ContentPipeline│────▶│  AI Suggestions │
│  generates      │     │  (optional)     │
│  content        │     └────────┬────────┘
└─────────────────┘              │
                                 ▼
                    ┌─────────────────────┐
                    │  EvolutionService   │
                    │  .detectEvolutions()│
                    └────────┬────────────┘
                             │
         ┌───────────────────┼───────────────────┐
         │                   │                   │
         ▼                   ▼                   ▼
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│ AI-suggested│     │   System    │     │  Duplicate  │
│ evolutions  │     │  detection  │     │  filtering  │
└──────┬──────┘     └──────┬──────┘     └──────┬──────┘
       │                   │                   │
       └───────────────────┴───────────────────┘
                           │
                           ▼
                  ┌─────────────────┐
                  │ PendingEvolution│
                  │    queue        │
                  └─────────────────┘
```

### DM Approval Flow

```
┌─────────────────┐
│ PendingEvolution│
│    (pending)    │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│   DM Reviews    │
│   in Editor     │
└────────┬────────┘
         │
    ┌────┴────┬─────────┐
    │         │         │
    ▼         ▼         ▼
┌───────┐ ┌───────┐ ┌───────┐
│Approve│ │ Edit  │ │Refuse │
└───┬───┘ └───┬───┘ └───┬───┘
    │         │         │
    │         ▼         │
    │    ┌───────┐      │
    │    │ Modify│      │
    │    │ fields│      │
    │    └───┬───┘      │
    │        │          │
    └────────┼──────────┘
             │
             ▼
    ┌─────────────────┐
    │  Apply to       │
    │  repositories   │
    │  (if approved)  │
    └────────┬────────┘
             │
             ▼
    ┌─────────────────┐
    │  Emit event     │
    │  (evolution:*)  │
    └─────────────────┘
```

### Art Evolution Flow

```
┌──────────────────┐
│     Trigger      │
│ (act_transition, │
│  major_event,    │
│  status_effect,  │
│  equipment_change│
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│ processTrigger() │
│ Determine if art │
│ should evolve    │
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│ Select strategy  │
│ • variant        │
│ • composition    │
│ • regenerate     │
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│ Archive old art  │
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│ Apply evolution  │
│ to pixelsrc      │
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│ Return new       │
│ source/name      │
└──────────────────┘
```

---

## DM Guide

### Understanding Pending Evolutions

As a DM, you'll see evolution suggestions appear after significant game events. Each suggestion includes:

- **Evolution Type**: What kind of change (trait addition, trait removal, or relationship change)
- **Entity**: Who is being affected
- **Reason**: Why the system suggests this evolution
- **Source Event**: The game event that triggered this suggestion

### Reviewing Evolutions

For each pending evolution, you have three options:

1. **Approve**: Accept the suggestion as-is
2. **Edit**: Modify the suggestion before approving
3. **Refuse**: Reject the suggestion entirely

### When to Approve

Approve evolutions when:
- The suggestion accurately reflects what happened in the narrative
- The trait or relationship change makes sense for the entity
- It will enhance future AI-generated content

### When to Edit

Edit evolutions when:
- The direction is right but the specifics are wrong
- You want a different trait that better captures the moment
- The relationship dimension change is too strong or too weak

### When to Refuse

Refuse evolutions when:
- The suggestion misinterprets the narrative
- The change would conflict with established character development
- The suggestion is premature (let the pattern develop more)

### Adding DM Notes

Always consider adding notes when:
- Editing to explain your reasoning
- Refusing to help the AI learn
- Approving major character-defining changes

### Tips for Effective Evolution Management

1. **Be consistent**: If you refuse certain types of suggestions, be consistent
2. **Consider opposites**: The trait catalog includes opposite traits - removing one might warrant adding its opposite
3. **Watch patterns**: The system detects repeated behaviors - let patterns emerge before rushing to approve
4. **Trust the six dimensions**: Relationships are nuanced - a high-fear, high-respect relationship creates a "rival"

---

## Developer Guide

### Extending the Trait Catalog

The trait catalog is defined in `trait-repository.ts`:

```typescript
const TRAIT_CATALOG: TraitCatalogEntry[] = [
  {
    trait: 'my-new-trait',
    category: 'moral',  // moral, emotional, capability, or reputation
    description: 'Description of what this trait means',
    opposites: ['opposing-trait-1', 'opposing-trait-2'],
  },
  // ...
];
```

When adding traits:

1. **Choose the right category**: Traits should fit cleanly into one of the four categories
2. **Write clear descriptions**: Help AI and DMs understand what the trait means
3. **Identify opposites**: Consider what traits are mutually exclusive
4. **Add keyword detection**: Update `system-evolution-detector.ts` to detect the new trait

#### Adding Keyword Detection

In `system-evolution-detector.ts`, add keywords for your new trait:

```typescript
const TRAIT_KEYWORDS: Record<string, string[]> = {
  // ...existing traits...
  'my-new-trait': ['keyword1', 'keyword2', 'phrase to detect'],
};
```

### Adding Art Evolution Mappings

To make traits affect visual art, add mappings in `art-evolution/types.ts`:

```typescript
export const TRAIT_VISUAL_MAPPINGS: TraitVisualMapping[] = [
  {
    trait: 'my-new-trait',
    strategy: 'variant',  // or 'composition' or 'regenerate'
    params: {
      paletteModifications: [
        { originalKey: 'eyes', newColor: '#ff0000' },
      ],
      // OR for composition:
      layers: [
        { spriteName: 'overlay_effect', zIndex: -1, opacity: 0.5 },
      ],
      // OR for regenerate:
      promptHints: ['Describe the visual change'],
    },
  },
];
```

### Custom Event Emitters

Both `EvolutionService` and `ArtEvolutionService` accept optional event emitters:

```typescript
const evolutionService = new EvolutionService({
  // ...repos...
  eventEmitter: {
    emit(event) {
      switch (event.type) {
        case 'evolution:created':
          // Handle new evolution queued
          break;
        case 'evolution:approved':
          // Handle evolution approved
          break;
        case 'evolution:edited':
          // Handle evolution edited
          break;
        case 'evolution:refused':
          // Handle evolution refused
          break;
      }
    },
  },
});
```

### Integration with ContentPipeline

To integrate evolution detection with content generation:

```typescript
// In ContentPipeline
async generateContent(gameId: string, type: GenerationType) {
  const aiResponse = await this.callAI(prompt);

  // Extract evolution suggestions from AI response
  const suggestions = this.extractEvolutionSuggestions(aiResponse);

  // Queue for DM review
  if (suggestions.length > 0) {
    await this.evolutionService.detectEvolutions(gameId, event, suggestions);
  }
}
```

### Integration with ContextBuilder

To include evolution data in AI context:

```typescript
// In ContextBuilder
async buildContext(gameId: string) {
  const playerSummary = this.evolutionService.getEntitySummary(
    gameId, 'player', playerId
  );

  return {
    playerTraits: playerSummary.traits,
    relationships: playerSummary.relationships.map(r => ({
      target: r.targetId,
      label: r.label,  // e.g., "ally", "rival", "devoted"
    })),
  };
}
```

---

## Aggregate Label Rules

The `computeAggregateLabel` method converts raw dimension values into human-readable labels. Labels are evaluated in priority order - the first matching condition wins.

### Label Definitions

| Label | Conditions | Description |
|-------|------------|-------------|
| `devoted` | trust > 0.7 AND affection > 0.7 AND respect > 0.6 | Deeply loyal and loving |
| `terrified` | fear > 0.7 AND resentment > 0.5 | Fearful to the point of potential villainy |
| `enemy` | fear > 0.5 AND resentment > 0.6 | Hostile antagonist |
| `rival` | respect > 0.5 AND resentment > 0.5 | Worthy adversary |
| `resentful` | resentment > 0.6 | Harboring grudges |
| `ally` | trust > 0.6 AND respect > 0.6 | Trusted partner |
| `friend` | affection > 0.6 AND trust > 0.5 | Close emotional bond |
| `indebted` | debt > 0.6 | Feels significant obligation |
| `wary` | trust < 0.3 OR fear > 0.4 | Cautious or suspicious |
| `indifferent` | (default) | No strong feelings |

### Evaluation Order

Labels are checked in the following order:

1. `devoted` - Highest positive combination
2. `terrified` - Extreme negative (potential villain)
3. `enemy` - Strong negative
4. `rival` - Mixed respect/resentment
5. `resentful` - Pure resentment
6. `ally` - Professional positive
7. `friend` - Emotional positive
8. `indebted` - Obligation-based
9. `wary` - Low trust or fear
10. `indifferent` - Fallback

### Using Labels in AI Context

Labels simplify relationship context for AI generation:

```
NPCs in this scene:
- Guard Captain: [battle-hardened, honorable], rival toward player
- Merchant: [pragmatic], indebted toward player
- Prisoner: [broken, haunted], devoted toward player
```

This allows the AI to understand relationship dynamics without needing raw dimension values.

### Customizing Label Thresholds

To modify label thresholds, extend the `EvolutionService` class:

```typescript
class CustomEvolutionService extends EvolutionService {
  computeAggregateLabel(dimensions: RelationshipDimensions): AggregateLabel {
    // Custom logic here
    // Or call super.computeAggregateLabel(dimensions) and override specific cases
  }
}
```
