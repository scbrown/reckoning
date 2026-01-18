/**
 * Avatar Manager Service
 *
 * Central service for managing animated avatars across the application.
 * Handles PixelsrcRenderer initialization, AnimatedAvatar lifecycle,
 * TTS synchronization, and graceful WASM fallback.
 */

import type { Character, PixelArt } from '@reckoning/shared';
import { AnimatedAvatar } from '../../components/animated-avatar.js';
import { PixelsrcRenderer } from '../pixelsrc/index.js';

/**
 * Configuration for AvatarManager
 */
export interface AvatarManagerConfig {
  /** Path to WASM file (optional, uses default if not specified) */
  wasmPath?: string;
  /** Default avatar size in pixels (default: 64) */
  defaultSize?: number;
  /** Default display scale (default: 1) */
  defaultDisplayScale?: number;
}

/**
 * Callback for avatar events
 */
export interface AvatarManagerCallbacks {
  /** Called when WASM initialization fails */
  onWasmError?: (error: Error) => void;
  /** Called when an avatar fails to render */
  onAvatarError?: (characterId: string, error: Error) => void;
}

/**
 * Central manager for animated avatars
 */
export class AvatarManager {
  private renderer: PixelsrcRenderer | null = null;
  private avatars: Map<string, AnimatedAvatar> = new Map();
  private wasmInitialized = false;
  private wasmFailed = false;
  private initPromise: Promise<void> | null = null;
  private callbacks: AvatarManagerCallbacks = {};

  private readonly config: Required<AvatarManagerConfig>;

  constructor(config: AvatarManagerConfig = {}) {
    this.config = {
      wasmPath: config.wasmPath ?? '',
      defaultSize: config.defaultSize ?? 64,
      defaultDisplayScale: config.defaultDisplayScale ?? 1,
    };
  }

  // ===========================================================================
  // Public API
  // ===========================================================================

  /**
   * Initialize the WASM renderer. Call this once at app startup.
   * Safe to call multiple times - will only initialize once.
   */
  async init(): Promise<boolean> {
    // Return cached result if already attempted
    if (this.wasmInitialized) return true;
    if (this.wasmFailed) return false;

    // Prevent concurrent initialization
    if (this.initPromise) {
      return this.initPromise.then(() => this.wasmInitialized);
    }

    this.initPromise = this.initAsync();
    return this.initPromise.then(() => this.wasmInitialized);
  }

  /**
   * Check if WASM is available
   */
  isWasmAvailable(): boolean {
    return this.wasmInitialized && !this.wasmFailed;
  }

  /**
   * Create or update an avatar for a character
   *
   * @param character - Character to create avatar for
   * @param pixelArt - Full pixel art data (source + animation metadata)
   * @param options - Optional configuration overrides
   * @returns The AnimatedAvatar element, or null if WASM is unavailable
   */
  createAvatar(
    character: Character,
    pixelArt: PixelArt,
    options?: { size?: number; displayScale?: number }
  ): HTMLCanvasElement | null {
    if (!this.wasmInitialized || !this.renderer) {
      return null;
    }

    // Remove existing avatar for this character
    this.removeAvatar(character.id);

    try {
      const avatar = new AnimatedAvatar(
        pixelArt,
        this.renderer,
        character.pixelArtRef?.spriteName,
        {
          size: options?.size ?? this.config.defaultSize,
          displayScale: options?.displayScale ?? this.config.defaultDisplayScale,
          autoPlay: true,
        }
      );

      this.avatars.set(character.id, avatar);
      return avatar.getElement();
    } catch (error) {
      console.error(`AvatarManager: Failed to create avatar for ${character.id}`, error);
      this.callbacks.onAvatarError?.(
        character.id,
        error instanceof Error ? error : new Error(String(error))
      );
      return null;
    }
  }

  /**
   * Get an existing avatar for a character
   */
  getAvatar(characterId: string): AnimatedAvatar | undefined {
    return this.avatars.get(characterId);
  }

  /**
   * Remove an avatar for a character
   */
  removeAvatar(characterId: string): void {
    const avatar = this.avatars.get(characterId);
    if (avatar) {
      avatar.destroy();
      this.avatars.delete(characterId);
    }
  }

  /**
   * Start speaking animation for a character
   */
  startSpeaking(characterId: string): void {
    const avatar = this.avatars.get(characterId);
    if (avatar) {
      avatar.startSpeaking();
    }
  }

  /**
   * Stop speaking animation for a character
   */
  stopSpeaking(characterId: string): void {
    const avatar = this.avatars.get(characterId);
    if (avatar) {
      avatar.stopSpeaking();
    }
  }

  /**
   * Set callbacks for manager events
   */
  setCallbacks(callbacks: AvatarManagerCallbacks): void {
    this.callbacks = callbacks;
  }

  /**
   * Get all active character IDs with avatars
   */
  getActiveAvatarIds(): string[] {
    return Array.from(this.avatars.keys());
  }

  /**
   * Clear all avatars
   */
  clearAll(): void {
    for (const avatar of this.avatars.values()) {
      avatar.destroy();
    }
    this.avatars.clear();
  }

  /**
   * Cleanup all resources
   */
  destroy(): void {
    this.clearAll();
    this.renderer = null;
    this.wasmInitialized = false;
    this.initPromise = null;
  }

  // ===========================================================================
  // Private Methods
  // ===========================================================================

  private async initAsync(): Promise<void> {
    try {
      this.renderer = new PixelsrcRenderer();
      await this.renderer.init(this.config.wasmPath || undefined);
      this.wasmInitialized = true;
      console.log('AvatarManager: WASM renderer initialized');
    } catch (error) {
      console.error('AvatarManager: WASM initialization failed', error);
      this.wasmFailed = true;
      this.renderer = null;
      this.callbacks.onWasmError?.(
        error instanceof Error ? error : new Error(String(error))
      );
    }
  }
}

/**
 * Singleton instance for convenience
 */
let globalInstance: AvatarManager | null = null;

/**
 * Get the global AvatarManager instance
 */
export function getAvatarManager(): AvatarManager {
  if (!globalInstance) {
    globalInstance = new AvatarManager();
  }
  return globalInstance;
}

/**
 * Initialize the global AvatarManager instance
 */
export async function initAvatarManager(config?: AvatarManagerConfig): Promise<AvatarManager> {
  if (!globalInstance) {
    globalInstance = new AvatarManager(config);
  }
  await globalInstance.init();
  return globalInstance;
}

export default AvatarManager;
