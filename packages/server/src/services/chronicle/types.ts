/**
 * Chronicle Service Types
 *
 * Types for pattern observation and behavior analysis from event history.
 */

import type { ActionCategory } from '@reckoning/shared/game';

/**
 * Summary of player behavior patterns across all categories
 */
export interface PlayerPatterns {
  /** Player ID being analyzed */
  playerId: string;
  /** Game ID */
  gameId: string;
  /** Total events analyzed */
  totalEvents: number;
  /** Counts by action category */
  categoryCounts: Record<ActionCategory, number>;
  /** Calculated behavioral ratios */
  ratios: BehavioralRatios;
  /** Violence initiation analysis */
  violenceInitiation: ViolenceInitiationResult;
  /** Social approach classification */
  socialApproach: SocialApproach;
  /** Inferred dominant personality traits */
  dominantTraits: string[];
}

/**
 * Behavioral ratios between opposing tendencies
 */
export interface BehavioralRatios {
  /** Mercy actions vs violence actions (1 = all mercy, -1 = all violence, 0 = balanced) */
  mercyVsViolence: number;
  /** Honest actions vs deceptive actions (1 = all honest, -1 = all deceptive, 0 = balanced) */
  honestyVsDeception: number;
  /** Helpful social actions vs harmful ones (1 = all helpful, -1 = all harmful, 0 = balanced) */
  helpfulVsHarmful: number;
}

/**
 * Result of violence initiation analysis
 */
export interface ViolenceInitiationResult {
  /** Whether player tends to initiate violence */
  initiatesViolence: boolean;
  /** Ratio of attack_first actions to total violence actions */
  initiationRatio: number;
  /** Total violence events */
  totalViolenceEvents: number;
  /** Events where player attacked first */
  attackFirstEvents: number;
}

/**
 * Classification of player's social approach
 */
export type SocialApproach =
  | 'helpful'      // Primarily helps others
  | 'diplomatic'   // Uses persuasion and befriending
  | 'manipulative' // Uses bribery, intimidation
  | 'hostile'      // Primarily insults, betrays
  | 'balanced'     // No dominant pattern
  | 'minimal';     // Too few social events to classify

/**
 * Configuration for PatternObserver
 */
export interface PatternObserverConfig {
  /** Minimum events needed to make reliable inferences */
  minEventsForAnalysis?: number;
  /** Minimum category events to include in ratio calculations */
  minCategoryEventsForRatio?: number;
}

/**
 * Options for pattern analysis
 */
export interface PatternAnalysisOptions {
  /** Limit analysis to specific turn range */
  turnRange?: {
    start: number;
    end: number;
  };
  /** Maximum events to analyze */
  limit?: number;
}
