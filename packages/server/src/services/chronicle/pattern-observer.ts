/**
 * PatternObserver Service
 *
 * Analyzes player behavior patterns from event history to support
 * emergence detection and AI context building.
 */

import type { EventRepository } from '../../db/repositories/event-repository.js';
import type { CanonicalEvent } from '@reckoning/shared/game';
import {
  VIOLENCE_ACTIONS,
  SOCIAL_ACTIONS,
  ACTION_TO_CATEGORY,
  type ActionCategory,
  type Action,
} from '@reckoning/shared/game';
import type {
  PlayerPatterns,
  BehavioralRatios,
  ViolenceInitiationResult,
  SocialApproach,
  PatternObserverConfig,
  PatternAnalysisOptions,
} from './types.js';

/** Honest actions (telling truth, keeping promises) */
const HONEST_ACTIONS: readonly string[] = ['tell_truth', 'confess', 'reveal_secret', 'keep_promise'];

/** Deceptive actions (lying, breaking promises) */
const DECEPTIVE_ACTIONS: readonly string[] = ['lie', 'deceive', 'break_promise', 'withhold_info'];

/** Helpful social actions */
const HELPFUL_SOCIAL_ACTIONS: readonly string[] = ['help', 'befriend', 'persuade'];

/** Harmful social actions */
const HARMFUL_SOCIAL_ACTIONS: readonly string[] = ['betray', 'insult', 'intimidate', 'bribe'];

/**
 * Service for analyzing player behavior patterns from event history.
 *
 * Uses structured event data to identify behavioral tendencies,
 * calculate ratios between opposing action types, and infer
 * personality traits from observed patterns.
 */
export class PatternObserver {
  private eventRepo: EventRepository;
  private minEventsForAnalysis: number;
  private minCategoryEventsForRatio: number;

  constructor(eventRepo: EventRepository, config?: PatternObserverConfig) {
    this.eventRepo = eventRepo;
    this.minEventsForAnalysis = config?.minEventsForAnalysis ?? 5;
    this.minCategoryEventsForRatio = config?.minCategoryEventsForRatio ?? 3;
  }

  /**
   * Get comprehensive behavior patterns for a player.
   *
   * Analyzes all structured events where the player was the actor
   * and computes category counts, ratios, and inferred traits.
   *
   * @param gameId - Game to analyze
   * @param playerId - Player ID to analyze
   * @param options - Optional analysis constraints
   * @returns Complete player pattern analysis
   */
  getPlayerPatterns(
    gameId: string,
    playerId: string,
    options?: PatternAnalysisOptions
  ): PlayerPatterns {
    // Get all events where player was the actor
    const events = this.eventRepo.findByActor(gameId, 'player', playerId, {
      limit: options?.limit ?? 1000,
    });

    // Filter by turn range if specified
    const filteredEvents = options?.turnRange
      ? events.filter(e => e.turn >= options.turnRange!.start && e.turn <= options.turnRange!.end)
      : events;

    // Count by category
    const categoryCounts = this.countByCategory(filteredEvents);

    // Calculate ratios
    const ratios = this.calculateAllRatios(categoryCounts, filteredEvents);

    // Analyze violence initiation
    const violenceInitiation = this.calculateViolenceInitiation(gameId, playerId, filteredEvents);

    // Classify social approach
    const socialApproach = this.classifySocialApproach(filteredEvents);

    // Infer dominant traits
    const dominantTraits = this.inferDominantTraits(categoryCounts, ratios, violenceInitiation, socialApproach);

    return {
      playerId,
      gameId,
      totalEvents: filteredEvents.length,
      categoryCounts,
      ratios,
      violenceInitiation,
      socialApproach,
      dominantTraits,
    };
  }

  /**
   * Calculate ratio between two action categories.
   *
   * Returns a value from -1 to 1:
   * - 1 means all actions are from category A
   * - -1 means all actions are from category B
   * - 0 means balanced between the two
   *
   * @param gameId - Game to analyze
   * @param playerId - Player to analyze
   * @param categoryA - First category (positive side)
   * @param categoryB - Second category (negative side)
   * @returns Ratio from -1 to 1, or null if insufficient data
   */
  calculateRatio(
    gameId: string,
    playerId: string,
    categoryA: ActionCategory,
    categoryB: ActionCategory
  ): number | null {
    const eventsA = this.eventRepo.findByActor(gameId, 'player', playerId, { limit: 1000 });
    const countA = eventsA.filter(e => this.isActionInCategory(e.action, categoryA)).length;
    const countB = eventsA.filter(e => this.isActionInCategory(e.action, categoryB)).length;

    const total = countA + countB;
    if (total < this.minCategoryEventsForRatio) {
      return null;
    }

    return (countA - countB) / total;
  }

