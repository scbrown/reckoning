/**
 * Pixelsrc Generator Service
 *
 * Generates pixelArtRef metadata for areas based on their descriptions and tags.
 * Provides prompts for AI-assisted pixel art generation.
 * Includes AI-powered generation of raw .pxl source content.
 */

import type { PixelArtRef, PixelArtAnimation } from '@reckoning/shared/game';
import type { Result } from '@reckoning/shared';
import { ClaudeCodeCLI } from '../ai/claude-cli.js';
import {
  PORTRAIT_GENERATION_PRIMER,
  SCENE_GENERATION_PRIMER,
  PALETTE_GENERATION_PRIMER,
} from './primer.js';

/**
 * Context for generating scene background references
 */
export interface SceneGenerationContext {
  /** Unique identifier for the area */
  areaId: string;
  /** Display name of the area */
  areaName: string;
  /** Narrative description of the area */
  description: string;
  /** Tags categorizing the area */
  tags: string[];
  /** Optional time of day for ambient variations */
  timeOfDay?: 'dawn' | 'day' | 'dusk' | 'night';
  /** Optional weather for ambient variations */
  weather?: 'clear' | 'rain' | 'storm' | 'fog' | 'snow';
}

/**
 * Scene archetype for categorizing locations
 */
export type SceneArchetype =
  | 'tavern'
  | 'forest'
  | 'cave'
  | 'castle'
  | 'village'
  | 'dungeon'
  | 'temple'
  | 'market'
  | 'road'
  | 'mountain'
  | 'swamp'
  | 'ruins'
  | 'interior'
  | 'exterior'
  | 'generic';

/**
 * Scene generation prompt for AI pixel art creation
 */
export interface SceneGenerationPrompt {
  /** Main prompt describing the scene */
  prompt: string;
  /** Scene archetype for styling */
  archetype: SceneArchetype;
  /** Suggested color palette themes */
  paletteHints: string[];
  /** Suggested sprite name */
  spriteName: string;
  /** Animation hints for ambient effects */
  animationHints: string[];
}

/**
 * Default ambient animation for scene backgrounds (subtle palette cycling)
 */
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
    active: {
      keyframes: {
        '0': { transform: 'translateY(0)' },
        '50': { transform: 'translateY(-0.5px)' },
        '100': { transform: 'translateY(0)' },
      },
      duration: 2000,
      timingFunction: 'ease-in-out',
      loop: true,
    },
  },
  defaultState: 'idle',
};

/**
 * Palette cycling animation for scenes with flickering/water effects
 */
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
      timingFunction: 'ease-in-out',
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
      timingFunction: 'linear',
      loop: true,
    },
  },
  defaultState: 'idle',
};

/**
 * Archetype to tag mappings for classification
 */
const ARCHETYPE_TAG_MAPPINGS: Record<string, SceneArchetype> = {
  tavern: 'tavern',
  inn: 'tavern',
  pub: 'tavern',
  bar: 'tavern',
  forest: 'forest',
  woods: 'forest',
  grove: 'forest',
  cave: 'cave',
  cavern: 'cave',
  underground: 'cave',
  mine: 'cave',
  castle: 'castle',
  fortress: 'castle',
  palace: 'castle',
  keep: 'castle',
  village: 'village',
  town: 'village',
  settlement: 'village',
  hamlet: 'village',
  dungeon: 'dungeon',
  prison: 'dungeon',
  crypt: 'dungeon',
  tomb: 'dungeon',
  temple: 'temple',
  shrine: 'temple',
  church: 'temple',
  chapel: 'temple',
  sanctuary: 'temple',
  market: 'market',
  bazaar: 'market',
  shop: 'market',
  store: 'market',
  road: 'road',
  path: 'road',
  trail: 'road',
  crossroads: 'road',
  mountain: 'mountain',
  peak: 'mountain',
  cliff: 'mountain',
  heights: 'mountain',
  swamp: 'swamp',
  marsh: 'swamp',
  bog: 'swamp',
  wetland: 'swamp',
  ruins: 'ruins',
  abandoned: 'ruins',
  ancient: 'ruins',
  crumbling: 'ruins',
};

/**
 * Palette hints by archetype
 */
