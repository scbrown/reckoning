---
title: Planning Standards
type: guide
status: active
created: 2026-01-11
updated: 2026-01-11
authors:
  - human
  - agent
related:
  - ./plan/README.md
  - ./STANDARDS.md
tags:
  - planning
  - standards
  - process
---

# Planning Standards

This document defines standards for creating phase planning documents that enable parallel, isolated task execution by multiple agents or developers.

## Core Principles

### 1. Contracts Before Implementation

All cross-boundary interfaces must be defined before implementation begins:

- **Shared Types** - TypeScript interfaces for data structures
- **API Contracts** - Request/response schemas for all endpoints
- **Event Contracts** - SSE event types and payloads
- **Repository Patterns** - Consistent data access patterns

**Why:** When contracts are defined upfront, developers can work on both sides of an interface simultaneously without coordination.

### 2. Explicit Dependencies

Every task must declare its dependencies explicitly:

```markdown
**Depends on:** 1.1, 2.3
```

**Rules:**
- Tasks with no dependencies can start immediately
- Tasks depending on contracts (not implementations) can start with mocks
- Circular dependencies indicate a design problem

### 3. Testing as Acceptance Criteria

Every task must specify its testing requirements:

```markdown
**Acceptance Criteria:**
- [ ] Feature works as specified

**Testing:**
- [ ] Unit test: Specific behavior tested
- [ ] Integration test: Cross-component flow verified
```

**Test Types:**
| Type | When to Use |
|------|-------------|
| Unit test | Isolated function/class behavior |
| Integration test | Cross-component or API interactions |
| E2E test | Full user flows |
| Visual test | UI layout and appearance |
| Regression test | Ensuring existing behavior unchanged |

### 4. Isolation Through Contracts

Tasks should be implementable without knowledge of other tasks' internals:

**Good:** "Implement PartyRepository per the contract in Contracts section"
**Bad:** "Implement PartyRepository (ask the API developer about the format)"

### 5. Demo as Final Validation

Every phase ends with a demo task that validates the full integration:

```markdown
#### X.X Update Demo Script
**Priority:** High | **Depends on:** All other tasks

- Demonstrates all phase features
- Validates end-to-end integration
- Serves as living documentation
```

---

## Phase Document Structure

Every phase planning document must include these sections:

### 1. Overview & Goals

Brief description of what the phase accomplishes and why.

### 2. Current State

What exists before this phase:
- Components already implemented
- Interfaces already defined
- Known limitations

### 3. Architecture

Visual diagrams showing:
- Component relationships
- Data flow
- Integration points

### 4. Contracts & Interfaces

**Required subsections:**

#### Shared Type Changes
```typescript
// Specify exact type definitions
export interface NewType {
  field: Type;
}
```

#### New Shared Types
Types being introduced for the first time.

#### Repository Pattern
Template for data access (if establishing new pattern).

#### API Request/Response Contracts
```typescript
// GET /api/resource/:id
export interface GetResourceResponse {
  resource: Resource;
}
```

#### SSE Event Contracts
```typescript
export interface NewEvent {
  type: 'event_name';
  payload: PayloadType;
  timestamp: string;
}
```

#### AI Output Schemas
JSON schemas for structured AI output.

#### Migration Strategy
How existing functionality transitions to new approach.

### 5. Implementation Tasks

Organized by streams that can run in parallel:

```markdown
### Stream N: Name

#### N.X Task Name
**Priority:** Critical/High/Medium/Low
**Estimate:** Small/Medium/Large
**Depends on:** Task IDs

[Description and code examples]

**Acceptance Criteria:**
- [ ] Specific, verifiable outcomes

**Testing:**
- [ ] Specific test requirements
```

### 6. Dependency Graph

ASCII diagram showing task dependencies:

```
Stream 1              Stream 2
════════              ════════

┌─────────┐          ┌─────────┐
│   1.1   │          │   2.1   │ ◄── Can start with mocks
└────┬────┘          └────┬────┘
     │                    │
     ▼                    ▼
┌─────────┐          ┌─────────┐
│   1.2   │          │   2.2   │
└────┬────┘          └────┬────┘
     │                    │
     └────────┬───────────┘
              ▼
         ┌─────────┐
         │   3.1   │ ◄── Depends on both streams
         └─────────┘
```

### 7. Parallel Work Opportunities

