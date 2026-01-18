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