const ARCHETYPE_PALETTE_HINTS: Record<SceneArchetype, string[]> = {
  tavern: ['warm browns', 'amber firelight', 'deep wood tones', 'golden highlights'],
  forest: ['deep greens', 'earthy browns', 'dappled sunlight', 'mossy accents'],
  cave: ['dark grays', 'blue shadows', 'crystalline highlights', 'torch orange'],
  castle: ['cold stone grays', 'royal blues', 'gold accents', 'iron black'],
  village: ['warm earth tones', 'thatched yellows', 'cobblestone grays', 'flower accents'],
  dungeon: ['darkness', 'sickly greens', 'torch highlights', 'rust red'],
  temple: ['marble whites', 'sacred golds', 'stained glass colors', 'divine light'],
  market: ['vibrant colors', 'cloth reds and blues', 'golden brass', 'busy browns'],
  road: ['dusty browns', 'sky blues', 'grass greens', 'distant purples'],
  mountain: ['snow whites', 'rock grays', 'pine greens', 'sky blues'],
  swamp: ['murky greens', 'stagnant browns', 'mist grays', 'toxic yellows'],
  ruins: ['weathered stones', 'overgrown greens', 'faded colors', 'shadow blacks'],
  interior: ['warm interior tones', 'window light', 'furniture browns', 'textile accents'],
  exterior: ['natural lighting', 'sky gradients', 'landscape colors', 'atmospheric depth'],
  generic: ['balanced earth tones', 'natural lighting', 'versatile palette'],
};

/**
 * Animation hints by archetype
 */
const ARCHETYPE_ANIMATION_HINTS: Record<SceneArchetype, string[]> = {
  tavern: ['fireplace flicker', 'candle glow', 'smoke wisps'],
  forest: ['leaf rustle', 'dappled light shift', 'wind sway'],
  cave: ['torch flicker', 'dripping water', 'crystal shimmer'],
  castle: ['banner wave', 'torch light', 'dust motes'],
  village: ['smoke from chimneys', 'wind effects', 'subtle activity'],
  dungeon: ['torch flicker', 'dripping', 'shadows shift'],
  temple: ['divine light pulse', 'incense smoke', 'candle flicker'],
  market: ['cloth sway', 'activity bustle', 'lantern swing'],
  road: ['dust drift', 'grass sway', 'cloud movement'],
  mountain: ['snow drift', 'wind effects', 'distant clouds'],
  swamp: ['mist drift', 'bubble rise', 'fog roll'],
  ruins: ['dust particles', 'crumbling effect', 'shadow shift'],
  interior: ['light flicker', 'dust motes', 'subtle movement'],
  exterior: ['wind effects', 'light changes', 'environmental motion'],
  generic: ['subtle ambient motion', 'light variation'],
};

/**
 * Pixelsrc Generator for creating scene background references and prompts
 */
export class PixelsrcGenerator {
  /**
   * Generate a PixelArtRef for a scene background based on area context.
   *
   * @param context - The scene generation context
   * @returns PixelArtRef with path, sprite name, and animation metadata
   */
  generateSceneRef(context: SceneGenerationContext): PixelArtRef {
    const archetype = this.classifyArchetype(context);
    const spriteName = this.generateSpriteName(context, archetype);
    const hasFlickerEffect = this.shouldHaveFlickerEffect(archetype, context);

    return {
      path: `scenes/${context.areaId}.pxl`,
      spriteName,
      animation: hasFlickerEffect ? PALETTE_CYCLE_ANIMATION : DEFAULT_AMBIENT_ANIMATION,
    };
  }

  /**
   * Generate a prompt for AI-assisted pixel art creation.
   *
   * @param context - The scene generation context
   * @returns SceneGenerationPrompt with detailed instructions for AI art generation
   */
  generatePrompt(context: SceneGenerationContext): SceneGenerationPrompt {
    const archetype = this.classifyArchetype(context);
    const spriteName = this.generateSpriteName(context, archetype);

    const prompt = this.buildPromptText(context, archetype);
    const paletteHints = ARCHETYPE_PALETTE_HINTS[archetype];
    const animationHints = ARCHETYPE_ANIMATION_HINTS[archetype];

    return {
      prompt,
      archetype,
      paletteHints,
      spriteName,
      animationHints,
    };
  }

