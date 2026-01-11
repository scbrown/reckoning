/**
 * Voice Registry Service
 *
 * Maps voice roles to ElevenLabs voice IDs and manages runtime voice configuration.
 */

import type {
  VoiceRole,
  VoiceMapping,
  VoiceConfiguration,
  AvailableVoice,
  PresetName,
} from '@reckoning/shared';
import { DEFAULT_VOICE_PRESETS } from '@reckoning/shared';

// =============================================================================
// Default Voice Mappings
// =============================================================================

// Default ElevenLabs voice IDs (can be overridden by environment variables)
const DEFAULT_VOICE_IDS: Record<VoiceRole, string> = {
  narrator: process.env.VOICE_ID_NARRATOR || 'EC45bTQTXqWg2aqlp4ch', // Custom Narrator
  judge: process.env.VOICE_ID_JUDGE || 'AZnzlk1XvdvUeBnXmlld', // Domi
  npc: process.env.VOICE_ID_NPC || 'EXAVITQu4vr4xnSDxMaL', // Bella
  inner_voice: process.env.VOICE_ID_INNER_VOICE || 'MF3mGyEYCl7XYWbV9V6O', // Elli
};

const DEFAULT_VOICE_NAMES: Record<VoiceRole, string> = {
  narrator: 'Narrator',
  judge: 'Domi',
  npc: 'Bella',
  inner_voice: 'Elli',
};

const DEFAULT_PRESETS_FOR_ROLE: Record<VoiceRole, PresetName> = {
  narrator: 'chronicle',
  judge: 'trial_judgment',
  npc: 'dialogue_calm',
  inner_voice: 'inner_voice',
};

// =============================================================================
// Voice Registry Class
// =============================================================================

/**
 * Manages voice mappings and provides voice configuration at runtime
 */
class VoiceRegistry {
  private mappings: Map<VoiceRole, VoiceMapping>;

  constructor() {
    this.mappings = new Map();
    this.initializeDefaultMappings();
  }

  private initializeDefaultMappings(): void {
    const roles: VoiceRole[] = ['narrator', 'judge', 'npc', 'inner_voice'];

    for (const role of roles) {
      this.mappings.set(role, {
        role,
        voiceId: DEFAULT_VOICE_IDS[role],
        voiceName: DEFAULT_VOICE_NAMES[role],
        defaultPreset: DEFAULT_PRESETS_FOR_ROLE[role],
      });
    }
  }

  /**
   * Get the voice ID for a given role
   */
  getVoiceForRole(role: VoiceRole): string {
    const mapping = this.mappings.get(role);
    if (!mapping) {
      throw new Error(`Unknown voice role: ${role}`);
    }
    return mapping.voiceId;
  }

  /**
   * Get the full mapping for a role
   */
  getMappingForRole(role: VoiceRole): VoiceMapping | undefined {
    return this.mappings.get(role);
  }

  /**
   * Get all current mappings
   */
  getAllMappings(): VoiceMapping[] {
    return Array.from(this.mappings.values());
  }

  /**
   * Update the voice mapping for a role at runtime
   */
  updateVoiceMapping(
    role: VoiceRole,
    voiceId: string,
    voiceName?: string
  ): VoiceMapping {
    const existing = this.mappings.get(role);
    const mapping: VoiceMapping = {
      role,
      voiceId,
      voiceName: voiceName || existing?.voiceName || 'Custom',
      defaultPreset: existing?.defaultPreset || DEFAULT_PRESETS_FOR_ROLE[role],
    };

    this.mappings.set(role, mapping);
    return mapping;
  }

  /**
   * Reset a role's mapping to default
   */
  resetRoleToDefault(role: VoiceRole): VoiceMapping {
    const mapping: VoiceMapping = {
      role,
      voiceId: DEFAULT_VOICE_IDS[role],
      voiceName: DEFAULT_VOICE_NAMES[role],
      defaultPreset: DEFAULT_PRESETS_FOR_ROLE[role],
    };

    this.mappings.set(role, mapping);
    return mapping;
  }

  /**
   * Reset all mappings to defaults
   */
  resetAllToDefaults(): void {
    this.initializeDefaultMappings();
  }

  /**
   * Get the full voice configuration
   */
  getConfiguration(): VoiceConfiguration {
    return {
      mappings: this.getAllMappings(),
      presets: DEFAULT_VOICE_PRESETS,
    };
  }
}

// Singleton instance
export const voiceRegistry = new VoiceRegistry();

// =============================================================================
// Mock Voice List (for development without ElevenLabs API)
// =============================================================================

const MOCK_VOICES: AvailableVoice[] = [
  {
    voiceId: 'EC45bTQTXqWg2aqlp4ch',
    name: 'Narrator',
    category: 'cloned',
    description: 'Custom narrator voice for main storytelling',
  },
  {
    voiceId: 'iKa6KVAfDE7NBkGe3dJo',
    name: 'Stiwi',
    category: 'cloned',
    description: 'Voice for the character Stiwi',
  },
  {
    voiceId: '21m00Tcm4TlvDq8ikWAM',
    name: 'Rachel',
    category: 'premade',
    description: 'Calm, narrative voice suitable for storytelling',
  },
  {
    voiceId: 'AZnzlk1XvdvUeBnXmlld',
    name: 'Domi',
    category: 'premade',
    description: 'Strong, authoritative voice',
  },
  {
    voiceId: 'EXAVITQu4vr4xnSDxMaL',
    name: 'Bella',
    category: 'premade',
    description: 'Warm, friendly voice for characters',
  },
  {
    voiceId: 'MF3mGyEYCl7XYWbV9V6O',
    name: 'Elli',
    category: 'premade',
    description: 'Soft, introspective voice',
  },
  {
    voiceId: 'TxGEqnHWrfWFTfGW9XjX',
    name: 'Josh',
    category: 'premade',
    description: 'Deep, resonant male voice',
  },
  {
    voiceId: 'VR6AewLTigWG4xSOukaG',
    name: 'Arnold',
    category: 'premade',
    description: 'Bold, commanding voice',
  },
];

/**
 * Get available voices (mock implementation for development)
 * TODO: Replace with actual ElevenLabs API call
 */
export function getAvailableVoices(): AvailableVoice[] {
  return MOCK_VOICES;
}

/**
 * Find a voice by ID
 */
export function findVoiceById(voiceId: string): AvailableVoice | undefined {
  return MOCK_VOICES.find((v) => v.voiceId === voiceId);
}
