import type { SceneRepository, Scene } from '../../db/repositories/scene-repository.js';
import type { SceneAvailabilityRepository } from '../../db/repositories/scene-availability-repository.js';
import type {
  SceneConnectionRepository,
  ConnectionRequirements,
} from '../../db/repositories/scene-connection-repository.js';
import type { GameRepository } from '../../db/repositories/game-repository.js';
import type {
  SceneEventEmitter,
  SceneSummary,
  CreateSceneManagedInput,
  StartSceneInput,
  CompleteSceneInput,
  RequirementContext,
} from './types.js';

/**
 * Configuration for SceneManager
 */
export interface SceneManagerConfig {
  sceneRepo: SceneRepository;
  availabilityRepo: SceneAvailabilityRepository;
  connectionRepo: SceneConnectionRepository;
  gameRepo: GameRepository;
  eventEmitter?: SceneEventEmitter;
}

/**
 * Core service coordinating scene operations.
 *
 * Responsibilities:
 * - Create and manage scene lifecycle
 * - Track scene availability (unlocking)
 * - Update game state (current_scene_id)
 * - Emit scene events for other services
 * - Provide scene summaries
 */
export class SceneManager {
  private sceneRepo: SceneRepository;
  private availabilityRepo: SceneAvailabilityRepository;
  private connectionRepo: SceneConnectionRepository;
  private gameRepo: GameRepository;
  private eventEmitter: SceneEventEmitter | undefined;

  constructor(config: SceneManagerConfig) {
    this.sceneRepo = config.sceneRepo;
    this.availabilityRepo = config.availabilityRepo;
    this.connectionRepo = config.connectionRepo;
    this.gameRepo = config.gameRepo;
    this.eventEmitter = config.eventEmitter;
  }

  /**
   * Create a new scene.
   *
   * By default, the scene is automatically unlocked (made available) for the game.
   * Set autoUnlock to false to create a scene without making it immediately available.
   *
   * @param input - Scene creation parameters
   * @returns The created scene
   */
  createScene(input: CreateSceneManagedInput): Scene {
    // Build create input, only including defined properties
    const createInput: import('../../db/repositories/scene-repository.js').CreateSceneInput = {
      gameId: input.gameId,
      startedTurn: input.turn,
    };
    if (input.name !== undefined) createInput.name = input.name;
    if (input.description !== undefined) createInput.description = input.description;
    if (input.sceneType !== undefined) createInput.sceneType = input.sceneType;
    if (input.locationId !== undefined) createInput.locationId = input.locationId;
    if (input.mood !== undefined) createInput.mood = input.mood;
    if (input.stakes !== undefined) createInput.stakes = input.stakes;

    // Create the scene in the database
    const scene = this.sceneRepo.create(createInput);

    // Auto-unlock unless explicitly disabled
    if (input.autoUnlock !== false) {
      this.availabilityRepo.unlock(
        input.gameId,
        scene.id,
        input.turn,
        input.unlockedBy
      );
    }

    this.emitEvent({ type: 'scene:created', scene });

    return scene;
  }

  /**
   * Start a scene, making it the current active scene for the game.
   *
   * Updates the scene status and sets games.current_scene_id.
   * If the scene is not unlocked, it will be unlocked automatically.
   *
   * @param input - Start scene parameters
   * @returns The updated scene
   * @throws Error if scene not found
   */
  startScene(input: StartSceneInput): Scene {
    const scene = this.sceneRepo.findById(input.sceneId);
    if (!scene) {
      throw new Error(`Scene not found: ${input.sceneId}`);
    }

    if (scene.gameId !== input.gameId) {
      throw new Error(`Scene ${input.sceneId} does not belong to game ${input.gameId}`);
    }

    // Ensure scene is unlocked
    if (!this.availabilityRepo.isUnlocked(input.gameId, input.sceneId)) {
      this.availabilityRepo.unlock(input.gameId, input.sceneId, input.turn);
    }

    // Start the scene (updates status to active, records turn)
    this.sceneRepo.startScene(input.sceneId, input.turn);

    // Update the game's current scene
    this.gameRepo.setCurrentSceneId(input.gameId, input.sceneId);

    // Fetch the updated scene
    const updatedScene = this.sceneRepo.findById(input.sceneId)!;

    this.emitEvent({
      type: 'scene:started',
      scene: updatedScene,
      gameId: input.gameId,
    });

    return updatedScene;
  }

