---
title: Development Phases Overview
type: plan
status: active
created: 2026-01-10
updated: 2026-01-20
authors:
  - human
  - agent
related:
  - ../VISION.md
  - ./phase-0-project-setup.md
  - ./phase-1-tts-engine.md
tags:
  - planning
  - roadmap
---

# Reckoning Development Phases

This directory contains detailed implementation plans for each development phase.

## Phase Overview

| Phase | Focus | Status |
|-------|-------|--------|
| [Phase 0](./phase-0-project-setup.md) | Project Foundation | Complete |
| [Phase 1](./phase-1-tts-engine.md) | Text-to-Speech Engine | Complete |
| [Phase 2](./phase-2-dm-engine.md) | DM Engine & Game Loop | Complete |
| [Phase 3](./phase-3-party-world.md) | Party System, Beats & World Gen | Complete |
| [Entity Evolution](./entity-evolution.md) | Traits & Relationships | Complete |
| [Structured Events](./structured-events.md) | Pattern Detection & Emergence | Complete |
| [Narrative Structure](./narrative-structure.md) | Scenes & Story Graph | Complete |
| [Export Layer](./export-layer.md) | Git Persistence | Complete |
| [Pixelsrc Integration](./pixelsrc-integration.md) | Pixel Art Generation | Complete |

### Future Work (Not Yet Planned)

The following concepts from the [VISION](../VISION.md) are not yet implemented:

- **Pattern Engine Scenarios**: While pattern detection exists (PatternObserver, EmergenceObserver), scenario generation that actively targets player patterns is not built.
- **The Trial System**: The judgment mechanics (prosecution, defense, cross-examination, verdicts) are not implemented.
- **Chronicle Narrator Bias**: The AI historian with controllable bias is not implemented.

## Chronicle Integration (Phases A-D) - COMPLETE

Chronicle was originally planned as a separate WASM module. We adopted an **evolutionary approach**: building Chronicle concepts directly into Reckoning. All phases are now complete.

See [Chronicle Integration Plan](./chronicle-integration.md) for the overall strategy.

### Phase A: Entity Evolution - COMPLETE

Track how characters, NPCs, and locations evolve through play:
- **Traits**: Predefined vocabulary (merciful, ruthless, haunted, etc.)
- **Relationships**: Multi-dimensional (trust, respect, fear, resentment, etc.)
- **DM Approval**: System suggests evolutions, DM has final say

Implemented in: `packages/server/src/services/evolution/`, `packages/server/src/routes/evolution.ts`, `packages/client/src/components/evolution-approval-panel.ts`

### Phase B: Structured Events - COMPLETE

Enable queryable event patterns for AI context and emergence detection:
- **Structured fields**: action, actor, target, witnesses, tags
- **Pattern detection**: mercy ratio, violence tendency, honesty
- **Emergence observer**: detect villain/ally emergence opportunities

Implemented in: `packages/server/src/services/events/`, `packages/server/src/services/chronicle/`

### Phase C: Narrative Structure - COMPLETE

Group turns into scenes with optional branching:
- **Scenes**: Type, mood, stakes, turn boundaries
- **Connections**: Requirements to unlock paths
- **Scene-aware AI**: Context includes current scene state

Implemented in: `packages/server/src/services/scene/`, `packages/server/src/routes/scene.ts`, `packages/client/src/components/scene-panel.ts`

### Phase D: Export Layer - COMPLETE

Git-diffable game state for persistence and sharing:
- **TOML/JSON export**: Human-readable, version-controllable
- **Git integration**: Optional commit on save
- **Derivative works**: Comic generation, transcripts

Implemented in: `packages/server/src/services/export/`, `packages/server/src/routes/export.ts`, `packages/client/src/components/export-import-modal.ts`

## How Evolution Maps to the Four Pillars

| Reckoning Pillar | Implementation |
|------------------|----------------|
| **Unreliable Self** | Traits visible to DM, hidden from player; AI interprets differently per character |
| **History as Text** | Events table as source of truth; derived state computed |
| **Pattern Engine** | Structured event queries; background observers detect patterns |
| **Living Chronicle & Trial** | Relationship tracking enables emergent villains; scenes support arcs |

## Phase 0: Foundation

Phase 0 established the project infrastructure:
- Monorepo with pnpm workspaces
- TypeScript configuration with strict mode
- Shared types package (`@reckoning/shared`)
- Server skeleton (`@reckoning/server`) with Fastify
- Client skeleton (`@reckoning/client`) with Vite
- Docker Compose for Redis
- Documentation standards with frontmatter
- ADR (Architecture Decision Record) process

See [ADR-0001: Monorepo Architecture](../adr/0001-monorepo-architecture.md) for the architectural decision.

## Why TTS First?

Starting with the Text-to-Speech engine provides:

1. **Immediate tangible output** - You can hear results right away
2. **Foundation for narration** - The Chronicle and Trial systems need voice
3. **Isolated complexity** - TTS is self-contained, good for proving out the architecture
4. **API integration practice** - Sets patterns for other external services (AI, etc.)

## Task Breakdown

Each epic has a detailed task breakdown in the [tasks/](./tasks/) directory:

| Epic | Tasks | Status | Description |
|------|-------|--------|-------------|
| [entity-evolution](./tasks/entity-evolution.md) | 15/15 | Complete | Traits, relationships, DM approval |
| [structured-events](./tasks/structured-events.md) | 12/12 | Complete | Pattern detection, emergence |
| [narrative-structure](./tasks/narrative-structure.md) | 15/15 | Complete | Scenes, connections, requirements |
| [export-layer](./tasks/export-layer.md) | 10/10 | Complete | Git persistence |
| [pixelsrc-integration](./tasks/pixelsrc-integration.md) | 16/16 | Complete | Pixel art generation |

See [tasks/dependency-diagram.md](./tasks/dependency-diagram.md) for the full dependency graph.

## How to Use These Documents

Each plan document contains:
- **Goals**: What we're trying to achieve
- **Database Schema**: Tables and migrations needed
- **Services**: New services and modifications
- **Integration Points**: How it connects to existing code

Each task document contains:
- **Task dependency graph**: Visual representation of task order
- **Individual tasks**: Well-defined, testable work items
- **Acceptance criteria**: How we know it's done
- **Cross-epic dependencies**: Tasks that depend on other epics

## Task Tracking

Tasks are designed for beads:
```bash
# Create task from breakdown
bd create "EVOL-001: Create entity_traits migration" \
  --epic entity-evolution

# Add dependency
bd dep EVOL-005 EVOL-004

# Track progress
bd list --epic entity-evolution
```
