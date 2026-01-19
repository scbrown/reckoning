import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

import { GameRepository } from '../db/repositories/game-repository.js';
import { EventRepository } from '../db/repositories/event-repository.js';
import { AreaRepository } from '../db/repositories/area-repository.js';
import { PartyRepository } from '../db/repositories/party-repository.js';
import { SaveRepository } from '../db/repositories/save-repository.js';
import { EditorStateRepository } from '../db/repositories/editor-state-repository.js';
import { RelationshipRepository } from '../db/repositories/relationship-repository.js';
import { TraitRepository } from '../db/repositories/trait-repository.js';
import { PendingEvolutionRepository } from '../db/repositories/pending-evolution-repository.js';
import { EvolutionService } from '../services/evolution/evolution-service.js';
import type { EvolutionEvent } from '../services/evolution/types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function createTestDatabase(): Database.Database {
  const db = new Database(':memory:');
  const schemaPath = join(__dirname, '../db/schema.sql');
  const schema = readFileSync(schemaPath, 'utf-8');
  db.exec(schema);
  return db;
}

describe('GameRepository', () => {
  let db: Database.Database;
  let repo: GameRepository;

  beforeEach(() => {
    db = createTestDatabase();
    repo = new GameRepository(db);
  });

  afterEach(() => {
    db.close();
  });

  it('should create a game', () => {
    const game = repo.create('player-1', 'area-1');

    expect(game.id).toBeDefined();
    expect(game.playerId).toBe('player-1');
    expect(game.currentAreaId).toBe('area-1');
    expect(game.turn).toBe(0);
    expect(game.createdAt).toBeDefined();
    expect(game.updatedAt).toBeDefined();
  });

  it('should find a game by id', () => {
    const created = repo.create('player-1', 'area-1');
    const found = repo.findById(created.id);

    expect(found).not.toBeNull();
    expect(found?.id).toBe(created.id);
    expect(found?.playerId).toBe('player-1');
  });

  it('should return null for non-existent game', () => {
    const found = repo.findById('non-existent');
    expect(found).toBeNull();
  });

  it('should update a game', () => {
    const created = repo.create('player-1', 'area-1');
    repo.update({ id: created.id, currentAreaId: 'area-2', turn: 5 });

    const found = repo.findById(created.id);
    expect(found?.currentAreaId).toBe('area-2');
    expect(found?.turn).toBe(5);
  });

  it('should delete a game', () => {
    const created = repo.create('player-1', 'area-1');
    repo.delete(created.id);

    const found = repo.findById(created.id);
    expect(found).toBeNull();
  });

  it('should set playback mode', () => {
    const created = repo.create('player-1', 'area-1');
    repo.setPlaybackMode(created.id, 'paused');

    const mode = repo.getPlaybackMode(created.id);
    expect(mode).toBe('paused');
  });

  it('should increment turn', () => {
    const created = repo.create('player-1', 'area-1');
    const newTurn = repo.incrementTurn(created.id);

    expect(newTurn).toBe(1);

    const secondTurn = repo.incrementTurn(created.id);
    expect(secondTurn).toBe(2);
  });
});

describe('EventRepository', () => {
  let db: Database.Database;
  let repo: EventRepository;
  let gameId: string;

  beforeEach(() => {
    db = createTestDatabase();
    repo = new EventRepository(db);

    // Create a game for events
    db.prepare(`
      INSERT INTO games (id, player_id, current_area_id, turn)
      VALUES ('game-1', 'player-1', 'area-1', 0)
    `).run();
    gameId = 'game-1';
  });

  afterEach(() => {
    db.close();
  });

  it('should create an event', () => {
    const event = repo.create({
      gameId,
      turn: 1,
      eventType: 'narration',
      content: 'Test event',
      locationId: 'area-1',
      witnesses: ['player-1'],
    });

    expect(event.id).toBeDefined();
    expect(event.timestamp).toBeDefined();
    expect(event.content).toBe('Test event');
    expect(event.eventType).toBe('narration');
  });

  it('should find event by id', () => {
    const created = repo.create({
      gameId,
      turn: 1,
      eventType: 'narration',
      content: 'Test event',
      locationId: 'area-1',
      witnesses: [],
    });

    const found = repo.findById(created.id);
    expect(found).not.toBeNull();
    expect(found?.content).toBe('Test event');
  });

  it('should find events by game', () => {
    repo.create({ gameId, turn: 1, eventType: 'narration', content: 'Event 1', locationId: 'area-1', witnesses: [] });
    repo.create({ gameId, turn: 2, eventType: 'narration', content: 'Event 2', locationId: 'area-1', witnesses: [] });

    const events = repo.findByGame(gameId);
    expect(events).toHaveLength(2);
  });

  it('should find events by turn', () => {
    repo.create({ gameId, turn: 1, eventType: 'narration', content: 'Turn 1 Event', locationId: 'area-1', witnesses: [] });
    repo.create({ gameId, turn: 2, eventType: 'narration', content: 'Turn 2 Event', locationId: 'area-1', witnesses: [] });

    const events = repo.findByTurn(gameId, 1);
    expect(events).toHaveLength(1);
    expect(events[0].content).toBe('Turn 1 Event');
  });

  it('should get recent context', () => {
    // Create events with staggered turns to ensure ordering
    for (let i = 0; i < 15; i++) {
      repo.create({ gameId, turn: i, eventType: 'narration', content: `Event ${i}`, locationId: 'area-1', witnesses: [] });
    }

    const recent = repo.getRecentContext(gameId, 5);
    expect(recent).toHaveLength(5);

    // Verify all events are from the game
    expect(recent.every(e => e.gameId === gameId)).toBe(true);
    expect(recent.every(e => e.eventType === 'narration')).toBe(true);
  });

  it('should count events by game', () => {
    repo.create({ gameId, turn: 1, eventType: 'narration', content: 'Event 1', locationId: 'area-1', witnesses: [] });
    repo.create({ gameId, turn: 2, eventType: 'narration', content: 'Event 2', locationId: 'area-1', witnesses: [] });

    const count = repo.countByGame(gameId);
    expect(count).toBe(2);
  });

  it('should count events by turn', () => {
    repo.create({ gameId, turn: 1, eventType: 'narration', content: 'Event 1', locationId: 'area-1', witnesses: [] });
    repo.create({ gameId, turn: 1, eventType: 'npc_dialogue', content: 'Event 2', locationId: 'area-1', witnesses: [] });
    repo.create({ gameId, turn: 2, eventType: 'narration', content: 'Event 3', locationId: 'area-1', witnesses: [] });

    const count = repo.countByTurn(gameId, 1);
    expect(count).toBe(2);
  });
});

