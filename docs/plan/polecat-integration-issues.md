---
title: Polecat Integration Issues
type: plan
status: draft
created: 2026-01-10
updated: 2026-01-10
authors:
  - ai
related:
  - ./phase-2-dm-engine.md
  - ../adr/0001-monorepo-architecture.md
tags:
  - technical-debt
  - polecat
  - integration
---

# Polecat Integration Issues

This document tracks issues discovered during investigation of polecat (multi-agent) work that was merged without full coordination. These issues should be reviewed and addressed after Phase 2 completion.

## Background

During Phase 2 polecat dispatch, multiple agents were assigned work based on commit `2b948f5`. However, main moved forward with 8 commits before the polecat branches were merged:

- Docker networking fixes
- Beads config files
- TTS speak endpoint (`d3621a4`)
- Gastown formula
- Phase 2 planning

The polecats worked in isolation and created code that assumed types/features from other polecats that they never saw.

## Issues Found

### 1. Missing Type Exports from @reckoning/shared

**Severity:** High
**Packages affected:** client, server

The client and server packages import types that aren't exported from `@reckoning/shared`:

#### Client missing imports:
- `GameSession`
- `DMEditorState`
- `CanonicalEvent`
- `GeneratedContent`
- `DMAction`
- `PlaybackMode`
- `SystemStatus`
- `GameObservation`
- `EventType`
- `SSEEvent`
- `SSEEventType`
- `ITTSService`
- `TTSQueueItem`
- `TTSQueueStatus`
- `TTSPlaybackState`
- `TTSEventCallbacks`

#### Server missing imports:
- `Area`
- `NPC`
- `Character`
- `CanonicalEvent`
- `GenerationContext`

**Root cause:** Types are defined in `shared/src/game/*.ts` and `shared/src/tts/*.ts` but not properly re-exported from the package index.

**Fix approach:** Audit `shared/src/index.ts` and ensure all types needed by client/server are exported.

### 2. Missing better-sqlite3 Package

**Severity:** High
**Packages affected:** server

```
src/db/index.ts(1,22): error TS2307: Cannot find module 'better-sqlite3'
```

The database module imports `better-sqlite3` but the package is not installed.

**Fix approach:** Add `better-sqlite3` and `@types/better-sqlite3` to server package dependencies.

### 3. Prompt Template Type Issues

**Severity:** Medium
**Packages affected:** server

The AI prompt templates reference properties that don't exist on their context types:

```
src/services/ai/prompts/index.ts(78,19): error TS2339: Property 'type' does not exist on type 'PromptBuildContext'.
```

**Fix approach:** Review `PromptBuildContext` interface and add missing properties, or update prompt templates to use correct property names.

### 4. Unused Imports in Prompts

**Severity:** Low
**Packages affected:** server

```
src/services/ai/prompts/index.ts(17,8): error TS6133: 'EnvironmentTrigger' is declared but its value is never read.
src/services/ai/prompts/index.ts(19,1): error TS6133: 'formatRecentEvents' is declared but its value is never read.
```

**Fix approach:** Remove unused imports or implement the features that need them.

### 5. Implicit Any Types in Scene Prompts

**Severity:** Low
**Packages affected:** server

```
src/services/ai/prompts/scene.ts(35,11): error TS7006: Parameter 'e' implicitly has an 'any' type.
src/services/ai/prompts/scene.ts(37,41): error TS7006: Parameter 'o' implicitly has an 'any' type.
```

**Fix approach:** Add explicit type annotations to lambda parameters.

## Resolution Fixed

The following issue was fixed during this investigation:

- **Duplicate SSE type exports** - Both `game/events.ts` and `sse/index.ts` exported types with the same names (`SSEEvent`, `GenerationStartedEvent`, etc.). Fixed by removing SSE type exports from `game/index.ts` since they're already exported from `sse/index.ts`.

## Recommendations

1. **Before next polecat dispatch:** Ensure base branch passes `just check` before dispatching work
2. **Type coordination:** When multiple polecats create interdependent types, consider having a "types" polecat run first
3. **Integration testing:** Run full typecheck after merging each polecat branch, not just at the end
4. **Beads workflow:** Consider adding a "blocked by" relationship for type-dependent tasks

## Related Issues

- `reckoning-4ot` - Fixed TTS route tests (closed)
