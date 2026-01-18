---
type: plan
title: Pixelsrc Integration
phase: 2
status: draft
created: 2026-01-18
---

# Pixelsrc Integration Plan

Integrate pixelsrc into Reckoning for procedurally generated pixel art portraits, scenes, and animations.

## Overview

| Aspect | Decision |
|--------|----------|
| **Portrait Size** | 64x64 (detailed) |
| **Generation Timing** | Upfront during world gen, verified before proceeding |
| **Animation** | Elaborate - leverage CSS keyframes, transforms, palette cycling |
| **Storage** | .pxl source files in game project directory |
| **Rendering** | WASM on both server (Node.js) and client |
| **Validation** | Structural (WASM) + Visual (GenAI reviews rendered PNG) |
| **Failure Handling** | Escalate to GenAI for repair attempts |
| **Evolution** | New variants generated at Act transitions and major events |
| **CLI** | Not required - WASM-only integration |

## Pixelsrc Project Structure

Each game session gets its own pixelsrc project, initialized during world generation.

### Directory Layout

```
data/games/{game-id}/
├── pxl.toml                    # Pixelsrc build config
├── src/
│   ├── palettes/
│   │   ├── world.pxl           # World-wide color themes
│   │   ├── characters.pxl      # Shared character colors
│   │   └── effects.pxl         # Status effect overlays
│   ├── characters/
│   │   ├── {char-id}.pxl       # Party member portraits
│   │   └── ...
│   ├── npcs/
│   │   ├── {npc-id}.pxl        # NPC portraits
│   │   └── ...
│   ├── scenes/
│   │   ├── {area-id}.pxl       # Area backgrounds
│   │   └── ...
│   ├── effects/
│   │   ├── damage.pxl          # Damage overlays
│   │   ├── status.pxl          # Status effect sprites
│   │   └── ...
│   └── evolved/
│       └── act-{n}/            # Art from previous acts (history)
│           ├── characters/
│           └── npcs/
├── build/                       # Rendered output (gitignored)
│   ├── characters/
│   ├── npcs/
│   └── scenes/
└── .pxl-manifest.json          # Incremental build state
```

### Generated pxl.toml

```toml
[project]
name = "{game-id}"
src = "src"
out = "build"

[defaults]
scale = 4  # 64px * 4 = 256px rendered

[atlases.characters]
sources = ["characters/**", "npcs/**"]
max_size = [2048, 2048]
power_of_two = true

[atlases.scenes]
sources = ["scenes/**"]
max_size = [1024, 768]

[animations]
sources = ["characters/**", "npcs/**"]
preview = true

[validate]
strict = true
missing_refs = "error"
```

### Initialization Flow

```typescript
// During world generation:

async function initializePixelsrcProject(gameId: string): Promise<void> {
  const projectPath = `data/games/${gameId}`;

  // 1. Create directory structure (following pixelsrc conventions)
  const dirs = [
    'src/palettes',
    'src/characters',
    'src/npcs',
    'src/scenes',
    'src/effects',
    'src/evolved',
  ];
  for (const dir of dirs) {
    await fs.mkdir(`${projectPath}/${dir}`, { recursive: true });
  }

  // 2. Generate world palette based on theme
  const worldPalette = await generateWorldPalette(worldTheme);
  await fs.writeFile(`${projectPath}/src/palettes/world.pxl`, worldPalette);

  // 3. Generate shared character palette
  const charPalette = await generateCharacterPalette();
  await fs.writeFile(`${projectPath}/src/palettes/characters.pxl`, charPalette);
}
```

### Rendering (WASM)

```typescript
// On-demand rendering using WASM (server or client):

import { render_to_png, validate, list_sprites } from '@pixelsrc/wasm';

async function renderSprite(source: string, spriteName?: string): Promise<Uint8Array> {
  // Validate first
  const errors = validate(source);
  if (errors.length > 0) {
    throw new PixelsrcValidationError(errors);
  }

  // Render to PNG bytes
  return render_to_png(source, spriteName);
}
```

