/**
 * TTS Routes
 *
 * API endpoints for Text-to-Speech configuration and voice management.
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type {
  VoiceRole,
  UpdateVoiceMappingRequest,
  UpdateVoiceMappingResponse,
  VoiceConfiguration,
  ListVoicesResponse,
  VoiceMapping,
  VoiceSettings,
} from '@reckoning/shared';
import { getPreset, getPresetNames } from '@reckoning/shared';
import {
  voiceRegistry,
  getAvailableVoices,
  findVoiceById,
  ElevenLabsClient,
  ElevenLabsError,
  TTSCacheService,
} from '../services/index.js';

// =============================================================================
// TTS Speak Types
// =============================================================================

interface SpeakRequest {
  text: string;
  voiceId?: string;
  role?: VoiceRole;
  preset?: string;
}

// =============================================================================
// Service Instances (lazily initialized)
// =============================================================================

let elevenLabsClient: ElevenLabsClient | null = null;
let cacheService: TTSCacheService | null = null;

function getElevenLabsClient(): ElevenLabsClient {
  if (!elevenLabsClient) {
    const apiKey = process.env.ELEVENLABS_API_KEY;
    if (!apiKey) {
      throw new Error('ELEVENLABS_API_KEY environment variable is required');
    }
    elevenLabsClient = new ElevenLabsClient({ apiKey });
  }
  return elevenLabsClient;
}

async function getCacheService(): Promise<TTSCacheService> {
  if (!cacheService) {
    cacheService = new TTSCacheService();
    await cacheService.connect();
  }
  return cacheService;
}

// =============================================================================
// Route Schemas
// =============================================================================

const updateVoiceMappingSchema = {
  body: {
    type: 'object',
    required: ['role', 'voiceId'],
    properties: {
      role: {
        type: 'string',
        enum: ['narrator', 'judge', 'npc', 'inner_voice'],
      },
      voiceId: { type: 'string' },
    },
  },
};

// =============================================================================
// Routes
// =============================================================================

export async function ttsRoutes(fastify: FastifyInstance) {
  /**
   * GET /api/tts/voices
   * List all available voices from the TTS provider
   */
  fastify.get('/voices', async (_request: FastifyRequest, reply: FastifyReply) => {
    const voices = getAvailableVoices();
    const response: ListVoicesResponse = { voices };
    return reply.send(response);
  });

  /**
   * GET /api/tts/config
   * Get current voice configuration (mappings and presets)
   */
  fastify.get('/config', async (_request: FastifyRequest, reply: FastifyReply) => {
    const config: VoiceConfiguration = voiceRegistry.getConfiguration();
    return reply.send(config);
  });

  /**
   * GET /api/tts/config/mappings
   * Get current voice role mappings
   */
  fastify.get('/config/mappings', async (_request: FastifyRequest, reply: FastifyReply) => {
    const mappings: VoiceMapping[] = voiceRegistry.getAllMappings();
    return reply.send({ mappings });
  });

  /**
   * POST /api/tts/config/voice
   * Update voice mapping for a role at runtime
   */
  fastify.post<{ Body: UpdateVoiceMappingRequest }>(
    '/config/voice',
    { schema: updateVoiceMappingSchema },
    async (request: FastifyRequest<{ Body: UpdateVoiceMappingRequest }>, reply: FastifyReply) => {
      const { role, voiceId } = request.body;

      // Validate role
      const validRoles: VoiceRole[] = ['narrator', 'judge', 'npc', 'inner_voice'];
      if (!validRoles.includes(role)) {
        return reply.status(400).send({
          error: {
            code: 'INVALID_ROLE',
            message: `Invalid role: ${role}. Must be one of: ${validRoles.join(', ')}`,
          },
        });
      }

      // Look up voice name if available
      const voice = findVoiceById(voiceId);
      const voiceName = voice?.name;

      // Update the mapping
      const mapping = voiceRegistry.updateVoiceMapping(role, voiceId, voiceName);

      const response: UpdateVoiceMappingResponse = {
        success: true,
        mapping,
      };

      return reply.send(response);
    }
  );

  /**
   * POST /api/tts/config/reset
   * Reset all voice mappings to defaults
   */
  fastify.post('/config/reset', async (_request: FastifyRequest, reply: FastifyReply) => {
    voiceRegistry.resetAllToDefaults();
    return reply.send({
      success: true,
      message: 'All voice mappings reset to defaults',
      config: voiceRegistry.getConfiguration(),
    });
  });

  /**
   * GET /api/tts/presets
   * List all available voice presets
   */
  fastify.get('/presets', async (_request: FastifyRequest, reply: FastifyReply) => {
    const presetNames = getPresetNames();
    const presets = presetNames.map((name) => ({
      name,
      settings: getPreset(name),
    }));
    return reply.send({ presets });
  });

  /**
   * GET /api/tts/presets/:name
   * Get a specific voice preset by name
   */
  fastify.get<{ Params: { name: string } }>(
    '/presets/:name',
    async (request: FastifyRequest<{ Params: { name: string } }>, reply: FastifyReply) => {
      const { name } = request.params;
      const settings = getPreset(name);

      if (!settings) {
        return reply.status(404).send({
          error: {
            code: 'PRESET_NOT_FOUND',
            message: `Preset not found: ${name}`,
          },
        });
      }

      return reply.send({ name, settings });
    }
  );

  /**
   * GET /api/tts/role/:role
   * Get voice configuration for a specific role
   */
  fastify.get<{ Params: { role: VoiceRole } }>(
    '/role/:role',
    async (request: FastifyRequest<{ Params: { role: VoiceRole } }>, reply: FastifyReply) => {
      const { role } = request.params;

      const mapping = voiceRegistry.getMappingForRole(role);
      if (!mapping) {
        return reply.status(404).send({
          error: {
            code: 'ROLE_NOT_FOUND',
            message: `Role not found: ${role}`,
          },
        });
      }

      const preset = getPreset(mapping.defaultPreset);

      return reply.send({
        mapping,
        preset: {
          name: mapping.defaultPreset,
          settings: preset,
        },
      });
    }
  );

  /**
   * POST /api/tts/speak
   * Generate speech from text using ElevenLabs
   * Returns audio/mpeg stream
   */
  fastify.post<{ Body: SpeakRequest }>(
    '/speak',
    async (request: FastifyRequest<{ Body: SpeakRequest }>, reply: FastifyReply) => {
      const { text, voiceId, role, preset } = request.body;

      // Validate text
      if (!text || typeof text !== 'string' || text.trim().length === 0) {
        return reply.status(400).send({
          code: 'INVALID_REQUEST',
          message: 'Text is required and must be a non-empty string',
        });
      }

      // Resolve voiceId from role if not provided directly
      let resolvedVoiceId = voiceId;
      let voiceSettings: VoiceSettings | undefined;

      if (!resolvedVoiceId && role) {
        const mapping = voiceRegistry.getMappingForRole(role);
        if (mapping) {
          resolvedVoiceId = mapping.voiceId;
          voiceSettings = getPreset(preset || mapping.defaultPreset);
        }
      }

      if (!resolvedVoiceId) {
        // Default to narrator voice
        const narratorMapping = voiceRegistry.getMappingForRole('narrator');
        resolvedVoiceId = narratorMapping?.voiceId || '21m00Tcm4TlvDq8ikWAM';
        voiceSettings = getPreset(preset || narratorMapping?.defaultPreset || 'chronicle');
      }

      // If preset specified but no settings yet, get them
      if (preset && !voiceSettings) {
        voiceSettings = getPreset(preset);
      }

      try {
        // Try cache first (gracefully handle Redis unavailability)
        let cache: TTSCacheService | null = null;
        let cacheKey: string | null = null;
        try {
          cache = await getCacheService();
          cacheKey = cache.generateKey({
            text: text.trim(),
            voiceId: resolvedVoiceId,
            ...(voiceSettings && { settings: voiceSettings }),
          });

          const cachedAudio = await cache.get(cacheKey);
          if (cachedAudio) {
            return reply
              .header('Content-Type', 'audio/mpeg')
              .header('X-Cache', 'HIT')
              .send(cachedAudio);
          }
        } catch (cacheError) {
          // Redis unavailable - continue without caching
          cache = null;
          cacheKey = null;
          request.log.warn('Cache unavailable, proceeding without caching');
        }

        // Generate audio from ElevenLabs
        const client = getElevenLabsClient();
        const audioStream = await client.textToSpeechWithSettings(
          text.trim(),
          resolvedVoiceId,
          voiceSettings
        );

        // Collect chunks
        const chunks: Uint8Array[] = [];
        const reader = audioStream.getReader();

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          chunks.push(value);
        }

        const audioBuffer = Buffer.concat(chunks);

        // Try to cache the result (ignore failures)
        if (cache && cacheKey) {
          try {
            const contentType = cache.getContentTypeForRole(role);
            const ttl = cache.getTTL(contentType);
            await cache.set(cacheKey, audioBuffer, ttl);
          } catch {
            // Ignore cache write failures
          }
        }

        return reply
          .header('Content-Type', 'audio/mpeg')
          .header('X-Cache', cache ? 'MISS' : 'SKIP')
          .send(audioBuffer);

      } catch (error) {
        if (error instanceof ElevenLabsError) {
          const statusCode = error.statusCode >= 400 && error.statusCode < 600
            ? error.statusCode
            : 500;
          return reply.status(statusCode).send({
            code: 'TTS_ERROR',
            message: error.message,
            retryable: error.retryable,
          });
        }

        request.log.error(error, 'TTS speak error');
        return reply.status(500).send({
          code: 'INTERNAL_ERROR',
          message: 'Failed to generate speech',
        });
      }
    }
  );
}
