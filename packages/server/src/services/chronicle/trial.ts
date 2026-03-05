/**
 * Trial Service (Pillar 4 — The Trial)
 *
 * Orchestrates the judgment system: assembles charges from events,
 * pairs with chronicle excerpts, gathers NPC testimony, and
 * classifies the player into a verdict archetype.
 *
 * The verdict is not guilty/innocent — it's "Who are you, really?"
 */

import type {
  CanonicalEvent,
  VerdictArchetype,
  TrialCharge,
  TrialVerdict,
} from '@reckoning/shared';
import type { PlayerPatterns, BehavioralRatios } from './types.js';

// =============================================================================
// Types
// =============================================================================

export interface TrialConfig {
  /** Minimum events to hold a trial */
  minEventsForTrial?: number;
  /** Maximum charges to present */
  maxCharges?: number;
}

/** Evidence summary for verdict classification */
export interface EvidenceSummary {
  /** Total events analyzed */
  totalEvents: number;
  /** Behavioral patterns */
  patterns: PlayerPatterns;
  /** Key events that define the character */
  keyEvents: CanonicalEvent[];
  /** Whether behavior changed over time */
  trajectory: 'improving' | 'declining' | 'stable' | 'erratic';
}

// =============================================================================
// Verdict Classifier
// =============================================================================

/**
 * Classifies player behavior into a verdict archetype based on
 * accumulated evidence from the game's event history.
 */
export class VerdictClassifier {
  private minEvents: number;
  private maxCharges: number;

  constructor(config?: TrialConfig) {
    this.minEvents = config?.minEventsForTrial ?? 15;
    this.maxCharges = config?.maxCharges ?? 8;
  }

  /**
   * Classify the player into a verdict archetype.
   *
   * Analyzes the full event history and behavioral patterns
   * to determine which archetype best describes the player's
   * journey through the game.
   */
  classify(
    patterns: PlayerPatterns,
    events: CanonicalEvent[]
  ): TrialVerdict {
    if (events.length < this.minEvents) {
      return {
        archetype: 'the_mystery',
        confidence: 0.2,
        narrative: 'Too little is known of this traveler to render judgment.',
        keyEvidence: [],
      };
    }

    // Analyze trajectory (did behavior change over time?)
    const trajectory = this.analyzeTrajectory(events);

    // Score each archetype
    const scores = this.scoreArchetypes(patterns, trajectory, events);

    // Sort by score descending
    const ranked = Object.entries(scores)
      .sort(([, a], [, b]) => b - a) as [VerdictArchetype, number][];

    const [primary, primaryScore] = ranked[0]!;
    const secondary = ranked.length > 1 ? ranked[1] : undefined;

    // Calculate confidence (gap between top two)
    const confidence = secondary
      ? Math.min(1.0, (primaryScore - secondary[1]) / primaryScore + 0.3)
      : 0.9;

    // Build narrative prompt
    const narrative = this.buildVerdictNarrative(primary, patterns, trajectory);

    // Find key evidence
    const keyEvidence = this.selectKeyEvidence(events, primary);

    const verdict: TrialVerdict = {
      archetype: primary,
      confidence: Math.round(confidence * 100) / 100,
      narrative,
      keyEvidence,
    };

    if (secondary && secondary[1] > primaryScore * 0.6) {
      verdict.secondaryArchetype = secondary[0];
    }

    return verdict;
  }

  /**
   * Select significant events to form charges for the trial.
   */
  selectCharges(
    events: CanonicalEvent[],
    chronicleExcerpts: Map<string, string>,
    playerMemories: Map<string, string>
  ): TrialCharge[] {
    // Select the most significant events (violence, mercy, deception, betrayal)
    const significant = events
      .filter(e => e.action && SIGNIFICANT_ACTIONS.has(e.action))
      .slice(-this.maxCharges); // Most recent significant events

    return significant.map(event => {
      const chronicle = chronicleExcerpts.get(event.id) ?? '';
      const memory = playerMemories.get(event.id);
      const hasConflict = memory !== undefined && memory !== chronicle;

      const charge: TrialCharge = {
        eventId: event.id,
        action: event.action ?? 'unknown',
        chronicleExcerpt: chronicle || event.content,
        hasConflict,
      };

      if (memory !== undefined) {
        charge.playerMemory = memory;
      }

      return charge;
    });
  }

