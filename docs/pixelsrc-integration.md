---
title: "Pixelsrc Integration Guide"
type: reference
status: active
created: 2026-01-18
updated: 2026-01-18
authors:
  - agent
related:
  - ./plan/pixelsrc-integration.md
  - ./plan/tasks/pixelsrc-integration.md
tags:
  - pixelsrc
  - pixel-art
  - wasm
  - animation
  - evolution
---

# Pixelsrc Integration Guide

This document provides comprehensive documentation for the pixelsrc integration in Reckoning, covering architecture, data flow, WASM usage, API references, and troubleshooting.

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Data Flow](#data-flow)
3. [WASM Usage](#wasm-usage)
4. [API Reference](#api-reference)
5. [Project Structure](#project-structure)
6. [Animation System](#animation-system)
7. [Art Evolution System](#art-evolution-system)
8. [Troubleshooting Guide](#troubleshooting-guide)
9. [Developer Guide](#developer-guide)

---

## Architecture Overview

The pixelsrc integration provides procedurally generated pixel art for characters, NPCs, and scenes in Reckoning. The system uses WebAssembly (WASM) for high-performance rendering on both server and client.

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           SERVER (Node.js)                               │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌──────────────────┐    ┌──────────────────┐    ┌──────────────────┐   │
│  │ PixelsrcGenerator│    │ PixelsrcRenderer │    │ EvolutionService │   │
│  │                  │    │     (WASM)       │    │                  │   │
│  │ • Scene refs     │    │ • PNG rendering  │    │ • Detect changes │   │
│  │ • Prompt building│    │ • Sprite listing │    │ • Track history  │   │
│  │ • Archetype hints│    │ • Validation     │    │ • Apply updates  │   │
│  └──────────────────┘    └──────────────────┘    └──────────────────┘   │
│           │                       │                       │              │
│           └───────────────────────┼───────────────────────┘              │
│                                   │                                      │
│                          World Generation                                │
│                                   │                                      │
│                                   ▼                                      │
│                          ┌──────────────────┐                           │
│                          │   SQLite + API   │                           │
│                          │ (PixelArtRef)    │                           │
│                          └──────────────────┘                           │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                            API Response
                     (PixelArt source + animation)
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                           CLIENT (Browser)                               │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌──────────────────┐    ┌──────────────────┐    ┌──────────────────┐   │
│  │  AvatarManager   │───▶│ PixelsrcRenderer │───▶│ AnimatedAvatar   │   │
│  │   (Singleton)    │    │  (WASM + Cache)  │    │    (Canvas)      │   │
│  │                  │    │                  │    │                  │   │
│  │ • WASM init      │    │ • Render to PNG  │    │ • Idle animation │   │
│  │ • Avatar pool    │    │ • Frame caching  │    │ • Talking state  │   │
│  │ • TTS sync       │    │ • LRU eviction   │    │ • Keyframe lerp  │   │
│  └──────────────────┘    └──────────────────┘    └──────────────────┘   │
│                                                                          │
│  ┌──────────────────┐                                                   │
│  │ SceneBackground  │ (Canvas-based scene rendering with ambient fx)    │
│  └──────────────────┘                                                   │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### Key Components

| Component | Location | Purpose |
|-----------|----------|---------|
| **PixelsrcRenderer (Server)** | `packages/server/src/services/pixelsrc/renderer.ts` | WASM-based PNG rendering for Node.js |
| **PixelsrcGenerator** | `packages/server/src/services/pixelsrc/generator.ts` | Scene ref generation and prompt building |
| **PixelsrcRenderer (Client)** | `packages/client/src/services/pixelsrc/index.ts` | Browser WASM rendering with caching |
| **AnimatedAvatar** | `packages/client/src/components/animated-avatar.ts` | Canvas-based character animation |
| **SceneBackground** | `packages/client/src/components/scene-background.ts` | Canvas-based scene rendering |
| **AvatarManager** | `packages/client/src/services/avatar-manager/index.ts` | Central avatar lifecycle management |
| **EvolutionService** | `packages/server/src/services/evolution/evolution-service.ts` | Entity evolution tracking |

---

## Data Flow

### 1. World Generation Flow

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  WorldGenerator │────▶│ PixelsrcGenerator│────▶│   PixelArtRef   │
│                 │     │                  │     │                 │
│ • Area created  │     │ • Classify area  │     │ • path          │
│ • Has tags/desc │     │ • Get archetype  │     │ • spriteName    │
│                 │     │ • Build ref      │     │ • animation     │
└─────────────────┘     └─────────────────┘     └─────────────────┘
```

When an area is generated during world creation:

1. **WorldGenerator** creates area with `areaId`, `areaName`, `description`, and `tags`
2. **PixelsrcGenerator.generateSceneRef()** is called with this context
3. Generator classifies the area by archetype (tavern, forest, cave, etc.)
4. Returns a `PixelArtRef` with:
   - `path`: Relative path to .pxl file (e.g., `scenes/tavern_main.pxl`)
   - `spriteName`: Generated sprite name (e.g., `scene_tavern_main`)
   - `animation`: Pre-configured animation metadata

### 2. Client Rendering Flow

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│ API Response│────▶│AvatarManager│────▶│  Renderer   │────▶│   Canvas    │
│             │     │             │     │             │     │             │
│ { source,   │     │ • Init WASM │     │ • Check     │     │ • Draw      │
│   animation }│     │ • Create   │     │   cache     │     │   sprite    │
│             │     │   avatar    │     │ • Render    │     │ • Animate   │
└─────────────┘     └─────────────┘     └─────────────┘     └─────────────┘
```

When displaying a character avatar:

1. API returns `PixelArt` with `source` (JSONL) and `animation` metadata
2. **AvatarManager** initializes WASM (once) and creates `AnimatedAvatar`
3. **PixelsrcRenderer** checks cache, renders PNG if needed
4. **AnimatedAvatar** draws to canvas and manages animation loop

### 3. TTS Animation Sync

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│ TTS Service │────▶│AvatarManager│────▶│AnimatedAvatar│
│             │     │             │     │              │
│ • Speaking  │     │ startSpeak- │     │ • Switch to  │
│   started   │     │   ing(id)   │     │   'talking'  │
│             │     │             │     │   animation  │
│ • Speaking  │     │ stopSpeak-  │     │ • Smooth     │
│   ended     │     │   ing(id)   │     │   return to  │
│             │     │             │     │   'idle'     │
└─────────────┘     └─────────────┘     └─────────────┘
```

---

## WASM Usage

### Server-Side WASM (Node.js)

The server uses `@stiwi/pixelsrc-wasm` for validation and PNG rendering during world generation and API responses.

#### Initialization

```typescript
// packages/server/src/services/pixelsrc/renderer.ts

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

class PixelsrcRenderer {
  private wasmModule: PixelsrcWasm | null = null;
  private initialized = false;

  async init(): Promise<void> {
    if (this.initialized) return;

    // Dynamic import for WASM module
    const wasm = await import('@stiwi/pixelsrc-wasm');

    // Load WASM binary manually in Node.js
    const __dirname = dirname(fileURLToPath(import.meta.url));
    const wasmPath = join(
      __dirname,
      '..','..','..',
      'node_modules','@stiwi','pixelsrc-wasm','pkg','pixelsrc_bg.wasm'
    );

    const wasmBytes = readFileSync(wasmPath);
    await wasm.default(wasmBytes);

    // Initialize panic hook for better error messages
    wasm.init_panic_hook();

    this.wasmModule = wasm as unknown as PixelsrcWasm;
    this.initialized = true;
  }
}
```

#### WASM Functions

| Function | Signature | Description |
|----------|-----------|-------------|
| `render_to_png` | `(jsonl: string) => Uint8Array` | Render sprite to PNG bytes |
| `list_sprites` | `(jsonl: string) => string[]` | List sprite names in source |
| `validate` | `(jsonl: string) => string[]` | Validate pixelsrc syntax |
| `init_panic_hook` | `() => void` | Better error messages |

#### Example: Render Specific Sprite

```typescript
const renderer = new PixelsrcRenderer();
await renderer.init();

// Render a specific sprite by filtering source
const png = renderer.renderToPng(source, 'hero_idle');

// List all sprites in source
const sprites = renderer.listSprites(source);
// => ['hero_idle', 'hero_talking', 'hero_emote']
```

### Client-Side WASM (Browser)

The browser uses the same WASM module but with automatic loading and frame caching.

#### Initialization

```typescript
// packages/client/src/services/pixelsrc/index.ts

import init, { render_to_png, list_sprites, init_panic_hook } from '@stiwi/pixelsrc-wasm';

class PixelsrcRenderer {
  private initialized = false;
  private cache: Map<string, CacheEntry> = new Map();

  async init(wasmPath?: string): Promise<void> {
    if (this.initialized) return;

    // Browser auto-loads WASM via bundler
    if (wasmPath) {
      await init(wasmPath);
    } else {
      await init();
    }

    init_panic_hook();
    this.initialized = true;
  }
}
```

#### Caching Strategy

The client renderer implements an LRU cache for rendered frames:

| Setting | Default | Description |
|---------|---------|-------------|
| `maxCacheSize` | 100 | Maximum cached frames |
| `cacheTTL` | 5 minutes | Time-to-live per entry |

```typescript
// Cache key: hash of spriteName + source
const renderer = new PixelsrcRenderer({
  maxCacheSize: 100,
  cacheTTL: 5 * 60 * 1000,
});

// First call: renders and caches
const result1 = renderer.render(source, 'hero_idle');
// => { data: Uint8Array, spriteName: 'hero_idle', fromCache: false }

// Second call: served from cache
const result2 = renderer.render(source, 'hero_idle');
// => { data: Uint8Array, spriteName: 'hero_idle', fromCache: true }

// Bypass cache for fresh render
const result3 = renderer.render(source, 'hero_idle', { bypassCache: true });
```

---

## API Reference

### Types (Shared Package)

All pixelsrc types are defined in `packages/shared/src/game/types.ts`:

```typescript
/**
 * Reference to pixelsrc art in the game's project directory
 */
interface PixelArtRef {
  /** Relative path (e.g., "characters/hero.pxl") */
  path: string;
  /** Primary sprite name for static display */
  spriteName: string;
  /** Animation metadata if animated */
  animation?: PixelArtAnimation;
}

/**
 * Full pixelsrc art asset (used in API responses)
 */
interface PixelArt {
  /** The .pxl source (JSONL format) */
  source: string;
  /** Animation metadata */
  animation?: PixelArtAnimation;
}

/**
 * Animation metadata for client-side playback
 */
interface PixelArtAnimation {
  /** Named animation states */
  states: Record<string, AnimationState>;
  /** Default state to play */
  defaultState: string;
}

/**
 * Configuration for a single animation state
 */
interface AnimationState {
  /** Keyframe percentages to sprite/transform data */
  keyframes: Record<string, KeyframeData>;
  /** Duration in ms */
  duration: number;
  /** CSS timing function */
  timingFunction?: string;
  /** Whether to loop */
  loop?: boolean;
}

/**
 * Data for a single animation keyframe
 */
interface KeyframeData {
  /** Sprite name to display at this keyframe */
  sprite?: string;
  /** CSS transform to apply */
  transform?: string;
  /** Opacity value (0-1) */
  opacity?: number;
}
```

### PixelsrcRenderer (Server)

```typescript
class PixelsrcRenderer {
  /**
   * Initialize the WASM module. Must be called before any render operations.
   */
  async init(): Promise<void>;

  /**
   * List all sprite names defined in the source.
   * @param source - JSONL string containing pixelsrc definitions
   * @returns Array of sprite names
   */
  listSprites(source: string): string[];

  /**
   * Render a sprite to PNG bytes.
   * @param source - JSONL string containing pixelsrc definitions
   * @param spriteName - Optional name of sprite to render (renders first if omitted)
   * @param options - Optional render options
   * @returns PNG image data as Uint8Array
   */
  renderToPng(source: string, spriteName?: string, options?: RenderOptions): Uint8Array;

  /**
   * Check if the renderer has been initialized
   */
  isInitialized(): boolean;
}

interface RenderOptions {
  /** Scale factor (reserved for future use) */
  scale?: number;
}
```

### PixelsrcRenderer (Client)

```typescript
class PixelsrcRenderer {
  /**
   * Initialize the WASM module.
   * @param wasmPath - Optional path to WASM file
   */
  async init(wasmPath?: string): Promise<void>;

  /**
   * List all sprite names defined in the source.
   */
  listSprites(source: string): string[];

  /**
   * Render a sprite to PNG bytes with caching.
   * @returns RenderResult with data, spriteName, and fromCache flag
   */
  render(source: string, spriteName?: string, options?: RenderOptions): RenderResult;

  /**
   * Clear the frame cache
   */
  clearCache(): void;

  /**
   * Get cache statistics
   */
  getCacheStats(): { size: number; maxSize: number };

  isInitialized(): boolean;
}

interface RenderOptions {
  scale?: number;
  /** Whether to bypass the cache */
  bypassCache?: boolean;
}

interface RenderResult {
  data: Uint8Array;
  spriteName: string;
  fromCache: boolean;
}
```

### PixelsrcGenerator

```typescript
class PixelsrcGenerator {
  /**
   * Generate a PixelArtRef for a scene background.
   * @param context - Scene generation context
   * @returns PixelArtRef with path, sprite name, and animation metadata
   */
  generateSceneRef(context: SceneGenerationContext): PixelArtRef;

  /**
   * Generate a prompt for AI-assisted pixel art creation.
   * @returns SceneGenerationPrompt with detailed instructions
   */
  generatePrompt(context: SceneGenerationContext): SceneGenerationPrompt;
}

interface SceneGenerationContext {
  areaId: string;
  areaName: string;
  description: string;
  tags: string[];
  timeOfDay?: 'dawn' | 'day' | 'dusk' | 'night';
  weather?: 'clear' | 'rain' | 'storm' | 'fog' | 'snow';
}

type SceneArchetype =
  | 'tavern' | 'forest' | 'cave' | 'castle' | 'village'
  | 'dungeon' | 'temple' | 'market' | 'road' | 'mountain'
  | 'swamp' | 'ruins' | 'interior' | 'exterior' | 'generic';
```

### AvatarManager

```typescript
class AvatarManager {
  /**
   * Initialize the WASM renderer. Call once at app startup.
   * @returns true if WASM initialized successfully
   */
  async init(): Promise<boolean>;

  /**
   * Check if WASM is available
   */
  isWasmAvailable(): boolean;

  /**
   * Create or update an avatar for a character
   * @returns Canvas element, or null if WASM unavailable
   */
  createAvatar(
    character: Character,
    pixelArt: PixelArt,
    options?: { size?: number; displayScale?: number }
  ): HTMLCanvasElement | null;

  /**
   * Get an existing avatar
   */
  getAvatar(characterId: string): AnimatedAvatar | undefined;

  /**
   * Remove an avatar
   */
  removeAvatar(characterId: string): void;

  /**
   * Start speaking animation for a character
   */
  startSpeaking(characterId: string): void;

  /**
   * Stop speaking animation for a character
   */
  stopSpeaking(characterId: string): void;

  /**
   * Set callbacks for manager events
   */
  setCallbacks(callbacks: AvatarManagerCallbacks): void;

  /**
   * Get all active character IDs with avatars
   */
  getActiveAvatarIds(): string[];

  /**
   * Clear all avatars
   */
  clearAll(): void;

  /**
   * Cleanup all resources
   */
  destroy(): void;
}

// Convenience functions
function getAvatarManager(): AvatarManager;
async function initAvatarManager(config?: AvatarManagerConfig): Promise<AvatarManager>;
```

### AnimatedAvatar

```typescript
class AnimatedAvatar {
  constructor(
    pixelArt: PixelArt,
    renderer: PixelsrcRenderer,
    spriteName?: string,
    config?: AnimatedAvatarConfig
  );

  /**
   * Play an animation state
   */
  play(state: AvatarAnimationState = 'idle'): void;

  /**
   * Stop animation and return to idle
   */
  stop(): void;

  /**
   * Start the talking animation (call during TTS)
   */
  startSpeaking(): void;

  /**
   * Stop talking and return to idle after brief delay
   */
  stopSpeaking(): void;

  /**
   * Get the canvas element for DOM insertion
   */
  getElement(): HTMLCanvasElement;

  /**
   * Check if currently animating
   */
  isAnimating(): boolean;

  /**
   * Get current animation state
   */
  getCurrentState(): AvatarAnimationState;

  /**
   * Clean up resources
   */
  destroy(): void;
}

interface AnimatedAvatarConfig {
  /** Canvas size in pixels (default: 64) */
  size?: number;
  /** Display scale via CSS (default: 1) */
  displayScale?: number;
  /** Auto-play on creation (default: true) */
  autoPlay?: boolean;
  /** Delay before returning to idle after stopSpeaking (ms, default: 200) */
  speakingEndDelay?: number;
}

type AvatarAnimationState = 'idle' | 'talking';
```

---

## Project Structure

### Server Package

```
packages/server/src/services/
├── pixelsrc/
│   ├── index.ts           # Public API exports
│   ├── renderer.ts        # WASM-based PNG rendering
│   └── generator.ts       # Scene ref generation + prompts
├── evolution/
│   ├── index.ts           # Public API exports
│   ├── evolution-service.ts    # Core evolution service
│   ├── system-evolution-detector.ts  # Event detection
│   ├── label-computation.ts    # Relationship labels
│   └── types.ts           # Evolution types
└── __tests__/
    └── pixelsrc-renderer.test.ts  # Renderer tests
```

### Client Package

```
packages/client/src/
├── services/
│   ├── pixelsrc/
│   │   ├── index.ts       # WASM renderer with caching
│   │   └── __tests__/
│   │       └── pixelsrc-renderer.test.ts
│   └── avatar-manager/
│       └── index.ts       # Central avatar management
└── components/
    ├── animated-avatar.ts     # Canvas avatar component
    ├── scene-background.ts    # Canvas scene component
    └── __tests__/
        └── animated-avatar.test.ts
```

### Shared Package

```
packages/shared/src/game/
├── types.ts               # PixelArtRef, PixelArt, Animation types
└── index.ts               # Re-exports
```

---

## Animation System

### Default Animations

The animation system supports CSS-like keyframe animations applied to canvas transforms.

#### Idle Animation (Default)

```typescript
const DEFAULT_IDLE_ANIMATION: AnimationState = {
  keyframes: {
    '0': { transform: 'translateY(0)' },
    '50': { transform: 'translateY(-1px)' },
    '100': { transform: 'translateY(0)' },
  },
  duration: 2000,
  timingFunction: 'ease-in-out',
  loop: true,
};
```

Creates a subtle breathing effect with 2-second cycle.

#### Talking Animation (Default)

```typescript
const DEFAULT_TALKING_ANIMATION: AnimationState = {
  keyframes: {
    '0': { transform: 'translateY(0) scale(1)' },
    '25': { transform: 'translateY(-1px) scale(1.02)' },
    '50': { transform: 'translateY(0) scale(1)' },
    '75': { transform: 'translateY(-1px) scale(1.02)' },
    '100': { transform: 'translateY(0) scale(1)' },
  },
  duration: 400,
  timingFunction: 'ease-in-out',
  loop: true,
};
```

Creates a bouncy speaking effect with 400ms cycle.

### Scene Animations

#### Default Ambient Animation

```typescript
const DEFAULT_AMBIENT_ANIMATION: PixelArtAnimation = {
  states: {
    idle: {
      keyframes: {
        '0': { opacity: 1 },
        '50': { opacity: 0.98 },
        '100': { opacity: 1 },
      },
      duration: 4000,
      timingFunction: 'ease-in-out',
      loop: true,
    },
  },
  defaultState: 'idle',
};
```

#### Flicker Animation (Fire/Torch Scenes)

```typescript
const PALETTE_CYCLE_ANIMATION: PixelArtAnimation = {
  states: {
    idle: {
      keyframes: {
        '0': { opacity: 1, transform: 'scale(1)' },
        '25': { opacity: 0.97, transform: 'scale(1.001)' },
        '50': { opacity: 1, transform: 'scale(1)' },
        '75': { opacity: 0.98, transform: 'scale(0.999)' },
        '100': { opacity: 1, transform: 'scale(1)' },
      },
      duration: 3000,
      loop: true,
    },
    flicker: {
      keyframes: {
        '0': { opacity: 1 },
        '10': { opacity: 0.9 },
        '20': { opacity: 1 },
        '30': { opacity: 0.85 },
        '50': { opacity: 1 },
        '70': { opacity: 0.92 },
        '100': { opacity: 1 },
      },
      duration: 500,
      loop: true,
    },
  },
  defaultState: 'idle',
};
```

Used for scenes with fire, torches, candles, or other flickering light sources.

### Keyframe Interpolation

The animation system interpolates between keyframes using linear interpolation:

1. Calculate progress through animation: `(elapsed % duration) / duration`
2. Find surrounding keyframes based on percentage
3. Interpolate values:
   - `opacity`: Linear blend
   - `translateY`: Parse px values, blend, reconstruct
   - `scale`: Parse value, blend, reconstruct

```typescript
// Example: 30% progress between keyframes at 25% and 50%
// Lower keyframe: { transform: 'translateY(-1px) scale(1.02)' }
// Upper keyframe: { transform: 'translateY(0) scale(1)' }
// Local progress: (30-25)/(50-25) = 0.2
// Result: translateY(-0.8px) scale(1.016)
```

---

## Art Evolution System

The evolution system tracks changes to characters, NPCs, and areas over game progression. While not directly tied to pixel art generation, it provides context for future art regeneration.

### Evolution Types

| Type | Description | Triggers |
|------|-------------|----------|
| `trait_add` | Add a trait to an entity | Character development, story events |
| `trait_remove` | Remove a trait from an entity | Story progression, healing |
| `relationship_change` | Modify relationship dimension | Interactions, betrayals, alliances |

### Relationship Dimensions

Relationships are tracked across six dimensions (0.0 to 1.0):

| Dimension | Description |
|-----------|-------------|
| `trust` | How much entity trusts the target |
| `respect` | Admiration for target's abilities |
| `affection` | Emotional attachment |
| `fear` | Fear of the target |
| `resentment` | Negative feelings toward target |
| `debt` | Sense of obligation |

### Aggregate Labels

The system computes human-readable labels from dimension values:

| Label | Condition |
|-------|-----------|
| `devoted` | trust > 0.7, affection > 0.7, respect > 0.6 |
| `terrified` | fear > 0.7, resentment > 0.5 |
| `enemy` | fear > 0.5, resentment > 0.6 |
| `rival` | respect > 0.5, resentment > 0.5 |
| `resentful` | resentment > 0.6 |
| `ally` | trust > 0.6, respect > 0.6 |
| `friend` | affection > 0.6, trust > 0.5 |
| `indebted` | debt > 0.6 |
| `wary` | trust < 0.3 or fear > 0.4 |
| `indifferent` | Default (neutral across dimensions) |

### Future: Art Evolution Integration

Planned triggers for art regeneration (not yet implemented):

- **Act transitions**: Full portrait refresh with accumulated changes
- **Major events**: Contextual modifications (battle damage, emotional state)
- **Equipment changes**: Composition layer updates
- **Status effects**: Overlay effects, palette shifts

---

## Troubleshooting Guide

### WASM Initialization Issues

#### Server: WASM Binary Not Found

**Symptom**: `ENOENT: no such file or directory` when initializing renderer

**Cause**: WASM binary path is incorrect or package not installed

**Solution**:
```bash
# Ensure package is installed
pnpm --filter @reckoning/server add @stiwi/pixelsrc-wasm

# Verify binary exists
ls node_modules/@stiwi/pixelsrc-wasm/pkg/pixelsrc_bg.wasm
```

#### Client: WASM Module Failed to Load

**Symptom**: `AvatarManager: WASM initialization failed`

**Cause**: Browser failed to fetch or compile WASM module

**Solution**:
1. Check browser console for specific error
2. Verify WASM MIME type is `application/wasm` on server
3. Check Content-Security-Policy allows `wasm-unsafe-eval`

#### Fallback Behavior

When WASM fails, the system degrades gracefully:

```typescript
// AvatarManager tracks failure
if (this.wasmFailed) {
  return null; // UI falls back to initials/placeholder
}
```

### Generation Failures

#### Sprite Not Found in Source

**Symptom**: `PixelsrcRenderError: Sprite "hero_idle" not found in source`

**Cause**: Requested sprite name doesn't exist in the JSONL source

**Solution**:
```typescript
// List available sprites first
const sprites = renderer.listSprites(source);
console.log('Available sprites:', sprites);

// Use a sprite that exists
const png = renderer.renderToPng(source, sprites[0]);
```

#### Empty Source

**Symptom**: `PixelsrcRenderError: Source cannot be empty`

**Cause**: Empty or whitespace-only source passed to renderer

**Solution**: Validate source before rendering:
```typescript
if (!source || source.trim().length === 0) {
  console.warn('No pixel art source available');
  return null;
}
```

#### Malformed JSONL

**Symptom**: Parse errors or unexpected rendering results

**Cause**: Invalid JSON on one or more lines

**Solution**: The renderer filters malformed lines but logs warnings. Check source for:
- Missing closing braces
- Unescaped quotes
- Invalid UTF-8

### Visual Validation Issues

#### PNG Validation Failed

**Symptom**: PNG rendered but appears corrupt

**Cause**: WASM rendering produced invalid output

**Solution**:
```typescript
// Check PNG magic bytes
const png = renderer.renderToPng(source, spriteName);
const isPng = png[0] === 0x89 && png[1] === 0x50 && png[2] === 0x4E && png[3] === 0x47;
if (!isPng) {
  console.error('Invalid PNG output');
}
```

#### Canvas Rendering Issues

**Symptom**: Avatar appears as gray box with "?"

**Cause**: AnimatedAvatar failed to initialize

**Solution**: Check console for `AnimatedAvatar: Failed to initialize` errors. Common causes:
- WASM not initialized
- Source parsing failed
- Sprite not found

### Animation Issues

#### Avatar Not Animating

**Symptom**: Static image, no idle animation

**Cause**: Animation loop not started or destroyed

**Solution**:
```typescript
// Ensure autoPlay is true (default)
const avatar = new AnimatedAvatar(pixelArt, renderer, spriteName, {
  autoPlay: true
});

// Or manually start
avatar.play('idle');
```

#### Talking Animation Not Syncing with TTS

**Symptom**: Avatar continues talking after speech ends

**Cause**: `stopSpeaking()` not called or avatar not found

**Solution**:
```typescript
// Ensure correct character ID is used
avatarManager.startSpeaking(characterId);

// After TTS completes
avatarManager.stopSpeaking(characterId);
```

---

## Developer Guide

### Adding a New Animation State

1. **Define the state in animation metadata**:

```typescript
const customAnimation: PixelArtAnimation = {
  states: {
    idle: { /* ... */ },
    talking: { /* ... */ },
    emote_happy: {
      keyframes: {
        '0': { transform: 'translateY(0) scale(1)' },
        '50': { transform: 'translateY(-2px) scale(1.05)' },
        '100': { transform: 'translateY(0) scale(1)' },
      },
      duration: 300,
      loop: false,
    },
  },
  defaultState: 'idle',
};
```

2. **Extend AvatarAnimationState type** (if needed):

```typescript
// In animated-avatar.ts
export type AvatarAnimationState = 'idle' | 'talking' | 'emote_happy';
```

3. **Add method to trigger the state**:

```typescript
class AnimatedAvatar {
  playEmote(emote: string): void {
    this.play(`emote_${emote}` as AvatarAnimationState);
  }
}
```

### Adding a New Scene Archetype

1. **Add to archetype type**:

```typescript
// In generator.ts
export type SceneArchetype =
  | 'tavern' | 'forest' | /* ... */ | 'new_archetype';
```

2. **Add tag mappings**:

```typescript
const ARCHETYPE_TAG_MAPPINGS: Record<string, SceneArchetype> = {
  // ...existing mappings...
  'new_keyword': 'new_archetype',
  'related_keyword': 'new_archetype',
};
```

3. **Add palette hints**:

```typescript
const ARCHETYPE_PALETTE_HINTS: Record<SceneArchetype, string[]> = {
  // ...existing...
  new_archetype: ['color theme', 'lighting description', 'accent colors'],
};
```

4. **Add animation hints**:

```typescript
const ARCHETYPE_ANIMATION_HINTS: Record<SceneArchetype, string[]> = {
  // ...existing...
  new_archetype: ['ambient effect 1', 'ambient effect 2'],
};
```

### Extending the Evolution System

To add art evolution triggers (future work):

1. **Add new evolution type**:

```typescript
// In types.ts
export type EvolutionType =
  | 'trait_add' | 'trait_remove' | 'relationship_change'
  | 'art_refresh';
```

2. **Create art evolution detector**:

```typescript
class ArtEvolutionDetector {
  detectArtChanges(context: GameContext): ArtEvolutionSuggestion[] {
    const suggestions: ArtEvolutionSuggestion[] = [];

    // Check for act transition
    if (context.previousAct !== context.currentAct) {
      suggestions.push({
        type: 'full_regeneration',
        reason: 'Act transition',
      });
    }

    // Check for equipment changes
    // Check for status effects
    // etc.

    return suggestions;
  }
}
```

### Testing

#### Unit Tests

```bash
# Run pixelsrc tests
pnpm --filter @reckoning/server test -- pixelsrc
pnpm --filter @reckoning/client test -- pixelsrc
```

#### Manual Testing

```typescript
// Quick test in Node.js REPL
import { PixelsrcRenderer } from './services/pixelsrc/renderer.js';

const renderer = new PixelsrcRenderer();
await renderer.init();

const source = `
{"type":"palette","name":"test","colors":{"_":"transparent","#":"#000"}}
{"type":"sprite","name":"test_sprite","size":[4,4],"grid":[["_","#","#","_"],["#","_","_","#"],["#","_","_","#"],["_","#","#","_"]]}
`;

const png = renderer.renderToPng(source, 'test_sprite');
console.log('PNG size:', png.length, 'bytes');
```

### Performance Considerations

1. **Cache rendered frames**: The client renderer caches by default. Avoid `bypassCache: true` unless necessary.

2. **Initialize WASM once**: Use `AvatarManager` singleton to ensure single initialization.

3. **Destroy unused avatars**: Call `avatar.destroy()` when removing from DOM to free resources.

4. **Limit concurrent animations**: Each `AnimatedAvatar` runs its own `requestAnimationFrame` loop. Consider pausing off-screen avatars.

---

## Related Documents

- [Pixelsrc Integration Plan](./plan/pixelsrc-integration.md) - Design decisions and phase planning
- [Pixelsrc Integration Tasks](./plan/tasks/pixelsrc-integration.md) - Epic with 16 implementation tasks
- [Entity Evolution Plan](./plan/entity-evolution.md) - Evolution system design
