---
title: Architecture Decision Records
type: meta
status: active
created: 2026-01-10
updated: 2026-01-10
authors:
  - human
  - agent
related:
  - ./0001-monorepo-architecture.md
tags:
  - adr
  - architecture
  - decisions
---

# Architecture Decision Records

This directory contains Architecture Decision Records (ADRs) for the Reckoning project.

## What is an ADR?

An ADR is a document that captures an important architectural decision made along with its context and consequences. ADRs help us:

- Remember why decisions were made
- Onboard new team members (human or AI)
- Avoid revisiting settled decisions without new information
- Track the evolution of the architecture

## ADR Format

Each ADR follows this structure:

1. **Title**: Short noun phrase (e.g., "Monorepo Structure")
2. **Status**: Proposed → Accepted → Deprecated/Superseded
3. **Context**: What forces are at play? What's the problem?
4. **Decision**: What we decided to do
5. **Consequences**: What are the results? (good, bad, neutral)

## Index

| ID | Title | Status | Date |
|----|-------|--------|------|
| [ADR-0001](./0001-monorepo-architecture.md) | Monorepo Architecture | Accepted | 2026-01-10 |

## Creating a New ADR

1. Copy the template: `cp docs/adr/_template.md docs/adr/NNNN-short-title.md`
2. Fill in the sections
3. Add to the index above
4. Get team review if needed
5. Update status to Accepted

## Superseding an ADR

When a decision changes:
1. Create a new ADR explaining the new decision
2. Update the old ADR's status to "Superseded by ADR-NNNN"
3. Link between the two ADRs
