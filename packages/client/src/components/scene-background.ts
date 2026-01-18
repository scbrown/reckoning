/**
 * Scene Background Component
 *
 * Renders animated pixel art scene backgrounds using canvas and the pixelsrc WASM renderer.
 * Supports ambient animations like palette cycling and subtle motion effects.
 */

import type { PixelArt, PixelArtAnimation, AnimationState, KeyframeData } from '@reckoning/shared';
import { PixelsrcRenderer } from '../services/pixelsrc/index.js';

/**
 * Configuration for SceneBackground
 */
export interface SceneBackgroundConfig {
  /** Canvas width in pixels (default: 256) */
  width?: number;
  /** Canvas height in pixels (default: 192) */
  height?: number;
  /** Display scale via CSS (default: 1) */
  displayScale?: number;
  /** Auto-play on creation (default: true) */
  autoPlay?: boolean;
  /** Enable ambient animations (default: true) */
  enableAnimation?: boolean;
}

/**
 * Default ambient animation for scene backgrounds (subtle breathing effect)
 */
const DEFAULT_AMBIENT_ANIMATION: AnimationState = {
  keyframes: {
    '0': { opacity: 1 },
    '50': { opacity: 0.98 },
    '100': { opacity: 1 },
  },
  duration: 4000,
  timingFunction: 'ease-in-out',
  loop: true,
};

/**
 * Animation state type for scenes
 */
export type SceneAnimationState = 'idle' | 'active' | 'flicker';

/**
 * Scene Background component for displaying pixel art backgrounds with ambient animations
 */
export class SceneBackground {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private renderer: PixelsrcRenderer;
  private source: string;
  private animation: PixelArtAnimation | undefined;
  private spriteName: string | undefined;

  private currentState: SceneAnimationState = 'idle';
  private isPlaying = false;
  private animationFrameId: number | null = null;
  private animationStartTime = 0;

  private readonly width: number;
  private readonly height: number;
  private readonly displayScale: number;
  private readonly enableAnimation: boolean;

  // Cached sprite image
  private backgroundSprite: ImageBitmap | null = null;
  private initialized = false;

  /**
   * Create a new SceneBackground
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
    config: SceneBackgroundConfig = {}
  ) {
    this.source = pixelArt.source;
    this.animation = pixelArt.animation;
    this.spriteName = spriteName;
    this.renderer = renderer;

    this.width = config.width ?? 256;
    this.height = config.height ?? 192;
    this.displayScale = config.displayScale ?? 1;
    this.enableAnimation = config.enableAnimation !== false;

    // Create canvas element
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.width;
    this.canvas.height = this.height;
    this.canvas.className = 'scene-background';

    // Apply display scaling via CSS
    if (this.displayScale !== 1) {
      this.canvas.style.width = `${this.width * this.displayScale}px`;
      this.canvas.style.height = `${this.height * this.displayScale}px`;
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
      if (config.autoPlay !== false && this.enableAnimation) {
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
  play(state: SceneAnimationState = 'idle'): void {
    if (!this.enableAnimation) {
      return;
    }

    this.currentState = state;
    this.isPlaying = true;
    this.animationStartTime = performance.now();

    if (this.animationFrameId === null) {
      this.animationFrameId = requestAnimationFrame(this.animate);
    }
  }

  /**
   * Stop animation
   */
  stop(): void {
    this.isPlaying = false;

    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }

    this.currentState = 'idle';

    // Render static frame
    this.renderFrame();
  }

  /**
   * Trigger active animation state (e.g., for events)
   */
  setActive(): void {
    this.play('active');
  }

  /**
   * Trigger flicker animation state (e.g., for fire/torch effects)
   */
  setFlicker(): void {
    this.play('flicker');
  }

  /**
   * Return to idle state
   */
  setIdle(): void {
    this.play('idle');
  }

  /**
   * Get the canvas element for DOM insertion
   */
  getElement(): HTMLCanvasElement {
    return this.canvas;
  }

  /**
   * Check if the scene is currently animating
   */
  isAnimating(): boolean {
    return this.isPlaying;
  }

  /**
   * Get the current animation state
   */
  getCurrentState(): SceneAnimationState {
    return this.currentState;
  }

  /**
   * Check if the scene has been initialized
   */
  isReady(): boolean {
    return this.initialized;
  }

  /**
   * Clean up resources
   */
  destroy(): void {
    this.stop();

    if (this.backgroundSprite) {
      this.backgroundSprite.close();
      this.backgroundSprite = null;
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
   * Initialize by rendering the background sprite
   */
  private async initAsync(): Promise<void> {
    try {
      // Render the background sprite
      const result = this.renderer.render(this.source, this.spriteName);
      this.backgroundSprite = await this.pngToImageBitmap(result.data);

      this.initialized = true;

      // Render initial frame
      this.renderFrame();
    } catch (error) {
      console.error('SceneBackground: Failed to initialize', error);
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
    if (!this.initialized || !this.backgroundSprite) {
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
    this.ctx.clearRect(0, 0, this.width, this.height);

    // Apply transforms
    this.ctx.save();

    // Center the transform origin
    this.ctx.translate(this.width / 2, this.height / 2);

    // Apply CSS-like transforms
    if (keyframeData.transform) {
      this.applyTransform(keyframeData.transform);
    }

    // Apply opacity
    if (keyframeData.opacity !== undefined) {
      this.ctx.globalAlpha = keyframeData.opacity;
    }

    // Draw background centered
    const sprite = this.backgroundSprite;
    const drawX = -sprite.width / 2;
    const drawY = -sprite.height / 2;

    this.ctx.drawImage(sprite, drawX, drawY);

    this.ctx.restore();
  }

  /**
   * Get the animation state configuration
   */
  private getAnimationState(state: SceneAnimationState): AnimationState {
    // Try to get from pixelArt animation metadata
    if (this.animation?.states[state]) {
      return this.animation.states[state];
    }

    // Fall back to default
    return DEFAULT_AMBIENT_ANIMATION;
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
   * Simple transform interpolation (handles translateY and scale)
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
    // Fill with dark gradient
    const gradient = this.ctx.createLinearGradient(0, 0, 0, this.height);
    gradient.addColorStop(0, '#1a1a2e');
    gradient.addColorStop(1, '#0f0f1a');
    this.ctx.fillStyle = gradient;
    this.ctx.fillRect(0, 0, this.width, this.height);

    // Draw "no scene" indicator
    this.ctx.fillStyle = '#333';
    this.ctx.font = `${this.height / 8}px monospace`;
    this.ctx.textAlign = 'center';
    this.ctx.textBaseline = 'middle';
    this.ctx.fillText('No Scene', this.width / 2, this.height / 2);
  }

  /**
   * Inject component styles into document
   */
  private injectStyles(): void {
    if (document.getElementById('scene-background-styles')) return;

    const styles = document.createElement('style');
    styles.id = 'scene-background-styles';
    styles.textContent = `
      .scene-background {
        display: block;
        border-radius: 4px;
        background: #0f0f1a;
      }
    `;
    document.head.appendChild(styles);
  }
}

export default SceneBackground;
