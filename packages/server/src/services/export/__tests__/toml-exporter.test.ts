/**
 * TOML Exporter Tests
 *
 * Tests for the TOML export functionality (EXPT-002).
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { existsSync, readFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { parse } from 'smol-toml';
import { randomUUID } from 'crypto';

import { TomlExporter } from '../toml-exporter.js';
import { EXPORT_VERSION } from '../types.js';
import { runMigrations } from '../../../db/index.js';
import { GameRepository } from '../../../db/repositories/game-repository.js';
import { PartyRepository } from '../../../db/repositories/party-repository.js';
import { CharacterRepository } from '../../../db/repositories/character-repository.js';
import { AreaRepository } from '../../../db/repositories/area-repository.js';
import { EventRepository } from '../../../db/repositories/event-repository.js';
import { TraitRepository } from '../../../db/repositories/trait-repository.js';
import { RelationshipRepository } from '../../../db/repositories/relationship-repository.js';
import { SceneRepository } from '../../../db/repositories/scene-repository.js';
import { SceneConnectionRepository } from '../../../db/repositories/scene-connection-repository.js';

describe('TomlExporter', () => {
  let db: Database.Database;
  let exporter: TomlExporter;
  let testOutputDir: string;
  let gameId: string;
  let partyId: string;
  let playerId: string;

  beforeAll(() => {
    // Create in-memory database
    db = new Database(':memory:');
    runMigrations(db);

    // Initialize exporter
    exporter = new TomlExporter({
      db,
      reckoningVersion: '0.5.0',
    });

    // Create test output directory
    testOutputDir = join(tmpdir(), `toml-exporter-test-${Date.now()}`);
  });

  afterAll(() => {
    db.close();

    // Clean up test directory
    if (existsSync(testOutputDir)) {
      rmSync(testOutputDir, { recursive: true });
    }
  });

  beforeEach(() => {
    // Clear all tables
    db.exec('DELETE FROM events');
    db.exec('DELETE FROM relationships');
    db.exec('DELETE FROM entity_traits');
    db.exec('DELETE FROM scene_connections');
    db.exec('DELETE FROM scenes');
    db.exec('DELETE FROM characters');
    db.exec('DELETE FROM parties');
    db.exec('DELETE FROM games');
    db.exec('DELETE FROM npcs');
    db.exec('DELETE FROM area_objects');
    db.exec('DELETE FROM area_exits');
    db.exec("DELETE FROM areas WHERE id != 'default-area'");

    // Set up test data
    const gameRepo = new GameRepository(db);
    const partyRepo = new PartyRepository(db);
    const characterRepo = new CharacterRepository(db);

    // Create game
    playerId = randomUUID();
    const game = gameRepo.create(playerId, 'default-area');
    gameId = game.id;

    // Create party
    const party = partyRepo.create(gameId, 'Test Party');
    partyId = party.id;

    // Create player character
    characterRepo.create({
      partyId,
      name: 'Test Hero',
      description: 'A brave test adventurer',
      class: 'warrior',
      role: 'player',
      stats: { health: 100, maxHealth: 100 },
      voiceId: 'test-voice-id',
    });

    // Create companion
    characterRepo.create({
      partyId,
      name: 'Test Companion',
      description: 'A loyal companion',
      class: 'mage',
      role: 'member',
      stats: { health: 80, maxHealth: 80 },
    });
  });

  describe('export()', () => {
    it('should create export directory structure', async () => {
      const result = await exporter.export({
        gameId,
        outputPath: testOutputDir,
        exportName: 'test-export',
      });

      expect(existsSync(result.path)).toBe(true);
      expect(existsSync(join(result.path, 'characters'))).toBe(true);
      expect(existsSync(join(result.path, 'characters', 'companions'))).toBe(true);
      expect(existsSync(join(result.path, 'npcs'))).toBe(true);
      expect(existsSync(join(result.path, 'locations'))).toBe(true);
      expect(existsSync(join(result.path, 'scenes'))).toBe(true);
      expect(existsSync(join(result.path, 'traits'))).toBe(true);
      expect(existsSync(join(result.path, 'events'))).toBe(true);
    });

    it('should create manifest.toml with correct metadata', async () => {
      const result = await exporter.export({
        gameId,
        outputPath: testOutputDir,
        exportName: 'manifest-test',
      });

      const manifestPath = join(result.path, 'manifest.toml');
      expect(existsSync(manifestPath)).toBe(true);

      const manifest = parse(readFileSync(manifestPath, 'utf-8'));
      expect(manifest.export).toBeDefined();
      expect((manifest.export as Record<string, string>).version).toBe(EXPORT_VERSION);
      expect((manifest.export as Record<string, string>).format).toBe('reckoning-toml');
      expect((manifest.export as Record<string, string>).game_id).toBe(gameId);
      expect((manifest.source as Record<string, string>).reckoning_version).toBe('0.5.0');
    });

    it('should create game.toml with game state', async () => {
      const result = await exporter.export({
        gameId,
        outputPath: testOutputDir,
        exportName: 'game-test',
      });

      const gamePath = join(result.path, 'game.toml');
      expect(existsSync(gamePath)).toBe(true);

      const gameData = parse(readFileSync(gamePath, 'utf-8'));
      expect(gameData.game).toBeDefined();
      expect((gameData.game as Record<string, unknown>).id).toBe(gameId);
      expect(gameData.state).toBeDefined();
      expect((gameData.state as Record<string, unknown>).turn).toBe(0);
      expect((gameData.state as Record<string, unknown>).current_area_id).toBe('default-area');
      expect(gameData.player).toBeDefined();
      expect(gameData.party).toBeDefined();
      expect((gameData.party as Record<string, unknown>).member_refs).toHaveLength(2);
    });

    it('should create player.toml with character data', async () => {
      const result = await exporter.export({
        gameId,
        outputPath: testOutputDir,
        exportName: 'player-test',
      });

      const playerPath = join(result.path, 'characters', 'player.toml');
      expect(existsSync(playerPath)).toBe(true);

      const playerData = parse(readFileSync(playerPath, 'utf-8'));
      expect(playerData.character).toBeDefined();
      expect((playerData.character as Record<string, unknown>).name).toBe('Test Hero');
      expect((playerData.character as Record<string, unknown>).description).toBe('A brave test adventurer');
      expect((playerData.character as Record<string, unknown>).class).toBe('warrior');
      expect(playerData.stats).toBeDefined();
      expect((playerData.stats as Record<string, unknown>).health).toBe(100);
      expect((playerData.stats as Record<string, unknown>).max_health).toBe(100);
      expect(playerData.voice).toBeDefined();
      expect((playerData.voice as Record<string, unknown>).voice_id).toBe('test-voice-id');
    });

    it('should create companion files in companions directory', async () => {
      const result = await exporter.export({
        gameId,
        outputPath: testOutputDir,
        exportName: 'companion-test',
      });

      const companionPath = join(result.path, 'characters', 'companions', 'test-companion.toml');
      expect(existsSync(companionPath)).toBe(true);

      const companionData = parse(readFileSync(companionPath, 'utf-8'));
      expect(companionData.character).toBeDefined();
      expect((companionData.character as Record<string, unknown>).name).toBe('Test Companion');
    });

    it('should create location files', async () => {
      const result = await exporter.export({
        gameId,
        outputPath: testOutputDir,
        exportName: 'location-test',
      });

      // The default area should be exported
      const locationPath = join(result.path, 'locations', 'the-crossroads.toml');
      expect(existsSync(locationPath)).toBe(true);

      const locationData = parse(readFileSync(locationPath, 'utf-8'));
      expect(locationData.area).toBeDefined();
      expect((locationData.area as Record<string, unknown>).name).toBe('The Crossroads');
    });

    it('should create trait catalog and entities files', async () => {
      const result = await exporter.export({
        gameId,
        outputPath: testOutputDir,
        exportName: 'traits-test',
      });

      const catalogPath = join(result.path, 'traits', 'catalog.toml');
      expect(existsSync(catalogPath)).toBe(true);

      const catalogData = parse(readFileSync(catalogPath, 'utf-8'));
      expect(catalogData.catalog).toBeDefined();
      expect(catalogData.traits).toBeDefined();
      expect(Array.isArray(catalogData.traits)).toBe(true);
      expect((catalogData.traits as unknown[]).length).toBeGreaterThan(0);

      const entitiesPath = join(result.path, 'traits', 'entities.toml');
      expect(existsSync(entitiesPath)).toBe(true);
    });

    it('should create relationships.toml', async () => {
      // Add a relationship
      const relationshipRepo = new RelationshipRepository(db);
      const characterRepo = new CharacterRepository(db);
      const player = characterRepo.findPlayer(partyId);

      relationshipRepo.upsert({
        gameId,
        from: { type: 'player', id: player!.id },
        to: { type: 'npc', id: 'test-npc' },
        updatedTurn: 1,
        trust: 0.7,
        respect: 0.6,
      });

      const result = await exporter.export({
        gameId,
        outputPath: testOutputDir,
        exportName: 'relationships-test',
      });

      const relPath = join(result.path, 'relationships.toml');
      expect(existsSync(relPath)).toBe(true);

      const relData = parse(readFileSync(relPath, 'utf-8'));
      expect(relData.relationships).toBeDefined();
      expect(Array.isArray(relData.relationships)).toBe(true);
      expect((relData.relationships as unknown[]).length).toBe(1);
    });

    it('should create flags.toml', async () => {
      const result = await exporter.export({
        gameId,
        outputPath: testOutputDir,
        exportName: 'flags-test',
      });

      const flagsPath = join(result.path, 'flags.toml');
      expect(existsSync(flagsPath)).toBe(true);

      const flagsData = parse(readFileSync(flagsPath, 'utf-8'));
      expect(flagsData.flags).toBeDefined();
    });

    it('should create events.jsonl when includeEvents is true', async () => {
      // Add some events
      const eventRepo = new EventRepository(db);
      eventRepo.create({
        gameId,
        turn: 1,
        eventType: 'narration',
        content: 'The adventure begins...',
        locationId: 'default-area',
        witnesses: [],
      });

      const result = await exporter.export({
        gameId,
        outputPath: testOutputDir,
        exportName: 'events-test',
        includeEvents: true,
      });

      const eventsPath = join(result.path, 'events', 'events.jsonl');
      expect(existsSync(eventsPath)).toBe(true);

      const eventsContent = readFileSync(eventsPath, 'utf-8');
      const lines = eventsContent.split('\n').filter(l => l.trim());

      // First line is header comment
      expect(lines[0].startsWith('#')).toBe(true);
      expect(lines[1]).toBeDefined();

      const event = JSON.parse(lines[1]);
      expect(event.content).toBe('The adventure begins...');
      expect(event.event_type).toBe('narration');
    });

    it('should skip events.jsonl when includeEvents is false', async () => {
      const result = await exporter.export({
        gameId,
        outputPath: testOutputDir,
        exportName: 'no-events-test',
        includeEvents: false,
      });

      const eventsPath = join(result.path, 'events', 'events.jsonl');
      expect(existsSync(eventsPath)).toBe(false);
    });

    it('should return correct export result', async () => {
      const result = await exporter.export({
        gameId,
        outputPath: testOutputDir,
        exportName: 'result-test',
      });

      expect(result.format).toBe('toml');
      expect(result.version).toBe(EXPORT_VERSION);
      expect(result.gameId).toBe(gameId);
      expect(result.fileCount).toBeGreaterThan(0);
      expect(result.exportedAt).toBeDefined();
      expect(result.path).toContain('result-test');
    });

    it('should throw error for non-existent game', async () => {
      await expect(
        exporter.export({
          gameId: 'non-existent-game',
          outputPath: testOutputDir,
          exportName: 'error-test',
        })
      ).rejects.toThrow('Game not found');
    });
  });

  describe('scene export', () => {
    it('should export scenes with index and connections', async () => {
      const sceneRepo = new SceneRepository(db);
      const connectionRepo = new SceneConnectionRepository(db);

      // Create scenes
      const scene1 = sceneRepo.create({
        gameId,
        name: 'The Beginning',
        description: 'Where it all starts',
        sceneType: 'exploration',
        startedTurn: 1,
        mood: 'peaceful',
      });

      const scene2 = sceneRepo.create({
        gameId,
        name: 'The Challenge',
        description: 'A test awaits',
        sceneType: 'combat',
        startedTurn: 5,
        mood: 'tense',
        stakes: 'Survival',
      });

      // Create connection
      connectionRepo.create({
        gameId,
        fromSceneId: scene1.id,
        toSceneId: scene2.id,
        connectionType: 'path',
        description: 'The path forward',
      });

      const result = await exporter.export({
        gameId,
        outputPath: testOutputDir,
        exportName: 'scenes-test',
      });

      // Check scene files
      const scene1Path = join(result.path, 'scenes', 'the-beginning.toml');
      expect(existsSync(scene1Path)).toBe(true);

      const scene1Data = parse(readFileSync(scene1Path, 'utf-8'));
      expect((scene1Data.scene as Record<string, unknown>).name).toBe('The Beginning');
      expect((scene1Data.atmosphere as Record<string, unknown>).mood).toBe('peaceful');

      // Check index
      const indexPath = join(result.path, 'scenes', 'index.toml');
      expect(existsSync(indexPath)).toBe(true);

      const indexData = parse(readFileSync(indexPath, 'utf-8'));
      expect((indexData.scenes as Record<string, unknown>).count).toBe(2);

      // Check connections
      const connectionsPath = join(result.path, 'scenes', 'connections.toml');
      expect(existsSync(connectionsPath)).toBe(true);

      const connectionsData = parse(readFileSync(connectionsPath, 'utf-8'));
      expect(Array.isArray(connectionsData.connections)).toBe(true);
      expect((connectionsData.connections as unknown[]).length).toBe(1);
    });
  });

  describe('NPC export', () => {
    it('should export NPCs to separate files', async () => {
      const areaRepo = new AreaRepository(db);

      // Create NPC in default area
      areaRepo.createNPC({
        name: 'Guard Captain',
        description: 'A stern guard',
        currentAreaId: 'default-area',
        disposition: 'neutral',
        tags: ['guard', 'authority'],
      });

      const result = await exporter.export({
        gameId,
        outputPath: testOutputDir,
        exportName: 'npcs-test',
      });

      const npcPath = join(result.path, 'npcs', 'guard-captain.toml');
      expect(existsSync(npcPath)).toBe(true);

      const npcData = parse(readFileSync(npcPath, 'utf-8'));
      expect((npcData.npc as Record<string, unknown>).name).toBe('Guard Captain');
      expect((npcData.npc as Record<string, unknown>).disposition).toBe('neutral');
      expect((npcData.npc as Record<string, unknown>).tags).toContain('guard');
    });
  });

  describe('entity traits export', () => {
    it('should export entity traits', async () => {
      const traitRepo = new TraitRepository(db);
      const characterRepo = new CharacterRepository(db);
      const player = characterRepo.findPlayer(partyId);

      // Add trait to player
      traitRepo.addTrait({
        gameId,
        entityType: 'player',
        entityId: player!.id,
        trait: 'honorable',
        turn: 5,
      });

      const result = await exporter.export({
        gameId,
        outputPath: testOutputDir,
        exportName: 'entity-traits-test',
      });

      const entitiesPath = join(result.path, 'traits', 'entities.toml');
      const entitiesData = parse(readFileSync(entitiesPath, 'utf-8'));

      expect(Array.isArray(entitiesData.entity_traits)).toBe(true);
      expect((entitiesData.entity_traits as unknown[]).length).toBe(1);

      const trait = (entitiesData.entity_traits as Record<string, unknown>[])[0];
      expect(trait.trait).toBe('honorable');
      expect(trait.entity_type).toBe('player');
      expect(trait.acquired_turn).toBe(5);
    });
  });
});
