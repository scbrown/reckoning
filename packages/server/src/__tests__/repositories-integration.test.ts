import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Database from 'better-sqlite3';
import { readFileSync, mkdirSync, rmSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

import {
  GameRepository,
  EventRepository,
  AreaRepository,
  PartyRepository,
  SaveRepository,
  EditorStateRepository,
} from '../db/repositories/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const TEST_DB_PATH = join(__dirname, '../../test-data/integration-test.db');

describe('Repository Integration Tests', () => {
  let db: Database.Database;
  let gameRepo: GameRepository;
  let eventRepo: EventRepository;
  let areaRepo: AreaRepository;
  let partyRepo: PartyRepository;
  let saveRepo: SaveRepository;
  let editorStateRepo: EditorStateRepository;

  beforeAll(() => {
    // Ensure test data directory exists
    const testDir = dirname(TEST_DB_PATH);
    if (!existsSync(testDir)) {
      mkdirSync(testDir, { recursive: true });
    }

    // Remove old test database if exists
    if (existsSync(TEST_DB_PATH)) {
      rmSync(TEST_DB_PATH);
    }

    // Create database and run schema
    db = new Database(TEST_DB_PATH);
    db.pragma('journal_mode = WAL');

    const schemaPath = join(__dirname, '../db/schema.sql');
    const schema = readFileSync(schemaPath, 'utf-8');
    db.exec(schema);

    // Seed test area
    db.prepare(`
      INSERT INTO areas (id, name, description, tags)
      VALUES ('tavern', 'The Tavern', 'A cozy tavern with a warm fire', '["indoor", "social"]')
    `).run();

    db.prepare(`
      INSERT INTO area_exits (area_id, direction, target_area_id, description, locked)
      VALUES ('tavern', 'outside', 'street', 'The door leads outside', 0)
    `).run();

    db.prepare(`
      INSERT INTO area_objects (id, area_id, name, description, interactable, tags)
      VALUES ('hearth', 'tavern', 'Fireplace', 'A warm fireplace', 1, '["fire", "warmth"]')
    `).run();

    db.prepare(`
      INSERT INTO npcs (id, name, description, current_area_id, disposition, tags)
      VALUES ('barkeep', 'Barkeep', 'A friendly barkeeper', 'tavern', 'friendly', '["merchant"]')
    `).run();

    // Initialize repositories
    gameRepo = new GameRepository(db);
    eventRepo = new EventRepository(db);
    areaRepo = new AreaRepository(db);
    partyRepo = new PartyRepository(db);
    saveRepo = new SaveRepository(db);
    editorStateRepo = new EditorStateRepository(db);
  });

  afterAll(() => {
    db.close();
    // Clean up test database
    if (existsSync(TEST_DB_PATH)) {
      rmSync(TEST_DB_PATH);
    }
    const walPath = TEST_DB_PATH + '-wal';
    const shmPath = TEST_DB_PATH + '-shm';
    if (existsSync(walPath)) rmSync(walPath);
    if (existsSync(shmPath)) rmSync(shmPath);
  });

  it('should create a complete game session with related data', async () => {
    // 1. Create a game
    const game = gameRepo.create('player-1', 'tavern');
    expect(game.id).toBeDefined();
    expect(game.currentAreaId).toBe('tavern');

    // 2. Create a player record
    db.prepare(`
      INSERT INTO players (id, game_id, name, description)
      VALUES ('player-1', ?, 'Hero', 'A brave adventurer')
    `).run(game.id);

    // 3. Create party members
    const party = partyRepo.create(game.id, [
      { name: 'Warrior', description: 'Strong fighter', class: 'Fighter', stats: { health: 100, maxHealth: 100 } },
      { name: 'Mage', description: 'Wise spellcaster', class: 'Wizard', stats: { health: 60, maxHealth: 60 } },
    ]);
    expect(party).toHaveLength(2);

    // 4. Create some events
    const event1 = eventRepo.create({
      gameId: game.id,
      turn: 0,
      eventType: 'narration',
      content: 'You enter the tavern.',
      locationId: 'tavern',
      witnesses: ['player-1'],
    });

    const event2 = eventRepo.create({
      gameId: game.id,
      turn: 0,
      eventType: 'npc_dialogue',
      content: 'Welcome, traveler!',
      speaker: 'barkeep',
      locationId: 'tavern',
      witnesses: ['player-1', 'barkeep'],
    });

    // 5. Increment turn and add more events
    gameRepo.incrementTurn(game.id);

    eventRepo.create({
      gameId: game.id,
      turn: 1,
      eventType: 'party_action',
      content: 'You order a drink.',
      locationId: 'tavern',
      witnesses: ['player-1'],
    });

    // 6. Verify game session can be retrieved
    const session = gameRepo.getSession(game.id);
    expect(session).not.toBeNull();
    expect(session?.state.turn).toBe(1);
    expect(session?.currentArea.name).toBe('The Tavern');
    expect(session?.currentArea.npcs).toHaveLength(1);
    expect(session?.currentArea.objects).toHaveLength(1);
    expect(session?.recentEvents.length).toBeGreaterThan(0);

    // 7. Test saving the game
    const snapshot = {
      gameState: session?.state,
      party,
      events: eventRepo.findByGame(game.id),
    };

    const save = saveRepo.save(game.id, 'Quick Save', snapshot);
    expect(save.turn).toBe(1);

    // 8. Verify save can be loaded
    const loaded = saveRepo.load(save.id);
    expect(loaded).not.toBeNull();
    expect(loaded?.snapshot).toEqual(snapshot);

    // 9. Test editor state
    editorStateRepo.set(game.id, {
      pending: 'Generated content awaiting review',
      editedContent: null,
      status: 'editing',
    });

    const editorState = editorStateRepo.get(game.id);
    expect(editorState?.pending).toBe('Generated content awaiting review');
    expect(editorState?.status).toBe('editing');

    // 10. Verify event counts
    expect(eventRepo.countByGame(game.id)).toBe(3);
    expect(eventRepo.countByTurn(game.id, 0)).toBe(2);
    expect(eventRepo.countByTurn(game.id, 1)).toBe(1);
  });

  it('should handle area navigation with NPCs', () => {
    // Get area with all details
    const tavern = areaRepo.getWithDetails('tavern');
    expect(tavern).not.toBeNull();
    expect(tavern?.exits).toHaveLength(1);
    expect(tavern?.exits[0].direction).toBe('outside');
    expect(tavern?.npcs).toHaveLength(1);
    expect(tavern?.npcs[0].name).toBe('Barkeep');

    // Add a second area
    db.prepare(`
      INSERT INTO areas (id, name, description, tags)
      VALUES ('street', 'Village Street', 'A muddy street', '["outdoor"]')
    `).run();

    // Move NPC
    areaRepo.moveNPC('barkeep', 'street');

    // Verify NPC moved
    const tavernNPCs = areaRepo.getNPCsInArea('tavern');
    const streetNPCs = areaRepo.getNPCsInArea('street');

    expect(tavernNPCs).toHaveLength(0);
    expect(streetNPCs).toHaveLength(1);

    // Move back for cleanup
    areaRepo.moveNPC('barkeep', 'tavern');
  });

  it('should handle playback mode changes', () => {
    const game = gameRepo.create('player-2', 'tavern');

    // Default should be 'auto'
    const initialMode = gameRepo.getPlaybackMode(game.id);
    expect(initialMode).toBe('auto');

    // Change to paused
    gameRepo.setPlaybackMode(game.id, 'paused');
    expect(gameRepo.getPlaybackMode(game.id)).toBe('paused');

    // Change to stepping
    gameRepo.setPlaybackMode(game.id, 'stepping');
    expect(gameRepo.getPlaybackMode(game.id)).toBe('stepping');

    // Clean up
    gameRepo.delete(game.id);
  });

  it('should paginate events correctly', () => {
    const game = gameRepo.create('player-3', 'tavern');

    // Create 25 events
    for (let i = 0; i < 25; i++) {
      eventRepo.create({
        gameId: game.id,
        turn: Math.floor(i / 5),
        eventType: 'narration',
        content: `Event ${i}`,
        locationId: 'tavern',
        witnesses: [],
      });
    }

    // Get first page
    const page1 = eventRepo.findByGame(game.id, { limit: 10, offset: 0 });
    expect(page1).toHaveLength(10);
    expect(page1[0].content).toBe('Event 0');

    // Get second page
    const page2 = eventRepo.findByGame(game.id, { limit: 10, offset: 10 });
    expect(page2).toHaveLength(10);
    expect(page2[0].content).toBe('Event 10');

    // Get third page (partial)
    const page3 = eventRepo.findByGame(game.id, { limit: 10, offset: 20 });
    expect(page3).toHaveLength(5);
    expect(page3[0].content).toBe('Event 20');

    // Note: Not cleaning up game here since events have foreign key to it.
    // The test database is cleaned up in afterAll.
  });
});
