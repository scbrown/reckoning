/**
 * ElevenLabs API Types
 *
 * TypeScript types for ElevenLabs API requests and responses.
 * These are internal to the server and represent the actual API format.
 */

// =============================================================================
// Voice Settings (API Format - snake_case)
// =============================================================================

/**
 * Voice settings in ElevenLabs API format
 */
export interface ElevenLabsVoiceSettings {
  stability: number;
  similarity_boost: number;
  style?: number;
  use_speaker_boost?: boolean;
}

// =============================================================================
// Text-to-Speech Request
// =============================================================================

/**
 * Request body for text-to-speech API
 */
export interface ElevenLabsTTSRequest {
  text: string;
  model_id?: string;
  voice_settings?: ElevenLabsVoiceSettings;
  output_format?: ElevenLabsOutputFormat;
}

/**
 * Supported audio output formats
 */
export type ElevenLabsOutputFormat =
  | 'mp3_44100_128'
  | 'mp3_44100_192'
  | 'pcm_16000'
  | 'pcm_22050'
  | 'pcm_24000'
  | 'pcm_44100'
  | 'ulaw_8000';

// =============================================================================
// Voices API Response
// =============================================================================

/**
 * Voice object from ElevenLabs API
 */
export interface ElevenLabsVoice {
  voice_id: string;
  name: string;
  category: string;
  description?: string;
  preview_url?: string;
  labels?: Record<string, string>;
  fine_tuning?: {
    is_allowed_to_fine_tune: boolean;
    finetuning_state: string;
    verification_failures: string[];
    verification_attempts_count: number;
    manual_verification_requested: boolean;
  };
  settings?: ElevenLabsVoiceSettings;
  sharing?: {
    status: string;
    history_item_sample_id?: string;
    original_voice_id?: string;
    public_owner_id?: string;
    liked_by_count?: number;
    cloned_by_count?: number;
  };
  high_quality_base_model_ids?: string[];
  safety_control?: string;
}

/**
 * Response from /v1/voices endpoint
 */
export interface ElevenLabsVoicesResponse {
  voices: ElevenLabsVoice[];
}

// =============================================================================
// Error Response
// =============================================================================

/**
 * Error response from ElevenLabs API
 */
export interface ElevenLabsErrorResponse {
  detail?: {
    status: string;
    message: string;
    loc?: string[];
    type?: string;
  };
}

// =============================================================================
// Client Configuration
// =============================================================================

/**
 * Configuration for ElevenLabs client
 */
export interface ElevenLabsConfig {
  /** API key for authentication */
  apiKey: string;
  /** Base URL for API (defaults to https://api.elevenlabs.io/v1) */
  baseUrl?: string;
  /** Default model ID (defaults to eleven_monolingual_v1) */
  defaultModel?: string;
  /** Default output format (defaults to mp3_44100_128) */
  defaultOutputFormat?: ElevenLabsOutputFormat;
  /** Request timeout in ms (defaults to 30000) */
  timeout?: number;
  /** Maximum retry attempts (defaults to 3) */
  maxRetries?: number;
  /** Initial retry delay in ms (defaults to 1000) */
  initialRetryDelay?: number;
}

/**
 * Options for textToSpeech method
 */
export interface TextToSpeechOptions {
  /** Model ID to use */
  modelId?: string;
  /** Voice settings */
  voiceSettings?: ElevenLabsVoiceSettings;
  /** Output format */
  outputFormat?: ElevenLabsOutputFormat;
  /** Whether to stream the response */
  stream?: boolean;
}

// =============================================================================
// Client Errors
// =============================================================================

/**
 * Custom error class for ElevenLabs API errors
 */
export class ElevenLabsError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly retryable: boolean,
    public readonly response?: ElevenLabsErrorResponse
  ) {
    super(message);
    this.name = 'ElevenLabsError';
  }
}
