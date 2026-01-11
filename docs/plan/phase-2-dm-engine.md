---
title: "Phase 2: DM Engine & Minimal Playable Loop"
type: plan
status: active
created: 2026-01-10
updated: 2026-01-11
authors:
  - human
  - agent
related:
  - ../VISION.md
  - ./phase-1-tts-engine.md
tags:
  - planning
  - phase-2
  - dm-engine
  - game-loop
---

# Phase 2: DM Engine & Minimal Playable Loop

## Overview

The player acts as **Dungeon Master**. AI generates DM content (story, party actions, NPC responses), the human DM reviews/edits, then a narrator presents the approved content. Build for iterability.

## Core Model

```
┌─────────────────────────────────────────────────────────────┐
│                      EVENT LOOP                              │
│                                                              │
│   ┌──────────┐    ┌──────────┐    ┌──────────┐             │
│   │    AI    │───▶│    DM    │───▶│ Narrator │             │
│   │ Generates│    │  Edits   │    │ Presents │             │
│   └──────────┘    └──────────┘    └──────────┘             │
│        ▲               │               │                    │
│        │               │               ▼                    │
│        │          [regenerate]    [TTS plays]              │
│        │               │               │                    │
│        └───────────────┴───────────────┘                    │
│                   (next cycle)                              │
└─────────────────────────────────────────────────────────────┘
```

**Roles:**
- **AI (Claude)**: Generates story, party actions, NPC dialogue, environment responses
- **Human DM**: Reviews, edits (full rewrite), or requests regeneration
- **Narrator**: Presents approved content via TTS
- **Party Members**: Hybrid control - AI suggests actions, DM can override/inject

## Key Decisions

| Decision | Choice |
|----------|--------|
| Player Role | Dungeon Master (not adventurer) |
| AI Role | Content generator, DM assistant |
| Party Control | Hybrid - AI suggests, DM overrides/injects |
| Edit Capability | Full rewrite + request regeneration |
| AI Integration | Subprocess spawn of `claude` CLI |
| Persistence | SQLite file |
| Client-Server Sync | Server-Sent Events (SSE) |
| Pending State | Server-backed (survives refresh) |
| Event Loop Control | Hybrid (auto-advance with pause/step) |
| Event Classification | AI determines EventType during generation |
| AI Context | Full history with extension point for summarization |
| Build Philosophy | Flexible, iterable architecture |

---

## Event Loop (MVP)

### One Cycle:
```
1. AI GENERATES
   - Context: current scene, party state, recent events
   - Output: suggested content with EventType classification
   - Client notified via SSE when generation complete

2. DM REVIEWS
   - See generated content in editor panel
   - Options: Edit text, Request regenerate, Submit as-is
   - Editor state persisted server-side (survives refresh)

3. DM SUBMITS
   - Content becomes canonical
   - Event recorded to history

4. NARRATOR PRESENTS
   - TTS plays approved content
   - UI updates (area, party state, etc.)

5. NEXT TRIGGER (Hybrid Control)
   - Auto-advance: AI begins generating next content
   - DM can: Pause auto-advance, Step manually, Resume
   - Pacing controlled by DM, not forced
```

### Hybrid Controls:
```
┌─────────────────────────────────────────┐
│  [▶ Auto] [⏸ Pause] [⏭ Step] [⏹ Stop]  │
└─────────────────────────────────────────┘
- Auto: AI generates next content after submit (default)
- Pause: Stop auto-generation, wait for manual step
- Step: Generate one piece of content, then pause
- Stop: End current generation, return to idle
```

### Session Start Flow:
```
1. AI generates: Story premise, setting, party members
2. DM edits: Customize names, backgrounds, starting scenario
3. DM submits
4. Narrator: Sets scene, introduces party
5. Enter main event loop
```

---

## Sequence Diagrams

### Main Game Loop

