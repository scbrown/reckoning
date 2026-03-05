/**
 * Memory Journal Service (Unreliable Self — Pillar 1)
 *
 * Generates character-biased journal entries from canonical events.
 * The character's memory is distorted by their psychology — they may
 * remember being brave when they hesitated, or justified when cruel.
 *
 * Distortion selection is driven by:
 * 1. Character traits (from EvolutionService)
 * 2. Player behavior patterns (from PatternObserver)
 * 3. The nature of the event itself
 */

import type { CanonicalEvent, DistortionType, CreateMemoryInput } from '@reckoning/shared';
import type { PlayerPatterns } from '../chronicle/types.js';

// =============================================================================
// Types
// =============================================================================

export interface MemoryJournalConfig {
  /** Probability of no distortion (faithful memory), default 0.2 */
  faithfulRate?: number;
  /** Minimum distortion strength when distortion is applied, default 0.3 */
  minDistortionStrength?: number;
}

/** Character psychology context for distortion selection */
export interface CharacterPsychology {
  traits: string[];
  patterns?: PlayerPatterns;
}

/** Result of analyzing an event for memory distortion */
export interface DistortionAnalysis {
  distortionType: DistortionType;
  distortionStrength: number;
  influencingTraits: string[];
  journalPrompt: string;
}

// =============================================================================
// Distortion Engine
// =============================================================================

/**
 * The DistortionEngine determines HOW a character misremembers an event
 * based on their psychology. It doesn't generate the text — it provides
 * the distortion type and an AI prompt for generating the biased memory.
 */
export class DistortionEngine {
  private faithfulRate: number;
  private minStrength: number;
  private analysisCount = 0;

  constructor(config?: MemoryJournalConfig) {
    this.faithfulRate = config?.faithfulRate ?? 0.2;
    this.minStrength = config?.minDistortionStrength ?? 0.3;
  }

  /**
   * Analyze an event and determine the appropriate distortion.
   *
   * Returns a distortion analysis with the type, strength, and an AI prompt
   * that can be used to generate the biased journal entry.
   */
  analyzeEvent(
    event: CanonicalEvent,
    psychology: CharacterPsychology
  ): DistortionAnalysis {
    this.analysisCount++;

    // Determine if this memory should be faithful
    if (this.shouldBeFaithful(event, psychology)) {
      return {
        distortionType: 'faithful',
        distortionStrength: 0,
        influencingTraits: [],
        journalPrompt: this.buildFaithfulPrompt(event),
      };
    }

    // Select distortion based on event + psychology
    const candidates = this.findDistortionCandidates(event, psychology);

    // Pick the best candidate
    const best = candidates.sort((a, b) => b.weight - a.weight)[0];
    if (!best) {
      return {
        distortionType: 'faithful',
        distortionStrength: 0,
        influencingTraits: [],
        journalPrompt: this.buildFaithfulPrompt(event),
      };
    }

    const strength = this.calculateStrength(best.weight, psychology);

    return {
      distortionType: best.type,
      distortionStrength: strength,
      influencingTraits: best.traits,
      journalPrompt: this.buildDistortedPrompt(event, best.type, strength),
    };
  }

  /**
   * Build a CreateMemoryInput from the analysis (without AI-generated content).
   * The caller must provide the content after AI generation.
   */
  buildMemoryInput(
    event: CanonicalEvent,
    analysis: DistortionAnalysis,
    content: string
  ): CreateMemoryInput {
    const input: CreateMemoryInput = {
      gameId: event.gameId,
      characterId: event.actorId ?? 'unknown',
      sourceEventId: event.id,
      turn: event.turn,
      content,
      distortionType: analysis.distortionType,
      distortionStrength: analysis.distortionStrength,
    };

    if (analysis.influencingTraits.length > 0) {
      input.influencingTraits = analysis.influencingTraits;
    }

    return input;
  }

  /**
   * Determine if memory should be faithful (undistorted).
   */
  private shouldBeFaithful(
    event: CanonicalEvent,
    psychology: CharacterPsychology
  ): boolean {
    // Use pseudo-random for variety
    const roll = this.pseudoRandom();
    if (roll < this.faithfulRate) {
      return true;
    }

    // Mundane events (exploration, character) are more likely faithful
    if (event.action && ['enter_location', 'examine', 'search', 'rest', 'meditate', 'level_up'].includes(event.action)) {
      return roll < this.faithfulRate + 0.3;
    }

    // Characters with 'honest' trait have higher faithful rate
    if (psychology.traits.includes('honest')) {
      return roll < this.faithfulRate + 0.15;
    }

    return false;
  }

