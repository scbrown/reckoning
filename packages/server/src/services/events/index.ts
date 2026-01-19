/**
 * Events Services
 *
 * Services for structured event handling and analysis.
 */

export {
  EventBuilder,
  type WitnessRef,
  type TargetRef,
  type ActorRef,
  type AIStructuredMetadata,
  type BuildFromGenerationParams,
  type StructuredEventData,
} from './event-builder.js';

export { ActionClassifier } from './action-classifier.js';
export type {
  ClassificationResult,
  ActionClassifierConfig,
  PatternMatch,
} from './types.js';

export {
  EmergenceObserver,
  type EmergenceType,
  type EmergenceOpportunity,
  type EmergenceDetectionResult,
  type EmergenceThresholds,
  type EmergenceObserverConfig,
  type EmergenceEvent,
  type EmergenceEventEmitter,
} from './emergence-observer.js';

export {
  EmergenceNotificationService,
  type EmergenceNotificationServiceConfig,
} from './emergence-notification-service.js';
