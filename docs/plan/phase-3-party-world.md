---
title: "Phase 3: Party System & World Generation"
type: plan
status: complete
created: 2026-01-11
updated: 2026-01-20
authors:
  - human
  - agent
related:
  - ../VISION.md
  - ./phase-2-dm-engine.md
tags:
  - planning
  - phase-3
  - party
  - world-generation
  - characters
---

# Phase 3: Party System & World Generation

## Overview

Expand the game from a single player character to a full party system, add party members to the UI, integrate them into AI generation, and implement dynamic world generation based on character creation.

## Goals

1. **Party System** - Multiple characters traveling together with distinct identities
2. **Party UI** - Visual representation of party members with health/status
3. **AI Integration** - Party members participate in generated content
4. **World Generation** - AI creates starting world tailored to the party
5. **Character Voices** - Different TTS voices for party member dialogue

---

## Current State

### What We Have

| Component | Status | Location |
|-----------|--------|----------|
| `Party` type | Defined | `@reckoning/shared/game/types.ts` |
| `Character` type | Defined | `@reckoning/shared/game/types.ts` |
| `CharacterStats` type | Defined | `@reckoning/shared/game/types.ts` |
| Single player character | Working | Created at game start |
| AI content generation | Working | `ContentPipeline` |
| TTS with voice roles | Working | `narrator`, `npc`, etc. |

### What We Need

| Component | Priority | Complexity |
|-----------|----------|------------|
| Party database tables | High | Low |
| Party repository | High | Low |
| Party API routes | High | Medium |
| Party UI panel | High | Medium |
| Party in AI context | High | Low |
| Character creation flow | Medium | Medium |
| World generation pipeline | Medium | High |
| Party member voices | Low | Low |

---

## Architecture

### Data Model

```
┌─────────────┐       ┌─────────────┐       ┌─────────────┐
│    Game     │──────▶│    Party    │──────▶│  Character  │
│             │  1:1  │             │  1:N  │             │
│  - id       │       │  - id       │       │  - id       │
│  - playerId │       │  - gameId   │       │  - partyId  │
│  - turn     │       │  - name     │       │  - name     │
└─────────────┘       └─────────────┘       │  - role     │ (archetype, not class)
                                            │  - health   │
                                            │  - type     │ (player/member/companion)
                                            └─────────────┘
```

**Character Types:**
- `player` - The main player character (exactly 1)
- `member` - Permanent party members (up to 2)
- `companion` - Temporary NPC companions (up to 2)

### Component Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         CLIENT                                   │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐ │
│  │ Party Panel │  │ Character   │  │ Party State Manager     │ │
│  │ Component   │  │ Cards       │  │ (extends GameState)     │ │
│  └─────────────┘  └─────────────┘  └─────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼ SSE + REST
┌─────────────────────────────────────────────────────────────────┐
│                         SERVER                                   │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐ │
│  │ Party       │  │ Character   │  │ World Generation        │ │
│  │ Routes      │  │ Repository  │  │ Pipeline                │ │
│  └─────────────┘  └─────────────┘  └─────────────────────────┘ │
│                         │                                        │
│                         ▼                                        │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │                    SQLite Database                           ││
│  │  parties │ characters │ areas │ npcs │ events               ││
│  └─────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────┘
```

---

## Contracts & Interfaces

All contracts must be defined before implementation begins. This section is the source of truth for cross-task boundaries.

### Shared Type Changes

The existing `Character` type needs migration to support party membership:

```typescript
// packages/shared/src/game/types.ts

/**
 * Character type indicating their relationship to the party
 */
export type CharacterType = 'player' | 'member' | 'companion';

/**
 * A player character or party member (UPDATED)
 */
export interface Character {
  id: string;
  name: string;
  description: string;
  /** Freeform archetype - not class-locked (e.g., "hacker", "medic", "warrior") */
  role: string;
  /** Character's relationship to the party */
  type: CharacterType;
  /** Current health points */
  health: number;
  /** Maximum health points */
  maxHealth: number;
  /** Order in party display (0 = first) */
  position: number;
  /** Optional portrait identifier */
  portrait?: string;
  /** If companion, the NPC they originated from */
  sourceNpcId?: string;
}

// DEPRECATION: Remove CharacterStats interface and `class` field
// Migration: Update all usages of character.stats.health → character.health
```

### New Shared Types

```typescript
// packages/shared/src/game/beats.ts

export type BeatType = 'narration' | 'dialogue' | 'action' | 'environment';

export interface NarrativeBeat {
  id: string;
  type: BeatType;
  /** null for narration/environment, character name for dialogue/action */
  speaker: string | null;
  /** Short text content (1-2 sentences max) */
  content: string;
  /** Order in sequence (0-indexed) */
  position: number;
}

export interface BeatSequence {
  id: string;
  gameId: string;
  turn: number;
  beats: NarrativeBeat[];
  status: 'pending' | 'editing' | 'approved';
  createdAt: string;
}

// packages/shared/src/game/types.ts (additions)

export interface Party {
  id: string;
  gameId: string;
  name: string;
  members: Character[];
  createdAt: string;
}

export interface PartyWithMembers extends Omit<Party, 'members'> {
  members: Character[];
}
```

### Repository Pattern

All repositories follow this pattern:

```typescript
// packages/server/src/repositories/base.ts

import type { Database } from 'better-sqlite3';
import { randomUUID } from 'crypto';

/**
 * Base repository pattern for all data access
 *
 * Conventions:
 * - Methods return entity or null (not undefined)
 * - Methods throw on database errors (let caller handle)
 * - Use randomUUID() for ID generation
 * - Timestamps use ISO 8601 strings
 */
export abstract class BaseRepository {
  constructor(protected db: Database) {}

  protected generateId(): string {
    return randomUUID();
  }

  protected now(): string {
    return new Date().toISOString();
  }
}
```

### API Request/Response Contracts

```typescript
// packages/shared/src/api/party.ts

// GET /api/game/:gameId/party
export interface GetPartyResponse {
  party: PartyWithMembers;
}

// POST /api/game/:gameId/party/members
export interface AddCharacterRequest {
  name: string;
  description: string;
  role: string;
  type?: 'member' | 'companion';  // defaults to 'member'
}