  /**
   * Analyze whether player behavior improved, declined, or stayed stable.
   */
  private analyzeTrajectory(
    events: CanonicalEvent[]
  ): 'improving' | 'declining' | 'stable' | 'erratic' {
    if (events.length < 10) return 'stable';

    const midpoint = Math.floor(events.length / 2);
    const firstHalf = events.slice(0, midpoint);
    const secondHalf = events.slice(midpoint);

    const firstScore = this.calculateMoralScore(firstHalf);
    const secondScore = this.calculateMoralScore(secondHalf);

    const delta = secondScore - firstScore;

    if (Math.abs(delta) < 0.15) return 'stable';
    if (delta > 0.3) return 'improving';
    if (delta < -0.3) return 'declining';

    // Check for erratic behavior (high variance)
    const variance = this.calculateVariance(events);
    if (variance > 0.4) return 'erratic';

    return delta > 0 ? 'improving' : 'declining';
  }

  /**
   * Calculate a moral score for a set of events (-1 to 1).
   */
  private calculateMoralScore(events: CanonicalEvent[]): number {
    let positive = 0;
    let negative = 0;

    for (const event of events) {
      if (!event.action) continue;
      if (POSITIVE_ACTIONS.has(event.action)) positive++;
      if (NEGATIVE_ACTIONS.has(event.action)) negative++;
    }

    const total = positive + negative;
    if (total === 0) return 0;
    return (positive - negative) / total;
  }

  /**
   * Calculate behavioral variance (how inconsistent the player is).
   */
  private calculateVariance(events: CanonicalEvent[]): number {
    // Split into chunks and compare moral scores
    const chunkSize = Math.max(5, Math.floor(events.length / 4));
    const scores: number[] = [];

    for (let i = 0; i < events.length; i += chunkSize) {
      const chunk = events.slice(i, i + chunkSize);
      scores.push(this.calculateMoralScore(chunk));
    }

    if (scores.length < 2) return 0;

    const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
    const squaredDiffs = scores.map(s => (s - mean) ** 2);
    return Math.sqrt(squaredDiffs.reduce((a, b) => a + b, 0) / scores.length);
  }

  /**
   * Score each verdict archetype based on evidence.
   */
  private scoreArchetypes(
    patterns: PlayerPatterns,
    trajectory: string,
    events: CanonicalEvent[]
  ): Partial<Record<VerdictArchetype, number>> {
    const { ratios, socialApproach, violenceInitiation, dominantTraits } = patterns;
    const scores: Partial<Record<VerdictArchetype, number>> = {};

    // the_hero: Genuine good, even when hard
    scores.the_hero = this.scoreHero(ratios, socialApproach, dominantTraits);

    // the_well_meaning_fool: Good intentions, bad outcomes
    scores.the_well_meaning_fool = this.scoreFool(ratios, socialApproach, violenceInitiation);

    // the_pragmatist: Did what was necessary
    scores.the_pragmatist = this.scorePragmatist(ratios, socialApproach);

    // the_coward: Avoided hard choices
    scores.the_coward = this.scoreCoward(events, ratios);

    // the_hypocrite: Preached values, violated them
    scores.the_hypocrite = this.scoreHypocrite(ratios, socialApproach, violenceInitiation);

    // the_monster: Consistently cruel
    scores.the_monster = this.scoreMonster(ratios, socialApproach, violenceInitiation);

    // the_mystery: Contradictory, unreadable
    scores.the_mystery = this.scoreMystery(events);

    // the_growth: Started bad, became good (trajectory takes precedence)
    scores.the_growth = trajectory === 'improving' ? 0.85 : 0.1;

    // the_fall: Started good, became bad (trajectory takes precedence)
    scores.the_fall = trajectory === 'declining' ? 0.85 : 0.1;

    // the_mirror: Reflected whoever they faced
    scores.the_mirror = this.scoreMirror(events);

    return scores;
  }

  private scoreHero(ratios: BehavioralRatios, social: string, traits: string[]): number {
    let score = 0;
    if (ratios.mercyVsViolence > 0.3) score += 0.3;
    if (ratios.honestyVsDeception > 0.3) score += 0.2;
    if (social === 'helpful' || social === 'diplomatic') score += 0.2;
    if (traits.includes('merciful') && traits.includes('honest')) score += 0.2;
    if (traits.includes('altruistic')) score += 0.1;
    return score;
  }

