/**
 * JSON Exporter Service
 *
 * Exports complete game state as a single JSON file for API transfer and backup.
 * Supports optional gzip compression for reduced file size.
 *
 * @see docs/export-format-specification.md
 */

import { gzipSync } from 'zlib';
import type Database from 'better-sqlite3';
import { version as packageVersion } from '../../../package.json';
import {
  GameRepository,
  EventRepository,
  AreaRepository,
  PartyRepository,
  RelationshipRepository,
  TraitRepository,
  PendingEvolutionRepository,
  EmergenceNotificationRepository,
  SceneRepository,
  SceneConnectionRepository,
  SceneAvailabilityRepository,
} from '../../db/repositories/index.js';
import type { Character } from '@reckoning/shared/game';
import {
  EXPORT_FORMAT_VERSION,
  EXPORT_FORMAT_NAME,
  type JsonExportOptions,
  type JsonExport,
  type JsonExportResult,
  type ExportedGame,
  type ExportedCharacter,
  type ExportedParty,
  type ExportedNPC,
  type ExportedArea,
  type ExportedAreaExit,
  type ExportedAreaObject,
  type ExportedScenes,
  type ExportedScene,
  type ExportedSceneConnection,
  type ExportedSceneAvailability,
  type ExportedTraits,
  type ExportedTraitCatalogEntry,
  type ExportedEntityTrait,
  type ExportedRelationship,
  type ExportedEvent,
  type ExportedPendingEvolution,
  type ExportedEmergenceNotification,
  type ExportedFlags,
} from './types.js';

/**
 * Configuration for the JSON exporter
 */
export interface JsonExporterConfig {
  /** Database connection */
  db: Database.Database;
}

/**
 * JSON Exporter for game state
 *
 * Exports complete game state as a single JSON file. Supports:
 * - Full game state including player, party, NPCs, areas
 * - Scenes, connections, and availability
 * - Traits and relationships (Entity Evolution system)
 * - Events (optionally with limit)
 * - Pending evolutions and emergence notifications
 * - Optional gzip compression
 */
export class JsonExporter {
  private gameRepo: GameRepository;
  private eventRepo: EventRepository;
  private areaRepo: AreaRepository;
  private partyRepo: PartyRepository;
  private relationshipRepo: RelationshipRepository;
  private traitRepo: TraitRepository;
  private pendingEvolutionRepo: PendingEvolutionRepository;
  private emergenceNotificationRepo: EmergenceNotificationRepository;
  private sceneRepo: SceneRepository;
  private sceneConnectionRepo: SceneConnectionRepository;
  private sceneAvailabilityRepo: SceneAvailabilityRepository;
  private db: Database.Database;

  constructor(config: JsonExporterConfig) {
    this.db = config.db;
    this.gameRepo = new GameRepository(config.db);
    this.eventRepo = new EventRepository(config.db);
    this.areaRepo = new AreaRepository(config.db);
    this.partyRepo = new PartyRepository(config.db);
    this.relationshipRepo = new RelationshipRepository(config.db);
    this.traitRepo = new TraitRepository(config.db);
    this.pendingEvolutionRepo = new PendingEvolutionRepository(config.db);
    this.emergenceNotificationRepo = new EmergenceNotificationRepository(config.db);
    this.sceneRepo = new SceneRepository(config.db);
    this.sceneConnectionRepo = new SceneConnectionRepository(config.db);
    this.sceneAvailabilityRepo = new SceneAvailabilityRepository(config.db);
  }