describe('AreaRepository', () => {
  let db: Database.Database;
  let repo: AreaRepository;

  beforeEach(() => {
    db = createTestDatabase();
    repo = new AreaRepository(db);

    // Seed test area
    db.prepare(`
      INSERT INTO areas (id, name, description, tags)
      VALUES ('area-1', 'Test Area', 'A test area description', '["test", "indoor"]')
    `).run();

    db.prepare(`
      INSERT INTO area_exits (area_id, direction, target_area_id, description, locked)
      VALUES ('area-1', 'north', 'area-2', 'A door to the north', 0)
    `).run();

    db.prepare(`
      INSERT INTO area_objects (id, area_id, name, description, interactable, tags)
      VALUES ('obj-1', 'area-1', 'Table', 'A wooden table', 1, '["furniture"]')
    `).run();

    db.prepare(`
      INSERT INTO npcs (id, name, description, current_area_id, disposition, tags)
      VALUES ('npc-1', 'Guard', 'A stern guard', 'area-1', 'neutral', '["guard"]')
    `).run();
  });

  afterEach(() => {
    db.close();
  });

  it('should find area by id', () => {
    const area = repo.findById('area-1');

    expect(area).not.toBeNull();
    expect(area?.name).toBe('Test Area');
    expect(area?.tags).toEqual(['test', 'indoor']);
  });

  it('should return null for non-existent area', () => {
    const area = repo.findById('non-existent');
    expect(area).toBeNull();
  });

  it('should find all areas', () => {
    db.prepare(`
      INSERT INTO areas (id, name, description, tags)
      VALUES ('area-2', 'Second Area', 'Another area', '[]')
    `).run();

    // default-area is seeded in schema.sql, so we have: default-area, area-1, area-2
    const areas = repo.findAll();
    expect(areas).toHaveLength(3);
  });

  it('should get area with details', () => {
    const area = repo.getWithDetails('area-1');

    expect(area).not.toBeNull();
    expect(area?.exits).toHaveLength(1);
    expect(area?.exits[0].direction).toBe('north');
    expect(area?.objects).toHaveLength(1);
    expect(area?.objects[0].name).toBe('Table');
    expect(area?.npcs).toHaveLength(1);
    expect(area?.npcs[0].name).toBe('Guard');
  });

  it('should get NPCs in area', () => {
    const npcs = repo.getNPCsInArea('area-1');

    expect(npcs).toHaveLength(1);
    expect(npcs[0].name).toBe('Guard');
    expect(npcs[0].disposition).toBe('neutral');
  });

  it('should move NPC to different area', () => {
    db.prepare(`
      INSERT INTO areas (id, name, description, tags)
      VALUES ('area-2', 'Second Area', 'Another area', '[]')
    `).run();

    repo.moveNPC('npc-1', 'area-2');

    const npcsInArea1 = repo.getNPCsInArea('area-1');
    const npcsInArea2 = repo.getNPCsInArea('area-2');

    expect(npcsInArea1).toHaveLength(0);
    expect(npcsInArea2).toHaveLength(1);
  });
});

describe('PartyRepository', () => {
  let db: Database.Database;
  let repo: PartyRepository;
  let gameId: string;

  beforeEach(() => {
    db = createTestDatabase();
    repo = new PartyRepository(db);

    db.prepare(`
      INSERT INTO games (id, player_id, current_area_id, turn)
      VALUES ('game-1', 'player-1', 'area-1', 0)
    `).run();
    gameId = 'game-1';
  });

  afterEach(() => {
    db.close();
  });

  it('should create a party', () => {
    const party = repo.create(gameId, 'The Heroes');

    expect(party.id).toBeDefined();
    expect(party.gameId).toBe(gameId);
    expect(party.members).toHaveLength(0);
  });

  it('should add characters to a party', () => {
    const party = repo.create(gameId);
    const warrior = repo.addCharacter(party.id, {
      name: 'Warrior',
      description: 'A brave warrior',
      class: 'Fighter',
      role: 'player',
      stats: { health: 100, maxHealth: 100 },
    });
    const mage = repo.addCharacter(party.id, {
      name: 'Mage',
      description: 'A wise mage',
      class: 'Wizard',
      role: 'member',
      stats: { health: 60, maxHealth: 60 },
    });

    expect(warrior.id).toBeDefined();
    expect(warrior.name).toBe('Warrior');
    expect(mage.name).toBe('Mage');
  });

  it('should find parties by game', () => {
    const party = repo.create(gameId);
    repo.addCharacter(party.id, {
      name: 'Warrior',
      description: 'A brave warrior',
      class: 'Fighter',
      role: 'player',
    });

    const parties = repo.findByGameId(gameId);
    expect(parties).toHaveLength(1);
    expect(parties[0]?.members).toHaveLength(1);
    expect(parties[0]?.members[0]?.name).toBe('Warrior');
  });

  it('should get party with members', () => {
    const party = repo.create(gameId);
    repo.addCharacter(party.id, {
      name: 'Warrior',
      description: 'A brave warrior',
      class: 'Fighter',
      role: 'player',
    });

    const found = repo.getWithMembers(party.id);
    expect(found).not.toBeNull();
    expect(found?.members).toHaveLength(1);
    expect(found?.members[0]?.name).toBe('Warrior');
  });

  it('should update a character', () => {
    const party = repo.create(gameId);
    const character = repo.addCharacter(party.id, {
      name: 'Warrior',
      description: 'A brave warrior',
      class: 'Fighter',
      role: 'player',
    });

    repo.updateCharacter({ id: character.id, name: 'Veteran Warrior', class: 'Champion' });

    const found = repo.getWithMembers(party.id);
    expect(found?.members[0]?.name).toBe('Veteran Warrior');
    expect(found?.members[0]?.class).toBe('Champion');
  });

  it('should remove a character', () => {
    const party = repo.create(gameId);
    const character = repo.addCharacter(party.id, {
      name: 'Warrior',
      description: 'A brave warrior',
      class: 'Fighter',
      role: 'player',
    });

    repo.removeCharacter(character.id);

    const found = repo.getWithMembers(party.id);
    expect(found?.members).toHaveLength(0);
  });

  it('should delete party and its characters', () => {
    const party = repo.create(gameId);
    repo.addCharacter(party.id, {
      name: 'Warrior',
      description: 'A brave warrior',
      class: 'Fighter',
      role: 'player',
    });
    repo.addCharacter(party.id, {
      name: 'Mage',
      description: 'A wise mage',
      class: 'Wizard',
      role: 'member',
    });

    repo.delete(party.id);

    const parties = repo.findByGameId(gameId);
    expect(parties).toHaveLength(0);
  });

  it('should find all characters by game (deprecated method)', () => {
    const party = repo.create(gameId);
    repo.addCharacter(party.id, {
      name: 'Warrior',
      description: 'A brave warrior',
      class: 'Fighter',
      role: 'player',
    });

    const members = repo.findByGame(gameId);
    expect(members).toHaveLength(1);
    expect(members[0]?.name).toBe('Warrior');
  });
});

describe('SaveRepository', () => {
  let db: Database.Database;
  let repo: SaveRepository;
  let gameId: string;

  beforeEach(() => {
    db = createTestDatabase();
    repo = new SaveRepository(db);

    db.prepare(`
      INSERT INTO games (id, player_id, current_area_id, turn)
      VALUES ('game-1', 'player-1', 'area-1', 5)
    `).run();
    gameId = 'game-1';
  });

  afterEach(() => {
    db.close();
  });

  it('should save a game snapshot', () => {
    const snapshot = { state: 'test', value: 123 };
    const slot = repo.save(gameId, 'Save 1', snapshot);

    expect(slot.id).toBeDefined();
    expect(slot.gameId).toBe(gameId);
    expect(slot.name).toBe('Save 1');
    expect(slot.turn).toBe(5);
    expect(slot.createdAt).toBeDefined();
  });

  it('should load a save', () => {
    const snapshot = { state: 'test', value: 123 };
    const slot = repo.save(gameId, 'Save 1', snapshot);

    const loaded = repo.load(slot.id);
    expect(loaded).not.toBeNull();
    expect(loaded?.slot.name).toBe('Save 1');
    expect(loaded?.snapshot).toEqual(snapshot);
  });

  it('should return null for non-existent save', () => {
    const loaded = repo.load('non-existent');
    expect(loaded).toBeNull();
  });

  it('should list all saves', () => {
    repo.save(gameId, 'Save 1', {});
    repo.save(gameId, 'Save 2', {});

    const saves = repo.list();
    expect(saves).toHaveLength(2);
  });

  it('should list saves by game', () => {
    db.prepare(`
      INSERT INTO games (id, player_id, current_area_id, turn)
      VALUES ('game-2', 'player-1', 'area-1', 0)
    `).run();

    repo.save(gameId, 'Save 1', {});
    repo.save('game-2', 'Save 2', {});

    const saves = repo.list(gameId);
    expect(saves).toHaveLength(1);
    expect(saves[0].name).toBe('Save 1');
  });

  it('should delete a save', () => {
    const slot = repo.save(gameId, 'Save 1', {});
    repo.delete(slot.id);

    const loaded = repo.load(slot.id);
    expect(loaded).toBeNull();
  });

  it('should find save by name', () => {
    repo.save(gameId, 'My Save', {});

    const found = repo.findByName('My Save');
    expect(found).not.toBeNull();
    expect(found?.name).toBe('My Save');
  });
});