  /**
   * Classify an area into a scene archetype based on tags and description.
   */
  private classifyArchetype(context: SceneGenerationContext): SceneArchetype {
    // First check tags for direct matches
    for (const tag of context.tags) {
      const normalizedTag = tag.toLowerCase();
      if (normalizedTag in ARCHETYPE_TAG_MAPPINGS) {
        return ARCHETYPE_TAG_MAPPINGS[normalizedTag]!;
      }
    }

    // Check description for archetype keywords
    const descLower = context.description.toLowerCase();
    const nameLower = context.areaName.toLowerCase();
    const combinedText = `${nameLower} ${descLower}`;

    for (const [keyword, archetype] of Object.entries(ARCHETYPE_TAG_MAPPINGS)) {
      if (combinedText.includes(keyword)) {
        return archetype;
      }
    }

    // Determine if indoor or outdoor based on description cues
    const indoorCues = ['inside', 'interior', 'room', 'hall', 'chamber', 'building'];
    const outdoorCues = ['outside', 'open', 'sky', 'horizon', 'landscape', 'field'];

    const isIndoor = indoorCues.some((cue) => combinedText.includes(cue));
    const isOutdoor = outdoorCues.some((cue) => combinedText.includes(cue));

    if (isIndoor && !isOutdoor) {
      return 'interior';
    }
    if (isOutdoor && !isIndoor) {
      return 'exterior';
    }

    return 'generic';
  }

  /**
   * Generate a sprite name based on context and archetype.
   */
  private generateSpriteName(
    context: SceneGenerationContext,
    _archetype: SceneArchetype
  ): string {
    // Create a sanitized base name from area ID
    const baseName = context.areaId.replace(/[^a-z0-9]/gi, '_').toLowerCase();

    // Add time/weather suffix if specified
    const suffixes: string[] = [];
    if (context.timeOfDay && context.timeOfDay !== 'day') {
      suffixes.push(context.timeOfDay);
    }
    if (context.weather && context.weather !== 'clear') {
      suffixes.push(context.weather);
    }

    const suffix = suffixes.length > 0 ? `_${suffixes.join('_')}` : '';
    return `scene_${baseName}${suffix}`;
  }

  /**
   * Determine if the scene should have flicker/palette cycling effects.
   */
  private shouldHaveFlickerEffect(
    archetype: SceneArchetype,
    context: SceneGenerationContext
  ): boolean {
    // Archetypes with fire/light that flicker
    const flickerArchetypes: SceneArchetype[] = ['tavern', 'cave', 'dungeon', 'temple'];

    if (flickerArchetypes.includes(archetype)) {
      return true;
    }

    // Check for fire/torch/candle keywords in description
    const flickerKeywords = ['fire', 'torch', 'candle', 'flame', 'lantern', 'hearth'];
    const descLower = context.description.toLowerCase();

    return flickerKeywords.some((keyword) => descLower.includes(keyword));
  }

  /**
   * Build the detailed prompt text for AI pixel art generation.
   */
  private buildPromptText(context: SceneGenerationContext, archetype: SceneArchetype): string {
    const paletteHints = ARCHETYPE_PALETTE_HINTS[archetype].join(', ');
    const animationHints = ARCHETYPE_ANIMATION_HINTS[archetype].join(', ');

    let timeDescription = '';
    if (context.timeOfDay) {
      const timeDescriptions: Record<string, string> = {
        dawn: 'early morning light with soft pinks and oranges',
        day: 'bright daylight with clear visibility',
        dusk: 'warm evening glow with long shadows',
        night: 'darkness with moonlight and artificial light sources',
      };
      timeDescription = timeDescriptions[context.timeOfDay] ?? '';
    }

    let weatherDescription = '';
    if (context.weather && context.weather !== 'clear') {
      const weatherDescriptions: Record<string, string> = {
        rain: 'falling rain with wet surfaces and reflections',
        storm: 'dramatic storm lighting with rain and wind effects',
        fog: 'misty atmosphere with reduced visibility',
        snow: 'falling snow with white accumulation',
      };
      weatherDescription = weatherDescriptions[context.weather] ?? '';
    }

    return `Generate a pixel art scene background for: ${context.areaName}

Scene Description:
${context.description}

Archetype: ${archetype}
Tags: ${context.tags.join(', ')}

Suggested Palette:
${paletteHints}

Animation Opportunities:
${animationHints}

${timeDescription ? `Time of Day: ${timeDescription}` : ''}
${weatherDescription ? `Weather: ${weatherDescription}` : ''}

Style Guidelines:
- Create a 128x96 pixel scene (or larger for scrolling backgrounds)
- Use limited color palette (16-32 colors max)
- Include depth with foreground, midground, and background layers
- Design with potential animation frames in mind
- Ensure the scene works as a backdrop for character sprites
- Include atmospheric elements appropriate to the archetype

Output a pixelsrc JSONL file with:
1. A palette definition with colors appropriate to the scene
2. A main sprite for the static background
3. Optional variant sprites for animation frames or lighting variations`;
  }
}

export default PixelsrcGenerator;

// =============================================================================
// AI-Powered Generation Types
// =============================================================================

/**
 * Context for generating a character portrait
 */