export interface AddCharacterResponse {
  character: Character;
}

// PUT /api/game/:gameId/party/members/:charId
export interface UpdateCharacterRequest {
  name?: string;
  description?: string;
  role?: string;
}

export interface UpdateCharacterResponse {
  character: Character;
}

// PUT /api/game/:gameId/party/members/:charId/health
export interface UpdateHealthRequest {
  health: number;
}

export interface UpdateHealthResponse {
  character: Character;
  /** Previous health value */
  previousHealth: number;
}

// DELETE /api/game/:gameId/party/members/:charId
export interface RemoveCharacterResponse {
  success: true;
  removedId: string;
}

// Error responses (all endpoints)
export interface APIError {
  error: {
    code: string;
    message: string;
  };
}
```

### SSE Event Contracts

```typescript
// packages/shared/src/game/events.ts (additions)

/**
 * SSE event for party changes
 */
export interface PartyChangedEvent {
  type: 'party_changed';
  changeType: 'member_added' | 'member_removed' | 'member_updated' | 'health_changed';
  partyId: string;
  character: Character;
  /** For health_changed, the previous value */
  previousHealth?: number;
  timestamp: string;
}

/**
 * SSE event for beat sequence updates
 */
export interface BeatsGeneratedEvent {
  type: 'beats_generated';
  sequence: BeatSequence;
  timestamp: string;
}

/**
 * SSE event for beat playback progress
 */
export interface BeatPlaybackEvent {
  type: 'beat_playback';
  sequenceId: string;
  beatId: string;
  status: 'started' | 'completed';
  timestamp: string;
}

// Update SSEEvent union:
export type SSEEvent =
  | GenerationStartedEvent
  | GenerationCompleteEvent
  | GenerationErrorEvent
  | StateChangedEvent
  | TTSStartedEvent
  | TTSCompleteEvent
  | EditorStateEvent
  | PartyChangedEvent      // NEW
  | BeatsGeneratedEvent    // NEW
  | BeatPlaybackEvent;     // NEW
```

### AI Output Schemas

```typescript
// packages/server/src/services/ai/schemas.ts

export const BEAT_SEQUENCE_SCHEMA: OutputSchema = {
  name: 'beat_sequence',
  schema: {
    type: 'object',
    properties: {
      beats: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            type: {
              type: 'string',
              enum: ['narration', 'dialogue', 'action', 'environment']
            },
            speaker: { type: ['string', 'null'] },
            content: { type: 'string' }
          },
          required: ['type', 'content']
        },
        minItems: 3,
        maxItems: 8
      }
    },
    required: ['beats']
  }
};

// WORLD_GENERATION_SCHEMA already defined in task 5.1
```

### Character Voice Mapping

```typescript
// packages/server/src/services/tts/voice-registry.ts

export interface CharacterVoiceMapping {
  characterId: string;
  voiceId: string;
  /** ElevenLabs voice preset */
  preset: 'narrator' | 'character' | 'npc';
}

export interface VoiceRegistry {
  /** Get voice for a character, returns default narrator if not mapped */
  getVoiceForCharacter(characterId: string): string;
  /** Get voice for a character by name (for AI-generated content) */
  getVoiceForCharacterName(name: string, partyId: string): string;
  /** Register a voice for a character */
  setVoiceForCharacter(characterId: string, voiceId: string): void;
}
```

### Migration Strategy: Beats System

The beats system replaces the single-content generation flow:

```
BEFORE (Phase 2):
┌─────────────┐     ┌──────────────────┐     ┌───────────┐
│ ContentPipe │────▶│ GeneratedContent │────▶│ DMEditor  │
│   .generate │     │   (single text)  │     │ (textarea)│
└─────────────┘     └──────────────────┘     └───────────┘

AFTER (Phase 3):
┌─────────────┐     ┌──────────────────┐     ┌───────────┐
│ ContentPipe │────▶│   BeatSequence   │────▶│BeatEditor │
│   .generate │     │   (beat array)   │     │  (list)   │
└─────────────┘     └──────────────────┘     └───────────┘
```

**Coexistence Strategy:**
1. Add `outputMode: 'single' | 'beats'` to generation options
2. Default to `'beats'` for new games
3. ContentPipeline returns `GeneratedContent | BeatSequence` based on mode
4. Client detects type and renders appropriate editor
5. Remove `'single'` mode in Phase 4

---

## Implementation Tasks

### Stream 1: Database & Backend (Foundation)

These tasks must be completed first as other work depends on them.

#### 1.1 Database Schema Updates
**Priority:** Critical | **Estimate:** Small | **Depends on:** Nothing

Add party and character tables to SQLite schema.

```sql
-- packages/server/src/db/schema.sql

CREATE TABLE IF NOT EXISTS parties (
  id TEXT PRIMARY KEY,
  game_id TEXT NOT NULL REFERENCES games(id),
  name TEXT NOT NULL DEFAULT 'The Party',
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(game_id)  -- One party per game
);

CREATE TABLE IF NOT EXISTS characters (
  id TEXT PRIMARY KEY,
  party_id TEXT NOT NULL REFERENCES parties(id),
  name TEXT NOT NULL,
  description TEXT,
  role TEXT,                              -- Freeform archetype (e.g., "hacker", "medic", "pilot")
  health INTEGER NOT NULL DEFAULT 100,
  max_health INTEGER NOT NULL DEFAULT 100,
  type TEXT NOT NULL DEFAULT 'member',    -- 'player' | 'member' | 'companion'
  position INTEGER NOT NULL DEFAULT 0,    -- Order in party
  portrait TEXT,                          -- Optional portrait identifier
  source_npc_id TEXT REFERENCES npcs(id), -- If companion, link to original NPC
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),

  -- Enforce limits via application logic:
  -- - Exactly 1 player type per party
  -- - Max 2 member types per party
  -- - Max 2 companion types per party
  CHECK (type IN ('player', 'member', 'companion'))
);

