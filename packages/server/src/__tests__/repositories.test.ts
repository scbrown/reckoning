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

  it('should create party members', () => {
    const members = repo.create(gameId, [
      { name: 'Warrior', description: 'A brave warrior', class: 'Fighter', stats: { health: 100, maxHealth: 100 } },
      { name: 'Mage', description: 'A wise mage', class: 'Wizard', stats: { health: 60, maxHealth: 60 } },
    ]);

    expect(members).toHaveLength(2);
    expect(members[0].id).toBeDefined();
    expect(members[0].name).toBe('Warrior');
    expect(members[1].name).toBe('Mage');
  });

  it('should find party members by game', () => {
    repo.create(gameId, [
      { name: 'Warrior', description: 'A brave warrior', class: 'Fighter', stats: { health: 100, maxHealth: 100 } },
    ]);

    const members = repo.findByGame(gameId);
    expect(members).toHaveLength(1);
    expect(members[0].name).toBe('Warrior');
  });

  it('should find party member by id', () => {
    const created = repo.create(gameId, [
      { name: 'Warrior', description: 'A brave warrior', class: 'Fighter', stats: { health: 100, maxHealth: 100 } },
    ]);

    const found = repo.findById(created[0].id);
    expect(found).not.toBeNull();
    expect(found?.name).toBe('Warrior');
  });

  it('should update party member', () => {
    const created = repo.create(gameId, [
      { name: 'Warrior', description: 'A brave warrior', class: 'Fighter', stats: { health: 100, maxHealth: 100 } },
    ]);

    repo.update({ id: created[0].id, name: 'Veteran Warrior', class: 'Champion' });

    const found = repo.findById(created[0].id);
    expect(found?.name).toBe('Veteran Warrior');
    expect(found?.class).toBe('Champion');
  });

  it('should delete party member', () => {
    const created = repo.create(gameId, [
      { name: 'Warrior', description: 'A brave warrior', class: 'Fighter', stats: { health: 100, maxHealth: 100 } },
    ]);

    repo.delete(created[0].id);

    const found = repo.findById(created[0].id);
    expect(found).toBeNull();
  });

  it('should delete all party members by game', () => {
    repo.create(gameId, [
      { name: 'Warrior', description: 'A brave warrior', class: 'Fighter', stats: { health: 100, maxHealth: 100 } },
      { name: 'Mage', description: 'A wise mage', class: 'Wizard', stats: { health: 60, maxHealth: 60 } },
    ]);

    repo.deleteByGame(gameId);

    const members = repo.findByGame(gameId);
    expect(members).toHaveLength(0);
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