```
┌────────┐     ┌────────┐     ┌────────┐     ┌────────┐     ┌────────┐
│ Client │     │ Server │     │   AI   │     │   DB   │     │  TTS   │
└───┬────┘     └───┬────┘     └───┬────┘     └───┬────┘     └───┬────┘
    │              │              │              │              │
    │ SSE Subscribe│              │              │              │
    │─────────────>│              │              │              │
    │              │              │              │              │
    │  POST /next  │              │              │              │
    │─────────────>│              │              │              │
    │              │              │              │              │
    │              │──SSE: generation_started──>│              │
    │<─────────────│              │              │              │
    │              │              │              │              │
    │              │  generate()  │              │              │
    │              │─────────────>│              │              │
    │              │              │              │              │
    │              │   content    │              │              │
    │              │<─────────────│              │              │
    │              │              │              │              │
    │              │──SSE: generation_complete─>│              │
    │<─────────────│              │              │              │
    │              │              │              │              │
    │ [DM reviews/edits in UI]    │              │              │
    │              │              │              │              │
    │ POST /submit │              │              │              │
    │─────────────>│              │              │              │
    │              │              │              │              │
    │              │  save event  │              │              │
    │              │─────────────────────────────>│              │
    │              │              │              │              │
    │              │──SSE: state_changed───────>│              │
    │<─────────────│              │              │              │
    │              │              │              │              │
    │              │  speak()     │              │              │
    │              │──────────────────────────────────────────>│
    │              │              │              │              │
    │              │──SSE: tts_started─────────>│              │
    │<─────────────│              │              │              │
    │              │              │              │              │
    │ [If auto-advance: loop back to /next]     │              │
    │              │              │              │              │
```

### SSE Connection Lifecycle

```
┌────────┐                          ┌────────┐
│ Client │                          │ Server │
└───┬────┘                          └───┬────┘
    │                                   │
    │ GET /api/game/:id/events          │
    │──────────────────────────────────>│
    │                                   │
    │   HTTP 200 (text/event-stream)    │
    │<──────────────────────────────────│
    │                                   │
    │   event: state_changed            │
    │   data: {"gameState": {...}}      │
    │<──────────────────────────────────│
    │                                   │
    │   event: generation_started       │
    │   data: {"contentType": "..."}    │
    │<──────────────────────────────────│
    │                                   │
    │   event: generation_complete      │
    │   data: {"content": {...}}        │
    │<──────────────────────────────────│
    │                                   │
    │   [Connection kept alive]         │
    │   [Heartbeat every 30s]           │
    │                                   │
    │ Client disconnects                │
    │──────────────────────────────────>│
    │                                   │
    │   [Server cleans up session]      │
    │                                   │
```

### Generation-Edit-Submit Flow

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        GENERATION PHASE                                  │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌─────────────┐     ┌─────────────┐     ┌─────────────┐              │
│  │ Build       │────>│ Call        │────>│ Parse       │              │
│  │ Context     │     │ Claude CLI  │     │ Response    │              │
│  └─────────────┘     └─────────────┘     └─────────────┘              │
│        │                                        │                       │
│        │ GameState                              │ GeneratedContent      │
│        │ History[]                              │ + EventType           │
│        │ DM Guidance                            │ + Metadata            │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                          REVIEW PHASE                                    │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                     DM EDITOR                                    │   │
│  │  ┌─────────────────────────────────────────────────────────┐   │   │
│  │  │  "Marcus steps forward, hand on his sword hilt..."      │   │   │
│  │  └─────────────────────────────────────────────────────────┘   │   │
│  │                                                                 │   │
│  │  [Accept]  [Edit]  [Regenerate]  [Inject]                      │   │
│  │      │        │          │           │                          │   │
│  │      ▼        ▼          ▼           ▼                          │   │
│  │  Submit    Open       Re-run      Clear &                       │   │
│  │  as-is    editor     with hint    compose                       │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         SUBMIT PHASE                                     │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌─────────────┐     ┌─────────────┐     ┌─────────────┐              │
│  │ Create      │────>│ Save to     │────>│ Queue for   │              │
│  │ Event       │     │ SQLite      │     │ TTS         │              │
│  └─────────────┘     └─────────────┘     └─────────────┘              │
│                                                 │                       │
│                                                 ▼                       │
│                                          ┌─────────────┐              │
│                                          │ Broadcast   │              │
│                                          │ via SSE     │              │
│                                          └─────────────┘              │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### Save/Load Flow

