---
title: Development Phases Overview
type: plan
status: active
created: 2026-01-10
updated: 2026-01-10
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
| [Phase 4](./chronicle-integration.md) | Chronicle Integration | Planning |
| Phase 5 | Pattern Engine (via Chronicle) | Not Started |
| Phase 6 | Trial System | Not Started |
| Phase 7 | UI & Rendering | Not Started |

## Chronicle Integration

**Phase 4 is the pivotal integration phase.** Reckoning transitions from owning state to being an interface layer over Chronicle.

Chronicle provides:
- **Entity Evolution System** - Traits, relationships, scene transforms
- **Evolution Rules** - Generated with world, evaluated on structured events
- **Query & Eventing** - Rich context for AI generation, background processes
- **Self-contained Persistence** - IndexedDB + optional Git sync

See [Chronicle Integration Plan](./chronicle-integration.md) for full details.

### Key Architectural Shift

```
BEFORE: Reckoning owns everything (SQLite)
AFTER:  Reckoning = Interface, Chronicle = State

Reckoning → submitEvent() → Chronicle → evaluates rules → pendingEvolutions
                                      → Reckoning queries for AI context
                                      → Reckoning subscribes to events
```

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
- **Architecture**: How it fits into the larger system
- **Tasks**: Specific implementation items (sync with beads)
- **Open Questions**: Decisions needed before/during implementation
- **Acceptance Criteria**: How we know it's done

## Task Tracking

Phase documents inform task creation in beads:
```bash
# Add tasks from a phase
just add-task "Implement ElevenLabs service wrapper"

# Track progress
bd list
```