### Shared Palettes

Characters reference shared palettes for visual consistency:

```json
// src/palettes/characters.pxl
{"type": "palette", "name": "character_base", "colors": {
  "--skin-light": "#FFCC99",
  "--skin-medium": "#DEB887",
  "--skin-dark": "#8B5A2B",
  "{_}": "transparent",
  "{outline}": "#2C1810",
  "{eye}": "#000000"
}}

// src/characters/hero.pxl
{"type": "sprite", "name": "hero_idle", "palette": "@include:../palettes/characters.pxl:character_base", ...}
```

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                      GENERATION & VALIDATION PIPELINE                    │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐              │
│  │   Claude     │───▶│  Pixelsrc    │───▶│  Structural  │              │
│  │  (generate)  │    │  (.pxl)      │    │  Validation  │              │
│  └──────────────┘    └──────────────┘    │  (pxl CLI)   │              │
│         ▲                                 └──────┬───────┘              │
│         │                                        │                       │
│         │                                        ▼                       │
│         │                                 ┌──────────────┐              │
│         │                                 │   Valid?     │              │
│         │                                 └──────┬───────┘              │
│         │                                   yes  │  no                   │
│         │         ┌──────────────────────────────┼──────────┐           │
│         │         │                              ▼          │           │
│         │         │                      ┌──────────────┐   │           │
│         │         │                      │ GenAI Repair │   │           │
│         │         │                      │ (suggest +   │───┘           │
│         │         │                      │  fix, max 3) │  retry        │
│         │         │                      └──────────────┘               │
│         │         ▼                                                      │
│         │  ┌──────────────┐    ┌──────────────┐                         │
│         │  │ Render PNG   │───▶│   Visual     │                         │
│         │  │ (pxl render) │    │  Validation  │                         │
│         │  └──────────────┘    │  (Claude)    │                         │
│         │                      └──────┬───────┘                         │
│         │                             │                                  │
│         │                             ▼                                  │
│         │                      ┌──────────────┐                         │
│         │                      │ Looks good?  │                         │
│         │                      └──────┬───────┘                         │
│         │                        yes  │  no                              │
│         │                        ┌────┴────┐                             │
│         │                        │         │                             │
│         │                        │         └─────────────────────┐      │
│         │                        ▼                               │      │
│         │                 ┌──────────────┐                       │      │
│         │                 │   SUCCESS    │                       │      │
│         │                 └──────┬───────┘                       │      │
│         │                        │                               │      │
│         └────────────────────────┼───────────────────────────────┘      │
│                   regenerate     │                    visual feedback    │
│                   with feedback  │                                       │
│                                  ▼                                       │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                     SQLite Database                              │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐              │   │
│  │  │ Characters  │  │   Areas     │  │    NPCs     │              │   │
│  │  │ pixelArt:   │  │ pixelArt:   │  │ pixelArt:   │              │   │
│  │  │  .pxl src   │  │  .pxl src   │  │  .pxl src   │              │   │
│  │  └─────────────┘  └─────────────┘  └─────────────┘              │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│                              CLIENT                                      │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐              │
│  │  .pxl src    │───▶│ @pixelsrc/   │───▶│   Canvas     │              │
│  │  from API    │    │    wasm      │    │   Element    │              │
│  └──────────────┘    └──────────────┘    └──────────────┘              │
│                                                  │                       │
│                                                  ▼                       │
│                                          ┌──────────────┐               │
│                                          │  Animation   │               │
│                                          │   Loop       │◀──┐           │
│                                          └──────────────┘   │           │
│                                                  │          │           │
│                                                  ▼          │           │
│                                          ┌──────────────┐   │           │
│                                          │  TTS Event   │───┘           │
│                                          │  (speaking)  │               │
│                                          └──────────────┘               │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

## Data Model Changes

### Shared Types

