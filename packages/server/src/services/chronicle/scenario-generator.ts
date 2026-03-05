/**
 * Scenario Generator Service
 *
 * Takes detected player patterns and generates scenario directives that
 * guide AI content generation to challenge, confirm, or complicate
 * player tendencies. This is the "response layer" of the Pattern Engine.
 *
 * Design principles:
 * - Balance: Don't always subvert player patterns (prevents gaming the system)
 * - Variety: Rotate between challenge, confirmation, and complication strategies
 * - Transparency: Directives are visible to the DM for override
 */

import type { PlayerPatterns } from './types.js';

// =============================================================================
// Types
// =============================================================================

/** Strategy for how the scenario interacts with a player pattern */
export type ScenarioStrategy =
  | 'challenge'     // Subvert the pattern — force the player out of comfort zone
  | 'confirm'       // Reward the pattern — let the player's approach work
  | 'complicate'    // Neither subvert nor reward — add nuance/cost to the pattern
  | 'reveal';       // Show the consequences of the pattern to the player

/** Which behavioral axis the scenario targets */
export type PatternAxis =
  | 'mercy_violence'
  | 'honesty_deception'
  | 'social_approach'
  | 'violence_initiation'
  | 'exploration';

/** A single scenario directive for AI prompt injection */
export interface ScenarioDirective {
  /** Which pattern axis this targets */
  axis: PatternAxis;
  /** How the scenario interacts with the pattern */
  strategy: ScenarioStrategy;
  /** Human-readable instruction for the AI */
  instruction: string;
  /** The detected pattern value that triggered this directive */
  patternValue: string;
  /** Confidence that the player has this pattern (0-1) */
  confidence: number;
}

/** Complete scenario suggestion for a generation cycle */
export interface ScenarioSuggestion {
  /** Player being targeted */
  playerId: string;
  /** Game ID */
  gameId: string;
  /** Generated directives (typically 1-2 per generation) */
  directives: ScenarioDirective[];
  /** Formatted string for AI prompt injection */
  formatted: string;
  /** Whether the DM has overridden this suggestion */
  dmOverridden: boolean;
}

/** Configuration for the scenario generator */
export interface ScenarioGeneratorConfig {
  /** Probability of challenging vs confirming (0-1, default 0.4) */
  challengeRate?: number;
  /** Minimum events needed before generating scenarios */
  minEventsForScenarios?: number;
  /** Maximum directives per generation */
  maxDirectives?: number;
}

// =============================================================================
// Scenario Generator
// =============================================================================

export class ScenarioGenerator {
  private challengeRate: number;
  private minEvents: number;
  private maxDirectives: number;
  private generationCount = 0;

  constructor(config?: ScenarioGeneratorConfig) {
    this.challengeRate = config?.challengeRate ?? 0.4;
    this.minEvents = config?.minEventsForScenarios ?? 8;
    this.maxDirectives = config?.maxDirectives ?? 2;
  }

  /**
   * Generate scenario directives based on player patterns.
   *
   * Uses a balanced strategy selection to avoid always subverting
   * player patterns (which would make the system feel adversarial)
   * or always confirming them (which would be boring).
   */
  generateScenario(patterns: PlayerPatterns): ScenarioSuggestion {
    const directives: ScenarioDirective[] = [];

    if (patterns.totalEvents < this.minEvents) {
      return this.emptyResult(patterns);
    }

    // Analyze each axis for strong patterns worth targeting
    const candidates = this.findTargetablePatterns(patterns);

    // Pick the strongest patterns to target (up to maxDirectives)
    const selected = candidates
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, this.maxDirectives);

    for (const candidate of selected) {
      const strategy = this.selectStrategy(candidate.confidence);
      const instruction = this.buildInstruction(
        candidate.axis,
        strategy,
        candidate.patternValue,
        patterns
      );

      directives.push({
        axis: candidate.axis,
        strategy,
        instruction,
        patternValue: candidate.patternValue,
        confidence: candidate.confidence,
      });
    }

    this.generationCount++;

    const formatted = this.formatDirectives(directives);

