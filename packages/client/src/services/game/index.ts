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
 * Evolution types
 */
export type EvolutionType = 'trait_add' | 'trait_remove' | 'relationship_change';
export type EvolutionStatus = 'pending' | 'approved' | 'edited' | 'refused';
export type EntityType = 'player' | 'npc' | 'location' | 'item';
export type RelationshipDimension = 'trust' | 'respect' | 'affection' | 'fear' | 'resentment' | 'debt';

/**
 * Scene types
 */
export type SceneStatus = 'active' | 'completed' | 'abandoned';
export type ConnectionType = 'path' | 'conditional' | 'hidden' | 'one-way' | 'teleport';

/**
 * Scene data from API
 */
export interface SceneDTO {
  id: string;
  gameId: string;
  name: string | null;
  description: string | null;
  sceneType: string | null;
  locationId: string | null;
  startedTurn: number;
  completedTurn: number | null;
  status: SceneStatus;
  mood: string | null;
  stakes: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Scene summary with metadata
 */
export interface SceneSummaryDTO {
  scene: SceneDTO;
  eventCount: number;
  isCurrentScene: boolean;
  isUnlocked: boolean;
  unlockedTurn: number | null;
}

/**
 * Scene connection data
 */
export interface SceneConnectionDTO {
  id: string;
  gameId: string;
  fromSceneId: string;
  toSceneId: string;
  connectionType: ConnectionType;
  requirements: ConnectionRequirementsDTO | null;
  description: string | null;
  createdAt: string;
}

/**
 * Connection requirements
 */
export interface ConnectionRequirementsDTO {
  items?: string[];
  flags?: string[];
  stats?: Record<string, number>;
}

/**
 * Create scene request
 */
export interface CreateSceneDTO {
  turn: number;
  name?: string;
  description?: string;
  sceneType?: string;
  locationId?: string;
  mood?: string;
  stakes?: string;
  autoUnlock?: boolean;
  unlockedBy?: string;
}

/**
 * Create connection request
 */
export interface CreateConnectionDTO {
  fromSceneId: string;
  toSceneId: string;
  connectionType?: ConnectionType;
  description?: string;
  requirements?: ConnectionRequirementsDTO;
}

/**
 * Pending evolution data from API
 */
export interface PendingEvolutionDTO {
  id: string;
  gameId: string;
  turn: number;
  evolutionType: EvolutionType;
  entityType: EntityType;
  entityId: string;
  trait?: string;
  targetType?: EntityType;
  targetId?: string;
  dimension?: RelationshipDimension;
  oldValue?: number;
  newValue?: number;
  reason: string;
  sourceEventId?: string;
  status: EvolutionStatus;
  dmNotes?: string;
  createdAt: string;
  resolvedAt?: string;
}

/**
 * Evolution edit request
 */
export interface EvolutionEditDTO {
  trait?: string;
  newValue?: number;
  reason?: string;
}

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

  // ===========================================================================
  // Evolution Management
  // ===========================================================================

  /**
   * Get pending evolutions for a game
   * @param gameId - The game ID
   */
  async getPendingEvolutions(
    gameId: string
  ): Promise<{ evolutions: PendingEvolutionDTO[] }> {
    return this.request<{ evolutions: PendingEvolutionDTO[] }>(
      'GET',
      `/game/${gameId}/evolutions/pending`
    );
  }

  /**
   * Approve a pending evolution
   * @param gameId - The game ID
   * @param evolutionId - The evolution ID to approve
   * @param dmNotes - Optional DM notes
   */
  async approveEvolution(
    gameId: string,
    evolutionId: string,
    dmNotes?: string
  ): Promise<{ evolution: PendingEvolutionDTO }> {
    return this.request<{ evolution: PendingEvolutionDTO }>(
      'POST',
      `/game/${gameId}/evolutions/${evolutionId}/approve`,
      { dmNotes }
    );
  }

  /**
   * Edit and approve a pending evolution
   * @param gameId - The game ID
   * @param evolutionId - The evolution ID to edit
   * @param changes - Changes to apply
   * @param dmNotes - Optional DM notes
   */
  async editEvolution(
    gameId: string,
    evolutionId: string,
    changes: EvolutionEditDTO,
    dmNotes?: string
  ): Promise<{ evolution: PendingEvolutionDTO }> {
    return this.request<{ evolution: PendingEvolutionDTO }>(
      'POST',
      `/game/${gameId}/evolutions/${evolutionId}/edit`,
      { changes, dmNotes }
    );
  }