CREATE INDEX idx_characters_party ON characters(party_id);
CREATE INDEX idx_characters_type ON characters(type);
```

**Acceptance Criteria:**
- [ ] Tables created on fresh database
- [ ] Migrations work on existing databases
- [ ] Foreign key constraints enforced

**Testing:**
- [ ] Unit test: Schema creation on empty database
- [ ] Unit test: Schema migration on database with existing data

---

#### 1.2 Party Repository
**Priority:** Critical | **Estimate:** Small | **Depends on:** 1.1

Create repository for party CRUD operations.

```typescript
// packages/server/src/repositories/party-repository.ts

export class PartyRepository {
  constructor(private db: Database) {}

  create(gameId: string, name?: string): Party
  findByGameId(gameId: string): Party | null
  getWithMembers(gameId: string): Party & { members: Character[] } | null
  update(partyId: string, updates: Partial<Party>): Party
  delete(partyId: string): void
}
```

**Acceptance Criteria:**
- [ ] All CRUD operations working
- [ ] Returns null for non-existent parties

**Testing:**
- [ ] Unit test: create() generates valid UUID and timestamps
- [ ] Unit test: findByGameId() returns null for missing game
- [ ] Unit test: getWithMembers() returns party with populated members array
- [ ] Unit test: delete() cascades to remove orphan characters

---

#### 1.3 Character Repository
**Priority:** Critical | **Estimate:** Small | **Depends on:** 1.1

Create repository for character CRUD operations.

```typescript
// packages/server/src/repositories/character-repository.ts

export class CharacterRepository {
  constructor(private db: Database) {}

  create(partyId: string, data: CreateCharacterData): Character
  findById(id: string): Character | null
  findByPartyId(partyId: string): Character[]
  getPlayerCharacter(partyId: string): Character | null
  update(id: string, updates: Partial<Character>): Character
  updateHealth(id: string, health: number): Character
  delete(id: string): void
  reorder(partyId: string, characterIds: string[]): void
}
```

**Acceptance Criteria:**
- [ ] All CRUD operations working
- [ ] Player character retrieval working
- [ ] Health updates working
- [ ] Enforces party limits (1 player, 2 members, 2 companions)

**Testing:**
- [ ] Unit test: create() with each character type
- [ ] Unit test: getPlayerCharacter() returns only type='player'
- [ ] Unit test: updateHealth() clamps to 0-maxHealth range
- [ ] Unit test: reorder() updates position values correctly
- [ ] Unit test: create() rejects when party limit exceeded

---

#### 1.4 Party API Routes
**Priority:** High | **Estimate:** Medium | **Depends on:** 1.2, 1.3

Add REST endpoints for party management.

```typescript
// packages/server/src/routes/party.ts

GET  /api/game/:gameId/party          // Get party with members
POST /api/game/:gameId/party/members  // Add character to party
PUT  /api/game/:gameId/party/members/:charId  // Update character
DELETE /api/game/:gameId/party/members/:charId  // Remove character
PUT  /api/game/:gameId/party/members/:charId/health  // Update health
```

**Acceptance Criteria:**
- [ ] All endpoints returning correct data per API contracts
- [ ] Validation for required fields (400 on missing)
- [ ] Error handling for invalid requests (404 for missing game/character)
- [ ] SSE events emitted for party changes

**Testing:**
- [ ] Integration test: GET party returns full member list
- [ ] Integration test: POST member validates required fields
- [ ] Integration test: PUT health emits SSE event
- [ ] Integration test: DELETE member returns 404 for invalid ID
- [ ] Integration test: Party limit enforcement returns 400

---

#### 1.5 Update Game Creation Flow
**Priority:** High | **Estimate:** Small | **Depends on:** 1.2, 1.3

Modify game creation to automatically create party and player character.

```typescript
// When creating a new game:
1. Create game record
2. Create party for game
3. Create player character in party (isPlayer: true)
4. Return complete session with party data
```

**Acceptance Criteria:**
- [ ] New games have party created automatically
- [ ] Player character created and linked
- [ ] GameSession includes party data
- [ ] Existing game creation tests still pass

**Testing:**
- [ ] Integration test: POST /api/game/new creates game + party + player character
- [ ] Integration test: Response includes party with one member (type='player')
- [ ] Regression test: Existing game API tests pass unchanged

---

### Stream 2: Client UI (Can Parallel with Stream 1)

UI work can begin with mock data while backend is being built.

#### 2.1 Party Panel Component
**Priority:** High | **Estimate:** Medium | **Depends on:** Nothing (can mock)

Create the party panel UI component.

```typescript
// packages/client/src/components/party-panel.ts

export class PartyPanel {
  constructor(config: { containerId: string }, stateManager: GameStateManager)

  render(): void
  update(party: Party): void
  destroy(): void
}
```

**UI Layout:**
```
┌─────────────────────────────┐
│ THE PARTY                   │
├─────────────────────────────┤
│ ┌─────┐ Alex Chen     [PC] │
│ │     │ Ex-Detective        │
│ │     │ ████████░░ 80/100  │
│ └─────┘                     │
├─────────────────────────────┤
│ ┌─────┐ MARI-7              │
│ │     │ Android Medic       │
│ │     │ ██████████ 50/50   │
│ └─────┘                     │
├─────────────────────────────┤
│ ┌─────┐ Old Pete    [NPC]  │
│ │     │ Local Guide         │
│ │     │ ███████░░░ 70/100  │
│ └─────┘                     │
└─────────────────────────────┘

[PC] = Player Character
[NPC] = Temporary Companion
```

**Acceptance Criteria:**
- [ ] Panel renders with mock data
- [ ] Character cards show name, role, health bar
- [ ] Health bar updates visually
- [ ] Responsive layout
- [ ] Player character visually distinguished with [PC] badge

**Testing:**
- [ ] Unit test: PartyPanel.render() creates correct DOM structure
- [ ] Unit test: PartyPanel.update() re-renders on party change
- [ ] Unit test: Health bar shows correct percentage width
- [ ] Visual test: Screenshot comparison at different viewport widths

---

#### 2.2 Party State in Client
**Priority:** High | **Estimate:** Small | **Depends on:** 2.1

Extend GameStateManager to include party state.

```typescript
// packages/client/src/state/game-state.ts