    return {
      playerId: patterns.playerId,
      gameId: patterns.gameId,
      directives,
      formatted,
      dmOverridden: false,
    };
  }

  /**
   * Find patterns strong enough to target with scenarios.
   */
  private findTargetablePatterns(
    patterns: PlayerPatterns
  ): Array<{ axis: PatternAxis; patternValue: string; confidence: number }> {
    const candidates: Array<{
      axis: PatternAxis;
      patternValue: string;
      confidence: number;
    }> = [];

    const { ratios, socialApproach, violenceInitiation } = patterns;

    // Mercy/Violence axis — strong lean either way
    if (Math.abs(ratios.mercyVsViolence) > 0.3) {
      const lean = ratios.mercyVsViolence > 0 ? 'merciful' : 'violent';
      candidates.push({
        axis: 'mercy_violence',
        patternValue: lean,
        confidence: Math.abs(ratios.mercyVsViolence),
      });
    }

    // Honesty/Deception axis
    if (Math.abs(ratios.honestyVsDeception) > 0.3) {
      const lean = ratios.honestyVsDeception > 0 ? 'honest' : 'deceptive';
      candidates.push({
        axis: 'honesty_deception',
        patternValue: lean,
        confidence: Math.abs(ratios.honestyVsDeception),
      });
    }

    // Social approach — clear classification
    if (socialApproach !== 'balanced' && socialApproach !== 'minimal') {
      candidates.push({
        axis: 'social_approach',
        patternValue: socialApproach,
        confidence: 0.6, // Social approach threshold is already 40%
      });
    }

    // Violence initiation
    if (violenceInitiation.initiatesViolence) {
      candidates.push({
        axis: 'violence_initiation',
        patternValue: 'initiator',
        confidence: violenceInitiation.initiationRatio,
      });
    } else if (
      violenceInitiation.totalViolenceEvents >= 3 &&
      violenceInitiation.initiationRatio < 0.2
    ) {
      candidates.push({
        axis: 'violence_initiation',
        patternValue: 'defensive',
        confidence: 1 - violenceInitiation.initiationRatio,
      });
    }

    return candidates;
  }

  /**
   * Select a strategy using weighted randomization.
   *
   * Higher confidence patterns are more likely to be challenged,
   * because the player has a strong habit worth testing.
   * Lower confidence patterns are more likely to be confirmed,
   * because the player is still forming their approach.
   */
  private selectStrategy(confidence: number): ScenarioStrategy {
    // Use generation count for deterministic variety in tests,
    // but still weight by confidence
    const roll = this.pseudoRandom();

    // Adjust challenge probability based on pattern strength
    const adjustedChallengeRate = this.challengeRate * confidence;

    if (roll < adjustedChallengeRate) {
      return 'challenge';
    } else if (roll < adjustedChallengeRate + 0.25) {
      return 'complicate';
    } else if (roll < adjustedChallengeRate + 0.50) {
      return 'reveal';
    } else {
      return 'confirm';
    }
  }

  /**
   * Simple deterministic pseudo-random for strategy variety.
   * Not cryptographically random — just enough to rotate strategies.
   */
  private pseudoRandom(): number {
    // Use golden ratio to distribute evenly across [0,1)
    const phi = 0.6180339887;
    return (this.generationCount * phi) % 1;
  }

  /**
   * Build a human-readable instruction for the AI based on axis + strategy.
   */
  private buildInstruction(
    axis: PatternAxis,
    strategy: ScenarioStrategy,
    patternValue: string,
    patterns: PlayerPatterns
  ): string {
    const instructions = INSTRUCTION_TEMPLATES[axis];
    if (!instructions) {
      return `Consider the player's ${patternValue} tendencies in this scenario.`;
    }

    const template = instructions[strategy];
    if (!template) {
      return `Consider the player's ${patternValue} tendencies in this scenario.`;
    }

    // Template can be a function or string
    if (typeof template === 'function') {
      return template(patternValue, patterns);
    }
    return template.replace('{pattern}', patternValue);
  }

  /**
   * Format directives into a string for AI prompt injection.
   */
  private formatDirectives(directives: ScenarioDirective[]): string {
    if (directives.length === 0) {
      return '';
    }

    const lines = ['Scenario directives (based on player behavior patterns):'];
    for (const d of directives) {
      lines.push(`- [${d.strategy.toUpperCase()}] ${d.instruction}`);
    }
    lines.push(
      'Note: These directives should subtly influence the narrative, not override it. ' +
      'The player should not feel explicitly targeted.'
    );

    return lines.join('\n');
  }

  private emptyResult(patterns: PlayerPatterns): ScenarioSuggestion {
    return {
      playerId: patterns.playerId,
      gameId: patterns.gameId,
      directives: [],
      formatted: '',
      dmOverridden: false,
    };
  }
}

// =============================================================================
// Instruction Templates
// =============================================================================

