/**
 * Game Service - Client-side API for game server communication
 *
 * Provides methods for game session management, DM actions, and state management.
 */

import type {
  GameSession,
  GeneratedContent,
  CanonicalEvent,
  DMAction,
  PlaybackMode,
  DMEditorState,
  SystemStatus,
  GameObservation,
  EventType,
} from '@reckoning/shared';
import type { SaveSlot } from './types.js';

export type { SaveSlot };

/**
 * Error thrown by GameService operations
 */
export class GameServiceError extends Error {
  constructor(
    public code: string,
    message: string,
    public statusCode: number
  ) {
    super(message);
    this.name = 'GameServiceError';
  }
}

/**
 * Game Service for API communication with the game server
 */
export class GameService {
  private baseUrl: string;
  private currentGameId: string | null = null;

  constructor(baseUrl?: string) {
    this.baseUrl = baseUrl || '/api';
  }

  // ===========================================================================
  // Private Request Helper
  // ===========================================================================

  /**
   * Make an HTTP request to the game API
   */
  private async request<T>(
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    path: string,
    body?: object
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const options: RequestInit = {
      method,
      headers: {
        'Content-Type': 'application/json',
      },
    };

    if (body) {
      options.body = JSON.stringify(body);
    }

    const response = await fetch(url, options);

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new GameServiceError(
        error.error?.code || 'UNKNOWN_ERROR',
        error.error?.message || 'Request failed',
        response.status
      );
    }

    return response.json();
  }

  // ===========================================================================
  // Game ID Management
  // ===========================================================================

  /**
   * Get the current game ID
   */
  getGameId(): string | null {
    return this.currentGameId;
  }

  // ===========================================================================
  // Game Session Management
  // ===========================================================================

  /**
   * Create a new game session
   * @param playerName - Name of the player character
   * @param description - Optional character description
   */
  async newGame(
    playerName: string,
    description?: string
  ): Promise<GameSession> {
    const response = await this.request<{ gameId: string; session: GameSession }>(
      'POST',
      '/game/new',
      {
        playerName,
        playerDescription: description,
      }
    );
    this.currentGameId = response.gameId;
    return response.session;
  }

  /**
   * Get a game session by ID
   * @param gameId - The game ID to fetch
   */
  async getSession(
    gameId: string
  ): Promise<{ session: GameSession; editorState: DMEditorState }> {
    return this.request<{ session: GameSession; editorState: DMEditorState }>(
      'GET',
      `/game/${gameId}`
    );
  }

  // ===========================================================================
  // Save/Load Management
  // ===========================================================================

  /**
   * List all saved games
   */
  async listSaves(): Promise<SaveSlot[]> {
    const result = await this.request<{ saves: SaveSlot[] }>(
      'GET',
      '/game/list'
    );
    return result.saves;
  }

  /**
   * Save the current game state
   * @param gameId - The game ID to save
   * @param name - Display name for the save slot
   */
  async saveGame(gameId: string, name: string): Promise<SaveSlot> {
    return this.request<SaveSlot>('POST', `/game/${gameId}/save`, { name });
  }

  /**
   * Load a game from a save slot
   * @param gameId - The game ID
   * @param slotId - The save slot ID to load from
   */
  async loadGame(gameId: string, slotId: string): Promise<GameSession> {
    const session = await this.request<GameSession>(
      'POST',
      `/game/${gameId}/load`,
      { slotId }
    );
    this.currentGameId = session.state.id;
    return session;
  }

  // ===========================================================================
  // DM Editor Operations
  // ===========================================================================

  /**
   * Get pending generated content
   * @param gameId - The game ID
   */
  async getPending(
    gameId: string
  ): Promise<{ pending: GeneratedContent | null; editorState: DMEditorState }> {
    return this.request<{
      pending: GeneratedContent | null;
      editorState: DMEditorState;
    }>('GET', `/game/${gameId}/pending`);
  }

  /**
   * Update the DM editor state
   * @param gameId - The game ID
   * @param state - Partial editor state to update
   */
  async updateEditor(
    gameId: string,
    state: Partial<DMEditorState>
  ): Promise<DMEditorState> {
    return this.request<DMEditorState>(
      'PUT',
      `/game/${gameId}/editor`,
      state
    );
  }

  /**
   * Submit a DM action (accept, edit, regenerate)
   * @param gameId - The game ID
   * @param action - The DM action to submit
   */
  async submit(
    gameId: string,
    action: DMAction
  ): Promise<{ event: CanonicalEvent; session: GameSession }> {
    return this.request<{ event: CanonicalEvent; session: GameSession }>(
      'POST',
      `/game/${gameId}/submit`,
      { action }
    );
  }

  /**
   * Request content regeneration
   * @param gameId - The game ID
   * @param feedback - Optional feedback to guide regeneration
   */
  async regenerate(gameId: string, feedback?: string): Promise<void> {
    await this.request<void>('POST', `/game/${gameId}/regenerate`, {
      feedback,
    });
  }

  /**
   * Inject custom DM content directly into the game
   * @param gameId - The game ID
   * @param content - The content to inject
   * @param eventType - The type of event to create
   * @param speaker - Optional speaker for dialogue events
   */
  async inject(
    gameId: string,
    content: string,
    eventType: EventType,
    speaker?: string
  ): Promise<{ event: CanonicalEvent; session: GameSession }> {
    return this.request<{ event: CanonicalEvent; session: GameSession }>(
      'POST',
      `/game/${gameId}/inject`,
      { content, eventType, speaker }
    );
  }

  // ===========================================================================
  // Generation Control
  // ===========================================================================

  /**
   * Trigger the next content generation
   * @param gameId - The game ID
   * @param options - Optional generation options
   */
  async next(
    gameId: string,
    options?: { type?: string; dmGuidance?: string }
  ): Promise<void> {
    await this.request<void>('POST', `/game/${gameId}/next`, options || {});
  }

  // ===========================================================================
  // Playback Control
  // ===========================================================================

  /**
   * Set the playback mode
   * @param gameId - The game ID
   * @param mode - The playback mode to set
   */
  async setPlaybackMode(
    gameId: string,
    mode: PlaybackMode
  ): Promise<PlaybackMode> {
    const result = await this.request<{ mode: PlaybackMode }>(
      'POST',
      `/game/${gameId}/control`,
      { mode }
    );
    return result.mode;
  }

  // ===========================================================================
  // Status
  // ===========================================================================

  /**
   * Get system status and game observation
   * @param gameId - The game ID
   */
  async getStatus(
    gameId: string
  ): Promise<{ system: SystemStatus; observation: GameObservation }> {
    return this.request<{ system: SystemStatus; observation: GameObservation }>(
      'GET',
      `/game/${gameId}/status`
    );
  }
}

/**
 * Singleton instance for app-wide use
 */
export const gameService = new GameService();

export default GameService;
