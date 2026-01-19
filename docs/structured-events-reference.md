---
title: "Structured Events Reference"
type: reference
status: active
created: 2026-01-19
updated: 2026-01-19
authors:
  - agent
related:
  - ./plan/structured-events.md
tags:
  - structured-events
  - chronicle
  - patterns
  - emergence
  - api
---

# Structured Events Reference

This document provides comprehensive documentation for the Structured Events system, which enables queryable event patterns for AI context, player behavior analysis, and narrative emergence detection.

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Action Vocabulary](#action-vocabulary)
3. [Data Model](#data-model)
4. [API Reference](#api-reference)
5. [Service Reference](#service-reference)
6. [Pattern Analysis](#pattern-analysis)
7. [Emergence Detection](#emergence-detection)
8. [Integration Guide](#integration-guide)
9. [Developer Guide](#developer-guide)

---

## Architecture Overview

The Structured Events system extends the base events table with queryable metadata, enabling rich analysis of player behavior and narrative emergence detection.

### Key Components

```
packages/
├── shared/src/game/
│   ├── actions.ts              # Action vocabulary constants
│   └── events.ts               # Event types and interfaces
└── server/src/
    ├── db/
    │   ├── schema.sql          # Events table with structured fields
    │   └── repositories/
    │       └── event-repository.ts  # Structured query methods
    ├── services/
    │   ├── events/
    │   │   ├── event-builder.ts       # Constructs structured events
    │   │   ├── action-classifier.ts   # Classifies actions from text
    │   │   ├── emergence-observer.ts  # Detects narrative emergence
    │   │   └── types.ts               # Type definitions
    │   └── chronicle/
    │       ├── pattern-observer.ts    # Analyzes player patterns
    │       └── types.ts               # Pattern types
    └── routes/
        └── game.ts             # API endpoints
```

### System Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                    Structured Events Pipeline                    │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────┐     ┌──────────────┐     ┌─────────────────┐  │
│  │ ContentPipe- │────▶│ EventBuilder │────▶│ Events Table    │  │
│  │ line         │     │              │     │ (structured)    │  │
│  └──────────────┘     └──────────────┘     └────────┬────────┘  │
│         │                    │                      │           │
│         ▼                    ▼                      ▼           │
│  ┌──────────────┐     ┌──────────────┐     ┌─────────────────┐  │
│  │ AI generates │     │ActionClassi- │     │ EventRepository │  │
│  │ content +    │     │fier extracts │     │ enables queries │  │
│  │ metadata     │     │actions       │     └────────┬────────┘  │
│  └──────────────┘     └──────────────┘              │           │
│                                                     │           │
│                    ┌────────────────────────────────┤           │
│                    │                                │           │
│                    ▼                                ▼           │
│         ┌─────────────────┐              ┌─────────────────┐    │
│         │ PatternObserver │              │ EmergenceObserv │    │
│         │ analyzes player │              │ er detects      │    │
│         │ behavior        │              │ narrative opps  │    │
│         └─────────────────┘              └─────────────────┘    │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Action Vocabulary

The system uses a standardized vocabulary of 38 actions across 6 categories. This enables consistent querying and pattern analysis.

### Action Categories

| Category | Description | Actions |
|----------|-------------|---------|
| **mercy** | Compassionate actions | spare_enemy, show_mercy, forgive, heal_enemy, release_prisoner |
| **violence** | Aggressive/harmful actions | kill, execute, attack_first, threaten, torture |
| **honesty** | Truth/deception related | tell_truth, confess, reveal_secret, keep_promise, lie, deceive, break_promise, withhold_info |
| **social** | Interpersonal interactions | help, betray, befriend, insult, intimidate, persuade, bribe |
| **exploration** | World interaction | enter_location, examine, search, steal, unlock, destroy |
| **character** | Character development | level_up, acquire_item, use_ability, rest, pray, meditate |

### Action Details

#### Mercy Actions

| Action | Description | Example Trigger |
|--------|-------------|-----------------|
| `spare_enemy` | Choose not to kill a defeated foe | "You lower your sword and let the bandit flee" |
| `show_mercy` | General act of compassion | "You bandage the wounded soldier's arm" |
| `forgive` | Release resentment for a wrong | "You accept his apology for the betrayal" |
| `heal_enemy` | Provide aid to an adversary | "You cast healing magic on the fallen orc" |
| `release_prisoner` | Free a captive | "You unlock the cell and set the prisoner free" |

#### Violence Actions

| Action | Description | Example Trigger |
|--------|-------------|-----------------|
| `kill` | End a life in conflict | "Your blade finds its mark and the guard falls" |
| `execute` | Deliberate killing of helpless target | "You deliver the killing blow to the kneeling prisoner" |
| `attack_first` | Initiate violence | "You strike without warning" |
| `threaten` | Use threat of violence | "You press the knife against his throat" |
| `torture` | Inflict suffering | "You begin extracting information through pain" |

#### Honesty Actions

| Action | Description | Example Trigger |
|--------|-------------|-----------------|
| `tell_truth` | Honest disclosure | "You admit you were the one who stole it" |
| `confess` | Reveal wrongdoing | "You confess to the priest about the murder" |
| `reveal_secret` | Share hidden information | "You tell them about the hidden passage" |
| `keep_promise` | Honor a commitment | "As promised, you return with the medicine" |
| `lie` | Deliberate falsehood | "You tell them you've never been here before" |
| `deceive` | Mislead through words/actions | "You lead them down the wrong path" |
| `break_promise` | Fail to honor commitment | "Despite your word, you take the gold and leave" |
| `withhold_info` | Deliberately omit truth | "You say nothing about the trap ahead" |

#### Social Actions

| Action | Description | Example Trigger |
|--------|-------------|-----------------|
| `help` | Provide assistance | "You help the old woman carry her bags" |
| `betray` | Break trust/loyalty | "You signal the guards while they sleep" |
| `befriend` | Form positive connection | "You share a drink and swap stories" |
| `insult` | Verbal attack | "You mock the noble's pretensions" |
| `intimidate` | Coerce through fear | "You crack your knuckles menacingly" |
| `persuade` | Convince through reason | "You make a compelling argument for peace" |
| `bribe` | Offer payment for favor | "You slide a pouch of gold across the table" |

#### Exploration Actions

| Action | Description | Example Trigger |
|--------|-------------|-----------------|
| `enter_location` | Move to new area | "You step through the doorway into darkness" |
| `examine` | Inspect closely | "You study the inscription on the wall" |
| `search` | Look for hidden things | "You check under the floorboards" |
| `steal` | Take without permission | "You pocket the merchant's coin purse" |
| `unlock` | Open secured passage | "You pick the lock on the chest" |
| `destroy` | Break or damage | "You smash the crystal with your hammer" |

#### Character Actions

| Action | Description | Example Trigger |
|--------|-------------|-----------------|
| `level_up` | Gain power/experience | "You feel stronger after the battle" |
| `acquire_item` | Obtain equipment/object | "You claim the enchanted sword" |
| `use_ability` | Activate special power | "You invoke your healing magic" |
| `rest` | Recovery period | "You make camp for the night" |
| `pray` | Religious devotion | "You kneel before the altar" |
| `meditate` | Mental focus/recovery | "You enter a trance to center yourself" |

### Helper Functions

```typescript
import {
  isValidAction,
  getActionCategory,
  isActionInCategory,
  isValidActionCategory,
  ACTION_CATEGORIES,
  ALL_ACTIONS,
} from '@reckoning/shared/game/actions';

// Check if string is valid action
isValidAction('spare_enemy');  // true
isValidAction('punch');        // false

// Get category for action
getActionCategory('kill');     // 'violence'
getActionCategory('help');     // 'social'

// Check action membership
isActionInCategory('lie', 'honesty');  // true
```

---

## Data Model

### Events Table Schema

The events table includes structured fields for queryable metadata:

```sql
CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  game_id TEXT NOT NULL REFERENCES games(id),
  turn INTEGER NOT NULL,
  timestamp TEXT DEFAULT (datetime('now')),
  event_type TEXT NOT NULL,
  content TEXT NOT NULL,
  original_generated TEXT,
  speaker TEXT,
  location_id TEXT NOT NULL,

  -- Structured event fields
  action TEXT,           -- Standardized action verb
  actor_type TEXT,       -- 'player', 'character', 'npc', 'system'
  actor_id TEXT,         -- ID of acting entity
  target_type TEXT,      -- 'player', 'character', 'npc', 'area', 'object'
  target_id TEXT,        -- ID of target entity
  witnesses TEXT,        -- JSON array of witness IDs
  tags TEXT              -- JSON array for categorization
);
```

### Indexes

```sql
-- Enable efficient structured queries
CREATE INDEX idx_events_action ON events(game_id, action);
CREATE INDEX idx_events_actor ON events(game_id, actor_type, actor_id);
CREATE INDEX idx_events_target ON events(game_id, target_type, target_id);
```

### Entity Types

| Type | Description |
|------|-------------|
| `player` | The main player character |
| `character` | Party members/companions |
| `npc` | Non-player characters |
| `area` | Locations/areas |
| `object` | Items/interactive objects |
| `system` | System-generated events |

### Structured Event Data

```typescript
interface StructuredEventData {
  action?: Action;           // Standardized action verb
  actorType?: ActorType;     // Who performed the action
  actorId?: string;          // ID of actor
  targetType?: TargetType;   // What was affected
  targetId?: string;         // ID of target
  witnesses: string[];       // IDs of witnesses
  tags: string[];            // Categorization tags
}
```

---

## API Reference

All game-related endpoints are prefixed with `/api/game`.

### Get Event History

```
GET /api/game/:id/events
```

Returns event history with structured data.

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `limit` | number | Max events to return (default: 50) |
| `offset` | number | Pagination offset |

**Response:**
```json
{
  "events": [
    {
      "id": "evt-uuid",
      "gameId": "game-uuid",
      "turn": 5,
      "eventType": "player_action",
      "content": "You spare the wounded bandit",
      "action": "spare_enemy",
      "actorType": "player",
      "actorId": "player-1",
      "targetType": "npc",
      "targetId": "bandit-1",
      "witnesses": ["guard-1", "villager-2"],
      "tags": ["mercy", "moral_choice"],
      "timestamp": "2026-01-19T12:00:00Z"
    }
  ]
}
```

### Get Action Summary

```
GET /api/game/:id/actions/summary
```

Returns aggregate action counts for the game.

**Response:**
```json
{
  "summary": {
    "spare_enemy": 3,
    "kill": 5,
    "help": 8,
    "steal": 2,
    "tell_truth": 4,
    "lie": 1
  }
}
```

### Get Player Patterns

```
GET /api/game/:id/patterns
```

Returns analyzed player behavior patterns.

**Response:**
```json
{
  "patterns": {
    "categoryCounts": {
      "mercy": 5,
      "violence": 8,
      "honesty": 6,
      "social": 12,
      "exploration": 15,
      "character": 4
    },
    "behavioralRatios": {
      "mercyVsViolence": 0.38,
      "honestyVsDeception": 0.75
    },
    "violenceInitiation": {
      "initiatesViolence": true,
      "initiationRatio": 0.6,
      "totalViolenceEvents": 8,
      "attackFirstEvents": 5
    },
    "socialApproach": "diplomatic",
    "dominantTraits": ["merciful", "honest", "curious"]
  }
}
```

### Generate Next Event

```
POST /api/game/:id/next
```

Generates the next game event with structured data.

**Request Body:**
```json
{
  "dmGuidance": "Optional DM guidance for generation"
}
```

**Response:**
```json
{
  "event": {
    "id": "evt-uuid",
    "content": "The narrative text...",
    "action": "examine",
    "actorType": "player",
    "actorId": "player-1",
    "witnesses": [],
    "tags": ["exploration"]
  },
  "emergence": []
}
```

---

## Service Reference

### EventBuilder

Constructs structured event data from AI-generated content.

**Location:** `packages/server/src/services/events/event-builder.ts`

```typescript
import { EventBuilder } from './services/events/event-builder.js';

const eventBuilder = new EventBuilder(actionClassifier);

const structuredData = eventBuilder.buildFromGeneration({
  generationType: 'narration',
  eventType: 'player_action',
  content: 'You spare the wounded enemy',
  npcsPresent: [{ id: 'npc-1', name: 'Guard' }],
  partyMembers: [{ id: 'char-1', name: 'Ally' }],
  locationId: 'area-1',
  metadata: aiMetadata,  // Optional AI-provided metadata
});
```

**Input Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `generationType` | string | Type of content generation |
| `eventType` | string | Canonical event type |
| `content` | string | Narrative text |
| `npcsPresent` | array | NPCs in the area |
| `partyMembers` | array | Party characters |
| `locationId` | string | Current location ID |
| `metadata` | object | Optional AI-structured metadata |

**Extraction Priority:**

1. AI-provided metadata (if available and valid)
2. Inference from content via ActionClassifier
3. Default/undefined

### ActionClassifier

Classifies narrative content into standardized actions.

**Location:** `packages/server/src/services/events/action-classifier.ts`

```typescript
import { ActionClassifier } from './services/events/action-classifier.js';

const classifier = new ActionClassifier(aiService);

// Synchronous rule-based classification
const result = classifier.classify('You spare the defeated enemy');
// { action: 'spare_enemy', category: 'mercy', confidence: 0.9 }

// Async with AI fallback for ambiguous content
const result = await classifier.classifyWithFallback('The situation grows tense');
// { action: undefined, category: undefined, confidence: 0.0, usedAiFallback: true }
```

**Classification Result:**

```typescript
interface ClassificationResult {
  action: Action | undefined;
  category: ActionCategory | undefined;
  confidence: number;         // 0-1 confidence score
  usedAiFallback: boolean;
  matchedPattern?: string;    // Pattern that matched (for debugging)
}
```

**Pattern Library:**

The classifier uses ~120 regex patterns across all action categories:

```typescript
// Example patterns
{ pattern: /\b(spare[sd]?|sparing)\s+(the\s+)?(\w+\s+)*(enemy|foe)/i, action: 'spare_enemy', confidence: 0.9 }
{ pattern: /\bkill(ed|s|ing)?\b/i, action: 'kill', confidence: 0.8 }
{ pattern: /\b(lie[sd]?|lying)\b/i, action: 'lie', confidence: 0.85 }
```

### PatternObserver

Analyzes player behavior patterns from event history.

**Location:** `packages/server/src/services/chronicle/pattern-observer.ts`

```typescript
import { PatternObserver } from './services/chronicle/pattern-observer.js';

const observer = new PatternObserver(eventRepository);

const patterns = observer.getPlayerPatterns(gameId, playerId, {
  minTurn: 1,      // Optional: start turn
  maxTurn: 100,    // Optional: end turn
});
```

**See [Pattern Analysis](#pattern-analysis) for detailed output documentation.**

### EmergenceObserver

Detects narrative emergence opportunities.

**Location:** `packages/server/src/services/events/emergence-observer.ts`

```typescript
import { EmergenceObserver } from './services/events/emergence-observer.js';

const observer = new EmergenceObserver(
  eventRepository,
  relationshipRepository,
  traitRepository
);

// Called after each event commit
const result = observer.onEventCommitted(event);
```

**See [Emergence Detection](#emergence-detection) for detailed documentation.**

### EventRepository Structured Queries

**Location:** `packages/server/src/db/repositories/event-repository.ts`

```typescript
// Find events by actor
const playerEvents = await eventRepo.findByActor(gameId, 'player', playerId);

// Find events affecting a target
const npcEvents = await eventRepo.findByTarget(gameId, 'npc', npcId);

// Find events by action types
const mercyEvents = await eventRepo.findByActions(gameId, [
  'spare_enemy', 'show_mercy', 'forgive'
]);

// Find events by tag
const moralChoices = await eventRepo.findByTag(gameId, 'moral_choice');

// Find events witnessed by entity
const witnessed = await eventRepo.findWitnessedBy(gameId, witnessId);

// Get action distribution
const summary = await eventRepo.getActionSummary(gameId);
// Map<string, number> { 'kill': 5, 'help': 3, ... }
```

---

## Pattern Analysis

The PatternObserver analyzes player behavior to provide insights for AI context and DM awareness.

### PlayerPatterns Output

```typescript
interface PlayerPatterns {
  categoryCounts: Record<ActionCategory, number>;
  behavioralRatios: {
    mercyVsViolence: number;    // -1 (violent) to 1 (merciful)
    honestyVsDeception: number; // -1 (deceptive) to 1 (honest)
  };
  violenceInitiation: ViolenceInitiationResult;
  socialApproach: SocialApproach;
  dominantTraits: string[];
}
```

### Category Counts

Tallies events per action category:

```typescript
{
  mercy: 5,
  violence: 8,
  honesty: 6,
  social: 12,
  exploration: 15,
  character: 4
}
```

### Behavioral Ratios

Computed as ratios from -1 to 1:

| Ratio | Calculation | Interpretation |
|-------|-------------|----------------|
| `mercyVsViolence` | (mercy - violence) / (mercy + violence) | -1 = pure violence, 1 = pure mercy |
| `honestyVsDeception` | (honest - deceptive) / (honest + deceptive) | -1 = always lies, 1 = always honest |

### Violence Initiation Analysis

```typescript
interface ViolenceInitiationResult {
  initiatesViolence: boolean;    // true if > 40% of violence is attack_first
  initiationRatio: number;       // attack_first / total violence events
  totalViolenceEvents: number;
  attackFirstEvents: number;
}
```

### Social Approach Classification

| Approach | Criteria |
|----------|----------|
| `helpful` | Predominantly help actions |
| `diplomatic` | Persuasion, befriending dominant |
| `manipulative` | Bribery, intimidation dominant |
| `hostile` | Insults, betrayals dominant |
| `balanced` | No clear dominant pattern |
| `minimal` | Insufficient social events (<3) |

### Dominant Traits Inference

Traits inferred from behavior patterns:

| Pattern | Inferred Trait |
|---------|----------------|
| mercyRatio > 0.6, mercy events >= 3 | `merciful` |
| mercyRatio < -0.6, violence events >= 3 | `ruthless` |
| initiatesViolence = true | `aggressive` |
| initiatesViolence = false, violence > 0 | `defensive` |
| honestyRatio > 0.6 | `honest` |
| honestyRatio < -0.6 | `deceptive` |
| socialApproach = 'helpful' | `altruistic` |
| socialApproach = 'diplomatic' | `charismatic` |
| socialApproach = 'manipulative' | `cunning` |
| socialApproach = 'hostile' | `antagonistic` |
| exploration >= 10 | `curious` |
| character (rest, pray, meditate) >= 5 | `contemplative` |

### Using Patterns in AI Context

```
Player Behavior Profile:
- Mercy vs Violence: +0.4 (tends merciful)
- Honesty: +0.8 (very honest)
- Social Approach: diplomatic
- Violence Pattern: defensive (doesn't attack first)
- Dominant Traits: merciful, honest, charismatic
```

This enables AI to generate consistent responses that acknowledge player patterns.

---

## Emergence Detection

The EmergenceObserver detects opportunities for narrative emergence based on relationship dynamics and event patterns.

### Emergence Types

| Type | Description |
|------|-------------|
| `villain` | NPC has motivation to become antagonist |
| `ally` | NPC has motivation to become supporter |

### Villain Emergence Rules

An NPC may emerge as a villain when:

**Required Conditions:**
- `fear >= 0.6` - Significant fear of the player
- `resentment >= 0.5` - Built-up grudges

**Supporting Factors (boost confidence):**
- `trust < 0.3` - Low/broken trust
- `respect < 0.3` - Little respect

**Example Scenario:**
> The player has threatened, intimidated, and harmed this NPC multiple times. Fear is high (0.7), resentment has built (0.6). The NPC may begin plotting against the player.

### Ally Emergence Rules

An NPC may emerge as an ally through multiple paths:

**Path 1: Trust-Respect**
- `trust >= 0.6` AND `respect >= 0.6`
- "This person is reliable and capable"

**Path 2: Friendship**
- `affection >= 0.5` AND `trust >= 0.5`
- "This person cares about me and I can trust them"

**Path 3: Debt**
- `debt >= 0.6` AND `respect >= 0.5`
- "I owe this person and they deserve it"

**Blocking Conditions:**
- `fear >= 0.5` - Too afraid to ally
- `resentment >= 0.5` - Too resentful to ally

### EmergenceDetectionResult

```typescript
interface EmergenceDetectionResult {
  eventId: string;
  opportunities: EmergenceOpportunity[];
  timestamp: string;
}

interface EmergenceOpportunity {
  type: 'villain' | 'ally';
  entity: Entity;
  confidence: number;                    // 0-1
  reason: string;                        // Human-readable explanation
  triggeringEventId: string;
  contributingFactors: Array<{
    dimension: string;
    value: number;
    threshold: number;
  }>;
}
```

### Confidence Calculation

**Villain Confidence:**
```
base = 0.5
+ 0.2 * (fear - 0.6) / 0.4         // How far above threshold
+ 0.2 * (resentment - 0.5) / 0.5
+ 0.1 if trust < 0.3
+ 0.1 if respect < 0.3
```

**Ally Confidence:**
```
base = 0.4
+ 0.2 for each satisfied path (trust-respect, friendship, debt)
+ multi-path bonus when 2+ paths converge
```

### DM Notification

When emergence is detected, the DM receives a notification:

```
EMERGENCE OPPORTUNITY DETECTED

Type: Villain Emergence
NPC: Guard Captain Marius
Confidence: 0.78

Contributing Factors:
- fear: 0.72 (threshold: 0.6)
- resentment: 0.65 (threshold: 0.5)
- trust: 0.2 (low)

Triggered by: Event #142 - "You threaten to expose his corruption"

Suggested Narrative Hook:
The guard captain has endured enough. His fear has turned to
desperate resentment. He may begin working against the player
in secret, perhaps aligning with existing enemies.
```

---

## Integration Guide

### ContentPipeline Integration

The EventBuilder integrates with ContentPipeline to structure all generated events:

```typescript
// In content-pipeline.ts
async generateContent(gameId: string, type: GenerationType) {
  // 1. Generate AI content
  const aiResponse = await this.aiService.generate(prompt);

  // 2. Extract AI-provided structured metadata (if any)
  const aiMetadata = this.extractAIStructuredMetadata(aiResponse);

  // 3. Build structured event data
  const structuredData = this.eventBuilder.buildFromGeneration({
    generationType: type,
    eventType: generatedContent.eventType,
    content: generatedContent.content,
    npcsPresent: context.npcsPresent,
    partyMembers: context.party,
    locationId: context.currentArea.id,
    metadata: aiMetadata,
  });

  // 4. Commit event with structured fields
  await this.eventRepository.create({
    ...baseEvent,
    ...structuredData,
  });

  // 5. Check for emergence
  const emergence = this.emergenceObserver.onEventCommitted(event);

  return { event, emergence };
}
```

### ContextBuilder Integration

Player patterns are included in AI generation context:

```typescript
// In context-builder.ts
async buildContext(gameId: string) {
  const patterns = this.patternObserver.getPlayerPatterns(gameId, playerId);

  return {
    ...baseContext,
    playerBehavior: {
      mercyTendency: patterns.behavioralRatios.mercyVsViolence > 0
        ? 'merciful' : 'ruthless',
      honestyTendency: patterns.behavioralRatios.honestyVsDeception > 0
        ? 'honest' : 'deceptive',
      socialStyle: patterns.socialApproach,
      traits: patterns.dominantTraits,
    },
  };
}
```

### AI Prompt Integration

Request structured metadata from AI when generating content:

```
## Output Format

Return JSON with narrative and structured metadata:

{
  "narrative": "The guard captain watches as you lower your sword...",
  "metadata": {
    "action": "spare_enemy",
    "targets": [{ "type": "npc", "id": "guard_captain" }],
    "witnesses": [{ "type": "npc", "id": "soldier_1" }]
  }
}

Use these action verbs when applicable:
- Mercy: spare_enemy, show_mercy, forgive, heal_enemy, release_prisoner
- Violence: kill, execute, attack_first, threaten, torture
- Honesty: tell_truth, confess, reveal_secret, keep_promise, lie, deceive
- Social: help, betray, befriend, insult, intimidate, persuade, bribe
```

---

## Developer Guide

### Adding New Actions

1. **Update shared vocabulary** in `packages/shared/src/game/actions.ts`:

```typescript
const HONESTY_ACTIONS = [
  'tell_truth',
  'confess',
  // Add new action
  'my_new_action',
] as const;
```

2. **Add classification patterns** in `packages/server/src/services/events/action-classifier.ts`:

```typescript
const HONESTY_PATTERNS: ActionPattern[] = [
  // ... existing patterns
  {
    pattern: /\b(my|new|action|keywords)\b/i,
    action: 'my_new_action',
    confidence: 0.85
  },
];
```

3. **Update tests** to cover the new action.

### Adding New Emergence Rules

1. **Define the rule** in `emergence-observer.ts`:

```typescript
private checkCustomEmergence(
  relationship: RelationshipDimensions,
  npc: Entity,
  event: CanonicalEvent
): EmergenceOpportunity | null {
  // Define conditions
  if (relationship.someDimension >= 0.7 && someOtherCondition) {
    return {
      type: 'custom',
      entity: npc,
      confidence: this.calculateConfidence(relationship),
      reason: 'Explanation of why this emergence is detected',
      triggeringEventId: event.id,
      contributingFactors: [
        { dimension: 'someDimension', value: relationship.someDimension, threshold: 0.7 },
      ],
    };
  }
  return null;
}
```

2. **Wire into `onEventCommitted`**:

```typescript
async onEventCommitted(event: CanonicalEvent) {
  // ... existing checks

  const customOpp = this.checkCustomEmergence(relationship, npc, event);
  if (customOpp) opportunities.push(customOpp);

  return { eventId: event.id, opportunities, timestamp: new Date().toISOString() };
}
```

### Testing Structured Events

```typescript
describe('EventBuilder', () => {
  it('extracts action from narrative', () => {
    const result = eventBuilder.buildFromGeneration({
      generationType: 'narration',
      eventType: 'player_action',
      content: 'You spare the wounded bandit, allowing him to flee',
      npcsPresent: [{ id: 'bandit-1', name: 'Bandit' }],
      partyMembers: [],
      locationId: 'area-1',
    });

    expect(result.action).toBe('spare_enemy');
    expect(result.actorType).toBe('player');
    expect(result.targetType).toBe('npc');
    expect(result.targetId).toBe('bandit-1');
    expect(result.tags).toContain('mercy');
  });
});

describe('PatternObserver', () => {
  it('detects merciful player', async () => {
    // Setup: Create events with mercy actions
    await createEvents([
      { action: 'spare_enemy' },
      { action: 'spare_enemy' },
      { action: 'show_mercy' },
      { action: 'kill' },
    ]);

    const patterns = observer.getPlayerPatterns(gameId, playerId);

    expect(patterns.behavioralRatios.mercyVsViolence).toBeGreaterThan(0);
    expect(patterns.dominantTraits).toContain('merciful');
  });
});
```

### Performance Considerations

1. **Index usage**: Structured queries use dedicated indexes. Ensure indexes exist:
   - `idx_events_action` for action queries
   - `idx_events_actor` for actor queries
   - `idx_events_target` for target queries

2. **Pattern caching**: ActionClassifier caches AI fallback results to avoid redundant API calls.

3. **Batch analysis**: When analyzing patterns across many events, use `getActionSummary` instead of fetching all events.

4. **Lazy emergence detection**: EmergenceObserver only checks NPCs involved in the current event, not all NPCs.

---

## Glossary

| Term | Definition |
|------|------------|
| **Action** | Standardized verb describing what happened (e.g., `spare_enemy`) |
| **Action Category** | Grouping of related actions (e.g., `mercy`, `violence`) |
| **Actor** | Entity that performed an action |
| **Target** | Entity affected by an action |
| **Witness** | Entity present but not directly involved |
| **Emergence** | Narrative opportunity arising from relationship/pattern thresholds |
| **Pattern** | Behavioral trend identified from event history |
| **Structured Event** | Event with queryable metadata fields |