type InstructionFn = (patternValue: string, patterns: PlayerPatterns) => string;
type TemplateMap = Partial<Record<ScenarioStrategy, string | InstructionFn>>;

const INSTRUCTION_TEMPLATES: Record<PatternAxis, TemplateMap> = {
  mercy_violence: {
    challenge: (pv) =>
      pv === 'merciful'
        ? 'Present a situation where showing mercy has dangerous consequences — the spared enemy returns stronger, or mercy is perceived as weakness by allies.'
        : 'Present a situation where violence fails or backfires — the enemy is sympathetic, combat triggers a worse threat, or an ally is horrified by the brutality.',
    confirm: (pv) =>
      pv === 'merciful'
        ? 'Allow a moment where mercy creates an unexpected alliance or reveals crucial information from a grateful NPC.'
        : 'Present a clear threat where decisive violence is the most effective solution, reinforcing the player\'s tactical instincts.',
    complicate: (pv) =>
      pv === 'merciful'
        ? 'Create a scenario where mercy and justice conflict — sparing someone means letting their victims go unavenged.'
        : 'Create a scenario where violence solves the immediate problem but creates a longer-term complication.',
    reveal: (pv) =>
      pv === 'merciful'
        ? 'Have an NPC comment on or react to the player\'s pattern of mercy — some admire it, others question whether it\'s naivete.'
        : 'Have an NPC or environment reflect the consequences of the player\'s violent approach — fear, respect, or growing notoriety.',
  },

  honesty_deception: {
    challenge: (pv) =>
      pv === 'honest'
        ? 'Create a scenario where the truth is genuinely dangerous — telling it would endanger an innocent or break a critical alliance.'
        : 'Create a scenario where a lie is discovered or nearly discovered, raising the stakes of continued deception.',
    confirm: (pv) =>
      pv === 'honest'
        ? 'Reward honesty — an NPC trusts the player because of their reputation for truth-telling, opening a new path.'
        : 'Let a clever deception succeed elegantly, gaining significant advantage without immediate consequences.',
    complicate: (pv) =>
      pv === 'honest'
        ? 'Present conflicting truths — two facts are both true but telling one undermines the other.'
        : 'A deception succeeds but requires maintaining an increasingly complex web of lies.',
    reveal: (pv) =>
      pv === 'honest'
        ? 'An NPC who was deceived by others seeks out the player specifically because of their honest reputation.'
        : 'Someone the player deceived earlier resurfaces, and the consequences of that lie finally arrive.',
  },

  social_approach: {
    challenge: (pv) =>
      `Present a social situation where the player's ${pv} approach is ineffective — the NPC is immune to or angered by ${pv} tactics.`,
    confirm: (pv) =>
      `Allow the player's ${pv} social approach to open a unique dialogue option or relationship path.`,
    complicate: (pv) =>
      `The player's ${pv} approach works on the target but is witnessed by someone who reacts negatively to it.`,
    reveal: (pv) =>
      `An NPC directly addresses the player's ${pv} reputation — they've heard stories about how the player operates socially.`,
  },

  violence_initiation: {
    challenge: (pv) =>
      pv === 'initiator'
        ? 'Present an encounter where striking first would be catastrophic — the "enemy" is an illusion, a test, or a potential ally in disguise.'
        : 'Present a time-critical threat where waiting to react means losing the initiative entirely.',
    confirm: (pv) =>
      pv === 'initiator'
        ? 'Present a genuine ambush scenario where the player\'s aggressive instincts give them a crucial advantage.'
        : 'Reward patience — the player who waits gains crucial information before the conflict begins.',
    complicate: (pv) =>
      pv === 'initiator'
        ? 'The player strikes first and succeeds, but discovers the target had information they needed alive.'
        : 'The player waits for the enemy to act first, but the enemy uses that time to set up a worse situation.',
    reveal: (pv) =>
      pv === 'initiator'
        ? 'NPCs react to the player\'s reputation as someone who strikes without warning — some fear them, others prepare ambushes.'
        : 'An ally comments on the player\'s patience in combat, noting it as either wisdom or hesitation.',
  },

  exploration: {
    challenge: 'Present a location where thorough exploration triggers a trap or unwanted attention.',
    confirm: 'Reward exploration with a hidden passage, secret item, or lore that provides tactical advantage.',
    complicate: 'Exploration reveals something the player wishes they hadn\'t found — dangerous knowledge or an unwanted obligation.',
    reveal: 'An NPC notes the player\'s thoroughness, either praising their attention to detail or warning that some things are better left undiscovered.',
  },
};
