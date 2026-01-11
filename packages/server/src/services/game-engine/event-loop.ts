/**
 * Event Loop
 *
 * Manages playback control and auto-advancement.
 */

import type { PlaybackMode } from '@reckoning/shared';

// =============================================================================
// Types
// =============================================================================

/**
 * Callback for triggering generation
 */
export type GenerateCallback = (gameId: string) => Promise<void>;

/**
 * Active generation state
 */
interface PendingGeneration {
  promise: Promise<void>;
  aborted: boolean;
}

// =============================================================================
// EventLoop Class
// =============================================================================

/**
 * Controls playback and decides when to auto-advance.
 */
export class EventLoop {
  /** Playback mode per game */
  private playbackModes: Map<string, PlaybackMode> = new Map();

  /** Pending generation promises per game */
  private pendingGenerations: Map<string, PendingGeneration> = new Map();

  /** Callback to trigger generation (set by GameEngine) */
  private generateCallback: GenerateCallback | null = null;

  /**
   * Set the callback used for triggering generation
   */
  setGenerateCallback(callback: GenerateCallback): void {
    this.generateCallback = callback;
  }

  /**
   * Set playback mode for a game
   *
   * @param gameId - ID of the game
   * @param mode - New playback mode
   */
  setMode(gameId: string, mode: PlaybackMode): void {
    this.playbackModes.set(gameId, mode);

    // If changing to stopped, abort any pending generation
    if (mode === 'stopped') {
      this.abortPending(gameId);
    }
  }

  /**
   * Get playback mode for a game
   *
   * @param gameId - ID of the game
   * @returns Current playback mode (defaults to 'paused')
   */
  getMode(gameId: string): PlaybackMode {
    return this.playbackModes.get(gameId) ?? 'paused';
  }

  /**
   * Called after content is submitted - decides whether to auto-advance
   *
   * @param gameId - ID of the game
   */
  async onSubmit(gameId: string): Promise<void> {
    const mode = this.getMode(gameId);

    if (mode === 'auto') {
      // Auto mode: immediately generate next content
      await this.triggerGeneration(gameId);
    } else if (mode === 'stepping') {
      // Stepping mode: wait for explicit step call
      // Don't auto-advance
    }
    // paused and stopped: don't auto-advance
  }

  /**
   * Manual step (for stepping mode)
   *
   * @param gameId - ID of the game
   */
  async step(gameId: string): Promise<void> {
    const mode = this.getMode(gameId);

    if (mode === 'stopped') {
      // Can't step when stopped
      return;
    }

    await this.triggerGeneration(gameId);
  }

  /**
   * Stop current generation for a game
   *
   * @param gameId - ID of the game
   */
  stop(gameId: string): void {
    this.setMode(gameId, 'stopped');
    this.abortPending(gameId);
  }

  /**
   * Check if a generation is in progress
   *
   * @param gameId - ID of the game
   * @returns True if generation is pending
   */
  isGenerating(gameId: string): boolean {
    const pending = this.pendingGenerations.get(gameId);
    return pending !== undefined && !pending.aborted;
  }

  /**
   * Wait for any pending generation to complete
   *
   * @param gameId - ID of the game
   */
  async waitForPending(gameId: string): Promise<void> {
    const pending = this.pendingGenerations.get(gameId);
    if (pending && !pending.aborted) {
      await pending.promise.catch(() => {
        // Ignore errors, just wait for completion
      });
    }
  }

  /**
   * Clean up resources for a game
   *
   * @param gameId - ID of the game
   */
  cleanup(gameId: string): void {
    this.abortPending(gameId);
    this.playbackModes.delete(gameId);
    this.pendingGenerations.delete(gameId);
  }

  /**
   * Trigger generation (internal)
   */
  private async triggerGeneration(gameId: string): Promise<void> {
    if (!this.generateCallback) {
      return;
    }

    // Check if already generating
    if (this.isGenerating(gameId)) {
      return;
    }

    // Create pending generation
    const pending: PendingGeneration = {
      promise: Promise.resolve(),
      aborted: false,
    };

    pending.promise = this.generateCallback(gameId).finally(() => {
      // Clean up when done
      if (this.pendingGenerations.get(gameId) === pending) {
        this.pendingGenerations.delete(gameId);
      }
    });

    this.pendingGenerations.set(gameId, pending);

    await pending.promise;
  }

  /**
   * Abort pending generation for a game
   */
  private abortPending(gameId: string): void {
    const pending = this.pendingGenerations.get(gameId);
    if (pending) {
      pending.aborted = true;
    }
  }
}
