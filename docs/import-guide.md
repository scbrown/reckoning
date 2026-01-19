---
title: "Import Guide"
type: guide
status: active
created: 2026-01-19
updated: 2026-01-19
version: "1.0.0"
authors:
  - agent
related:
  - ./export-format-specification.md
  - ./plan/export-layer.md
tags:
  - import
  - export
  - guide
  - backup
  - restore
---

# Import Guide

This guide covers importing game state from exported files back into Reckoning. Whether you're restoring a backup, sharing a game between devices, or forking from a save point, this document explains the import process.

## Table of Contents

1. [Overview](#overview)
2. [Supported Formats](#supported-formats)
3. [Import Methods](#import-methods)
4. [Validation and Error Handling](#validation-and-error-handling)
5. [Common Use Cases](#common-use-cases)
6. [Troubleshooting](#troubleshooting)
7. [API Reference](#api-reference)

---

## Overview

Reckoning supports importing game state from two primary formats:

- **TOML Directory**: A folder structure of human-readable TOML files
- **JSON Single File**: A complete game state in one JSON file

Both formats are versioned and validated on import to ensure compatibility and data integrity.

### Import Workflow

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│  Export File │────▶│   Validate   │────▶│   Create     │
│  or Directory│     │   & Parse    │     │   New Game   │
└──────────────┘     └──────────────┘     └──────────────┘
                            │                    │
                            ▼                    ▼
                     ┌──────────────┐     ┌──────────────┐
                     │ Check Version│     │ Populate DB  │
                     │ Compatibility │     │ Tables       │
                     └──────────────┘     └──────────────┘
```

---

## Supported Formats

### TOML Directory Format

Import from a directory containing TOML files exported from Reckoning. This format is ideal for:

- Game state that has been version-controlled with Git
- Human-edited save files
- Merging changes from multiple sources

**Required Files:**
- `manifest.toml` - Export metadata and version
- `game.toml` - Core game state

**Optional Files:**
- `characters/` - Player and companion data
- `npcs/` - Non-player character data
- `locations/` - Area definitions
- `scenes/` - Scene data and connections
- `traits/` - Trait catalog and assignments
- `relationships.toml` - Entity relationships
- `flags.toml` - Game flags
- `events/events.jsonl` - Event history

### JSON Single File Format

Import from a single JSON file. This format is ideal for:

- API-based transfers
- Compressed backups
- Quick restore operations

**File Extensions:**
- `.json` - Uncompressed JSON
- `.json.gz` - Gzip-compressed JSON

---

## Import Methods

### Command Line (Future)

```bash
# Import from TOML directory
reckoning import ./my-game-export/

# Import from JSON file
reckoning import ./my-game.json

# Import from compressed JSON
reckoning import ./my-game.json.gz

# Import with specific options
reckoning import ./my-game.json --skip-events --new-game-id
```

### API Endpoints

#### POST /api/game/import

Import game state from JSON payload.

**Request Body:**
```json
{
  "source": "<json-export-content>",
  "options": {
    "skipEvents": false,
    "generateNewIds": false,
    "mergeBehavior": "replace"
  }
}
```

**Response:**
```json
{
  "success": true,
  "gameId": "imported-game-uuid",
  "warnings": [],
  "stats": {
    "eventsImported": 1523,
    "scenesImported": 15,
    "npcsImported": 8,
    "relationshipsImported": 24
  }
}
```

#### POST /api/game/import/upload

Upload and import a file.

**Request:**
- `Content-Type: multipart/form-data`
- Form field: `file` - The export file (.json, .json.gz, or .zip for TOML)

**Response:**
```json
{
  "success": true,
  "gameId": "imported-game-uuid",
  "format": "json",
  "warnings": []
}
```

---

## Validation and Error Handling

### Version Compatibility

The import system validates version compatibility before processing:

| Export Version | Current Version | Behavior |
|----------------|-----------------|----------|
| Same major     | Any             | Import succeeds |
| Lower major    | Higher          | Migration attempted, warnings issued |
| Higher major   | Lower           | Rejected with upgrade required error |

**Example Error:**
```json
{
  "error": "IMPORT_VERSION_MISMATCH",
  "message": "Export version 2.0.0 requires Reckoning 1.0.0 or higher",
  "exportVersion": "2.0.0",
  "supportedVersions": ["1.0.0", "1.1.0"]
}
```

### Validation Checks

The import system performs these validations:

1. **Manifest Validation**
   - `export.version` is present and compatible
   - `export.format` matches expected format
   - `game_id` is a valid UUID

2. **Required Fields**
   - All required fields are present
   - Field types match schema

3. **Reference Integrity**
   - Character references exist
   - Area references exist
   - Scene connections reference valid scenes

4. **Enum Validation**
   - Scene status is valid (`active`, `completed`, `abandoned`)
   - Connection types are valid
   - Disposition values are valid

### Error Types

| Error Code | Description | Resolution |
|------------|-------------|------------|
| `IMPORT_VERSION_MISMATCH` | Export version incompatible | Upgrade Reckoning or re-export |
| `IMPORT_INVALID_MANIFEST` | Missing or malformed manifest | Check manifest.toml/export metadata |
| `IMPORT_MISSING_REQUIRED` | Required field missing | Add missing field to export |
| `IMPORT_INVALID_REFERENCE` | Reference to non-existent entity | Fix or remove invalid reference |
| `IMPORT_DUPLICATE_ID` | Duplicate entity ID | Use `generateNewIds` option |
| `IMPORT_PARSE_ERROR` | JSON/TOML parsing failed | Check file syntax |

### Handling Partial Imports

If an import fails partway through, the system rolls back all changes:

```
Transaction started
├── Create game record... ✓
├── Import characters... ✓
├── Import NPCs... ✓
├── Import areas... ✗ ERROR
└── Transaction rolled back (no changes persisted)
```

---

## Common Use Cases

### Restoring from Backup

1. Locate your backup file (`.json` or directory)
2. Import using CLI or API
3. Verify game state loaded correctly
4. Continue playing

```bash
# Restore from JSON backup
reckoning import ~/backups/my-game-2026-01-15.json
```

### Sharing a Game

To share your game with someone else:

1. Export your game to JSON
2. Send the file to the recipient
3. They import using their Reckoning instance

**Note:** Shared games create independent copies. Changes made by the recipient don't affect your game.

### Forking a Game

Create a branch point to try different story paths:

1. Export current game state
2. Import with `--new-game-id` flag
3. You now have two independent games at the same point

```bash
# Create a fork for alternative story path
reckoning export --format json ./fork-point.json
reckoning import ./fork-point.json --new-game-id
```

### Merging Git-Tracked Changes

If you've edited TOML files under git version control:

1. Make your changes to the TOML files
2. Commit changes to git
3. Import the modified directory

```bash
# Edit character stats manually
vim my-game-export/characters/player.toml

# Commit changes
git commit -am "Buff player strength"

# Import modified state
reckoning import ./my-game-export/
```

### Migrating Between Devices

To move your game to a new device:

1. Export on the source device
2. Transfer the file (email, cloud storage, USB, etc.)
3. Import on the destination device

---

## Troubleshooting

### "Export version not supported"

**Cause:** The export was created with a newer version of Reckoning.

**Solution:** Update Reckoning to the latest version, or ask the exporter to use an older format version.

### "Invalid manifest.toml"

**Cause:** The manifest file is missing, corrupted, or has invalid syntax.

**Solution:**
1. Check that `manifest.toml` exists in the export directory
2. Validate TOML syntax using an online validator
3. Ensure required fields are present

### "Duplicate game ID"

**Cause:** A game with this ID already exists in your database.

**Solution:** Use the `--new-game-id` option to generate a fresh ID:
```bash
reckoning import ./export/ --new-game-id
```

### "Reference integrity error"

**Cause:** An entity references another entity that doesn't exist in the export.

**Solution:**
1. Check for missing files in the export
2. Verify all referenced IDs exist
3. Remove or fix invalid references

### "Event import failed"

**Cause:** Malformed event data in `events.jsonl`.

**Solution:**
1. Validate JSON on each line of the file
2. Use `--skip-events` to import without event history
3. Manually fix malformed events

### Large File Import Timeout

**Cause:** Very large exports (many events) may timeout.

**Solution:**
1. Use `eventLimit` when exporting to cap event count
2. Import via CLI instead of API for large files
3. Split the import into chunks

---

## API Reference

### Import Options

```typescript
interface ImportOptions {
  /** Skip importing event history (default: false) */
  skipEvents?: boolean;

  /** Skip pending evolutions (default: false) */
  skipPending?: boolean;

  /** Skip emergence notifications (default: false) */
  skipNotifications?: boolean;

  /** Generate new UUIDs for all entities (default: false) */
  generateNewIds?: boolean;

  /** How to handle conflicts with existing data */
  mergeBehavior?: 'replace' | 'skip' | 'error';

  /** Validate without importing (dry run) */
  dryRun?: boolean;
}
```

### Import Result

```typescript
interface ImportResult {
  /** Whether import succeeded */
  success: boolean;

  /** The game ID of the imported game */
  gameId: string;

  /** Format that was imported */
  format: 'toml' | 'json';

  /** Non-fatal warnings during import */
  warnings: ImportWarning[];

  /** Statistics about what was imported */
  stats: ImportStats;
}

interface ImportStats {
  eventsImported: number;
  scenesImported: number;
  npcsImported: number;
  areasImported: number;
  relationshipsImported: number;
  traitsImported: number;
}

interface ImportWarning {
  code: string;
  message: string;
  entity?: string;
  field?: string;
}
```

---

## Related Documentation

- [Export Format Specification](./export-format-specification.md) - Detailed format schema
- [Git Workflow Guide](./git-workflow-guide.md) - Using git with exports
- [Export Layer Plan](./plan/export-layer.md) - Design overview