  /**
   * Analyze whether player tends to initiate violence.
   *
   * Looks at the ratio of "attack_first" actions to total violence actions.
   * A high ratio indicates the player often starts conflicts.
   *
   * @param gameId - Game to analyze
   * @param playerId - Player to analyze
   * @param preloadedEvents - Optional pre-loaded events to avoid re-querying
   * @returns Violence initiation analysis
   */
  calculateViolenceInitiation(
    gameId: string,
    playerId: string,
    preloadedEvents?: CanonicalEvent[]
  ): ViolenceInitiationResult {
    const events = preloadedEvents ?? this.eventRepo.findByActor(gameId, 'player', playerId, { limit: 1000 });

    // Find all violence events
    const violenceEvents = events.filter(e =>
      e.action && (VIOLENCE_ACTIONS as readonly string[]).includes(e.action)
    );

    // Count attack_first specifically
    const attackFirstEvents = violenceEvents.filter(e => e.action === 'attack_first');

    const totalViolenceEvents = violenceEvents.length;
    const attackFirstCount = attackFirstEvents.length;

    // Calculate initiation ratio
    const initiationRatio = totalViolenceEvents > 0
      ? attackFirstCount / totalViolenceEvents
      : 0;

    // Player initiates violence if more than 40% of violence is attack_first
    const initiatesViolence = totalViolenceEvents >= this.minCategoryEventsForRatio && initiationRatio > 0.4;

    return {
      initiatesViolence,
      initiationRatio,
      totalViolenceEvents,
      attackFirstEvents: attackFirstCount,
    };
  }

  /**
   * Classify player's approach to social interactions.
   *
   * Analyzes the distribution of social action types to determine
   * if the player is primarily helpful, diplomatic, manipulative,
   * hostile, or balanced in their social interactions.
   *
   * @param events - Events to analyze (should be player's actions)
   * @returns Social approach classification
   */
  classifySocialApproach(events: CanonicalEvent[]): SocialApproach {
    // Filter to social actions only
    const socialEvents = events.filter(e =>
      e.action && (SOCIAL_ACTIONS as readonly string[]).includes(e.action)
    );

    if (socialEvents.length < this.minEventsForAnalysis) {
      return 'minimal';
    }

    // Count by type
    const helpCount = socialEvents.filter(e => e.action === 'help').length;
    const befriendCount = socialEvents.filter(e => e.action === 'befriend').length;
    const persuadeCount = socialEvents.filter(e => e.action === 'persuade').length;
    const betrayCount = socialEvents.filter(e => e.action === 'betray').length;
    const insultCount = socialEvents.filter(e => e.action === 'insult').length;
    const intimidateCount = socialEvents.filter(e => e.action === 'intimidate').length;
    const bribeCount = socialEvents.filter(e => e.action === 'bribe').length;

    // Calculate category scores (actions can belong to one category only)
    // helpful = genuinely helping others
    // diplomatic = building relationships through persuasion and friendship
    // manipulative = using coercion (bribery, intimidation)
    // hostile = antagonistic behavior
    const helpfulTotal = helpCount;
    const diplomaticTotal = persuadeCount + befriendCount;
    const manipulativeTotal = bribeCount + intimidateCount;
    const hostileTotal = betrayCount + insultCount;

    const total = socialEvents.length;
    const threshold = 0.4; // 40% of actions needed to classify

    // Find the dominant pattern (highest score wins)
    const scores: [SocialApproach, number][] = [
      ['helpful', helpfulTotal],
      ['diplomatic', diplomaticTotal],
      ['manipulative', manipulativeTotal],
      ['hostile', hostileTotal],
    ];

    // Sort by score descending
    scores.sort((a, b) => b[1] - a[1]);

    // The highest score must exceed threshold to classify
    // Array always has 4 elements, so index access is safe
    const topApproach = scores[0]![0];
    const topScore = scores[0]![1];
    if (topScore / total > threshold) {
      return topApproach;
    }

    // Check if there's a clear winner at the threshold
    if (topScore / total >= threshold && scores[1]![1] / total < threshold) {
      return topApproach;
    }

    return 'balanced';
  }

