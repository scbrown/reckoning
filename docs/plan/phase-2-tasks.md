---
title: "Phase 2: Task Breakdown"
type: plan
status: active
created: 2026-01-10
updated: 2026-01-10
authors:
  - human
  - agent
related:
  - ./phase-2-dm-engine.md
tags:
  - planning
  - tasks
  - phase-2
---

# Phase 2: Task Breakdown

Task breakdown with dependencies for parallel execution.

## Dependency Graph

```
                    ┌─────────────────┐
                    │   A1: Types     │
                    │   (Foundation)  │
                    └────────┬────────┘
                             │
           ┌─────────────────┼─────────────────┐
           │                 │                 │
           ▼                 ▼                 ▼
    ┌─────────────┐   ┌─────────────┐   ┌─────────────┐
    │ B: Server   │   │ C: AI       │   │ E: Client   │
    │ Infra       │   │ Integration │   │ UI/Services │
    │ (SQLite,SSE)│   │ (CLI,Prompts│   │ (Early)     │
    └──────┬──────┘   └──────┬──────┘   └──────┬──────┘
           │                 │                 │
           └────────┬────────┘                 │
                    │                          │
                    ▼                          │
             ┌─────────────┐                   │
             │ D: Game     │                   │
             │ Engine      │                   │
             └──────┬──────┘                   │
                    │                          │
                    └────────┬─────────────────┘
                             │
                             ▼
                    ┌─────────────────┐
                    │ F: Integration  │
                    │ & Polish        │
                    └─────────────────┘
```

## Work Streams

### Stream A: Foundation (Blocking)
All other work depends on shared types.

### Stream B: Server Infrastructure
SQLite and SSE can be built in parallel after types.

### Stream C: AI Integration
Claude CLI wrapper and prompts, parallel with Stream B.

### Stream D: Game Engine
Depends on B and C - orchestrates everything server-side.

### Stream E: Client
Can start scaffolding after types, full implementation after D.

### Stream F: Integration
Wire everything together, end-to-end testing.

---

## Task Details

### A1: Shared Game Types
**Priority:** P0 (Blocking)
**Estimate:** Small
**Dependencies:** None

Create `@reckoning/shared/src/game/`:

```
game/
├── index.ts          # Re-exports
├── types.ts          # GameState, Area, Party, Character, NPC
├── events.ts         # CanonicalEvent, EventType, SSEEvent
├── generation.ts     # GeneratedContent, GenerationContext, ContentGenerator
├── dm.ts             # DMEditorState, DMAction, PlaybackMode
└── status.ts         # SystemStatus, GameObservation
```

**Acceptance:**
- [ ] All interfaces defined with JSDoc
- [ ] Exported from `@reckoning/shared`
- [ ] Package builds successfully
- [ ] Types importable from client and server

---

### B1: SQLite Schema & Connection
**Priority:** P1
**Estimate:** Small
**Dependencies:** A1

Create `packages/server/src/db/`:

```
db/
├── index.ts          # Connection, getDatabase()
├── schema.sql        # Table definitions
└── migrations/       # Future migration support
```

**Tables:**
- `games` - Game sessions
- `players` - Player/party data
- `areas` - Location data
- `events` - Canonical event history
- `saves` - Save game slots

**Acceptance:**
- [ ] SQLite connection with WAL mode
- [ ] Schema creates tables on startup
- [ ] Seed starter area data
- [ ] Connection exported for repositories

---

### B2: Database Repositories
**Priority:** P1
**Estimate:** Medium
**Dependencies:** B1

Create `packages/server/src/db/repositories/`:

```
repositories/
├── game-repository.ts    # CRUD for games
├── event-repository.ts   # Event history
├── area-repository.ts    # Areas, exits, objects
├── party-repository.ts   # Party members
└── save-repository.ts    # Save/load slots
```

**Acceptance:**
- [ ] GameRepository: create, findById, update, delete
- [ ] EventRepository: create, findByGame, getRecent
- [ ] AreaRepository: findById, getWithDetails
- [ ] PartyRepository: create, findByGame, update
- [ ] SaveRepository: save, load, list, delete
- [ ] Unit tests for each repository

