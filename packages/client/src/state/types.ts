/**
 * Client State Types
 *
 * Types for client-side state management.
 */

import type {
  GameSession,
  DMEditorState,
  GeneratedContent,
  SystemStatus,
  GameObservation,
  EventType,
  Party,
} from '@reckoning/shared';

// =============================================================================
// Narrative History
// =============================================================================

/**
 * An entry in the narrative history for display
 */
export interface NarrativeEntry {
  /** Unique identifier for this entry */
  id: string;
  /** Type of event */
  type: EventType;
  /** The narrative content */
  content: string;
  /** Speaker name for dialogue events */
  speaker?: string;
  /** When this entry was created */
  timestamp: Date;
  /** Whether TTS is currently playing for this entry */
  isTTSPlaying?: boolean;
}

// =============================================================================
// Client Game State
// =============================================================================

/**
 * Complete client-side game state
 *
 * This represents all the state needed to render the game UI,
 * synchronized with the server via SSE events.
 */
export interface ClientGameState {
  // Connection
  /** Whether the client is connected to the SSE stream */
  connected: boolean;
  /** The current game ID */
  gameId: string | null;

  // Game data
  /** The current game session */
  session: GameSession | null;
  /** Current state of the DM editor */
  editorState: DMEditorState | null;
  /** Content pending DM review */
  pendingContent: GeneratedContent | null;
  /** The current party */
  party: Party | null;

  // System status
  /** Current status of system components */
  systemStatus: SystemStatus | null;
  /** Observable game metrics */
  observation: GameObservation | null;

  // UI state
  /** Whether content is currently being generated */
  isLoading: boolean;
  /** Current error message, if any */
  error: string | null;

  // Narrative history (for display)
  /** History of narrative entries for the UI */
  narrativeHistory: NarrativeEntry[];
}

// =============================================================================
// State Listener
// =============================================================================

/**
 * Callback for state changes
 */
export type StateListener = (state: ClientGameState) => void;

// =============================================================================
// Initial State
// =============================================================================

/**
 * Create the initial empty client state
 */
export function createInitialState(): ClientGameState {
  return {
    connected: false,
    gameId: null,
    session: null,
    editorState: null,
    pendingContent: null,
    party: null,
    systemStatus: null,
    observation: null,
    isLoading: false,
    error: null,
    narrativeHistory: [],
  };
}