interface GameClientState {
  // ... existing fields
  party: Party | null;
}

// Add methods:
updatePartyMember(charId: string, updates: Partial<Character>): void
getPartyMember(charId: string): Character | null
```

**Acceptance Criteria:**
- [ ] Party state stored in client
- [ ] SSE `party_changed` events update party state
- [ ] UI re-renders on party changes

**Testing:**
- [ ] Unit test: Initial state has party: null
- [ ] Unit test: SSE member_added event adds character to state
- [ ] Unit test: SSE health_changed event updates correct character
- [ ] Unit test: Subscribers notified on party state change

---

#### 2.3 Character Card Component
**Priority:** Medium | **Estimate:** Small | **Depends on:** 2.1

Reusable character card for party panel.

```typescript
// packages/client/src/components/character-card.ts

export class CharacterCard {
  constructor(character: Character, isPlayer: boolean)

  render(): HTMLElement
  updateHealth(current: number, max: number): void
  setActive(active: boolean): void  // Highlight when speaking/acting
}
```

**Acceptance Criteria:**
- [ ] Card renders character info (name, role, type badge)
- [ ] Health bar animates on change (CSS transition)
- [ ] Active state visible (highlight border/glow)
- [ ] Click handler for selection (future use)

**Testing:**
- [ ] Unit test: render() returns valid HTMLElement with correct structure
- [ ] Unit test: updateHealth() triggers CSS transition class
- [ ] Unit test: setActive(true) adds 'active' class
- [ ] Unit test: Player character shows [PC] badge, companion shows [NPC]

---

#### 2.4 Integrate Party Panel into Main Layout
**Priority:** High | **Estimate:** Small | **Depends on:** 2.1, 2.2

Add party panel to the game UI layout.

```html
<!-- index.html -->
<div id="game-ui">
  <div id="left-panel">
    <div id="party-panel"></div>      <!-- NEW -->
  </div>
  <div id="center-panel">
    <div id="narrator-output"></div>
    <div id="dm-editor"></div>
  </div>
  <div id="right-panel">
    <div id="controls"></div>
  </div>
</div>
```

**Acceptance Criteria:**
- [ ] Party panel visible in left column of game UI
- [ ] Layout responsive (stacks on mobile)
- [ ] Panel updates when GameStateManager emits party changes

**Testing:**
- [ ] Integration test: Party panel initializes with state from GameStateManager
- [ ] Integration test: Adding character via API updates panel
- [ ] Visual test: Layout at 1920px, 1024px, 768px, 375px widths

---

#### 2.5 Speech Bubbles in Party Panel
**Priority:** Medium | **Estimate:** Medium | **Depends on:** 2.1, 4.3

Add speech bubbles next to character avatars for dialogue display.

```typescript
// packages/client/src/components/speech-bubble.ts

export class SpeechBubble {
  constructor(characterCard: CharacterCard)

  show(text: string): void
  hide(): void
  setPlaying(playing: boolean): void  // Show ▶ indicator
  onClick(callback: () => void): void  // Replay line
}
```

**UI Behavior:**
```
┌─────┐ Alex     [PC]
│     │ Ex-Detective
│     │ ████░░ 80/100
└─────┘
   ╭───────────────╮
   │ "Everyone     │
   │  stay behind  │
   │  me."     ▶   │  ◄─ Speech bubble with play indicator
   ╰───────────────╯
```

**Features:**
- Appears below character when they have dialogue
- Shows ▶ indicator during TTS playback
- Fades out after playback completes
- Click to replay the line
- Color matches character's assigned color

**Acceptance Criteria:**
- [ ] Bubble appears when character has dialogue beat
- [ ] Shows current line during TTS playback
- [ ] Fades after 3-5 seconds post-playback
- [ ] Click replays the line with TTS
- [ ] Multiple bubbles stack vertically without overlap

**Testing:**
- [ ] Unit test: show() creates bubble DOM element
- [ ] Unit test: setPlaying(true) shows play indicator
- [ ] Unit test: hide() triggers fade-out animation
- [ ] Unit test: onClick callback fires on bubble click
- [ ] Integration test: SSE beat_playback event triggers bubble display

---

### Stream 3: AI Integration (Depends on Stream 1)

#### 3.1 Include Party in AI Context
**Priority:** High | **Estimate:** Small | **Depends on:** 1.2, 1.3

Update ContextBuilder to include party information.

```typescript
// packages/server/src/services/ai/context-builder.ts

// Add to context:
- Party name
- Each character: name, class, health status, description
- Who is the player character
- Recent actions by each character
```

**Context Format:**
```
## The Party

**Kira the Brave** (Player Character)
- Class: Warrior
- Health: 80/100 (Wounded)
- Description: A battle-scarred veteran with a mysterious past

**Eldrin**
- Class: Mage
- Health: 50/50 (Healthy)
- Description: A young wizard seeking forbidden knowledge

**Thom**
- Class: Ranger
- Health: 70/100 (Lightly wounded)
- Description: A quiet tracker from the northern forests
```

**Acceptance Criteria:**
- [ ] Party context included in prompts
- [ ] Health status described narratively (Healthy/Wounded/Critical)
- [ ] Player character marked with "(Player Character)"
- [ ] Context under 500 tokens for typical 3-member party

**Testing:**
- [ ] Unit test: buildPartyContext() formats party correctly
- [ ] Unit test: Health thresholds map correctly (>70%=Healthy, >30%=Wounded, else Critical)
- [ ] Unit test: Empty party produces minimal context
- [ ] Unit test: Context token count within budget

---

#### 3.2 Party Member Actions in Generation
**Priority:** Medium | **Estimate:** Medium | **Depends on:** 3.1

Update AI prompts to generate party member actions.

```typescript
// Update system prompt to include:
- Party members can take actions
- AI suggests what party members do/say
- DM can override any party member action
- Different characters have different personalities
```

**Generation Types to Update:**
- `party_action` - A party member does something
- `party_dialogue` - A party member speaks
- Include speaker in metadata

**Acceptance Criteria:**
- [ ] AI generates actions for party members by name
- [ ] Speaker identified in beat metadata
- [ ] Actions reflect character descriptions
- [ ] DM can edit/reject any beat

**Testing:**
- [ ] Integration test: Generation with 3-member party includes actions from multiple characters
- [ ] Unit test: Beat parsing extracts speaker correctly
- [ ] Unit test: System prompt includes party member instructions

---

#### 3.3 Party Member TTS Voices
**Priority:** Low | **Estimate:** Small | **Depends on:** 3.2

Assign different TTS voices to party members.

```typescript
// packages/server/src/services/tts/voice-registry.ts