describe('EditorStateRepository', () => {
  let db: Database.Database;
  let repo: EditorStateRepository;
  let gameId: string;

  beforeEach(() => {
    db = createTestDatabase();
    repo = new EditorStateRepository(db);

    db.prepare(`
      INSERT INTO games (id, player_id, current_area_id, turn)
      VALUES ('game-1', 'player-1', 'area-1', 0)
    `).run();
    gameId = 'game-1';
  });

  afterEach(() => {
    db.close();
  });

  it('should return null for non-existent editor state', () => {
    const state = repo.get(gameId);
    expect(state).toBeNull();
  });

  it('should set editor state', () => {
    repo.set(gameId, {
      pending: 'pending content',
      editedContent: 'edited content',
      status: 'editing',
    });

    const state = repo.get(gameId);
    expect(state).not.toBeNull();
    expect(state?.pending).toBe('pending content');
    expect(state?.editedContent).toBe('edited content');
    expect(state?.status).toBe('editing');
  });

  it('should update editor state (upsert)', () => {
    repo.set(gameId, { pending: 'first', editedContent: null, status: 'generating' });
    repo.set(gameId, { pending: 'second', editedContent: 'edited', status: 'editing' });

    const state = repo.get(gameId);
    expect(state?.pending).toBe('second');
    expect(state?.editedContent).toBe('edited');
    expect(state?.status).toBe('editing');
  });

  it('should clear editor state', () => {
    repo.set(gameId, { pending: 'content', editedContent: null, status: 'editing' });
    repo.clear(gameId);

    const state = repo.get(gameId);
    expect(state).toBeNull();
  });

  it('should set pending content', () => {
    repo.setPending(gameId, 'new pending');

    const state = repo.get(gameId);
    expect(state?.pending).toBe('new pending');
    expect(state?.status).toBe('editing');
  });

  it('should handle null values', () => {
    repo.set(gameId, {
      pending: null,
      editedContent: null,
      status: 'idle',
    });

    const state = repo.get(gameId);
    expect(state?.pending).toBeNull();
    expect(state?.editedContent).toBeNull();
    expect(state?.status).toBe('idle');
  });
});