```
┌────────────────────────────────────────────────────────────┐
│                      SAVE GAME                              │
├────────────────────────────────────────────────────────────┤
│                                                            │
│  1. User clicks "Save"                                     │
│  2. Modal shows:                                           │
│     ┌────────────────────────────────┐                    │
│     │ Save Game                       │                    │
│     │ ┌────────────────────────────┐ │                    │
│     │ │ Save Name: [My Adventure  ]│ │                    │
│     │ └────────────────────────────┘ │                    │
│     │ Existing: ▼                    │                    │
│     │  - Tavern Escape (Turn 12)     │                    │
│     │  - Dragon Hunt (Turn 45)       │                    │
│     │ [Cancel]  [Save]               │                    │
│     └────────────────────────────────┘                    │
│  3. POST /api/game/:id/save {name: "..."}                 │
│  4. Server snapshots: GameState + History + Party + Area  │
│  5. Confirmation shown                                     │
│                                                            │
└────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────┐
│                      LOAD GAME                              │
├────────────────────────────────────────────────────────────┤
│                                                            │
│  1. User clicks "Load" (or visits fresh)                   │
│  2. GET /api/game/list                                     │
│  3. Modal shows:                                           │
│     ┌────────────────────────────────┐                    │
│     │ Load Game                       │                    │
│     │ ┌────────────────────────────┐ │                    │
│     │ │ ● Tavern Escape            │ │                    │
│     │ │   Turn 12 | 2h 15m         │ │                    │
│     │ │   Saved: Jan 10, 3:45pm    │ │                    │
│     │ ├────────────────────────────┤ │                    │
│     │ │ ○ Dragon Hunt              │ │                    │
│     │ │   Turn 45 | 8h 30m         │ │                    │
│     │ │   Saved: Jan 9, 11:20am    │ │                    │
│     │ └────────────────────────────┘ │                    │
│     │ [Cancel]  [New Game]  [Load]   │                    │
│     └────────────────────────────────┘                    │
│  4. POST /api/game/:id/load {slot: "..."}                 │
│  5. Server restores state, broadcasts via SSE             │
│  6. Client rehydrates UI                                   │
│                                                            │
└────────────────────────────────────────────────────────────┘
```

---

## Architecture (Built for Iteration)

### Server-Sent Events (SSE)

Real-time client updates via SSE stream:

```typescript
// SSE endpoint: GET /api/game/:id/events
// Client subscribes, server pushes updates

type SSEEvent =
  | { type: 'generation_started'; contentType: string }
  | { type: 'generation_complete'; content: GeneratedContent }
  | { type: 'generation_error'; error: string }
  | { type: 'state_changed'; state: GameState }
  | { type: 'tts_started'; eventId: string }
  | { type: 'tts_complete'; eventId: string }
  | { type: 'editor_state'; editorState: DMEditorState }  // Sync across tabs
  ;
```

### Content Pipeline (Pluggable)

```typescript
// Abstract content generation - swap implementations easily
interface ContentGenerator {
  generate(context: GenerationContext): Promise<GeneratedContent>;
  regenerate(context: GenerationContext, feedback?: string): Promise<GeneratedContent>;
}

// Context builder with extension point for summarization
interface ContextBuilder {
  build(gameId: string): Promise<GenerationContext>;
  // Extension point: override for summarization strategy
  summarizeHistory?(events: CanonicalEvent[]): string;
}

// Different generators for different content types
interface GenerationContext {
  type: 'scene_description' | 'party_action' | 'npc_response' | 'environment_event';
  gameState: GameState;
  recentHistory: CanonicalEvent[];  // Full history for now
  historyContext?: string;          // Future: summarized context
  dmGuidance?: string;              // Optional DM hints for generation
}

interface GeneratedContent {
  id: string;
  generationType: GenerationContext['type'];  // What we asked for
  eventType: EventType;                        // AI classification of result
  content: string;                             // The generated text
  metadata: {
    speaker?: string;              // Who said/did this (for TTS role)
    suggestedActions?: string[];   // Follow-up options
  };
}
```

### DM Editor State

```typescript
interface DMEditorState {
  pending: GeneratedContent | null;  // Content awaiting review
  editedContent: string;             // DM's current edits
  status: 'empty' | 'reviewing' | 'editing' | 'submitting';
}

// DM actions
type DMAction =
  | { type: 'ACCEPT' }                    // Submit as-is
  | { type: 'EDIT'; content: string }     // Submit with edits
  | { type: 'REGENERATE'; feedback?: string }  // Ask AI to try again
  | { type: 'INJECT'; content: string }   // DM writes original content
```

### Event Types (Extensible)

