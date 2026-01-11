/**
 * Context Builder
 *
 * Assembles GenerationContext from game state by querying repositories.
 * Extension point for future summarization strategies.
 */

import type { Database } from 'better-sqlite3';
import type {
  GenerationContext,
  GenerationType,
  GameState,
  Area,
  AreaExit,
  AreaObject,
  Character,
  NPC,
  CanonicalEvent,
} from '@reckoning/shared';

// =============================================================================
// Repository Interfaces
// =============================================================================

/**
 * Repository for game state operations
 */
export interface GameRepository {
  findById(gameId: string): GameState | undefined;
}

/**
 * Repository for event/history operations
 */
export interface EventRepository {
  getRecentContext(gameId: string, limit?: number): CanonicalEvent[];
}

/**
 * Area with resolved references (exits, objects, NPCs)
 */
export interface AreaWithDetails extends Area {
  exits: AreaExit[];
  objects: AreaObject[];
  npcs: NPC[];
}

/**
 * Repository for area operations
 */
export interface AreaRepository {
  getWithDetails(areaId: string): AreaWithDetails | undefined;
}

/**
 * Repository for party member operations
 */
export interface PartyRepository {
  findByGame(gameId: string): Character[];
}

// =============================================================================
// Repository Implementations
// =============================================================================

/**
 * SQLite implementation of GameRepository
 */
class SQLiteGameRepository implements GameRepository {
  constructor(private db: Database) {}

  findById(gameId: string): GameState | undefined {
    const row = this.db
      .prepare(
        `SELECT id, player_id, current_area_id, turn, created_at, updated_at
         FROM games WHERE id = ?`
      )
      .get(gameId) as
      | {
          id: string;
          player_id: string;
          current_area_id: string;
          turn: number;
          created_at: string;
          updated_at: string;
        }
      | undefined;

    if (!row) return undefined;

    return {
      id: row.id,
      playerId: row.player_id,
      currentAreaId: row.current_area_id,
      turn: row.turn,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}

/**
 * SQLite implementation of EventRepository
 */
class SQLiteEventRepository implements EventRepository {
  constructor(private db: Database) {}

  getRecentContext(gameId: string, limit = 50): CanonicalEvent[] {
    const rows = this.db
      .prepare(
        `SELECT id, game_id, turn, timestamp, event_type, content,
                original_generated, speaker, location_id, witnesses
         FROM events
         WHERE game_id = ?
         ORDER BY turn DESC, timestamp DESC
         LIMIT ?`
      )
      .all(gameId, limit) as Array<{
      id: string;
      game_id: string;
      turn: number;
      timestamp: string;
      event_type: string;
      content: string;
      original_generated: string | null;
      speaker: string | null;
      location_id: string;
      witnesses: string | null;
    }>;

    // Return in chronological order (oldest first)
    return rows.reverse().map((row) => {
      const event: CanonicalEvent = {
        id: row.id,
        gameId: row.game_id,
        turn: row.turn,
        timestamp: row.timestamp,
        eventType: row.event_type as CanonicalEvent['eventType'],
        content: row.content,
        locationId: row.location_id,
        witnesses: row.witnesses ? JSON.parse(row.witnesses) : [],
      };
      if (row.original_generated !== null) {
        event.originalGenerated = row.original_generated;
      }
      if (row.speaker !== null) {
        event.speaker = row.speaker;
      }
      return event;
    });
  }
}

/**
 * SQLite implementation of AreaRepository
 */
class SQLiteAreaRepository implements AreaRepository {
  constructor(private db: Database) {}

  getWithDetails(areaId: string): AreaWithDetails | undefined {
    // Fetch area
    const areaRow = this.db
      .prepare('SELECT id, name, description, tags FROM areas WHERE id = ?')
      .get(areaId) as
      | { id: string; name: string; description: string; tags: string | null }
      | undefined;

    if (!areaRow) return undefined;

    // Fetch exits
    const exitRows = this.db
      .prepare(
        `SELECT direction, target_area_id, description, locked
         FROM area_exits WHERE area_id = ?`
      )
      .all(areaId) as Array<{
      direction: string;
      target_area_id: string;
      description: string | null;
      locked: number;
    }>;

    // Fetch objects
    const objectRows = this.db
      .prepare(
        `SELECT id, name, description, interactable, tags
         FROM area_objects WHERE area_id = ?`
      )
      .all(areaId) as Array<{
      id: string;
      name: string;
      description: string | null;
      interactable: number;
      tags: string | null;
    }>;

    // Fetch NPCs in this area
    const npcRows = this.db
      .prepare(
        `SELECT id, name, description, current_area_id, disposition, tags
         FROM npcs WHERE current_area_id = ?`
      )
      .all(areaId) as Array<{
      id: string;
      name: string;
      description: string | null;
      current_area_id: string;
      disposition: string;
      tags: string | null;
    }>;

    const exits: AreaExit[] = exitRows.map((row) => ({
      direction: row.direction,
      targetAreaId: row.target_area_id,
      description: row.description ?? '',
      locked: row.locked === 1,
    }));

    const objects: AreaObject[] = objectRows.map((row) => ({
      id: row.id,
      name: row.name,
      description: row.description ?? '',
      interactable: row.interactable === 1,
      tags: row.tags ? JSON.parse(row.tags) : [],
    }));

    const npcs: NPC[] = npcRows.map((row) => ({
      id: row.id,
      name: row.name,
      description: row.description ?? '',
      currentAreaId: row.current_area_id,
      disposition: row.disposition as NPC['disposition'],
      tags: row.tags ? JSON.parse(row.tags) : [],
    }));

    return {
      id: areaRow.id,
      name: areaRow.name,
      description: areaRow.description,
      tags: areaRow.tags ? JSON.parse(areaRow.tags) : [],
      exits,
      objects,
      npcs,
    };
  }
}

/**
 * SQLite implementation of PartyRepository
 */
class SQLitePartyRepository implements PartyRepository {
  constructor(private db: Database) {}

  findByGame(gameId: string): Character[] {
    const rows = this.db
      .prepare(
        `SELECT id, name, description, class
         FROM party_members WHERE game_id = ?`
      )
      .all(gameId) as Array<{
      id: string;
      name: string;
      description: string | null;
      class: string | null;
    }>;

    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      description: row.description ?? '',
      class: row.class ?? 'Adventurer',
      stats: {
        health: 100,
        maxHealth: 100,
      },
    }));
  }
}

