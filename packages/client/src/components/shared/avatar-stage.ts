/**
 * Avatar Stage Component
 *
 * View-agnostic component that renders animated pixel art avatars using canvas
 * and the pixelsrc WASM renderer. Supports animation states (idle, talking)
 * with smooth transitions.
 */

import type { PixelArt, PixelArtAnimation, AnimationState, KeyframeData } from '@reckoning/shared';
import { PixelsrcRenderer } from '../../services/pixelsrc/index.js';

/**
 * Configuration for AvatarStage
 */
export interface AvatarStageConfig {
  /** Canvas size in pixels (default: 64) */
  size?: number;
  /** Display scale via CSS (default: 1) */
  displayScale?: number;
  /** Auto-play on creation (default: true) */
  autoPlay?: boolean;
  /** Delay before returning to idle after stopSpeaking (ms, default: 200) */
  speakingEndDelay?: number;
}

/**
 * Default idle animation for avatars without animation metadata
 */
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

/**
 * Default talking animation for avatars without animation metadata
 */
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

/**
 * Animation state type
 */
export type AvatarAnimationState = 'idle' | 'talking';

/**
 * Avatar Stage component for displaying pixel art with animation support
 */
export class AvatarStage {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private renderer: PixelsrcRenderer;
  private source: string;
  private animation: PixelArtAnimation | undefined;
  private spriteName: string | undefined;

  private currentState: AvatarAnimationState = 'idle';
  private isPlaying = false;
  private animationFrameId: number | null = null;
  private animationStartTime = 0;
  private speakingEndTimeout: number | null = null;

  private readonly size: number;
  private readonly displayScale: number;
  private readonly speakingEndDelay: number;

  // Cached sprite images keyed by sprite name
  private spriteCache: Map<string, ImageBitmap> = new Map();
  private baseSprite: ImageBitmap | null = null;
  private initialized = false;

  /**
   * Create a new AvatarStage
   *
   * @param pixelArt - The pixel art data containing source and optional animation metadata
   * @param renderer - Initialized PixelsrcRenderer instance
   * @param spriteName - Optional specific sprite name to render
   * @param config - Configuration options
   */
  constructor(
    pixelArt: PixelArt,
    renderer: PixelsrcRenderer,
    spriteName?: string,
    config: AvatarStageConfig = {}
  ) {
    this.source = pixelArt.source;
    this.animation = pixelArt.animation;
    this.spriteName = spriteName;
    this.renderer = renderer;

    this.size = config.size ?? 64;
    this.displayScale = config.displayScale ?? 1;
    this.speakingEndDelay = config.speakingEndDelay ?? 200;

    // Create canvas element
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.size;
    this.canvas.height = this.size;
    this.canvas.className = 'avatar-stage';

    // Apply display scaling via CSS
    if (this.displayScale !== 1) {
      this.canvas.style.width = `${this.size * this.displayScale}px`;
      this.canvas.style.height = `${this.size * this.displayScale}px`;
    }

    // Pixel-perfect rendering
    this.canvas.style.imageRendering = 'pixelated';

    const ctx = this.canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Failed to get canvas 2d context');
    }
    this.ctx = ctx;

    // Disable image smoothing for crisp pixels
    this.ctx.imageSmoothingEnabled = false;

    // Initialize and optionally auto-play
    this.initAsync().then(() => {
      if (config.autoPlay !== false) {
        this.play();
      }
    });

