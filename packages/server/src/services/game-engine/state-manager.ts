/**
 * State Manager
 *
 * Handles state transitions, event commits, and broadcasts.
 */

import type { Database } from 'better-sqlite3';
import type {
  CanonicalEvent,
  EventType,
  GameState,
  DMEditorState,
} from '@reckoning/shared';
import {
  GameRepository,
  EventRepository,
  EditorStateRepository,
} from '../../db/repositories/index.js';
import type { BroadcastManager } from '../sse/index.js';
import type { DMEditorState as SSEDMEditorState } from '../sse/types.js';

// =============================================================================
// Types
// =============================================================================

/**
 * Event data for creating a new event (without id/timestamp)
 */
export interface EventInput {
  gameId: string;
  turn: number;
  eventType: EventType;
  content: string;
  originalGenerated?: string;
  speaker?: string;
  locationId: string;
  witnesses: string[];
}

// =============================================================================
// StateManager Class
// =============================================================================

/**
 * Manages state transitions and broadcasts state changes.
 */
export class StateManager {
  private gameRepo: GameRepository;
  private eventRepo: EventRepository;
  private editorRepo: EditorStateRepository;
  private broadcaster: BroadcastManager;

  constructor(db: Database, broadcaster: BroadcastManager) {
    this.gameRepo = new GameRepository(db);
    this.eventRepo = new EventRepository(db);
    this.editorRepo = new EditorStateRepository(db);
    this.broadcaster = broadcaster;
  }

  /**
   * Create event and update game state
   *
   * @param gameId - ID of the game
   * @param event - Event data (without id/timestamp)
   * @returns The created canonical event
   */
  commitEvent(
    gameId: string,
    event: Omit<CanonicalEvent, 'id' | 'timestamp'>
  ): CanonicalEvent {
    // Create the event in the database
    const createdEvent = this.eventRepo.create(event);

    // TODO(SEVT-007): Call emergenceObserver.onEventCommitted(createdEvent) here
    // once EmergenceObserver service is implemented to detect narrative emergence
    // opportunities (villain/ally emergence based on relationship thresholds).

    // Get current game state for SSE
    const gameState = this.gameRepo.findById(gameId);

    // Broadcast the state change
    if (gameState) {
      this.broadcaster.broadcast(gameId, {
        type: 'state_changed',
        state: {
          id: gameState.id,
          playerId: gameState.playerId,
          currentAreaId: gameState.currentAreaId,
          turn: gameState.turn,
        },
      });
    }

    return createdEvent;
  }

  /**
   * Update editor state and broadcast
   *
   * @param gameId - ID of the game
   * @param state - New editor state
   */
  updateEditorState(gameId: string, state: DMEditorState): void {
    // Save to database
    this.editorRepo.set(gameId, state);

    // Convert to SSE format and broadcast
    const sseState: SSEDMEditorState = {
      pending: state.pending !== null,
      editedContent: state.editedContent,
      status: state.status === 'generating' ? 'regenerating' : state.status === 'accepting' ? 'idle' : state.status,
    };

    this.broadcaster.broadcast(gameId, {
      type: 'editor_state',
      editorState: sseState,
    });
  }

  /**
   * Get current editor state
   *
   * @param gameId - ID of the game
   * @returns Current editor state or default
   */
  getEditorState(gameId: string): DMEditorState {
    const state = this.editorRepo.get(gameId);
    return (
      state ?? {
        pending: null,
        editedContent: null,
        status: 'idle',
      }
    );
  }

  /**
   * Clear editor state (after submit)
   *
   * @param gameId - ID of the game
   */
  clearEditorState(gameId: string): void {
    this.editorRepo.clear(gameId);
    this.broadcaster.broadcast(gameId, {
      type: 'editor_state',
      editorState: {
        pending: false,
        editedContent: null,
        status: 'idle',
      },
    });
  }

  /**
   * Increment turn and return new turn number
   *
   * @param gameId - ID of the game
   * @returns New turn number
   */
  incrementTurn(gameId: string): number {
    const newTurn = this.gameRepo.incrementTurn(gameId);

    // Get full state to broadcast
    const gameState = this.gameRepo.findById(gameId);
    if (gameState) {
      this.broadcaster.broadcast(gameId, {
        type: 'state_changed',
        state: {
          id: gameState.id,
          playerId: gameState.playerId,
          currentAreaId: gameState.currentAreaId,
          turn: newTurn,
        },
      });
    }

    return newTurn;
  }

  /**
   * Get current game state
   *
   * @param gameId - ID of the game
   * @returns Game state or null if not found
   */
  getGameState(gameId: string): GameState | null {
    return this.gameRepo.findById(gameId);
  }

  /**
   * Broadcast a game state change
   *
   * @param gameId - ID of the game
   * @param state - The game state to broadcast
   */
  broadcastStateChange(gameId: string, state: GameState): void {
    this.broadcaster.broadcast(gameId, {
      type: 'state_changed',
      state: {
        id: state.id,
        playerId: state.playerId,
        currentAreaId: state.currentAreaId,
        turn: state.turn,
      },
    });
  }
}