  /**
   * Export a game to JSON format
   *
   * @param gameId - The game ID to export
   * @param options - Export options
   * @returns Export result with data and metadata
   * @throws Error if game not found
   */
  async export(gameId: string, options: JsonExportOptions = {}): Promise<JsonExportResult> {
    const {
      includeEvents = true,
      eventLimit = null,
      includePending = true,
      includeNotifications = true,
      compressed = false,
    } = options;

    // Fetch game state
    const gameState = this.gameRepo.findById(gameId);
    if (!gameState) {
      throw new Error(`Game not found: ${gameId}`);
    }

    // Get current scene ID
    const currentSceneId = this.gameRepo.getCurrentSceneId(gameId);

    // Build export structure
    const exportData: JsonExport = {
      export: {
        version: EXPORT_FORMAT_VERSION,
        format: EXPORT_FORMAT_NAME,
        exportedAt: new Date().toISOString(),
        gameId,
        source: {
          reckoningVersion: packageVersion || '0.0.0',
          platform: process.platform,
        },
        options: {
          includeEvents,
          eventLimit,
          compressed,
        },
      },
      game: this.buildGameExport(gameState, currentSceneId),
      player: null,
      party: null,
      npcs: this.exportNPCs(gameId),
      areas: this.exportAreas(),
      scenes: this.exportScenes(gameId, currentSceneId),
      traits: this.exportTraits(gameId),
      relationships: this.exportRelationships(gameId),
      flags: this.exportFlags(gameId),
    };

    // Export player and party
    const partyData = this.exportParty(gameId);
    if (partyData) {
      exportData.party = partyData.party;
      exportData.player = partyData.player;
    }

    // Optional: events
    if (includeEvents) {
      exportData.events = this.exportEvents(gameId, eventLimit);
    }

    // Optional: pending evolutions
    if (includePending) {
      exportData.pendingEvolutions = this.exportPendingEvolutions(gameId);
    }

    // Optional: emergence notifications
    if (includeNotifications) {
      exportData.emergenceNotifications = this.exportEmergenceNotifications(gameId);
    }

    // Serialize to JSON
    const jsonString = JSON.stringify(exportData, null, 2);

    // Compress if requested
    if (compressed) {
      const compressedData = gzipSync(jsonString);
      return {
        data: compressedData,
        compressed: true,
        contentType: 'application/gzip',
        filename: `reckoning-export-${gameId}.json.gz`,
      };
    }

    return {
      data: jsonString,
      compressed: false,
      contentType: 'application/json',
      filename: `reckoning-export-${gameId}.json`,
    };
  }

  /**
   * Build game export object
   */
  private buildGameExport(
    gameState: { id: string; playerId: string; currentAreaId: string; turn: number; createdAt: string; updatedAt: string; pixelsrcProject?: string; act?: number },
    currentSceneId: string | null
  ): ExportedGame {
    return {
      id: gameState.id,
      createdAt: gameState.createdAt,
      updatedAt: gameState.updatedAt,
      turn: gameState.turn,
      currentAreaId: gameState.currentAreaId,
      currentSceneId,
      pixelsrcProject: gameState.pixelsrcProject || null,
      act: gameState.act || null,
    };
  }

  /**
   * Export party and player character
   */
  private exportParty(gameId: string): { party: ExportedParty; player: ExportedCharacter | null } | null {
    const parties = this.partyRepo.findByGameId(gameId);
    if (parties.length === 0) return null;

    // Use the first party (games typically have one party)
    const party = parties[0];
    let player: ExportedCharacter | null = null;

    const members: ExportedCharacter[] = party.members.map((member: Character) => {
      const exported = this.buildCharacterExport(member);
      // Find the player (role check via character repository pattern)
      // For now, the first member is typically the player
      if (!player) {
        player = exported;
      }
      return exported;
    });

    return {
      party: {
        id: party.id,
        members,
      },
      player,
    };
  }

  /**
   * Build character export object
   */
  private buildCharacterExport(character: Character): ExportedCharacter {
    return {
      id: character.id,
      name: character.name,
      description: character.description || '',
      class: character.class || '',
      stats: {
        health: character.stats?.health ?? 100,
        maxHealth: character.stats?.maxHealth ?? 100,
        ...character.stats,
      },
      voiceId: character.voiceId || null,
      pixelArtRef: character.pixelArtRef ? {
        path: character.pixelArtRef.path,
        spriteName: character.pixelArtRef.spriteName,
        animation: character.pixelArtRef.animation,
      } : null,
    };
  }