```typescript
// packages/shared/src/game/types.ts

/**
 * Reference to pixelsrc art in the game's project directory
 */
export interface PixelArtRef {
  /** Relative path within the pixelsrc project (e.g., "characters/hero.pxl") */
  path: string;
  /** Primary sprite name for static display */
  spriteName: string;
  /** Animation metadata if this is an animated asset */
  animation?: PixelArtAnimation;
}

/**
 * Full pixelsrc art asset (used in API responses)
 */
export interface PixelArt {
  /** The .pxl source (JSONL format) - loaded from filesystem */
  source: string;
  /** Animation metadata if this is an animated asset */
  animation?: PixelArtAnimation;
}

/**
 * Animation metadata for client-side playback
 */
export interface PixelArtAnimation {
  /** Named animation states (e.g., 'idle', 'talking', 'emote') */
  states: Record<string, AnimationState>;
  /** Default state to play */
  defaultState: string;
}

export interface AnimationState {
  /** Keyframe percentages to sprite names */
  keyframes: Record<string, KeyframeData>;
  /** Duration in ms */
  duration: number;
  /** CSS timing function */
  timingFunction?: string;
  /** Whether to loop */
  loop?: boolean;
}

export interface KeyframeData {
  sprite?: string;
  transform?: string;
  opacity?: number;
}

// Extend Character
export interface Character {
  // ... existing fields ...
  /** Reference to pixel art in game's pixelsrc project */
  pixelArtRef?: PixelArtRef;
}

// Extend NPC
export interface NPC {
  // ... existing fields ...
  /** Reference to pixel art in game's pixelsrc project */
  pixelArtRef?: PixelArtRef;
}

// Extend Area
export interface Area {
  // ... existing fields ...
  /** Reference to pixel art scene in game's pixelsrc project */
  pixelArtRef?: PixelArtRef;
}

// Game state tracks pixelsrc project
export interface GameState {
  // ... existing fields ...
  /** Path to game's pixelsrc project */
  pixelsrcProject?: string;
  /** Current act number (for art evolution) */
  act: number;
}
```

## Server Implementation

### Phase 2a: Pixelsrc Service

New service at `packages/server/src/services/pixelsrc/`:

```
packages/server/src/services/pixelsrc/
├── index.ts           # Public API
├── project.ts         # Project directory management
├── generator.ts       # Claude prompt builder for pixelsrc generation
├── validator.ts       # WASM-based validation
├── visual-validator.ts # Claude visual review of rendered PNG
├── repair.ts          # GenAI-powered repair loop
├── renderer.ts        # WASM-based rendering
└── prompts/
    ├── character.ts   # Character portrait prompts
    ├── npc.ts         # NPC portrait prompts
    └── scene.ts       # Area scene prompts
```

#### Generator

```typescript
// generator.ts

export interface PortraitGenerationRequest {
  /** Character/NPC description */
  description: string;
  /** Character class/role for style hints */
  class?: string;
  /** Disposition for NPCs */
  disposition?: NPCDisposition;
  /** Size in pixels (default 64) */
  size?: number;
  /** Animation states to generate */
  animations?: ('idle' | 'talking' | 'emote')[];
}

export interface SceneGenerationRequest {
  /** Area description */
  description: string;
  /** Area tags for style hints */
  tags: string[];
  /** Size in pixels (default 128x96) */
  size?: [number, number];
}

export class PixelsrcGenerator {
  constructor(private aiProvider: AIProvider) {}

  async generatePortrait(request: PortraitGenerationRequest): Promise<string>;
  async generateScene(request: SceneGenerationRequest): Promise<string>;
}
```

#### Validator

```typescript
// validator.ts

import { validate } from '@pixelsrc/wasm';

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
}

export class PixelsrcValidator {
  /**
   * Validate pixelsrc source using WASM
   */
  validate(source: string): ValidationResult {
    const errors = validate(source);
    return {
      valid: errors.length === 0,
      errors: errors.filter(e => e.severity === 'error'),
      warnings: errors.filter(e => e.severity === 'warning'),
    };
  }
}
```

