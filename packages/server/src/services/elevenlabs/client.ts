/**
 * ElevenLabs API Client
 *
 * Wrapper for ElevenLabs text-to-speech API with streaming support,
 * voice discovery, and automatic retries with exponential backoff.
 */

import type { VoiceSettings, AvailableVoice } from '@reckoning/shared';
import type {
  ElevenLabsConfig,
  ElevenLabsVoiceSettings,
  ElevenLabsVoicesResponse,
  ElevenLabsTTSRequest,
  TextToSpeechOptions,
  ElevenLabsOutputFormat,
  ElevenLabsErrorResponse,
} from './types.js';
import { ElevenLabsError } from './types.js';

const DEFAULT_BASE_URL = 'https://api.elevenlabs.io/v1';
const DEFAULT_MODEL = 'eleven_monolingual_v1';
const DEFAULT_OUTPUT_FORMAT: ElevenLabsOutputFormat = 'mp3_44100_128';
const DEFAULT_TIMEOUT = 30000;
const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_INITIAL_RETRY_DELAY = 1000;

/**
 * ElevenLabs API client for text-to-speech generation
 */
export class ElevenLabsClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly defaultModel: string;
  private readonly defaultOutputFormat: ElevenLabsOutputFormat;
  private readonly timeout: number;
  private readonly maxRetries: number;
  private readonly initialRetryDelay: number;

  constructor(config: ElevenLabsConfig) {
    if (!config.apiKey) {
      throw new Error('ElevenLabs API key is required');
    }

    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl ?? DEFAULT_BASE_URL;
    this.defaultModel = config.defaultModel ?? DEFAULT_MODEL;
    this.defaultOutputFormat = config.defaultOutputFormat ?? DEFAULT_OUTPUT_FORMAT;
    this.timeout = config.timeout ?? DEFAULT_TIMEOUT;
    this.maxRetries = config.maxRetries ?? DEFAULT_MAX_RETRIES;
    this.initialRetryDelay = config.initialRetryDelay ?? DEFAULT_INITIAL_RETRY_DELAY;
  }

  /**
   * Convert shared VoiceSettings to ElevenLabs API format
   */
  private toApiVoiceSettings(settings: Partial<VoiceSettings>): ElevenLabsVoiceSettings {
    return {
      stability: settings.stability ?? 0.5,
      similarity_boost: settings.similarityBoost ?? 0.75,
      ...(settings.style !== undefined && { style: settings.style }),
      ...(settings.useSpeakerBoost !== undefined && { use_speaker_boost: settings.useSpeakerBoost }),
    };
  }

  /**
   * Determine if an error is retryable based on status code
   */
  private isRetryable(statusCode: number): boolean {
    // Retry on rate limits, server errors, and gateway issues
    return statusCode === 429 || (statusCode >= 500 && statusCode < 600);
  }

  /**
   * Sleep for a specified duration
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Calculate delay for exponential backoff with jitter
   */
  private getRetryDelay(attempt: number): number {
    const baseDelay = this.initialRetryDelay * Math.pow(2, attempt);
    // Add jitter: 0-25% of base delay
    const jitter = baseDelay * Math.random() * 0.25;
    return baseDelay + jitter;
  }

  /**
   * Make an API request with automatic retries
   */
  private async fetchWithRetry(
    url: string,
    options: RequestInit,
    retriesLeft: number = this.maxRetries
  ): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const statusCode = response.status;
        const isRetryable = this.isRetryable(statusCode);

        // Try to parse error response
        let errorResponse: ElevenLabsErrorResponse | undefined;
        try {
          const parsed = await response.json();
          if (parsed && typeof parsed === 'object') {
            errorResponse = parsed as ElevenLabsErrorResponse;
          }
        } catch {
          // Response may not be JSON
        }

        const errorMessage =
          errorResponse?.detail?.message ||
          `ElevenLabs API error: ${response.statusText}`;

        // Retry if possible
        if (isRetryable && retriesLeft > 0) {
          const attempt = this.maxRetries - retriesLeft;
          const delay = this.getRetryDelay(attempt);
          await this.sleep(delay);
          return this.fetchWithRetry(url, options, retriesLeft - 1);
        }

        throw new ElevenLabsError(errorMessage, statusCode, isRetryable, errorResponse);
      }

      return response;
    } catch (error) {
      clearTimeout(timeoutId);

      // Handle abort (timeout)
      if (error instanceof Error && error.name === 'AbortError') {
        if (retriesLeft > 0) {
          const attempt = this.maxRetries - retriesLeft;
          const delay = this.getRetryDelay(attempt);
          await this.sleep(delay);
          return this.fetchWithRetry(url, options, retriesLeft - 1);
        }
        throw new ElevenLabsError('Request timeout', 408, true);
      }

      // Re-throw ElevenLabsError as-is
      if (error instanceof ElevenLabsError) {
        throw error;
      }

      // Network errors are retryable
      if (error instanceof Error) {
        if (retriesLeft > 0) {
          const attempt = this.maxRetries - retriesLeft;
          const delay = this.getRetryDelay(attempt);
          await this.sleep(delay);
          return this.fetchWithRetry(url, options, retriesLeft - 1);
        }
        throw new ElevenLabsError(`Network error: ${error.message}`, 0, true);
      }

      throw error;
    }
  }

  /**
   * Generate speech from text
   *
   * @param text - The text to convert to speech
   * @param voiceId - The voice ID to use
   * @param options - Optional settings for generation
   * @returns ReadableStream of audio data
   */
  async textToSpeech(
    text: string,
    voiceId: string,
    options?: TextToSpeechOptions
  ): Promise<ReadableStream<Uint8Array>> {
    if (!text || text.trim().length === 0) {
      throw new ElevenLabsError('Text is required', 400, false);
    }

    if (!voiceId) {
      throw new ElevenLabsError('Voice ID is required', 400, false);
    }

    const outputFormat = options?.outputFormat ?? this.defaultOutputFormat;
    const endpoint = options?.stream !== false ? 'stream' : '';
    const url = `${this.baseUrl}/text-to-speech/${voiceId}${endpoint ? '/stream' : ''}?output_format=${outputFormat}`;

    const body: ElevenLabsTTSRequest = {
      text,
      model_id: options?.modelId ?? this.defaultModel,
    };

    if (options?.voiceSettings) {
      body.voice_settings = options.voiceSettings;
    }

    const response = await this.fetchWithRetry(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'xi-api-key': this.apiKey,
        Accept: 'audio/mpeg',
      },
      body: JSON.stringify(body),
    });

    if (!response.body) {
      throw new ElevenLabsError('No response body', 500, true);
    }

    return response.body;
  }

  /**
   * Generate speech from text with shared VoiceSettings format
   *
   * @param text - The text to convert to speech
   * @param voiceId - The voice ID to use
   * @param settings - Voice settings in shared format (camelCase)
   * @returns ReadableStream of audio data
   */
  async textToSpeechWithSettings(
    text: string,
    voiceId: string,
    settings?: Partial<VoiceSettings>
  ): Promise<ReadableStream<Uint8Array>> {
    const options: TextToSpeechOptions = {};
    if (settings) {
      options.voiceSettings = this.toApiVoiceSettings(settings);
    }
    return this.textToSpeech(text, voiceId, options);
  }

  /**
   * Get list of available voices
   *
   * @returns Array of available voices
   */
  async getVoices(): Promise<AvailableVoice[]> {
    const url = `${this.baseUrl}/voices`;

    const response = await this.fetchWithRetry(url, {
      method: 'GET',
      headers: {
        'xi-api-key': this.apiKey,
        Accept: 'application/json',
      },
    });

    const data = (await response.json()) as ElevenLabsVoicesResponse;

    // Map to shared AvailableVoice format
    return data.voices.map((voice): AvailableVoice => {
      const result: AvailableVoice = {
        voiceId: voice.voice_id,
        name: voice.name,
        category: voice.category,
      };

      // Only include optional properties if they have values
      if (voice.description !== undefined) {
        result.description = voice.description;
      }
      if (voice.preview_url !== undefined) {
        result.previewUrl = voice.preview_url;
      }
      if (voice.labels !== undefined) {
        result.labels = voice.labels;
      }

      return result;
    });
  }

  /**
   * Check if the API key is valid by making a test request
   *
   * @returns true if the API key is valid
   */
  async validateApiKey(): Promise<boolean> {
    try {
      await this.getVoices();
      return true;
    } catch (error) {
      if (error instanceof ElevenLabsError && error.statusCode === 401) {
        return false;
      }
      throw error;
    }
  }
}