---

### B3: SSE Broadcast Service
**Priority:** P1
**Estimate:** Small
**Dependencies:** A1

Create `packages/server/src/services/sse/`:

```
sse/
├── index.ts              # Exports
├── broadcast-manager.ts  # Connection management
└── types.ts              # Internal types
```

**Features:**
- Manage client connections per game
- Broadcast events to all connected clients
- Heartbeat (30s) to keep connections alive
- Cleanup on disconnect

**Acceptance:**
- [ ] BroadcastManager.subscribe(gameId, response)
- [ ] BroadcastManager.broadcast(gameId, event)
- [ ] BroadcastManager.unsubscribe(gameId, clientId)
- [ ] Heartbeat keeps connections alive
- [ ] Graceful cleanup on disconnect

---

### C1: Claude CLI Wrapper
**Priority:** P1
**Estimate:** Medium
**Dependencies:** A1

Create `packages/server/src/services/ai/`:

```
ai/
├── index.ts          # Exports
├── types.ts          # AIProvider, AIRequest, AIResponse
└── claude-cli.ts     # ClaudeCodeCLI implementation
```

**Features:**
- Subprocess spawn of `claude` CLI
- Timeout handling (default 60s)
- Output parsing
- Error handling
- Availability check

**Acceptance:**
- [ ] ClaudeCodeCLI implements ContentGenerator interface
- [ ] execute(prompt) returns Result<response, error>
- [ ] Timeout with AbortController
- [ ] isAvailable() checks CLI exists
- [ ] Unit tests with mock subprocess

---

### C2: Prompt Templates
**Priority:** P1
**Estimate:** Medium
**Dependencies:** C1

Create `packages/server/src/services/ai/prompts/`:

```
prompts/
├── index.ts          # Prompt builder
├── system.ts         # System prompts
├── scene.ts          # Scene description
├── party.ts          # Party action/dialogue
├── npc.ts            # NPC responses
└── environment.ts    # Environment events
```

**Features:**
- System prompt establishing DM assistant role
- Context formatting (game state, history)
- Output format instructions (JSON with eventType)
- DM guidance injection

**Acceptance:**
- [ ] buildPrompt(context) returns formatted prompt
- [ ] Each content type has dedicated prompt
- [ ] Output format requests EventType classification
- [ ] Prompts include recent history context
- [ ] DM guidance incorporated when provided

---

### C3: Context Builder
**Priority:** P1
**Estimate:** Small
**Dependencies:** C2, B2

Create context builder with summarization extension point:

**File:** `packages/server/src/services/ai/context-builder.ts`

**Features:**
- Build GenerationContext from game state
- Fetch recent history from DB
- Extension point for future summarization

**Acceptance:**
- [ ] ContextBuilder.build(gameId) returns GenerationContext
- [ ] Includes game state, area, party, NPCs
- [ ] Includes full history (extension point for summarization)
- [ ] Optional DM guidance parameter

---

### D1: Game Engine Core
**Priority:** P2
**Estimate:** Medium
**Dependencies:** B2, C1, C3

Create `packages/server/src/services/game-engine/`:

```
game-engine/
├── index.ts              # GameEngine class
├── content-pipeline.ts   # Generate → Review → Submit
├── event-loop.ts         # Playback control
└── state-manager.ts      # State transitions
```

**GameEngine responsibilities:**
- Orchestrate content generation
- Manage pending content state
- Handle DM actions (accept/edit/regenerate/inject)
- Control playback (auto/pause/step/stop)
- Emit SSE events

**Acceptance:**
- [ ] GameEngine.startGame() creates new game
- [ ] GameEngine.generateNext() triggers AI generation
- [ ] GameEngine.submit(content) creates event
- [ ] GameEngine.regenerate(feedback) re-runs AI
- [ ] GameEngine.inject(content) creates DM event
- [ ] Playback modes working (auto/pause/step/stop)

