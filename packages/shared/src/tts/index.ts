/**
 * TTS (Text-to-Speech) Types
 *
 * Shared interfaces for the TTS system used by both client and server.
 */

// =============================================================================
// Voice Configuration
// =============================================================================

/**
 * Roles that can have distinct voices in the game
 */
export type VoiceRole = 'narrator' | 'judge' | 'npc' | 'inner_voice';

/**
 * Voice settings that control speech generation
 */
export interface VoiceSettings {
  /** 0-1: Lower = more expressive variation */
  stability: number;
  /** 0-1: How close to the original voice */
  similarityBoost: number;
  /** 0-1: Style exaggeration (v2 models only) */
  style?: number;
  /** Enhances clarity */
  useSpeakerBoost?: boolean;
}

/**
 * Preset configurations for different speaking contexts
 */
export interface VoicePreset {
  name: string;
  settings: VoiceSettings;
}

/**
 * Mapping of a voice role to a specific ElevenLabs voice
 */
export interface VoiceMapping {
  role: VoiceRole;
  voiceId: string;
  voiceName: string;
  defaultPreset: string;
}

// =============================================================================
// API Request/Response
// =============================================================================

/**
 * Request to generate speech from text
 */
export interface TTSRequest {
  /** The text to convert to speech */
  text: string;
  /** Voice role (resolved to voiceId on server) */
  role?: VoiceRole;
  /** Direct voice ID (overrides role) */
  voiceId?: string;
  /** Preset name or custom settings */
  preset?: string;
  /** Custom voice settings (overrides preset) */
  settings?: Partial<VoiceSettings>;
  /** Priority for queue ordering */
  priority?: 'high' | 'normal' | 'low';
  /** Whether to cache the result */
  cache?: boolean;
}

/**
 * Response from TTS generation
 */
export interface TTSResponse {
  /** Whether the audio was served from cache */
  cached: boolean;
  /** Audio content type (e.g., 'audio/mpeg') */
  contentType: string;
  /** Duration in milliseconds (if known) */
  durationMs?: number;
  /** Character count used for this request */
  characterCount: number;
}

/**
 * Error response from TTS API
 */
export interface TTSError {
  code: TTSErrorCode;
  message: string;
  retryable: boolean;
}

export type TTSErrorCode =
  | 'INVALID_REQUEST'
  | 'VOICE_NOT_FOUND'
  | 'RATE_LIMITED'
  | 'PROVIDER_ERROR'
  | 'CACHE_ERROR'
  | 'INTERNAL_ERROR';

// =============================================================================
// Voice Discovery
// =============================================================================

/**
 * Available voice from the TTS provider
 */
export interface AvailableVoice {
  voiceId: string;
  name: string;
  category: string;
  description?: string;
  previewUrl?: string;
  labels?: Record<string, string>;
}

/**
 * Response from listing available voices
 */
export interface ListVoicesResponse {
  voices: AvailableVoice[];
}

// =============================================================================
// Default Presets
// =============================================================================

export const DEFAULT_VOICE_PRESETS: Record<string, VoiceSettings> = {
  chronicle: { stability: 0.7, similarityBoost: 0.8 },
  dialogue_calm: { stability: 0.5, similarityBoost: 0.75 },
  dialogue_intense: { stability: 0.3, similarityBoost: 0.7 },
  trial_judgment: { stability: 0.8, similarityBoost: 0.9 },
  inner_voice: { stability: 0.6, similarityBoost: 0.85 },
};

// =============================================================================
// Client-Side TTS Service Interface
// =============================================================================

/**
 * State of the TTS playback queue
 */
export type TTSPlaybackState = 'idle' | 'playing' | 'paused' | 'loading';

/**
 * Item in the TTS playback queue
 */
export interface TTSQueueItem {
  /** Unique identifier for this queue item */
  id: string;
  /** The original TTS request */
  request: TTSRequest;
  /** Current state of this item */
  state: 'pending' | 'loading' | 'ready' | 'playing' | 'completed' | 'error';
  /** Error message if state is 'error' */
  error?: string;
  /** Preloaded audio blob (if preloaded) */
  audioBlob?: Blob;
}

/**
 * Queue status information
 */
export interface TTSQueueStatus {
  /** Current playback state */
  playbackState: TTSPlaybackState;
  /** Currently playing item (if any) */
  currentItem: TTSQueueItem | null;
  /** Items waiting to be played */
  pendingItems: TTSQueueItem[];
  /** Total items in queue (current + pending) */
  totalItems: number;
}

/**
 * Event callbacks for TTS service
 */
export interface TTSEventCallbacks {
  /** Called when an item starts playing */
  onStart?: (item: TTSQueueItem) => void;
  /** Called when an item finishes playing */
  onEnd?: (item: TTSQueueItem) => void;
  /** Called when an error occurs */
  onError?: (item: TTSQueueItem, error: Error) => void;
  /** Called when the queue changes */
  onQueueChange?: (status: TTSQueueStatus) => void;
}

/**
 * Client-side TTS service interface
 */
export interface ITTSService {
  // Queue Management
  /** Add text to the playback queue and optionally start playing */
  speak(request: TTSRequest): Promise<string>;
  /** Preload audio for later playback (returns queue item ID) */
  preload(request: TTSRequest): Promise<string>;
  /** Get current queue status */
  getQueueStatus(): TTSQueueStatus;
  /** Clear all pending items from the queue */
  clearQueue(): void;

  // Playback Controls
  /** Start or resume playback */
  play(): void;
  /** Pause current playback */
  pause(): void;
  /** Resume paused playback */
  resume(): void;
  /** Skip to the next item in queue */
  skip(): void;
  /** Stop playback and clear queue */
  stop(): void;

  // Volume Control
  /** Set playback volume (0-1) */
  setVolume(volume: number): void;
  /** Get current volume (0-1) */
  getVolume(): number;

  // Event Registration
  /** Set event callbacks */
  setCallbacks(callbacks: TTSEventCallbacks): void;

  // Lifecycle
  /** Clean up resources */
  dispose(): void;
}
