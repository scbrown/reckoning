# Chronicle Integration: Complete Dependency Diagram

This document shows the full dependency chain across all epics.

## Epic-Level Dependencies

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                         CHRONICLE INTEGRATION EPICS                              │
│                                                                                  │
│                           ┌──────────────────────┐                              │
│                           │   entity-evolution   │                              │
│                           │      (EVOL-*)        │                              │
│                           │  15 tasks, ~4 weeks  │                              │
│                           └──────────┬───────────┘                              │
│                                      │                                          │
│                                      │ depends on                               │
│                                      ▼                                          │
│                           ┌──────────────────────┐                              │
│                           │  structured-events   │                              │
│                           │      (SEVT-*)        │                              │
│                           │  12 tasks, ~3 weeks  │                              │
│                           └──────────┬───────────┘                              │
│                                      │                                          │
│                                      │ depends on                               │
│                                      ▼                                          │
│                           ┌──────────────────────┐                              │
│                           │ narrative-structure  │                              │
│                           │      (NARR-*)        │                              │
│                           │  15 tasks, ~4 weeks  │                              │
│                           └──────────┬───────────┘                              │
│                                      │                                          │
│                                      │ depends on                               │
│                                      ▼                                          │
│                           ┌──────────────────────┐                              │
│                           │    export-layer      │                              │
│                           │      (EXPT-*)        │ [BACKLOG]                    │
│                           │  10 tasks, ~3 weeks  │                              │
│                           └──────────────────────┘                              │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

## Cross-Epic Task Dependencies

```
ENTITY-EVOLUTION                STRUCTURED-EVENTS              NARRATIVE-STRUCTURE
════════════════                ═════════════════              ═══════════════════

EVOL-001 (traits migration)
    │
    ▼
EVOL-002 (relationships)
    │
    ▼
EVOL-003 (pending_evolutions)
    │
    ▼
EVOL-004 (trait_catalog)
    │
    ├─────────────┬─────────────┐
    ▼             ▼             ▼
EVOL-005      EVOL-006      EVOL-007
(TraitRepo)   (RelRepo)     (PendingRepo)
    │             │             │
    └─────────────┴─────────────┘
                  │
                  ▼
              EVOL-008 ◄─────────────────────────────────────────────────────┐
              (EvolutionService)                                              │
                  │                                                           │
        ┌─────────┴─────────┐                                                │
        ▼                   ▼                                                 │
    EVOL-009            EVOL-010                                             │
    (labels)            (detection)                                          │
        │                   │                                                 │
        └─────────┬─────────┘                                                │
                  ▼                                                           │
              EVOL-011                                                        │
              (ContentPipeline)                                               │
                  │                                                           │
                  ▼                                                           │
              EVOL-012 ─────────────────────────────────────┐                │
              (ContextBuilder)                               │                │
                  │                                          │                │
                  ▼                                          │                │
              EVOL-013                                       │                │
              (API routes)                                   │                │
                  │                                          │                │
                  ▼                                          │                │
              EVOL-014 ─────────────────────────────────────┼────────────────┤
              (DM UI)                                        │                │
                  │                                          │                │
                  ▼                                          │                │
              EVOL-015                                       │                │
              (docs)                                         │                │
                  │                                          │                │
                  │ epic complete                            │                │
                  ▼                                          │                │
          ┌───────────────────────────────────────┐         │                │
          │     STRUCTURED-EVENTS BEGINS          │         │                │
          └───────────────────────────────────────┘         │                │
                  │                                          │                │
                  ▼                                          │                │
              SEVT-001                                       │                │
              (events migration)                             │                │
                  │                                          │                │
                  ▼                                          │                │
              SEVT-002                                       │                │
              (action vocabulary)                            │                │
                  │                                          │                │
        ┌─────────┼─────────┬─────────┐                     │                │
        ▼         ▼         ▼         │                     │                │
    SEVT-003  SEVT-004  SEVT-005      │                     │                │
    (Builder) (Classify) (EventRepo)  │                     │                │
        │         │         │         │                     │                │
        └─────────┴─────────┘         │                     │                │
                  │                   │                     │                │
                  ▼                   │                     │                │
              SEVT-006                │                     │                │
              (PatternObserver)       │                     │                │
                  │                   │                     │                │
                  ├───────────────────┘                     │                │
                  ▼                                          │                │
              SEVT-007 ◄─────────────────────────────────────┘ (uses EVOL-008)
              (EmergenceObserver)                                             │
                  │                                                           │
                  ▼                                                           │
              SEVT-008                                                        │
              (ContentPipeline)                                               │
                  │                                                           │
                  ▼                                                           │
              SEVT-009 ◄──────────────────────────────────────── (uses EVOL-012)
              (ContextBuilder)
                  │
                  ▼
              SEVT-010
              (API routes)
                  │
                  ▼
              SEVT-011 ◄──────────────────────────────────────── (uses EVOL-014)
              (DM notifications)
                  │
                  ▼
              SEVT-012
              (docs)
                  │
                  │ epic complete
                  ▼
          ┌───────────────────────────────────────┐
          │    NARRATIVE-STRUCTURE BEGINS         │
          └───────────────────────────────────────┘
                  │
                  ▼
              NARR-001
              (scenes migration)
                  │
                  ▼
              NARR-002
              (connections migration)
                  │
                  ▼
              NARR-003
              (availability migration)
                  │
                  ▼
              NARR-004
              (scene_flags + current_scene)
                  │
        ┌─────────┼─────────┬─────────┐
        ▼         ▼         ▼         │
    NARR-005  NARR-006  NARR-007      │
    (SceneRepo)(ConnRepo)(AvailRepo)  │
        │         │         │         │
        └─────────┴─────────┘         │
                  │                   │
                  ▼                   │
              NARR-008                │
              (SceneManager)          │
                  │                   │
        ┌─────────┴─────────┐        │
        ▼                   ▼        │
    NARR-009 ◄──────────────│──────── (uses SEVT-005)
    (boundary)              │
        │                   ▼
        │               NARR-010 ◄──── (uses EVOL-005, EVOL-006)
        │               (requirements)
        │                   │
        └─────────┬─────────┘
                  ▼
              NARR-011
              (GameEngine)
                  │
                  ▼
              NARR-012 ◄──────────────────────────────────────── (uses SEVT-009)
              (ContextBuilder)
                  │
                  ▼
              NARR-013
              (API routes)
                  │
                  ▼
              NARR-014 ◄──────────────────────────────────────── (uses EVOL-014)
              (Scene UI)
                  │
                  ▼
              NARR-015
              (docs)
                  │
                  │ epic complete
                  ▼
          ┌───────────────────────────────────────┐
          │       EXPORT-LAYER BEGINS             │ [BACKLOG]
          └───────────────────────────────────────┘
```

