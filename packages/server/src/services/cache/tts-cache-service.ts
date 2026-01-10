import { createHash } from 'crypto';
import Redis from 'ioredis';
import type { VoiceRole, VoiceSettings } from '@reckoning/shared';

/**
 * TTL policies for different content types (in seconds)
 */
const TTL_POLICIES = {
  narration: 7 * 24 * 60 * 60,     // 7 days
  static_dialogue: 30 * 24 * 60 * 60, // 30 days
} as const;

/**
 * Cache key parameters for generating a unique hash
 */
interface CacheKeyParams {
  text: string;
  voiceId: string;
  settings?: Partial<VoiceSettings>;
}

/**
 * Content type classification for TTL selection
 */
export type ContentType = 'narration' | 'static_dialogue';

/**
 * Redis-backed caching service for TTS audio data.
 * Implements cache-aside pattern with configurable TTL policies.
 */
export class TTSCacheService {
  private redis: Redis;
  private connected = false;

  constructor(redisUrl?: string) {
    const url = redisUrl || process.env.REDIS_URL || 'redis://localhost:6379';
    this.redis = new Redis(url, {
      lazyConnect: true,
      maxRetriesPerRequest: 3,
      retryStrategy(times) {
        if (times > 3) return null;
        return Math.min(times * 100, 3000);
      },
    });

    this.redis.on('connect', () => {
      this.connected = true;
      console.log('[TTSCache] Connected to Redis');
    });

    this.redis.on('error', (err) => {
      console.error('[TTSCache] Redis error:', err.message);
    });

    this.redis.on('close', () => {
      this.connected = false;
      console.log('[TTSCache] Redis connection closed');
    });
  }

  /**
   * Connect to Redis. Must be called before using cache operations.
   */
  async connect(): Promise<void> {
    if (this.connected) return;
    await this.redis.connect();
  }

  /**
   * Generate a cache key from TTS request parameters.
   * Uses SHA-256 hash of text + voiceId + normalized settings.
   */
  generateKey(params: CacheKeyParams): string {
    const normalized = {
      text: params.text,
      voiceId: params.voiceId,
      settings: params.settings ? this.normalizeSettings(params.settings) : {},
    };
    const hash = createHash('sha256')
      .update(JSON.stringify(normalized))
      .digest('hex');
    return `tts:${hash}`;
  }

  /**
   * Normalize settings to ensure consistent hashing
   */
  private normalizeSettings(settings: Partial<VoiceSettings>): Partial<VoiceSettings> {
    const normalized: Partial<VoiceSettings> = {};
    if (settings.stability !== undefined) {
      normalized.stability = settings.stability;
    }
    if (settings.similarityBoost !== undefined) {
      normalized.similarityBoost = settings.similarityBoost;
    }
    if (settings.style !== undefined) {
      normalized.style = settings.style;
    }
    if (settings.useSpeakerBoost !== undefined) {
      normalized.useSpeakerBoost = settings.useSpeakerBoost;
    }
    return normalized;
  }

  /**
   * Get cached audio data by key.
   * Returns null if not found or on error.
   */
  async get(key: string): Promise<Buffer | null> {
    try {
      const data = await this.redis.getBuffer(key);
      if (data) {
        console.log(`[TTSCache] Cache HIT: ${key.substring(0, 20)}...`);
        return data;
      }
      console.log(`[TTSCache] Cache MISS: ${key.substring(0, 20)}...`);
      return null;
    } catch (err) {
      console.error('[TTSCache] Get error:', err instanceof Error ? err.message : err);
      return null;
    }
  }

  /**
   * Store audio data in cache with specified TTL.
   */
  async set(key: string, buffer: Buffer, ttl: number): Promise<void> {
    try {
      await this.redis.setex(key, ttl, buffer);
      console.log(`[TTSCache] Stored: ${key.substring(0, 20)}... (TTL: ${ttl}s)`);
    } catch (err) {
      console.error('[TTSCache] Set error:', err instanceof Error ? err.message : err);
    }
  }

  /**
   * Get the appropriate TTL for a content type.
   */
  getTTL(contentType: ContentType): number {
    return TTL_POLICIES[contentType];
  }

  /**
   * Determine content type based on voice role.
   * Narration roles get shorter TTL, dialogue gets longer.
   */
  getContentTypeForRole(role?: VoiceRole): ContentType {
    if (role === 'narrator' || role === 'judge') {
      return 'narration';
    }
    return 'static_dialogue';
  }

  /**
   * Check if Redis is connected
   */
  isConnected(): boolean {
    return this.connected;
  }

  /**
   * Close the Redis connection
   */
  async close(): Promise<void> {
    await this.redis.quit();
  }
}