  /**
   * Find candidate distortions based on event type + character psychology.
   */
  private findDistortionCandidates(
    event: CanonicalEvent,
    psychology: CharacterPsychology
  ): Array<{ type: DistortionType; weight: number; traits: string[] }> {
    const candidates: Array<{ type: DistortionType; weight: number; traits: string[] }> = [];
    const { traits, patterns } = psychology;

    // Violence events
    if (event.action && ['kill', 'execute', 'attack_first', 'threaten', 'torture'].includes(event.action)) {
      // Player initiated violence → guilt_suppression
      if (event.action === 'attack_first') {
        candidates.push({
          type: 'guilt_suppression',
          weight: 0.8,
          traits: traits.filter(t => ['aggressive', 'ruthless'].includes(t)),
        });
      }

      // Violence with witnesses → self_aggrandizing or guilt_suppression
      if (traits.includes('aggressive') || traits.includes('ruthless')) {
        candidates.push({
          type: 'self_aggrandizing',
          weight: 0.6,
          traits: ['aggressive', 'ruthless'].filter(t => traits.includes(t)),
        });
      }

      // Traumatic violence → trauma_blocking
      if (event.action === 'torture' || event.action === 'execute') {
        candidates.push({
          type: 'trauma_blocking',
          weight: 0.5,
          traits: traits.filter(t => ['merciful', 'contemplative'].includes(t)),
        });
      }
    }

    // Mercy events — self_aggrandizing or hero_framing
    if (event.action && ['spare_enemy', 'show_mercy', 'heal_enemy', 'release_prisoner'].includes(event.action)) {
      candidates.push({
        type: 'self_aggrandizing',
        weight: 0.5,
        traits: traits.filter(t => ['merciful', 'altruistic'].includes(t)),
      });
      candidates.push({
        type: 'hero_framing',
        weight: 0.4,
        traits: traits.filter(t => ['merciful', 'altruistic'].includes(t)),
      });
    }

    // Social events
    if (event.action && ['betray', 'deceive', 'lie', 'break_promise'].includes(event.action)) {
      // Betrayal → villain_projecting ("they made me do it")
      candidates.push({
        type: 'villain_projecting',
        weight: 0.7,
        traits: traits.filter(t => ['deceptive', 'cunning', 'manipulative'].includes(t)),
      });
      candidates.push({
        type: 'guilt_suppression',
        weight: 0.5,
        traits: traits.filter(t => ['deceptive', 'cunning'].includes(t)),
      });
    }

    // Help events → hero_framing or self_aggrandizing
    if (event.action && ['help', 'befriend', 'persuade'].includes(event.action)) {
      candidates.push({
        type: 'hero_framing',
        weight: 0.4,
        traits: traits.filter(t => ['altruistic', 'charismatic'].includes(t)),
      });
    }

    // Ability/item events → false_competence
    if (event.action && ['use_ability', 'acquire_item', 'unlock'].includes(event.action)) {
      candidates.push({
        type: 'false_competence',
        weight: 0.3,
        traits: traits.filter(t => ['curious', 'contemplative'].includes(t)),
      });
    }

    // Boost weights based on pattern strength
    if (patterns) {
      for (const candidate of candidates) {
        // Deceptive characters distort more
        if (patterns.ratios.honestyVsDeception < -0.3) {
          if (['guilt_suppression', 'villain_projecting', 'false_competence'].includes(candidate.type)) {
            candidate.weight *= 1.3;
          }
        }
        // Violent characters aggrandize more
        if (patterns.ratios.mercyVsViolence < -0.3) {
          if (['self_aggrandizing', 'guilt_suppression'].includes(candidate.type)) {
            candidate.weight *= 1.2;
          }
        }
      }
    }

    return candidates;
  }

  /**
   * Calculate distortion strength based on candidate weight + psychology.
   */
  private calculateStrength(weight: number, psychology: CharacterPsychology): number {
    let strength = weight * 0.7; // Base: scaled from weight

    // Deceptive characters distort more strongly
    if (psychology.patterns && psychology.patterns.ratios.honestyVsDeception < -0.5) {
      strength += 0.15;
    }

    // Clamp to [minStrength, 1.0]
    return Math.max(this.minStrength, Math.min(1.0, strength));
  }

  /**
   * Build AI prompt for a faithful (undistorted) memory.
   */
  private buildFaithfulPrompt(event: CanonicalEvent): string {
    return `Write a short first-person journal entry from the character's perspective about this event. ` +
      `Be accurate to what happened. Keep it 2-4 sentences.\n\n` +
      `Event: ${event.content}`;
  }

  /**
   * Build AI prompt for a distorted memory.
   */
  private buildDistortedPrompt(
    event: CanonicalEvent,
    distortionType: DistortionType,
    strength: number
  ): string {
    const instructions = DISTORTION_PROMPTS[distortionType];
    const strengthDesc = strength > 0.7 ? 'heavily' : strength > 0.4 ? 'moderately' : 'subtly';

    return `Write a short first-person journal entry from the character's perspective about this event. ` +
      `The character's memory is ${strengthDesc} distorted.\n\n` +
      `Distortion type: ${distortionType}\n` +
      `${instructions}\n\n` +
      `What actually happened: ${event.content}\n\n` +
      `Write 2-4 sentences as if the character genuinely believes their distorted version. ` +
      `Don't make the distortion obvious — it should feel like a natural journal entry.`;
  }

  private pseudoRandom(): number {
    const phi = 0.6180339887;
    return (this.analysisCount * phi) % 1;
  }
}

// =============================================================================
// Distortion Prompt Templates
// =============================================================================

const DISTORTION_PROMPTS: Record<DistortionType, string> = {
  self_aggrandizing:
    'The character remembers themselves as more capable, brave, or important than they actually were. ' +
    'They were the hero of the moment, even if they barely contributed.',
  guilt_suppression:
    'The character minimizes or reframes their role in something morally questionable. ' +
    '"They attacked first" when you did. "I had no choice" when you did.',
  trauma_blocking:
    'The character\'s memory has gaps or vagueness around traumatic details. ' +
    'They remember the before and after but the actual event is fuzzy or absent.',
  hero_framing:
    'The character remembers saving the day or helping others, even when others saved themselves ' +
    'or the character\'s contribution was minimal.',
  villain_projecting:
    'The character projects their own negative actions onto others. ' +
    '"They betrayed me" when you betrayed them. The other person is the villain.',
  false_competence:
    'The character remembers solving problems through skill when it was actually luck, ' +
    'others\' help, or circumstances beyond their control.',
  faithful:
    'Write an accurate memory of the event.',
};