Tables showing what can run concurrently:

| Task | Stream | Notes |
|------|--------|-------|
| 1.1 | Backend | Foundation |
| 2.1 | UI | Can mock backend |

### 8. Suggested Bead Batches

How to group tasks for assignment:

```markdown
### Batch 1: Foundation (Parallel)
[1.1] Task name
[2.1] Task name
```

### 9. Acceptance Criteria (Phase Complete)

Must Have / Should Have / Nice to Have breakdown.

### 10. Design Decisions

Table of key decisions made during planning:

| Decision | Choice | Notes |
|----------|--------|-------|
| Question | Answer | Rationale |

### 11. Files to Create/Modify

Explicit list of all files affected.

---

## Task Writing Guidelines

### Priority Levels

| Priority | Meaning |
|----------|---------|
| Critical | Blocks other work; must complete first |
| High | Core functionality; essential for phase |
| Medium | Important but not blocking |
| Low | Nice to have; can defer |

### Estimate Levels

| Estimate | Meaning |
|----------|---------|
| Small | < 2 hours focused work |
| Medium | 2-4 hours focused work |
| Large | 4-8 hours focused work |

If a task is larger than "Large", break it down.

### Writing Good Acceptance Criteria

**Be specific and verifiable:**

❌ "Works correctly"
✅ "Returns 404 for non-existent resources"

❌ "Good performance"
✅ "Responds in under 200ms for typical queries"

❌ "Handles errors"
✅ "Returns APIError format with code and message fields"

### Writing Good Test Requirements

**Unit tests** - test isolated behavior:
```markdown
- [ ] Unit test: create() generates valid UUID
- [ ] Unit test: findById() returns null for missing entity
```

**Integration tests** - test component interactions:
```markdown
- [ ] Integration test: POST /api/resource creates database record
- [ ] Integration test: SSE event emitted on state change
```

**E2E tests** - test user flows:
```markdown
- [ ] E2E test: Full new game flow from start to first narration
```

---

## Contract Definition Best Practices

### TypeScript Types

- Use `interface` for objects (extensible)
- Use `type` for unions/primitives
- Export from `@reckoning/shared`
- Include JSDoc comments for complex fields

```typescript
/**
 * A party member's current state
 */
export interface Character {
  id: string;
  name: string;
  /** Freeform archetype, not class-locked */
  role: string;
  /** Current health (0 = incapacitated) */
  health: number;
  maxHealth: number;
}
```

### API Contracts

- Define both request and response types
- Include error response format
- Specify required vs optional fields
- Document validation rules

```typescript
// POST /api/game/:gameId/party/members
export interface AddCharacterRequest {
  name: string;           // Required, 1-50 chars
  description: string;    // Required
  role: string;           // Required
  type?: 'member' | 'companion';  // Optional, defaults to 'member'
}

export interface AddCharacterResponse {
  character: Character;
}

// All error responses
export interface APIError {
  error: {
    code: string;    // Machine-readable code
    message: string; // Human-readable message
  };
}
```

### SSE Events

- Include `type` discriminator field
- Include `timestamp` for ordering
- Keep payloads minimal but complete

```typescript
export interface PartyChangedEvent {
  type: 'party_changed';
  changeType: 'member_added' | 'member_removed' | 'health_changed';
  partyId: string;
  character: Character;
  timestamp: string;
}
```

---

## Migration Strategies

When changing existing behavior, document the transition:

### Coexistence Strategy

Run old and new implementations side-by-side:

```markdown
1. Add feature flag for new behavior
2. New games use new implementation
3. Existing games continue with old
4. Remove old implementation in next phase
```

### Breaking Change Strategy

For changes that can't coexist:

```markdown
1. Document all usages of old interface
2. Create migration script if needed
3. Update all usages in single PR
4. Add regression tests for migrated code
```

---

## Reviewing a Phase Plan

Before marking a plan ready for implementation, verify:

- [ ] All contracts defined in dedicated section
- [ ] Every task has explicit dependencies listed
- [ ] Every task has testing requirements
- [ ] Dependency graph shows no cycles
- [ ] Parallel work opportunities identified
- [ ] Demo task exists as final task
- [ ] Files to create/modify listed explicitly
- [ ] Design decisions documented

---

*This document should evolve as we learn what works. Update it when patterns emerge or problems are discovered.*