export interface PortraitGenerationContext {
  /** Character name */
  name: string;
  /** Character description (appearance, personality, etc.) */
  description: string;
  /** Character class or archetype (e.g., 'warrior', 'mage', 'rogue') */
  characterClass?: string;
  /** Optional specific features to emphasize */
  features?: string[];
  /** Optional mood/expression */
  mood?: 'neutral' | 'happy' | 'angry' | 'sad' | 'determined' | 'fearful';
}

/**
 * Context for generating a scene background via AI
 */
export interface AISceneGenerationContext {
  /** Scene name */
  name: string;
  /** Detailed scene description */
  description: string;
  /** Scene type/archetype */
  archetype?: SceneArchetype;
  /** Time of day */
  timeOfDay?: 'dawn' | 'day' | 'dusk' | 'night';
  /** Weather conditions */
  weather?: 'clear' | 'rain' | 'storm' | 'fog' | 'snow';
  /** Specific elements to include */
  elements?: string[];
}

/**
 * Context for generating a color palette
 */
export interface PaletteGenerationContext {
  /** Palette name */
  name: string;
  /** Theme or mood for the palette */
  theme: string;
  /** Number of colors to generate (default: 8) */
  colorCount?: number;
  /** Base colors to build around (optional) */
  baseColors?: string[];
  /** Style hints */
  style?: 'warm' | 'cool' | 'vibrant' | 'muted' | 'dark' | 'light';
}

/**
 * Result of AI generation
 */
export interface AIGenerationResult {
  /** The generated .pxl source content */
  source: string;
  /** Generation duration in milliseconds */
  durationMs: number;
}

/**
 * Error from AI generation
 */
export interface AIGenerationError {
  /** Error code */
  code: string;
  /** Error message */
  message: string;
  /** Whether the error is retryable */
  retryable: boolean;
}

/**
 * Configuration for PixelsrcAIGenerator
 */
export interface PixelsrcAIGeneratorConfig {
  /** Timeout for AI calls in milliseconds (default: 60000) */
  timeout?: number;
  /** Model to use for generation (default: 'haiku') */
  model?: string;
}

// =============================================================================
// AI-Powered Generator
// =============================================================================

/**
 * AI-powered generator for creating raw .pxl source content.
 *
 * Uses Claude CLI to generate pixelsrc content based on primers and context.
 * Returns raw .pxl source strings that can be validated and rendered.
 *
 * @example
 * ```typescript
 * const generator = new PixelsrcAIGenerator();
 *
 * const result = await generator.generatePortrait({
 *   name: 'Hero',
 *   description: 'A brave warrior with golden hair and piercing blue eyes',
 *   characterClass: 'warrior',
 * });
 *
 * if (result.ok) {
 *   console.log(result.value.source); // Raw .pxl content
 * }
 * ```
 */
export class PixelsrcAIGenerator {
  private cli: ClaudeCodeCLI;

  constructor(config?: PixelsrcAIGeneratorConfig) {
    this.cli = new ClaudeCodeCLI({
      timeout: config?.timeout ?? 60000,
      model: config?.model ?? 'haiku',
    });
  }

  /**
   * Generate a character portrait in pixelsrc format.
   *
   * @param context - Portrait generation context
   * @returns Result containing raw .pxl source or error
   */
  async generatePortrait(
    context: PortraitGenerationContext
  ): Promise<Result<AIGenerationResult, AIGenerationError>> {
    const prompt = this.buildPortraitPrompt(context);
    return this.executeGeneration(prompt);
  }

  /**
   * Generate a scene background in pixelsrc format.
   *
   * @param context - Scene generation context
   * @returns Result containing raw .pxl source or error
   */
  async generateScene(
    context: AISceneGenerationContext
  ): Promise<Result<AIGenerationResult, AIGenerationError>> {
    const prompt = this.buildScenePrompt(context);
    return this.executeGeneration(prompt);
  }

  /**
   * Generate a color palette in pixelsrc format.
   *
   * @param context - Palette generation context
   * @returns Result containing raw .pxl source or error
   */
  async generatePalette(
    context: PaletteGenerationContext
  ): Promise<Result<AIGenerationResult, AIGenerationError>> {
    const prompt = this.buildPalettePrompt(context);
    return this.executeGeneration(prompt);
  }