    this.injectStyles();
  }

  // ===========================================================================
  // Public API
  // ===========================================================================

  /**
   * Play an animation state
   *
   * @param state - Animation state to play (default: 'idle')
   */
  play(state: AvatarAnimationState = 'idle'): void {
    this.currentState = state;
    this.isPlaying = true;
    this.animationStartTime = performance.now();

    if (this.animationFrameId === null) {
      this.animationFrameId = requestAnimationFrame(this.animate);
    }
  }

  /**
   * Stop animation and return to idle state
   */
  stop(): void {
    this.isPlaying = false;

    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }

    if (this.speakingEndTimeout !== null) {
      clearTimeout(this.speakingEndTimeout);
      this.speakingEndTimeout = null;
    }

    this.currentState = 'idle';

    // Render static frame
    this.renderFrame();
  }

  /**
   * Start the talking animation (call during TTS playback)
   */
  startSpeaking(): void {
    // Clear any pending stop timeout
    if (this.speakingEndTimeout !== null) {
      clearTimeout(this.speakingEndTimeout);
      this.speakingEndTimeout = null;
    }

    this.play('talking');
  }

  /**
   * Stop the talking animation and return to idle after a brief delay
   */
  stopSpeaking(): void {
    // Delay return to idle for smoother transition
    this.speakingEndTimeout = window.setTimeout(() => {
      this.speakingEndTimeout = null;
      if (this.isPlaying) {
        this.play('idle');
      }
    }, this.speakingEndDelay);
  }

  /**
   * Get the canvas element for DOM insertion
   */
  getElement(): HTMLCanvasElement {
    return this.canvas;
  }

  /**
   * Check if the avatar is currently playing
   */
  isAnimating(): boolean {
    return this.isPlaying;
  }

  /**
   * Get the current animation state
   */
  getCurrentState(): AvatarAnimationState {
    return this.currentState;
  }

  /**
   * Clean up resources
   */
  destroy(): void {
    this.stop();

    // Clear sprite cache
    for (const bitmap of this.spriteCache.values()) {
      bitmap.close();
    }
    this.spriteCache.clear();

    if (this.baseSprite) {
      this.baseSprite.close();
      this.baseSprite = null;
    }

    // Remove canvas from DOM if attached
    if (this.canvas.parentNode) {
      this.canvas.parentNode.removeChild(this.canvas);
    }
  }

  // ===========================================================================
  // Private Methods
  // ===========================================================================

  /**
   * Initialize by rendering the base sprite
   */
  private async initAsync(): Promise<void> {
    try {
      // Render the base sprite
      const result = this.renderer.render(this.source, this.spriteName);
      this.baseSprite = await this.pngToImageBitmap(result.data);

      // Cache it
      const cacheKey = this.spriteName ?? result.spriteName;
      this.spriteCache.set(cacheKey, this.baseSprite);

      this.initialized = true;

      // Render initial frame
      this.renderFrame();
    } catch (error) {
      console.error('AvatarStage: Failed to initialize', error);
      // Render placeholder
      this.renderPlaceholder();
    }
  }

  /**
   * Convert PNG bytes to ImageBitmap
   */
  private async pngToImageBitmap(pngData: Uint8Array): Promise<ImageBitmap> {
    // Create a copy of the data to ensure we have a standard ArrayBuffer
    const buffer = new Uint8Array(pngData).buffer;
    const blob = new Blob([buffer], { type: 'image/png' });
    return createImageBitmap(blob);
  }

  /**
   * Animation loop callback
   */
  private animate = (timestamp: number): void => {
    if (!this.isPlaying) {
      this.animationFrameId = null;
      return;
    }

    this.renderFrame(timestamp);
    this.animationFrameId = requestAnimationFrame(this.animate);
  };

  /**
   * Render a single animation frame
   */
  private renderFrame(timestamp?: number): void {
    if (!this.initialized || !this.baseSprite) {
      return;
    }

    const animState = this.getAnimationState(this.currentState);
    const elapsed = timestamp !== undefined ? timestamp - this.animationStartTime : 0;

    // Calculate progress through animation
    let progress = (elapsed % animState.duration) / animState.duration;
    if (!animState.loop && elapsed >= animState.duration) {
      progress = 1;
    }

    // Get keyframe data at current progress
    const keyframeData = this.interpolateKeyframes(animState.keyframes, progress);

    // Clear canvas
    this.ctx.clearRect(0, 0, this.size, this.size);

    // Apply transforms
    this.ctx.save();

    // Center the transform origin
    this.ctx.translate(this.size / 2, this.size / 2);

    // Apply CSS-like transforms
    if (keyframeData.transform) {
      this.applyTransform(keyframeData.transform);
    }

    // Apply opacity
    if (keyframeData.opacity !== undefined) {
      this.ctx.globalAlpha = keyframeData.opacity;
    }

    // Draw sprite centered
    const sprite = this.baseSprite;
    const drawX = -sprite.width / 2;
    const drawY = -sprite.height / 2;

    this.ctx.drawImage(sprite, drawX, drawY);

    this.ctx.restore();
  }

  /**
   * Get the animation state configuration
   */
  private getAnimationState(state: AvatarAnimationState): AnimationState {
    // Try to get from pixelArt animation metadata
    if (this.animation?.states[state]) {
      return this.animation.states[state];
    }

    // Fall back to defaults
    return state === 'talking' ? DEFAULT_TALKING_ANIMATION : DEFAULT_IDLE_ANIMATION;
  }

  /**
   * Interpolate between keyframes based on progress
   */
  private interpolateKeyframes(
    keyframes: Record<string, KeyframeData>,
    progress: number
  ): KeyframeData {
    const percentages = Object.keys(keyframes)
      .map((k) => parseInt(k, 10))
      .sort((a, b) => a - b);

    const targetPercent = progress * 100;

    // Find surrounding keyframes
    let lowerKey = percentages[0]!;
    let upperKey = percentages[percentages.length - 1]!;

    for (let i = 0; i < percentages.length - 1; i++) {
      if (percentages[i]! <= targetPercent && percentages[i + 1]! >= targetPercent) {
        lowerKey = percentages[i]!;
        upperKey = percentages[i + 1]!;
        break;
      }
    }

    const lowerFrame = keyframes[lowerKey.toString()]!;
    const upperFrame = keyframes[upperKey.toString()]!;

    // If at exact keyframe, return it
    if (lowerKey === upperKey || targetPercent <= lowerKey) {
      return lowerFrame;
    }
    if (targetPercent >= upperKey) {
      return upperFrame;
    }

    // Interpolate
    const localProgress = (targetPercent - lowerKey) / (upperKey - lowerKey);

    const result: KeyframeData = {};

    // Only include sprite if defined
    const sprite = upperFrame.sprite ?? lowerFrame.sprite;
    if (sprite !== undefined) {
      result.sprite = sprite;
    }

    // Only include transform if defined
    const transform = this.interpolateTransform(
      lowerFrame.transform,
      upperFrame.transform,
      localProgress
    );
    if (transform !== undefined) {
      result.transform = transform;
    }

    // Only include opacity if defined
    if (lowerFrame.opacity !== undefined && upperFrame.opacity !== undefined) {
      result.opacity = lowerFrame.opacity + (upperFrame.opacity - lowerFrame.opacity) * localProgress;
    } else if (upperFrame.opacity !== undefined) {
      result.opacity = upperFrame.opacity;
    } else if (lowerFrame.opacity !== undefined) {
      result.opacity = lowerFrame.opacity;
    }

    return result;
  }

  /**
   * Simple transform interpolation (handles translateY)
   */
  private interpolateTransform(
    from: string | undefined,
    to: string | undefined,
    progress: number
  ): string | undefined {
    if (!from && !to) return undefined;
    if (!from) return to;
    if (!to) return from;

    // Extract translateY values
    const fromY = this.parseTranslateY(from);
    const toY = this.parseTranslateY(to);
    const y = fromY + (toY - fromY) * progress;

    // Extract scale values
    const fromScale = this.parseScale(from);
    const toScale = this.parseScale(to);
    const scale = fromScale + (toScale - fromScale) * progress;

    let result = '';
    if (y !== 0) {
      result += `translateY(${y}px)`;
    }
    if (scale !== 1) {
      result += (result ? ' ' : '') + `scale(${scale})`;
    }

    return result || undefined;
  }

  /**
   * Parse translateY value from transform string
   */
  private parseTranslateY(transform: string): number {
    const match = transform.match(/translateY\((-?\d+(?:\.\d+)?)(px)?\)/);
    return match ? parseFloat(match[1]!) : 0;
  }

  /**
   * Parse scale value from transform string
   */
  private parseScale(transform: string): number {
    const match = transform.match(/scale\((\d+(?:\.\d+)?)\)/);
    return match ? parseFloat(match[1]!) : 1;
  }

  /**
   * Apply CSS-like transform string to canvas context
   */
  private applyTransform(transform: string): void {
    // Parse translateY
    const translateMatch = transform.match(/translateY\((-?\d+(?:\.\d+)?)(px)?\)/);
    if (translateMatch) {
      this.ctx.translate(0, parseFloat(translateMatch[1]!));
    }

    // Parse scale
    const scaleMatch = transform.match(/scale\((\d+(?:\.\d+)?)\)/);
    if (scaleMatch) {
      const scale = parseFloat(scaleMatch[1]!);
      this.ctx.scale(scale, scale);
    }
  }

  /**
   * Render a placeholder when sprite fails to load
   */
  private renderPlaceholder(): void {
    this.ctx.fillStyle = '#2a2a2a';
    this.ctx.fillRect(0, 0, this.size, this.size);

    this.ctx.fillStyle = '#666';
    this.ctx.font = `${this.size / 3}px sans-serif`;
    this.ctx.textAlign = 'center';
    this.ctx.textBaseline = 'middle';
    this.ctx.fillText('?', this.size / 2, this.size / 2);
  }

  /**
   * Inject component styles into document
   */
  private injectStyles(): void {
    if (document.getElementById('avatar-stage-styles')) return;

    const styles = document.createElement('style');
    styles.id = 'avatar-stage-styles';
    styles.textContent = `
      .avatar-stage {
        display: block;
        border-radius: 4px;
        background: #1a1a1a;
      }
    `;
    document.head.appendChild(styles);
  }
}

// Re-export old names for backwards compatibility during migration
export { AvatarStage as AnimatedAvatar };
export type { AvatarStageConfig as AnimatedAvatarConfig };
export default AvatarStage;
