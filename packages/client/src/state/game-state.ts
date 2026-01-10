/**
 * Game State Manager
 *
 * Manages client-side game state synchronized with SSE events.
 */

import type {
  DMAction,
  EventType,
  PlaybackMode,
  CanonicalEvent,
  GeneratedContent,
} from '@reckoning/shared';
import type { SSEService } from '../services/sse/index.js';
import type { GameService } from '../services/game/index.js';
import type {
  ClientGameState,
  StateListener,
  NarrativeEntry,
} from './types.js';
import { createInitialState } from './types.js';

/**
 * Manages client-side game state synchronized with SSE events
 */
export class GameStateManager {
  private state: ClientGameState;
  private listeners: Set<StateListener> = new Set();
  private sseService: SSEService;
  private gameService: GameService;
  private unsubscribers: (() => void)[] = [];

  constructor(sseService: SSEService, gameService: GameService) {
    this.sseService = sseService;
    this.gameService = gameService;
    this.state = createInitialState();
  }

  // ===========================================================================
  // State Access
  // ===========================================================================

  /**
   * Get current state (immutable copy)
   */
  getState(): Readonly<ClientGameState> {
    return this.state;
  }

  /**
   * Subscribe to state changes
   * @param listener - Callback invoked on state change
   * @returns Unsubscribe function
   */
  subscribe(listener: StateListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  // ===========================================================================
  // Game Initialization
  // ===========================================================================

  /**
   * Initialize with an existing game
   * @param gameId - The game ID to load
   */
  async initGame(gameId: string): Promise<void> {
    this.updateState({ isLoading: true, error: null });

    try {
      // Fetch game session and editor state
      const { session, editorState } =
        await this.gameService.getSession(gameId);

      // Fetch pending content
      const { pending } = await this.gameService.getPending(gameId);

      // Fetch status
      const { system, observation } = await this.gameService.getStatus(gameId);

      // Connect to SSE stream
      this.setupSSEHandlers();
      this.sseService.connect(gameId);

      this.updateState({
        gameId,
        session,
        editorState,
        pendingContent: pending,
        systemStatus: system,
        observation,
        connected: true,
        isLoading: false,
      });
    } catch (error) {
      this.updateState({
        isLoading: false,
        error: error instanceof Error ? error.message : 'Failed to load game',
      });
      throw error;
    }
  }

  /**
   * Start a new game
   * @param playerName - Name of the player character
   * @param description - Optional character description
   */
  async startNewGame(playerName: string, description?: string): Promise<void> {
    this.updateState({ isLoading: true, error: null });

    try {
      const session = await this.gameService.newGame(playerName, description);
      const gameId = session.state.id;

      // Connect to SSE stream
      this.setupSSEHandlers();
      this.sseService.connect(gameId);

      this.updateState({
        gameId,
        session,
        editorState: { pending: null, editedContent: null, status: 'idle' },
        pendingContent: null,
        systemStatus: null,
        observation: null,
        connected: true,
        isLoading: false,
        narrativeHistory: [],
      });
    } catch (error) {
      this.updateState({
        isLoading: false,
        error:
          error instanceof Error ? error.message : 'Failed to start new game',
      });
      throw error;
    }
  }

  /**
   * Load a game from a save slot
   * @param slotId - The save slot ID to load
   */
  async loadSavedGame(slotId: string): Promise<void> {
    const currentGameId = this.state.gameId;
    if (!currentGameId) {
      throw new Error('No game ID available');
    }

    this.updateState({ isLoading: true, error: null });

    try {
      const session = await this.gameService.loadGame(currentGameId, slotId);
      const gameId = session.state.id;

      // Reconnect to SSE stream with new game
      this.cleanupSSEHandlers();
      this.setupSSEHandlers();
      this.sseService.connect(gameId);

      this.updateState({
        gameId,
        session,
        editorState: { pending: null, editedContent: null, status: 'idle' },
        pendingContent: null,
        connected: true,
        isLoading: false,
        narrativeHistory: [],
      });
    } catch (error) {
      this.updateState({
        isLoading: false,
        error:
          error instanceof Error ? error.message : 'Failed to load saved game',
      });
      throw error;
    }
  }

  /**
   * Clear the current game and disconnect
   */
  clearGame(): void {
    this.cleanupSSEHandlers();
    this.sseService.disconnect();
    this.state = createInitialState();
    this.notifyListeners();
  }

  // ===========================================================================
  // Game Actions
  // ===========================================================================

  /**
   * Submit content with a DM action
   * @param action - The DM action to submit
   */
  async submitContent(action: DMAction): Promise<void> {
    const gameId = this.state.gameId;
    if (!gameId) {
      throw new Error('No game ID available');
    }

    this.updateState({ isLoading: true, error: null });

    try {
      const { event, session } = await this.gameService.submit(gameId, action);

      // Add to narrative history
      this.addToNarrativeHistory(event);

      this.updateState({
        session,
        pendingContent: null,
        editorState: { pending: null, editedContent: null, status: 'idle' },
        isLoading: false,
      });
    } catch (error) {
      this.updateState({
        isLoading: false,
        error:
          error instanceof Error ? error.message : 'Failed to submit content',
      });
      throw error;
    }
  }

  /**
   * Request content regeneration
   * @param feedback - Optional feedback to guide regeneration
   */
  async regenerateContent(feedback?: string): Promise<void> {
    const gameId = this.state.gameId;
    if (!gameId) {
      throw new Error('No game ID available');
    }

    this.updateState({
      isLoading: true,
      error: null,
      editorState: this.state.editorState
        ? { ...this.state.editorState, status: 'generating' }
        : null,
    });

    try {
      await this.gameService.regenerate(gameId, feedback);
      // State updates will come via SSE events
    } catch (error) {
      this.updateState({
        isLoading: false,
        error:
          error instanceof Error
            ? error.message
            : 'Failed to regenerate content',
      });
      throw error;
    }
  }

  /**
   * Inject custom content directly into the game
   * @param content - The content to inject
   * @param eventType - The type of event to create
   * @param speaker - Optional speaker for dialogue events
   */
  async injectContent(
    content: string,
    eventType: EventType,
    speaker?: string
  ): Promise<void> {
    const gameId = this.state.gameId;
    if (!gameId) {
      throw new Error('No game ID available');
    }

    this.updateState({ isLoading: true, error: null });

    try {
      const { event, session } = await this.gameService.inject(
        gameId,
        content,
        eventType,
        speaker
      );

      // Add to narrative history
      this.addToNarrativeHistory(event);

      this.updateState({
        session,
        isLoading: false,
      });
    } catch (error) {
      this.updateState({
        isLoading: false,
        error:
          error instanceof Error ? error.message : 'Failed to inject content',
      });
      throw error;
    }
  }

  /**
   * Trigger the next content generation
   * @param options - Optional generation options
   */
  async triggerNext(options?: {
    type?: string;
    dmGuidance?: string;
  }): Promise<void> {
    const gameId = this.state.gameId;
    if (!gameId) {
      throw new Error('No game ID available');
    }

    this.updateState({ isLoading: true, error: null });

    try {
      await this.gameService.next(gameId, options);
      // State updates will come via SSE events
    } catch (error) {
      this.updateState({
        isLoading: false,
        error:
          error instanceof Error
            ? error.message
            : 'Failed to trigger next generation',
      });
      throw error;
    }
  }

  /**
   * Set the playback mode
   * @param mode - The playback mode to set
   */
  async setPlaybackMode(mode: PlaybackMode): Promise<void> {
    const gameId = this.state.gameId;
    if (!gameId) {
      throw new Error('No game ID available');
    }

    try {
      await this.gameService.setPlaybackMode(gameId, mode);
    } catch (error) {
      this.updateState({
        error:
          error instanceof Error
            ? error.message
            : 'Failed to set playback mode',
      });
      throw error;
    }
  }

  /**
   * Save the current game
   * @param name - Display name for the save
   */
  async saveGame(name: string): Promise<void> {
    const gameId = this.state.gameId;
    if (!gameId) {
      throw new Error('No game ID available');
    }

    try {
      await this.gameService.saveGame(gameId, name);
    } catch (error) {
      this.updateState({
        error: error instanceof Error ? error.message : 'Failed to save game',
      });
      throw error;
    }
  }

  /**
   * Update editor content (local + server sync)
   * @param content - The new editor content
   */
  async updateEditorContent(content: string): Promise<void> {
    const gameId = this.state.gameId;
    if (!gameId) {
      throw new Error('No game ID available');
    }

    // Update local state immediately
    this.updateState({
      editorState: this.state.editorState
        ? { ...this.state.editorState, editedContent: content, status: 'editing' }
        : { pending: null, editedContent: content, status: 'editing' },
    });

    try {
      // Sync to server
      const editorState = await this.gameService.updateEditor(gameId, {
        editedContent: content,
        status: 'editing',
      });

      this.updateState({ editorState });
    } catch (error) {
      this.updateState({
        error:
          error instanceof Error ? error.message : 'Failed to update editor',
      });
      throw error;
    }
  }

  // ===========================================================================
  // SSE Event Handling
  // ===========================================================================

  /**
   * Set up SSE event handlers
   */
  private setupSSEHandlers(): void {
    // Clean up any existing handlers first
    this.cleanupSSEHandlers();

    // generation_started
    this.unsubscribers.push(
      this.sseService.on('generation_started', () => {
        this.updateState({
          isLoading: true,
          systemStatus: this.state.systemStatus
            ? {
                ...this.state.systemStatus,
                ai: { status: 'ok' },
              }
            : null,
        });
      })
    );

    // generation_complete
    this.unsubscribers.push(
      this.sseService.on('generation_complete', (event) => {
        const pendingContent: GeneratedContent = {
          id: event.generationId,
          generationType: 'narration',
          eventType: 'narration',
          content: event.content,
          metadata: {},
        };

        this.updateState({
          isLoading: false,
          pendingContent,
          editorState: {
            pending: event.content,
            editedContent: event.content,
            status: 'editing',
          },
          systemStatus: this.state.systemStatus
            ? {
                ...this.state.systemStatus,
                ai: { status: 'ok' },
              }
            : null,
        });
      })
    );

    // generation_error
    this.unsubscribers.push(
      this.sseService.on('generation_error', (event) => {
        this.updateState({
          isLoading: false,
          error: event.error,
          systemStatus: this.state.systemStatus
            ? {
                ...this.state.systemStatus,
                ai: { status: 'error', errorMessage: event.error },
              }
            : null,
        });
      })
    );

    // state_changed
    this.unsubscribers.push(
      this.sseService.on('state_changed', (event) => {
        // Update session state based on the change
        if (this.state.session) {
          this.updateState({
            session: {
              ...this.state.session,
              state: {
                ...this.state.session.state,
                // Merge in new state from event
                ...(event.newState ? { state: event.newState } : {}),
              },
            },
          });
        }
      })
    );

    // editor_state
    this.unsubscribers.push(
      this.sseService.on('editor_state', (event) => {
        this.updateState({
          editorState: {
            pending: event.content,
            editedContent: event.content,
            status: 'editing',
          },
        });
      })
    );

    // tts_started
    this.unsubscribers.push(
      this.sseService.on('tts_started', (event) => {
        this.markTTSPlaying(event.requestId, true);
      })
    );

    // tts_complete
    this.unsubscribers.push(
      this.sseService.on('tts_complete', (event) => {
        this.markTTSPlaying(event.requestId, false);
      })
    );
  }

  /**
   * Clean up SSE event handlers
   */
  private cleanupSSEHandlers(): void {
    this.unsubscribers.forEach((unsubscribe) => unsubscribe());
    this.unsubscribers = [];
  }

  // ===========================================================================
  // Private State Management
  // ===========================================================================

  /**
   * Update state with partial changes
   */
  private updateState(partial: Partial<ClientGameState>): void {
    this.state = { ...this.state, ...partial };
    this.notifyListeners();
  }

  /**
   * Notify all listeners of state change
   */
  private notifyListeners(): void {
    const state = this.getState();
    this.listeners.forEach((listener) => {
      try {
        listener(state);
      } catch (error) {
        console.error('[State] Listener error:', error);
      }
    });
  }

  // ===========================================================================
  // Narrative History Management
  // ===========================================================================

  /**
   * Add a canonical event to the narrative history
   */
  addToNarrativeHistory(event: CanonicalEvent): void {
    const entry: NarrativeEntry = {
      id: event.id,
      type: event.eventType,
      content: event.content,
      speaker: event.speaker,
      timestamp: new Date(event.timestamp),
    };

    this.updateState({
      narrativeHistory: [...this.state.narrativeHistory, entry],
    });
  }

  /**
   * Mark a narrative entry's TTS playing status
   */
  private markTTSPlaying(eventId: string, isPlaying: boolean): void {
    const updatedHistory = this.state.narrativeHistory.map((entry) =>
      entry.id === eventId ? { ...entry, isTTSPlaying: isPlaying } : entry
    );

    this.updateState({ narrativeHistory: updatedHistory });
  }
}
