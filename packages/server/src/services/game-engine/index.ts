/**
 * Game Engine
 *
 * Orchestrates content generation and the game loop.
 */

import type { Database } from 'better-sqlite3';
import { randomUUID } from 'crypto';
import type {
  GameState,
  GeneratedContent,
  CanonicalEvent,
  DMAction,
  PlaybackMode,
  DMEditorState,
  GenerationType,
  EventType,
} from '@reckoning/shared';
import type { BroadcastManager } from '../sse/index.js';
import type { AIProvider } from '../ai/types.js';
import { createContextBuilder } from '../ai/context-builder.js';
import {
  GameRepository,
  PartyRepository,
  TraitRepository,
  RelationshipRepository,
  PendingEvolutionRepository,
  EmergenceNotificationRepository,
} from '../../db/repositories/index.js';
import { EvolutionService } from '../evolution/index.js';
import { EmergenceObserver, EmergenceNotificationService } from '../events/index.js';
import { ContentPipeline } from './content-pipeline.js';
import { EventLoop } from './event-loop.js';
import { StateManager } from './state-manager.js';

// =============================================================================
// Re-exports
// =============================================================================

export { ContentPipeline, type GenerateOptions } from './content-pipeline.js';
export { EventLoop } from './event-loop.js';
export { StateManager } from './state-manager.js';

// =============================================================================
// Types
// =============================================================================

/**
 * Options for generation
 */
export interface GenerateNextOptions {
  /** Type of content to generate */
  type?: GenerationType;
  /** Optional DM guidance */
  dmGuidance?: string;
}

/**
 * Dependencies for creating a GameEngine
 */
export interface GameEngineDeps {
  db: Database;
  aiProvider: AIProvider;
  broadcaster: BroadcastManager;
}

// =============================================================================
// Pending Content Store
// =============================================================================

/**
 * In-memory storage for pending generated content (keyed by gameId)
 */
const pendingContentStore: Map<string, GeneratedContent> = new Map();

// =============================================================================
// GameEngine Class
// =============================================================================

/**
 * Main game engine that orchestrates content generation and game loop.
 */
export class GameEngine {
  private pipeline: ContentPipeline;
  private eventLoop: EventLoop;
  private stateManager: StateManager;
  private broadcaster: BroadcastManager;
  private gameRepo: GameRepository;
  private partyRepo: PartyRepository;

  constructor(deps: GameEngineDeps) {
    const { db, aiProvider, broadcaster } = deps;

    this.broadcaster = broadcaster;
    this.gameRepo = new GameRepository(db);
    this.partyRepo = new PartyRepository(db);

    // Create shared repositories
    const relationshipRepo = new RelationshipRepository(db);

    // Create evolution service for traits and relationships
    const evolutionService = new EvolutionService({
      traitRepo: new TraitRepository(db),
      relationshipRepo,
      pendingRepo: new PendingEvolutionRepository(db),
    });

    // Create context builder with evolution service
    const contextBuilder = createContextBuilder(db, {
      evolutionRepo: evolutionService,
    });

    // Create emergence observer and notification service (SEVT-011)
    const emergenceObserver = new EmergenceObserver({
      relationshipRepo,
    });
    const emergenceService = new EmergenceNotificationService({
      emergenceObserver,
      notificationRepo: new EmergenceNotificationRepository(db),
      broadcaster,
    });

    // Initialize components
    this.pipeline = new ContentPipeline(contextBuilder, aiProvider);
    this.eventLoop = new EventLoop();
    this.stateManager = new StateManager(db, broadcaster, {
      emergenceService,
    });

    // Wire up event loop callback
    this.eventLoop.setGenerateCallback(async (gameId) => {
      await this.generateNext(gameId);
    });
  }

  // ===========================================================================
  // Game Lifecycle
  // ===========================================================================

  /**
   * Start a new game
   *
   * @param playerName - Name of the player
   * @param playerDescription - Optional description of the player character
   * @returns The initial game state
   */
  async startGame(playerName: string, playerDescription?: string): Promise<GameState> {
    // Create player first
    const playerId = randomUUID();

    // Get default starting area (first area in DB or create one)
    const startAreaId = 'default-area';

    // Create the game
    const game = this.gameRepo.create(playerId, startAreaId);

    // Create player record (for getSession to work)
    this.createPlayer(game.id, playerId, playerName, playerDescription);

    // Create party and add player character
    const party = this.partyRepo.create(game.id);
    this.partyRepo.addCharacter(party.id, {
      name: playerName,
      description: playerDescription || 'The adventurer',
      class: 'Adventurer',
      role: 'player',
      stats: { health: 100, maxHealth: 100 },
    });

    // Set initial playback mode
    this.eventLoop.setMode(game.id, 'paused');

    return game;
  }