describe('RelationshipRepository', () => {
  let db: Database.Database;
  let repo: RelationshipRepository;
  let gameId: string;

  beforeEach(() => {
    db = createTestDatabase();
    repo = new RelationshipRepository(db);

    db.prepare(`
      INSERT INTO games (id, player_id, current_area_id, turn)
      VALUES ('game-1', 'player-1', 'area-1', 0)
    `).run();
    gameId = 'game-1';
  });

  afterEach(() => {
    db.close();
  });

  describe('upsert', () => {
    it('should create a new relationship with default values', () => {
      const rel = repo.upsert({
        gameId,
        from: { type: 'player', id: 'player-1' },
        to: { type: 'npc', id: 'npc-1' },
        updatedTurn: 1,
      });

      expect(rel.id).toBeDefined();
      expect(rel.gameId).toBe(gameId);
      expect(rel.from.type).toBe('player');
      expect(rel.from.id).toBe('player-1');
      expect(rel.to.type).toBe('npc');
      expect(rel.to.id).toBe('npc-1');
      expect(rel.trust).toBe(0.5);
      expect(rel.respect).toBe(0.5);
      expect(rel.affection).toBe(0.5);
      expect(rel.fear).toBe(0.0);
      expect(rel.resentment).toBe(0.0);
      expect(rel.debt).toBe(0.0);
      expect(rel.updatedTurn).toBe(1);
    });

    it('should create a relationship with custom dimension values', () => {
      const rel = repo.upsert({
        gameId,
        from: { type: 'player', id: 'player-1' },
        to: { type: 'npc', id: 'npc-1' },
        updatedTurn: 1,
        trust: 0.8,
        fear: 0.2,
      });

      expect(rel.trust).toBe(0.8);
      expect(rel.fear).toBe(0.2);
      expect(rel.respect).toBe(0.5); // default
    });

    it('should update existing relationship', () => {
      const original = repo.upsert({
        gameId,
        from: { type: 'player', id: 'player-1' },
        to: { type: 'npc', id: 'npc-1' },
        updatedTurn: 1,
        trust: 0.5,
      });

      const updated = repo.upsert({
        gameId,
        from: { type: 'player', id: 'player-1' },
        to: { type: 'npc', id: 'npc-1' },
        updatedTurn: 2,
        trust: 0.3,
      });

      expect(updated.id).toBe(original.id);
      expect(updated.trust).toBe(0.3);
      expect(updated.updatedTurn).toBe(2);
    });
  });

  describe('findBetween', () => {
    it('should find relationship between two entities', () => {
      repo.upsert({
        gameId,
        from: { type: 'player', id: 'player-1' },
        to: { type: 'npc', id: 'npc-1' },
        updatedTurn: 1,
      });

      const found = repo.findBetween(
        gameId,
        { type: 'player', id: 'player-1' },
        { type: 'npc', id: 'npc-1' }
      );

      expect(found).not.toBeNull();
      expect(found?.from.id).toBe('player-1');
      expect(found?.to.id).toBe('npc-1');
    });

    it('should return null if relationship does not exist', () => {
      const found = repo.findBetween(
        gameId,
        { type: 'player', id: 'player-1' },
        { type: 'npc', id: 'npc-1' }
      );

      expect(found).toBeNull();
    });

    it('should not find reverse relationship', () => {
      repo.upsert({
        gameId,
        from: { type: 'player', id: 'player-1' },
        to: { type: 'npc', id: 'npc-1' },
        updatedTurn: 1,
      });

      const found = repo.findBetween(
        gameId,
        { type: 'npc', id: 'npc-1' },
        { type: 'player', id: 'player-1' }
      );

      expect(found).toBeNull();
    });
  });

  describe('findByEntity', () => {
    it('should find relationships where entity is the source', () => {
      repo.upsert({
        gameId,
        from: { type: 'player', id: 'player-1' },
        to: { type: 'npc', id: 'npc-1' },
        updatedTurn: 1,
      });
      repo.upsert({
        gameId,
        from: { type: 'player', id: 'player-1' },
        to: { type: 'npc', id: 'npc-2' },
        updatedTurn: 1,
      });

      const found = repo.findByEntity(gameId, { type: 'player', id: 'player-1' });

      expect(found).toHaveLength(2);
    });

    it('should find relationships where entity is the target', () => {
      repo.upsert({
        gameId,
        from: { type: 'npc', id: 'npc-1' },
        to: { type: 'player', id: 'player-1' },
        updatedTurn: 1,
      });
      repo.upsert({
        gameId,
        from: { type: 'npc', id: 'npc-2' },
        to: { type: 'player', id: 'player-1' },
        updatedTurn: 1,
      });

      const found = repo.findByEntity(gameId, { type: 'player', id: 'player-1' });

      expect(found).toHaveLength(2);
    });

    it('should find relationships in both directions', () => {
      repo.upsert({
        gameId,
        from: { type: 'player', id: 'player-1' },
        to: { type: 'npc', id: 'npc-1' },
        updatedTurn: 1,
      });
      repo.upsert({
        gameId,
        from: { type: 'npc', id: 'npc-2' },
        to: { type: 'player', id: 'player-1' },
        updatedTurn: 1,
      });

      const found = repo.findByEntity(gameId, { type: 'player', id: 'player-1' });

      expect(found).toHaveLength(2);
    });
  });

  describe('findByThreshold', () => {
    beforeEach(() => {
      // Create relationships with varying trust levels
      repo.upsert({
        gameId,
        from: { type: 'player', id: 'player-1' },
        to: { type: 'npc', id: 'npc-1' },
        updatedTurn: 1,
        trust: 0.9,
      });
      repo.upsert({
        gameId,
        from: { type: 'player', id: 'player-1' },
        to: { type: 'npc', id: 'npc-2' },
        updatedTurn: 1,
        trust: 0.5,
      });
      repo.upsert({
        gameId,
        from: { type: 'player', id: 'player-1' },
        to: { type: 'npc', id: 'npc-3' },
        updatedTurn: 1,
        trust: 0.2,
      });
    });

    it('should find relationships with dimension >= threshold', () => {
      const found = repo.findByThreshold(gameId, 'trust', 0.5, '>=');

      expect(found).toHaveLength(2);
      expect(found.every(r => r.trust >= 0.5)).toBe(true);
    });

    it('should find relationships with dimension > threshold', () => {
      const found = repo.findByThreshold(gameId, 'trust', 0.5, '>');

      expect(found).toHaveLength(1);
      expect(found[0].trust).toBe(0.9);
    });

    it('should find relationships with dimension <= threshold', () => {
      const found = repo.findByThreshold(gameId, 'trust', 0.5, '<=');

      expect(found).toHaveLength(2);
      expect(found.every(r => r.trust <= 0.5)).toBe(true);
    });

    it('should find relationships with dimension < threshold', () => {
      const found = repo.findByThreshold(gameId, 'trust', 0.5, '<');

      expect(found).toHaveLength(1);
      expect(found[0].trust).toBe(0.2);
    });

    it('should throw error for invalid dimension', () => {
      expect(() => {
        repo.findByThreshold(gameId, 'invalid' as 'trust', 0.5, '>=');
      }).toThrow('Invalid dimension');
    });

    it('should throw error for invalid operator', () => {
      expect(() => {
        repo.findByThreshold(gameId, 'trust', 0.5, '==' as '>=');
      }).toThrow('Invalid operator');
    });
  });

  describe('updateDimension', () => {
    it('should update a specific dimension', () => {
      const rel = repo.upsert({
        gameId,
        from: { type: 'player', id: 'player-1' },
        to: { type: 'npc', id: 'npc-1' },
        updatedTurn: 1,
        trust: 0.5,
      });

      const updated = repo.updateDimension(rel.id, 'trust', 0.8, 2);

      expect(updated).not.toBeNull();
      expect(updated?.trust).toBe(0.8);
      expect(updated?.updatedTurn).toBe(2);
    });

    it('should return null if relationship does not exist', () => {
      const result = repo.updateDimension('non-existent', 'trust', 0.5, 1);
      expect(result).toBeNull();
    });

    it('should throw error for invalid dimension', () => {
      const rel = repo.upsert({
        gameId,
        from: { type: 'player', id: 'player-1' },
        to: { type: 'npc', id: 'npc-1' },
        updatedTurn: 1,
      });

      expect(() => {
        repo.updateDimension(rel.id, 'invalid' as 'trust', 0.5, 1);
      }).toThrow('Invalid dimension');
    });

    it('should throw error for value out of range', () => {
      const rel = repo.upsert({
        gameId,
        from: { type: 'player', id: 'player-1' },
        to: { type: 'npc', id: 'npc-1' },
        updatedTurn: 1,
      });

      expect(() => {
        repo.updateDimension(rel.id, 'trust', 1.5, 1);
      }).toThrow('Dimension value must be between 0.0 and 1.0');

      expect(() => {
        repo.updateDimension(rel.id, 'trust', -0.5, 1);
      }).toThrow('Dimension value must be between 0.0 and 1.0');
    });
  });

  describe('delete', () => {
    it('should delete a relationship', () => {
      const rel = repo.upsert({
        gameId,
        from: { type: 'player', id: 'player-1' },
        to: { type: 'npc', id: 'npc-1' },
        updatedTurn: 1,
      });

      repo.delete(rel.id);

      const found = repo.findById(rel.id);
      expect(found).toBeNull();
    });
  });

  describe('deleteByGame', () => {
    it('should delete all relationships in a game', () => {
      repo.upsert({
        gameId,
        from: { type: 'player', id: 'player-1' },
        to: { type: 'npc', id: 'npc-1' },
        updatedTurn: 1,
      });
      repo.upsert({
        gameId,
        from: { type: 'player', id: 'player-1' },
        to: { type: 'npc', id: 'npc-2' },
        updatedTurn: 1,
      });

      repo.deleteByGame(gameId);

      const found = repo.findByEntity(gameId, { type: 'player', id: 'player-1' });
      expect(found).toHaveLength(0);
    });
  });

  describe('deleteByEntity', () => {
    it('should delete all relationships involving an entity', () => {
      repo.upsert({
        gameId,
        from: { type: 'player', id: 'player-1' },
        to: { type: 'npc', id: 'npc-1' },
        updatedTurn: 1,
      });
      repo.upsert({
        gameId,
        from: { type: 'npc', id: 'npc-2' },
        to: { type: 'player', id: 'player-1' },
        updatedTurn: 1,
      });
      repo.upsert({
        gameId,
        from: { type: 'npc', id: 'npc-1' },
        to: { type: 'npc', id: 'npc-2' },
        updatedTurn: 1,
      });

      repo.deleteByEntity(gameId, { type: 'player', id: 'player-1' });

      // Player relationships should be deleted
      const playerRels = repo.findByEntity(gameId, { type: 'player', id: 'player-1' });
      expect(playerRels).toHaveLength(0);

      // NPC-to-NPC relationship should still exist
      const npcRels = repo.findByEntity(gameId, { type: 'npc', id: 'npc-1' });
      expect(npcRels).toHaveLength(1);
    });
  });
});

