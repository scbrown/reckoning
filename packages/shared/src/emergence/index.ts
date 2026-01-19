/**
 * Emergence Types
 *
 * Shared types for narrative emergence detection and notifications.
 * Used by EmergenceObserver on the server and notification UI on the client.
 */

/**
 * Types of narrative emergence that can be detected
 */
export type EmergenceType = 'villain' | 'ally';

/**
 * Entity types that can undergo emergence
 */
export type EmergenceEntityType = 'player' | 'character' | 'npc' | 'location' | 'item';

/**
 * An entity reference in the emergence system
 */
export interface EmergenceEntity {
  type: EmergenceEntityType;
  id: string;
}

/**
 * A contributing factor to emergence detection
 */
export interface EmergenceContributingFactor {
  dimension: string;
  value: number;
  threshold: number;
}

/**
 * An opportunity for narrative emergence
 */
export interface EmergenceOpportunity {
  /** Type of emergence detected */
  type: EmergenceType;
  /** The entity that could emerge in this role */
  entity: EmergenceEntity;
  /** Confidence level (0.0 to 1.0) */
  confidence: number;
  /** Human-readable reason for this detection */
  reason: string;
  /** The event that triggered this detection */
  triggeringEventId: string;
  /** Relationship dimensions that contributed to this detection */
  contributingFactors: EmergenceContributingFactor[];
}

/**
 * Result of emergence detection for an event
 */
export interface EmergenceDetectionResult {
  /** Event that was analyzed */
  eventId: string;
  /** All emergence opportunities detected */
  opportunities: EmergenceOpportunity[];
  /** ISO timestamp of detection */
  timestamp: string;
}

/**
 * Status of a DM's acknowledgment of an emergence notification
 */
export type EmergenceAcknowledgmentStatus = 'pending' | 'acknowledged' | 'dismissed';

/**
 * A notification about emergence for the DM
 */
export interface EmergenceNotification {
  /** Unique ID for this notification */
  id: string;
  /** Game ID this notification belongs to */
  gameId: string;
  /** The emergence opportunity */
  opportunity: EmergenceOpportunity;
  /** DM acknowledgment status */
  status: EmergenceAcknowledgmentStatus;
  /** ISO timestamp when the notification was created */
  createdAt: string;
  /** ISO timestamp when the notification was acknowledged/dismissed */
  resolvedAt?: string;
  /** Optional DM notes */
  dmNotes?: string;
}