// Add character voice mappings
interface CharacterVoiceMapping {
  characterId: string;
  voiceId: string;
  preset: string;
}

// When speaking party dialogue:
1. Check if speaker is a party member
2. Look up character's voice mapping
3. Use character voice instead of default
```

**Acceptance Criteria:**
- [ ] Each party member can have unique voice
- [ ] Falls back to narrator voice if not configured
- [ ] Voice mapping persists in database

**Testing:**
- [ ] Unit test: getVoiceForCharacter() returns mapped voice
- [ ] Unit test: getVoiceForCharacter() returns default for unmapped character
- [ ] Unit test: getVoiceForCharacterName() looks up by name within party
- [ ] Integration test: TTS uses correct voice for party member dialogue

---

### Stream 4: Narrative Beats System (Core Change)

This changes how content is generated and presented.

#### 4.1 Narrative Beat Schema
**Priority:** High | **Estimate:** Small | **Depends on:** Nothing

Define the beat structure for AI output.

```typescript
// packages/shared/src/game/beats.ts

export interface NarrativeBeat {
  id: string;
  type: 'narration' | 'dialogue' | 'action' | 'environment';
  speaker: string | null;     // null for narration, character name for dialogue
  content: string;            // Short text (1-2 sentences max)
  position: number;           // Order in sequence
}

export interface BeatSequence {
  id: string;
  gameId: string;
  beats: NarrativeBeat[];
  status: 'pending' | 'editing' | 'approved';
}
```

**AI Output Schema:**
```json
{
  "beats": [
    { "type": "narration", "speaker": null, "content": "The door creaks open." },
    { "type": "dialogue", "speaker": "Alex", "content": "Everyone stay behind me." },
    { "type": "narration", "speaker": null, "content": "A cold draft rushes past." }
  ]
}
```

**Acceptance Criteria:**
- [ ] Beat types defined in `@reckoning/shared`
- [ ] JSON schema for AI output defined in schemas.ts
- [ ] Types exported from shared package index

**Testing:**
- [ ] Unit test: TypeScript compiles with strict mode
- [ ] Unit test: JSON schema validates correct beat structure
- [ ] Unit test: JSON schema rejects invalid beat types

---

#### 4.2 Update AI Generation for Beats
**Priority:** High | **Estimate:** Medium | **Depends on:** 4.1, 3.1

Modify prompts and parsing to generate beat sequences.

```typescript
// Update system prompt:
"Generate a sequence of 3-6 short narrative beats.
Each beat should be 1-2 sentences maximum.
Use dialogue beats for character speech.
Use narration beats for descriptions and actions."

// Update ContentPipeline to parse beats array
// Store pending BeatSequence instead of single content string
```

**Acceptance Criteria:**
- [ ] AI generates beat arrays (3-8 beats per sequence)
- [ ] Beats are short (1-2 sentences, under 100 chars)
- [ ] Speaker correctly identified for dialogue/action beats
- [ ] Parser handles BEAT_SEQUENCE_SCHEMA response

**Testing:**
- [ ] Integration test: ContentPipeline.generate() returns BeatSequence
- [ ] Unit test: parseBeatsResponse() handles valid JSON
- [ ] Unit test: parseBeatsResponse() falls back gracefully on malformed JSON
- [ ] Unit test: Beat content length validation

---

#### 4.3 Beat Sequence Editor UI
**Priority:** High | **Estimate:** Medium | **Depends on:** 4.1

Replace single-text DM editor with beat sequence editor.

```typescript
// packages/client/src/components/beat-editor.ts

export class BeatEditor {
  constructor(config: { containerId: string }, stateManager: GameStateManager)

  render(): void
  setBeats(beats: NarrativeBeat[]): void
  getBeats(): NarrativeBeat[]

  // Beat operations
  reorderBeat(beatId: string, newPosition: number): void
  editBeat(beatId: string, content: string): void
  deleteBeat(beatId: string): void
  addBeat(beat: Partial<NarrativeBeat>): void

  // Playback
  playAll(): void
  playNext(): void
  stop(): void
}
```

**UI Layout - Two Panel Approach:**

The Party Panel shows characters with speech bubbles for their lines.
The Beat Editor shows structured, color-coded, collapsible beats.

```
┌─────────────────────────────────────────────────────────────────────────┐
│                              GAME UI                                     │
├────────────────────────┬────────────────────────────────────────────────┤
│     PARTY PANEL        │              NARRATOR OUTPUT                    │
│                        │                                                 │
│ ┌─────┐ Alex     [PC]  │  ┌─────────────────────────────────────────┐   │
│ │     │ Ex-Detective   │  │ "The door creaks open slowly."          │   │
│ │     │ ████░░ 80/100  │  │                                         │   │
│ └─────┘                │  │ "A cold draft rushes past."             │   │
│    ╭───────────────╮   │  │                                         │   │
│    │ "Everyone     │   │  │ "Something stirs in the darkness."      │   │
│    │  stay behind  │   │  └─────────────────────────────────────────┘   │
│    │  me."     ▶   │   │                                                 │
│    ╰───────────────╯   │                                                 │
│                        │                                                 │
│ ┌─────┐ MARI-7         │                                                 │
│ │     │ Android Medic  │                                                 │
│ │     │ ████████ 50/50 │                                                 │
│ └─────┘                │                                                 │
│    ╭───────────────╮   │                                                 │
│    │ "Detecting    │   │                                                 │
│    │  movement     │   │                                                 │
│    │  ahead."  ▶   │   │                                                 │
│    ╰───────────────╯   │                                                 │
│                        │                                                 │
│ ┌─────┐ Old Pete [NPC] │                                                 │
│ │     │ Local Guide    │                                                 │
│ │     │ ██████░░ 70/100│                                                 │
│ └─────┘                │                                                 │
└────────────────────────┴────────────────────────────────────────────────┘
```

**Beat Editor (Structured, Collapsible, Color-Coded):**

```
┌─────────────────────────────────────────────────────────────────────────┐
│ SCENE BEATS                                    [▶ Play All] [✓ Accept] │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ▼ ≡ 1. NARRATION                                              [✏️][🗑️] │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │ The door creaks open slowly.                                     │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                                                                         │
│  ▼ ≡ 2. ALEX (Dialogue)                                        [✏️][🗑️] │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │ "Everyone stay behind me."                                       │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                                                                         │
│  ▶ ≡ 3. NARRATION (collapsed)                                  [✏️][🗑️] │
│                                                                         │
│  ▶ ≡ 4. MARI-7 (collapsed)                                     [✏️][🗑️] │
│                                                                         │
│  ▼ ≡ 5. ENVIRONMENT                                            [✏️][🗑️] │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │ Something stirs in the darkness.                                 │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                                                                         │
├─────────────────────────────────────────────────────────────────────────┤
│ [+ Add Beat]                                         [🔄 Regenerate All] │
└─────────────────────────────────────────────────────────────────────────┘