  private scoreFool(ratios: BehavioralRatios, social: string, violence: { initiatesViolence: boolean }): number {
    let score = 0;
    // Good intentions (merciful, helpful) but with violence problems
    if (ratios.mercyVsViolence > 0 && ratios.mercyVsViolence < 0.4) score += 0.2;
    if (social === 'helpful') score += 0.2;
    if (violence.initiatesViolence) score += 0.2; // Rushes in despite good intentions
    if (ratios.honestyVsDeception > 0.2) score += 0.1;
    return score;
  }

  private scorePragmatist(ratios: BehavioralRatios, social: string): number {
    let score = 0;
    // Balanced approach — neither extreme
    if (Math.abs(ratios.mercyVsViolence) < 0.3) score += 0.3;
    if (Math.abs(ratios.honestyVsDeception) < 0.3) score += 0.2;
    if (social === 'balanced' || social === 'diplomatic') score += 0.2;
    return score;
  }

  private scoreCoward(events: CanonicalEvent[], ratios: BehavioralRatios): number {
    let score = 0;
    // Low engagement — few significant actions
    const significantActions = events.filter(e => e.action && SIGNIFICANT_ACTIONS.has(e.action));
    const ratio = significantActions.length / Math.max(1, events.length);
    if (ratio < 0.2) score += 0.4;

    // Avoids violence entirely
    if (ratios.mercyVsViolence > 0.7) score += 0.1; // Too merciful = avoidant?
    // High exploration but low social/combat
    return score;
  }

  private scoreHypocrite(ratios: BehavioralRatios, social: string, violence: { initiatesViolence: boolean }): number {
    let score = 0;
    // Contradictions between stated approach and actions
    if (social === 'helpful' && ratios.honestyVsDeception < -0.2) score += 0.3;
    if (social === 'diplomatic' && violence.initiatesViolence) score += 0.3;
    if (ratios.mercyVsViolence > 0.2 && violence.initiatesViolence) score += 0.2;
    return score;
  }

  private scoreMonster(ratios: BehavioralRatios, social: string, violence: { initiatesViolence: boolean }): number {
    let score = 0;
    if (ratios.mercyVsViolence < -0.5) score += 0.3;
    if (ratios.honestyVsDeception < -0.4) score += 0.2;
    if (social === 'hostile') score += 0.2;
    if (violence.initiatesViolence) score += 0.2;
    return score;
  }

  private scoreMystery(events: CanonicalEvent[]): number {
    // High variance = mysterious
    const variance = this.calculateVariance(events);
    return Math.min(0.8, variance * 1.5);
  }

  private scoreMirror(events: CanonicalEvent[]): number {
    // The mirror archetype: player's actions depend on who they're interacting with
    // Check if different target types get different treatment
    const actionsByTarget = new Map<string, string[]>();
    for (const event of events) {
      if (!event.action || !event.targetId) continue;
      const existing = actionsByTarget.get(event.targetId) ?? [];
      existing.push(event.action);
      actionsByTarget.set(event.targetId, existing);
    }

    if (actionsByTarget.size < 3) return 0.1;

    // Check if actions vary significantly by target
    let helpfulTargets = 0;
    let hostileTargets = 0;
    for (const [, actions] of actionsByTarget) {
      const hasPositive = actions.some(a => POSITIVE_ACTIONS.has(a));
      const hasNegative = actions.some(a => NEGATIVE_ACTIONS.has(a));
      if (hasPositive && !hasNegative) helpfulTargets++;
      if (hasNegative && !hasPositive) hostileTargets++;
    }

    // Mirror = treats different people very differently
    if (helpfulTargets > 0 && hostileTargets > 0) {
      return Math.min(0.7, (helpfulTargets + hostileTargets) / actionsByTarget.size);
    }

    return 0.1;
  }

  /**
   * Build a narrative explanation for the verdict.
   */
  private buildVerdictNarrative(
    archetype: VerdictArchetype,
    patterns: PlayerPatterns,
    trajectory: string
  ): string {
    const template = VERDICT_NARRATIVES[archetype];
    if (!template) return `The jury sees ${archetype.replace('the_', '').replace('_', ' ')}.`;
    return template(patterns, trajectory);
  }