  /**
   * Complete a scene.
   *
   * Marks the scene as completed with the end turn and clears
   * the game's current_scene_id.
   *
   * @param input - Complete scene parameters
   * @returns The completed scene
   * @throws Error if scene not found
   */
  completeScene(input: CompleteSceneInput): Scene {
    const scene = this.sceneRepo.findById(input.sceneId);
    if (!scene) {
      throw new Error(`Scene not found: ${input.sceneId}`);
    }

    if (scene.gameId !== input.gameId) {
      throw new Error(`Scene ${input.sceneId} does not belong to game ${input.gameId}`);
    }

    // Complete the scene
    this.sceneRepo.completeScene(input.sceneId, input.turn);

    // Clear the game's current scene if this was the active one
    const currentSceneId = this.gameRepo.getCurrentSceneId(input.gameId);
    if (currentSceneId === input.sceneId) {
      this.gameRepo.setCurrentSceneId(input.gameId, null);
    }

    // Fetch the updated scene
    const completedScene = this.sceneRepo.findById(input.sceneId)!;

    this.emitEvent({
      type: 'scene:completed',
      scene: completedScene,
      gameId: input.gameId,
    });

    return completedScene;
  }

  /**
   * Get all available (unlocked) scenes for a game.
   *
   * Returns scenes that are both unlocked and have 'active' status.
   *
   * @param gameId - The game to query
   * @returns Array of available scenes
   */
  getAvailableScenes(gameId: string): Scene[] {
    return this.sceneRepo.findAvailable(gameId);
  }

  /**
   * Get a summary of a scene including metadata.
   *
   * @param gameId - The game context
   * @param sceneId - The scene to summarize
   * @returns Scene summary or null if not found
   */
  getSceneSummary(gameId: string, sceneId: string): SceneSummary | null {
    const scene = this.sceneRepo.findById(sceneId);
    if (!scene || scene.gameId !== gameId) {
      return null;
    }

    const eventCount = this.sceneRepo.countEventsInScene(sceneId);
    const currentSceneId = this.gameRepo.getCurrentSceneId(gameId);
    const unlockInfo = this.availabilityRepo.getUnlockInfo(gameId, sceneId);

    return {
      scene,
      eventCount,
      isCurrentScene: currentSceneId === sceneId,
      isUnlocked: unlockInfo !== null,
      unlockedTurn: unlockInfo?.unlockedTurn ?? null,
    };
  }

  /**
   * Get the current active scene for a game.
   *
   * @param gameId - The game to query
   * @returns The current scene or null if none is active
   */
  getCurrentScene(gameId: string): Scene | null {
    const sceneId = this.gameRepo.getCurrentSceneId(gameId);
    if (!sceneId) {
      return null;
    }
    return this.sceneRepo.findById(sceneId);
  }

  /**
   * Abandon a scene without completing it.
   *
   * @param gameId - The game context
   * @param sceneId - The scene to abandon
   * @returns The abandoned scene
   * @throws Error if scene not found
   */
  abandonScene(gameId: string, sceneId: string): Scene {
    const scene = this.sceneRepo.findById(sceneId);
    if (!scene) {
      throw new Error(`Scene not found: ${sceneId}`);
    }

    if (scene.gameId !== gameId) {
      throw new Error(`Scene ${sceneId} does not belong to game ${gameId}`);
    }

    this.sceneRepo.abandonScene(sceneId);

    // Clear the game's current scene if this was the active one
    const currentSceneId = this.gameRepo.getCurrentSceneId(gameId);
    if (currentSceneId === sceneId) {
      this.gameRepo.setCurrentSceneId(gameId, null);
    }

    const abandonedScene = this.sceneRepo.findById(sceneId)!;

    this.emitEvent({
      type: 'scene:abandoned',
      scene: abandonedScene,
      gameId,
    });

    return abandonedScene;
  }

