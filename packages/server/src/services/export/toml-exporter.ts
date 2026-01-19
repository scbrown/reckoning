/**
 * TOML Exporter Service
 *
 * Exports game state to a git-diffable TOML directory structure.
 * Implements the export format specification (EXPT-001).
 */

import { stringify } from 'smol-toml';
import { mkdirSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import type Database from 'better-sqlite3';

import {
  GameRepository,
  PartyRepository,
  CharacterRepository,
  AreaRepository,
  EventRepository,
  RelationshipRepository,
  TraitRepository,
  SceneRepository,
  SceneConnectionRepository,
} from '../../db/repositories/index.js';

import type {
  TomlExportOptions,
  ExportResult,
  ExportManifest,
  GameExport,
  CharacterExport,
  NpcExport,
  LocationExport,
  SceneExport,
  SceneIndexExport,
  SceneConnectionsExport,
  TraitCatalogExport,
  EntityTraitsExport,
  RelationshipsExport,
  FlagsExport,
  JsonlEvent,
} from './types.js';

import { EXPORT_VERSION } from './types.js';

/**
 * Configuration for TomlExporter
 */
export interface TomlExporterConfig {
  /** Database connection */
  db: Database.Database;
  /** Reckoning version string */
  reckoningVersion?: string;
}

/**
 * Sanitizes a filename by removing/replacing problematic characters
 */
function sanitizeFilename(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 50) || 'unnamed';
}

/**
 * TOML Exporter Service
 *
 * Exports game state to a directory of TOML files following the specification.
 */
export class TomlExporter {
  private gameRepo: GameRepository;
  private partyRepo: PartyRepository;
  private characterRepo: CharacterRepository;
  private areaRepo: AreaRepository;
  private eventRepo: EventRepository;
  private relationshipRepo: RelationshipRepository;
  private traitRepo: TraitRepository;
  private sceneRepo: SceneRepository;
  private sceneConnectionRepo: SceneConnectionRepository;
  private reckoningVersion: string;

  constructor(config: TomlExporterConfig) {
    this.gameRepo = new GameRepository(config.db);
    this.partyRepo = new PartyRepository(config.db);
    this.characterRepo = new CharacterRepository(config.db);
    this.areaRepo = new AreaRepository(config.db);
    this.eventRepo = new EventRepository(config.db);
    this.relationshipRepo = new RelationshipRepository(config.db);
    this.traitRepo = new TraitRepository(config.db);
    this.sceneRepo = new SceneRepository(config.db);
    this.sceneConnectionRepo = new SceneConnectionRepository(config.db);
    this.reckoningVersion = config.reckoningVersion || '0.1.0';
  }

  /**
   * Export a game to TOML directory format
   */
  async export(options: TomlExportOptions): Promise<ExportResult> {
    const { gameId, outputPath, includeEvents = true, eventLimit } = options;

    // Fetch game state
    const game = this.gameRepo.findById(gameId);
    if (!game) {
      throw new Error(`Game not found: ${gameId}`);
    }

    // Get parties for the game
    const parties = this.partyRepo.findByGameId(gameId);
    if (parties.length === 0) {
      throw new Error(`No party found for game: ${gameId}`);
    }

    const party = parties[0];

    // Get player character
    const playerCharacter = this.characterRepo.findPlayer(party.id);
    if (!playerCharacter) {
      throw new Error(`No player character found for game: ${gameId}`);
    }

    // Determine export directory name
    const exportName = options.exportName || sanitizeFilename(playerCharacter.name + '-game');
    const exportDir = join(outputPath, exportName);

    // Create directory structure
    this.createDirectoryStructure(exportDir);

    let fileCount = 0;
    const exportedAt = new Date().toISOString();

    // Write manifest.toml
    this.writeManifest(exportDir, {
      gameId,
      gameName: playerCharacter.name + "'s Adventure",
      exportedAt,
    });
    fileCount++;

    // Write game.toml
    this.writeGameToml(exportDir, {
      game,
      party,
      playerCharacter,
    });
    fileCount++;

    // Write character files
    fileCount += this.writeCharacterFiles(exportDir, party.id);

    // Write NPC files
    fileCount += this.writeNpcFiles(exportDir);

    // Write location files
    fileCount += this.writeLocationFiles(exportDir);

    // Write scene files
    fileCount += this.writeSceneFiles(exportDir, gameId);

    // Write traits files
    fileCount += this.writeTraitFiles(exportDir, gameId);

    // Write relationships.toml
    this.writeRelationships(exportDir, gameId);
    fileCount++;

    // Write flags.toml (using scene flags)
    this.writeFlags(exportDir, gameId);
    fileCount++;

    // Write events.jsonl if requested
    if (includeEvents) {
      this.writeEvents(exportDir, gameId, eventLimit);
      fileCount++;
    }

    return {
      path: exportDir,
      fileCount,
      format: 'toml',
      version: EXPORT_VERSION,
      exportedAt,
      gameId,
      gameName: playerCharacter.name + "'s Adventure",
    };
  }