  /**
   * Export all NPCs
   */
  private exportNPCs(gameId: string): ExportedNPC[] {
    // NPCs are stored globally, not per-game in the current schema
    // We need to query NPCs directly
    const rows = this.db.prepare(`
      SELECT id, name, description, current_area_id, disposition, tags
      FROM npcs
    `).all() as Array<{
      id: string;
      name: string;
      description: string | null;
      current_area_id: string;
      disposition: string;
      tags: string | null;
    }>;

    return rows.map(row => ({
      id: row.id,
      name: row.name,
      description: row.description || '',
      currentAreaId: row.current_area_id,
      disposition: row.disposition,
      tags: row.tags ? JSON.parse(row.tags) : [],
      pixelArtRef: null,
    }));
  }

  /**
   * Export all areas with exits and objects
   */
  private exportAreas(): ExportedArea[] {
    // Areas are stored globally
    const areaRows = this.db.prepare(`
      SELECT id, name, description, tags
      FROM areas
    `).all() as Array<{
      id: string;
      name: string;
      description: string;
      tags: string | null;
    }>;

    return areaRows.map(areaRow => {
      // Get exits for this area
      const exitRows = this.db.prepare(`
        SELECT direction, target_area_id, description, locked
        FROM area_exits
        WHERE area_id = ?
      `).all(areaRow.id) as Array<{
        direction: string;
        target_area_id: string;
        description: string | null;
        locked: number;
      }>;

      const exits: ExportedAreaExit[] = exitRows.map(e => ({
        direction: e.direction,
        targetAreaId: e.target_area_id,
        description: e.description || '',
        locked: e.locked === 1,
      }));

      // Get objects for this area
      const objectRows = this.db.prepare(`
        SELECT id, name, description, interactable, tags
        FROM area_objects
        WHERE area_id = ?
      `).all(areaRow.id) as Array<{
        id: string;
        name: string;
        description: string | null;
        interactable: number;
        tags: string | null;
      }>;

      const objects: ExportedAreaObject[] = objectRows.map(o => ({
        id: o.id,
        name: o.name,
        description: o.description || '',
        interactable: o.interactable === 1,
        tags: o.tags ? JSON.parse(o.tags) : [],
      }));

      return {
        id: areaRow.id,
        name: areaRow.name,
        description: areaRow.description,
        tags: areaRow.tags ? JSON.parse(areaRow.tags) : [],
        exits,
        objects,
        pixelArtRef: null,
      };
    });
  }

  /**
   * Export scenes, connections, and availability
   */
  private exportScenes(gameId: string, currentSceneId: string | null): ExportedScenes {
    // Get all scenes for this game
    const scenes = this.sceneRepo.findByGame(gameId);
    const exportedScenes: ExportedScene[] = scenes.map(scene => ({
      id: scene.id,
      gameId: scene.gameId,
      name: scene.name,
      description: scene.description,
      sceneType: scene.sceneType,
      locationId: scene.locationId,
      startedTurn: scene.startedTurn,
      completedTurn: scene.completedTurn,
      status: scene.status,
      mood: scene.mood,
      stakes: scene.stakes,
      createdAt: scene.createdAt,
      updatedAt: scene.updatedAt,
    }));

    // Get all scene connections for this game
    const connectionRows = this.db.prepare(`
      SELECT id, game_id, from_scene_id, to_scene_id, requirements, connection_type, description, created_at
      FROM scene_connections
      WHERE game_id = ?
    `).all(gameId) as Array<{
      id: string;
      game_id: string;
      from_scene_id: string;
      to_scene_id: string;
      requirements: string | null;
      connection_type: string;
      description: string | null;
      created_at: string;
    }>;

    const connections: ExportedSceneConnection[] = connectionRows.map(row => ({
      id: row.id,
      gameId: row.game_id,
      fromSceneId: row.from_scene_id,
      toSceneId: row.to_scene_id,
      connectionType: row.connection_type,
      description: row.description,
      requirements: row.requirements ? JSON.parse(row.requirements) : null,
      createdAt: row.created_at,
    }));

    // Get scene availability for this game
    const availabilityRows = this.db.prepare(`
      SELECT scene_id, unlocked_turn, unlocked_by
      FROM scene_availability
      WHERE game_id = ?
    `).all(gameId) as Array<{
      scene_id: string;
      unlocked_turn: number;
      unlocked_by: string | null;
    }>;

    const availability: ExportedSceneAvailability[] = availabilityRows.map(row => ({
      sceneId: row.scene_id,
      unlockedTurn: row.unlocked_turn,
      unlockedBy: row.unlocked_by,
    }));

    return {
      currentSceneId,
      list: exportedScenes,
      connections,
      availability,
    };
  }