  /**
   * Execute AI generation with the given prompt.
   */
  private async executeGeneration(
    prompt: string
  ): Promise<Result<AIGenerationResult, AIGenerationError>> {
    const result = await this.cli.execute({ prompt });

    if (!result.ok) {
      return {
        ok: false,
        error: {
          code: result.error.code,
          message: result.error.message,
          retryable: result.error.retryable,
        },
      };
    }

    // Extract JSONL content from the response
    const source = this.extractJsonl(result.value.content);

    return {
      ok: true,
      value: {
        source,
        durationMs: result.value.durationMs,
      },
    };
  }

  /**
   * Extract JSONL content from AI response.
   * Strips any markdown formatting or explanatory text.
   */
  private extractJsonl(content: string): string {
    // If content is wrapped in code blocks, extract it
    const codeBlockMatch = content.match(/```(?:json|jsonl)?\s*([\s\S]*?)```/);
    if (codeBlockMatch && codeBlockMatch[1] !== undefined) {
      return codeBlockMatch[1].trim();
    }

    // Try to find lines that look like JSONL (start with {)
    const lines = content.split('\n');
    const jsonlLines = lines.filter((line) => {
      const trimmed = line.trim();
      return trimmed.startsWith('{') && trimmed.endsWith('}');
    });

    if (jsonlLines.length > 0) {
      return jsonlLines.join('\n');
    }

    // Return as-is if no extraction needed
    return content.trim();
  }

  /**
   * Build the prompt for portrait generation.
   */
  private buildPortraitPrompt(context: PortraitGenerationContext): string {
    const featuresList = context.features?.length
      ? `\nKey Features: ${context.features.join(', ')}`
      : '';

    const moodStr = context.mood ? `\nExpression/Mood: ${context.mood}` : '';

    const classStr = context.characterClass
      ? `\nCharacter Class: ${context.characterClass}`
      : '';

    return `${PORTRAIT_GENERATION_PRIMER}

## Generation Request

Generate a pixel art portrait for the following character:

Character Name: ${context.name}
Description: ${context.description}${classStr}${featuresList}${moodStr}

Requirements:
1. Output ONLY valid pixelsrc JSONL - no explanations or markdown
2. Include a palette definition first
3. Include a sprite named "portrait_${this.sanitizeName(context.name)}"
4. Use 12x16 pixel dimensions
5. Focus on head and upper shoulders
6. Use meaningful color tokens (s=skin, h=hair, e=eyes, etc.)

Generate the pixelsrc content now:`;
  }

  /**
   * Build the prompt for scene generation.
   */
  private buildScenePrompt(context: AISceneGenerationContext): string {
    const archetypeStr = context.archetype
      ? `\nScene Archetype: ${context.archetype}`
      : '';

    const timeStr = context.timeOfDay
      ? `\nTime of Day: ${context.timeOfDay}`
      : '';

    const weatherStr = context.weather
      ? `\nWeather: ${context.weather}`
      : '';

    const elementsList = context.elements?.length
      ? `\nMust Include: ${context.elements.join(', ')}`
      : '';

    return `${SCENE_GENERATION_PRIMER}

## Generation Request

Generate a pixel art scene background for:

Scene Name: ${context.name}
Description: ${context.description}${archetypeStr}${timeStr}${weatherStr}${elementsList}

Requirements:
1. Output ONLY valid pixelsrc JSONL - no explanations or markdown
2. Include a palette definition first
3. Include a sprite named "scene_${this.sanitizeName(context.name)}"
4. Use 64x48 pixel dimensions (thumbnail size for faster generation)
5. Include depth with foreground, midground, background
6. Use atmospheric colors appropriate to the setting

Generate the pixelsrc content now:`;
  }

  /**
   * Build the prompt for palette generation.
   */
  private buildPalettePrompt(context: PaletteGenerationContext): string {
    const colorCount = context.colorCount ?? 8;

    const baseColorsStr = context.baseColors?.length
      ? `\nBase Colors to Include: ${context.baseColors.join(', ')}`
      : '';

    const styleStr = context.style
      ? `\nStyle: ${context.style}`
      : '';

    return `${PALETTE_GENERATION_PRIMER}

## Generation Request

Generate a color palette for:

Palette Name: ${context.name}
Theme: ${context.theme}
Number of Colors: ${colorCount}${baseColorsStr}${styleStr}

Requirements:
1. Output ONLY valid pixelsrc JSONL - no explanations or markdown
2. Output a single palette definition line
3. Use the name "${this.sanitizeName(context.name)}_palette"
4. Include exactly ${colorCount} colors plus transparent (".")
5. Use meaningful single-character tokens
6. Ensure good contrast between adjacent colors

Generate the pixelsrc content now:`;
  }

  /**
   * Sanitize a name for use in sprite/palette names.
   */
  private sanitizeName(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '');
  }
}
