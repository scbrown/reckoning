import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { EventRepository } from '../event-repository.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('EventRepository', () => {
  let db: Database.Database;
  let repo: EventRepository;

  beforeEach(() => {
    db = new Database(':memory:');
    const schemaPath = join(__dirname, '../../schema.sql');
    const schema = readFileSync(schemaPath, 'utf-8');
    db.exec(schema);

    // Create a test game
    db.exec(`
      INSERT INTO games (id, player_id, current_area_id, turn)
      VALUES ('game-1', 'player-1', 'area-1', 5)
    `);

    repo = new EventRepository(db);
  });

  afterEach(() => {
    if (db) {
      db.close();
    }
  });

  describe('create', () => {
    it('should create an event with structured fields', () => {
      const event = repo.create({
        gameId: 'game-1',
        turn: 1,
        eventType: 'party_action',
        content: 'The warrior attacks the goblin',
        locationId: 'area-1',
        witnesses: ['npc-1', 'npc-2'],
        action: 'attack',
        actorType: 'character',
        actorId: 'char-1',
        targetType: 'npc',
        targetId: 'npc-3',
        tags: ['combat', 'melee'],
      });

      expect(event.id).toBeDefined();
      expect(event.action).toBe('attack');
      expect(event.actorType).toBe('character');
      expect(event.actorId).toBe('char-1');
      expect(event.targetType).toBe('npc');
      expect(event.targetId).toBe('npc-3');
      expect(event.tags).toEqual(['combat', 'melee']);
    });
  });

  describe('findByActions', () => {
    beforeEach(() => {
      // Create test events with different actions
      repo.create({
        gameId: 'game-1',
        turn: 1,
        eventType: 'party_action',
        content: 'Attack event',
        locationId: 'area-1',
        witnesses: [],
        action: 'attack',
      });

      repo.create({
        gameId: 'game-1',
        turn: 2,
        eventType: 'party_dialogue',
        content: 'Speak event',
        locationId: 'area-1',
        witnesses: [],
        action: 'speak',
      });

      repo.create({
        gameId: 'game-1',
        turn: 3,
        eventType: 'party_action',
        content: 'Move event',
        locationId: 'area-1',
        witnesses: [],
        action: 'move',
      });

      repo.create({
        gameId: 'game-1',
        turn: 4,
        eventType: 'party_action',
        content: 'Another attack',
        locationId: 'area-1',
        witnesses: [],
        action: 'attack',
      });
    });

    it('should find events by single action', () => {
      const events = repo.findByActions('game-1', ['attack']);
      expect(events).toHaveLength(2);
      expect(events.every(e => e.action === 'attack')).toBe(true);
    });

    it('should find events by multiple actions', () => {
      const events = repo.findByActions('game-1', ['attack', 'speak']);
      expect(events).toHaveLength(3);
    });

    it('should return empty array for no matching actions', () => {
      const events = repo.findByActions('game-1', ['cast']);
      expect(events).toHaveLength(0);
    });

    it('should return empty array for empty actions list', () => {
      const events = repo.findByActions('game-1', []);
      expect(events).toHaveLength(0);
    });

    it('should respect limit and offset', () => {
      const events = repo.findByActions('game-1', ['attack'], { limit: 1, offset: 1 });
      expect(events).toHaveLength(1);
      expect(events[0].content).toBe('Another attack');
    });
  });

  describe('countByActions', () => {
    beforeEach(() => {
      repo.create({
        gameId: 'game-1',
        turn: 1,
        eventType: 'party_action',
        content: 'Attack 1',
        locationId: 'area-1',
        witnesses: [],
        action: 'attack',
      });

      repo.create({
        gameId: 'game-1',
        turn: 2,
        eventType: 'party_action',
        content: 'Attack 2',
        locationId: 'area-1',
        witnesses: [],
        action: 'attack',
      });

      repo.create({
        gameId: 'game-1',
        turn: 3,
        eventType: 'party_dialogue',
        content: 'Speak',
        locationId: 'area-1',
        witnesses: [],
        action: 'speak',
      });
    });

    it('should count events by actions', () => {
      expect(repo.countByActions('game-1', ['attack'])).toBe(2);
      expect(repo.countByActions('game-1', ['speak'])).toBe(1);
      expect(repo.countByActions('game-1', ['attack', 'speak'])).toBe(3);
    });

    it('should return 0 for no matches', () => {
      expect(repo.countByActions('game-1', ['cast'])).toBe(0);
    });

    it('should return 0 for empty actions list', () => {
      expect(repo.countByActions('game-1', [])).toBe(0);
    });
  });

  describe('findByActor', () => {
    beforeEach(() => {
      repo.create({
        gameId: 'game-1',
        turn: 1,
        eventType: 'party_action',
        content: 'Player action',
        locationId: 'area-1',
        witnesses: [],
        actorType: 'player',
        actorId: 'player-1',
      });

      repo.create({
        gameId: 'game-1',
        turn: 2,
        eventType: 'npc_action',
        content: 'NPC action',
        locationId: 'area-1',
        witnesses: [],
        actorType: 'npc',
        actorId: 'npc-1',
      });

      repo.create({
        gameId: 'game-1',
        turn: 3,
        eventType: 'party_action',
        content: 'Another player action',
        locationId: 'area-1',
        witnesses: [],
        actorType: 'player',
        actorId: 'player-1',
      });
    });

    it('should find events by actor', () => {
      const playerEvents = repo.findByActor('game-1', 'player', 'player-1');
      expect(playerEvents).toHaveLength(2);

      const npcEvents = repo.findByActor('game-1', 'npc', 'npc-1');
      expect(npcEvents).toHaveLength(1);
    });

    it('should return empty array for non-existent actor', () => {
      const events = repo.findByActor('game-1', 'character', 'char-999');
      expect(events).toHaveLength(0);
    });

    it('should respect limit and offset', () => {
      const events = repo.findByActor('game-1', 'player', 'player-1', { limit: 1 });
      expect(events).toHaveLength(1);
      expect(events[0].content).toBe('Player action');
    });
  });

  describe('findByTarget', () => {
    beforeEach(() => {
      repo.create({
        gameId: 'game-1',
        turn: 1,
        eventType: 'party_action',
        content: 'Target NPC 1',
        locationId: 'area-1',
        witnesses: [],
        targetType: 'npc',
        targetId: 'npc-1',
      });

      repo.create({
        gameId: 'game-1',
        turn: 2,
        eventType: 'party_action',
        content: 'Target area',
        locationId: 'area-1',
        witnesses: [],
        targetType: 'area',
        targetId: 'area-2',
      });

      repo.create({
        gameId: 'game-1',
        turn: 3,
        eventType: 'party_action',
        content: 'Target NPC 1 again',
        locationId: 'area-1',
        witnesses: [],
        targetType: 'npc',
        targetId: 'npc-1',
      });
    });

    it('should find events by target', () => {
      const npcEvents = repo.findByTarget('game-1', 'npc', 'npc-1');
      expect(npcEvents).toHaveLength(2);

      const areaEvents = repo.findByTarget('game-1', 'area', 'area-2');
      expect(areaEvents).toHaveLength(1);
    });

    it('should return empty array for non-existent target', () => {
      const events = repo.findByTarget('game-1', 'object', 'obj-999');
      expect(events).toHaveLength(0);
    });
  });

  describe('findWitnessedBy', () => {
    beforeEach(() => {
      repo.create({
        gameId: 'game-1',
        turn: 1,
        eventType: 'party_action',
        content: 'Witnessed by npc-1',
        locationId: 'area-1',
        witnesses: ['npc-1', 'npc-2'],
      });

      repo.create({
        gameId: 'game-1',
        turn: 2,
        eventType: 'party_action',
        content: 'Witnessed by npc-2 only',
        locationId: 'area-1',
        witnesses: ['npc-2'],
      });

      repo.create({
        gameId: 'game-1',
        turn: 3,
        eventType: 'party_action',
        content: 'Witnessed by npc-1 again',
        locationId: 'area-1',
        witnesses: ['npc-1', 'npc-3'],
      });
    });

    it('should find events witnessed by specific entity', () => {
      const npc1Events = repo.findWitnessedBy('game-1', 'npc-1');
      expect(npc1Events).toHaveLength(2);

      const npc2Events = repo.findWitnessedBy('game-1', 'npc-2');
      expect(npc2Events).toHaveLength(2);

      const npc3Events = repo.findWitnessedBy('game-1', 'npc-3');
      expect(npc3Events).toHaveLength(1);
    });

    it('should return empty array for entity with no witnessed events', () => {
      const events = repo.findWitnessedBy('game-1', 'npc-999');
      expect(events).toHaveLength(0);
    });

    it('should respect limit and offset', () => {
      const events = repo.findWitnessedBy('game-1', 'npc-1', { limit: 1, offset: 1 });
      expect(events).toHaveLength(1);
      expect(events[0].content).toBe('Witnessed by npc-1 again');
    });
  });

  describe('findByTag', () => {
    beforeEach(() => {
      repo.create({
        gameId: 'game-1',
        turn: 1,
        eventType: 'party_action',
        content: 'Combat event',
        locationId: 'area-1',
        witnesses: [],
        tags: ['combat', 'melee'],
      });

      repo.create({
        gameId: 'game-1',
        turn: 2,
        eventType: 'party_dialogue',
        content: 'Social event',
        locationId: 'area-1',
        witnesses: [],
        tags: ['social', 'negotiation'],
      });

      repo.create({
        gameId: 'game-1',
        turn: 3,
        eventType: 'party_action',
        content: 'Another combat',
        locationId: 'area-1',
        witnesses: [],
        tags: ['combat', 'ranged'],
      });

      repo.create({
        gameId: 'game-1',
        turn: 4,
        eventType: 'narration',
        content: 'Event without tags',
        locationId: 'area-1',
        witnesses: [],
      });
    });

    it('should find events by tag', () => {
      const combatEvents = repo.findByTag('game-1', 'combat');
      expect(combatEvents).toHaveLength(2);

      const socialEvents = repo.findByTag('game-1', 'social');
      expect(socialEvents).toHaveLength(1);

      const meleeEvents = repo.findByTag('game-1', 'melee');
      expect(meleeEvents).toHaveLength(1);
    });

    it('should return empty array for non-existent tag', () => {
      const events = repo.findByTag('game-1', 'magic');
      expect(events).toHaveLength(0);
    });

    it('should not match events without tags', () => {
      const events = repo.findByTag('game-1', 'narration');
      expect(events).toHaveLength(0);
    });

    it('should respect limit and offset', () => {
      const events = repo.findByTag('game-1', 'combat', { limit: 1, offset: 1 });
      expect(events).toHaveLength(1);
      expect(events[0].content).toBe('Another combat');
    });
  });

  describe('getActionSummary', () => {
    beforeEach(() => {
      repo.create({
        gameId: 'game-1',
        turn: 1,
        eventType: 'party_action',
        content: 'Attack 1',
        locationId: 'area-1',
        witnesses: [],
        action: 'attack',
      });

      repo.create({
        gameId: 'game-1',
        turn: 2,
        eventType: 'party_action',
        content: 'Attack 2',
        locationId: 'area-1',
        witnesses: [],
        action: 'attack',
      });

      repo.create({
        gameId: 'game-1',
        turn: 3,
        eventType: 'party_action',
        content: 'Attack 3',
        locationId: 'area-1',
        witnesses: [],
        action: 'attack',
      });

      repo.create({
        gameId: 'game-1',
        turn: 4,
        eventType: 'party_dialogue',
        content: 'Speak',
        locationId: 'area-1',
        witnesses: [],
        action: 'speak',
      });

      repo.create({
        gameId: 'game-1',
        turn: 5,
        eventType: 'party_action',
        content: 'Move',
        locationId: 'area-1',
        witnesses: [],
        action: 'move',
      });

      repo.create({
        gameId: 'game-1',
        turn: 6,
        eventType: 'narration',
        content: 'No action',
        locationId: 'area-1',
        witnesses: [],
      });
    });

    it('should return action counts sorted by frequency', () => {
      const summary = repo.getActionSummary('game-1');

      expect(summary.size).toBe(3);
      expect(summary.get('attack')).toBe(3);
      expect(summary.get('speak')).toBe(1);
      expect(summary.get('move')).toBe(1);
    });

    it('should not include events without actions', () => {
      const summary = repo.getActionSummary('game-1');
      expect(summary.has(null as unknown as string)).toBe(false);
    });

    it('should return empty map for game with no events', () => {
      db.exec(`
        INSERT INTO games (id, player_id, current_area_id, turn)
        VALUES ('game-2', 'player-2', 'area-1', 1)
      `);

      const summary = repo.getActionSummary('game-2');
      expect(summary.size).toBe(0);
    });
  });
});
