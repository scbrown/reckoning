/**
 * Status Types
 *
 * Types for system status and game observations.
 */

// =============================================================================
// Component Status
// =============================================================================

/**
 * Status of an individual system component
 */
export type ComponentStatus = 'ok' | 'degraded' | 'error' | 'offline';

// =============================================================================
// System Status
// =============================================================================

/**
 * Status of the AI generation subsystem
 */
export interface AIStatus {
  /** Current status */
  status: ComponentStatus;
  /** Time taken for last generation in milliseconds */
  lastGenerationMs?: number;
  /** Error message if status is error */
  errorMessage?: string;
}

/**
 * Status of the TTS subsystem
 */
export interface TTSStatus {
  /** Current status */
  status: ComponentStatus;
  /** Number of items in the TTS queue */
  queueLength: number;
}

/**
 * Status of the database subsystem
 */
export interface DBStatus {
  /** Current status */
  status: ComponentStatus;
  /** ISO timestamp of last successful sync */
  lastSyncAt?: string;
}

/**
 * Overall system status aggregating all subsystems
 */
export interface SystemStatus {
  /** AI generation subsystem status */
  ai: AIStatus;
  /** TTS subsystem status */
  tts: TTSStatus;
  /** Database subsystem status */
  db: DBStatus;
}

// =============================================================================
// Game Observations
// =============================================================================

/**
 * Observable metrics about the current game state
 *
 * Used for dashboards, debugging, and analytics.
 */
export interface GameObservation {
  /** Current turn number */
  turn: number;
  /** Total events recorded in this game */
  totalEvents: number;
  /** Events recorded in the current turn */
  eventsThisTurn: number;
  /** Name of the current location */
  currentLocation: string;
  /** Number of characters in the party */
  partySize: number;
  /** Number of NPCs in the current location */
  npcsPresent: number;
  /** Duration of the current session in milliseconds */
  sessionDuration: number;
}
