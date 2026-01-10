/**
 * DM (Dungeon Master) Types
 *
 * Types for the DM editor interface and playback control.
 */

// =============================================================================
// Editor State
// =============================================================================

/**
 * Status of the DM editor
 */
export type EditorStatus = 'idle' | 'generating' | 'editing' | 'accepting';

/**
 * State of the DM's content editor
 *
 * The DM editor allows reviewing and modifying AI-generated content
 * before it's committed to the game history.
 */
export interface DMEditorState {
  /** Content awaiting review */
  pending: string | null;
  /** Content as modified by the DM */
  editedContent: string | null;
  /** Current status of the editor */
  status: EditorStatus;
}

// =============================================================================
// DM Actions
// =============================================================================

/**
 * Action to accept the current pending/edited content
 */
export interface AcceptAction {
  type: 'ACCEPT';
}

/**
 * Action to edit the current pending content
 */
export interface EditAction {
  type: 'EDIT';
  /** The edited content */
  content: string;
}

/**
 * Action to regenerate content with optional guidance
 */
export interface RegenerateAction {
  type: 'REGENERATE';
  /** Optional guidance for regeneration */
  guidance?: string;
}

/**
 * Action to inject custom content directly
 */
export interface InjectAction {
  type: 'INJECT';
  /** The content to inject */
  content: string;
  /** Optional event type override */
  eventType?: string;
}

/**
 * Discriminated union of all DM actions
 */
export type DMAction =
  | AcceptAction
  | EditAction
  | RegenerateAction
  | InjectAction;

// =============================================================================
// Playback Control
// =============================================================================

/**
 * Playback mode for automated game progression
 */
export type PlaybackMode =
  /** Automatic progression without DM intervention */
  | 'auto'
  /** Paused, waiting for DM action */
  | 'paused'
  /** Stepping through one event at a time */
  | 'stepping'
  /** Completely stopped */
  | 'stopped';