describe('TraitRepository', () => {
  let db: Database.Database;
  let repo: TraitRepository;
  let gameId: string;

  beforeEach(() => {
    db = createTestDatabase();
    repo = new TraitRepository(db);

    db.prepare(`
      INSERT INTO games (id, player_id, current_area_id, turn)
      VALUES ('game-1', 'player-1', 'area-1', 0)
    `).run();
    gameId = 'game-1';
  });

  afterEach(() => {
    db.close();
  });

  it('should add a trait to an entity', () => {
    const trait = repo.addTrait({
      gameId,
      entityType: 'player',
      entityId: 'player-1',
      trait: 'honorable',
      turn: 1,
    });

    expect(trait.id).toBeDefined();
    expect(trait.gameId).toBe(gameId);
    expect(trait.entityType).toBe('player');
    expect(trait.entityId).toBe('player-1');
    expect(trait.trait).toBe('honorable');
    expect(trait.acquiredTurn).toBe(1);
    expect(trait.status).toBe('active');
    expect(trait.createdAt).toBeDefined();
  });

  it('should add a trait with source event', () => {
    // Create an event first
    db.prepare(`
      INSERT INTO events (id, game_id, turn, event_type, content, location_id)
      VALUES ('event-1', 'game-1', 1, 'narration', 'Test event', 'area-1')
    `).run();

    const trait = repo.addTrait({
      gameId,
      entityType: 'player',
      entityId: 'player-1',
      trait: 'merciful',
      turn: 1,
      sourceEventId: 'event-1',
    });

    expect(trait.sourceEventId).toBe('event-1');
  });

  it('should find traits by entity', () => {
    repo.addTrait({ gameId, entityType: 'player', entityId: 'player-1', trait: 'honorable', turn: 1 });
    repo.addTrait({ gameId, entityType: 'player', entityId: 'player-1', trait: 'merciful', turn: 2 });
    repo.addTrait({ gameId, entityType: 'npc', entityId: 'npc-1', trait: 'ruthless', turn: 1 });

    const playerTraits = repo.findByEntity(gameId, 'player', 'player-1');

    expect(playerTraits).toHaveLength(2);
    expect(playerTraits.map(t => t.trait)).toContain('honorable');
    expect(playerTraits.map(t => t.trait)).toContain('merciful');
  });

  it('should find entities by trait', () => {
    repo.addTrait({ gameId, entityType: 'player', entityId: 'player-1', trait: 'honorable', turn: 1 });
    repo.addTrait({ gameId, entityType: 'npc', entityId: 'npc-1', trait: 'honorable', turn: 2 });
    repo.addTrait({ gameId, entityType: 'npc', entityId: 'npc-2', trait: 'ruthless', turn: 1 });

    const honorableEntities = repo.findByTrait(gameId, 'honorable');

    expect(honorableEntities).toHaveLength(2);
    expect(honorableEntities.map(t => t.entityId)).toContain('player-1');
    expect(honorableEntities.map(t => t.entityId)).toContain('npc-1');
  });

  it('should remove a trait (set status to removed)', () => {
    repo.addTrait({ gameId, entityType: 'player', entityId: 'player-1', trait: 'honorable', turn: 1 });

    repo.removeTrait(gameId, 'player', 'player-1', 'honorable');

    const traits = repo.findByEntity(gameId, 'player', 'player-1');
    expect(traits).toHaveLength(0); // removed traits are not active
  });

  it('should get trait history including removed traits', () => {
    repo.addTrait({ gameId, entityType: 'player', entityId: 'player-1', trait: 'honorable', turn: 1 });
    repo.addTrait({ gameId, entityType: 'player', entityId: 'player-1', trait: 'merciful', turn: 2 });
    repo.removeTrait(gameId, 'player', 'player-1', 'honorable');

    const history = repo.getTraitHistory(gameId, 'player', 'player-1');

    expect(history).toHaveLength(2);
    const honorable = history.find(t => t.trait === 'honorable');
    const merciful = history.find(t => t.trait === 'merciful');
    expect(honorable?.status).toBe('removed');
    expect(merciful?.status).toBe('active');
  });

  it('should get trait catalog', () => {
    const catalog = repo.getTraitCatalog();

    expect(catalog.length).toBe(24);
    expect(catalog.some(t => t.trait === 'honorable')).toBe(true);
    expect(catalog.some(t => t.trait === 'ruthless')).toBe(true);
    expect(catalog.some(t => t.category === 'moral')).toBe(true);
    expect(catalog.some(t => t.category === 'emotional')).toBe(true);
    expect(catalog.some(t => t.category === 'capability')).toBe(true);
    expect(catalog.some(t => t.category === 'reputation')).toBe(true);
  });

  it('should get traits by category', () => {
    const moralTraits = repo.getTraitsByCategory('moral');

    expect(moralTraits.length).toBe(6);
    expect(moralTraits.every(t => t.category === 'moral')).toBe(true);
  });

  it('should find trait by id', () => {
    const created = repo.addTrait({ gameId, entityType: 'player', entityId: 'player-1', trait: 'honorable', turn: 1 });

    const found = repo.findById(created.id);

    expect(found).not.toBeNull();
    expect(found?.trait).toBe('honorable');
  });

  it('should return null for non-existent trait', () => {
    const found = repo.findById('non-existent');
    expect(found).toBeNull();
  });

  it('should check if entity has trait', () => {
    repo.addTrait({ gameId, entityType: 'player', entityId: 'player-1', trait: 'honorable', turn: 1 });

    expect(repo.hasTrait(gameId, 'player', 'player-1', 'honorable')).toBe(true);
    expect(repo.hasTrait(gameId, 'player', 'player-1', 'ruthless')).toBe(false);
  });

  it('should not return removed traits when checking hasTrait', () => {
    repo.addTrait({ gameId, entityType: 'player', entityId: 'player-1', trait: 'honorable', turn: 1 });
    repo.removeTrait(gameId, 'player', 'player-1', 'honorable');

    expect(repo.hasTrait(gameId, 'player', 'player-1', 'honorable')).toBe(false);
  });

  it('should update trait status', () => {
    const created = repo.addTrait({ gameId, entityType: 'player', entityId: 'player-1', trait: 'honorable', turn: 1 });

    repo.updateStatus(created.id, 'faded');

    const found = repo.findById(created.id);
    expect(found?.status).toBe('faded');
  });

  it('should delete a trait permanently', () => {
    const created = repo.addTrait({ gameId, entityType: 'player', entityId: 'player-1', trait: 'honorable', turn: 1 });

    repo.delete(created.id);

    const found = repo.findById(created.id);
    expect(found).toBeNull();
  });

  it('should delete all traits for a game', () => {
    repo.addTrait({ gameId, entityType: 'player', entityId: 'player-1', trait: 'honorable', turn: 1 });
    repo.addTrait({ gameId, entityType: 'npc', entityId: 'npc-1', trait: 'ruthless', turn: 1 });

    repo.deleteByGame(gameId);

    const traits = repo.findByGame(gameId);
    expect(traits).toHaveLength(0);
  });

  it('should delete all traits for an entity', () => {
    repo.addTrait({ gameId, entityType: 'player', entityId: 'player-1', trait: 'honorable', turn: 1 });
    repo.addTrait({ gameId, entityType: 'player', entityId: 'player-1', trait: 'merciful', turn: 2 });
    repo.addTrait({ gameId, entityType: 'npc', entityId: 'npc-1', trait: 'ruthless', turn: 1 });

    repo.deleteByEntity(gameId, 'player', 'player-1');

    const playerTraits = repo.findByEntity(gameId, 'player', 'player-1');
    const npcTraits = repo.findByEntity(gameId, 'npc', 'npc-1');
    expect(playerTraits).toHaveLength(0);
    expect(npcTraits).toHaveLength(1);
  });

  it('should count traits for an entity', () => {
    repo.addTrait({ gameId, entityType: 'player', entityId: 'player-1', trait: 'honorable', turn: 1 });
    repo.addTrait({ gameId, entityType: 'player', entityId: 'player-1', trait: 'merciful', turn: 2 });

    const count = repo.countByEntity(gameId, 'player', 'player-1');

    expect(count).toBe(2);
  });

  it('should not count removed traits', () => {
    repo.addTrait({ gameId, entityType: 'player', entityId: 'player-1', trait: 'honorable', turn: 1 });
    repo.addTrait({ gameId, entityType: 'player', entityId: 'player-1', trait: 'merciful', turn: 2 });
    repo.removeTrait(gameId, 'player', 'player-1', 'honorable');

    const count = repo.countByEntity(gameId, 'player', 'player-1');

    expect(count).toBe(1);
  });

  it('should find all traits for a game', () => {
    repo.addTrait({ gameId, entityType: 'player', entityId: 'player-1', trait: 'honorable', turn: 1 });
    repo.addTrait({ gameId, entityType: 'npc', entityId: 'npc-1', trait: 'ruthless', turn: 1 });

    const traits = repo.findByGame(gameId);

    expect(traits).toHaveLength(2);
  });

  it('should not find removed traits when finding by game', () => {
    repo.addTrait({ gameId, entityType: 'player', entityId: 'player-1', trait: 'honorable', turn: 1 });
    repo.addTrait({ gameId, entityType: 'npc', entityId: 'npc-1', trait: 'ruthless', turn: 1 });
    repo.removeTrait(gameId, 'player', 'player-1', 'honorable');

    const traits = repo.findByGame(gameId);

    expect(traits).toHaveLength(1);
    expect(traits[0].trait).toBe('ruthless');
  });

  it('should throw on duplicate trait for same entity', () => {
    repo.addTrait({ gameId, entityType: 'player', entityId: 'player-1', trait: 'honorable', turn: 1 });

    expect(() => {
      repo.addTrait({ gameId, entityType: 'player', entityId: 'player-1', trait: 'honorable', turn: 2 });
    }).toThrow();
  });

  it('should order traits by acquired turn', () => {
    repo.addTrait({ gameId, entityType: 'player', entityId: 'player-1', trait: 'ruthless', turn: 3 });
    repo.addTrait({ gameId, entityType: 'player', entityId: 'player-1', trait: 'honorable', turn: 1 });
    repo.addTrait({ gameId, entityType: 'player', entityId: 'player-1', trait: 'merciful', turn: 2 });

    const traits = repo.findByEntity(gameId, 'player', 'player-1');

    expect(traits[0].trait).toBe('honorable');
    expect(traits[1].trait).toBe('merciful');
    expect(traits[2].trait).toBe('ruthless');
  });
});

