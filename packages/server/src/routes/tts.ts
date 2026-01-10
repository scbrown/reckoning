import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import type { TTSError, TTSErrorCode } from '@reckoning/shared';

/**
 * Zod schema for TTS request validation
 */
const VoiceRoleSchema = z.enum(['narrator', 'judge', 'npc', 'inner_voice']);

const VoiceSettingsSchema = z.object({
  stability: z.number().min(0).max(1),
  similarityBoost: z.number().min(0).max(1),
  style: z.number().min(0).max(1).optional(),
  useSpeakerBoost: z.boolean().optional(),
});

const TTSRequestSchema = z.object({
  text: z.string().min(1).max(5000),
  role: VoiceRoleSchema.optional(),
  voiceId: z.string().optional(),
  preset: z.string().optional(),
  settings: VoiceSettingsSchema.partial().optional(),
  priority: z.enum(['high', 'normal', 'low']).optional(),
  cache: z.boolean().optional(),
}).refine(
  (data) => data.role !== undefined || data.voiceId !== undefined,
  { message: 'Either role or voiceId must be provided' }
);

type ValidatedTTSRequest = z.infer<typeof TTSRequestSchema>;

/**
 * Create a TTS error response
 */
function createTTSError(code: TTSErrorCode, message: string, retryable = false): TTSError {
  return { code, message, retryable };
}

/**
 * Check if ElevenLabs API key is configured
 */
function getApiKey(): string | null {
  return process.env.ELEVENLABS_API_KEY || null;
}

export async function ttsRoutes(fastify: FastifyInstance) {
  /**
   * POST /api/tts/speak
   * Generate speech from text using ElevenLabs
   * Returns streaming audio response
   */
  fastify.post('/speak', async (request: FastifyRequest, reply: FastifyReply) => {
    // Validate API key is configured
    const apiKey = getApiKey();
    if (!apiKey) {
      const error = createTTSError(
        'INTERNAL_ERROR',
        'TTS service not configured',
        false
      );
      return reply.status(503).send(error);
    }

    // Validate request body
    const parseResult = TTSRequestSchema.safeParse(request.body);
    if (!parseResult.success) {
      const error = createTTSError(
        'INVALID_REQUEST',
        parseResult.error.issues.map((issue) => issue.message).join(', '),
        false
      );
      return reply.status(400).send(error);
    }

    const ttsRequest: ValidatedTTSRequest = parseResult.data;

    // Log the request (without sensitive data)
    fastify.log.info({
      text_length: ttsRequest.text.length,
      role: ttsRequest.role,
      voiceId: ttsRequest.voiceId ? '[provided]' : undefined,
      priority: ttsRequest.priority,
    }, 'TTS speak request');

    // TODO: Implement actual ElevenLabs client integration
    // For now, return a placeholder response indicating the endpoint is ready
    // The actual streaming implementation will be added in a separate task

    // Set headers for streaming audio response
    reply.header('Content-Type', 'audio/mpeg');
    reply.header('Transfer-Encoding', 'chunked');
    reply.header('Cache-Control', ttsRequest.cache !== false ? 'public, max-age=3600' : 'no-cache');

    // Placeholder: Return 501 Not Implemented until ElevenLabs client is ready
    const error = createTTSError(
      'INTERNAL_ERROR',
      'ElevenLabs client not yet implemented',
      true
    );
    return reply.status(501).send(error);
  });

  /**
   * GET /api/tts/voices
   * List available voices from ElevenLabs
   */
  fastify.get('/voices', async (_request: FastifyRequest, reply: FastifyReply) => {
    const apiKey = getApiKey();
    if (!apiKey) {
      const error = createTTSError(
        'INTERNAL_ERROR',
        'TTS service not configured',
        false
      );
      return reply.status(503).send(error);
    }

    // TODO: Implement actual ElevenLabs voice listing
    const error = createTTSError(
      'INTERNAL_ERROR',
      'ElevenLabs client not yet implemented',
      true
    );
    return reply.status(501).send(error);
  });

  /**
   * GET /api/tts/health
   * TTS-specific health check
   */
  fastify.get('/health', async (_request: FastifyRequest, reply: FastifyReply) => {
    const apiKey = getApiKey();

    return reply.send({
      service: 'tts',
      configured: apiKey !== null,
      provider: 'elevenlabs',
      status: apiKey ? 'ready' : 'unconfigured',
    });
  });
}