Color Coding:
┌─────────────────────────────────────────────┐
│  NARRATION    - Gray/neutral background     │
│  DIALOGUE     - Blue tint (character color) │
│  ACTION       - Yellow/amber tint           │
│  ENVIRONMENT  - Green tint                  │
└─────────────────────────────────────────────┘

Features:
- ▼/▶ = Expand/collapse individual beats
- ≡ = Drag handle for reordering
- Click beat header to collapse/expand
- Color indicates beat type at a glance
- Character dialogue shows character name & color
- Inline editing when expanded
- [Collapse All] / [Expand All] toggle
```

Speech Bubble Features (Party Panel):
- Appears next to character avatar when they have dialogue
- Shows current line being spoken (with ▶ indicator)
- Fades after playback
- Can click to replay individual line
- Color matches character's assigned color

**Acceptance Criteria:**
- [ ] Beats displayed in collapsible list
- [ ] Drag-and-drop reordering works
- [ ] Edit individual beats inline
- [ ] Delete beats with confirmation
- [ ] Add new beats with type selector
- [ ] Play sequence with TTS
- [ ] Color coding by beat type

**Testing:**
- [ ] Unit test: BeatEditor.render() creates correct DOM structure
- [ ] Unit test: reorderBeat() updates position values
- [ ] Unit test: editBeat() updates beat content
- [ ] Unit test: deleteBeat() removes beat from sequence
- [ ] Unit test: addBeat() inserts at correct position
- [ ] Integration test: Drag-and-drop fires reorder events
- [ ] Visual test: Color coding matches design spec

---

#### 4.4 Sequential TTS Playback
**Priority:** High | **Estimate:** Small | **Depends on:** 4.3

Play beats in sequence with appropriate voices.

```typescript
// packages/client/src/services/tts/index.ts

// Add method to queue beat sequence:
async speakSequence(beats: NarrativeBeat[]): Promise<void> {
  for (const beat of beats) {
    const voice = beat.speaker
      ? getVoiceForCharacter(beat.speaker)
      : 'narrator';

    await this.speak({
      text: beat.content,
      role: voice,
    });
  }
}
```

**Acceptance Criteria:**
- [ ] Beats play in order (await each before next)
- [ ] Correct voice per speaker (narrator for null speaker)
- [ ] Can pause/stop sequence mid-playback
- [ ] Visual indicator highlights current beat
- [ ] SSE beat_playback events emitted

**Testing:**
- [ ] Unit test: speakSequence() calls speak() for each beat
- [ ] Unit test: Speaker name maps to correct voice
- [ ] Unit test: stop() cancels pending TTS requests
- [ ] Integration test: Beat playback emits SSE events
- [ ] Integration test: UI highlights beat during playback

---

### Stream 5: World Generation (Depends on Stream 1, 3)

#### 5.1 World Generation Schema
**Priority:** Medium | **Estimate:** Small | **Depends on:** Nothing

Define output schema for world generation.

```typescript
// packages/server/src/services/ai/schemas.ts

export const WORLD_GENERATION_SCHEMA: OutputSchema = {
  name: 'world_generation',
  schema: {
    type: 'object',
    properties: {
      startingArea: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          description: { type: 'string' },
          atmosphere: { type: 'string' },
          tags: { type: 'array', items: { type: 'string' } }
        }
      },
      connectedAreas: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            direction: { type: 'string' },
            teaser: { type: 'string' }  // Brief hint, not full description
          }
        }
      },
      initialNPCs: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            description: { type: 'string' },
            disposition: { type: 'string' },
            hook: { type: 'string' }  // Story hook involving this NPC
          }
        }
      },
      storyHooks: {
        type: 'array',
        items: { type: 'string' }
      }
    }
  }
};
```

**Acceptance Criteria:**
- [ ] Schema defined and exported from schemas.ts
- [ ] Matches expected AI output format
- [ ] Required fields: startingArea, connectedAreas

**Testing:**
- [ ] Unit test: Schema validates correct world structure
- [ ] Unit test: Schema rejects missing required fields
- [ ] Unit test: Schema handles optional storyHooks

---

#### 5.2 World Generation Pipeline
**Priority:** Medium | **Estimate:** Medium | **Depends on:** 5.1, 3.1

Create pipeline to generate initial world.

```typescript
// packages/server/src/services/world-generation/index.ts

export class WorldGenerator {
  constructor(
    private aiProvider: AIProvider,
    private areaRepo: AreaRepository,
    private npcRepo: NPCRepository
  )