  /**
   * Unlock a scene without starting it.
   *
   * @param gameId - The game context
   * @param sceneId - The scene to unlock
   * @param turn - The turn when unlocked
   * @param unlockedBy - Optional entity/event that triggered the unlock
   */
  unlockScene(
    gameId: string,
    sceneId: string,
    turn: number,
    unlockedBy?: string
  ): void {
    const scene = this.sceneRepo.findById(sceneId);
    if (!scene) {
      throw new Error(`Scene not found: ${sceneId}`);
    }

    if (scene.gameId !== gameId) {
      throw new Error(`Scene ${sceneId} does not belong to game ${gameId}`);
    }

    this.availabilityRepo.unlock(gameId, sceneId, turn, unlockedBy);
  }

  /**
   * Check if a scene is unlocked.
   *
   * @param gameId - The game context
   * @param sceneId - The scene to check
   * @returns True if the scene is unlocked
   */
  isSceneUnlocked(gameId: string, sceneId: string): boolean {
    return this.availabilityRepo.isUnlocked(gameId, sceneId);
  }

  /**
   * Get scenes reachable from the current scene via connections.
   *
   * @param gameId - The game context
   * @param sceneId - The source scene
   * @returns Array of connected scenes that are unlocked
   */
  getConnectedScenes(gameId: string, sceneId: string): Scene[] {
    const connections = this.connectionRepo.getUnlockedConnections(gameId, sceneId);
    const scenes: Scene[] = [];

    for (const conn of connections) {
      const scene = this.sceneRepo.findById(conn.toSceneId);
      if (scene) {
        scenes.push(scene);
      }
    }

    return scenes;
  }

  /**
   * Evaluate scene connection requirements against current game state.
   *
   * Requirements are ANDed together:
   * - All specified flags must be set (true)
   * - All specified traits must be present on the player
   * - All relationship thresholds must be met
   *
   * @param requirements - The connection requirements to evaluate (null/undefined = always passes)
   * @param context - The current game state context
   * @returns true if all requirements are met, false otherwise
   */
  evaluateRequirements(
    requirements: ConnectionRequirements | null | undefined,
    context: RequirementContext
  ): boolean {
    // Null/undefined requirements always pass
    if (!requirements) {
      return true;
    }

    // Check flags: all must be set (true)
    if (requirements.flags && requirements.flags.length > 0) {
      for (const flag of requirements.flags) {
        if (!context.flags[flag]) {
          return false;
        }
      }
    }

    // Check traits: player must have all specified traits
    if (requirements.traits && requirements.traits.length > 0) {
      for (const trait of requirements.traits) {
        if (!context.playerTraits.includes(trait)) {
          return false;
        }
      }
    }

    // Check relationships: dimension values must meet thresholds
    if (requirements.relationships && requirements.relationships.length > 0) {
      for (const req of requirements.relationships) {
        // Find matching relationship (player -> target entity)
        const relationship = context.relationships.find(
          r =>
            r.from.type === 'player' &&
            r.to.type === req.entityType &&
            r.to.id === req.entityId
        );

        // Missing relationship fails the requirement
        if (!relationship) {
          return false;
        }

        // Get the dimension value
        const value = relationship[req.dimension];

        // Check minValue if specified
        if (req.minValue !== undefined && value < req.minValue) {
          return false;
        }

        // Check maxValue if specified
        if (req.maxValue !== undefined && value > req.maxValue) {
          return false;
        }
      }
    }

    // All requirements passed
    return true;
  }

  private emitEvent(event: import('./types.js').SceneEvent): void {
    if (this.eventEmitter) {
      this.eventEmitter.emit(event);
    }
  }
}