## Critical Path

The critical path through all epics:

```
EVOL-001 → EVOL-002 → EVOL-003 → EVOL-004 → EVOL-005 → EVOL-008 → EVOL-010 →
EVOL-011 → EVOL-012 → EVOL-013 → EVOL-014 → EVOL-015 →

SEVT-001 → SEVT-002 → SEVT-005 → SEVT-006 → SEVT-007 → SEVT-008 → SEVT-009 →
SEVT-010 → SEVT-011 → SEVT-012 →

NARR-001 → NARR-002 → NARR-003 → NARR-004 → NARR-005 → NARR-008 → NARR-010 →
NARR-011 → NARR-012 → NARR-013 → NARR-014 → NARR-015 →

EXPT-001 → EXPT-002 → EXPT-005 → EXPT-006 → EXPT-007 → EXPT-008 → EXPT-010
```

## Parallelization Opportunities

### Within entity-evolution:
- EVOL-005, EVOL-006, EVOL-007 can run in parallel after EVOL-004
- EVOL-009, EVOL-010 can run in parallel after EVOL-008

### Within structured-events:
- SEVT-003, SEVT-004, SEVT-005 can run in parallel after SEVT-002

### Within narrative-structure:
- NARR-005, NARR-006, NARR-007 can run in parallel after NARR-004
- NARR-009, NARR-010 can run in parallel after NARR-008

### Within export-layer:
- EXPT-002, EXPT-003, EXPT-004 can run in parallel after EXPT-001

## Cross-Epic Dependency Summary

| Task | Depends On (Cross-Epic) |
|------|-------------------------|
| SEVT-007 (EmergenceObserver) | EVOL-008 (EvolutionService) |
| SEVT-009 (ContextBuilder) | EVOL-012 (ContextBuilder traits) |
| SEVT-011 (DM notifications) | EVOL-014 (DM UI) |
| NARR-009 (boundary detection) | SEVT-005 (event queries) |
| NARR-010 (requirements) | EVOL-005, EVOL-006 (trait/rel repos) |
| NARR-012 (ContextBuilder) | SEVT-009 (ContextBuilder patterns) |
| NARR-014 (Scene UI) | EVOL-014 (DM UI) |

## Task Count Summary

| Epic | Tasks | Status |
|------|-------|--------|
| entity-evolution | 15 | Planning |
| structured-events | 12 | Planning |
| narrative-structure | 15 | Planning |
| export-layer | 10 | Backlog |
| **Total** | **52** | |