  /**
   * Refuse a pending evolution
   * @param gameId - The game ID
   * @param evolutionId - The evolution ID to refuse
   * @param dmNotes - Optional DM notes explaining refusal
   */
  async refuseEvolution(
    gameId: string,
    evolutionId: string,
    dmNotes?: string
  ): Promise<{ evolution: PendingEvolutionDTO }> {
    return this.request<{ evolution: PendingEvolutionDTO }>(
      'POST',
      `/game/${gameId}/evolutions/${evolutionId}/refuse`,
      { dmNotes }
    );
  }

  // ===========================================================================
  // Scene Management
  // ===========================================================================

  /**
   * Get all scenes for a game
   * @param gameId - The game ID
   * @param limit - Maximum number of scenes to return
   * @param offset - Offset for pagination
   */
  async getScenes(
    gameId: string,
    limit = 100,
    offset = 0
  ): Promise<{ scenes: SceneDTO[] }> {
    return this.request<{ scenes: SceneDTO[] }>(
      'GET',
      `/scene/${gameId}?limit=${limit}&offset=${offset}`
    );
  }

  /**
   * Get available (unlocked) scenes for a game
   * @param gameId - The game ID
   */
  async getAvailableScenes(
    gameId: string
  ): Promise<{ scenes: SceneSummaryDTO[] }> {
    return this.request<{ scenes: SceneSummaryDTO[] }>(
      'GET',
      `/scene/${gameId}/available`
    );
  }

  /**
   * Get the current active scene for a game
   * @param gameId - The game ID
   */
  async getCurrentScene(gameId: string): Promise<{ scene: SceneDTO | null }> {
    return this.request<{ scene: SceneDTO | null }>(
      'GET',
      `/scene/${gameId}/current`
    );
  }

  /**
   * Get scene details with connections
   * @param gameId - The game ID
   * @param sceneId - The scene ID
   */
  async getSceneDetails(
    gameId: string,
    sceneId: string
  ): Promise<SceneSummaryDTO & { connections: SceneConnectionDTO[]; connectedScenes: SceneSummaryDTO[] }> {
    return this.request<SceneSummaryDTO & { connections: SceneConnectionDTO[]; connectedScenes: SceneSummaryDTO[] }>(
      'GET',
      `/scene/${gameId}/${sceneId}`
    );
  }

  /**
   * Create a new scene
   * @param gameId - The game ID
   * @param scene - Scene creation data
   */
  async createScene(
    gameId: string,
    scene: CreateSceneDTO
  ): Promise<{ scene: SceneDTO }> {
    return this.request<{ scene: SceneDTO }>(
      'POST',
      `/scene/${gameId}`,
      scene
    );
  }

  /**
   * Start a scene, making it the current active scene
   * @param gameId - The game ID
   * @param sceneId - The scene ID to start
   * @param turn - The turn number
   */
  async startScene(
    gameId: string,
    sceneId: string,
    turn: number
  ): Promise<{ scene: SceneDTO }> {
    return this.request<{ scene: SceneDTO }>(
      'POST',
      `/scene/${gameId}/${sceneId}/start`,
      { turn }
    );
  }

  /**
   * Complete a scene
   * @param gameId - The game ID
   * @param sceneId - The scene ID to complete
   * @param turn - The turn number
   */
  async completeScene(
    gameId: string,
    sceneId: string,
    turn: number
  ): Promise<{ scene: SceneDTO }> {
    return this.request<{ scene: SceneDTO }>(
      'POST',
      `/scene/${gameId}/${sceneId}/complete`,
      { turn }
    );
  }

  /**
   * Get scene connections for a game
   * @param gameId - The game ID
   * @param fromSceneId - Optional filter by source scene
   */
  async getConnections(
    gameId: string,
    fromSceneId?: string
  ): Promise<{ connections: SceneConnectionDTO[] }> {
    const query = fromSceneId ? `?fromSceneId=${fromSceneId}` : '';
    return this.request<{ connections: SceneConnectionDTO[] }>(
      'GET',
      `/scene/${gameId}/connections${query}`
    );
  }

  /**
   * Create a connection between two scenes
   * @param gameId - The game ID
   * @param connection - Connection creation data
   */
  async createConnection(
    gameId: string,
    connection: CreateConnectionDTO
  ): Promise<{ connection: SceneConnectionDTO }> {
    return this.request<{ connection: SceneConnectionDTO }>(
      'POST',
      `/scene/${gameId}/connections`,
      connection
    );
  }
}

/**
 * Singleton instance for app-wide use
 */
export const gameService = new GameService();

export default GameService;