---

### D2: Game Routes
**Priority:** P2
**Estimate:** Medium
**Dependencies:** D1, B3

Create `packages/server/src/routes/game.ts`:

| Route | Method | Handler |
|-------|--------|---------|
| `/api/game/new` | POST | Create game |
| `/api/game/list` | GET | List saves |
| `/api/game/:id` | GET | Get state |
| `/api/game/:id/save` | POST | Save game |
| `/api/game/:id/load` | POST | Load game |
| `/api/game/:id/events` | GET | SSE stream |
| `/api/game/:id/pending` | GET | Get pending |
| `/api/game/:id/editor` | PUT | Update editor |
| `/api/game/:id/submit` | POST | Submit content |
| `/api/game/:id/regenerate` | POST | Regenerate |
| `/api/game/:id/inject` | POST | Inject content |
| `/api/game/:id/next` | POST | Next generation |
| `/api/game/:id/control` | POST | Playback control |
| `/api/game/:id/status` | GET | System status |

**Acceptance:**
- [ ] All routes implemented
- [ ] SSE endpoint streams events
- [ ] Request validation with schemas
- [ ] Error handling with proper codes
- [ ] Integration tests

---

### E1: Client SSE Service
**Priority:** P1
**Estimate:** Small
**Dependencies:** A1

Create `packages/client/src/services/sse/`:

```
sse/
├── index.ts          # SSEService class
└── types.ts          # Client-side event types
```

**Features:**
- Connect to SSE endpoint
- Parse incoming events
- Reconnect on disconnect
- Event callbacks

**Acceptance:**
- [ ] SSEService.connect(gameId)
- [ ] SSEService.disconnect()
- [ ] SSEService.on(eventType, callback)
- [ ] Auto-reconnect with backoff
- [ ] Connection state tracking

---

### E2: Client Game Service
**Priority:** P2
**Estimate:** Small
**Dependencies:** A1, E1

Create `packages/client/src/services/game/`:

```
game/
├── index.ts          # GameService class
└── types.ts          # Request/response types
```

**Methods:**
- newGame(playerName)
- loadGame(slotId)
- saveGame(name)
- listSaves()
- submit(content)
- regenerate(feedback)
- inject(content)
- next()
- control(mode)
- getStatus()

**Acceptance:**
- [ ] All API methods implemented
- [ ] Error handling
- [ ] TypeScript types for all responses

---

### E3: Client State Management
**Priority:** P2
**Estimate:** Small
**Dependencies:** E1, E2

Create `packages/client/src/state/`:

```
state/
├── index.ts          # Exports
├── game-state.ts     # GameStateManager
└── types.ts          # State types
```

**Features:**
- Hold current game session
- Sync with SSE events
- Expose state to components
- Subscribe pattern for updates

**Acceptance:**
- [ ] GameStateManager singleton
- [ ] State updated on SSE events
- [ ] Subscribe/unsubscribe for components
- [ ] Getters for current state

---

### E4: UI Components - Core
**Priority:** P2
**Estimate:** Large
**Dependencies:** E3

Create core UI components:

```
components/
├── dm-editor.ts          # Main editor
├── narrator-output.ts    # Scrolling history
├── controls.ts           # Accept/Edit/Regenerate/Inject
└── playback-controls.ts  # Auto/Pause/Step/Stop
```

**Acceptance:**
- [ ] DM Editor shows pending content
- [ ] Editor supports text editing
- [ ] Control buttons trigger actions
- [ ] Playback controls work
- [ ] Narrator output scrolls

---

### E5: UI Components - Panels
**Priority:** P2
**Estimate:** Medium
**Dependencies:** E3

Create info panels:

```
components/
├── party-panel.ts        # Party members
├── area-panel.ts         # Location info
├── status-bar.ts         # System status
└── game-stats.ts         # Observation data
```

**Acceptance:**
- [ ] Party panel shows members
- [ ] Area panel shows location, exits, NPCs
- [ ] Status bar shows AI/TTS/DB status
- [ ] Game stats shows turn, events, duration