#### Repair Loop

```typescript
// repair.ts

export interface RepairResult {
  success: boolean;
  source: string;
  attempts: number;
  finalErrors?: ValidationError[];
}

export class PixelsrcRepairer {
  constructor(
    private generator: PixelsrcGenerator,
    private validator: PixelsrcValidator,
    private maxAttempts: number = 3
  ) {}

  /**
   * Attempt to repair invalid pixelsrc source using GenAI
   *
   * Loop:
   * 1. Get suggestions from validator
   * 2. Build repair prompt with original source + suggestions
   * 3. Ask Claude to fix the issues
   * 4. Validate the result
   * 5. If still invalid and attempts < max, retry
   */
  async repair(
    originalSource: string,
    validationResult: ValidationResult,
    context: PortraitGenerationRequest | SceneGenerationRequest
  ): Promise<RepairResult>;
}
```

#### Visual Validator

After structural validation passes, render the PNG and have Claude visually verify it.

```typescript
// visual-validator.ts

import { render_to_png } from '@pixelsrc/wasm';

export interface VisualValidationResult {
  approved: boolean;
  feedback?: string;
  issues?: VisualIssue[];
}

export interface VisualIssue {
  severity: 'minor' | 'major' | 'critical';
  description: string;
  suggestion: string;
}

export class PixelsrcVisualValidator {
  constructor(private aiProvider: AIProvider) {}

  /**
   * Render .pxl to PNG and have Claude visually verify it
   *
   * Process:
   * 1. Render via WASM: render_to_png(source)
   * 2. Convert to base64 data URI
   * 3. Send to Claude with original description
   * 4. Claude evaluates: does it look like what was requested?
   * 5. Returns approval or feedback for regeneration
   */
  async validate(
    source: string,
    context: PortraitGenerationRequest | SceneGenerationRequest
  ): Promise<VisualValidationResult> {
    // Render at 4x scale for better visual inspection
    const pngBytes = render_to_png(source, undefined, { scale: 4 });
    const base64 = Buffer.from(pngBytes).toString('base64');
    const dataUri = `data:image/png;base64,${base64}`;

    // Send to Claude for visual review
    const result = await this.aiProvider.execute({
      prompt: this.buildVisualValidationPrompt(context, dataUri),
      // ... image attachment
    });

    return this.parseVisualValidationResponse(result);
  }
}
```

**Visual Validation Prompt:**

```
You are reviewing a generated pixel art portrait. Evaluate whether it matches the description.

ORIGINAL REQUEST:
Name: {name}
Class: {class}
Description: {description}

RENDERED IMAGE:
[PNG image attached]

EVALUATION CRITERIA:
1. Does it resemble the described character (hair color, skin tone, clothing)?
2. Is the face clearly visible and recognizable?
3. Are proportions appropriate for a portrait?
4. Is the overall quality acceptable (no obvious artifacts)?
5. Does it convey the character's class/role?

RESPOND WITH JSON:
{
  "approved": true/false,
  "feedback": "brief explanation if not approved",
  "issues": [
    {
      "severity": "minor|major|critical",
      "description": "what's wrong",
      "suggestion": "how to fix it"
    }
  ]
}
```

### Phase 2b: World Generation Integration

Modify `WorldGenerator` to include pixelsrc generation:

```typescript
// world-generator.ts additions

export interface GeneratedWorld {
  // ... existing fields ...
  /** Whether all pixel art was successfully generated */
  pixelArtComplete: boolean;
  /** Any pixel art generation failures */
  pixelArtFailures?: PixelArtFailure[];
}

export interface PixelArtFailure {
  entityType: 'character' | 'npc' | 'area';
  entityId: string;
  entityName: string;
  error: string;
  attempts: number;
}
```

Generation order:
1. Generate world structure (areas, NPCs) - existing flow
2. Generate party members - existing flow
3. **NEW: Generate pixel art for all entities**
   - Characters (party members)
   - NPCs
   - Areas (scenes)
