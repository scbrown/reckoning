---
title: "Reckoning Assessment & Improvement Plan"
type: plan
status: active
created: 2026-03-05
updated: 2026-03-05
authors:
  - agent
related:
  - ../VISION.md
  - ./README.md
  - ./multi-view-ui.md
  - ./world-seeding.md
tags:
  - assessment
  - planning
  - improvement
---

# Reckoning Assessment & Improvement Plan

**Date**: 2026-03-05
**Assessor**: grant (Gaming Ranger, aegis crew)
**Bead**: aegis-f6sl

## Current State Summary

### What Exists (Substantial)

| Component | Status | Notes |
|-----------|--------|-------|
| **Phase 0: Foundation** | Complete | Monorepo, TypeScript strict, shared types |
| **Phase 1: TTS Engine** | Complete | ElevenLabs, Redis cache, voice roles |
| **Phase 2: DM Engine** | Complete | AI generation, DM edit/approve loop |
| **Phase 3: Party/World** | Complete | Party system, beats, world generation |
| **Entity Evolution** | Complete | Traits, relationships, DM approval |
| **Structured Events** | Complete | Action classification, pattern detection, emergence |
| **Narrative Structure** | Complete | Scenes, connections, story graph |
| **Export Layer** | Complete | TOML/JSON export, Git integration |
| **Pixelsrc Integration** | Complete* | Code complete, needs external WASM package |
| **Multi-View UI** | Partial | Routes exist, views scaffolded, filtering layer built |
| **World Seeding** | Partial | Research console, seed CLI, types extracted to shared |
| **E2E Tests** | Substantial | Playwright tests for most features |
| **Unit Tests** | Excellent | 1249 passing, 51 test files |

*Last commit: 2026-01-27 (5+ weeks dormant)*

### What Works Well

1. **Architecture** - Clean monorepo with proper separation (client/server/shared)
2. **Test coverage** - 1249 tests passing, comprehensive E2E suite
3. **Vision document** - Exceptionally well-written game design (Four Pillars)
4. **Planning docs** - Detailed phase plans with contracts, dependencies, acceptance criteria
5. **DM-as-player model** - Novel and well-thought-out gameplay loop
6. **Event system** - Structured events with pattern detection provide strong data foundation

### Critical Issues

#### 1. TypeScript Build is Broken (101 errors)
- **Server**: 85 TS errors (mostly `string | undefined` assignability)
- **Client**: 16 TS errors (SSE event type narrowing, router params)
- Tests pass because vitest runs with different TS settings than `tsc`
- **Impact**: Can't produce production builds, can't deploy

#### 2. Stale Dependencies
- Last `pnpm install` may have drifted from lockfile
- `pnpm@8` pinned but current is v9+
- TypeScript 5.3 → now 5.9 (auto-upgraded on install)
- Potential breaking changes from major version bumps

#### 3. No Deployment Story
- Docker Compose for dev only (Redis)
- No production Dockerfile for the app itself
- No CI/CD pipeline
- No Ansible/IaC for homelab deployment
- The `Dockerfile.claude` is for agent dev container, not app deployment

## Unimplemented Vision Features

These are from the VISION.md Four Pillars that have data foundations but no implementation:

### Pattern Engine Scenarios (Pillar 3 - partially done)
- Pattern *detection* exists (PatternObserver: mercy ratio, honesty, violence)
- Emergence *detection* exists (EmergenceObserver: villain/ally emergence)
- **Missing**: Scenario *generation* that targets detected patterns
- **Missing**: AI prompt integration that challenges player tendencies
- **Missing**: Balanced challenge generation (sometimes instinct IS correct)

### The Trial System (Pillar 4 - not started)
- No prosecution/defense mechanics
- No testimony system (NPC witnesses)
- No cross-examination
- No verdict rendering (archetypes: hero, coward, hypocrite, etc.)
- **Has foundation**: Structured events + pattern data provide the evidence