// =============================================================================
// Context Builder Options
// =============================================================================

/**
 * Options for building generation context
 */
export interface ContextBuildOptions {
  /** Optional DM guidance or constraints */
  dmGuidance?: string;
  /** Target NPC ID for npc_response type */
  targetNpcId?: string;
  /** Triggering event ID for npc_response type */
  triggeringEventId?: string;
}

// =============================================================================
// Extended Generation Context
// =============================================================================

/**
 * Extended context with resolved references
 */
export interface ExtendedGenerationContext extends GenerationContext {
  /** Current area with full details */
  currentArea: AreaWithDetails;
  /** Party members */
  party: Character[];
  /** NPCs present in the current area */
  npcsPresent: NPC[];
}

// =============================================================================
// Context Builder Interface
// =============================================================================

/**
 * Interface for building generation context from game state
 */
export interface ContextBuilder {
  /**
   * Build a generation context from the game state
   * @param gameId - ID of the game
   * @param type - Type of content to generate
   * @param options - Additional options
   * @returns The built context with resolved references
   */
  build(
    gameId: string,
    type: GenerationType,
    options?: ContextBuildOptions
  ): Promise<ExtendedGenerationContext>;

  /**
   * Extension point for summarizing history
   * @param events - Events to summarize
   * @returns Summarized history text, or undefined for no summarization
   */
  summarizeHistory?(events: CanonicalEvent[]): string | undefined;
}

// =============================================================================
// Default Context Builder Implementation
// =============================================================================

/**
 * Default implementation of ContextBuilder that fetches all data from repositories
 */
export class DefaultContextBuilder implements ContextBuilder {
  constructor(
    private gameRepo: GameRepository,
    private eventRepo: EventRepository,
    private areaRepo: AreaRepository,
    private partyRepo: PartyRepository
  ) {}

  async build(
    gameId: string,
    type: GenerationType,
    options?: ContextBuildOptions
  ): Promise<ExtendedGenerationContext> {
    // 1. Fetch game state
    const game = this.gameRepo.findById(gameId);
    if (!game) {
      throw new Error(`Game not found: ${gameId}`);
    }

    // 2. Fetch current area with details
    const area = this.areaRepo.getWithDetails(game.currentAreaId);
    if (!area) {
      throw new Error(`Area not found: ${game.currentAreaId}`);
    }

    // 3. Fetch party members
    const party = this.partyRepo.findByGame(gameId);

    // 4. Fetch recent history
    const recentEvents = this.eventRepo.getRecentContext(gameId);

    // 5. Convert events to string format for GenerationContext
    const recentHistory = recentEvents.map((event) => {
      const prefix = event.speaker ? `${event.speaker}: ` : '';
      return `[${event.eventType}] ${prefix}${event.content}`;
    });

    // 6. Build history context (extension point for summarization)
    const historyContext = this.summarizeHistory?.(recentEvents);

    // 7. Return complete context
    const context: ExtendedGenerationContext = {
      type,
      gameState: game,
      recentHistory,
      currentArea: area,
      party,
      npcsPresent: area.npcs,
    };

    if (historyContext !== undefined) {
      context.historyContext = historyContext;
    }
    if (options?.dmGuidance !== undefined) {
      context.dmGuidance = options.dmGuidance;
    }

    return context;
  }

  /**
   * Extension point for history summarization
   *
   * Default implementation returns undefined (use full history).
   * Override this method to implement summarization strategies.
   */
  summarizeHistory?(_events: CanonicalEvent[]): string | undefined {
    // Default: no summarization
    return undefined;
  }
}

// =============================================================================
// Factory Function
// =============================================================================

/**
 * Create a context builder with injected database dependencies
 *
 * @param db - The database connection
 * @returns A configured ContextBuilder instance
 */
export function createContextBuilder(db: Database): ContextBuilder {
  return new DefaultContextBuilder(
    new SQLiteGameRepository(db),
    new SQLiteEventRepository(db),
    new SQLiteAreaRepository(db),
    new SQLitePartyRepository(db)
  );
}
