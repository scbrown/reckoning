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
| **Storage** | .pxl source in DB, pre-render and cache PNGs |
| **Failure Handling** | Escalate to GenAI for repair attempts |

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           WORLD GENERATION                               │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐              │
│  │   Claude     │───▶│  Pixelsrc    │───▶│  Validation  │              │
│  │  (generate)  │    │  (.pxl)      │    │  (pxl CLI)   │              │
│  └──────────────┘    └──────────────┘    └──────────────┘              │
│         │                   │                   │                        │
│         │                   │                   ▼                        │
│         │                   │           ┌──────────────┐                │
│         │                   │           │  Validation  │                │
│         │                   │           │   Failed?    │                │
│         │                   │           └──────────────┘                │
│         │                   │                   │                        │
│         │                   │         yes │     │ no                    │
│         │                   │             ▼     ▼                        │
│         │                   │    ┌──────────────────┐                   │
│         │                   │    │  GenAI Repair    │                   │
│         │                   │    │  (suggestions +  │                   │
│         │                   │    │   fix attempt)   │                   │
│         │                   │    └──────────────────┘                   │
│         │                   │             │                              │
│         │                   │             │ retry (max 3)               │
│         │                   │             └──────────┐                   │
│         ▼                   ▼                        ▼                   │
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
│                             │                    │                       │
│                             │                    ▼                       │
│                             │           ┌──────────────┐                │
│                             │           │  Animation   │                │
│                             │           │   Loop       │◀──┐            │
│                             │           └──────────────┘   │            │
│                             │                    │          │            │
│                             │                    ▼          │            │
│                             │           ┌──────────────┐   │            │
│                             │           │  TTS Event   │───┘            │
│                             │           │  (speaking)  │                │
│                             │           └──────────────┘                │
│                             │                                            │
│                             ▼                                            │
│                      ┌──────────────┐                                   │
│                      │  PNG Cache   │                                   │
│                      │ (pre-render) │                                   │
│                      └──────────────┘                                   │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

## Data Model Changes

### Shared Types

```typescript
// packages/shared/src/game/types.ts

/**
 * Pixelsrc art asset with source and cached render
 */
export interface PixelArt {
  /** The .pxl source (JSONL format) */
  source: string;
  /** Pre-rendered PNG as base64 data URI (cached) */
  cachedPng?: string;
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
  /** Generated pixel art portrait */
  pixelArt?: PixelArt;
}

// Extend NPC
export interface NPC {
  // ... existing fields ...
  /** Generated pixel art portrait */
  pixelArt?: PixelArt;
}

// Extend Area
export interface Area {
  // ... existing fields ...
  /** Generated pixel art scene */
  pixelArt?: PixelArt;
}
```

## Server Implementation

### Phase 2a: Pixelsrc Service

New service at `packages/server/src/services/pixelsrc/`:

```
packages/server/src/services/pixelsrc/
├── index.ts           # Public API
├── generator.ts       # Claude prompt builder for pixelsrc generation
├── validator.ts       # Wrapper around pxl CLI for validation
├── repair.ts          # GenAI-powered repair loop
├── renderer.ts        # Pre-render to PNG (optional caching)
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

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
  suggestions: Suggestion[];
}

export class PixelsrcValidator {
  /**
   * Validate pixelsrc source using pxl CLI
   * Runs: pxl validate --json <tempfile>
   */
  async validate(source: string): Promise<ValidationResult>;

  /**
   * Get suggestions for fixing issues
   * Runs: pxl suggest --json <tempfile>
   */
  async suggest(source: string): Promise<Suggestion[]>;
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

PIXELSRC PRIMER:
{output of pxl prime --brief}

OUTPUT FORMAT:
Return ONLY valid JSONL, no markdown code blocks.
First line: palette definition
Following lines: sprite definitions
Final lines: animation definitions
```

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

PIXELSRC PRIMER:
{output of pxl prime --brief}
```

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
- `child_process` - Spawn pxl CLI for validation
- `pxl` CLI - Must be installed and in PATH

### Client
- `@pixelsrc/wasm` - NPM package for browser rendering

### Development
- pixelsrc repo at `~/workspace/ttp` for reference and testing

## Phases

### Phase 2a: Server Foundation
- [ ] Create `packages/server/src/services/pixelsrc/` structure
- [ ] Implement `PixelsrcValidator` (pxl CLI wrapper)
- [ ] Implement `PixelsrcGenerator` (prompt builder)
- [ ] Implement `PixelsrcRepairer` (retry loop)
- [ ] Add `pixelArt` fields to Character, NPC, Area types

### Phase 2b: World Generation Integration
- [ ] Modify `WorldGenerator` to include pixel art generation
- [ ] Add generation prompts for characters and NPCs
- [ ] Add validation/repair loop to generation pipeline
- [ ] Test with various character descriptions

### Phase 2c: API Endpoints
- [ ] Add pixel art retrieval endpoint
- [ ] Add pixel art regeneration endpoint
- [ ] Add pixel art edit endpoint

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

### Phase 2g: Scene Backgrounds (Future)
- [ ] Add scene generation prompts
- [ ] Implement `AreaPanel` background rendering
- [ ] Add ambient animation support

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

## Open Questions

1. **pxl CLI installation** - Should we bundle it, or require manual install?
2. **Caching strategy** - Redis for pre-rendered PNGs, or client-side only?
3. **Edit UI** - Should DMs be able to edit .pxl source directly in-game?
4. **Regeneration triggers** - Auto-regenerate on character description change?

## Related Documents

- [Pixelsrc Documentation](https://github.com/scbrown/pixelsrc)
- [Phase 1: TTS Engine](./phase-1-tts.md)
- [World Generator](../packages/server/src/services/ai/world-generator.ts)
