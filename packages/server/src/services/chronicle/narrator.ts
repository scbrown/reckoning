/**
 * Chronicle Narrator Service (Living Chronicle — Pillar 4)
 *
 * The biased historian that writes the adventure from a perspective
 * the player doesn't control. The narrator's bias colors how events
 * are recorded, and NPCs in the world hear about the player through
 * the Chronicle's lens.
 */

import type { CanonicalEvent, NarratorBias, CreateChronicleInput } from '@reckoning/shared';
import type { PlayerPatterns } from './types.js';

// =============================================================================
// Types
// =============================================================================

export interface NarratorConfig {
  /** Default bias if none specified */
  defaultBias?: NarratorBias;
  /** Whether bias can shift based on player behavior */
  dynamicBias?: boolean;
}

/** Result of narrating a sequence of events */
export interface NarrationResult {
  /** AI prompt for generating the chronicle entry */
  prompt: string;
  /** Selected bias for this narration */
  bias: NarratorBias;
  /** Estimated reputation impact (-1 to 1) */
  reputationImpact: number;
  /** Source event IDs covered */
  sourceEventIds: string[];
}

// =============================================================================
// Narrator Service
// =============================================================================

export class ChronicleNarrator {
  private defaultBias: NarratorBias;
  private dynamicBias: boolean;
  private narrationCount = 0;

  constructor(config?: NarratorConfig) {
    this.defaultBias = config?.defaultBias ?? 'detached';
    this.dynamicBias = config?.dynamicBias ?? true;
  }

  /**
   * Generate a narration for a sequence of events.
   *
   * Selects bias based on player behavior (if dynamic) and builds
   * an AI prompt for generating the biased chronicle entry.
   */
  narrate(
    events: CanonicalEvent[],
    patterns?: PlayerPatterns
  ): NarrationResult {
    if (events.length === 0) {
      return {
        prompt: '',
        bias: this.defaultBias,
        reputationImpact: 0,
        sourceEventIds: [],
      };
    }

    this.narrationCount++;

    const bias = this.dynamicBias && patterns
      ? this.selectBias(patterns)
      : this.defaultBias;

    const reputationImpact = this.estimateReputationImpact(events, bias);
    const sourceEventIds = events.map(e => e.id);
    const prompt = this.buildPrompt(events, bias);

    return {
      prompt,
      bias,
      reputationImpact,
      sourceEventIds,
    };
  }

  /**
   * Build a CreateChronicleInput from narration result + AI-generated content.
   */
  buildChronicleInput(
    gameId: string,
    events: CanonicalEvent[],
    narration: NarrationResult,
    content: string
  ): CreateChronicleInput {
    const turns = events.map(e => e.turn);
    return {
      gameId,
      turnStart: Math.min(...turns),
      turnEnd: Math.max(...turns),
      content,
      bias: narration.bias,
      sourceEventIds: narration.sourceEventIds,
      reputationImpact: narration.reputationImpact,
    };
  }

  /**
   * Select narrator bias based on player behavior patterns.
   *
   * The narrator's perspective shifts based on how the player acts:
   * - Merciful/helpful → sympathetic narrator
   * - Violent/deceptive → hostile narrator
   * - Balanced → detached narrator
   * - Contradictory → mocking narrator
   * - Strong negative trajectory → tragic narrator
   */
  private selectBias(patterns: PlayerPatterns): NarratorBias {
    const { ratios, socialApproach, dominantTraits } = patterns;

    // Check for contradictions (says one thing, does another)
    const hasContradictions = this.detectContradictions(patterns);
    if (hasContradictions) {
      return 'mocking';
    }

    // Strong negative patterns → tragic
    if (
      ratios.mercyVsViolence < -0.5 &&
      ratios.honestyVsDeception < -0.3 &&
      dominantTraits.includes('ruthless')
    ) {
      return 'tragic';
    }

    // Strong positive patterns → sympathetic
    if (
      ratios.mercyVsViolence > 0.4 &&
      (socialApproach === 'helpful' || socialApproach === 'diplomatic')
    ) {
      return 'sympathetic';
    }

    // Strong negative patterns → hostile
    if (
      ratios.mercyVsViolence < -0.3 ||
      (socialApproach === 'hostile' && ratios.honestyVsDeception < -0.2)
    ) {
      return 'hostile';
    }

    // Default: detached
    return 'detached';
  }

