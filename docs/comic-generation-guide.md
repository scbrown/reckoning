---
title: "Comic and Transcript Generation Guide"
type: guide
status: active
created: 2026-01-19
updated: 2026-01-19
version: "1.0.0"
authors:
  - agent
related:
  - ./export-format-specification.md
  - ./pixelsrc-integration.md
  - ./plan/export-layer.md
tags:
  - comic
  - transcript
  - derivative
  - export
  - pdf
---

# Comic and Transcript Generation Guide

This guide explains how to create comics and transcripts from your Reckoning gameplay. Transform your adventures into shareable visual stories or readable narratives.

## Table of Contents

1. [Overview](#overview)
2. [Comic Generation](#comic-generation)
3. [Transcript Export](#transcript-export)
4. [Export Formats](#export-formats)
5. [Customization](#customization)
6. [Workflow Examples](#workflow-examples)
7. [API Reference](#api-reference)

---

## Overview

Reckoning captures every moment of your adventure in structured event data. This data can be transformed into:

- **Comics**: Visual panel layouts with character art and dialogue
- **Transcripts**: Clean narrative text for reading or sharing

### Data Flow

```
┌───────────────┐     ┌───────────────┐     ┌───────────────┐
│  Game Events  │────▶│  Generator    │────▶│    Output     │
│  (events.jsonl)│     │  (select,     │     │  (PDF, PNG,   │
│               │     │   layout,     │     │   Markdown)   │
│               │     │   render)     │     │               │
└───────────────┘     └───────────────┘     └───────────────┘
        │                    │
        │              ┌─────┴─────┐
        │              │           │
        ▼              ▼           ▼
   Event Types    Pixel Art    Templates
   - narration    - scenes     - layouts
   - dialogue     - avatars    - styles
   - action       - effects
```

### Event Types for Generation

Not all events translate well to visual format. The generator prioritizes:

| Event Type | Comic Suitability | Transcript Use |
|------------|-------------------|----------------|
| `narration` | Scene panels, captions | Full inclusion |
| `party_dialogue` | Speech bubbles | Full inclusion |
| `npc_dialogue` | Speech bubbles | Full inclusion |
| `party_action` | Action panels | Full inclusion |
| `npc_action` | Action panels | Full inclusion |
| `environment` | Background/atmosphere | Optional |
| `dm_injection` | Narrator boxes | Full inclusion |

---

## Comic Generation

### Basic Usage

Generate a comic from a scene or range of events:

```bash
# Generate comic for a specific scene
reckoning comic create --scene scene-123 --output ./my-comic/

# Generate comic for turn range
reckoning comic create --from-turn 10 --to-turn 25 --output ./my-comic/

# Generate comic for entire game
reckoning comic create --all --output ./my-comic/
```

### Scene Selection

Select which scenes or events to include:

```bash
# Interactive scene picker
reckoning comic create --interactive

# Select multiple scenes
reckoning comic create --scenes scene-001,scene-003,scene-007

# Select by scene type
reckoning comic create --scene-type confrontation,climax

# Exclude certain events
reckoning comic create --exclude-tags internal,meta
```

### Panel Layout

The comic generator creates panel layouts automatically based on event content:

#### Layout Patterns

```
┌─────────────────────────────────────┐
│           Full-width panel          │  <- Scene establishing shot
│         (environment/narration)     │
└─────────────────────────────────────┘

┌─────────────────┬───────────────────┐
│    Half panel   │    Half panel     │  <- Action/reaction
│    (action)     │    (dialogue)     │
└─────────────────┴───────────────────┘

┌──────────┬──────────┬───────────────┐
│  Third   │  Third   │    Third      │  <- Rapid exchange
│(dialogue)│(dialogue)│  (dialogue)   │
└──────────┴──────────┴───────────────┘

┌───────────────────────────────────────┐
│              Splash page              │  <- Major story moments
│         (climax, revelation)          │
│                                       │
└───────────────────────────────────────┘
```

#### Layout Rules

| Event Pattern | Layout |
|---------------|--------|
| Scene opening narration | Full-width establishing shot |
| Single dialogue | Half-panel with speaker |
| Dialogue exchange (2 speakers) | Split panel |
| Rapid dialogue (3+ speakers) | Third panels |
| Major action | Full-width action panel |
| Climax/revelation | Splash page |
| Transition narration | Caption over scene |

### Panel Components

Each panel can include:

- **Background**: Scene pixel art
- **Characters**: Avatar sprites positioned in panel
- **Speech Bubbles**: Dialogue with speaker indicators
- **Captions**: Narration boxes
- **Sound Effects**: Stylized action text
- **Borders**: Panel frames and gutters

### Art Integration

The generator uses your game's pixel art assets:

```
Panel rendering:
1. Load scene background (locations/<area>.pxl)
2. Position character sprites (characters/*.pxl)
3. Apply animation frame (idle, talking, emote)
4. Overlay speech bubbles and captions
5. Add panel border and effects
```

---

## Transcript Export

### Basic Usage

Export your game as readable text:

```bash
# Full game transcript
reckoning transcript export --output ./transcript.md

# Scene-specific transcript
reckoning transcript export --scene scene-123 --output ./scene.md

# Turn range
reckoning transcript export --from-turn 1 --to-turn 50 --output ./act1.md
```

### Output Formats

#### Markdown (Default)

```markdown
# The Dragon's Quest

## Session 1: The Awakening

### Scene: The Village Inn

The morning sun filters through dusty windows as you wake in the village inn.
The innkeeper's daughter approaches your table.

**Mira (Innkeeper's Daughter):** "Good morning, traveler. Did you sleep
well? My father says there's been strange lights in the forest..."

*You notice she seems nervous, glancing toward the door.*

> **Your response:** "Tell me more about these lights."
```

#### Plain Text

```
THE DRAGON'S QUEST
==================

Session 1: The Awakening
------------------------

Scene: The Village Inn

The morning sun filters through dusty windows as you wake in the village
inn. The innkeeper's daughter approaches your table.

MIRA (Innkeeper's Daughter): "Good morning, traveler. Did you sleep well?
My father says there's been strange lights in the forest..."

[You notice she seems nervous, glancing toward the door.]

YOUR RESPONSE: "Tell me more about these lights."
```

### Transcript Options

```bash
# Dialogue only (no narration)
reckoning transcript export --dialogue-only

# Include speaker descriptions
reckoning transcript export --include-descriptions

# Add timestamps
reckoning transcript export --timestamps

# Add turn numbers
reckoning transcript export --turn-numbers

# Include stage directions
reckoning transcript export --stage-directions
```

### Speaker Formatting

Control how speakers are displayed:

```bash
# Full names with titles
--speaker-format full
# Output: "Guard Captain Thorne"

# First name only
--speaker-format first
# Output: "Thorne"

# Abbreviated
--speaker-format abbrev
# Output: "GCT" or "Thorne"

# Role-based
--speaker-format role
# Output: "GUARD CAPTAIN"
```

---

## Export Formats

### PDF Export

Create print-ready PDF files:

```bash
# Comic to PDF
reckoning comic export --format pdf --output ./comic.pdf

# Transcript to PDF
reckoning transcript export --format pdf --output ./transcript.pdf

# Comic with custom settings
reckoning comic export --format pdf \
  --page-size letter \
  --orientation portrait \
  --margin 0.5in \
  --output ./comic.pdf
```

**PDF Options:**

| Option | Values | Default |
|--------|--------|---------|
| `--page-size` | letter, a4, a5, custom | letter |
| `--orientation` | portrait, landscape | portrait |
| `--margin` | size with unit | 0.5in |
| `--bleed` | size for print bleed | 0 |
| `--resolution` | DPI for images | 300 |

### Image Sequence

Export comic panels as individual images:

```bash
# PNG sequence
reckoning comic export --format png --output ./panels/

# Output structure:
# panels/
# ├── page-001-panel-001.png
# ├── page-001-panel-002.png
# ├── page-002-panel-001.png
# └── ...

# With different format
reckoning comic export --format webp --output ./panels/
```

### Web Export

Generate web-friendly output:

```bash
# Static HTML comic
reckoning comic export --format html --output ./web-comic/

# Creates:
# web-comic/
# ├── index.html
# ├── pages/
# │   ├── 1.html
# │   └── 2.html
# ├── images/
# └── style.css
```

---

## Customization

### Comic Styles

Apply visual styles to your comic:

```bash
# Preset styles
reckoning comic create --style classic    # Traditional comic look
reckoning comic create --style manga      # Manga-influenced layout
reckoning comic create --style pixel      # Pixel art enhanced
reckoning comic create --style minimal    # Clean, modern look
```

### Custom Templates

Create custom panel templates:

```toml
# ~/.reckoning/comic-templates/my-style.toml

[template]
name = "My Custom Style"
description = "Personal comic style"

[layout]
panels_per_page = 6
gutter_width = 10
panel_border_width = 2
panel_border_color = "#000000"

[typography]
dialogue_font = "Comic Sans MS"
narration_font = "Georgia"
sound_effect_font = "Impact"
font_size_base = 14

[speech_bubbles]
style = "rounded"
tail_style = "curved"
background_color = "#FFFFFF"
border_color = "#000000"
border_width = 2

[captions]
style = "box"
background_color = "#FFFFD0"
border_color = "#000000"
position = "top"
```

Use custom template:

```bash
reckoning comic create --template my-style --output ./comic/
```

### Transcript Styles

Customize transcript appearance:

```bash
# Screenplay format
reckoning transcript export --style screenplay

# Novel format (integrated narration and dialogue)
reckoning transcript export --style novel

# Chat log format
reckoning transcript export --style chatlog
```

### Color Schemes

```bash
# Light theme (default)
reckoning comic create --theme light

# Dark theme
reckoning comic create --theme dark

# Sepia/vintage
reckoning comic create --theme sepia

# Custom colors
reckoning comic create --background "#F5F5DC" --text "#333333"
```

---

## Workflow Examples

### Creating a Session Recap Comic

After each session, create a visual summary:

```bash
# 1. Identify the session's turn range
reckoning status
# Current turn: 45
# Last session started: turn 35

# 2. Generate comic for session
reckoning comic create \
  --from-turn 35 \
  --to-turn 45 \
  --title "Session 5: The Crossroads Decision" \
  --output ./session-5-comic/

# 3. Export as shareable PDF
reckoning comic export \
  --input ./session-5-comic/ \
  --format pdf \
  --output ./session-5-recap.pdf
```

### Creating a Character Spotlight

Focus on a specific character's journey:

```bash
# Filter events to those involving a character
reckoning comic create \
  --filter-character npc-thorne \
  --title "The Story of Guard Captain Thorne" \
  --output ./thorne-spotlight/
```

### Full Campaign Book

Create a complete campaign archive:

```bash
# 1. Export full transcript
reckoning transcript export \
  --all \
  --format pdf \
  --title "The Dragon's Quest: Complete Chronicle" \
  --output ./campaign-book/transcript.pdf

# 2. Generate comic for key scenes
reckoning comic create \
  --scene-type climax,revelation,confrontation \
  --output ./campaign-book/highlights/

# 3. Export comic pages
reckoning comic export \
  --input ./campaign-book/highlights/ \
  --format pdf \
  --output ./campaign-book/comic-highlights.pdf
```

### Sharing on Social Media

Create shareable images:

```bash
# Single-panel highlight
reckoning comic create \
  --event evt-dramatic-moment \
  --output ./social/

reckoning comic export \
  --input ./social/ \
  --format png \
  --size 1080x1080 \
  --output ./social/highlight.png
```

---

## API Reference

### Comic Generation Options

```typescript
interface ComicOptions {
  /** Scene IDs to include */
  scenes?: string[];

  /** Turn range */
  fromTurn?: number;
  toTurn?: number;

  /** Include all events */
  all?: boolean;

  /** Filter by scene type */
  sceneTypes?: SceneType[];

  /** Filter by character involvement */
  filterCharacter?: string;

  /** Exclude events with these tags */
  excludeTags?: string[];

  /** Comic title */
  title?: string;

  /** Visual style preset */
  style?: 'classic' | 'manga' | 'pixel' | 'minimal';

  /** Custom template name */
  template?: string;

  /** Color theme */
  theme?: 'light' | 'dark' | 'sepia';

  /** Output directory */
  output: string;
}
```

### Transcript Options

```typescript
interface TranscriptOptions {
  /** Scene IDs to include */
  scenes?: string[];

  /** Turn range */
  fromTurn?: number;
  toTurn?: number;

  /** Include all events */
  all?: boolean;

  /** Output format */
  format?: 'markdown' | 'text' | 'pdf' | 'html';

  /** Transcript style */
  style?: 'default' | 'screenplay' | 'novel' | 'chatlog';

  /** Include only dialogue */
  dialogueOnly?: boolean;

  /** Include speaker descriptions */
  includeDescriptions?: boolean;

  /** Add timestamps */
  timestamps?: boolean;

  /** Add turn numbers */
  turnNumbers?: boolean;

  /** Speaker name format */
  speakerFormat?: 'full' | 'first' | 'abbrev' | 'role';

  /** Output file path */
  output: string;
}
```

### Export Options

```typescript
interface ExportOptions {
  /** Input directory (generated comic) */
  input: string;

  /** Output format */
  format: 'pdf' | 'png' | 'webp' | 'html';

  /** Output path */
  output: string;

  /** PDF page size */
  pageSize?: 'letter' | 'a4' | 'a5' | string;

  /** PDF orientation */
  orientation?: 'portrait' | 'landscape';

  /** PDF margins */
  margin?: string;

  /** Image resolution (DPI) */
  resolution?: number;

  /** Target size for images */
  size?: string; // e.g., "1080x1080"
}
```

---

## Tips and Best Practices

### For Better Comics

1. **Pace your events** - Mix dialogue with action and narration
2. **Use scene breaks** - Natural chapter points make better page breaks
3. **Include atmosphere** - Environment events set the mood
4. **Capture reactions** - Witness reactions add depth

### For Better Transcripts

1. **Include context** - Narration helps readers follow along
2. **Format dialogue consistently** - Pick a style and stick with it
3. **Add chapter breaks** - Use scenes as natural divisions
4. **Include timestamps for long games** - Helps reference specific moments

### Performance

- Large games (1000+ events) may take time to process
- Consider generating in chunks for very long campaigns
- Pre-filter events to reduce processing time

---

## Related Documentation

- [Export Format Specification](./export-format-specification.md) - Event data format
- [Pixelsrc Integration Guide](./pixelsrc-integration.md) - Pixel art system
- [Import Guide](./import-guide.md) - Restoring game state