  async generate(gameId: string, party: Party): Promise<GeneratedWorld> {
    // 1. Build prompt with party info
    // 2. Call AI with WORLD_GENERATION_SCHEMA
    // 3. Parse response
    // 4. Create areas in database
    // 5. Create NPCs in database
    // 6. Return generated world for DM review
  }
}
```

**Acceptance Criteria:**
- [ ] Generates starting area tailored to party theme
- [ ] Creates 2-3 connected areas with teasers
- [ ] Creates 1-2 NPCs with story hooks
- [ ] Provides 2-3 story hooks for DM
- [ ] All entities stored in database with correct relationships

**Testing:**
- [ ] Unit test: buildWorldPrompt() includes party context
- [ ] Unit test: parseWorldResponse() creates Area entities
- [ ] Unit test: parseWorldResponse() creates NPC entities
- [ ] Integration test: Full generation flow creates database records
- [ ] Integration test: Generated areas are linked via exits

---

#### 5.3 World Generation UI Flow
**Priority:** Medium | **Estimate:** Medium | **Depends on:** 5.2

Add world generation step after character creation.

```
New Game Flow:
1. Enter player name/description → Create player character
2. (Optional) Add party members
3. Generate World → AI creates starting area
4. DM Reviews World → Can edit/regenerate
5. Begin Game → First narration plays
```

**Acceptance Criteria:**
- [ ] World generation triggered after party creation
- [ ] Loading state with progress indicators
- [ ] DM can review generated world in preview modal
- [ ] DM can edit area descriptions before accepting
- [ ] DM can regenerate entire world
- [ ] Game starts with generated content after acceptance

**Testing:**
- [ ] Integration test: New game flow includes world generation step
- [ ] Integration test: Regenerate creates new world, discards old
- [ ] Unit test: Loading state shows correct status messages
- [ ] E2E test: Full new game flow from start to first narration

---

### Stream 6: Demo & Documentation

#### 6.1 Update Demo Script
**Priority:** High | **Estimate:** Small | **Depends on:** All other tasks

Update the demo script to showcase Phase 3 features with a polished walkthrough.

**Demo Flow:**
```
1. Start new game with party creation
   - Create player character (any theme)
   - Add 1-2 party members
   - Show party panel with all members

2. World generation demo
   - Trigger world generation
   - Show loading states
   - Preview generated world
   - Accept or regenerate

3. Narrative beats demo
   - Show beat sequence generation
   - Demonstrate beat editor features:
     - Expand/collapse beats
     - Reorder via drag-and-drop
     - Edit individual beats
     - Delete and add beats
   - Play sequence with TTS
   - Show speech bubbles on party panel

4. Party integration demo
   - Show health changes reflected in UI
   - Demonstrate party member actions in AI output
   - Show different TTS voices per character
```

**Script Location:** `scripts/demo.ts`

**Acceptance Criteria:**
- [ ] Demo runs without errors
- [ ] All Phase 3 features demonstrated
- [ ] Clear console output explaining each step
- [ ] Graceful handling of API failures
- [ ] Total demo duration under 3 minutes

**Testing:**
- [ ] Integration test: Demo script completes successfully
- [ ] Manual test: Demo is visually appealing and clear

---

## Dependency Graph

```
                    ┌─────────────────────────────────────────┐
                    │           PHASE 3 TASKS                  │
                    └─────────────────────────────────────────┘

STREAM 1 (Backend)           STREAM 2 (UI)              STREAM 3 (AI)
══════════════════           ════════════               ═════════════

┌─────────────┐              ┌─────────────┐
│ 1.1 Schema  │              │ 2.1 Party   │
│   Updates   │              │    Panel    │◄─── Can start with mocks
└──────┬──────┘              └──────┬──────┘
       │                            │
       ▼                            ▼
┌──────┴──────┐              ┌─────────────┐
│             │              │ 2.2 Party   │
│ ┌─────────┐ │              │    State    │
│ │1.2 Party│ │              └──────┬──────┘
│ │  Repo   │ │                     │
│ └────┬────┘ │              ┌──────┴──────┐
│      │      │              │ 2.3 Char    │
│ ┌────┴────┐ │              │    Card     │
│ │1.3 Char │ │              └──────┬──────┘
│ │  Repo   │ │                     │
│ └────┬────┘ │              ┌──────┴──────┐
│      │      │              │ 2.4 Layout  │
└──────┼──────┘              │ Integration │
       │                     └─────────────┘
       ▼
┌─────────────┐
│ 1.4 Party   │
│   Routes    │
└──────┬──────┘
       │
       ▼
┌─────────────┐              ┌─────────────┐
│ 1.5 Game    │─────────────▶│ 3.1 Party   │
│ Creation    │              │ in Context  │
└─────────────┘              └──────┬──────┘
                                    │
                             ┌──────┴──────┐
                             │ 3.2 Party   │
                             │   Actions   │
                             └──────┬──────┘
                                    │
                             ┌──────┴──────┐
                             │ 3.3 Party   │
                             │   Voices    │
                             └─────────────┘

STREAM 4 (Beats)             STREAM 5 (World Gen)
════════════════             ════════════════════

┌─────────────┐              ┌─────────────┐
│ 4.1 Beat    │◄─── Start    │ 5.1 World   │◄─── Start independently
│   Schema    │    early     │   Schema    │
└──────┬──────┘              └──────┬──────┘
       │                            │
       ├─────────────┐              │
       ▼             │              ▼
┌─────────────┐      │       ┌─────────────┐
│ 4.2 AI Beat │◄─────┼───────│ 5.2 World   │◄─── Depends on 3.1
│ Generation  │      │       │  Pipeline   │
└──────┬──────┘      │       └──────┬──────┘
       │             │              │
       ▼             │              ▼
┌─────────────┐      │       ┌─────────────┐
│ 4.3 Beat    │◄─────┘       │ 5.3 World   │◄─── Depends on 2.x
│   Editor    │              │   UI Flow   │
└──────┬──────┘              └─────────────┘
       │
       ▼
┌─────────────┐
│ 4.4 Seq TTS │
│  Playback   │
└─────────────┘
       │
       ▼