```typescript
type EventType =
  | 'narration'        // Scene description, atmosphere
  | 'party_action'     // Party member does something
  | 'party_dialogue'   // Party member speaks
  | 'npc_action'       // NPC does something
  | 'npc_dialogue'     // NPC speaks
  | 'environment'      // World event, weather, sounds
  | 'dm_injection'     // DM's original content (not AI generated)
  ;

interface CanonicalEvent {
  id: string;
  gameId: string;
  turn: number;
  timestamp: string;
  eventType: EventType;
  content: string;           // The approved/edited text
  originalGenerated?: string; // What AI originally produced (for analysis)
  speaker?: string;          // Who said/did this
  locationId: string;
  witnesses: string[];
}
```

---

## UI Components

### Visual Feedback & Status Indicators

The UI provides continuous feedback about system state:

```typescript
// System status for visual feedback
interface SystemStatus {
  ai: {
    status: 'idle' | 'generating' | 'error';
    lastGenerationMs?: number;
    errorMessage?: string;
  };
  tts: {
    status: 'idle' | 'playing' | 'queued' | 'error';
    queueLength: number;
  };
  db: {
    status: 'connected' | 'disconnected' | 'syncing';
    lastSyncAt?: string;
  };
}

// Game observation data
interface GameObservation {
  turn: number;
  totalEvents: number;
  eventsThisTurn: number;
  currentLocation: string;
  partySize: number;
  npcsPresent: number;
  sessionDuration: string;
}
```

### Status Bar Component

Always visible at top, shows:
- **Turn counter**: Current game turn
- **AI status**: Idle / Generating (with spinner) / Error
- **TTS status**: Playing / Queue count
- **DB status**: Connected / Syncing indicator
- **Session timer**: How long current session has been running

### Game Stats Panel (Collapsible)

Quick observation data:
- Events this session
- Events this turn
- Party members active
- NPCs in current area
- Location history breadcrumb

### Implementation

```
components/
├── dm-editor.ts       # Main editor for reviewing/editing AI content
├── narrator-output.ts # Scrolling narrative display
├── party-panel.ts     # Party member status/info
├── area-panel.ts      # Current location info
├── status-bar.ts      # NEW: System status indicators
├── game-stats.ts      # NEW: Observation data panel
└── controls.ts        # Accept/Edit/Regenerate buttons
```

### UI Layout (Updated)

```
┌─────────────────────────────────────────────────────────────┐
│  The Reckoning - DM Console                                 │
│  ┌─────────────────────────────────────────────────────────┐│
│  │ Turn: 5 │ AI: ● Idle │ TTS: ▶ Playing │ DB: ● │ 00:15:32││
│  └─────────────────────────────────────────────────────────┘│
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  NARRATOR OUTPUT (scrolling history)                │   │
│  │                                                     │   │
│  │  "The tavern door creaks open..."                  │   │
│  │  Kira: "Did anyone else hear that?"                │   │
│  │  ...                                                │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  DM EDITOR - Review & Edit              [Generating...]│
│  │  ┌─────────────────────────────────────────────┐   │   │
│  │  │ AI suggests: "Marcus steps forward,          │   │   │
│  │  │ hand on his sword hilt. 'I'll check it out,' │   │   │
│  │  │ he says with false bravado."                 │   │   │
│  │  └─────────────────────────────────────────────┘   │   │
│  │  [Accept] [Edit] [Regenerate] [Inject Own]         │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌──────────────────┐  ┌────────────────────────────────┐  │
│  │  PARTY           │  │  LOCATION: Tavern Common Room  │  │
│  │  - Kira (Rogue)  │  │  Exits: North, East, South     │  │
│  │  - Marcus (War)  │  │  Objects: Hearth, Notice Board │  │
│  │  - Vera (Mage)   │  │  NPCs: Maren (bartender)       │  │
│  └──────────────────┘  └────────────────────────────────┘  │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  STATS: Events: 23 | This Turn: 3 | Session: 15min │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

---

## Implementation Tasks

### 1. Shared Types (`@reckoning/shared/src/game/`)

```
game/
├── index.ts
├── types.ts      # GameState, Area, Party, Character
├── events.ts     # CanonicalEvent, EventType
├── generation.ts # GeneratedContent, GenerationContext
├── dm.ts         # DMEditorState, DMAction
└── status.ts     # SystemStatus, GameObservation
```

### 2. AI Service (`packages/server/src/services/ai/`)

```
ai/
├── index.ts
├── types.ts           # ContentGenerator interface
├── claude-cli.ts      # ClaudeCodeCLI implementation
└── prompts/
    ├── index.ts
    ├── scene.ts       # Scene description prompts
    ├── party.ts       # Party action/dialogue prompts
    ├── npc.ts         # NPC response prompts
    └── environment.ts # Environment event prompts