  /**
   * Create a player record in the players table
   */
  private createPlayer(gameId: string, playerId: string, name: string, description?: string): void {
    const db = this.gameRepo['db'] as import('better-sqlite3').Database;
    db.prepare(`
      INSERT INTO players (id, game_id, name, description, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(playerId, gameId, name, description || 'The adventurer', new Date().toISOString());
  }

  /**
   * Load an existing game
   *
   * @param gameId - ID of the game to load
   * @returns The game state or null if not found
   */
  async loadGame(gameId: string): Promise<GameState | null> {
    const game = this.gameRepo.findById(gameId);
    if (!game) {
      return null;
    }

    // Restore playback mode from DB
    const mode = this.gameRepo.getPlaybackMode(gameId);
    if (mode) {
      this.eventLoop.setMode(gameId, mode);
    }

    return game;
  }

  // ===========================================================================
  // Content Generation
  // ===========================================================================

  /**
   * Generate next content (triggers AI)
   * Result is delivered via SSE, not returned directly.
   *
   * @param gameId - ID of the game
   * @param options - Generation options
   */
  async generateNext(
    gameId: string,
    options?: GenerateNextOptions
  ): Promise<void> {
    const type = options?.type ?? 'narration';

    // Broadcast generation started
    this.broadcaster.broadcast(gameId, {
      type: 'generation_started',
      contentType: type,
    });

    // Update editor state to generating
    this.stateManager.updateEditorState(gameId, {
      pending: null,
      editedContent: null,
      status: 'generating',
    });

    // Generate content - only pass dmGuidance if defined
    const generateOptions = options?.dmGuidance !== undefined
      ? { dmGuidance: options.dmGuidance }
      : undefined;

    const result = await this.pipeline.generate(gameId, type, generateOptions);

    if (!result.ok) {
      // Broadcast error
      this.broadcaster.broadcast(gameId, {
        type: 'generation_error',
        error: result.error.message,
      });

      // Reset editor state
      this.stateManager.updateEditorState(gameId, {
        pending: null,
        editedContent: null,
        status: 'idle',
      });
      return;
    }

    // Store pending content
    pendingContentStore.set(gameId, result.value);

    // Update editor state with pending content
    this.stateManager.updateEditorState(gameId, {
      pending: result.value.content,
      editedContent: null,
      status: 'editing',
    });

    // Broadcast generation complete with eventType and metadata
    this.broadcaster.broadcast(gameId, {
      type: 'generation_complete',
      generationId: result.value.id,
      content: result.value.content,
      eventType: result.value.eventType,
      metadata: result.value.metadata,
    });
  }

  /**
   * Submit DM-approved content
   *
   * @param gameId - ID of the game
   * @param action - The DM action to perform
   * @returns The created canonical event
   */
  async submit(gameId: string, action: DMAction): Promise<CanonicalEvent | null> {
    const game = this.gameRepo.findById(gameId);
    if (!game) {
      throw new Error(`Game not found: ${gameId}`);
    }

    switch (action.type) {
      case 'ACCEPT':
        return this.handleAccept(gameId, game);

      case 'EDIT':
        return this.handleEdit(gameId, game, action.content);

      case 'REGENERATE':
        await this.handleRegenerate(gameId, action.guidance);
        return null;

      case 'INJECT':
        return this.handleInject(
          gameId,
          game,
          action.content,
          (action.eventType as EventType) ?? 'dm_injection'
        );

      default:
        throw new Error(`Unknown action type: ${(action as { type: string }).type}`);
    }
  }

  /**
   * Request regeneration with optional feedback
   *
   * @param gameId - ID of the game
   * @param feedback - Optional feedback for regeneration
   */
  async regenerate(gameId: string, feedback?: string): Promise<void> {
    await this.handleRegenerate(gameId, feedback);
  }

  /**
   * Inject DM-authored content directly
   *
   * @param gameId - ID of the game
   * @param content - The content to inject
   * @param eventType - Type of event to create
   * @returns The created canonical event
   */
  async inject(
    gameId: string,
    content: string,
    eventType: EventType
  ): Promise<CanonicalEvent> {
    const game = this.gameRepo.findById(gameId);
    if (!game) {
      throw new Error(`Game not found: ${gameId}`);
    }

    return this.handleInject(gameId, game, content, eventType);
  }

  // ===========================================================================
  // Playback Control
  // ===========================================================================

  /**
   * Set playback mode for a game
   *
   * @param gameId - ID of the game
   * @param mode - New playback mode
   */
  async setPlaybackMode(gameId: string, mode: PlaybackMode): Promise<void> {
    this.eventLoop.setMode(gameId, mode);
    this.gameRepo.setPlaybackMode(gameId, mode);
  }

  /**
   * Get current playback mode
   *
   * @param gameId - ID of the game
   * @returns Current playback mode
   */
  getPlaybackMode(gameId: string): PlaybackMode {
    return this.eventLoop.getMode(gameId);
  }

  // ===========================================================================
  // Pending Content & Editor State
  // ===========================================================================

  /**
   * Get current pending content (if any)
   *
   * @param gameId - ID of the game
   * @returns Pending content or null
   */
  getPendingContent(gameId: string): GeneratedContent | null {
    return pendingContentStore.get(gameId) ?? null;
  }

  /**
   * Get current editor state
   *
   * @param gameId - ID of the game
   * @returns Editor state
   */
  getEditorState(gameId: string): DMEditorState {
    return this.stateManager.getEditorState(gameId);
  }

  /**
   * Update editor state
   *
   * @param gameId - ID of the game
   * @param state - Partial editor state to update
   */
  async updateEditorState(
    gameId: string,
    state: Partial<DMEditorState>
  ): Promise<void> {
    const current = this.stateManager.getEditorState(gameId);
    this.stateManager.updateEditorState(gameId, {
      ...current,
      ...state,
    });
  }

  // ===========================================================================
  // Private Helpers
  // ===========================================================================

  /**
   * Handle ACCEPT action
   */
  private async handleAccept(
    gameId: string,
    game: GameState
  ): Promise<CanonicalEvent> {
    const pending = pendingContentStore.get(gameId);
    const editorState = this.stateManager.getEditorState(gameId);

    // Use edited content if available, otherwise pending
    const content = editorState.editedContent ?? pending?.content ?? '';
    const eventType = pending?.eventType ?? 'narration';

    if (!content) {
      throw new Error('No content to accept');
    }

    // Create the canonical event
    const event = this.stateManager.commitEvent(gameId, {
      gameId,
      turn: game.turn,
      eventType,
      content,
      locationId: game.currentAreaId,
      witnesses: [],
    });

    // Clear pending content and editor state
    pendingContentStore.delete(gameId);
    this.stateManager.clearEditorState(gameId);

    // Trigger auto-advance if in auto mode
    await this.eventLoop.onSubmit(gameId);

    return event;
  }

  /**
   * Handle EDIT action
   */
  private async handleEdit(
    gameId: string,
    game: GameState,
    content: string
  ): Promise<CanonicalEvent> {
    const pending = pendingContentStore.get(gameId);
    const eventType = pending?.eventType ?? 'narration';

    // Build event data - only include originalGenerated if it exists
    const eventData: Omit<CanonicalEvent, 'id' | 'timestamp'> = {
      gameId,
      turn: game.turn,
      eventType,
      content,
      locationId: game.currentAreaId,
      witnesses: [],
    };

    // Add original content if we have it
    if (pending?.content) {
      eventData.originalGenerated = pending.content;
    }

    // Create event with edited content
    const event = this.stateManager.commitEvent(gameId, eventData);

    // Clear pending content and editor state
    pendingContentStore.delete(gameId);
    this.stateManager.clearEditorState(gameId);

    // Trigger auto-advance if in auto mode
    await this.eventLoop.onSubmit(gameId);

    return event;
  }

  /**
   * Handle REGENERATE action
   */
  private async handleRegenerate(
    gameId: string,
    guidance?: string
  ): Promise<void> {
    // Clear current pending content
    pendingContentStore.delete(gameId);

    // Generate new content - only pass options if guidance is provided
    if (guidance !== undefined) {
      await this.generateNext(gameId, { dmGuidance: guidance });
    } else {
      await this.generateNext(gameId);
    }
  }

  /**
   * Handle INJECT action
   */
  private async handleInject(
    gameId: string,
    game: GameState,
    content: string,
    eventType: EventType
  ): Promise<CanonicalEvent> {
    // Create event directly (no pending content involved)
    const event = this.stateManager.commitEvent(gameId, {
      gameId,
      turn: game.turn,
      eventType,
      content,
      locationId: game.currentAreaId,
      witnesses: [],
    });

    // Trigger auto-advance if in auto mode
    await this.eventLoop.onSubmit(gameId);

    return event;
  }
}

// =============================================================================
// Factory Function
// =============================================================================

/**
 * Create a configured GameEngine instance
 *
 * @param deps - Dependencies for the engine
 * @returns Configured GameEngine
 */
export function createGameEngine(deps: GameEngineDeps): GameEngine {
  return new GameEngine(deps);
}
