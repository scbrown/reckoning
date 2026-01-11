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
  VoiceRole,
  NarrativeBeat,
  BeatType,
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
 * Map beat types to voice roles for TTS playback
 */
const BEAT_TYPE_TO_VOICE_ROLE: Record<BeatType, VoiceRole> = {
  narration: 'narrator',
  dialogue: 'npc',
  action: 'narrator',
  thought: 'inner_voice',
  sound: 'narrator',
  transition: 'narrator',
};

/**
 * Get the appropriate voice role for a beat
 */
function getVoiceRoleForBeat(beat: NarrativeBeat): VoiceRole {
  // If the beat has a speaker, use NPC voice for dialogue-like beats
  if (beat.speaker && (beat.type === 'dialogue' || beat.type === 'thought')) {
    return beat.type === 'thought' ? 'inner_voice' : 'npc';
  }
  return BEAT_TYPE_TO_VOICE_ROLE[beat.type];
}

/**
 * Get the voice preset based on beat metadata
 */
function getPresetForBeat(beat: NarrativeBeat): string | undefined {
  if (!beat.metadata?.emotion) return undefined;

  // Map emotions to presets
  const emotion = beat.metadata.emotion.toLowerCase();
  if (emotion.includes('intense') || emotion.includes('angry') || emotion.includes('excited')) {
    return 'dialogue_intense';
  }
  if (emotion.includes('calm') || emotion.includes('peaceful') || emotion.includes('soft')) {
    return 'dialogue_calm';
  }
  return undefined;
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

  /**
   * Speak a sequence of narrative beats with appropriate voices and pauses
   *
   * @param beats - Array of narrative beats to speak in sequence
   * @param options - Optional configuration for sequence playback
   * @returns Promise that resolves when all beats have been queued
   */
  async speakSequence(
    beats: NarrativeBeat[],
    options: {
      /** Default pause between beats in ms (default: 500) */
      defaultPause?: number;
      /** Skip empty beats (default: true) */
      skipEmpty?: boolean;
      /** Callback when each beat starts */
      onBeatStart?: (beat: NarrativeBeat, index: number) => void;
      /** Callback when each beat ends */
      onBeatEnd?: (beat: NarrativeBeat, index: number) => void;
    } = {}
  ): Promise<string[]> {
    this.ensureNotDisposed();

    const {
      defaultPause = 500,
      skipEmpty = true,
      onBeatStart,
      onBeatEnd,
    } = options;

    const queueIds: string[] = [];
    const filteredBeats = skipEmpty
      ? beats.filter((b) => b.content.trim().length > 0)
      : beats;

    for (let i = 0; i < filteredBeats.length; i++) {
      const beat = filteredBeats[i]!;
      const isLast = i === filteredBeats.length - 1;

      // Create TTS request for this beat
      const preset = getPresetForBeat(beat);
      const request: TTSRequest = {
        text: beat.content,
        role: getVoiceRoleForBeat(beat) ?? 'narrator',
        ...(preset && { preset }),
        priority: 'normal',
        cache: true,
      };

      // Create queue item with beat reference for callbacks
      const item = this.createQueueItem(request);
      (item as TTSQueueItem & { beatIndex?: number; beat?: NarrativeBeat }).beatIndex = i;
      (item as TTSQueueItem & { beatIndex?: number; beat?: NarrativeBeat }).beat = beat;

      this.queue.push(item);
      queueIds.push(item.id);

      // If not the last beat, add a pause after based on metadata or default
      if (!isLast) {
        const pauseDuration = beat.metadata?.pauseAfter ?? defaultPause;
        if (pauseDuration > 0) {
          // Add a pause item to the queue
          const pauseItem = this.createPauseItem(pauseDuration);
          this.queue.push(pauseItem);
        }
      }
    }

    this.notifyQueueChange();

    // Store callbacks for beat events
    if (onBeatStart || onBeatEnd) {
      const originalOnStart = this.callbacks.onStart;
      const originalOnEnd = this.callbacks.onEnd;

      this.callbacks.onStart = (item) => {
        originalOnStart?.(item);
        const beatItem = item as TTSQueueItem & { beatIndex?: number; beat?: NarrativeBeat };
        if (beatItem.beat !== undefined && beatItem.beatIndex !== undefined) {
          onBeatStart?.(beatItem.beat, beatItem.beatIndex);
        }
      };

      this.callbacks.onEnd = (item) => {
        originalOnEnd?.(item);
        const beatItem = item as TTSQueueItem & { beatIndex?: number; beat?: NarrativeBeat };
        if (beatItem.beat !== undefined && beatItem.beatIndex !== undefined) {
          onBeatEnd?.(beatItem.beat, beatItem.beatIndex);
        }
      };
    }

    // Start playback if autoPlay is enabled and we're idle
    if (this.autoPlay && this.playbackState === 'idle') {
      this.playNext();
    }

    return queueIds;
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

    // Stop playback before setting disposed flag
    // (stop() checks ensureNotDisposed)
    this.stopCurrentPlayback();
    this.queue = [];
    this.playbackState = 'idle';

    this.disposed = true;
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

  /**
   * Create a pause item for the queue (used between beats)
   */
  private createPauseItem(durationMs: number): TTSQueueItem & { isPause: true; pauseDuration: number } {
    return {
      id: generateId(),
      request: { text: '' }, // Empty request for pause
      state: 'pending',
      isPause: true,
      pauseDuration: durationMs,
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

    // Handle pause items (used between beats)
    const pauseItem = item as TTSQueueItem & { isPause?: boolean; pauseDuration?: number };
    if (pauseItem.isPause && pauseItem.pauseDuration) {
      await this.playPause(pauseItem.pauseDuration);
      this.playNext();
      return;
    }

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

  /**
   * Play a pause (silence) for the specified duration
   */
  private async playPause(durationMs: number): Promise<void> {
    return new Promise((resolve) => {
      setTimeout(resolve, durationMs);
    });
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
