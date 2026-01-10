---
title: Documentation Standards
type: meta
status: active
created: 2026-01-10
updated: 2026-01-10
authors:
  - human
related: []
tags:
  - documentation
  - standards
  - meta
---

# Documentation Standards

This document defines standards for all markdown documentation in the Reckoning project.

## Frontmatter Requirements

All markdown files must include YAML frontmatter. This enables:
- Document relationship tracking
- Automated linting and validation
- AI agent context understanding
- Documentation site generation (future)

### Required Fields

| Field | Type | Description |
|-------|------|-------------|
| `title` | string | Human-readable document title |
| `type` | enum | Document category (see types below) |
| `status` | enum | Current document status |
| `created` | date | Creation date (YYYY-MM-DD) |
| `updated` | date | Last meaningful update (YYYY-MM-DD) |

### Optional Fields

| Field | Type | Description |
|-------|------|-------------|
| `authors` | string[] | Contributors (use 'human' or 'agent' or names) |
| `related` | string[] | Relative paths to related documents |
| `tags` | string[] | Searchable keywords |
| `supersedes` | string | Path to document this replaces |
| `superseded_by` | string | Path to document that replaces this |
| `phase` | string | Associated development phase |
| `adr` | string | Associated ADR number (e.g., "0001") |

### Document Types

| Type | Used For | Location |
|------|----------|----------|
| `vision` | Product vision, core concepts | `docs/VISION.md` |
| `plan` | Phase planning documents | `docs/plan/` |
| `adr` | Architecture Decision Records | `docs/adr/` |
| `guide` | How-to guides, tutorials | `docs/` |
| `reference` | API docs, specifications | `docs/` |
| `meta` | Documentation about documentation | `docs/` |
| `contributing` | Contributor guidelines | Root |
| `agent` | AI agent instructions | Root |

### Status Values

| Status | Meaning |
|--------|---------|
| `draft` | Work in progress, not ready for use |
| `active` | Current and accurate |
| `review` | Needs review or updates |
| `deprecated` | Outdated, kept for history |
| `superseded` | Replaced by another document |

## Examples

### Plan Document

```yaml
---
title: "Phase 1: Text-to-Speech Engine"
type: plan
status: active
created: 2026-01-10
updated: 2026-01-10
authors:
  - human
  - agent
related:
  - ../adr/0001-monorepo-architecture.md
  - ./phase-0-project-setup.md
tags:
  - tts
  - elevenlabs
  - audio
phase: "1"
---
```

### ADR Document

```yaml
---
title: "ADR-0001: Monorepo Architecture"
type: adr
status: active
created: 2026-01-10
updated: 2026-01-10
authors:
  - human
  - agent
related:
  - ../plan/phase-0-project-setup.md
tags:
  - architecture
  - monorepo
  - pnpm
adr: "0001"
---
```

## Linting

Run documentation linting with:

```bash
just docs-lint      # Lint all markdown files
just docs-fix       # Fix auto-fixable issues
just docs-check     # Check frontmatter validity
```

### Lint Rules

The doc linter checks:
1. Frontmatter presence and valid YAML
2. Required fields present
3. Valid enum values (type, status)
4. Date format (YYYY-MM-DD)
5. Related file paths exist
6. No orphaned documents (optional warning)

## File Naming

- Use kebab-case: `phase-1-tts-engine.md`
- ADRs: `NNNN-short-title.md` (e.g., `0001-monorepo-architecture.md`)
- Prefix with numbers for ordered reading: `01-getting-started.md`

## Writing Guidelines

1. **Title**: Use the frontmatter title, not a duplicate H1 (unless for display)
2. **Links**: Use relative paths for internal links
3. **Code**: Use fenced code blocks with language hints
4. **Structure**: Keep sections shallow (H2, H3 max)
5. **Updates**: Update the `updated` field when making meaningful changes