describe('PendingEvolutionRepository', () => {
  let db: Database.Database;
  let repo: PendingEvolutionRepository;
  let gameId: string;

  beforeEach(() => {
    db = createTestDatabase();
    repo = new PendingEvolutionRepository(db);

    db.prepare(`
      INSERT INTO games (id, player_id, current_area_id, turn)
      VALUES ('game-1', 'player-1', 'area-1', 0)
    `).run();
    gameId = 'game-1';
  });

  afterEach(() => {
    db.close();
  });

  describe('create', () => {
    it('should create a trait_add pending evolution', () => {
      const pending = repo.create({
        gameId,
        turn: 1,
        evolutionType: 'trait_add',
        entityType: 'player',
        entityId: 'player-1',
        trait: 'honorable',
        reason: 'Showed mercy to the enemy',
      });

      expect(pending.id).toBeDefined();
      expect(pending.gameId).toBe(gameId);
      expect(pending.turn).toBe(1);
      expect(pending.evolutionType).toBe('trait_add');
      expect(pending.entityType).toBe('player');
      expect(pending.entityId).toBe('player-1');
      expect(pending.trait).toBe('honorable');
      expect(pending.reason).toBe('Showed mercy to the enemy');
      expect(pending.status).toBe('pending');
      expect(pending.createdAt).toBeDefined();
    });

    it('should create a relationship_change pending evolution', () => {
      const pending = repo.create({
        gameId,
        turn: 1,
        evolutionType: 'relationship_change',
        entityType: 'npc',
        entityId: 'npc-1',
        targetType: 'player',
        targetId: 'player-1',
        dimension: 'respect',
        oldValue: 0.5,
        newValue: 0.7,
        reason: 'Witnessed player honorable combat',
      });

      expect(pending.evolutionType).toBe('relationship_change');
      expect(pending.targetType).toBe('player');
      expect(pending.targetId).toBe('player-1');
      expect(pending.dimension).toBe('respect');
      expect(pending.oldValue).toBe(0.5);
      expect(pending.newValue).toBe(0.7);
    });
  });

  describe('findById', () => {
    it('should find a pending evolution by ID', () => {
      const created = repo.create({
        gameId,
        turn: 1,
        evolutionType: 'trait_add',
        entityType: 'player',
        entityId: 'player-1',
        trait: 'honorable',
        reason: 'Test reason',
      });

      const found = repo.findById(created.id);

      expect(found).not.toBeNull();
      expect(found?.id).toBe(created.id);
      expect(found?.trait).toBe('honorable');
    });

    it('should return null for non-existent ID', () => {
      const found = repo.findById('non-existent');
      expect(found).toBeNull();
    });
  });

  describe('findByGame', () => {
    it('should find all pending evolutions for a game', () => {
      repo.create({
        gameId,
        turn: 1,
        evolutionType: 'trait_add',
        entityType: 'player',
        entityId: 'player-1',
        trait: 'honorable',
        reason: 'Test 1',
      });
      repo.create({
        gameId,
        turn: 2,
        evolutionType: 'trait_remove',
        entityType: 'player',
        entityId: 'player-1',
        trait: 'naive',
        reason: 'Test 2',
      });

      const all = repo.findByGame(gameId);
      expect(all).toHaveLength(2);
    });

    it('should filter by status', () => {
      const pending1 = repo.create({
        gameId,
        turn: 1,
        evolutionType: 'trait_add',
        entityType: 'player',
        entityId: 'player-1',
        trait: 'honorable',
        reason: 'Test 1',
      });
      repo.create({
        gameId,
        turn: 2,
        evolutionType: 'trait_add',
        entityType: 'player',
        entityId: 'player-1',
        trait: 'merciful',
        reason: 'Test 2',
      });
      repo.resolve(pending1.id, { status: 'approved' });

      const pending = repo.findPending(gameId, 'pending');
      expect(pending).toHaveLength(1);
      expect(pending[0].trait).toBe('merciful');
    });
  });

  describe('findByEntity', () => {
    it('should find evolutions for a specific entity', () => {
      repo.create({
        gameId,
        turn: 1,
        evolutionType: 'trait_add',
        entityType: 'player',
        entityId: 'player-1',
        trait: 'honorable',
        reason: 'Test 1',
      });
      repo.create({
        gameId,
        turn: 1,
        evolutionType: 'trait_add',
        entityType: 'npc',
        entityId: 'npc-1',
        trait: 'ruthless',
        reason: 'Test 2',
      });

      const playerEvols = repo.findByEntity(gameId, 'player', 'player-1');
      expect(playerEvols).toHaveLength(1);
      expect(playerEvols[0].trait).toBe('honorable');
    });
  });

  describe('findByGame ordering', () => {
    it('should return evolutions ordered by turn', () => {
      repo.create({
        gameId,
        turn: 2,
        evolutionType: 'trait_add',
        entityType: 'player',
        entityId: 'player-1',
        trait: 'merciful',
        reason: 'Turn 2',
      });
      repo.create({
        gameId,
        turn: 1,
        evolutionType: 'trait_add',
        entityType: 'player',
        entityId: 'player-1',
        trait: 'honorable',
        reason: 'Turn 1',
      });

      const all = repo.findByGame(gameId);
      expect(all).toHaveLength(2);
      // Should be ordered by turn ascending
      expect(all[0].turn).toBe(1);
      expect(all[0].trait).toBe('honorable');
      expect(all[1].turn).toBe(2);
      expect(all[1].trait).toBe('merciful');
    });
  });

  describe('update', () => {
    it('should update pending evolution fields', () => {
      const created = repo.create({
        gameId,
        turn: 1,
        evolutionType: 'trait_add',
        entityType: 'player',
        entityId: 'player-1',
        trait: 'honorable',
        reason: 'Original reason',
      });

      const updated = repo.update(created.id, {
        trait: 'merciful',
        reason: 'Updated reason',
      });

      expect(updated?.trait).toBe('merciful');
      expect(updated?.reason).toBe('Updated reason');
    });

    it('should return null for non-existent ID', () => {
      const result = repo.update('non-existent', { trait: 'test' });
      expect(result).toBeNull();
    });
  });

  describe('resolve', () => {
    it('should resolve as approved', () => {
      const created = repo.create({
        gameId,
        turn: 1,
        evolutionType: 'trait_add',
        entityType: 'player',
        entityId: 'player-1',
        trait: 'honorable',
        reason: 'Test',
      });

      repo.resolve(created.id, { status: 'approved', dmNotes: 'Good suggestion' });

      const found = repo.findById(created.id);
      expect(found?.status).toBe('approved');
      expect(found?.dmNotes).toBe('Good suggestion');
      expect(found?.resolvedAt).toBeDefined();
    });

    it('should resolve as refused', () => {
      const created = repo.create({
        gameId,
        turn: 1,
        evolutionType: 'trait_add',
        entityType: 'player',
        entityId: 'player-1',
        trait: 'honorable',
        reason: 'Test',
      });

      repo.resolve(created.id, { status: 'refused', dmNotes: 'Does not fit character' });

      const found = repo.findById(created.id);
      expect(found?.status).toBe('refused');
      expect(found?.dmNotes).toBe('Does not fit character');
    });
  });

  describe('findPending with status filter', () => {
    it('should filter evolutions by status', () => {
      const p1 = repo.create({
        gameId,
        turn: 1,
        evolutionType: 'trait_add',
        entityType: 'player',
        entityId: 'player-1',
        trait: 'honorable',
        reason: 'Test 1',
      });
      repo.create({
        gameId,
        turn: 2,
        evolutionType: 'trait_add',
        entityType: 'player',
        entityId: 'player-1',
        trait: 'merciful',
        reason: 'Test 2',
      });
      repo.resolve(p1.id, { status: 'approved' });

      const pending = repo.findPending(gameId, 'pending');
      const approved = repo.findPending(gameId, 'approved');
      const refused = repo.findPending(gameId, 'refused');

      expect(pending).toHaveLength(1);
      expect(pending[0].trait).toBe('merciful');
      expect(approved).toHaveLength(1);
      expect(approved[0].trait).toBe('honorable');
      expect(refused).toHaveLength(0);
    });
  });

  describe('delete', () => {
    it('should delete a pending evolution', () => {
      const created = repo.create({
        gameId,
        turn: 1,
        evolutionType: 'trait_add',
        entityType: 'player',
        entityId: 'player-1',
        trait: 'honorable',
        reason: 'Test',
      });

      repo.delete(created.id);

      const found = repo.findById(created.id);
      expect(found).toBeNull();
    });
  });

  describe('deleteByGame', () => {
    it('should delete all evolutions for a game', () => {
      repo.create({
        gameId,
        turn: 1,
        evolutionType: 'trait_add',
        entityType: 'player',
        entityId: 'player-1',
        trait: 'honorable',
        reason: 'Test 1',
      });
      repo.create({
        gameId,
        turn: 2,
        evolutionType: 'trait_add',
        entityType: 'player',
        entityId: 'player-1',
        trait: 'merciful',
        reason: 'Test 2',
      });

      repo.deleteByGame(gameId);

      const all = repo.findByGame(gameId);
      expect(all).toHaveLength(0);
    });
  });
});

