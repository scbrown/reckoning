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
} from '@reckoning/shared';
import { getPreset, getPresetNames } from '@reckoning/shared';
import {
  voiceRegistry,
  getAvailableVoices,
  findVoiceById,
} from '../services/index.js';

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
}
