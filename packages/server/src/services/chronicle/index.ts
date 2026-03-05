/**
 * Chronicle Services
 *
 * Services for analyzing game event history and player behavior patterns.
 */

export { PatternObserver } from './pattern-observer.js';
export { ScenarioGenerator } from './scenario-generator.js';
export type {
  PlayerPatterns,
  BehavioralRatios,
  ViolenceInitiationResult,
  SocialApproach,
  PatternObserverConfig,
  PatternAnalysisOptions,
} from './types.js';
export type {
  ScenarioDirective,
  ScenarioSuggestion,
  ScenarioStrategy,
  PatternAxis,
  ScenarioGeneratorConfig,
} from './scenario-generator.js';
export {
  ChronicleNarrator,
  type NarratorConfig,
  type NarrationResult,
} from './narrator.js';
export {
  VerdictClassifier,
  type TrialConfig,
  type EvidenceSummary,
} from './trial.js';
