# Epic: Export Layer

Git-diffable game state for persistence, sharing, and derivative works.

## Overview

| Field | Value |
|-------|-------|
| **Epic ID** | export-layer |
| **Prefix** | EXPT |
| **Status** | Complete |
| **Dependencies** | narrative-structure |
| **Blocked By** | None |
| **Completed** | 2026-01-20 |

## Task Dependency Graph

```
                        [narrative-structure complete]
                                    │
                                    ▼
EXPT-001 ─────────────────────────────────────────────────────────────────┐
(export format spec)                                                       │
    │                                                                      │
    ├───────────────────┬───────────────────┐                             │
    ▼                   ▼                   ▼                              │
EXPT-002            EXPT-003            EXPT-004                          │
(TOML exporter)     (JSON exporter)     (JSONL event export)              │
    │                   │                   │                              │
    └───────────────────┴───────────────────┘                             │
                        │                                                  │
                        ▼                                                  │
                    EXPT-005                                               │
                    (Import service)                                       │
                        │                                                  │
                        ▼                                                  │
                    EXPT-006                                               │
                    (Git integration)                                      │
                        │                                                  │
                        ▼                                                  │
                    EXPT-007                                               │
                    (API routes)                                           │
                        │                                                  │
                        ▼                                                  │
                    EXPT-008                                               │
                    (Export UI)                                            │
                        │                                                  │
                        ▼                                                  │
                    EXPT-009                                               │
                    (Comic/transcript generation)                          │
                        │                                                  │
                        ▼                                                  │
                    EXPT-010 ◄─────────────────────────────────────────────┘
                    (documentation)
```

---

## Tasks (Draft)

### EXPT-001: Define export format specification

**Status**: done
**Dependencies**: narrative-structure epic complete
**Blocked By**: NARR-015

#### Description
Define the TOML/JSON export format specification for game state.

#### Acceptance Criteria (Draft)
- [ ] TOML format for human-readable files
- [ ] JSON format for single-file export
- [ ] JSONL format for event log
- [ ] Version field for format versioning
- [ ] Schema documentation

---

### EXPT-002: Implement TOML exporter

**Status**: done
**Dependencies**: EXPT-001

#### Description
Export game state as a directory of TOML files.

#### Acceptance Criteria (Draft)
- [ ] Export structure:
  ```
  export/
  ├── game.toml
  ├── characters/
  ├── npcs/
  ├── locations/
  ├── scenes/
  ├── traits.toml
  └── relationships.toml
  ```
- [ ] Git-friendly format (diffable)

---

### EXPT-003: Implement JSON exporter

**Status**: done
**Dependencies**: EXPT-001

#### Description
Export complete game state as single JSON file.

#### Acceptance Criteria (Draft)
- [ ] Single file containing all game data
- [ ] Suitable for API transfer
- [ ] Compressed option

---

### EXPT-004: Implement JSONL event exporter

**Status**: done
**Dependencies**: EXPT-001

#### Description
Export event log as append-only JSONL file.

#### Acceptance Criteria (Draft)
- [ ] One event per line
- [ ] Chronological order
- [ ] Includes structured event fields

---

### EXPT-005: Implement import service

**Status**: done
**Dependencies**: EXPT-002, EXPT-003, EXPT-004

#### Description
Import exported game state into new game session.

#### Acceptance Criteria (Draft)
- [ ] Import from TOML directory
- [ ] Import from JSON file
- [ ] Validate imported data
- [ ] Handle version mismatches

---

### EXPT-006: Implement Git integration

**Status**: done
**Dependencies**: EXPT-005

#### Description
Optional Git commit on save.

#### Acceptance Criteria (Draft)
- [ ] Initialize git repo for exports
- [ ] Commit on save with message
- [ ] Optional push to remote
- [ ] OAuth for GitHub/GitLab

---

### EXPT-007: Add Export API routes

**Status**: done
**Dependencies**: EXPT-005

#### Description
REST API for export/import operations.

#### Acceptance Criteria (Draft)
- [ ] POST /api/game/:id/export
- [ ] POST /api/game/:id/import
- [ ] GET /api/game/:id/export/status

---

### EXPT-008: Implement Export UI

**Status**: done
**Dependencies**: EXPT-007

#### Description
UI for exporting and importing games.

#### Acceptance Criteria (Draft)
- [ ] Export button with format selection
- [ ] Import wizard
- [ ] Git sync status

---

### EXPT-009: Implement comic/transcript generation

**Status**: done
**Dependencies**: EXPT-004

#### Description
Generate comics or transcripts from event history.

#### Acceptance Criteria (Draft)
- [ ] Scene selection for comic
- [ ] Panel layout generation
- [ ] Transcript export (markdown/plain text)
- [ ] PDF export

---

### EXPT-010: Write export layer documentation

**Status**: done
**Dependencies**: EXPT-009

#### Description
Documentation for export/import functionality.

#### Acceptance Criteria (Draft)
- [ ] Export format specification
- [ ] Import guide
- [ ] Git workflow guide
- [ ] Comic generation guide

---

## Summary

| Task | Title | Dependencies |
|------|-------|--------------|
| EXPT-001 | Define export format specification | narrative-structure |
| EXPT-002 | Implement TOML exporter | EXPT-001 |
| EXPT-003 | Implement JSON exporter | EXPT-001 |
| EXPT-004 | Implement JSONL event exporter | EXPT-001 |
| EXPT-005 | Implement import service | EXPT-002, EXPT-003, EXPT-004 |
| EXPT-006 | Implement Git integration | EXPT-005 |
| EXPT-007 | Add Export API routes | EXPT-005 |
| EXPT-008 | Implement Export UI | EXPT-007 |
| EXPT-009 | Implement comic/transcript generation | EXPT-004 |
| EXPT-010 | Write documentation | EXPT-009 |

## Notes

This epic is in backlog. Full task specifications will be written when:
1. Entity Evolution, Structured Events, and Narrative Structure are complete
2. Data model is stable
3. Export requirements are better understood through usage

Open questions to resolve before implementation:
- Export format versioning strategy
- Large event log handling
- Git authentication approach (OAuth vs stored tokens)
- Comic generation: build in or separate tool?
