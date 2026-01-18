# Chronicle Integration Execution Plan

## Overview

This document outlines the execution steps to integrate Chronicle into Reckoning. The goal is to transition Reckoning from owning all state (SQLite) to being an interface layer over Chronicle (WASM).

## Prerequisites

Before starting Phase 4 implementation:

1. **Chronicle WASM module exists** with:
   - Story graph operations (chronicle-graph)
   - Entity evolution system
   - Query & eventing layer
   - Self-contained persistence (IndexedDB + Git sync)
   - Pixelsrc integration for rendering

2. **Reckoning Phase 3 complete**:
   - Party system working
   - Beat system working
   - World generation working

## Execution Phases

### Phase 4.1: Chronicle Service Foundation

**Goal**: Add Chronicle WASM to Reckoning without breaking existing functionality.

**Tasks**:
- [ ] Add `chronicle-wasm` dependency to `@reckoning/server`
- [ ] Create `ChronicleService` wrapper class
- [ ] Initialize Chronicle on server startup
- [ ] Add Chronicle health check endpoint
- [ ] Write integration tests for basic Chronicle operations

**Files to create/modify**:
```
packages/server/src/services/chronicle/
├── index.ts           # ChronicleService class
├── types.ts           # TypeScript interfaces for Chronicle API
└── __tests__/
    └── chronicle.test.ts
```

**Acceptance criteria**:
- Chronicle WASM loads successfully in Node.js
- Can create a story and query it
- Existing game flow unchanged

### Phase 4.2: Dual-Mode Operation

**Goal**: Run both SQLite and Chronicle in parallel for new games.

**Tasks**:
- [ ] Add `use_chronicle` flag to game creation
- [ ] Fork game engine to support both modes
- [ ] Route state queries based on flag
- [ ] Mirror writes to both systems (for comparison)
- [ ] Add telemetry to compare results

**Files to modify**:
```
packages/server/src/services/game-engine/
├── index.ts           # Add mode switching
├── state-manager.ts   # Route to Chronicle or SQLite
└── content-pipeline.ts # Route to Chronicle or SQLite
```

**Acceptance criteria**:
- New games can opt into Chronicle mode
- Existing games continue using SQLite
- Both modes produce identical game behavior

### Phase 4.3: Entity Evolution Integration

**Goal**: Connect Reckoning's AI decisions to Chronicle's evolution system.

**Tasks**:
- [ ] Implement `GameEvent` construction from AI output
- [ ] Send structured events to Chronicle via `submitEvent()`
- [ ] Build DM approval UI for pending evolutions
- [ ] Update context builder to query Chronicle for evolution summaries
- [ ] Implement relationship dimension display (if DM wants visibility)

**Files to create/modify**:
```
packages/server/src/services/
├── evolution/
│   ├── event-builder.ts    # Construct GameEvent from narrative
│   ├── dm-approval.ts      # Pending evolution management
│   └── types.ts
└── ai/
    └── context-builder.ts  # Query Chronicle for context

packages/client/src/components/
└── dm/
    └── EvolutionApproval.tsx  # DM approval UI
```

**Acceptance criteria**:
- Player choices generate structured events
- Chronicle tracks trait/relationship changes
- DM can approve/edit/refuse suggested evolutions
- AI receives evolution context for generation

### Phase 4.4: Background Processes

**Goal**: Implement Reckoning-side observers that react to Chronicle events.

**Tasks**:
- [ ] Create `EmergenceObserver` for villain detection
- [ ] Create `PatternObserver` for player pattern tracking
- [ ] Subscribe to Chronicle event streams
- [ ] Implement threshold-based AI evaluation triggers
- [ ] Add DM notifications for emergent narrative opportunities

**Files to create**:
```
packages/server/src/services/observers/
├── index.ts
├── emergence-observer.ts   # Villain emergence detection
├── pattern-observer.ts     # Player behavior patterns
└── types.ts
```

**Acceptance criteria**:
- System detects high-resentment NPCs
- AI evaluates villain potential automatically
- DM receives notifications for review
- Pattern data available for narrative targeting

### Phase 4.5: Migration & Cleanup

**Goal**: Remove SQLite state management, Chronicle becomes sole source of truth.

**Tasks**:
- [ ] Remove dual-mode operation
- [ ] Delete deprecated database tables (events, parties, characters, areas, etc.)
- [ ] Remove old repository classes
- [ ] Update all tests to use Chronicle
- [ ] Document migration path for existing games (if any)

**Files to delete**:
```
packages/server/src/db/repositories/
├── event-repository.ts
├── party-repository.ts
├── character-repository.ts
├── area-repository.ts
└── npc-repository.ts
```

**Acceptance criteria**:
- No game state in SQLite
- All state queries go through Chronicle
- Codebase is simpler with single source of truth

### Phase 4.6: Comic Generation

**Goal**: Enable end-of-game comic generation via Chronicle.

**Tasks**:
- [ ] Add comic generation endpoint
- [ ] Implement comic options UI (format, style)
- [ ] Call Chronicle's `generateComic()` on game end
- [ ] Display preview and download options

**Files to create**:
```
packages/server/src/routes/comic.ts
packages/client/src/components/game/
└── ComicGenerator.tsx
```

**Acceptance criteria**:
- Player can generate comic from completed game
- PDF and PNG exports work
- Comic reflects play history accurately

## Dependency Graph

```
Phase 4.1 ──► Phase 4.2 ──► Phase 4.3 ──► Phase 4.4
                                │
                                ▼
                          Phase 4.5 ──► Phase 4.6
```

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| WASM doesn't work in Node.js | Test early in Phase 4.1; have fallback plan |
| Chronicle API changes | Version lock chronicle-wasm; integration tests |
| Performance regression | Dual-mode comparison in Phase 4.2 |
| Data loss during migration | Export/import tooling; no migration of live games |

## Open Questions

1. **WASM in Node.js**: Need to verify chronicle-wasm works server-side
2. **Client-side Chronicle**: Should Chronicle also run in browser for offline play?
3. **Existing games**: Do we migrate, or declare them legacy-only?

## Success Metrics

- [ ] New games use Chronicle exclusively
- [ ] Entity evolution creates emergent narrative moments
- [ ] DM approval flow feels natural
- [ ] Comic generation delights players
- [ ] Codebase is simpler than before
