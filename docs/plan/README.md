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
| [Phase 2](./phase-2-dm-engine.md) | DM Engine & Game Loop | Planning |
| Phase 3 | History & Perspective System | Not Started |
| Phase 4 | Pattern Engine | Not Started |
| Phase 5 | Trial System | Not Started |
| Phase 6 | UI & Rendering | Not Started |

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