  /**
   * Create the export directory structure
   */
  private createDirectoryStructure(exportDir: string): void {
    const dirs = [
      exportDir,
      join(exportDir, 'characters'),
      join(exportDir, 'characters', 'companions'),
      join(exportDir, 'npcs'),
      join(exportDir, 'locations'),
      join(exportDir, 'scenes'),
      join(exportDir, 'traits'),
      join(exportDir, 'events'),
    ];

    for (const dir of dirs) {
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }
    }
  }

  /**
   * Write manifest.toml
   */
  private writeManifest(
    exportDir: string,
    info: { gameId: string; gameName: string; exportedAt: string }
  ): void {
    const manifest: ExportManifest = {
      export: {
        version: EXPORT_VERSION,
        format: 'reckoning-toml',
        exported_at: info.exportedAt,
        game_id: info.gameId,
        game_name: info.gameName,
      },
      source: {
        reckoning_version: this.reckoningVersion,
        platform: process.platform,
      },
    };

    writeFileSync(join(exportDir, 'manifest.toml'), stringify(manifest));
  }

  /**
   * Write game.toml
   */
  private writeGameToml(
    exportDir: string,
    data: {
      game: { id: string; currentAreaId: string; turn: number; createdAt: string; updatedAt: string };
      party: { id: string; members: unknown[] };
      playerCharacter: { id: string; name: string };
    }
  ): void {
    // Get all party characters for member_refs
    const characters = this.characterRepo.findByParty(data.party.id);
    const memberRefs = characters.map(c =>
      c.role === 'player'
        ? 'characters/player.toml'
        : `characters/companions/${sanitizeFilename(c.name)}.toml`
    );

    // Get current scene if any
    const currentSceneId = this.gameRepo.getCurrentSceneId(data.game.id);

    const gameExport: GameExport = {
      game: {
        id: data.game.id,
        name: `${data.playerCharacter.name}'s Adventure`,
        created_at: data.game.createdAt,
        updated_at: data.game.updatedAt,
      },
      state: {
        turn: data.game.turn,
        current_area_id: data.game.currentAreaId,
        ...(currentSceneId && { current_scene_id: currentSceneId }),
      },
      player: {
        id: data.playerCharacter.id,
        character_ref: 'characters/player.toml',
      },
      party: {
        id: data.party.id,
        member_refs: memberRefs,
      },
    };

    writeFileSync(join(exportDir, 'game.toml'), stringify(gameExport));
  }

  /**
   * Write character files (player.toml and companions/*.toml)
   */
  private writeCharacterFiles(exportDir: string, partyId: string): number {
    const characters = this.characterRepo.findByParty(partyId);
    let count = 0;

    for (const character of characters) {
      const charExport: CharacterExport = {
        character: {
          id: character.id,
          name: character.name,
          description: character.description,
          ...(character.class && { class: character.class }),
        },
        stats: {
          health: character.stats.health,
          max_health: character.stats.maxHealth,
        },
        ...(character.voiceId && {
          voice: { voice_id: character.voiceId },
        }),
      };

      const filename =
        character.role === 'player'
          ? join(exportDir, 'characters', 'player.toml')
          : join(exportDir, 'characters', 'companions', `${sanitizeFilename(character.name)}.toml`);

      writeFileSync(filename, stringify(charExport));
      count++;
    }

    return count;
  }

  /**
   * Write NPC files
   */
  private writeNpcFiles(exportDir: string): number {
    // Get all NPCs by querying each area
    const areas = this.areaRepo.findAll();
    const processedNpcs = new Set<string>();
    let count = 0;

    for (const area of areas) {
      const areaWithDetails = this.areaRepo.getWithDetails(area.id);
      if (!areaWithDetails) continue;

      for (const npc of areaWithDetails.npcs) {
        if (processedNpcs.has(npc.id)) continue;
        processedNpcs.add(npc.id);

        const npcExport: NpcExport = {
          npc: {
            id: npc.id,
            name: npc.name,
            description: npc.description,
            current_area_id: npc.currentAreaId,
            disposition: npc.disposition,
            tags: npc.tags,
          },
        };

        writeFileSync(
          join(exportDir, 'npcs', `${sanitizeFilename(npc.name)}.toml`),
          stringify(npcExport)
        );
        count++;
      }
    }

    return count;
  }

  /**
   * Write location files
   */
  private writeLocationFiles(exportDir: string): number {
    const areas = this.areaRepo.findAll();
    let count = 0;

    for (const area of areas) {
      const areaWithDetails = this.areaRepo.getWithDetails(area.id);
      if (!areaWithDetails) continue;

      const locationExport: LocationExport = {
        area: {
          id: areaWithDetails.id,
          name: areaWithDetails.name,
          description: areaWithDetails.description,
          tags: areaWithDetails.tags,
        },
        exits: areaWithDetails.exits.map(exit => ({
          direction: exit.direction,
          target_area_id: exit.targetAreaId,
          description: exit.description,
          locked: exit.locked ?? false,
        })),
        objects: areaWithDetails.objects.map(obj => ({
          id: obj.id,
          name: obj.name,
          description: obj.description,
          interactable: obj.interactable,
          tags: obj.tags,
        })),
      };

      writeFileSync(
        join(exportDir, 'locations', `${sanitizeFilename(areaWithDetails.name)}.toml`),
        stringify(locationExport)
      );
      count++;
    }

    return count;
  }

  /**
   * Write scene files (index.toml, connections.toml, and individual scenes)
   */
  private writeSceneFiles(exportDir: string, gameId: string): number {
    const scenes = this.sceneRepo.findByGame(gameId);
    let count = 0;

    // Write individual scene files
    for (const scene of scenes) {
      const sceneExport: SceneExport = {
        scene: {
          id: scene.id,
          name: scene.name || 'Unnamed Scene',
          description: scene.description || '',
          scene_type: scene.sceneType || 'exploration',
          ...(scene.locationId && { location_id: scene.locationId }),
          status: scene.status,
        },
        timing: {
          started_turn: scene.startedTurn,
          ...(scene.completedTurn !== null && { completed_turn: scene.completedTurn }),
        },
        atmosphere: {
          ...(scene.mood && { mood: scene.mood }),
          ...(scene.stakes && { stakes: scene.stakes }),
        },
        metadata: {
          created_at: scene.createdAt,
          updated_at: scene.updatedAt,
        },
      };

      writeFileSync(
        join(exportDir, 'scenes', `${sanitizeFilename(scene.name || scene.id)}.toml`),
        stringify(sceneExport)
      );
      count++;
    }

    // Write scene index
    const currentSceneId = this.gameRepo.getCurrentSceneId(gameId);
    const sceneIndex: SceneIndexExport = {
      scenes: {
        ...(currentSceneId && { current_scene_id: currentSceneId }),
        count: scenes.length,
        list: scenes.map(scene => ({
          id: scene.id,
          name: scene.name || 'Unnamed Scene',
          status: scene.status,
          file: `${sanitizeFilename(scene.name || scene.id)}.toml`,
        })),
      },
    };

    writeFileSync(join(exportDir, 'scenes', 'index.toml'), stringify(sceneIndex));
    count++;

    // Write scene connections
    const allConnections: SceneConnectionsExport['connections'] = [];
    for (const scene of scenes) {
      const connections = this.sceneConnectionRepo.findFromScene(gameId, scene.id);
      for (const conn of connections) {
        allConnections.push({
          id: conn.id,
          from_scene_id: conn.fromSceneId,
          to_scene_id: conn.toSceneId,
          connection_type: conn.connectionType,
          ...(conn.description && { description: conn.description }),
          ...(conn.requirements && {
            requirements: {
              ...(conn.requirements.flags && { flags: conn.requirements.flags }),
              ...(conn.requirements.traits && { traits: conn.requirements.traits }),
              ...(conn.requirements.relationships && {
                relationships: conn.requirements.relationships.map(r => ({
                  entity_type: r.entityType,
                  entity_id: r.entityId,
                  dimension: r.dimension,
                  ...(r.minValue !== undefined && { min_value: r.minValue }),
                  ...(r.maxValue !== undefined && { max_value: r.maxValue }),
                })),
              }),
            },
          }),
        });
      }
    }

    const connectionsExport: SceneConnectionsExport = { connections: allConnections };
    writeFileSync(join(exportDir, 'scenes', 'connections.toml'), stringify(connectionsExport));
    count++;

    return count;
  }

  /**
   * Write trait files (catalog.toml and entities.toml)
   */
  private writeTraitFiles(exportDir: string, gameId: string): number {
    // Write trait catalog
    const catalog = this.traitRepo.getTraitCatalog();
    const catalogExport: TraitCatalogExport = {
      catalog: {
        version: EXPORT_VERSION,
      },
      traits: catalog.map(t => ({
        trait: t.trait,
        category: t.category,
        description: t.description,
      })),
    };

    writeFileSync(join(exportDir, 'traits', 'catalog.toml'), stringify(catalogExport));

    // Write entity traits
    const entityTraits = this.traitRepo.findByGame(gameId);
    const entitiesExport: EntityTraitsExport = {
      entity_traits: entityTraits.map(t => ({
        id: t.id,
        entity_type: t.entityType,
        entity_id: t.entityId,
        trait: t.trait,
        acquired_turn: t.acquiredTurn,
        ...(t.sourceEventId && { source_event_id: t.sourceEventId }),
        status: t.status,
      })),
    };

    writeFileSync(join(exportDir, 'traits', 'entities.toml'), stringify(entitiesExport));

    return 2;
  }

  /**
   * Write relationships.toml
   */
  private writeRelationships(exportDir: string, gameId: string): void {
    // Get all relationships for the game by fetching from player/characters/npcs
    // Since we don't have a "findByGame" method, we need to aggregate
    const relationships: RelationshipsExport['relationships'] = [];

    // We'll use the fact that relationships are indexed by from/to entities
    // Query by high thresholds to get active relationships (this is a workaround)
    // For a complete implementation, we'd add a findByGame method to the repo

    // For now, get relationships for player and all characters
    const parties = this.partyRepo.findByGameId(gameId);
    if (parties.length > 0) {
      const characters = this.characterRepo.findByParty(parties[0].id);
      const processedIds = new Set<string>();

      for (const char of characters) {
        const charRelationships = this.relationshipRepo.findByEntity(gameId, {
          type: char.role === 'player' ? 'player' : 'character',
          id: char.id,
        });

        for (const rel of charRelationships) {
          if (processedIds.has(rel.id)) continue;
          processedIds.add(rel.id);

          relationships.push({
            id: rel.id,
            from_type: rel.from.type,
            from_id: rel.from.id,
            to_type: rel.to.type,
            to_id: rel.to.id,
            updated_turn: rel.updatedTurn,
            dimensions: {
              trust: rel.trust,
              respect: rel.respect,
              affection: rel.affection,
              fear: rel.fear,
              resentment: rel.resentment,
              debt: rel.debt,
            },
          });
        }
      }
    }

    const relationshipsExport: RelationshipsExport = { relationships };
    writeFileSync(join(exportDir, 'relationships.toml'), stringify(relationshipsExport));
  }

  /**
   * Write flags.toml
   */
  private writeFlags(exportDir: string, _gameId: string): void {
    // Scene flags are stored in scene_flags table but we don't have a repository for it yet
    // For now, write an empty flags file as a placeholder
    // A proper implementation would query the scene_flags table directly
    const flagsExport: FlagsExport = {
      flags: {},
    };

    writeFileSync(join(exportDir, 'flags.toml'), stringify(flagsExport));
  }

  /**
   * Write events.jsonl
   */
  private writeEvents(exportDir: string, gameId: string, limit?: number): void {
    const events = this.eventRepo.findByGame(gameId, { limit: limit ?? 10000 });

    // Write header comment
    const header = `# {"export_version":"${EXPORT_VERSION}","game_id":"${gameId}","exported_at":"${new Date().toISOString()}","event_count":${events.length}}\n`;

    // Convert events to JSONL format
    const jsonlLines = events.map(event => {
      const jsonlEvent: JsonlEvent = {
        id: event.id,
        game_id: event.gameId,
        turn: event.turn,
        timestamp: event.timestamp,
        event_type: event.eventType,
        content: event.content,
        location_id: event.locationId,
        witnesses: event.witnesses,
        ...(event.originalGenerated && { original_generated: event.originalGenerated }),
        ...(event.speaker && { speaker: event.speaker }),
        ...(event.action && { action: event.action }),
        ...(event.actorType && { actor_type: event.actorType }),
        ...(event.actorId && { actor_id: event.actorId }),
        ...(event.targetType && { target_type: event.targetType }),
        ...(event.targetId && { target_id: event.targetId }),
        ...(event.tags && { tags: event.tags }),
      };
      return JSON.stringify(jsonlEvent);
    });

    writeFileSync(join(exportDir, 'events', 'events.jsonl'), header + jsonlLines.join('\n') + '\n');
  }
}
