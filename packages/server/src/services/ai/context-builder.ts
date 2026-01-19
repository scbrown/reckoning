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
import type { EntityType } from '../../db/repositories/trait-repository.js';
import type { EntitySummary, AggregateLabel } from '../evolution/types.js';
import type {
  PlayerPatterns,
  SocialApproach,
} from '../chronicle/types.js';

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
 * Character role within a party
 */
export type CharacterRole = 'player' | 'member' | 'companion';

/**
 * Character with role information for party context
 */
export interface CharacterWithRole extends Character {
  role: CharacterRole;
}

/**
 * Repository for party member operations
 */
export interface PartyRepository {
  findByGame(gameId: string): CharacterWithRole[];
}

/**
 * Repository for entity evolution data (traits and relationships)
 */
export interface EvolutionRepository {
  /**
   * Get evolution summary for an entity
   */
  getEntitySummary(gameId: string, entityType: EntityType, entityId: string): EntitySummary;
}

/**
 * Evolution context for a named entity
 */
export interface EntityEvolutionContext {
  /** Entity name for display */
  name: string;
  /** Entity ID */
  id: string;
  /** Active traits */
  traits: string[];
  /** Relationships with aggregate labels */
  relationships: Array<{
    targetName: string;
    targetId: string;
    label: AggregateLabel;
  }>;
}

/**
 * Repository for player behavior pattern analysis
 */
export interface PatternRepository {
  /**
   * Get player behavior patterns
   */
  getPlayerPatterns(gameId: string, playerId: string): PlayerPatterns;
}

/**
 * Player behavior context formatted for AI consumption
 */
export interface PlayerBehaviorContext {
  /** Mercy ratio as percentage (0-100) */
  mercyPercent: number;
  /** Honesty ratio as percentage (0-100) */
  honestyPercent: number;
  /** Social approach classification */
  socialApproach: SocialApproach;
  /** Inferred dominant personality traits */
  dominantTraits: string[];
  /** Whether the player has enough history for reliable analysis */
  hasEnoughData: boolean;
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

