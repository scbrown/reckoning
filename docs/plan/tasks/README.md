# Task Breakdown

This directory contains detailed task breakdowns for Chronicle integration features. Each file represents an **epic** with individual tasks that can be tracked in beads.

## Epics

| Epic | Description | Status | Dependencies |
|------|-------------|--------|--------------|
| [entity-evolution](./entity-evolution.md) | Traits & Relationships | Planning | None |
| [structured-events](./structured-events.md) | Pattern Detection & Emergence | Planning | entity-evolution |
| [narrative-structure](./narrative-structure.md) | Scenes & Story Graph | Planning | structured-events |
| [export-layer](./export-layer.md) | Git Persistence | Backlog | narrative-structure |

## Dependency Graph

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         CHRONICLE INTEGRATION                                │
│                                                                              │
│  ┌──────────────────┐                                                       │
│  │ entity-evolution │ ◄── Foundation: traits, relationships, DM approval    │
│  └────────┬─────────┘                                                       │
│           │                                                                  │
│           │ provides trait/relationship data                                 │
│           ▼                                                                  │
│  ┌──────────────────┐                                                       │
│  │ structured-events│ ◄── Queries traits/relationships for patterns         │
│  └────────┬─────────┘     Emergence observer uses relationship thresholds   │
│           │                                                                  │
│           │ provides scene boundary detection, event classification         │
│           ▼                                                                  │
│  ┌──────────────────┐                                                       │
│  │narrative-structure│ ◄── Groups events into scenes                        │
│  └────────┬─────────┘      Scene requirements can include traits            │
│           │                                                                  │
│           │ provides complete narrative data model                          │
│           ▼                                                                  │
│  ┌──────────────────┐                                                       │
│  │  export-layer    │ ◄── Exports traits, events, scenes, relationships     │
│  └──────────────────┘      Requires stable data model                       │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Task Format

Each task file uses this format:

```markdown
## Task: [EPIC-XXX] Task Title

**Epic**: epic-name
**Status**: todo | in_progress | done
**Dependencies**: [EPIC-YYY], [EPIC-ZZZ]
**Blocked By**: [EPIC-AAA] (if blocked)

### Description
What this task accomplishes.

### Acceptance Criteria
- [ ] Criterion 1
- [ ] Criterion 2

### Technical Notes
Implementation guidance.

### Tests Required
- Unit test for X
- Integration test for Y
```

## Importing to Beads

Tasks can be imported to beads using:

```bash
# Create task from this doc
bd create "EVOL-001: Create entity_traits migration" \
  --epic entity-evolution \
  --deps "none"

# Or bulk import
just import-tasks docs/plan/tasks/entity-evolution.md
```

## Task Prefixes

| Prefix | Epic |
|--------|------|
| EVOL | entity-evolution |
| SEVT | structured-events |
| NARR | narrative-structure |
| EXPT | export-layer |