```

### 3. Game Engine (`packages/server/src/services/game-engine/`)

```
game-engine/
├── index.ts           # GameEngine orchestrator
├── content-pipeline.ts # Manages generate → edit → present flow
├── event-loop.ts      # Controls game cycle
└── state-manager.ts   # Game state transitions
```

### 4. SQLite Layer (`packages/server/src/db/`)

```
db/
├── index.ts
├── schema.sql
└── repositories/
    ├── game-repository.ts
    ├── event-repository.ts
    ├── party-repository.ts
    └── area-repository.ts
```

### 5. Server Routes (`packages/server/src/routes/game.ts`)

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/game/new` | POST | Start new game, AI generates initial setup |
| `/api/game/list` | GET | List saved games |
| `/api/game/:id` | GET | Get current game state |
| `/api/game/:id/save` | POST | Save game to named slot |
| `/api/game/:id/load` | POST | Load game from slot |
| `/api/game/:id/events` | GET | **SSE stream** - Subscribe to real-time updates |
| `/api/game/:id/pending` | GET | Get pending generated content for DM review |
| `/api/game/:id/editor` | PUT | Update editor state (persisted server-side) |
| `/api/game/:id/submit` | POST | DM submits approved/edited content |
| `/api/game/:id/regenerate` | POST | Request AI regeneration with optional feedback |
| `/api/game/:id/inject` | POST | DM injects original content |
| `/api/game/:id/next` | POST | Trigger next generation cycle |
| `/api/game/:id/control` | POST | Playback control (auto/pause/step/stop) |
| `/api/game/:id/status` | GET | Get system status and game observation data |

### 6. Client UI (`packages/client/src/`)

```
components/
├── dm-editor.ts       # Main editor for reviewing/editing AI content
├── narrator-output.ts # Scrolling narrative display
├── party-panel.ts     # Party member status/info
├── area-panel.ts      # Current location info
├── status-bar.ts      # System status indicators
├── game-stats.ts      # Observation data panel
├── playback-controls.ts # Auto/Pause/Step/Stop controls
├── save-load-modal.ts # Save/Load game UI
└── controls.ts        # Accept/Edit/Regenerate buttons

services/
├── game/index.ts      # Game API client
├── sse/index.ts       # SSE subscription manager
└── tts/index.ts       # Existing TTS service

state/
└── game-state.ts      # Client state management (synced via SSE)
```

---

## File Structure

```
packages/
├── shared/src/game/           # Game types
│   ├── types.ts               # GameState, Area, Party, Character
│   ├── events.ts              # CanonicalEvent, EventType, SSEEvent
│   ├── generation.ts          # GeneratedContent, GenerationContext
│   ├── dm.ts                  # DMEditorState, DMAction, PlaybackMode
│   └── status.ts              # SystemStatus, GameObservation
│
├── server/src/
│   ├── services/
│   │   ├── ai/                # Claude CLI + prompts
│   │   ├── game-engine/       # Orchestration + event loop
│   │   └── sse/               # SSE broadcast manager
│   ├── db/                    # SQLite persistence
│   └── routes/game.ts         # Game API + SSE endpoint
│
└── client/src/
    ├── components/            # DM editor, narrator, panels, controls
    ├── services/
    │   ├── game/              # API client
    │   └── sse/               # SSE subscription
    └── state/                 # State management (SSE-synced)
```

---

## Implementation Order

1. **Types** - Shared game types with extensible event system
2. **SQLite** - Schema, repositories
3. **AI wrapper** - ClaudeCodeCLI with prompt templates
4. **Content pipeline** - Generate → review → submit flow
5. **Game routes** - API endpoints
6. **Client components** - DM editor, narrator output, status bar
7. **Event loop** - Wire it all together
8. **TTS integration** - Narrator voice

---

## Flexibility Points

Built for iteration:

