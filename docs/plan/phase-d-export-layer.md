# Phase D: Export Layer (Backlog)

## Status: Backlog

This phase is planned for future implementation after Phases A, B, and C are complete.

## Goal

Enable git-diffable game state for persistence, sharing, and derivative works (comics, transcripts).

## Why This Phase?

Export layer enables:
- Git-based persistence (version control for game state)
- Sharing games with others
- Comic/transcript generation from play history
- Backup and restore across devices
- Story analysis and visualization tools

## High-Level Features

### Export Formats

**TOML Export** (human-readable, git-friendly):
```
game/
├── game.toml           # Game metadata
├── characters/
│   ├── player.toml
│   └── companions/
│       └── aria.toml
├── npcs/
│   └── guard_captain.toml
├── locations/
│   └── crossroads.toml
├── scenes/
│   ├── scene-001.toml
│   └── scene-002.toml
├── events/
│   └── events.jsonl    # Event log (append-only)
├── traits.toml         # All entity traits
└── relationships.toml  # All relationships
```

**JSON Export** (machine-readable, single file):
- Complete game state in one JSON file
- Good for API transfer, backup

### Import Capability

- Load exported game into new session
- Resume from any saved state
- Fork a game (branch from a point)

### Git Integration

- Optional: commit on save
- Optional: push to remote
- Diff-friendly format (TOML, JSONL)
- Merge conflict resolution guidance

### Derivative Works

**Comic Generation**:
- Select scenes/events to include
- Generate panel layouts from events
- Export as PDF or image sequence

**Transcript Export**:
- Clean narrative text
- Dialogue-only mode
- Markdown or plain text

## Prerequisites

- Phase A, B, C complete
- Stable data model
- Clear scene boundaries (Phase C)

## Open Questions

1. How to handle large event logs? Pagination, archival?
2. Git authentication - OAuth popup each time, or optional token storage?
3. Comic generation - build into Reckoning or separate tool?
4. Export format versioning - how to handle schema changes?

## Related

- [Chronicle Vision](ssh://git@git.lan/stiwi/chronicle.git/docs/product.md) - Original export/git sync design
- [Phase C: Narrative Structure](./phase-c-narrative-structure.md) - Scene structure for export