┌─────────────┐
│ 2.x Speech  │◄─── New task: speech bubbles in party panel
│   Bubbles   │
└─────────────┘
```

---

## Parallel Work Opportunities

### Can Start Immediately (No Dependencies)

| Task | Stream | Notes |
|------|--------|-------|
| 1.1 Schema Updates | Backend | Foundation for everything |
| 2.1 Party Panel | UI | Use mock data initially |
| 4.1 Beat Schema | Beats | Just type definitions |
| 5.1 World Schema | World Gen | Just type definitions |

### Can Parallel After Schema (1.1)

| Task | Stream | Notes |
|------|--------|-------|
| 1.2 Party Repository | Backend | |
| 1.3 Character Repository | Backend | Can parallel with 1.2 |
| 2.2 Party State | UI | |
| 2.3 Character Card | UI | |

### Require Backend Complete

| Task | Depends On | Notes |
|------|------------|-------|
| 1.4 Party Routes | 1.2, 1.3 | |
| 1.5 Game Creation | 1.2, 1.3 | |
| 3.1 Party Context | 1.2, 1.3 | |

### Final Integration

| Task | Depends On | Notes |
|------|------------|-------|
| 3.2 Party Actions | 3.1 | |
| 3.3 Party Voices | 3.2 | Low priority |
| 4.2 AI Beat Generation | 3.1, 4.1 | |
| 4.3 Beat Editor UI | 4.1, 4.2 | |
| 4.4 Sequential TTS | 4.3 | |
| 5.2 World Pipeline | 3.1, 5.1 | |
| 5.3 World UI Flow | 5.2, 2.x | |
| 6.1 Demo Script | All tasks | Final task - validates full integration |

---

## Suggested Bead Batches

### Batch 1: Foundation (Parallel)
```
[1.1] Schema Updates
[2.1] Party Panel Component (with mocks)
[4.1] Narrative Beat Schema
[5.1] World Generation Schema
```

### Batch 2: Repositories (Parallel)
```
[1.2] Party Repository
[1.3] Character Repository
[2.2] Party State in Client
[2.3] Character Card Component
```

### Batch 3: Integration
```
[1.4] Party API Routes
[1.5] Update Game Creation Flow
[2.4] Integrate Party Panel into Layout
```

### Batch 4: AI Integration & Beats
```
[3.1] Include Party in AI Context
[3.2] Party Member Actions in Generation
[4.2] Update AI Generation for Beats
```

### Batch 5: Beat Editor UI
```
[4.3] Beat Sequence Editor UI
[4.4] Sequential TTS Playback
[2.5] Speech Bubbles in Party Panel
```

### Batch 6: World Generation
```
[5.2] World Generation Pipeline
[5.3] World Generation UI Flow
```

### Batch 7: Polish (Optional)
```
[3.3] Party Member TTS Voices
```

### Batch 8: Demo & Validation (Final)
```
[6.1] Update Demo Script
```

---

## Acceptance Criteria (Phase Complete)

### Must Have
- [ ] Party panel visible in game UI
- [ ] Player character displayed with health
- [ ] Additional party members can be added
- [ ] AI generates content mentioning party members
- [ ] Health updates reflected in UI

### Should Have
- [ ] World generation creates tailored starting area
- [ ] DM can review/edit generated world
- [ ] Party members have distinct personalities in AI output

### Nice to Have
- [ ] Unique TTS voices per party member
- [ ] Character portraits
- [ ] Party member selection for focused actions

---

## Design Decisions

| Decision | Choice | Notes |
|----------|--------|-------|
| **Party Size** | 3 total (player + 2 others) | Keep it manageable for MVP |
| **Character Death** | DM determined | No special mechanics, narrative-driven |
| **NPC Companions** | Up to 2 can join party | Temporary party members |
| **Character Theme** | Anything goes | Not locked to fantasy - sci-fi, modern, etc. |
| **Narrative Style** | Short sequenced beats | Not long paragraphs |
| **Voice Assignment** | TBD | Automatic or manual selection |

### Narrative Beats System

Instead of generating one long paragraph, the AI generates a **sequence of short narrative beats**. Each beat is voiced separately, and the DM can reorder them before playback.

```
AI Generates Sequence:
┌────────────────────────────────────────────────────────────┐
│ Beat 1: [Narration] "The door creaks open slowly."         │
│ Beat 2: [Alex] "Everyone stay behind me."                  │
│ Beat 3: [Narration] "A cold draft rushes past."            │
│ Beat 4: [MARI-7] "Detecting movement ahead."               │
│ Beat 5: [Narration] "Something stirs in the darkness."     │
└────────────────────────────────────────────────────────────┘

DM Can:
- Reorder beats (drag & drop)
- Delete beats
- Edit individual beats
- Add new beats
- Play all in sequence
- Play one at a time
```

**Benefits:**
- Shorter, punchier narration
- Each character speaks separately (different TTS voices)
- DM has fine-grained control over pacing
- Can cut/add beats without regenerating everything

### Party Composition

```
┌─────────────────────────────────────────┐
│              THE PARTY (max 5)          │
├─────────────────────────────────────────┤
│  PERMANENT MEMBERS (max 3)              │
│  ├── Player Character (1)               │
│  └── Party Members (up to 2)            │
├─────────────────────────────────────────┤
│  TEMPORARY COMPANIONS (max 2)           │
│  └── NPCs who joined the party          │
└─────────────────────────────────────────┘
```

---

## Files to Create/Modify

### New Files
```
packages/server/src/repositories/party-repository.ts
packages/server/src/repositories/character-repository.ts
packages/server/src/routes/party.ts
packages/server/src/services/world-generation/index.ts
packages/shared/src/game/beats.ts
packages/client/src/components/party-panel.ts
packages/client/src/components/character-card.ts
packages/client/src/components/beat-editor.ts
packages/client/src/components/speech-bubble.ts
```

### Modified Files
```
packages/server/src/db/schema.sql
packages/server/src/repositories/index.ts
packages/server/src/routes/index.ts
packages/server/src/services/ai/context-builder.ts
packages/server/src/services/ai/schemas.ts
packages/server/src/services/ai/prompts/system.ts
packages/server/src/services/game-engine/content-pipeline.ts
packages/shared/src/index.ts
packages/shared/src/game/index.ts
packages/client/src/main.ts
packages/client/src/state/game-state.ts
packages/client/src/services/tts/index.ts
packages/client/index.html
packages/client/src/styles/main.css
```

---

*Document Version: 0.1 - Initial Planning*
*Created: January 2026*