  /**
   * Select key events that support the verdict.
   */
  private selectKeyEvidence(
    events: CanonicalEvent[],
    archetype: VerdictArchetype
  ): string[] {
    const evidence: string[] = [];
    const targetActions = ARCHETYPE_EVIDENCE[archetype] ?? [];

    for (const event of events) {
      if (!event.action) continue;
      if (targetActions.includes(event.action)) {
        evidence.push(`[Turn ${event.turn}] ${event.content}`);
        if (evidence.length >= 3) break;
      }
    }

    return evidence;
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

const SIGNIFICANT_ACTIONS = new Set([
  ...POSITIVE_ACTIONS,
  ...NEGATIVE_ACTIONS,
]);

const VERDICT_NARRATIVES: Record<VerdictArchetype, (p: PlayerPatterns, t: string) => string> = {
  the_hero: (p) =>
    `When tested, this one chose mercy over expedience, truth over comfort. ` +
    `Their ${p.dominantTraits.join(' and ')} nature was not performance but conviction. ` +
    `The world is better for their passing through it.`,

  the_well_meaning_fool: () =>
    `Good intentions paved every road they walked, yet the destinations were rarely what they planned. ` +
    `They meant well — truly, sincerely — but meaning well and doing well are different things entirely.`,

  the_pragmatist: () =>
    `Neither saint nor sinner, they did what the situation demanded. ` +
    `Mercy when it served, violence when it was needed. ` +
    `Judge them not by their heart but by their results.`,

  the_coward: () =>
    `The hardest choices went unmade. When the moment demanded action — ` +
    `a stand, a sacrifice, a difficult truth — they found a reason to look away. ` +
    `The road not taken tells their story more than the road they walked.`,

  the_hypocrite: (p) =>
    `They spoke of ${p.dominantTraits[0] ?? 'virtue'} while their hands told a different story. ` +
    `The gap between their words and their deeds widened with every turn, ` +
    `until the mask became more recognizable than the face beneath.`,

  the_monster: () =>
    `There is a consistency to cruelty that almost resembles integrity. ` +
    `They never pretended to be kind. Every hand extended was a fist. ` +
    `The world learned to fear them, and perhaps that was the point.`,

  the_mystery: () =>
    `Who were they? The evidence contradicts itself. Merciful one moment, ` +
    `brutal the next. Honest with some, deceptive with others. ` +
    `Perhaps they didn't know themselves. Perhaps that was the truest thing about them.`,

  the_growth: () =>
    `They arrived as one person and left as another. The early chapters ` +
    `of this chronicle make for uncomfortable reading, but the later ones... ` +
    `the later ones suggest that change, real change, is possible.`,

  the_fall: () =>
    `They began with such promise. The early chapters of this chronicle ` +
    `shine with genuine heroism. But somewhere along the way, something broke. ` +
    `The ending does not match the beginning, and that is the tragedy.`,

  the_mirror: () =>
    `They became whoever they faced. Kind to the kind, cruel to the cruel, ` +
    `honest with the honest, deceptive with the deceptive. ` +
    `A mirror has no character of its own — only reflections.`,
};

const ARCHETYPE_EVIDENCE: Record<VerdictArchetype, string[]> = {
  the_hero: ['spare_enemy', 'show_mercy', 'help', 'tell_truth', 'keep_promise'],
  the_well_meaning_fool: ['help', 'befriend', 'attack_first', 'spare_enemy'],
  the_pragmatist: ['kill', 'spare_enemy', 'persuade', 'help'],
  the_coward: ['rest', 'meditate', 'examine', 'search'],
  the_hypocrite: ['help', 'betray', 'tell_truth', 'lie'],
  the_monster: ['kill', 'execute', 'torture', 'threaten', 'attack_first'],
  the_mystery: ['spare_enemy', 'kill', 'help', 'betray'],
  the_growth: ['kill', 'spare_enemy', 'help', 'show_mercy'],
  the_fall: ['help', 'spare_enemy', 'kill', 'betray'],
  the_mirror: ['help', 'betray', 'spare_enemy', 'attack_first'],
};