  findByGame(gameId: string): CharacterWithRole[] {
    // Query characters through parties table to get by game_id
    const rows = this.db
      .prepare(
        `SELECT c.id, c.name, c.description, c.class, c.role, c.stats
         FROM characters c
         JOIN parties p ON c.party_id = p.id
         WHERE p.game_id = ?`
      )
      .all(gameId) as Array<{
      id: string;
      name: string;
      description: string | null;
      class: string | null;
      role: string;
      stats: string | null;
    }>;

    return rows.map((row) => {
      let stats = { health: 100, maxHealth: 100 };
      if (row.stats) {
        try {
          stats = JSON.parse(row.stats);
        } catch {
          // Use default stats if parsing fails
        }
      }
      return {
        id: row.id,
        name: row.name,
        description: row.description ?? '',
        class: row.class ?? 'Adventurer',
        role: row.role as CharacterRole,
        stats,
      };
    });
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
  /** Party members with role information */
  party: CharacterWithRole[];
  /** NPCs present in the current area */
  npcsPresent: NPC[];
  /** Player character evolution (traits and relationships) */
  playerEvolution?: EntityEvolutionContext;
  /** Party member evolutions (traits and relationships) */
  partyEvolutions?: EntityEvolutionContext[];
  /** NPC evolutions for NPCs in current area */
  npcEvolutions?: EntityEvolutionContext[];
  /** Player behavior patterns (mercy, honesty, social approach, traits) */
  playerBehavior?: PlayerBehaviorContext;
  /** Formatted player behavior context for AI prompts */
  formattedPlayerBehavior?: string;
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
// Party Context Formatting
// =============================================================================

/**
 * Health status thresholds
 * - Healthy: >70%
 * - Wounded: >30% and <=70%
 * - Critical: <=30%
 */
export type HealthStatus = 'Healthy' | 'Wounded' | 'Critical';

/**
 * Get health status based on current/max health
 */
export function getHealthStatus(health: number, maxHealth: number): HealthStatus {
  if (maxHealth <= 0) return 'Healthy';
  const percent = (health / maxHealth) * 100;
  if (percent > 70) return 'Healthy';
  if (percent > 30) return 'Wounded';
  return 'Critical';
}

/**
 * Build formatted party context for AI consumption
 *
 * Format: "Party: Name (Class) [Health Status] (Player Character), Name (Class) [Health Status]"
 * Player character is marked with "(Player Character)"
 *
 * @param party - Party members with role information
 * @returns Formatted party context string
 */
export function buildPartyContext(party: CharacterWithRole[]): string {
  if (party.length === 0) {
    return 'Party: (empty)';
  }

  const formattedMembers = party.map((member) => {
    const healthStatus = getHealthStatus(member.stats.health, member.stats.maxHealth);
    const playerMarker = member.role === 'player' ? ' (Player Character)' : '';
    return `${member.name} (${member.class}) [${healthStatus}]${playerMarker}`;
  });

  return `Party: ${formattedMembers.join(', ')}`;
}

// =============================================================================
// Player Behavior Context Formatting
// =============================================================================

/**
 * Convert a ratio (-1 to 1) to a percentage (0 to 100)
 * A ratio of 1 means 100% positive, -1 means 0% positive (100% negative)
 */
export function ratioToPercent(ratio: number): number {
  // ratio of 1 = 100%, ratio of -1 = 0%, ratio of 0 = 50%
  return Math.round((ratio + 1) * 50);
}

/**
 * Get a descriptive label for a ratio
 */
function getRatioDescription(percent: number, positiveTrait: string, negativeTrait: string): string {
  if (percent >= 70) return `tends toward ${positiveTrait}`;
  if (percent >= 55) return `slightly ${positiveTrait}`;
  if (percent >= 45) return 'balanced';
  if (percent >= 30) return `slightly ${negativeTrait}`;
  return `tends toward ${negativeTrait}`;
}

/**
 * Convert PlayerPatterns to PlayerBehaviorContext
 */
export function patternsToContext(patterns: PlayerPatterns): PlayerBehaviorContext {
  const { ratios, socialApproach, dominantTraits, totalEvents } = patterns;

  return {
    mercyPercent: ratioToPercent(ratios.mercyVsViolence),
    honestyPercent: ratioToPercent(ratios.honestyVsDeception),
    socialApproach,
    dominantTraits,
    hasEnoughData: totalEvents >= 5,
  };
}

/**
 * Format player behavior context for AI prompts
 *
 * Format:
 * ```
 * Player behavioral patterns:
 * - Shows mercy: 73% of the time
 * - Honesty: 45% (tends toward deception)
 * - Social approach: diplomatic
 * - Inferred traits: merciful, cunning
 * ```
 *
 * @param behavior - Player behavior context
 * @returns Formatted string for AI consumption, or undefined if insufficient data
 */
export function formatPlayerBehavior(behavior: PlayerBehaviorContext): string | undefined {
  if (!behavior.hasEnoughData) {
    return undefined;
  }

  const lines: string[] = ['Player behavioral patterns:'];

  // Mercy/violence spectrum
  const mercyDesc = getRatioDescription(behavior.mercyPercent, 'mercy', 'violence');
  lines.push(`- Shows mercy: ${behavior.mercyPercent}% of the time (${mercyDesc})`);

  // Honesty/deception spectrum
  const honestyDesc = getRatioDescription(behavior.honestyPercent, 'honesty', 'deception');
  lines.push(`- Honesty: ${behavior.honestyPercent}% (${honestyDesc})`);

  // Social approach
  if (behavior.socialApproach !== 'minimal') {
    lines.push(`- Social approach: ${behavior.socialApproach}`);
  }

  // Dominant traits
  if (behavior.dominantTraits.length > 0) {
    lines.push(`- Inferred traits: ${behavior.dominantTraits.join(', ')}`);
  }

  return lines.join('\n');
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
    private partyRepo: PartyRepository,
    private evolutionRepo?: EvolutionRepository,
    private patternRepo?: PatternRepository
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

    // 7. Build formatted party context
    const formattedPartyContext = buildPartyContext(party);

    // 8. Build evolution context if repository available
    let playerEvolution: EntityEvolutionContext | undefined;
    let partyEvolutions: EntityEvolutionContext[] | undefined;
    let npcEvolutions: EntityEvolutionContext[] | undefined;

    if (this.evolutionRepo) {
      // Build name lookup map for resolving relationship target names
      const nameMap = new Map<string, string>();
      for (const member of party) {
        nameMap.set(member.id, member.name);
      }
      for (const npc of area.npcs) {
        nameMap.set(npc.id, npc.name);
      }

      // Helper to convert EntitySummary to EntityEvolutionContext
      const toEvolutionContext = (
        summary: EntitySummary,
        name: string
      ): EntityEvolutionContext => ({
        name,
        id: summary.entityId,
        traits: summary.traits,
        relationships: summary.relationships.map((rel) => ({
          targetName: nameMap.get(rel.targetId) ?? rel.targetId,
          targetId: rel.targetId,
          label: rel.label,
        })),
      });

      // Get player evolution (player has role 'player')
      const player = party.find((m) => m.role === 'player');
      if (player) {
        const summary = this.evolutionRepo.getEntitySummary(gameId, 'player', player.id);
        playerEvolution = toEvolutionContext(summary, player.name);
      }

      // Get party member evolutions (non-player members)
      const nonPlayerMembers = party.filter((m) => m.role !== 'player');
      if (nonPlayerMembers.length > 0) {
        partyEvolutions = nonPlayerMembers.map((member) => {
          const summary = this.evolutionRepo!.getEntitySummary(gameId, 'character', member.id);
          return toEvolutionContext(summary, member.name);
        });
      }

      // Get NPC evolutions for NPCs in current area
      if (area.npcs.length > 0) {
        npcEvolutions = area.npcs.map((npc) => {
          const summary = this.evolutionRepo!.getEntitySummary(gameId, 'npc', npc.id);
          return toEvolutionContext(summary, npc.name);
        });
      }
    }

    // 9. Build player behavior context if repository available
    let playerBehavior: PlayerBehaviorContext | undefined;
    let formattedPlayerBehavior: string | undefined;

    if (this.patternRepo) {
      const player = party.find((m) => m.role === 'player');
      if (player) {
        const patterns = this.patternRepo.getPlayerPatterns(gameId, player.id);
        playerBehavior = patternsToContext(patterns);
        formattedPlayerBehavior = formatPlayerBehavior(playerBehavior);
      }
    }

    // 10. Return complete context
    const context: ExtendedGenerationContext = {
      type,
      gameState: game,
      recentHistory,
      formattedPartyContext,
      currentArea: area,
      party,
      npcsPresent: area.npcs,
    };

    // Add optional fields
    if (historyContext !== undefined) {
      context.historyContext = historyContext;
    }
    if (options?.dmGuidance !== undefined) {
      context.dmGuidance = options.dmGuidance;
    }
    if (playerEvolution) {
      context.playerEvolution = playerEvolution;
    }
    if (partyEvolutions && partyEvolutions.length > 0) {
      context.partyEvolutions = partyEvolutions;
    }
    if (npcEvolutions && npcEvolutions.length > 0) {
      context.npcEvolutions = npcEvolutions;
    }
    if (playerBehavior) {
      context.playerBehavior = playerBehavior;
    }
    if (formattedPlayerBehavior) {
      context.formattedPlayerBehavior = formattedPlayerBehavior;
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
 * Options for creating a context builder
 */
export interface ContextBuilderOptions {
  /** Optional evolution repository for traits and relationships */
  evolutionRepo?: EvolutionRepository;
  /** Optional pattern repository for player behavior analysis */
  patternRepo?: PatternRepository;
}

/**
 * Create a context builder with injected database dependencies
 *
 * @param db - The database connection
 * @param options - Optional configuration including evolution and pattern repositories
 * @returns A configured ContextBuilder instance
 */
export function createContextBuilder(
  db: Database,
  options?: ContextBuilderOptions
): ContextBuilder {
  return new DefaultContextBuilder(
    new SQLiteGameRepository(db),
    new SQLiteEventRepository(db),
    new SQLiteAreaRepository(db),
    new SQLitePartyRepository(db),
    options?.evolutionRepo,
    options?.patternRepo
  );
}
