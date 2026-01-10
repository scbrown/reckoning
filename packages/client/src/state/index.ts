/**
 * Client State Management
 *
 * Exports for client-side game state management.
 */

import type { SSEService } from '../services/sse/index.js';
import type { GameService } from '../services/game/index.js';
import { GameStateManager } from './game-state.js';

// Re-export types
export type {
  ClientGameState,
  NarrativeEntry,
  StateListener,
} from './types.js';

export { createInitialState } from './types.js';

// Re-export class
export { GameStateManager } from './game-state.js';

// =============================================================================
// Singleton Management
// =============================================================================

/**
 * Singleton instance of the GameStateManager
 */
export let gameStateManager: GameStateManager | null = null;

/**
 * Create and initialize the singleton GameStateManager
 *
 * @param sseService - The SSE service instance
 * @param gameService - The Game service instance
 * @returns The initialized GameStateManager
 */
export function createGameStateManager(
  sseService: SSEService,
  gameService: GameService
): GameStateManager {
  gameStateManager = new GameStateManager(sseService, gameService);
  return gameStateManager;
}

/**
 * Get the singleton GameStateManager instance
 *
 * @throws Error if the manager has not been initialized
 */
export function getGameStateManager(): GameStateManager {
  if (!gameStateManager) {
    throw new Error(
      'GameStateManager not initialized. Call createGameStateManager first.'
    );
  }
  return gameStateManager;
}

export default GameStateManager;