  /**
   * Export traits (catalog and entity assignments)
   */
  private exportTraits(gameId: string): ExportedTraits {
    // Get trait catalog from database
    const catalogRows = this.db.prepare(`
      SELECT trait, category, description
      FROM trait_catalog
    `).all() as Array<{
      trait: string;
      category: string;
      description: string;
    }>;

    const catalog: ExportedTraitCatalogEntry[] = catalogRows.map(row => ({
      trait: row.trait,
      category: row.category,
      description: row.description,
    }));

    // Get entity traits for this game
    const entityTraits = this.traitRepo.findByGame(gameId);
    const entities: ExportedEntityTrait[] = entityTraits.map(trait => ({
      id: trait.id,
      gameId: trait.gameId,
      entityType: trait.entityType,
      entityId: trait.entityId,
      trait: trait.trait,
      acquiredTurn: trait.acquiredTurn,
      sourceEventId: trait.sourceEventId || null,
      status: trait.status,
      createdAt: trait.createdAt,
    }));

    return {
      catalog,
      entities,
    };
  }

  /**
   * Export relationships
   */
  private exportRelationships(gameId: string): ExportedRelationship[] {
    // Get all relationships for the game by querying directly
    const rows = this.db.prepare(`
      SELECT id, game_id, from_type, from_id, to_type, to_id,
        trust, respect, affection, fear, resentment, debt,
        updated_turn, created_at, updated_at
      FROM relationships
      WHERE game_id = ?
    `).all(gameId) as Array<{
      id: string;
      game_id: string;
      from_type: string;
      from_id: string;
      to_type: string;
      to_id: string;
      trust: number;
      respect: number;
      affection: number;
      fear: number;
      resentment: number;
      debt: number;
      updated_turn: number;
      created_at: string;
      updated_at: string;
    }>;

    return rows.map(row => ({
      id: row.id,
      gameId: row.game_id,
      from: {
        type: row.from_type,
        id: row.from_id,
      },
      to: {
        type: row.to_type,
        id: row.to_id,
      },
      trust: row.trust,
      respect: row.respect,
      affection: row.affection,
      fear: row.fear,
      resentment: row.resentment,
      debt: row.debt,
      updatedTurn: row.updated_turn,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  }

  /**
   * Export game flags
   */
  private exportFlags(gameId: string): ExportedFlags {
    // Scene flags are stored per scene, not globally
    // Export all scene flags for the game
    const rows = this.db.prepare(`
      SELECT flag_name, flag_value
      FROM scene_flags
      WHERE game_id = ?
    `).all(gameId) as Array<{
      flag_name: string;
      flag_value: string;
    }>;

    const flags: ExportedFlags = {};
    for (const row of rows) {
      // Try to parse boolean/number values
      if (row.flag_value === 'true') {
        flags[row.flag_name] = true;
      } else if (row.flag_value === 'false') {
        flags[row.flag_name] = false;
      } else if (!isNaN(Number(row.flag_value))) {
        flags[row.flag_name] = Number(row.flag_value);
      } else {
        flags[row.flag_name] = row.flag_value;
      }
    }

    return flags;
  }

  /**
   * Export events
   */
  private exportEvents(gameId: string, limit: number | null): ExportedEvent[] {
    const events = this.eventRepo.findByGame(gameId, {
      limit: limit ?? undefined,
    });

    return events.map(event => ({
      id: event.id,
      gameId: event.gameId,
      turn: event.turn,
      timestamp: event.timestamp,
      eventType: event.eventType,
      content: event.content,
      originalGenerated: event.originalGenerated || null,
      speaker: event.speaker || null,
      locationId: event.locationId,
      witnesses: event.witnesses || [],
      action: event.action || null,
      actorType: event.actorType || null,
      actorId: event.actorId || null,
      targetType: event.targetType || null,
      targetId: event.targetId || null,
      tags: event.tags,
    }));
  }

  /**
   * Export pending evolutions
   */
  private exportPendingEvolutions(gameId: string): ExportedPendingEvolution[] {
    // Query pending evolutions directly
    const rows = this.db.prepare(`
      SELECT id, game_id, turn, evolution_type, entity_type, entity_id,
        trait, target_type, target_id, dimension, old_value, new_value,
        reason, source_event_id, status, dm_notes, created_at, resolved_at
      FROM pending_evolutions
      WHERE game_id = ?
    `).all(gameId) as Array<{
      id: string;
      game_id: string;
      turn: number;
      evolution_type: string;
      entity_type: string;
      entity_id: string;
      trait: string | null;
      target_type: string | null;
      target_id: string | null;
      dimension: string | null;
      old_value: number | null;
      new_value: number | null;
      reason: string;
      source_event_id: string | null;
      status: string;
      dm_notes: string | null;
      created_at: string;
      resolved_at: string | null;
    }>;

    return rows.map(row => ({
      id: row.id,
      gameId: row.game_id,
      turn: row.turn,
      evolutionType: row.evolution_type,
      entityType: row.entity_type,
      entityId: row.entity_id,
      trait: row.trait,
      targetType: row.target_type,
      targetId: row.target_id,
      dimension: row.dimension,
      oldValue: row.old_value,
      newValue: row.new_value,
      reason: row.reason,
      sourceEventId: row.source_event_id,
      status: row.status,
      dmNotes: row.dm_notes,
      createdAt: row.created_at,
      resolvedAt: row.resolved_at,
    }));
  }

  /**
   * Export emergence notifications
   */
  private exportEmergenceNotifications(gameId: string): ExportedEmergenceNotification[] {
    // Query emergence notifications directly
    const rows = this.db.prepare(`
      SELECT id, game_id, emergence_type, entity_type, entity_id,
        confidence, reason, triggering_event_id, contributing_factors,
        status, dm_notes, created_at, resolved_at
      FROM emergence_notifications
      WHERE game_id = ?
    `).all(gameId) as Array<{
      id: string;
      game_id: string;
      emergence_type: string;
      entity_type: string;
      entity_id: string;
      confidence: number;
      reason: string;
      triggering_event_id: string;
      contributing_factors: string;
      status: string;
      dm_notes: string | null;
      created_at: string;
      resolved_at: string | null;
    }>;

    return rows.map(row => ({
      id: row.id,
      gameId: row.game_id,
      emergenceType: row.emergence_type,
      entityType: row.entity_type,
      entityId: row.entity_id,
      confidence: row.confidence,
      reason: row.reason,
      triggeringEventId: row.triggering_event_id,
      contributingFactors: JSON.parse(row.contributing_factors),
      status: row.status,
      dmNotes: row.dm_notes,
      createdAt: row.created_at,
      resolvedAt: row.resolved_at,
    }));
  }
}