4. Validate all pixel art
5. Repair any failures
6. Return complete world with `pixelArtComplete` status

### Phase 2c: API Endpoints

```typescript
// New routes in packages/server/src/routes/

// GET /api/game/:id/pixelart/:entityType/:entityId
// Returns the pixel art source and cached PNG for an entity

// POST /api/game/:id/pixelart/:entityType/:entityId/regenerate
// Regenerate pixel art for a specific entity (DM action)

// POST /api/game/:id/pixelart/:entityType/:entityId/edit
// Update the pixel art source directly (advanced DM action)
```

## Client Implementation

### Phase 2d: WASM Integration

Add `@pixelsrc/wasm` to client:

```typescript
// packages/client/src/services/pixelsrc/

export class PixelsrcRenderer {
  private wasmModule: PixelsrcWasm | null = null;
  private cache: Map<string, ImageData> = new Map();

  async init(): Promise<void>;

  /**
   * Render .pxl source to ImageData for canvas
   */
  render(source: string, spriteName?: string): ImageData;

  /**
   * List available sprites in a source
   */
  listSprites(source: string): string[];

  /**
   * Validate source (for editor)
   */
  validate(source: string): ValidationError[];
}
```

### Phase 2e: Animated Avatar Component

Replace `avatar-placeholder` with animated canvas:

```typescript
// packages/client/src/components/animated-avatar.ts

export interface AnimatedAvatarConfig {
  /** Pixel art source */
  pixelArt: PixelArt;
  /** Canvas size (CSS pixels) */
  displaySize?: number;
  /** Initial animation state */
  initialState?: string;
}

export class AnimatedAvatar {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private renderer: PixelsrcRenderer;
  private currentState: string;
  private animationFrame: number | null = null;

  constructor(config: AnimatedAvatarConfig);

  /** Start playing an animation state */
  play(state: string): void;

  /** Stop animation, show static frame */
  stop(): void;

  /** Called when TTS starts for this character */
  startSpeaking(): void;

  /** Called when TTS ends */
  stopSpeaking(): void;

  /** Get the canvas element */
  getElement(): HTMLCanvasElement;

  /** Cleanup */
  destroy(): void;
}
```

### Phase 2f: Integration with Existing Components

Modify `CharacterCard` and `PartyPanel`:

```typescript
// character-card.ts changes

toHTML(): string {
  if (this.character.pixelArt) {
    // Render animated avatar
    return `
      <div class="character-card" data-character-id="${this.character.id}">
        <div class="character-avatar" data-animated="true">
          <canvas class="avatar-canvas" width="64" height="64"></canvas>
        </div>
        <!-- ... rest of card ... -->
      </div>
    `;
  } else {
    // Fallback to initials
    return `
      <div class="character-card" data-character-id="${this.character.id}">
        <div class="character-avatar">
          <div class="avatar-placeholder">${this.getInitials(this.character.name)}</div>
        </div>
        <!-- ... rest of card ... -->
      </div>
    `;
  }
}
```

Modify `SpeechBubble` to trigger avatar animations:

```typescript
// speech-bubble.ts changes

show(characterId: string, text: string): void {
  // ... existing bubble logic ...

  // Trigger speaking animation on avatar
  const avatar = this.findAnimatedAvatar(characterId);
  if (avatar) {
    avatar.startSpeaking();
  }
}

scheduleFade(characterId: string): void {
  // ... existing fade logic ...

  // Stop speaking animation
  const avatar = this.findAnimatedAvatar(characterId);
  if (avatar) {
    avatar.stopSpeaking();
  }
}
```

## Prompt Engineering

### Pixelsrc Primer for GenAI

Generation prompts must include the pixelsrc format primer so Claude knows how to produce valid output. This primer should be fetched from the pixelsrc repo or bundled.

**Source:** `~/workspace/ttp/docs/primer_brief.md` (or `pxl prime --brief` output)