---

### E6: UI Components - Save/Load
**Priority:** P2
**Estimate:** Small
**Dependencies:** E2

Create save/load modal:

```
components/
└── save-load-modal.ts    # Save/Load UI
```

**Acceptance:**
- [ ] Save modal with name input
- [ ] Load modal with save list
- [ ] New Game option
- [ ] Delete save option

---

### E7: Client Main Integration
**Priority:** P3
**Estimate:** Medium
**Dependencies:** E4, E5, E6

Update `packages/client/src/main.ts`:

- Initialize services (SSE, Game, TTS)
- Create and mount components
- Wire up event handlers
- Handle game lifecycle

**Acceptance:**
- [ ] App initializes correctly
- [ ] Components render
- [ ] SSE connection established
- [ ] User can start new game

---

### F1: End-to-End Integration
**Priority:** P3
**Estimate:** Medium
**Dependencies:** D2, E7

Wire everything together:

- Test full game loop
- Verify SSE events flow
- Test save/load
- Test playback controls

**Acceptance:**
- [ ] Can start new game
- [ ] AI generates content
- [ ] DM can edit and submit
- [ ] TTS plays narration
- [ ] Events persist
- [ ] Save/load works
- [ ] Playback controls work

---

### F2: TTS Integration
**Priority:** P3
**Estimate:** Small
**Dependencies:** F1

Connect game events to existing TTS:

- Map eventType to voice role
- Queue narration after submit
- Emit SSE events for TTS status

**Acceptance:**
- [ ] Narration events play via TTS
- [ ] Correct voice roles used
- [ ] TTS status shown in UI

---

### F3: Polish & Testing
**Priority:** P3
**Estimate:** Medium
**Dependencies:** F1, F2

Final polish:

- Error states and messages
- Loading indicators
- Edge case handling
- Unit test coverage
- Integration tests
- Manual testing

**Acceptance:**
- [ ] Error messages user-friendly
- [ ] Loading states shown
- [ ] Tests pass
- [ ] Manual test checklist complete

---

## Parallelization Summary

```
Week 1:  A1 ─────────────────────────────────────────────

Week 2:  B1 ──── B2 ──── B3
         C1 ──── C2 ──── C3
         E1 ────────────────

Week 3:  D1 ──────────── D2
         E2 ──── E3 ──── E4 ──── E5 ──── E6

Week 4:  E7 ──────────────────
         F1 ──── F2 ──── F3
```

**Parallel tracks after A1:**
- Track 1: B1 → B2 → B3 (Server infra)
- Track 2: C1 → C2 → C3 (AI integration)
- Track 3: E1 → E2 → E3 → E4/E5/E6 (Client)

**Convergence:**
- D1 waits for B2 + C3
- D2 waits for D1 + B3
- E7 waits for E4-E6
- F1 waits for D2 + E7

---

## Beads Task Summary

Ready for `bd add`:

| ID | Task | Deps | Stream |
|----|------|------|--------|
| A1 | Shared game types | - | Foundation |
| B1 | SQLite schema & connection | A1 | Server |
| B2 | Database repositories | B1 | Server |
| B3 | SSE broadcast service | A1 | Server |
| C1 | Claude CLI wrapper | A1 | AI |
| C2 | Prompt templates | C1 | AI |
| C3 | Context builder | C2,B2 | AI |
| D1 | Game engine core | B2,C3 | Engine |
| D2 | Game routes | D1,B3 | Engine |
| E1 | Client SSE service | A1 | Client |
| E2 | Client game service | A1,E1 | Client |
| E3 | Client state management | E1,E2 | Client |
| E4 | UI components - core | E3 | Client |
| E5 | UI components - panels | E3 | Client |
| E6 | UI components - save/load | E2 | Client |
| E7 | Client main integration | E4,E5,E6 | Client |
| F1 | End-to-end integration | D2,E7 | Integration |
| F2 | TTS integration | F1 | Integration |
| F3 | Polish & testing | F1,F2 | Integration |