1. **ContentGenerator interface** - Swap Claude CLI for API, other models
2. **Prompt templates** - Separate files, easy to tune
3. **EventType union** - Add new event types without schema changes
4. **DMAction discriminated union** - Add new DM capabilities
5. **Generation context** - Add fields as game complexity grows
6. **Modular UI components** - Rearrange, add panels
7. **Status system** - Add new status indicators as needed

---

## Verification

```bash
just test                    # Unit tests
just dev                     # Start servers
# Manual: Start game → Review AI content → Edit → Submit → Hear narrator
```

---

## Acceptance Criteria

### Core Loop
- [ ] AI generates initial story/party on game start
- [ ] DM can review generated content in editor
- [ ] DM can edit and submit
- [ ] DM can request regeneration with feedback
- [ ] DM can inject original content
- [ ] AI classifies EventType during generation
- [ ] Narrator presents approved content (TTS)

### Persistence & State
- [ ] Events persist to SQLite
- [ ] Editor state persists server-side (survives refresh)
- [ ] Save game to named slot
- [ ] Load game from slot
- [ ] List saved games

### Real-time Updates
- [ ] SSE stream delivers generation updates
- [ ] SSE stream delivers state changes
- [ ] Editor state syncs across tabs via SSE

### Playback Control
- [ ] Auto-advance mode (default)
- [ ] Pause/resume generation
- [ ] Step mode (one generation at a time)
- [ ] Stop generation

### UI Feedback
- [ ] Status bar shows AI/TTS/DB status
- [ ] Game stats panel shows observation data
- [ ] Playback controls visible and functional

### Architecture
- [ ] ContentGenerator interface allows backend swap
- [ ] ContextBuilder has summarization extension point
- [ ] Flexible architecture supports iteration

---

## Future Phase Items

### Observability (Phase 2.5 or 3)

Add structured logging and metrics export for debugging and monitoring:

**Logging:**
- Loki-compatible structured logs
- All AI prompts and responses logged with metadata
- Request tracing with correlation IDs
- Performance timing for generation pipeline

**Metrics (Prometheus):**
- AI generation latency histogram
- Generation success/failure counters
- TTS queue depth and latency
- SSE connection count
- Request rate by endpoint

**Implementation:**
```
packages/server/src/observability/
├── logger.ts          # Structured logger (Loki-compatible)
├── metrics.ts         # Prometheus metrics
└── middleware.ts      # Request tracing middleware
```

### World Generation (Phase 2.5)

Dynamic world creation after character creation:

1. **Character Created** → Trigger world generation
2. **AI Generates:**
   - Starting area with details
   - 2-3 connected areas
   - 1-2 NPCs with personalities
   - Initial story hooks
3. **DM Reviews** → Can edit/regenerate world elements
4. **World Seeded** → Game begins

This replaces the static "default-area" with AI-generated content tailored to the character.

---

## Known Issues & Next Steps (Pre-Phase 2.5)

### AI Response Parsing ✅ FIXED

The AI generates structured JSON responses using an output schema:
```json
{
  "eventType": "narration",
  "content": "The narrative text...",
  "speaker": "Character name or null",
  "suggestedActions": ["optional", "follow-up", "options"]
}
```

**Solution implemented:**
1. Added `GAME_CONTENT_SCHEMA` output schema for structured responses
2. Claude CLI now uses `--output-format json` and `--json-schema` flags
3. `ContentPipeline.parseResponse()` parses JSON and extracts fields
4. Handles CLI wrapper format: extracts `structured_output` from `{ type: "result", structured_output: {...} }`
5. Graceful fallback to text extraction if JSON parsing fails

### Claude CLI Integration ✅ UPDATED

Current status:
- Uses `claude --model haiku --output-format json --json-schema <schema> -p "<prompt>"`
- Output schema enforces consistent JSON responses
- `stdio: ['ignore', 'pipe', 'pipe']` - stdin must be closed
- Uses `claude` from PATH (works with any install method)
- 30 second timeout, 20 second early bailout

### Client-Server API Mismatches ✅ FIXED

Tests updated to match implementation:
- `POST /api/game/new` - game creation with `{ gameId, session }` response
- `GET /api/game/list` - list saves
- `POST /api/game/:id/control` - playback mode (was `/playback` with PUT)
- `POST /api/game/:id/submit` - wrapped in `{ action: ... }`

### Demo Script

Run `just demo` for interactive Phase 1 walkthrough with:
- TTS voice configuration
- Game engine architecture
- Database persistence
- Client UI overview
