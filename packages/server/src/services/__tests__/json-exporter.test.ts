import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { gunzipSync } from 'zlib';

import { JsonExporter } from '../export/json-exporter.js';
import { EXPORT_FORMAT_VERSION, EXPORT_FORMAT_NAME } from '../export/types.js';
import type { JsonExport } from '../export/types.js';
import { GameRepository } from '../../db/repositories/game-repository.js';
import { EventRepository } from '../../db/repositories/event-repository.js';
import { PartyRepository } from '../../db/repositories/party-repository.js';
import { CharacterRepository } from '../../db/repositories/character-repository.js';
import { AreaRepository } from '../../db/repositories/area-repository.js';
import { SceneRepository } from '../../db/repositories/scene-repository.js';
import { TraitRepository } from '../../db/repositories/trait-repository.js';
import { RelationshipRepository } from '../../db/repositories/relationship-repository.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function createTestDatabase(): Database.Database {
  const db = new Database(':memory:');
  const schemaPath = join(__dirname, '../../db/schema.sql');
  const schema = readFileSync(schemaPath, 'utf-8');
  db.exec(schema);
  return db;
}

describe('JsonExporter', () => {
  let db: Database.Database;
  let exporter: JsonExporter;
  let gameRepo: GameRepository;
  let eventRepo: EventRepository;
  let partyRepo: PartyRepository;
  let characterRepo: CharacterRepository;
  let areaRepo: AreaRepository;
  let sceneRepo: SceneRepository;
  let traitRepo: TraitRepository;
  let relationshipRepo: RelationshipRepository;

  beforeEach(() => {
    db = createTestDatabase();
    exporter = new JsonExporter({ db });
    gameRepo = new GameRepository(db);
    eventRepo = new EventRepository(db);
    partyRepo = new PartyRepository(db);
    characterRepo = new CharacterRepository(db);
    areaRepo = new AreaRepository(db);
    sceneRepo = new SceneRepository(db);
    traitRepo = new TraitRepository(db);
    relationshipRepo = new RelationshipRepository(db);
  });

  afterEach(() => {
    db.close();
  });

  describe('export', () => {
    it('should throw error for non-existent game', async () => {
      await expect(exporter.export('non-existent')).rejects.toThrow('Game not found');
    });

    it('should export a minimal game', async () => {
      // Create a basic game
      const game = gameRepo.create('player-1', 'default-area');

      const result = await exporter.export(game.id);

      expect(result.compressed).toBe(false);
      expect(result.contentType).toBe('application/json');
      expect(result.filename).toContain(game.id);
      expect(result.filename.endsWith('.json')).toBe(true);

      const exportData: JsonExport = JSON.parse(result.data as string);

      // Verify export metadata
      expect(exportData.export.version).toBe(EXPORT_FORMAT_VERSION);
      expect(exportData.export.format).toBe(EXPORT_FORMAT_NAME);
      expect(exportData.export.gameId).toBe(game.id);
      expect(exportData.export.exportedAt).toBeDefined();
      expect(exportData.export.source.platform).toBeDefined();

      // Verify game data
      expect(exportData.game.id).toBe(game.id);
      expect(exportData.game.turn).toBe(0);
      expect(exportData.game.currentAreaId).toBe('default-area');
    });

    it('should export game with party and characters', async () => {
      // Create game
      const game = gameRepo.create('player-1', 'default-area');

      // Create party with characters
      const party = partyRepo.create(game.id, 'Test Party');
      const player = characterRepo.create({
        partyId: party.id,
        name: 'Kira Shadowmend',
        description: 'A wandering blade-dancer',
        class: 'blade-dancer',
        role: 'player',
        stats: { health: 85, maxHealth: 100 },
      });
      const companion = characterRepo.create({
        partyId: party.id,
        name: 'Aria',
        description: 'A mysterious companion',
        class: 'mage',
        role: 'member',
        stats: { health: 70, maxHealth: 80 },
      });

      const result = await exporter.export(game.id);
      const exportData: JsonExport = JSON.parse(result.data as string);

      // Verify party data
      expect(exportData.party).not.toBeNull();
      expect(exportData.party?.id).toBe(party.id);
      expect(exportData.party?.members).toHaveLength(2);

      // Verify player data
      expect(exportData.player).not.toBeNull();
      expect(exportData.player?.name).toBe('Kira Shadowmend');
    });

    it('should export events', async () => {
      const game = gameRepo.create('player-1', 'default-area');

      // Create some events
      eventRepo.create({
        gameId: game.id,
        turn: 1,
        eventType: 'narration',
        content: 'The morning sun rises.',
        locationId: 'default-area',
        witnesses: [],
      });
      eventRepo.create({
        gameId: game.id,
        turn: 2,
        eventType: 'party_action',
        content: 'You step outside.',
        locationId: 'default-area',
        witnesses: [],
        action: 'move',
        actorType: 'player',
        actorId: 'player-1',
      });

      const result = await exporter.export(game.id, { includeEvents: true });
      const exportData: JsonExport = JSON.parse(result.data as string);

      expect(exportData.events).toBeDefined();
      expect(exportData.events).toHaveLength(2);
      expect(exportData.events?.[0].content).toBe('The morning sun rises.');
      expect(exportData.events?.[1].action).toBe('move');
    });

    it('should respect eventLimit option', async () => {
      const game = gameRepo.create('player-1', 'default-area');

      // Create multiple events
      for (let i = 0; i < 10; i++) {
        eventRepo.create({
          gameId: game.id,
          turn: i + 1,
          eventType: 'narration',
          content: `Event ${i + 1}`,
          locationId: 'default-area',
          witnesses: [],
        });
      }

      const result = await exporter.export(game.id, { includeEvents: true, eventLimit: 5 });
      const exportData: JsonExport = JSON.parse(result.data as string);

      expect(exportData.events).toHaveLength(5);
    });

    it('should exclude events when includeEvents is false', async () => {
      const game = gameRepo.create('player-1', 'default-area');

      eventRepo.create({
        gameId: game.id,
        turn: 1,
        eventType: 'narration',
        content: 'An event',
        locationId: 'default-area',
        witnesses: [],
      });

      const result = await exporter.export(game.id, { includeEvents: false });
      const exportData: JsonExport = JSON.parse(result.data as string);

      expect(exportData.events).toBeUndefined();
    });

    it('should export scenes', async () => {
      const game = gameRepo.create('player-1', 'default-area');

      sceneRepo.create({
        gameId: game.id,
        name: 'The Awakening',
        description: 'The hero awakens',
        sceneType: 'exploration',
        locationId: 'default-area',
        startedTurn: 1,
        mood: 'tense',
      });

      const result = await exporter.export(game.id);
      const exportData: JsonExport = JSON.parse(result.data as string);

      expect(exportData.scenes.list).toHaveLength(1);
      expect(exportData.scenes.list[0].name).toBe('The Awakening');
      expect(exportData.scenes.list[0].mood).toBe('tense');
    });

    it('should export traits', async () => {
      const game = gameRepo.create('player-1', 'default-area');

      traitRepo.addTrait({
        gameId: game.id,
        entityType: 'player',
        entityId: 'player-1',
        trait: 'honorable',
        turn: 5,
      });

      const result = await exporter.export(game.id);
      const exportData: JsonExport = JSON.parse(result.data as string);

      // Verify trait catalog is exported
      expect(exportData.traits.catalog.length).toBeGreaterThan(0);
      expect(exportData.traits.catalog.some(t => t.trait === 'honorable')).toBe(true);

      // Verify entity traits are exported
      expect(exportData.traits.entities).toHaveLength(1);
      expect(exportData.traits.entities[0].trait).toBe('honorable');
      expect(exportData.traits.entities[0].entityType).toBe('player');
    });

    it('should export relationships', async () => {
      const game = gameRepo.create('player-1', 'default-area');

      relationshipRepo.upsert({
        gameId: game.id,
        from: { type: 'player', id: 'player-1' },
        to: { type: 'npc', id: 'npc-guard' },
        updatedTurn: 10,
        trust: 0.7,
        respect: 0.6,
      });

      const result = await exporter.export(game.id);
      const exportData: JsonExport = JSON.parse(result.data as string);

      expect(exportData.relationships).toHaveLength(1);
      expect(exportData.relationships[0].from.type).toBe('player');
      expect(exportData.relationships[0].to.type).toBe('npc');
      expect(exportData.relationships[0].trust).toBe(0.7);
      expect(exportData.relationships[0].respect).toBe(0.6);
    });

    it('should export areas with exits and objects', async () => {
      const game = gameRepo.create('player-1', 'default-area');

      // Create a new area with exits and objects
      const area = areaRepo.create({
        id: 'test-area',
        name: 'Test Area',
        description: 'A test area',
        tags: ['test', 'outdoor'],
      });
      areaRepo.createExit({
        areaId: 'test-area',
        direction: 'north',
        targetAreaId: 'default-area',
        description: 'A path north',
      });
      areaRepo.createObject({
        areaId: 'test-area',
        name: 'Test Object',
        description: 'A test object',
        interactable: true,
        tags: ['test'],
      });

      const result = await exporter.export(game.id);
      const exportData: JsonExport = JSON.parse(result.data as string);

      // Find the test area
      const testArea = exportData.areas.find(a => a.id === 'test-area');
      expect(testArea).toBeDefined();
      expect(testArea?.name).toBe('Test Area');
      expect(testArea?.exits).toHaveLength(1);
      expect(testArea?.exits[0].direction).toBe('north');
      expect(testArea?.objects).toHaveLength(1);
      expect(testArea?.objects[0].name).toBe('Test Object');
    });

    it('should compress output when requested', async () => {
      const game = gameRepo.create('player-1', 'default-area');

      const result = await exporter.export(game.id, { compressed: true });

      expect(result.compressed).toBe(true);
      expect(result.contentType).toBe('application/gzip');
      expect(result.filename.endsWith('.json.gz')).toBe(true);
      expect(result.data).toBeInstanceOf(Buffer);

      // Decompress and verify it's valid JSON
      const decompressed = gunzipSync(result.data as Buffer);
      const exportData: JsonExport = JSON.parse(decompressed.toString());
      expect(exportData.export.version).toBe(EXPORT_FORMAT_VERSION);
      expect(exportData.game.id).toBe(game.id);
    });

    it('should record export options in metadata', async () => {
      const game = gameRepo.create('player-1', 'default-area');

      const result = await exporter.export(game.id, {
        includeEvents: true,
        eventLimit: 100,
        compressed: false,
      });
      const exportData: JsonExport = JSON.parse(result.data as string);

      expect(exportData.export.options.includeEvents).toBe(true);
      expect(exportData.export.options.eventLimit).toBe(100);
      expect(exportData.export.options.compressed).toBe(false);
    });
  });

  describe('pending evolutions', () => {
    it('should export pending evolutions when includePending is true', async () => {
      const game = gameRepo.create('player-1', 'default-area');

      // Create a pending evolution directly in the database
      db.prepare(`
        INSERT INTO pending_evolutions (id, game_id, turn, evolution_type, entity_type, entity_id, trait, reason, status, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        'evo-1',
        game.id,
        5,
        'trait_add',
        'player',
        'player-1',
        'brave',
        'Faced danger without hesitation',
        'pending',
        new Date().toISOString()
      );

      const result = await exporter.export(game.id, { includePending: true });
      const exportData: JsonExport = JSON.parse(result.data as string);

      expect(exportData.pendingEvolutions).toBeDefined();
      expect(exportData.pendingEvolutions).toHaveLength(1);
      expect(exportData.pendingEvolutions?.[0].trait).toBe('brave');
    });

    it('should exclude pending evolutions when includePending is false', async () => {
      const game = gameRepo.create('player-1', 'default-area');

      const result = await exporter.export(game.id, { includePending: false });
      const exportData: JsonExport = JSON.parse(result.data as string);

      expect(exportData.pendingEvolutions).toBeUndefined();
    });
  });

  describe('emergence notifications', () => {
    it('should export emergence notifications when includeNotifications is true', async () => {
      const game = gameRepo.create('player-1', 'default-area');

      // Create event first (needed for FK)
      const event = eventRepo.create({
        gameId: game.id,
        turn: 1,
        eventType: 'narration',
        content: 'A significant event',
        locationId: 'default-area',
        witnesses: [],
      });

      // Create emergence notification directly in database
      db.prepare(`
        INSERT INTO emergence_notifications (id, game_id, emergence_type, entity_type, entity_id, confidence, reason, triggering_event_id, contributing_factors, status, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        'notif-1',
        game.id,
        'villain',
        'npc',
        'npc-bandit',
        0.85,
        'Multiple hostile actions observed',
        event.id,
        JSON.stringify([{ dimension: 'fear', value: 0.9, threshold: 0.8 }]),
        'pending',
        new Date().toISOString()
      );

      const result = await exporter.export(game.id, { includeNotifications: true });
      const exportData: JsonExport = JSON.parse(result.data as string);

      expect(exportData.emergenceNotifications).toBeDefined();
      expect(exportData.emergenceNotifications).toHaveLength(1);
      expect(exportData.emergenceNotifications?.[0].emergenceType).toBe('villain');
      expect(exportData.emergenceNotifications?.[0].confidence).toBe(0.85);
    });

    it('should exclude emergence notifications when includeNotifications is false', async () => {
      const game = gameRepo.create('player-1', 'default-area');

      const result = await exporter.export(game.id, { includeNotifications: false });
      const exportData: JsonExport = JSON.parse(result.data as string);

      expect(exportData.emergenceNotifications).toBeUndefined();
    });
  });
});