The primer includes:
- JSONL format structure
- Palette definition syntax (tokens, CSS variables, color-mix)
- Sprite grid format (tokens, row arrays)
- Animation keyframe syntax
- Composition layer syntax
- Common patterns and best practices

```typescript
// generator.ts

export class PixelsrcGenerator {
  private primer: string;

  constructor(private aiProvider: AIProvider) {
    // Load primer at startup (bundled or from file)
    this.primer = loadPixelsrcPrimer();
  }

  private buildPrompt(request: PortraitGenerationRequest): string {
    return `
${this.primer}

---

Now generate a portrait for the following character:
...
    `;
  }
}
```

**Note:** The CLI (`pxl`) is not required for Reckoning integration, but GenAI agents working directly in the pixelsrc repo can install it via `cargo install pixelsrc` for testing and debugging.

### Character Portrait Prompt Structure

```
Generate a 64x64 pixel art portrait for an RPG character in pixelsrc format.

CHARACTER:
Name: {name}
Class: {class}
Description: {description}

REQUIREMENTS:
1. Output valid pixelsrc JSONL format
2. Include a semantic palette with CSS variables for easy recoloring
3. Generate these animation states:
   - idle: Subtle breathing animation (2s loop)
   - talking: Mouth/expression changes (200ms per frame, 4 frames)
4. Use {outline} token for crisp edges
5. Face should be centered, looking slightly toward viewer
6. Style: {style_hint based on class}

OUTPUT FORMAT:
Return ONLY valid JSONL, no markdown code blocks.
First line: palette definition
Following lines: sprite definitions
Final lines: animation definitions
```

**Note:** The pixelsrc primer is prepended to this prompt automatically by `PixelsrcGenerator`.

### Scene Prompt Structure

```
Generate a 128x96 pixel art scene for an RPG area in pixelsrc format.

AREA:
Name: {name}
Description: {description}
Tags: {tags}

REQUIREMENTS:
1. Output valid pixelsrc composition format
2. Use cell-based tiling for repeating elements
3. Include atmospheric elements (torches, mist, etc.)
4. Palette should support cycling for ambient animation
5. Layer order: background → midground → foreground
```

**Note:** The pixelsrc primer is prepended to this prompt automatically by `PixelsrcGenerator`.

## Animation States

### Portrait Animations

| State | Description | Implementation |
|-------|-------------|----------------|
| `idle` | Subtle breathing, blinking | Transform: translate(0, -1px) oscillation, occasional eye sprite swap |
| `talking` | Mouth movement | 4-frame mouth cycle: closed → open → wide → open |
| `emote_happy` | Smile expression | Sprite swap to smiling variant |
| `emote_angry` | Angry expression | Sprite swap + slight shake transform |
| `emote_sad` | Sad expression | Sprite swap + slight droop transform |

### Scene Animations

| Effect | Description | Implementation |
|--------|-------------|----------------|
| `ambient` | General atmosphere | Palette cycling for torch flicker, water shimmer |
| `weather` | Environmental effects | Overlay layer with cycling pattern |

## Error Handling & Repair Flow

```
┌─────────────────┐
│ Generate .pxl   │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│   Validate      │
└────────┬────────┘
         │
    ┌────┴────┐
    │ Valid?  │
    └────┬────┘
         │
    yes  │  no
    ┌────┴────────────────┐
    │                     │
    ▼                     ▼
┌─────────┐      ┌─────────────────┐
│ Success │      │ Get Suggestions │
└─────────┘      └────────┬────────┘
                          │
                          ▼
                 ┌─────────────────┐
                 │ Build Repair    │
                 │ Prompt:         │
                 │ - Original .pxl │
                 │ - Errors        │
                 │ - Suggestions   │
                 │ - Context       │
                 └────────┬────────┘
                          │
                          ▼
                 ┌─────────────────┐
                 │ Claude Repair   │
                 └────────┬────────┘
                          │
                          ▼
                 ┌─────────────────┐
                 │ Validate Again  │
                 └────────┬────────┘
                          │
                     ┌────┴────┐
                     │ Valid?  │
                     └────┬────┘
                          │
                    yes   │   no
                    ┌─────┴─────────────────┐
                    │                       │
                    ▼                       ▼
              ┌─────────┐         ┌─────────────────┐
              │ Success │         │ attempts < 3?   │
              └─────────┘         └────────┬────────┘
                                           │
                                     yes   │   no
                                     ┌─────┴─────┐
                                     │           │
                                     ▼           ▼
                               (retry)    ┌───────────┐
                                          │ Log Error │
                                          │ Continue  │
                                          │ w/o art   │
                                          └───────────┘
```

