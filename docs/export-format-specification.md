---
title: "Export Format Specification"
type: specification
status: active
created: 2026-01-19
updated: 2026-01-19
version: "1.0.0"
authors:
  - agent
related:
  - ./plan/export-layer.md
  - ./plan/chronicle-integration.md
  - ./narrative-structure-reference.md
tags:
  - export
  - format
  - toml
  - json
  - jsonl
  - specification
---

# Export Format Specification

This document defines the export format specification for Reckoning game state. Three formats are supported:

| Format | Use Case | Characteristics |
|--------|----------|-----------------|
| **TOML** | Human editing, git version control | Directory structure, git-diffable |
| **JSON** | API transfer, backup, single-file archive | Complete state in one file |
| **JSONL** | Event log, streaming, append-only | One event per line, chronological |

## Table of Contents

1. [Format Versioning](#format-versioning)
2. [TOML Directory Format](#toml-directory-format)
3. [JSON Single-File Format](#json-single-file-format)
4. [JSONL Event Log Format](#jsonl-event-log-format)
5. [Schema Reference](#schema-reference)
6. [Migration and Compatibility](#migration-and-compatibility)

---

## Format Versioning

All export formats include a version field for forward compatibility.

### Version String Format

```
<major>.<minor>.<patch>
```

- **Major**: Breaking schema changes (fields removed, types changed)
- **Minor**: Additive changes (new optional fields)
- **Patch**: Documentation/clarification only

### Current Version

```
1.0.0
```

### Version Handling

| Import Version | Current Version | Behavior |
|----------------|-----------------|----------|
| Same major | Any | Import succeeds |
| Lower major | Higher | Attempt migration, warn user |
| Higher major | Lower | Reject with "upgrade required" |

---

## TOML Directory Format

Human-readable, git-friendly directory structure for game state.

### Directory Structure

```
<export-name>/
├── manifest.toml           # Export metadata and version
├── game.toml               # Core game state
├── characters/
│   ├── player.toml         # Player character
│   └── companions/
│       └── <id>.toml       # Party members
├── npcs/
│   └── <id>.toml           # Non-player characters
├── locations/
│   └── <id>.toml           # Areas with exits and objects
├── scenes/
│   ├── index.toml          # Scene list and current scene
│   ├── <id>.toml           # Individual scenes
│   └── connections.toml    # Scene connections
├── traits/
│   ├── catalog.toml        # Trait definitions
│   └── entities.toml       # Entity trait assignments
├── relationships.toml      # All relationships
├── flags.toml              # Game flags (scene requirements, etc.)
├── events/
│   └── events.jsonl        # Event log (JSONL, not TOML)
└── assets/
    └── pixelsrc/           # Optional: pixel art references
        └── <path>.toml
```

### File Specifications

#### manifest.toml

Export metadata. Must be present and valid for import.

```toml
[export]
version = "1.0.0"
format = "reckoning-toml"
exported_at = "2026-01-19T15:30:00Z"
game_id = "uuid-here"
game_name = "The Dragon's Quest"

[source]
reckoning_version = "0.5.0"
platform = "darwin"

[checksum]
algorithm = "sha256"
value = "abc123..."  # Optional: hash of events.jsonl
```

#### game.toml

Core game state and metadata.

```toml
[game]
id = "uuid-here"
name = "The Dragon's Quest"
created_at = "2026-01-15T10:00:00Z"
updated_at = "2026-01-19T15:30:00Z"

[state]
turn = 42
current_area_id = "area-crossroads"
current_scene_id = "scene-123"  # Optional

[player]
id = "player-uuid"
character_ref = "characters/player.toml"

[party]
id = "party-uuid"
member_refs = [
  "characters/player.toml",
  "characters/companions/aria.toml"
]

[pixelsrc]
project = "path/to/project.pxl"  # Optional
act = 1  # Optional: for art evolution
```

#### characters/player.toml

Player character data.

```toml
[character]
id = "uuid"
name = "Kira Shadowmend"
description = "A wandering blade-dancer with haunted eyes"
class = "blade-dancer"

[stats]
health = 85
max_health = 100
strength = 14
dexterity = 18
wisdom = 12

[voice]
voice_id = "elevenlabs-voice-id"  # Optional

[pixel_art]
path = "characters/hero.pxl"
sprite = "kira"
animation_state = "idle"
```

#### characters/companions/<id>.toml

Party member data. Same schema as player.toml.

#### npcs/<id>.toml

Non-player character data.

```toml
[npc]
id = "uuid"
name = "Guard Captain Thorne"
description = "A stern woman in dented armor"
current_area_id = "area-crossroads"
disposition = "neutral"  # hostile, unfriendly, neutral, friendly, allied
tags = ["guard", "crossroads", "authority"]

[pixel_art]
path = "npcs/guard.pxl"
sprite = "thorne"
```

#### locations/<id>.toml

Area data with exits and objects.

```toml
[area]
id = "area-crossroads"
name = "The Crossroads"
description = "Four dusty roads meet beneath an ancient oak..."
tags = ["outdoor", "hub", "safe"]

[[exits]]
direction = "north"
target_area_id = "area-forest-edge"
description = "A winding path into dark woods"
locked = false

[[exits]]
direction = "east"
target_area_id = "area-village"
description = "The road to Millbrook"
locked = false

[[objects]]
id = "obj-signpost"
name = "Weathered Signpost"
description = "Four arrows point in different directions"
interactable = true
tags = ["readable", "navigation"]

[[objects]]
id = "obj-well"
name = "Stone Well"
description = "A moss-covered well with a rusted bucket"
interactable = true
tags = ["water", "container"]

[pixel_art]
path = "locations/crossroads.pxl"
sprite = "main"
```

#### scenes/index.toml

Scene registry and current scene pointer.

```toml
[scenes]
current_scene_id = "scene-123"
count = 5

[[scenes.list]]
id = "scene-001"
name = "The Awakening"
status = "completed"
file = "scene-001.toml"

[[scenes.list]]
id = "scene-123"
name = "The Crossroads Decision"
status = "active"
file = "scene-123.toml"
```

#### scenes/<id>.toml

Individual scene data.

```toml
[scene]
id = "scene-123"
name = "The Crossroads Decision"
description = "The party must choose their path forward"
scene_type = "confrontation"
location_id = "area-crossroads"
status = "active"  # active, completed, abandoned

[timing]
started_turn = 35
completed_turn = null  # null if active/abandoned

[atmosphere]
mood = "tense"
stakes = "The fate of the missing merchant"

[metadata]
created_at = "2026-01-19T14:00:00Z"
updated_at = "2026-01-19T15:30:00Z"
```

#### scenes/connections.toml

Scene connections with requirements.

```toml
[[connections]]
id = "conn-uuid-1"
from_scene_id = "scene-001"
to_scene_id = "scene-123"
connection_type = "path"  # path, conditional, hidden, one-way, teleport
description = "After leaving the village"

[[connections]]
id = "conn-uuid-2"
from_scene_id = "scene-123"
to_scene_id = "scene-456"
connection_type = "conditional"
description = "Only if the guard trusts you"

[connections.requirements]
flags = ["guard_spoken_to"]
traits = ["honorable"]

[[connections.requirements.relationships]]
entity_type = "npc"
entity_id = "npc-thorne"
dimension = "trust"
min_value = 0.6
```

#### traits/catalog.toml

Predefined trait definitions.

```toml
[catalog]
version = "1.0.0"

[[traits]]
trait = "honorable"
category = "moral"  # moral, emotional, capability, reputation
description = "Acts with integrity even at personal cost"

[[traits]]
trait = "haunted"
category = "emotional"
description = "Troubled by past events"

[[traits]]
trait = "battle-hardened"
category = "capability"
description = "Experienced in combat"

[[traits]]
trait = "feared"
category = "reputation"
description = "Others are afraid of this entity"
```

#### traits/entities.toml

Entity trait assignments.

```toml
[[entity_traits]]
id = "trait-uuid-1"
entity_type = "player"  # player, character, npc, location
entity_id = "player-uuid"
trait = "honorable"
acquired_turn = 15
source_event_id = "event-uuid-123"
status = "active"  # active, faded, removed

[[entity_traits]]
id = "trait-uuid-2"
entity_type = "npc"
entity_id = "npc-thorne"
trait = "suspicious"
acquired_turn = 20
status = "active"
```

#### relationships.toml

All relationships between entities.

```toml
[[relationships]]
id = "rel-uuid-1"
from_type = "player"
from_id = "player-uuid"
to_type = "npc"
to_id = "npc-thorne"
updated_turn = 38

[relationships.dimensions]
trust = 0.45
respect = 0.70
affection = 0.20
fear = 0.10
resentment = 0.15
debt = 0.00

[[relationships]]
id = "rel-uuid-2"
from_type = "npc"
from_id = "npc-merchant"
to_type = "player"
to_id = "player-uuid"
updated_turn = 25

[relationships.dimensions]
trust = 0.80
respect = 0.50
affection = 0.30
fear = 0.00
resentment = 0.00
debt = 0.40
```

#### flags.toml

Game flags for scene requirements and state tracking.

```toml
[flags]
guard_spoken_to = true
secret_passage_discovered = false
merchant_quest_accepted = true
dragon_awakened = false
```

#### events/events.jsonl

Event log. See [JSONL Event Log Format](#jsonl-event-log-format).

---

## JSON Single-File Format

Complete game state in a single JSON file for API transfer and backup.

### Structure

```json
{
  "export": {
    "version": "1.0.0",
    "format": "reckoning-json",
    "exported_at": "2026-01-19T15:30:00Z",
    "game_id": "uuid-here"
  },
  "game": {
    "id": "uuid",
    "name": "The Dragon's Quest",
    "created_at": "2026-01-15T10:00:00Z",
    "updated_at": "2026-01-19T15:30:00Z",
    "turn": 42,
    "current_area_id": "area-crossroads",
    "current_scene_id": "scene-123",
    "pixelsrc_project": "path/to/project.pxl",
    "act": 1
  },
  "player": { /* Character object */ },
  "party": {
    "id": "party-uuid",
    "members": [ /* Character objects */ ]
  },
  "npcs": [ /* NPC objects */ ],
  "areas": [ /* Area objects with exits and objects */ ],
  "scenes": {
    "current_scene_id": "scene-123",
    "list": [ /* Scene objects */ ],
    "connections": [ /* Connection objects */ ],
    "availability": [ /* Availability objects */ ]
  },
  "traits": {
    "catalog": [ /* Trait definitions */ ],
    "entities": [ /* Entity trait assignments */ ]
  },
  "relationships": [ /* Relationship objects */ ],
  "flags": { /* Key-value pairs */ },
  "events": [ /* Event objects - optional, can be large */ ],
  "pending_evolutions": [ /* Pending evolution objects */ ],
  "emergence_notifications": [ /* Emergence notification objects */ ]
}
```

### Field Details

#### Export Metadata

```json
{
  "export": {
    "version": "1.0.0",
    "format": "reckoning-json",
    "exported_at": "2026-01-19T15:30:00Z",
    "game_id": "uuid-here",
    "game_name": "The Dragon's Quest",
    "source": {
      "reckoning_version": "0.5.0",
      "platform": "darwin"
    },
    "options": {
      "include_events": true,
      "event_limit": null,
      "compressed": false
    }
  }
}
```

#### Character Object

```json
{
  "id": "uuid",
  "name": "Kira Shadowmend",
  "description": "A wandering blade-dancer",
  "class": "blade-dancer",
  "stats": {
    "health": 85,
    "max_health": 100,
    "strength": 14,
    "dexterity": 18,
    "wisdom": 12
  },
  "voice_id": "elevenlabs-id",
  "pixel_art_ref": {
    "path": "characters/hero.pxl",
    "sprite_name": "kira",
    "animation": null
  }
}
```

#### NPC Object

```json
{
  "id": "uuid",
  "name": "Guard Captain Thorne",
  "description": "A stern woman in dented armor",
  "current_area_id": "area-crossroads",
  "disposition": "neutral",
  "tags": ["guard", "crossroads", "authority"],
  "pixel_art_ref": null
}
```

#### Area Object

```json
{
  "id": "area-crossroads",
  "name": "The Crossroads",
  "description": "Four dusty roads meet...",
  "tags": ["outdoor", "hub", "safe"],
  "exits": [
    {
      "direction": "north",
      "target_area_id": "area-forest-edge",
      "description": "A winding path into dark woods",
      "locked": false
    }
  ],
  "objects": [
    {
      "id": "obj-signpost",
      "name": "Weathered Signpost",
      "description": "Four arrows point in different directions",
      "interactable": true,
      "tags": ["readable", "navigation"]
    }
  ],
  "pixel_art_ref": null
}
```

#### Scene Object

```json
{
  "id": "scene-123",
  "game_id": "game-uuid",
  "name": "The Crossroads Decision",
  "description": "The party must choose their path forward",
  "scene_type": "confrontation",
  "location_id": "area-crossroads",
  "started_turn": 35,
  "completed_turn": null,
  "status": "active",
  "mood": "tense",
  "stakes": "The fate of the missing merchant",
  "created_at": "2026-01-19T14:00:00Z",
  "updated_at": "2026-01-19T15:30:00Z"
}
```

#### Scene Connection Object

```json
{
  "id": "conn-uuid",
  "game_id": "game-uuid",
  "from_scene_id": "scene-001",
  "to_scene_id": "scene-123",
  "connection_type": "conditional",
  "description": "Only if the guard trusts you",
  "requirements": {
    "flags": ["guard_spoken_to"],
    "traits": ["honorable"],
    "relationships": [
      {
        "entity_type": "npc",
        "entity_id": "npc-thorne",
        "dimension": "trust",
        "min_value": 0.6
      }
    ]
  },
  "created_at": "2026-01-19T14:00:00Z"
}
```

#### Relationship Object

```json
{
  "id": "rel-uuid",
  "game_id": "game-uuid",
  "from": {
    "type": "player",
    "id": "player-uuid"
  },
  "to": {
    "type": "npc",
    "id": "npc-thorne"
  },
  "trust": 0.45,
  "respect": 0.70,
  "affection": 0.20,
  "fear": 0.10,
  "resentment": 0.15,
  "debt": 0.00,
  "updated_turn": 38,
  "created_at": "2026-01-19T10:00:00Z",
  "updated_at": "2026-01-19T15:30:00Z"
}
```

#### Entity Trait Object

```json
{
  "id": "trait-uuid",
  "game_id": "game-uuid",
  "entity_type": "player",
  "entity_id": "player-uuid",
  "trait": "honorable",
  "acquired_turn": 15,
  "source_event_id": "event-uuid-123",
  "status": "active",
  "created_at": "2026-01-19T10:00:00Z"
}
```

### Export Options

```json
{
  "options": {
    "include_events": true,      // Include full event history
    "event_limit": 1000,         // Max events (null = all)
    "include_pending": true,     // Include pending evolutions
    "include_notifications": true, // Include emergence notifications
    "compressed": false          // gzip compress output
  }
}
```

---

## JSONL Event Log Format

Append-only event log with one JSON object per line. Used for event history in both TOML exports and standalone event archives.

### Format

Each line is a valid JSON object followed by a newline (`\n`). No trailing comma.

```jsonl
{"id":"evt-001","game_id":"game-uuid","turn":1,"timestamp":"2026-01-15T10:00:00Z","event_type":"narration","content":"The morning sun...","location_id":"area-village"}
{"id":"evt-002","game_id":"game-uuid","turn":1,"timestamp":"2026-01-15T10:01:00Z","event_type":"party_action","content":"You step outside...","action":"move","actor_type":"player","actor_id":"player-uuid","location_id":"area-village"}
```

### Event Object Schema

```json
{
  "id": "string (UUID)",
  "game_id": "string (UUID)",
  "turn": "number",
  "timestamp": "string (ISO 8601)",
  "event_type": "string (enum)",
  "content": "string",
  "original_generated": "string | null",
  "speaker": "string | null",
  "location_id": "string (UUID)",
  "witnesses": ["string (entity refs)"],

  "action": "string | null",
  "actor_type": "string | null (player, character, npc, system)",
  "actor_id": "string | null (UUID)",
  "target_type": "string | null (player, character, npc, area, object)",
  "target_id": "string | null (UUID)",
  "tags": ["string"]
}
```

### Event Types

| Type | Description |
|------|-------------|
| `narration` | Descriptive text, scene-setting |
| `party_action` | Player/party performs an action |
| `party_dialogue` | Player/party speaks |
| `npc_action` | NPC performs an action |
| `npc_dialogue` | NPC speaks |
| `environment` | World event, weather, ambient |
| `dm_injection` | DM-added content |

### Example Events

#### Narration Event

```json
{
  "id": "evt-001",
  "game_id": "game-uuid",
  "turn": 1,
  "timestamp": "2026-01-15T10:00:00Z",
  "event_type": "narration",
  "content": "The morning sun filters through dusty windows as you wake in the village inn.",
  "location_id": "area-inn",
  "witnesses": [],
  "tags": ["scene_opening", "morning"]
}
```

#### Party Action Event

```json
{
  "id": "evt-015",
  "game_id": "game-uuid",
  "turn": 5,
  "timestamp": "2026-01-15T10:15:00Z",
  "event_type": "party_action",
  "content": "You spare the wounded bandit, binding his wounds.",
  "action": "spare_enemy",
  "actor_type": "player",
  "actor_id": "player-uuid",
  "target_type": "npc",
  "target_id": "npc-bandit-1",
  "location_id": "area-forest",
  "witnesses": ["npc-companion-aria", "npc-bandit-2"],
  "tags": ["mercy", "combat_end"]
}
```

#### NPC Dialogue Event

```json
{
  "id": "evt-025",
  "game_id": "game-uuid",
  "turn": 10,
  "timestamp": "2026-01-15T11:00:00Z",
  "event_type": "npc_dialogue",
  "content": "\"I won't forget this kindness,\" the bandit says, meeting your eyes.",
  "speaker": "Wounded Bandit",
  "action": "speak",
  "actor_type": "npc",
  "actor_id": "npc-bandit-1",
  "target_type": "player",
  "target_id": "player-uuid",
  "location_id": "area-forest",
  "witnesses": ["npc-companion-aria"],
  "tags": ["gratitude", "consequence"]
}
```

### Header Line (Optional)

The first line may be a metadata header prefixed with `#`:

```jsonl
# {"export_version":"1.0.0","game_id":"game-uuid","exported_at":"2026-01-19T15:30:00Z","event_count":1523}
{"id":"evt-001",...}
{"id":"evt-002",...}
```

### Streaming and Pagination

For large event logs:

1. **Chunked export**: Split into files by turn range
   - `events-0001-0500.jsonl`
   - `events-0501-1000.jsonl`

2. **Manifest file**: `events/manifest.toml`
   ```toml
   [events]
   total_count = 1523
   chunk_size = 500

   [[chunks]]
   file = "events-0001-0500.jsonl"
   turn_start = 1
   turn_end = 500
   event_count = 500
   ```

---

## Schema Reference

### Type Definitions

#### Entity Types

```
player | character | npc | location | object
```

#### Scene Status

```
active | completed | abandoned
```

#### Scene Types

```
exploration | combat | social | puzzle | rest | transition |
exposition | confrontation | revelation | climax | denouement | interlude
```

#### Connection Types

```
path | conditional | hidden | one-way | teleport
```

#### NPC Disposition

```
hostile | unfriendly | neutral | friendly | allied
```

#### Trait Categories

```
moral | emotional | capability | reputation
```

#### Relationship Dimensions

```
trust | respect | affection | fear | resentment | debt
```

All dimension values are floats in range `[0.0, 1.0]`.

#### Trait Status

```
active | faded | removed
```

#### Evolution Status

```
pending | approved | edited | refused
```

### Required vs Optional Fields

#### Always Required

- `export.version`
- `export.format`
- `export.exported_at`
- `game.id`
- `game.turn`
- All `id` fields on entities

#### Optional (nullable)

- `game.current_scene_id`
- `game.pixelsrc_project`
- `scene.completed_turn`
- `character.voice_id`
- `*.pixel_art_ref`
- `event.original_generated`
- `event.speaker`
- `event.action`, `event.actor_*`, `event.target_*`

---

## Migration and Compatibility

### Version Upgrade Path

| From | To | Migration Notes |
|------|-----|-----------------|
| 1.0.x | 1.0.y | No migration needed |
| 1.0.x | 1.1.x | New optional fields ignored on import |
| 1.x.x | 2.0.0 | (Future) Migration script required |

### Backwards Compatibility Guarantees

Within a major version:
- New fields will always be optional
- Existing field types will not change
- Existing field names will not change
- Removal of fields requires major version bump

### Import Validation

On import, validate:
1. `export.version` is compatible
2. Required fields are present
3. IDs are valid UUIDs
4. References (foreign keys) are consistent
5. Enum values are valid

### Error Handling

```json
{
  "error": "IMPORT_VERSION_MISMATCH",
  "message": "Export version 2.0.0 requires Reckoning 1.0.0 or higher",
  "export_version": "2.0.0",
  "supported_versions": ["1.0.0", "1.1.0"]
}
```

---

## Quick Reference

### TOML Export Command (Future)

```bash
reckoning export --format toml --output ./my-game-export/ <game-id>
```

### JSON Export Command (Future)

```bash
reckoning export --format json --output ./my-game.json <game-id>
```

### JSONL Export Command (Future)

```bash
reckoning export --format jsonl --output ./events.jsonl --events-only <game-id>
```

### Import Command (Future)

```bash
reckoning import ./my-game-export/
reckoning import ./my-game.json
```

---

## Appendix: Full TOML Example

See [examples/export-toml/](./examples/export-toml/) for a complete example export.

## Appendix: Full JSON Example

See [examples/export-json/](./examples/export-json/) for a complete example export.
