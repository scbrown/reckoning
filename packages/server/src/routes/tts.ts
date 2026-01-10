import { FastifyInstance } from 'fastify';
import type { TTSRequest, TTSResponse, TTSError, VoiceSettings } from '@reckoning/shared';
import { TTSCacheService } from '../services/cache/index.js';

const ELEVENLABS_API_URL = 'https://api.elevenlabs.io/v1';

interface ElevenLabsRequestBody {
  text: string;
  model_id: string;
  voice_settings?: {
    stability: number;
    similarity_boost: number;
    style?: number;
    use_speaker_boost?: boolean;
  };
}

export async function ttsRoutes(fastify: FastifyInstance) {
  const cacheService = new TTSCacheService();

  fastify.addHook('onReady', async () => {
    try {
      await cacheService.connect();
    } catch (err) {
      fastify.log.warn('Failed to connect to Redis cache, continuing without caching');
    }
  });

  fastify.addHook('onClose', async () => {
    await cacheService.close();
  });

  /**
   * POST /api/tts/speak
   * Generate speech from text with optional caching
   */
  fastify.post<{ Body: TTSRequest }>('/speak', async (request, reply) => {
    const { text, voiceId, role, settings, cache = true } = request.body;

    if (!text || text.trim().length === 0) {
      const error: TTSError = {
        code: 'INVALID_REQUEST',
        message: 'Text is required',
        retryable: false,
      };
      return reply.status(400).send(error);
    }

    const resolvedVoiceId = voiceId || getDefaultVoiceId(role);
    if (!resolvedVoiceId) {
      const error: TTSError = {
        code: 'VOICE_NOT_FOUND',
        message: 'No voice ID provided and no default for role',
        retryable: false,
      };
      return reply.status(400).send(error);
    }

    const cacheKeyParams = settings
      ? { text, voiceId: resolvedVoiceId, settings }
      : { text, voiceId: resolvedVoiceId };
    const cacheKey = cacheService.generateKey(cacheKeyParams);

    // Cache-aside: check cache first
    if (cache && cacheService.isConnected()) {
      const cached = await cacheService.get(cacheKey);
      if (cached) {
        const response: TTSResponse = {
          cached: true,
          contentType: 'audio/mpeg',
          characterCount: text.length,
        };
        reply.header('X-TTS-Response', JSON.stringify(response));
        reply.header('Content-Type', 'audio/mpeg');
        return reply.send(cached);
      }
    }

    // Cache miss: call ElevenLabs
    const apiKey = process.env.ELEVENLABS_API_KEY;
    if (!apiKey) {
      const error: TTSError = {
        code: 'INTERNAL_ERROR',
        message: 'ElevenLabs API key not configured',
        retryable: false,
      };
      return reply.status(500).send(error);
    }

    try {
      const audioBuffer = await fetchFromElevenLabs(resolvedVoiceId, text, settings, apiKey);

      // Store in cache (non-blocking)
      if (cache && cacheService.isConnected()) {
        const contentType = cacheService.getContentTypeForRole(role);
        const ttl = cacheService.getTTL(contentType);
        cacheService.set(cacheKey, audioBuffer, ttl).catch((err) => {
          fastify.log.error('Failed to cache TTS response:', err);
        });
      }

      const response: TTSResponse = {
        cached: false,
        contentType: 'audio/mpeg',
        characterCount: text.length,
      };

      reply.header('X-TTS-Response', JSON.stringify(response));
      reply.header('Content-Type', 'audio/mpeg');
      return reply.send(audioBuffer);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      fastify.log.error(`ElevenLabs API error: ${errorMessage}`);
      const error: TTSError = {
        code: 'PROVIDER_ERROR',
        message: errorMessage,
        retryable: true,
      };
      return reply.status(502).send(error);
    }
  });
}

/**
 * Fetch audio from ElevenLabs API and buffer the response
 */
async function fetchFromElevenLabs(
  voiceId: string,
  text: string,
  settings: Partial<VoiceSettings> | undefined,
  apiKey: string
): Promise<Buffer> {
  const url = `${ELEVENLABS_API_URL}/text-to-speech/${voiceId}`;

  const body: ElevenLabsRequestBody = {
    text,
    model_id: 'eleven_monolingual_v1',
  };

  if (settings) {
    const voiceSettings: ElevenLabsRequestBody['voice_settings'] = {
      stability: settings.stability ?? 0.5,
      similarity_boost: settings.similarityBoost ?? 0.75,
    };
    if (settings.style !== undefined) {
      voiceSettings.style = settings.style;
    }
    if (settings.useSpeakerBoost !== undefined) {
      voiceSettings.use_speaker_boost = settings.useSpeakerBoost;
    }
    body.voice_settings = voiceSettings;
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'xi-api-key': apiKey,
      'Content-Type': 'application/json',
      Accept: 'audio/mpeg',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`ElevenLabs API error: ${response.status} - ${errorText}`);
  }

  // Buffer the streamed response for both storage and forwarding
  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

/**
 * Get default voice ID for a role (placeholder mapping)
 */
function getDefaultVoiceId(role?: string): string | undefined {
  const roleVoiceMap: Record<string, string> = {
    narrator: process.env.TTS_VOICE_NARRATOR || '',
    judge: process.env.TTS_VOICE_JUDGE || '',
    npc: process.env.TTS_VOICE_NPC || '',
    inner_voice: process.env.TTS_VOICE_INNER || '',
  };
  return role ? roleVoiceMap[role] || undefined : undefined;
}