  /**
   * Infer dominant personality traits from behavior patterns.
   *
   * Combines analysis of ratios, violence initiation, and social approach
   * to suggest personality traits that describe the player's tendencies.
   *
   * @param categoryCounts - Counts by action category
   * @param ratios - Calculated behavioral ratios
   * @param violence - Violence initiation analysis
   * @param social - Social approach classification
   * @returns Array of inferred trait names
   */
  inferDominantTraits(
    categoryCounts: Record<ActionCategory, number>,
    ratios: BehavioralRatios,
    violence: ViolenceInitiationResult,
    social: SocialApproach
  ): string[] {
    const traits: string[] = [];

    // Mercy/Violence spectrum
    if (ratios.mercyVsViolence > 0.5) {
      traits.push('merciful');
    } else if (ratios.mercyVsViolence < -0.5) {
      traits.push('ruthless');
    }

    // Violence initiation
    if (violence.initiatesViolence) {
      traits.push('aggressive');
    } else if (violence.totalViolenceEvents > 0 && violence.initiationRatio < 0.2) {
      traits.push('defensive');
    }

    // Honesty spectrum
    if (ratios.honestyVsDeception > 0.5) {
      traits.push('honest');
    } else if (ratios.honestyVsDeception < -0.5) {
      traits.push('deceptive');
    }

    // Social approach traits
    switch (social) {
      case 'helpful':
        traits.push('altruistic');
        break;
      case 'diplomatic':
        traits.push('charismatic');
        break;
      case 'manipulative':
        traits.push('cunning');
        break;
      case 'hostile':
        traits.push('antagonistic');
        break;
    }

    // High exploration indicates curiosity
    const totalActions = Object.values(categoryCounts).reduce((a, b) => a + b, 0);
    if (totalActions > 0 && categoryCounts.exploration / totalActions > 0.3) {
      traits.push('curious');
    }

    // High character development actions indicate introspection
    if (totalActions > 0 && categoryCounts.character / totalActions > 0.2) {
      const prayMeditate = categoryCounts.character; // Simplified - would need more granular data
      if (prayMeditate > 0) {
        traits.push('contemplative');
      }
    }

    return traits;
  }

  /**
   * Count events by action category.
   */
  private countByCategory(events: CanonicalEvent[]): Record<ActionCategory, number> {
    const counts: Record<ActionCategory, number> = {
      mercy: 0,
      violence: 0,
      honesty: 0,
      social: 0,
      exploration: 0,
      character: 0,
    };

    for (const event of events) {
      if (event.action) {
        const category = ACTION_TO_CATEGORY[event.action as Action];
        if (category) {
          counts[category]++;
        }
      }
    }

    return counts;
  }

  /**
   * Calculate all behavioral ratios from events.
   */
  private calculateAllRatios(
    categoryCounts: Record<ActionCategory, number>,
    events: CanonicalEvent[]
  ): BehavioralRatios {
    // Mercy vs Violence
    const mercyViolenceTotal = categoryCounts.mercy + categoryCounts.violence;
    const mercyVsViolence = mercyViolenceTotal >= this.minCategoryEventsForRatio
      ? (categoryCounts.mercy - categoryCounts.violence) / mercyViolenceTotal
      : 0;

    // Honesty vs Deception (need to look at specific actions within honesty category)
    const honestCount = events.filter(e => e.action && HONEST_ACTIONS.includes(e.action)).length;
    const deceptiveCount = events.filter(e => e.action && DECEPTIVE_ACTIONS.includes(e.action)).length;
    const honestyTotal = honestCount + deceptiveCount;
    const honestyVsDeception = honestyTotal >= this.minCategoryEventsForRatio
      ? (honestCount - deceptiveCount) / honestyTotal
      : 0;

    // Helpful vs Harmful social
    const helpfulCount = events.filter(e => e.action && HELPFUL_SOCIAL_ACTIONS.includes(e.action)).length;
    const harmfulCount = events.filter(e => e.action && HARMFUL_SOCIAL_ACTIONS.includes(e.action)).length;
    const socialTotal = helpfulCount + harmfulCount;
    const helpfulVsHarmful = socialTotal >= this.minCategoryEventsForRatio
      ? (helpfulCount - harmfulCount) / socialTotal
      : 0;

    return {
      mercyVsViolence,
      honestyVsDeception,
      helpfulVsHarmful,
    };
  }

  /**
   * Check if an action belongs to a category.
   */
  private isActionInCategory(action: string | undefined, category: ActionCategory): boolean {
    if (!action) return false;
    return ACTION_TO_CATEGORY[action as Action] === category;
  }
}
