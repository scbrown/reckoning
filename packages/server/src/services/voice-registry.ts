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
// Party Member Voice Defaults
// =============================================================================

/**
 * Default voice IDs for party members (player, members, companions)
 * Uses a variety of voices to differentiate characters
 */
const PARTY_MEMBER_VOICE_POOL: string[] = [
  'TxGEqnHWrfWFTfGW9XjX', // Josh - deep, resonant male
  'EXAVITQu4vr4xnSDxMaL', // Bella - warm, friendly
  'MF3mGyEYCl7XYWbV9V6O', // Elli - soft, introspective
  'VR6AewLTigWG4xSOukaG', // Arnold - bold, commanding
  '21m00Tcm4TlvDq8ikWAM', // Rachel - calm, narrative
];

// =============================================================================
// Character Voice Mapping
// =============================================================================

/**
 * Maps character names to voice IDs for speaker-specific TTS
 */
export interface CharacterVoiceMapping {
  characterName: string;
  voiceId: string;
  voiceName?: string;
}

// Default character voice mappings (can be extended at runtime)
const DEFAULT_CHARACTER_VOICES: Record<string, string> = {
  // Example: 'Stiwi': 'iKa6KVAfDE7NBkGe3dJo'
};

// =============================================================================
// Voice Registry Class
// =============================================================================

/**
 * Manages voice mappings and provides voice configuration at runtime
 */
class VoiceRegistry {
  private mappings: Map<VoiceRole, VoiceMapping>;
  private characterVoices: Map<string, CharacterVoiceMapping>;

  constructor() {
    this.mappings = new Map();
    this.characterVoices = new Map();
    this.initializeDefaultMappings();
    this.initializeCharacterVoices();
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

  private initializeCharacterVoices(): void {
    for (const [name, voiceId] of Object.entries(DEFAULT_CHARACTER_VOICES)) {
      const voice = MOCK_VOICES.find((v) => v.voiceId === voiceId);
      const mapping: CharacterVoiceMapping = {
        characterName: name,
        voiceId,
      };
      if (voice?.name) {
        mapping.voiceName = voice.name;
      }
      this.characterVoices.set(name.toLowerCase(), mapping);
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

  // ===========================================================================
  // Character Voice Methods
  // ===========================================================================

  /**
   * Get voice ID for a character by name (case-insensitive)
   * @returns Voice ID if character has a mapped voice, undefined otherwise
   */
  getVoiceForCharacterName(characterName: string): string | undefined {
    const mapping = this.characterVoices.get(characterName.toLowerCase());
    return mapping?.voiceId;
  }

  /**
   * Get full character voice mapping by name (case-insensitive)
   */
  getCharacterVoiceMapping(characterName: string): CharacterVoiceMapping | undefined {
    return this.characterVoices.get(characterName.toLowerCase());
  }

  /**
   * Set or update a character's voice mapping
   */
  setCharacterVoice(
    characterName: string,
    voiceId: string,
    voiceName?: string
  ): CharacterVoiceMapping {
    const mapping: CharacterVoiceMapping = {
      characterName,
      voiceId,
    };
    if (voiceName) {
      mapping.voiceName = voiceName;
    }
    this.characterVoices.set(characterName.toLowerCase(), mapping);
    return mapping;
  }

  /**
   * Remove a character's voice mapping
   * @returns true if the mapping was removed, false if it didn't exist
   */
  removeCharacterVoice(characterName: string): boolean {
    return this.characterVoices.delete(characterName.toLowerCase());
  }

  /**
   * Get all character voice mappings
   */
  getAllCharacterVoices(): CharacterVoiceMapping[] {
    return Array.from(this.characterVoices.values());
  }

  /**
   * Reset all character voice mappings to defaults
   */
  resetCharacterVoicesToDefaults(): void {
    this.characterVoices.clear();
    this.initializeCharacterVoices();
  }
}

// Singleton instance
export const voiceRegistry = new VoiceRegistry();

// =============================================================================
// Party Member Voice Functions
// =============================================================================

/**
 * Get a default voice ID for a party member by index
 * Uses round-robin selection from the voice pool
 *
 * @param index - The party member's index (0-4)
 * @returns A voice ID from the pool
 */
export function getDefaultPartyVoice(index: number): string {
  // Pool is guaranteed to have at least one voice
  return PARTY_MEMBER_VOICE_POOL[index % PARTY_MEMBER_VOICE_POOL.length]!;
}

/**
 * Get voice ID for a character, with fallback to default pool
 *
 * @param voiceId - The character's assigned voice ID (optional)
 * @param partyIndex - The character's index in the party for default selection
 * @returns The voice ID to use
 */
export function getVoiceForCharacter(voiceId: string | undefined, partyIndex: number): string {
  if (voiceId) {
    return voiceId;
  }
  return getDefaultPartyVoice(partyIndex);
}

/**
 * Get the available party member voice pool
 * Useful for UI voice selection
 */
export function getPartyVoicePool(): string[] {
  return [...PARTY_MEMBER_VOICE_POOL];
}

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