## Dependencies

### Server
- `@pixelsrc/wasm` - NPM package for Node.js rendering and validation

### Client
- `@pixelsrc/wasm` - NPM package for browser rendering

### Development
- pixelsrc repo at `~/workspace/ttp` for reference and testing

**Note:** No CLI installation required. All pixelsrc functionality accessed via WASM.

## Phases

### Phase 2a: Server Foundation
- [ ] Add `@pixelsrc/wasm` dependency to server package
- [ ] Create `packages/server/src/services/pixelsrc/` structure
- [ ] Implement `PixelsrcProjectManager` (directory creation, file management)
- [ ] Implement `PixelsrcValidator` (WASM-based validation)
- [ ] Implement `PixelsrcRenderer` (WASM-based PNG rendering)
- [ ] Implement `PixelsrcGenerator` (prompt builder with pixelsrc primer)
- [ ] Implement `PixelsrcRepairer` (retry loop with validation errors)
- [ ] Implement `PixelsrcVisualValidator` (Claude visual review)
- [ ] Add `pixelArtRef` fields to Character, NPC, Area types
- [ ] Add `pixelsrcProject` and `act` fields to GameState

### Phase 2b: World Generation Integration
- [ ] Create project directory structure during game creation
- [ ] Generate world and character palettes based on theme
- [ ] Modify `WorldGenerator` to include pixel art generation
- [ ] Include pixelsrc primer in generation prompts (format guide)
- [ ] Write generated .pxl files to project directories
- [ ] Add generation prompts for characters and NPCs
- [ ] Add validation/repair loop to generation pipeline
- [ ] Add visual validation step after structural validation
- [ ] Test with various character descriptions

### Phase 2c: API Endpoints
- [ ] Add pixel art retrieval endpoint (loads .pxl from filesystem)
- [ ] Add pixel art regeneration endpoint (writes new .pxl, rebuilds)
- [ ] Add project build status endpoint

### Phase 2d: Client WASM Setup
- [ ] Add `@pixelsrc/wasm` dependency
- [ ] Create `PixelsrcRenderer` service
- [ ] Test rendering in browser

### Phase 2e: Animated Avatar Component
- [ ] Create `AnimatedAvatar` component
- [ ] Implement animation state machine
- [ ] Implement speaking detection integration

### Phase 2f: UI Integration
- [ ] Modify `CharacterCard` to use `AnimatedAvatar`
- [ ] Modify `PartyPanel` to handle animated avatars
- [ ] Modify `SpeechBubble` to trigger animations
- [ ] Add fallback for missing pixel art

### Phase 2g: Scene Backgrounds
- [ ] Add scene generation prompts
- [ ] Implement `AreaPanel` background rendering
- [ ] Add ambient animation support

### Phase 2h: Art Evolution System
- [ ] Implement Act transition detection
- [ ] Implement major event detection
- [ ] Archive current art to `evolved/act-{n}/` on Act transition
- [ ] Create variant generation using pixelsrc composition
- [ ] Write new/modified .pxl files and rebuild
- [ ] Add art history tracking (reference previous versions in prompts)
- [ ] Implement contextual art updates (battle damage, mood changes)

## Testing Strategy

### Unit Tests
- Prompt builder output format
- Validator CLI wrapper
- Repair loop logic