### Chronicle Narrator Bias (Pillar 4 - not started)
- No biased historian AI
- No reputation-preceding-you mechanic
- No Chronicle excerpts shown to NPCs
- **Has foundation**: Event system could feed a Chronicle service

### The Unreliable Self (Pillar 1 - not started)
- No Memory Journal with character bias
- No memory distortion types (self_aggrandizing, guilt_suppression, etc.)
- No dissonance moments (NPC version vs player memory)
- **Has foundation**: Perspective system is designed but not built

## Improvement Plan

### Phase A: Stabilize (P1 - Do First)

Fix the broken build and establish deployability.

1. **Fix all 101 TypeScript errors** - Proper type narrowing, null checks
2. **Pin dependency versions** - Lock exact versions in package.json
3. **Add CI checks** - GitHub Actions for build + test on push
4. **Create production Dockerfile** - Multi-stage build for client + server
5. **Add homelab deploy script** - Ansible role or docker-compose.prod.yml

### Phase B: Complete In-Progress Features (P1)

Finish the partially-implemented work.

1. **Multi-View UI completion** - Fix type errors in views, test join flow
2. **World Seeding completion** - Wire up research console to seed flow
3. **Complete intro scene** - First-time player experience

### Phase C: Pattern Engine Scenarios (P2 - Core Innovation)

This is where Reckoning becomes unique. The detection exists; add the response.

1. **Scenario Generator Service** - Takes pattern data, generates targeted challenges
2. **AI Prompt Integration** - Feed patterns into context builder for smarter generation
3. **Balance System** - Sometimes confirm player instincts (prevent gaming the system)
4. **DM Override** - DM can adjust/veto AI scenario suggestions
5. **Pattern Dashboard** - DM view showing detected tendencies and planned challenges

### Phase D: The Unreliable Self (P2 - Pillar 1)

The Memory Journal and perspective divergence.

1. **Memory Journal Service** - Character-biased recap after significant events
2. **Distortion Engine** - Apply memory distortion types to journal entries
3. **Dissonance Detection** - Flag when NPC and player memories conflict
4. **Player UI** - Show journal entries (biased) alongside game events
5. **AI Integration** - Feed journal into character behavior generation

### Phase E: Chronicle & Trial (P3 - Pillar 4)

The endgame systems.

1. **Chronicle Service** - AI historian with configurable bias
2. **Reputation Mechanic** - NPCs react based on Chronicle, not truth
3. **Trial Engine** - Prosecution/defense/cross-examination flow
4. **Verdict System** - Archetype classification from accumulated evidence
5. **Trial UI** - Dramatic presentation of charges, testimony, verdict

### Phase F: Polish & Deploy (P3)

1. **Mobile-responsive player view** - Phone-friendly for joining games
2. **TV-optimized party view** - 10ft UI for living room play
3. **Sound design** - Ambient audio, transition sounds
4. **Theming** - Visual themes (dark fantasy, noir, comedic)
5. **Save/Load robustness** - Cloud saves, import/export polish

## Deployment Architecture (Proposed)

```
luvu (homelab) or dedicated game server
├── reckoning-server (Fastify API, port 3001)
├── reckoning-client (Vite static build, served by Traefik)
├── redis (TTS cache)
└── SQLite (game data, file-backed)

Traefik routing:
  reckoning.lan → client static
  reckoning.lan/api → server
```

## Recommended Immediate Actions

1. Fix TypeScript build (highest impact, blocks everything)
2. Create production deployment
3. Get a playable session running on the homelab
4. Then iterate on vision features (Pattern Engine first)

## File Listing

Key files for anyone picking this up:

```
docs/VISION.md                    - Game design bible (read first)
docs/plan/README.md               - Phase status overview
packages/server/src/index.ts      - Server entry point
packages/client/src/main.ts       - Client entry point
packages/shared/src/index.ts      - Shared types
packages/server/src/db/schema.sql - Database schema
packages/server/src/services/     - All game services
packages/client/src/views/        - Multi-view UI
```