describe('EvolutionService', () => {
  let db: Database.Database;
  let traitRepo: TraitRepository;
  let relationshipRepo: RelationshipRepository;
  let pendingRepo: PendingEvolutionRepository;
  let service: EvolutionService;
  let gameId: string;
  let emittedEvents: EvolutionEvent[];

  function createEvent(id: string, turn: number): { id: string; turn: number; gameId: string } {
    db.prepare(`
      INSERT INTO events (id, game_id, turn, event_type, content, location_id)
      VALUES (?, ?, ?, 'narration', 'Test event', 'area-1')
    `).run(id, gameId, turn);
    return { id, turn, gameId };
  }

  beforeEach(() => {
    db = createTestDatabase();
    traitRepo = new TraitRepository(db);
    relationshipRepo = new RelationshipRepository(db);
    pendingRepo = new PendingEvolutionRepository(db);
    emittedEvents = [];

    service = new EvolutionService({
      traitRepo,
      relationshipRepo,
      pendingRepo,
      eventEmitter: {
        emit: (event) => emittedEvents.push(event),
      },
    });

    db.prepare(`
      INSERT INTO games (id, player_id, current_area_id, turn)
      VALUES ('game-1', 'player-1', 'area-1', 0)
    `).run();
    gameId = 'game-1';
  });

  afterEach(() => {
    db.close();
  });

  describe('detectEvolutions', () => {
    it('should create pending evolutions from AI suggestions', () => {
      const pending = service.detectEvolutions(
        gameId,
        createEvent('event-1', 1),
        [
          {
            evolutionType: 'trait_add',
            entityType: 'player',
            entityId: 'player-1',
            trait: 'merciful',
            reason: 'Spared the wounded enemy',
          },
        ]
      );

      expect(pending).toHaveLength(1);
      expect(pending[0].trait).toBe('merciful');
      expect(pending[0].status).toBe('pending');
      expect(emittedEvents).toHaveLength(1);
      expect(emittedEvents[0].type).toBe('evolution:created');
    });

    it('should resolve relationship change deltas to absolute values', () => {
      // Create existing relationship
      relationshipRepo.upsert({
        gameId,
        from: { type: 'npc', id: 'guard' },
        to: { type: 'player', id: 'player-1' },
        updatedTurn: 0,
        respect: 0.5,
      });

      const pending = service.detectEvolutions(
        gameId,
        createEvent('event-1', 1),
        [
          {
            evolutionType: 'relationship_change',
            entityType: 'npc',
            entityId: 'guard',
            targetType: 'player',
            targetId: 'player-1',
            dimension: 'respect',
            change: 0.2,
            reason: 'Witnessed honorable combat',
          },
        ]
      );

      expect(pending).toHaveLength(1);
      expect(pending[0].oldValue).toBe(0.5);
      expect(pending[0].newValue).toBe(0.7);
    });

    it('should clamp relationship values to valid range', () => {
      relationshipRepo.upsert({
        gameId,
        from: { type: 'npc', id: 'guard' },
        to: { type: 'player', id: 'player-1' },
        updatedTurn: 0,
        fear: 0.9,
      });

      const pending = service.detectEvolutions(
        gameId,
        createEvent('event-1', 1),
        [
          {
            evolutionType: 'relationship_change',
            entityType: 'npc',
            entityId: 'guard',
            targetType: 'player',
            targetId: 'player-1',
            dimension: 'fear',
            change: 0.3, // Would go to 1.2, should clamp to 1.0
            reason: 'Terrifying display of power',
          },
        ]
      );

      expect(pending[0].newValue).toBe(1.0);
    });
  });

  describe('approve', () => {
    it('should apply trait_add evolution when approved', () => {
      const pending = service.detectEvolutions(
        gameId,
        createEvent('event-1', 1),
        [
          {
            evolutionType: 'trait_add',
            entityType: 'player',
            entityId: 'player-1',
            trait: 'merciful',
            reason: 'Test',
          },
        ]
      );

      service.approve(pending[0].id, 'Good call');

      // Check trait was added
      const traits = traitRepo.findByEntity(gameId, 'player', 'player-1');
      expect(traits).toHaveLength(1);
      expect(traits[0].trait).toBe('merciful');

      // Check status updated
      const resolved = pendingRepo.findById(pending[0].id);
      expect(resolved?.status).toBe('approved');
      expect(resolved?.dmNotes).toBe('Good call');

      // Check event emitted
      expect(emittedEvents.filter(e => e.type === 'evolution:approved')).toHaveLength(1);
    });

    it('should apply trait_remove evolution when approved', () => {
      // First add a trait
      traitRepo.addTrait({
        gameId,
        entityType: 'player',
        entityId: 'player-1',
        trait: 'naive',
        turn: 0,
      });

      const pending = service.detectEvolutions(
        gameId,
        createEvent('event-1', 1),
        [
          {
            evolutionType: 'trait_remove',
            entityType: 'player',
            entityId: 'player-1',
            trait: 'naive',
            reason: 'Gained experience',
          },
        ]
      );

      service.approve(pending[0].id);

      const traits = traitRepo.findByEntity(gameId, 'player', 'player-1');
      expect(traits).toHaveLength(0);
    });

    it('should apply relationship_change evolution when approved', () => {
      const pending = service.detectEvolutions(
        gameId,
        createEvent('event-1', 1),
        [
          {
            evolutionType: 'relationship_change',
            entityType: 'npc',
            entityId: 'guard',
            targetType: 'player',
            targetId: 'player-1',
            dimension: 'respect',
            change: 0.2,
            reason: 'Honorable combat',
          },
        ]
      );

      service.approve(pending[0].id);

      const rel = relationshipRepo.findBetween(
        gameId,
        { type: 'npc', id: 'guard' },
        { type: 'player', id: 'player-1' }
      );
      expect(rel).not.toBeNull();
      expect(rel?.respect).toBe(0.7); // Default 0.5 + 0.2
    });

    it('should throw if evolution not found', () => {
      expect(() => service.approve('non-existent')).toThrow('Pending evolution not found');
    });

    it('should throw if evolution already resolved', () => {
      const pending = service.detectEvolutions(
        gameId,
        createEvent('event-1', 1),
        [
          {
            evolutionType: 'trait_add',
            entityType: 'player',
            entityId: 'player-1',
            trait: 'merciful',
            reason: 'Test',
          },
        ]
      );

      service.approve(pending[0].id);

      expect(() => service.approve(pending[0].id)).toThrow('Cannot approve evolution with status');
    });
  });

  describe('edit', () => {
    it('should update and then apply evolution', () => {
      const pending = service.detectEvolutions(
        gameId,
        createEvent('event-1', 1),
        [
          {
            evolutionType: 'trait_add',
            entityType: 'player',
            entityId: 'player-1',
            trait: 'merciful',
            reason: 'Original reason',
          },
        ]
      );

      service.edit(pending[0].id, { trait: 'honorable', reason: 'Better fit' }, 'Modified');

      const traits = traitRepo.findByEntity(gameId, 'player', 'player-1');
      expect(traits).toHaveLength(1);
      expect(traits[0].trait).toBe('honorable');

      const resolved = pendingRepo.findById(pending[0].id);
      expect(resolved?.status).toBe('edited');
      expect(resolved?.dmNotes).toBe('Modified');

      expect(emittedEvents.filter(e => e.type === 'evolution:edited')).toHaveLength(1);
    });
  });

  describe('refuse', () => {
    it('should mark evolution as refused without applying', () => {
      const pending = service.detectEvolutions(
        gameId,
        createEvent('event-1', 1),
        [
          {
            evolutionType: 'trait_add',
            entityType: 'player',
            entityId: 'player-1',
            trait: 'merciful',
            reason: 'Test',
          },
        ]
      );

      service.refuse(pending[0].id, 'Does not fit character');

      // No trait should be added
      const traits = traitRepo.findByEntity(gameId, 'player', 'player-1');
      expect(traits).toHaveLength(0);

      const resolved = pendingRepo.findById(pending[0].id);
      expect(resolved?.status).toBe('refused');
      expect(resolved?.dmNotes).toBe('Does not fit character');

      expect(emittedEvents.filter(e => e.type === 'evolution:refused')).toHaveLength(1);
    });
  });

  describe('getEntitySummary', () => {
    it('should return traits and relationships for entity', () => {
      // Add traits
      traitRepo.addTrait({ gameId, entityType: 'player', entityId: 'player-1', trait: 'honorable', turn: 1 });
      traitRepo.addTrait({ gameId, entityType: 'player', entityId: 'player-1', trait: 'merciful', turn: 2 });

      // Add relationship
      relationshipRepo.upsert({
        gameId,
        from: { type: 'player', id: 'player-1' },
        to: { type: 'npc', id: 'guard' },
        updatedTurn: 1,
        trust: 0.8,
        respect: 0.7,
        affection: 0.6,
      });

      const summary = service.getEntitySummary(gameId, 'player', 'player-1');

      expect(summary.traits).toContain('honorable');
      expect(summary.traits).toContain('merciful');
      expect(summary.relationships).toHaveLength(1);
      expect(summary.relationships[0].targetType).toBe('npc');
      expect(summary.relationships[0].targetId).toBe('guard');
      expect(summary.relationships[0].label).toBe('ally'); // High trust + respect
    });
  });

  describe('computeAggregateLabel', () => {
    it('should return devoted for high trust + affection + respect', () => {
      const label = service.computeAggregateLabel({
        trust: 0.8,
        respect: 0.7,
        affection: 0.8,
        fear: 0.0,
        resentment: 0.0,
        debt: 0.0,
      });
      expect(label).toBe('devoted');
    });

    it('should return terrified for high fear + resentment', () => {
      const label = service.computeAggregateLabel({
        trust: 0.2,
        respect: 0.3,
        affection: 0.1,
        fear: 0.8,
        resentment: 0.6,
        debt: 0.0,
      });
      expect(label).toBe('terrified');
    });

    it('should return rival for high respect + resentment', () => {
      const label = service.computeAggregateLabel({
        trust: 0.4,
        respect: 0.7,
        affection: 0.3,
        fear: 0.2,
        resentment: 0.6,
        debt: 0.0,
      });
      expect(label).toBe('rival');
    });

    it('should return ally for high trust + respect', () => {
      const label = service.computeAggregateLabel({
        trust: 0.7,
        respect: 0.7,
        affection: 0.4,
        fear: 0.0,
        resentment: 0.0,
        debt: 0.0,
      });
      expect(label).toBe('ally');
    });

    it('should return friend for high affection + trust', () => {
      const label = service.computeAggregateLabel({
        trust: 0.6,
        respect: 0.4,
        affection: 0.7,
        fear: 0.0,
        resentment: 0.0,
        debt: 0.0,
      });
      expect(label).toBe('friend');
    });

    it('should return indebted for high debt', () => {
      const label = service.computeAggregateLabel({
        trust: 0.5,
        respect: 0.5,
        affection: 0.5,
        fear: 0.0,
        resentment: 0.0,
        debt: 0.7,
      });
      expect(label).toBe('indebted');
    });

    it('should return wary for low trust', () => {
      const label = service.computeAggregateLabel({
        trust: 0.2,
        respect: 0.5,
        affection: 0.3,
        fear: 0.2,
        resentment: 0.2,
        debt: 0.0,
      });
      expect(label).toBe('wary');
    });

    it('should return indifferent for neutral values', () => {
      const label = service.computeAggregateLabel({
        trust: 0.5,
        respect: 0.5,
        affection: 0.5,
        fear: 0.0,
        resentment: 0.0,
        debt: 0.0,
      });
      expect(label).toBe('indifferent');
    });
  });

  describe('getPendingEvolutions', () => {
    it('should return only pending evolutions by default', () => {
      const p1 = service.detectEvolutions(
        gameId,
        createEvent('event-1', 1),
        [
          { evolutionType: 'trait_add', entityType: 'player', entityId: 'player-1', trait: 'honorable', reason: 'Test 1' },
        ]
      );
      service.detectEvolutions(
        gameId,
        createEvent('event-2', 2),
        [
          { evolutionType: 'trait_add', entityType: 'player', entityId: 'player-1', trait: 'merciful', reason: 'Test 2' },
        ]
      );
      service.approve(p1[0].id);

      const pending = service.getPendingEvolutions(gameId);
      expect(pending).toHaveLength(1);
      expect(pending[0].trait).toBe('merciful');
    });

    it('should return all evolutions when pendingOnly is false', () => {
      const p1 = service.detectEvolutions(
        gameId,
        createEvent('event-1', 1),
        [
          { evolutionType: 'trait_add', entityType: 'player', entityId: 'player-1', trait: 'honorable', reason: 'Test 1' },
        ]
      );
      service.detectEvolutions(
        gameId,
        createEvent('event-2', 2),
        [
          { evolutionType: 'trait_add', entityType: 'player', entityId: 'player-1', trait: 'merciful', reason: 'Test 2' },
        ]
      );
      service.approve(p1[0].id);

      const all = service.getPendingEvolutions(gameId, false);
      expect(all).toHaveLength(2);
    });
  });
});
