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