### Integration Tests
- Full generation → validation → repair cycle
- WASM rendering in jsdom/playwright

### E2E Tests
- World generation includes pixel art
- Avatars animate during TTS
- Fallback to initials when no art

## Art Evolution System

Characters and scenes evolve visually as the game progresses, using pixelsrc's composition and variant capabilities.

### Triggers

| Trigger | Description | Art Change |
|---------|-------------|------------|
| **Act Transition** | Major story milestone | Full portrait refresh with accumulated changes |
| **Major Event** | Battle, betrayal, discovery | Contextual modifications |
| **Status Effect** | Poisoned, cursed, blessed | Overlay effects, palette shifts |
| **Equipment Change** | New armor, weapons | Composition layer updates |
| **Emotional Arc** | Character development | Expression/pose variants |

### Implementation

```typescript
// art-evolution.ts

export interface ArtEvolutionContext {
  /** Current game act (1, 2, 3, etc.) */
  act: number;
  /** Recent significant events */
  recentEvents: GameEvent[];
  /** Character's current state */
  characterState: {
    health: number;
    statusEffects: string[];
    equipment: Equipment[];
    emotionalState: string;
  };
  /** Previous art versions for continuity */
  artHistory: PixelArt[];
}

export interface ArtEvolutionRequest {
  entityId: string;
  entityType: 'character' | 'npc' | 'area';
  context: ArtEvolutionContext;
  /** Type of evolution */
  evolutionType: 'act_transition' | 'major_event' | 'status_change' | 'equipment' | 'emotion';
}

export class ArtEvolutionService {
  /**
   * Determine if art should evolve based on game events
   */
  shouldEvolve(context: ArtEvolutionContext): boolean;

  /**
   * Generate evolved art using pixelsrc composition
   *
   * Strategies:
   * 1. Variant: Recolor existing art (mood, damage)
   * 2. Composition: Layer new elements (equipment, effects)
   * 3. Regenerate: Full new portrait (act transitions)
   */
  async evolve(request: ArtEvolutionRequest): Promise<PixelArt>;
}
```

### Evolution Strategies

**1. Variants (Palette Swaps)**
- Battle damage: Darken palette, add red tints
- Mood changes: Warm/cool color shifts
- Corruption/blessing: Purple/gold tints

```json
{"type": "variant", "name": "hero_damaged", "base": "hero_idle", "palette": {
  "{skin}": "color-mix(in oklch, var(--skin-tone) 80%, #8B0000)",
  "{shirt}": "color-mix(in oklch, var(--shirt-color) 70%, #333)"
}}
```

**2. Compositions (Layered Elements)**
- New equipment: Overlay armor/weapons
- Status effects: Add particle overlays
- Scars/marks: Additional sprite layers

```json
{"type": "composition", "name": "hero_armored", "size": [64, 64], "layers": [
  {"sprite": "hero_idle"},
  {"sprite": "plate_armor_overlay", "blend": "normal"},
  {"sprite": "sword_equipped", "offset": [48, 32]}
]}
```

**3. Full Regeneration (New Art)**
- Act transitions: Significant visual refresh
- Major transformations: Complete redesign
- Preserve recognizable elements from previous versions

### Art History

Store previous versions for:
- Visual continuity (reference previous versions in prompts)
- Player nostalgia (view character evolution)
- Rollback if needed

```typescript
export interface PixelArtHistory {
  current: PixelArt;
  versions: {
    source: string;
    createdAt: string;
    trigger: string;
    act: number;
  }[];
}
```

## Open Questions

1. **Art history retention** - How many previous versions to keep?
2. **Evolution frequency** - Rate-limit to avoid too many changes?
3. **Player agency** - Can players reject art evolution?

## Related Documents

- [Pixelsrc Documentation](https://github.com/scbrown/pixelsrc)
- [Phase 1: TTS Engine](./phase-1-tts.md)
- [World Generator](../packages/server/src/services/ai/world-generator.ts)
