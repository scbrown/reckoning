/**
 * Types for the ActionClassifier service
 */

import type { Action, ActionCategory } from '@reckoning/shared';

/**
 * Result of classifying narrative content into a standardized action
 */
export interface ClassificationResult {
  /** The classified action, or undefined if no match found */
  action: Action | undefined;
  /** The category of the action, if classified */
  category: ActionCategory | undefined;
  /** Confidence score from 0 to 1 */
  confidence: number;
  /** Whether AI fallback was used */
  usedAiFallback: boolean;
  /** Matched pattern (for debugging), if rule-based */
  matchedPattern?: string | undefined;
}

/**
 * Configuration for the ActionClassifier service
 */
export interface ActionClassifierConfig {
  /** Minimum confidence threshold for rule-based classification (default: 0.7) */
  minRuleConfidence?: number;
  /** Whether to use AI fallback when rules don't match (default: true) */
  enableAiFallback?: boolean;
  /** Timeout for AI fallback in milliseconds (default: 10000) */
  aiFallbackTimeout?: number;
}

/**
 * Internal pattern matcher result
 */
export interface PatternMatch {
  action: Action;
  confidence: number;
  pattern: string;
}
