---
title: Development Phases Overview
type: plan
status: active
created: 2026-01-10
updated: 2026-01-18
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
| [Phase 3](./phase-3-party-world.md) | Party System, Beats & World Gen | Planning |
| [Phase A](./phase-a-entity-evolution.md) | Entity Evolution (Traits & Relationships) | Planning |
| [Phase B](./phase-b-structured-events.md) | Structured Events & Pattern Detection | Planning |
| [Phase C](./phase-c-narrative-structure.md) | Narrative Structure (Scenes) | Planning |
| [Phase D](./phase-d-export-layer.md) | Export Layer & Git Persistence | Backlog |
| Phase 5 | Pattern Engine | Not Started |
| Phase 6 | Trial System | Not Started |
| Phase 7 | UI & Rendering | Not Started |

## Chronicle Integration (Phases A-D)

Chronicle was originally planned as a separate WASM module. We've since adopted an **evolutionary approach**: building Chronicle concepts directly into Reckoning, with the option to extract later.

See [Chronicle Integration Plan](./chronicle-integration.md) for the overall strategy.

### Phase A: Entity Evolution

Track how characters, NPCs, and locations evolve through play:
- **Traits**: Predefined vocabulary (merciful, ruthless, haunted, etc.)
- **Relationships**: Multi-dimensional (trust, respect, fear, resentment, etc.)
- **DM Approval**: System suggests evolutions, DM has final say

### Phase B: Structured Events

Enable queryable event patterns for AI context and emergence detection:
- **Structured fields**: action, actor, target, witnesses, tags
- **Pattern detection**: mercy ratio, violence tendency, honesty
- **Emergence observer**: detect villain/ally emergence opportunities

### Phase C: Narrative Structure

Group turns into scenes with optional branching:
- **Scenes**: Type, mood, stakes, turn boundaries
- **Connections**: Requirements to unlock paths
- **Scene-aware AI**: Context includes current scene state

### Phase D: Export Layer (Backlog)

Git-diffable game state for persistence and sharing:
- **TOML/JSON export**: Human-readable, version-controllable
- **Git integration**: Optional commit on save
- **Derivative works**: Comic generation, transcripts

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

## How to Use These Documents

Each phase document contains:
- **Goals**: What we're trying to achieve
- **Database Schema**: Tables and migrations needed
- **Services**: New services and modifications
- **Integration Points**: How it connects to existing code
- **Tasks**: Specific implementation items
- **Acceptance Criteria**: How we know it's done

## Task Tracking

Phase documents inform task creation in beads:
```bash
# Add tasks from a phase
just add-task "Implement TraitRepository"

# Track progress
bd list
```