  /**
   * Detect contradictions in player behavior that would trigger
   * a mocking narrator. Contradictions occur when the player's
   * patterns conflict with each other.
   */
  private detectContradictions(patterns: PlayerPatterns): boolean {
    const { ratios, socialApproach, violenceInitiation } = patterns;

    // Merciful but initiates violence
    if (ratios.mercyVsViolence > 0.3 && violenceInitiation.initiatesViolence) {
      return true;
    }

    // Helpful social approach but deceptive
    if (socialApproach === 'helpful' && ratios.honestyVsDeception < -0.4) {
      return true;
    }

    // Diplomatic but high violence
    if (socialApproach === 'diplomatic' && ratios.mercyVsViolence < -0.4) {
      return true;
    }

    return false;
  }

  /**
   * Estimate how this chronicle entry will affect the player's
   * reputation among NPCs. Positive = better reputation, negative = worse.
   */
  private estimateReputationImpact(
    events: CanonicalEvent[],
    bias: NarratorBias
  ): number {
    // Count positive and negative actions
    let positiveCount = 0;
    let negativeCount = 0;

    for (const event of events) {
      if (!event.action) continue;

      if (POSITIVE_ACTIONS.has(event.action)) {
        positiveCount++;
      } else if (NEGATIVE_ACTIONS.has(event.action)) {
        negativeCount++;
      }
    }

    const total = positiveCount + negativeCount;
    if (total === 0) return 0;

    // Base impact from actions
    let impact = (positiveCount - negativeCount) / total;

    // Bias modifies the impact
    switch (bias) {
      case 'sympathetic':
        impact = impact * 0.5 + 0.2; // Softens negatives, boosts positives
        break;
      case 'hostile':
        impact = impact * 0.5 - 0.2; // Harshens positives, deepens negatives
        break;
      case 'mocking':
        impact *= 0.3; // Undermines both positive and negative
        break;
      case 'tragic':
        impact = impact * 0.7 - 0.1; // Slightly negative cast
        break;
      case 'detached':
        // No modification — reports as-is
        break;
    }

    return Math.max(-1, Math.min(1, impact));
  }

  /**
   * Build AI prompt for generating the chronicle entry.
   */
  private buildPrompt(events: CanonicalEvent[], bias: NarratorBias): string {
    const biasInstructions = BIAS_PROMPTS[bias];
    const eventSummaries = events
      .map(e => `- [Turn ${e.turn}] ${e.content}`)
      .join('\n');

    return `You are the Chronicle — a ${bias} narrator recording the adventures of a party.

${biasInstructions}

Write a chronicle entry covering these events. Write in third person, past tense,
as a historian recording what happened. Your bias should color the interpretation
but not fabricate events that didn't happen.

Events to chronicle:
${eventSummaries}

Write 3-6 sentences. The entry should feel like a passage from a history book
written by someone with a ${bias} perspective on the adventurers.`;
  }
}

// =============================================================================
// Constants
// =============================================================================

const POSITIVE_ACTIONS = new Set([
  'spare_enemy', 'show_mercy', 'forgive', 'heal_enemy', 'release_prisoner',
  'tell_truth', 'confess', 'reveal_secret', 'keep_promise',
  'help', 'befriend', 'persuade',
]);

const NEGATIVE_ACTIONS = new Set([
  'kill', 'execute', 'attack_first', 'threaten', 'torture',
  'lie', 'deceive', 'break_promise', 'withhold_info',
  'betray', 'insult', 'intimidate', 'bribe', 'steal',
]);

const BIAS_PROMPTS: Record<NarratorBias, string> = {
  sympathetic:
    'You see the best in these adventurers. Even their mistakes come from good intentions. ' +
    'Frame their actions generously. Violence was necessary. Deception was clever strategy. ' +
    'Find the humanity in their choices.',
  hostile:
    'You see through these adventurers\' pretensions. Their mercy is weakness, their bravery is recklessness. ' +
    'Frame their actions critically. Question their motives. Note the costs of their choices ' +
    'that they conveniently ignore.',
  detached:
    'You record facts without emotional investment. Note what happened, who was involved, ' +
    'and what the consequences were. Your tone is clinical and precise. ' +
    'Let the reader draw their own conclusions.',
  mocking:
    'You find these adventurers endlessly amusing. Their contradictions are hilarious. ' +
    'Their grand gestures are undercut by their petty failures. Use irony and wit. ' +
    'Note the gap between how they see themselves and what they actually did.',
  tragic:
    'You see these adventurers walking toward an inevitable end. Every triumph carries ' +
    'the seed of future sorrow. Frame events with a sense of doomed grandeur. ' +
    'Even their victories feel bittersweet, their bonds fragile.',
};
