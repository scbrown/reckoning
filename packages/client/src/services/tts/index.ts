/**
 * TTS Service - Client-side text-to-speech playback
 *
 * Manages audio queue, playback controls, and HTMLAudioElement playback.
 */

import type {
  ITTSService,
  TTSRequest,
  TTSQueueItem,
  TTSQueueStatus,
  TTSPlaybackState,
  TTSEventCallbacks,
} from '@reckoning/shared';

/**
 * Configuration options for TTSService
 */
export interface TTSServiceConfig {
  /** Base URL for TTS API (default: '/api/tts') */
  apiBaseUrl?: string;
  /** Initial volume (0-1, default: 1) */
  initialVolume?: number;
  /** Auto-play when items are added to queue (default: true) */
  autoPlay?: boolean;
}

/**
 * Generate a unique ID for queue items
 */
function generateId(): string {
  return `tts-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Client-side TTS service implementation
 */
export class TTSService implements ITTSService {
  private readonly apiBaseUrl: string;
  private readonly autoPlay: boolean;

  private currentAudioElement: HTMLAudioElement | null = null;

  private volume = 1;
  private playbackState: TTSPlaybackState = 'idle';
  private currentItem: TTSQueueItem | null = null;
  private queue: TTSQueueItem[] = [];
  private callbacks: TTSEventCallbacks = {};

  private disposed = false;

  constructor(config: TTSServiceConfig = {}) {
    this.apiBaseUrl = config.apiBaseUrl ?? '/api/tts';
    this.volume = Math.max(0, Math.min(1, config.initialVolume ?? 1));
    this.autoPlay = config.autoPlay ?? true;
  }

  // ===========================================================================
  // Queue Management
  // ===========================================================================

  async speak(request: TTSRequest): Promise<string> {
    this.ensureNotDisposed();

    const item = this.createQueueItem(request);
    this.queue.push(item);
    this.notifyQueueChange();

    if (this.autoPlay && this.playbackState === 'idle') {
      this.playNext();
    }

    return item.id;
  }

  async preload(request: TTSRequest): Promise<string> {
    this.ensureNotDisposed();

    const item = this.createQueueItem(request);
    this.queue.push(item);
    this.notifyQueueChange();

    // Start loading in the background
    this.loadAudio(item).catch((error) => {
      this.handleItemError(item, error);
    });

    return item.id;
  }

  getQueueStatus(): TTSQueueStatus {
    return {
      playbackState: this.playbackState,
      currentItem: this.currentItem,
      pendingItems: [...this.queue],
      totalItems: (this.currentItem ? 1 : 0) + this.queue.length,
    };
  }

  clearQueue(): void {
    this.queue = [];
    this.notifyQueueChange();
  }

  // ===========================================================================
  // Playback Controls
  // ===========================================================================

  play(): void {
    this.ensureNotDisposed();

    if (this.playbackState === 'paused') {
      this.resume();
    } else if (this.playbackState === 'idle' && this.queue.length > 0) {
      this.playNext();
    }
  }

  pause(): void {
    this.ensureNotDisposed();

    if (this.playbackState !== 'playing') return;

    if (this.currentAudioElement) {
      this.currentAudioElement.pause();
      this.playbackState = 'paused';
      this.notifyQueueChange();
    }
  }

  resume(): void {
    this.ensureNotDisposed();

    if (this.playbackState !== 'paused') return;

    if (this.currentAudioElement) {
      this.currentAudioElement.play().catch((error) => {
        console.error('Failed to resume playback:', error);
      });
      this.playbackState = 'playing';
      this.notifyQueueChange();
    }
  }

  skip(): void {
    this.ensureNotDisposed();

    this.stopCurrentPlayback();

    if (this.currentItem) {
      this.currentItem.state = 'completed';
      this.callbacks.onEnd?.(this.currentItem);
      this.currentItem = null;
    }

    this.playbackState = 'idle';
    this.notifyQueueChange();

    if (this.queue.length > 0) {
      this.playNext();
    }
  }

  stop(): void {
    this.ensureNotDisposed();

    this.stopCurrentPlayback();

    if (this.currentItem) {
      this.currentItem.state = 'completed';
      this.currentItem = null;
    }

    this.queue = [];
    this.playbackState = 'idle';
    this.notifyQueueChange();
  }

  // ===========================================================================
  // Volume Control
  // ===========================================================================

  setVolume(volume: number): void {
    this.volume = Math.max(0, Math.min(1, volume));

    if (this.currentAudioElement) {
      this.currentAudioElement.volume = this.volume;
    }
  }

  getVolume(): number {
    return this.volume;
  }

  // ===========================================================================
  // Event Registration
  // ===========================================================================

  setCallbacks(callbacks: TTSEventCallbacks): void {
    this.callbacks = callbacks;
  }

  // ===========================================================================
  // Lifecycle
  // ===========================================================================

  dispose(): void {
    if (this.disposed) return;

    this.disposed = true;
    this.stop();
    this.callbacks = {};
  }

  // ===========================================================================
  // Private Methods
  // ===========================================================================

  private createQueueItem(request: TTSRequest): TTSQueueItem {
    return {
      id: generateId(),
      request,
      state: 'pending',
    };
  }

  private ensureNotDisposed(): void {
    if (this.disposed) {
      throw new Error('TTSService has been disposed');
    }
  }

  private async loadAudio(item: TTSQueueItem): Promise<Blob> {
    if (item.audioBlob) {
      return item.audioBlob;
    }

    item.state = 'loading';
    this.notifyQueueChange();

    const response = await fetch(`${this.apiBaseUrl}/speak`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(item.request),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`TTS API error: ${response.status} - ${errorText}`);
    }

    const blob = await response.blob();
    item.audioBlob = blob;
    item.state = 'ready';
    this.notifyQueueChange();

    return blob;
  }

  private async playNext(): Promise<void> {
    if (this.queue.length === 0) {
      this.playbackState = 'idle';
      this.notifyQueueChange();
      return;
    }

    const item = this.queue.shift()!;
    this.currentItem = item;
    this.playbackState = 'loading';
    this.notifyQueueChange();

    try {
      const blob = await this.loadAudio(item);
      await this.playAudioBlob(item, blob);
    } catch (error) {
      this.handleItemError(item, error instanceof Error ? error : new Error(String(error)));
      // Continue to next item
      this.currentItem = null;
      this.playNext();
    }
  }

  private async playAudioBlob(item: TTSQueueItem, blob: Blob): Promise<void> {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);

      audio.volume = this.volume;
      this.currentAudioElement = audio;

      audio.onplay = () => {
        item.state = 'playing';
        this.playbackState = 'playing';
        this.notifyQueueChange();
        this.callbacks.onStart?.(item);
      };

      audio.onended = () => {
        URL.revokeObjectURL(url);
        item.state = 'completed';
        this.currentAudioElement = null;
        this.currentItem = null;
        this.callbacks.onEnd?.(item);

        // Play next item in queue
        this.playNext();
        resolve();
      };

      audio.onerror = () => {
        URL.revokeObjectURL(url);
        this.currentAudioElement = null;
        reject(new Error('Audio playback failed'));
      };

      audio.play().catch(reject);
    });
  }

  private stopCurrentPlayback(): void {
    if (this.currentAudioElement) {
      this.currentAudioElement.pause();
      this.currentAudioElement.src = '';
      this.currentAudioElement = null;
    }
  }

  private handleItemError(item: TTSQueueItem, error: Error): void {
    item.state = 'error';
    item.error = error.message;
    this.notifyQueueChange();
    this.callbacks.onError?.(item, error);
  }

  private notifyQueueChange(): void {
    this.callbacks.onQueueChange?.(this.getQueueStatus());
  }
}

export default TTSService;
