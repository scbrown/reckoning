import { describe, it, expect, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('Database Schema', () => {
  let db: Database.Database;

  afterEach(() => {
    if (db) {
      db.close();
    }
  });

  it('should create schema on empty database', () => {
    db = new Database(':memory:');
    const schemaPath = join(__dirname, '../schema.sql');
    const schema = readFileSync(schemaPath, 'utf-8');

    // Should not throw
    expect(() => db.exec(schema)).not.toThrow();
  });

  it('should create parties table with correct columns', () => {
    db = new Database(':memory:');
    const schemaPath = join(__dirname, '../schema.sql');
    const schema = readFileSync(schemaPath, 'utf-8');
    db.exec(schema);

    const tableInfo = db.prepare("PRAGMA table_info('parties')").all();
    const columnNames = tableInfo.map((col: { name: string }) => col.name);

    expect(columnNames).toContain('id');
    expect(columnNames).toContain('game_id');
    expect(columnNames).toContain('name');
    expect(columnNames).toContain('created_at');
    expect(columnNames).toContain('updated_at');
  });

  it('should create characters table with correct columns', () => {
    db = new Database(':memory:');
    const schemaPath = join(__dirname, '../schema.sql');
    const schema = readFileSync(schemaPath, 'utf-8');
    db.exec(schema);

    const tableInfo = db.prepare("PRAGMA table_info('characters')").all();
    const columnNames = tableInfo.map((col: { name: string }) => col.name);

    expect(columnNames).toContain('id');
    expect(columnNames).toContain('party_id');
    expect(columnNames).toContain('name');
    expect(columnNames).toContain('description');
    expect(columnNames).toContain('class');
    expect(columnNames).toContain('role');
    expect(columnNames).toContain('stats');
    expect(columnNames).toContain('created_at');
    expect(columnNames).toContain('updated_at');
  });

  it('should enforce role CHECK constraint on characters table', () => {
    db = new Database(':memory:');
    const schemaPath = join(__dirname, '../schema.sql');
    const schema = readFileSync(schemaPath, 'utf-8');
    db.exec(schema);

    // Create a game and party first
    db.exec(`
      INSERT INTO games (id, player_id, current_area_id)
      VALUES ('game-1', 'player-1', 'area-1')
    `);
    db.exec(`
      INSERT INTO parties (id, game_id)
      VALUES ('party-1', 'game-1')
    `);

    // Valid roles should work
    expect(() => {
      db.exec(`
        INSERT INTO characters (id, party_id, name, role)
        VALUES ('char-1', 'party-1', 'Test', 'player')
      `);
    }).not.toThrow();

    expect(() => {
      db.exec(`
        INSERT INTO characters (id, party_id, name, role)
        VALUES ('char-2', 'party-1', 'Test', 'member')
      `);
    }).not.toThrow();

    expect(() => {
      db.exec(`
        INSERT INTO characters (id, party_id, name, role)
        VALUES ('char-3', 'party-1', 'Test', 'companion')
      `);
    }).not.toThrow();

    // Invalid role should fail
    expect(() => {
      db.exec(`
        INSERT INTO characters (id, party_id, name, role)
        VALUES ('char-4', 'party-1', 'Test', 'invalid_role')
      `);
    }).toThrow();
  });

  it('should create indexes for parties and characters tables', () => {
    db = new Database(':memory:');
    const schemaPath = join(__dirname, '../schema.sql');
    const schema = readFileSync(schemaPath, 'utf-8');
    db.exec(schema);

    const indexes = db.prepare(`
      SELECT name FROM sqlite_master
      WHERE type = 'index' AND name LIKE 'idx_%'
    `).all();
    const indexNames = indexes.map((idx: { name: string }) => idx.name);

    expect(indexNames).toContain('idx_parties_game');
    expect(indexNames).toContain('idx_characters_party');
    expect(indexNames).toContain('idx_characters_role');
  });

  it('should support idempotent schema creation', () => {
    db = new Database(':memory:');
    const schemaPath = join(__dirname, '../schema.sql');
    const schema = readFileSync(schemaPath, 'utf-8');

    // Apply schema twice - should not throw
    db.exec(schema);
    expect(() => db.exec(schema)).not.toThrow();
  });

  it('should create entity_traits table with correct columns', () => {
    db = new Database(':memory:');
    const schemaPath = join(__dirname, '../schema.sql');
    const schema = readFileSync(schemaPath, 'utf-8');
    db.exec(schema);

    const tableInfo = db.prepare("PRAGMA table_info('entity_traits')").all();
    const columnNames = tableInfo.map((col: { name: string }) => col.name);

    expect(columnNames).toContain('id');
    expect(columnNames).toContain('game_id');
    expect(columnNames).toContain('entity_type');
    expect(columnNames).toContain('entity_id');
    expect(columnNames).toContain('trait');
    expect(columnNames).toContain('acquired_turn');
    expect(columnNames).toContain('source_event_id');
    expect(columnNames).toContain('status');
    expect(columnNames).toContain('created_at');
  });

  it('should create indexes for entity_traits table', () => {
    db = new Database(':memory:');
    const schemaPath = join(__dirname, '../schema.sql');
    const schema = readFileSync(schemaPath, 'utf-8');
    db.exec(schema);

    const indexes = db.prepare(`
      SELECT name FROM sqlite_master
      WHERE type = 'index' AND name LIKE 'idx_entity_traits%'
    `).all();
    const indexNames = indexes.map((idx: { name: string }) => idx.name);

    expect(indexNames).toContain('idx_entity_traits_entity');
    expect(indexNames).toContain('idx_entity_traits_trait');
  });

  it('should enforce unique constraint on entity_traits', () => {
    db = new Database(':memory:');
    const schemaPath = join(__dirname, '../schema.sql');
    const schema = readFileSync(schemaPath, 'utf-8');
    db.exec(schema);

    // Create a game first
    db.exec(`
      INSERT INTO games (id, player_id, current_area_id)
      VALUES ('game-1', 'player-1', 'area-1')
    `);

    // First trait should work
    expect(() => {
      db.exec(`
        INSERT INTO entity_traits (id, game_id, entity_type, entity_id, trait, acquired_turn)
        VALUES ('trait-1', 'game-1', 'player', 'player-1', 'merciful', 1)
      `);
    }).not.toThrow();

    // Duplicate trait should fail
    expect(() => {
      db.exec(`
        INSERT INTO entity_traits (id, game_id, entity_type, entity_id, trait, acquired_turn)
        VALUES ('trait-2', 'game-1', 'player', 'player-1', 'merciful', 2)
      `);
    }).toThrow();
  });

  it('should create relationships table with correct columns', () => {
    db = new Database(':memory:');
    const schemaPath = join(__dirname, '../schema.sql');
    const schema = readFileSync(schemaPath, 'utf-8');
    db.exec(schema);

    const tableInfo = db.prepare("PRAGMA table_info('relationships')").all();
    const columnNames = tableInfo.map((col: { name: string }) => col.name);

    expect(columnNames).toContain('id');
    expect(columnNames).toContain('game_id');
    expect(columnNames).toContain('from_type');
    expect(columnNames).toContain('from_id');
    expect(columnNames).toContain('to_type');
    expect(columnNames).toContain('to_id');
    expect(columnNames).toContain('trust');
    expect(columnNames).toContain('respect');
    expect(columnNames).toContain('affection');
    expect(columnNames).toContain('fear');
    expect(columnNames).toContain('resentment');
    expect(columnNames).toContain('debt');
    expect(columnNames).toContain('updated_turn');
    expect(columnNames).toContain('created_at');
    expect(columnNames).toContain('updated_at');
  });

  it('should create indexes for relationships table', () => {
    db = new Database(':memory:');
    const schemaPath = join(__dirname, '../schema.sql');
    const schema = readFileSync(schemaPath, 'utf-8');
    db.exec(schema);

    const indexes = db.prepare(`
      SELECT name FROM sqlite_master
      WHERE type = 'index' AND name LIKE 'idx_relationships%'
    `).all();
    const indexNames = indexes.map((idx: { name: string }) => idx.name);

    expect(indexNames).toContain('idx_relationships_from');
    expect(indexNames).toContain('idx_relationships_to');
  });

  it('should enforce unique constraint on relationships', () => {
    db = new Database(':memory:');
    const schemaPath = join(__dirname, '../schema.sql');
    const schema = readFileSync(schemaPath, 'utf-8');
    db.exec(schema);

    // Create a game first
    db.exec(`
      INSERT INTO games (id, player_id, current_area_id)
      VALUES ('game-1', 'player-1', 'area-1')
    `);

    // First relationship should work
    expect(() => {
      db.exec(`
        INSERT INTO relationships (id, game_id, from_type, from_id, to_type, to_id, updated_turn)
        VALUES ('rel-1', 'game-1', 'player', 'player-1', 'npc', 'npc-1', 1)
      `);
    }).not.toThrow();

    // Duplicate relationship should fail
    expect(() => {
      db.exec(`
        INSERT INTO relationships (id, game_id, from_type, from_id, to_type, to_id, updated_turn)
        VALUES ('rel-2', 'game-1', 'player', 'player-1', 'npc', 'npc-1', 2)
      `);
    }).toThrow();
  });

  it('should enforce CHECK constraints on relationship dimensions', () => {
    db = new Database(':memory:');
    const schemaPath = join(__dirname, '../schema.sql');
    const schema = readFileSync(schemaPath, 'utf-8');
    db.exec(schema);

    // Create a game first
    db.exec(`
      INSERT INTO games (id, player_id, current_area_id)
      VALUES ('game-1', 'player-1', 'area-1')
    `);

    // Valid dimension values should work (0.0 to 1.0)
    expect(() => {
      db.exec(`
        INSERT INTO relationships (id, game_id, from_type, from_id, to_type, to_id, trust, respect, affection, fear, resentment, debt, updated_turn)
        VALUES ('rel-1', 'game-1', 'player', 'player-1', 'npc', 'npc-1', 0.0, 0.5, 1.0, 0.0, 0.5, 1.0, 1)
      `);
    }).not.toThrow();

    // Value > 1.0 should fail
    expect(() => {
      db.exec(`
        INSERT INTO relationships (id, game_id, from_type, from_id, to_type, to_id, trust, updated_turn)
        VALUES ('rel-2', 'game-1', 'player', 'player-1', 'npc', 'npc-2', 1.5, 1)
      `);
    }).toThrow();

    // Value < 0.0 should fail
    expect(() => {
      db.exec(`
        INSERT INTO relationships (id, game_id, from_type, from_id, to_type, to_id, fear, updated_turn)
        VALUES ('rel-3', 'game-1', 'player', 'player-1', 'npc', 'npc-3', -0.5, 1)
      `);
    }).toThrow();
  });

  it('should set correct default values for relationship dimensions', () => {
    db = new Database(':memory:');
    const schemaPath = join(__dirname, '../schema.sql');
    const schema = readFileSync(schemaPath, 'utf-8');
    db.exec(schema);

    // Create a game first
    db.exec(`
      INSERT INTO games (id, player_id, current_area_id)
      VALUES ('game-1', 'player-1', 'area-1')
    `);

    // Insert with only required fields
    db.exec(`
      INSERT INTO relationships (id, game_id, from_type, from_id, to_type, to_id, updated_turn)
      VALUES ('rel-1', 'game-1', 'player', 'player-1', 'npc', 'npc-1', 1)
    `);

    const rel = db.prepare(`SELECT * FROM relationships WHERE id = 'rel-1'`).get() as {
      trust: number;
      respect: number;
      affection: number;
      fear: number;
      resentment: number;
      debt: number;
    };

    // Neutral dimensions default to 0.5
    expect(rel.trust).toBe(0.5);
    expect(rel.respect).toBe(0.5);
    expect(rel.affection).toBe(0.5);

    // Negative dimensions default to 0.0
    expect(rel.fear).toBe(0.0);
    expect(rel.resentment).toBe(0.0);
    expect(rel.debt).toBe(0.0);
  });

  it('should create trait_catalog table with correct columns', () => {
    db = new Database(':memory:');
    const schemaPath = join(__dirname, '../schema.sql');
    const schema = readFileSync(schemaPath, 'utf-8');
    db.exec(schema);

    const tableInfo = db.prepare("PRAGMA table_info('trait_catalog')").all();
    const columnNames = tableInfo.map((col: { name: string }) => col.name);

    expect(columnNames).toContain('trait');
    expect(columnNames).toContain('category');
    expect(columnNames).toContain('description');
    expect(columnNames).toContain('created_at');
  });

  it('should create index for trait_catalog category', () => {
    db = new Database(':memory:');
    const schemaPath = join(__dirname, '../schema.sql');
    const schema = readFileSync(schemaPath, 'utf-8');
    db.exec(schema);

    const indexes = db.prepare(`
      SELECT name FROM sqlite_master
      WHERE type = 'index' AND name LIKE 'idx_trait_catalog%'
    `).all();
    const indexNames = indexes.map((idx: { name: string }) => idx.name);

    expect(indexNames).toContain('idx_trait_catalog_category');
  });

  it('should seed trait_catalog with 24 traits across 4 categories', () => {
    db = new Database(':memory:');
    const schemaPath = join(__dirname, '../schema.sql');
    const schema = readFileSync(schemaPath, 'utf-8');
    db.exec(schema);

    // Check total count
    const totalCount = db.prepare('SELECT COUNT(*) as count FROM trait_catalog').get() as { count: number };
    expect(totalCount.count).toBe(24);

    // Check 6 traits per category
    const categories = ['moral', 'emotional', 'capability', 'reputation'];
    for (const category of categories) {
      const categoryCount = db.prepare('SELECT COUNT(*) as count FROM trait_catalog WHERE category = ?').get(category) as { count: number };
      expect(categoryCount.count).toBe(6);
    }
  });

  it('should enforce CHECK constraint on trait_catalog category', () => {
    db = new Database(':memory:');
    const schemaPath = join(__dirname, '../schema.sql');
    const schema = readFileSync(schemaPath, 'utf-8');
    db.exec(schema);

    // Valid category should work
    expect(() => {
      db.exec(`
        INSERT INTO trait_catalog (trait, category, description)
        VALUES ('test_trait', 'moral', 'A test trait')
      `);
    }).not.toThrow();

    // Invalid category should fail
    expect(() => {
      db.exec(`
        INSERT INTO trait_catalog (trait, category, description)
        VALUES ('bad_trait', 'invalid_category', 'A bad trait')
      `);
    }).toThrow();
  });

  it('should enforce unique constraint on trait_catalog trait', () => {
    db = new Database(':memory:');
    const schemaPath = join(__dirname, '../schema.sql');
    const schema = readFileSync(schemaPath, 'utf-8');
    db.exec(schema);

    // Duplicate trait (trying to insert 'merciful' again) should fail
    expect(() => {
      db.exec(`
        INSERT INTO trait_catalog (trait, category, description)
        VALUES ('merciful', 'moral', 'Duplicate trait')
      `);
    }).toThrow();
  });

  it('should include expected moral traits in trait_catalog', () => {
    db = new Database(':memory:');
    const schemaPath = join(__dirname, '../schema.sql');
    const schema = readFileSync(schemaPath, 'utf-8');
    db.exec(schema);

    const moralTraits = db.prepare(`
      SELECT trait FROM trait_catalog WHERE category = 'moral' ORDER BY trait
    `).all() as { trait: string }[];
    const traitNames = moralTraits.map(t => t.trait);

    expect(traitNames).toContain('merciful');
    expect(traitNames).toContain('ruthless');
    expect(traitNames).toContain('honest');
    expect(traitNames).toContain('deceptive');
    expect(traitNames).toContain('honorable');
    expect(traitNames).toContain('treacherous');
  });

  it('should create pending_evolutions table with correct columns', () => {
    db = new Database(':memory:');
    const schemaPath = join(__dirname, '../schema.sql');
    const schema = readFileSync(schemaPath, 'utf-8');
    db.exec(schema);

    const tableInfo = db.prepare("PRAGMA table_info('pending_evolutions')").all();
    const columnNames = tableInfo.map((col: { name: string }) => col.name);

    expect(columnNames).toContain('id');
    expect(columnNames).toContain('game_id');
    expect(columnNames).toContain('turn');
    expect(columnNames).toContain('evolution_type');
    expect(columnNames).toContain('entity_type');
    expect(columnNames).toContain('entity_id');
    expect(columnNames).toContain('trait');
    expect(columnNames).toContain('target_type');
    expect(columnNames).toContain('target_id');
    expect(columnNames).toContain('dimension');
    expect(columnNames).toContain('old_value');
    expect(columnNames).toContain('new_value');
    expect(columnNames).toContain('reason');
    expect(columnNames).toContain('source_event_id');
    expect(columnNames).toContain('status');
    expect(columnNames).toContain('dm_notes');
    expect(columnNames).toContain('created_at');
    expect(columnNames).toContain('resolved_at');
  });

  it('should create index for pending_evolutions table', () => {
    db = new Database(':memory:');
    const schemaPath = join(__dirname, '../schema.sql');
    const schema = readFileSync(schemaPath, 'utf-8');
    db.exec(schema);

    const indexes = db.prepare(`
      SELECT name FROM sqlite_master
      WHERE type = 'index' AND name LIKE 'idx_pending_evolutions%'
    `).all();
    const indexNames = indexes.map((idx: { name: string }) => idx.name);

    expect(indexNames).toContain('idx_pending_evolutions_game');
  });

  it('should set correct default status for pending_evolutions', () => {
    db = new Database(':memory:');
    const schemaPath = join(__dirname, '../schema.sql');
    const schema = readFileSync(schemaPath, 'utf-8');
    db.exec(schema);

    // Create a game first
    db.exec(`
      INSERT INTO games (id, player_id, current_area_id)
      VALUES ('game-1', 'player-1', 'area-1')
    `);

    // Insert a trait evolution without specifying status
    db.exec(`
      INSERT INTO pending_evolutions (id, game_id, turn, evolution_type, entity_type, entity_id, trait, reason)
      VALUES ('evo-1', 'game-1', 1, 'trait_add', 'player', 'player-1', 'merciful', 'Spared the enemy')
    `);

    const evo = db.prepare(`SELECT status FROM pending_evolutions WHERE id = 'evo-1'`).get() as { status: string };
    expect(evo.status).toBe('pending');
  });

  it('should store trait evolution correctly', () => {
    db = new Database(':memory:');
    const schemaPath = join(__dirname, '../schema.sql');
    const schema = readFileSync(schemaPath, 'utf-8');
    db.exec(schema);

    // Create a game first
    db.exec(`
      INSERT INTO games (id, player_id, current_area_id)
      VALUES ('game-1', 'player-1', 'area-1')
    `);

    // Insert a trait evolution
    db.exec(`
      INSERT INTO pending_evolutions (id, game_id, turn, evolution_type, entity_type, entity_id, trait, reason, status)
      VALUES ('evo-1', 'game-1', 5, 'trait_add', 'npc', 'npc-1', 'bitter', 'Betrayed by the party', 'pending')
    `);

    const evo = db.prepare(`SELECT * FROM pending_evolutions WHERE id = 'evo-1'`).get() as {
      evolution_type: string;
      entity_type: string;
      entity_id: string;
      trait: string;
      reason: string;
    };

    expect(evo.evolution_type).toBe('trait_add');
    expect(evo.entity_type).toBe('npc');
    expect(evo.entity_id).toBe('npc-1');
    expect(evo.trait).toBe('bitter');
    expect(evo.reason).toBe('Betrayed by the party');
  });

  it('should store relationship evolution correctly', () => {
    db = new Database(':memory:');
    const schemaPath = join(__dirname, '../schema.sql');
    const schema = readFileSync(schemaPath, 'utf-8');
    db.exec(schema);

    // Create a game first
    db.exec(`
      INSERT INTO games (id, player_id, current_area_id)
      VALUES ('game-1', 'player-1', 'area-1')
    `);

    // Insert a relationship evolution
    db.exec(`
      INSERT INTO pending_evolutions (id, game_id, turn, evolution_type, entity_type, entity_id, target_type, target_id, dimension, old_value, new_value, reason, status)
      VALUES ('evo-1', 'game-1', 3, 'relationship_change', 'npc', 'npc-1', 'player', 'player-1', 'trust', 0.5, 0.3, 'Player lied to the NPC', 'pending')
    `);

    const evo = db.prepare(`SELECT * FROM pending_evolutions WHERE id = 'evo-1'`).get() as {
      evolution_type: string;
      target_type: string;
      target_id: string;
      dimension: string;
      old_value: number;
      new_value: number;
    };

    expect(evo.evolution_type).toBe('relationship_change');
    expect(evo.target_type).toBe('player');
    expect(evo.target_id).toBe('player-1');
    expect(evo.dimension).toBe('trust');
    expect(evo.old_value).toBe(0.5);
    expect(evo.new_value).toBe(0.3);
  });

  it('should cascade delete pending_evolutions when game is deleted', () => {
    db = new Database(':memory:');
    db.pragma('foreign_keys = ON');  // Enable foreign key constraints
    const schemaPath = join(__dirname, '../schema.sql');
    const schema = readFileSync(schemaPath, 'utf-8');
    db.exec(schema);

    // Create a game and pending evolution
    db.exec(`
      INSERT INTO games (id, player_id, current_area_id)
      VALUES ('game-1', 'player-1', 'area-1')
    `);
    db.exec(`
      INSERT INTO pending_evolutions (id, game_id, turn, evolution_type, entity_type, entity_id, trait, reason)
      VALUES ('evo-1', 'game-1', 1, 'trait_add', 'player', 'player-1', 'merciful', 'Test')
    `);

    // Verify evolution exists
    let count = db.prepare(`SELECT COUNT(*) as count FROM pending_evolutions WHERE game_id = 'game-1'`).get() as { count: number };
    expect(count.count).toBe(1);

    // Delete the game
    db.exec(`DELETE FROM games WHERE id = 'game-1'`);

    // Evolution should be deleted too
    count = db.prepare(`SELECT COUNT(*) as count FROM pending_evolutions WHERE game_id = 'game-1'`).get() as { count: number };
    expect(count.count).toBe(0);
  });

  it('should create scenes table with correct columns', () => {
    db = new Database(':memory:');
    const schemaPath = join(__dirname, '../schema.sql');
    const schema = readFileSync(schemaPath, 'utf-8');
    db.exec(schema);

    const tableInfo = db.prepare("PRAGMA table_info('scenes')").all();
    const columnNames = tableInfo.map((col: { name: string }) => col.name);

    expect(columnNames).toContain('id');
    expect(columnNames).toContain('game_id');
    expect(columnNames).toContain('name');
    expect(columnNames).toContain('description');
    expect(columnNames).toContain('scene_type');
    expect(columnNames).toContain('location_id');
    expect(columnNames).toContain('started_turn');
    expect(columnNames).toContain('completed_turn');
    expect(columnNames).toContain('status');
    expect(columnNames).toContain('mood');
    expect(columnNames).toContain('stakes');
    expect(columnNames).toContain('created_at');
    expect(columnNames).toContain('updated_at');
  });

  it('should create indexes for scenes table', () => {
    db = new Database(':memory:');
    const schemaPath = join(__dirname, '../schema.sql');
    const schema = readFileSync(schemaPath, 'utf-8');
    db.exec(schema);

    const indexes = db.prepare(`
      SELECT name FROM sqlite_master
      WHERE type = 'index' AND name LIKE 'idx_scenes%'
    `).all();
    const indexNames = indexes.map((idx: { name: string }) => idx.name);

    expect(indexNames).toContain('idx_scenes_game');
    expect(indexNames).toContain('idx_scenes_status');
    expect(indexNames).toContain('idx_scenes_turns');
    expect(indexNames).toContain('idx_scenes_location');
  });

  it('should enforce CHECK constraint on scenes status', () => {
    db = new Database(':memory:');
    const schemaPath = join(__dirname, '../schema.sql');
    const schema = readFileSync(schemaPath, 'utf-8');
    db.exec(schema);

    // Create a game first
    db.exec(`
      INSERT INTO games (id, player_id, current_area_id)
      VALUES ('game-1', 'player-1', 'area-1')
    `);

    // Valid statuses should work
    expect(() => {
      db.exec(`
        INSERT INTO scenes (id, game_id, started_turn, status)
        VALUES ('scene-1', 'game-1', 1, 'active')
      `);
    }).not.toThrow();

    expect(() => {
      db.exec(`
        INSERT INTO scenes (id, game_id, started_turn, status)
        VALUES ('scene-2', 'game-1', 1, 'completed')
      `);
    }).not.toThrow();

    expect(() => {
      db.exec(`
        INSERT INTO scenes (id, game_id, started_turn, status)
        VALUES ('scene-3', 'game-1', 1, 'abandoned')
      `);
    }).not.toThrow();

    // Invalid status should fail
    expect(() => {
      db.exec(`
        INSERT INTO scenes (id, game_id, started_turn, status)
        VALUES ('scene-4', 'game-1', 1, 'invalid_status')
      `);
    }).toThrow();
  });

  it('should set correct default status for scenes', () => {
    db = new Database(':memory:');
    const schemaPath = join(__dirname, '../schema.sql');
    const schema = readFileSync(schemaPath, 'utf-8');
    db.exec(schema);

    // Create a game first
    db.exec(`
      INSERT INTO games (id, player_id, current_area_id)
      VALUES ('game-1', 'player-1', 'area-1')
    `);

    // Insert scene without specifying status
    db.exec(`
      INSERT INTO scenes (id, game_id, started_turn)
      VALUES ('scene-1', 'game-1', 1)
    `);

    const scene = db.prepare(`SELECT status FROM scenes WHERE id = 'scene-1'`).get() as { status: string };
    expect(scene.status).toBe('active');
  });

  it('should cascade delete scenes when game is deleted', () => {
    db = new Database(':memory:');
    db.pragma('foreign_keys = ON');  // Enable foreign key constraints
    const schemaPath = join(__dirname, '../schema.sql');
    const schema = readFileSync(schemaPath, 'utf-8');
    db.exec(schema);

    // Create a game and scene
    db.exec(`
      INSERT INTO games (id, player_id, current_area_id)
      VALUES ('game-1', 'player-1', 'area-1')
    `);
    db.exec(`
      INSERT INTO scenes (id, game_id, started_turn)
      VALUES ('scene-1', 'game-1', 1)
    `);

    // Verify scene exists
    let count = db.prepare(`SELECT COUNT(*) as count FROM scenes WHERE game_id = 'game-1'`).get() as { count: number };
    expect(count.count).toBe(1);

    // Delete the game
    db.exec(`DELETE FROM games WHERE id = 'game-1'`);

    // Scene should be deleted too
    count = db.prepare(`SELECT COUNT(*) as count FROM scenes WHERE game_id = 'game-1'`).get() as { count: number };
    expect(count.count).toBe(0);
  });

  it('should create scene_connections table with correct columns', () => {
    db = new Database(':memory:');
    const schemaPath = join(__dirname, '../schema.sql');
    const schema = readFileSync(schemaPath, 'utf-8');
    db.exec(schema);

    const tableInfo = db.prepare("PRAGMA table_info('scene_connections')").all();
    const columnNames = tableInfo.map((col: { name: string }) => col.name);

    expect(columnNames).toContain('id');
    expect(columnNames).toContain('game_id');
    expect(columnNames).toContain('from_scene_id');
    expect(columnNames).toContain('to_scene_id');
    expect(columnNames).toContain('requirements');
    expect(columnNames).toContain('connection_type');
    expect(columnNames).toContain('description');
    expect(columnNames).toContain('created_at');
  });

  it('should create indexes for scene_connections table', () => {
    db = new Database(':memory:');
    const schemaPath = join(__dirname, '../schema.sql');
    const schema = readFileSync(schemaPath, 'utf-8');
    db.exec(schema);

    const indexes = db.prepare(`
      SELECT name FROM sqlite_master
      WHERE type = 'index' AND name LIKE 'idx_scene_connections%'
    `).all();
    const indexNames = indexes.map((idx: { name: string }) => idx.name);

    expect(indexNames).toContain('idx_scene_connections_game');
    expect(indexNames).toContain('idx_scene_connections_from');
    expect(indexNames).toContain('idx_scene_connections_to');
    expect(indexNames).toContain('idx_scene_connections_type');
  });

  it('should set correct default connection_type for scene_connections', () => {
    db = new Database(':memory:');
    const schemaPath = join(__dirname, '../schema.sql');
    const schema = readFileSync(schemaPath, 'utf-8');
    db.exec(schema);

    // Create a game and scenes first
    db.exec(`
      INSERT INTO games (id, player_id, current_area_id)
      VALUES ('game-1', 'player-1', 'area-1')
    `);
    db.exec(`
      INSERT INTO scenes (id, game_id, started_turn)
      VALUES ('scene-1', 'game-1', 1)
    `);
    db.exec(`
      INSERT INTO scenes (id, game_id, started_turn)
      VALUES ('scene-2', 'game-1', 5)
    `);

    // Insert connection without specifying connection_type
    db.exec(`
      INSERT INTO scene_connections (id, game_id, from_scene_id, to_scene_id)
      VALUES ('conn-1', 'game-1', 'scene-1', 'scene-2')
    `);

    const conn = db.prepare(`SELECT connection_type FROM scene_connections WHERE id = 'conn-1'`).get() as { connection_type: string };
    expect(conn.connection_type).toBe('path');
  });

  it('should store scene_connections with JSON requirements', () => {
    db = new Database(':memory:');
    const schemaPath = join(__dirname, '../schema.sql');
    const schema = readFileSync(schemaPath, 'utf-8');
    db.exec(schema);

    // Create a game and scenes first
    db.exec(`
      INSERT INTO games (id, player_id, current_area_id)
      VALUES ('game-1', 'player-1', 'area-1')
    `);
    db.exec(`
      INSERT INTO scenes (id, game_id, started_turn)
      VALUES ('scene-1', 'game-1', 1)
    `);
    db.exec(`
      INSERT INTO scenes (id, game_id, started_turn)
      VALUES ('scene-2', 'game-1', 5)
    `);

    // Insert connection with JSON requirements
    const requirements = JSON.stringify({ items: ['key-1'], flags: ['door_unlocked'] });
    db.exec(`
      INSERT INTO scene_connections (id, game_id, from_scene_id, to_scene_id, requirements, connection_type, description)
      VALUES ('conn-1', 'game-1', 'scene-1', 'scene-2', '${requirements}', 'conditional', 'A locked door requiring a key')
    `);

    const conn = db.prepare(`SELECT * FROM scene_connections WHERE id = 'conn-1'`).get() as {
      requirements: string;
      connection_type: string;
      description: string;
    };

    expect(JSON.parse(conn.requirements)).toEqual({ items: ['key-1'], flags: ['door_unlocked'] });
    expect(conn.connection_type).toBe('conditional');
    expect(conn.description).toBe('A locked door requiring a key');
  });

  it('should cascade delete scene_connections when game is deleted', () => {
    db = new Database(':memory:');
    db.pragma('foreign_keys = ON');  // Enable foreign key constraints
    const schemaPath = join(__dirname, '../schema.sql');
    const schema = readFileSync(schemaPath, 'utf-8');
    db.exec(schema);

    // Create a game, scenes, and connection
    db.exec(`
      INSERT INTO games (id, player_id, current_area_id)
      VALUES ('game-1', 'player-1', 'area-1')
    `);
    db.exec(`
      INSERT INTO scenes (id, game_id, started_turn)
      VALUES ('scene-1', 'game-1', 1)
    `);
    db.exec(`
      INSERT INTO scenes (id, game_id, started_turn)
      VALUES ('scene-2', 'game-1', 5)
    `);
    db.exec(`
      INSERT INTO scene_connections (id, game_id, from_scene_id, to_scene_id)
      VALUES ('conn-1', 'game-1', 'scene-1', 'scene-2')
    `);

    // Verify connection exists
    let count = db.prepare(`SELECT COUNT(*) as count FROM scene_connections WHERE game_id = 'game-1'`).get() as { count: number };
    expect(count.count).toBe(1);

    // Delete the game
    db.exec(`DELETE FROM games WHERE id = 'game-1'`);

    // Connection should be deleted too
    count = db.prepare(`SELECT COUNT(*) as count FROM scene_connections WHERE game_id = 'game-1'`).get() as { count: number };
    expect(count.count).toBe(0);
  });

  it('should cascade delete scene_connections when scene is deleted', () => {
    db = new Database(':memory:');
    db.pragma('foreign_keys = ON');  // Enable foreign key constraints
    const schemaPath = join(__dirname, '../schema.sql');
    const schema = readFileSync(schemaPath, 'utf-8');
    db.exec(schema);

    // Create a game, scenes, and connection
    db.exec(`
      INSERT INTO games (id, player_id, current_area_id)
      VALUES ('game-1', 'player-1', 'area-1')
    `);
    db.exec(`
      INSERT INTO scenes (id, game_id, started_turn)
      VALUES ('scene-1', 'game-1', 1)
    `);
    db.exec(`
      INSERT INTO scenes (id, game_id, started_turn)
      VALUES ('scene-2', 'game-1', 5)
    `);
    db.exec(`
      INSERT INTO scene_connections (id, game_id, from_scene_id, to_scene_id)
      VALUES ('conn-1', 'game-1', 'scene-1', 'scene-2')
    `);

    // Verify connection exists
    let count = db.prepare(`SELECT COUNT(*) as count FROM scene_connections`).get() as { count: number };
    expect(count.count).toBe(1);

    // Delete the from_scene
    db.exec(`DELETE FROM scenes WHERE id = 'scene-1'`);

    // Connection should be deleted too
    count = db.prepare(`SELECT COUNT(*) as count FROM scene_connections`).get() as { count: number };
    expect(count.count).toBe(0);
  });

  it('should create scene_availability table with correct columns', () => {
    db = new Database(':memory:');
    const schemaPath = join(__dirname, '../schema.sql');
    const schema = readFileSync(schemaPath, 'utf-8');
    db.exec(schema);

    const tableInfo = db.prepare("PRAGMA table_info('scene_availability')").all();
    const columnNames = tableInfo.map((col: { name: string }) => col.name);

    expect(columnNames).toContain('game_id');
    expect(columnNames).toContain('scene_id');
    expect(columnNames).toContain('unlocked_turn');
    expect(columnNames).toContain('unlocked_by');
    expect(columnNames).toContain('created_at');
  });

  it('should create indexes for scene_availability table', () => {
    db = new Database(':memory:');
    const schemaPath = join(__dirname, '../schema.sql');
    const schema = readFileSync(schemaPath, 'utf-8');
    db.exec(schema);

    const indexes = db.prepare(`
      SELECT name FROM sqlite_master
      WHERE type = 'index' AND name LIKE 'idx_scene_availability%'
    `).all();
    const indexNames = indexes.map((idx: { name: string }) => idx.name);

    expect(indexNames).toContain('idx_scene_availability_game');
    expect(indexNames).toContain('idx_scene_availability_scene');
  });

  it('should enforce composite primary key on scene_availability', () => {
    db = new Database(':memory:');
    const schemaPath = join(__dirname, '../schema.sql');
    const schema = readFileSync(schemaPath, 'utf-8');
    db.exec(schema);

    // Create a game and scene first
    db.exec(`
      INSERT INTO games (id, player_id, current_area_id)
      VALUES ('game-1', 'player-1', 'area-1')
    `);
    db.exec(`
      INSERT INTO scenes (id, game_id, started_turn)
      VALUES ('scene-1', 'game-1', 1)
    `);

    // First availability should work
    expect(() => {
      db.exec(`
        INSERT INTO scene_availability (game_id, scene_id, unlocked_turn, unlocked_by)
        VALUES ('game-1', 'scene-1', 1, 'player-1')
      `);
    }).not.toThrow();

    // Duplicate (same game_id, scene_id) should fail
    expect(() => {
      db.exec(`
        INSERT INTO scene_availability (game_id, scene_id, unlocked_turn, unlocked_by)
        VALUES ('game-1', 'scene-1', 2, 'player-2')
      `);
    }).toThrow();
  });

  it('should store scene_availability with correct values', () => {
    db = new Database(':memory:');
    const schemaPath = join(__dirname, '../schema.sql');
    const schema = readFileSync(schemaPath, 'utf-8');
    db.exec(schema);

    // Create a game and scene first
    db.exec(`
      INSERT INTO games (id, player_id, current_area_id)
      VALUES ('game-1', 'player-1', 'area-1')
    `);
    db.exec(`
      INSERT INTO scenes (id, game_id, started_turn)
      VALUES ('scene-1', 'game-1', 1)
    `);

    // Insert availability
    db.exec(`
      INSERT INTO scene_availability (game_id, scene_id, unlocked_turn, unlocked_by)
      VALUES ('game-1', 'scene-1', 5, 'event-123')
    `);

    const availability = db.prepare(`SELECT * FROM scene_availability WHERE game_id = 'game-1' AND scene_id = 'scene-1'`).get() as {
      game_id: string;
      scene_id: string;
      unlocked_turn: number;
      unlocked_by: string;
    };

    expect(availability.game_id).toBe('game-1');
    expect(availability.scene_id).toBe('scene-1');
    expect(availability.unlocked_turn).toBe(5);
    expect(availability.unlocked_by).toBe('event-123');
  });

  it('should cascade delete scene_availability when game is deleted', () => {
    db = new Database(':memory:');
    db.pragma('foreign_keys = ON');  // Enable foreign key constraints
    const schemaPath = join(__dirname, '../schema.sql');
    const schema = readFileSync(schemaPath, 'utf-8');
    db.exec(schema);

    // Create a game, scene, and availability
    db.exec(`
      INSERT INTO games (id, player_id, current_area_id)
      VALUES ('game-1', 'player-1', 'area-1')
    `);
    db.exec(`
      INSERT INTO scenes (id, game_id, started_turn)
      VALUES ('scene-1', 'game-1', 1)
    `);
    db.exec(`
      INSERT INTO scene_availability (game_id, scene_id, unlocked_turn)
      VALUES ('game-1', 'scene-1', 1)
    `);

    // Verify availability exists
    let count = db.prepare(`SELECT COUNT(*) as count FROM scene_availability`).get() as { count: number };
    expect(count.count).toBe(1);

    // Delete the game
    db.exec(`DELETE FROM games WHERE id = 'game-1'`);

    // Availability should be deleted too
    count = db.prepare(`SELECT COUNT(*) as count FROM scene_availability`).get() as { count: number };
    expect(count.count).toBe(0);
  });

  it('should cascade delete scene_availability when scene is deleted', () => {
    db = new Database(':memory:');
    db.pragma('foreign_keys = ON');  // Enable foreign key constraints
    const schemaPath = join(__dirname, '../schema.sql');
    const schema = readFileSync(schemaPath, 'utf-8');
    db.exec(schema);

    // Create a game, scene, and availability
    db.exec(`
      INSERT INTO games (id, player_id, current_area_id)
      VALUES ('game-1', 'player-1', 'area-1')
    `);
    db.exec(`
      INSERT INTO scenes (id, game_id, started_turn)
      VALUES ('scene-1', 'game-1', 1)
    `);
    db.exec(`
      INSERT INTO scene_availability (game_id, scene_id, unlocked_turn)
      VALUES ('game-1', 'scene-1', 1)
    `);

    // Verify availability exists
    let count = db.prepare(`SELECT COUNT(*) as count FROM scene_availability`).get() as { count: number };
    expect(count.count).toBe(1);

    // Delete the scene
    db.exec(`DELETE FROM scenes WHERE id = 'scene-1'`);

    // Availability should be deleted too
    count = db.prepare(`SELECT COUNT(*) as count FROM scene_availability`).get() as { count: number };
    expect(count.count).toBe(0);
  });

  it('should create scene_flags table with correct columns', () => {
    db = new Database(':memory:');
    const schemaPath = join(__dirname, '../schema.sql');
    const schema = readFileSync(schemaPath, 'utf-8');
    db.exec(schema);

    const tableInfo = db.prepare("PRAGMA table_info('scene_flags')").all();
    const columnNames = tableInfo.map((col: { name: string }) => col.name);

    expect(columnNames).toContain('id');
    expect(columnNames).toContain('game_id');
    expect(columnNames).toContain('scene_id');
    expect(columnNames).toContain('flag_name');
    expect(columnNames).toContain('flag_value');
    expect(columnNames).toContain('set_turn');
    expect(columnNames).toContain('created_at');
  });

  it('should create indexes for scene_flags table', () => {
    db = new Database(':memory:');
    const schemaPath = join(__dirname, '../schema.sql');
    const schema = readFileSync(schemaPath, 'utf-8');
    db.exec(schema);

    const indexes = db.prepare(`
      SELECT name FROM sqlite_master
      WHERE type = 'index' AND name LIKE 'idx_scene_flags%'
    `).all();
    const indexNames = indexes.map((idx: { name: string }) => idx.name);

    expect(indexNames).toContain('idx_scene_flags_game_scene');
    expect(indexNames).toContain('idx_scene_flags_name');
  });

  it('should set correct default flag_value for scene_flags', () => {
    db = new Database(':memory:');
    const schemaPath = join(__dirname, '../schema.sql');
    const schema = readFileSync(schemaPath, 'utf-8');
    db.exec(schema);

    // Create a game and scene first
    db.exec(`
      INSERT INTO games (id, player_id, current_area_id)
      VALUES ('game-1', 'player-1', 'area-1')
    `);
    db.exec(`
      INSERT INTO scenes (id, game_id, started_turn)
      VALUES ('scene-1', 'game-1', 1)
    `);

    // Insert flag without specifying flag_value
    db.exec(`
      INSERT INTO scene_flags (id, game_id, scene_id, flag_name, set_turn)
      VALUES ('flag-1', 'game-1', 'scene-1', 'door_opened', 5)
    `);

    const flag = db.prepare(`SELECT flag_value FROM scene_flags WHERE id = 'flag-1'`).get() as { flag_value: string };
    expect(flag.flag_value).toBe('true');
  });

  it('should enforce unique constraint on scene_flags (game_id, scene_id, flag_name)', () => {
    db = new Database(':memory:');
    const schemaPath = join(__dirname, '../schema.sql');
    const schema = readFileSync(schemaPath, 'utf-8');
    db.exec(schema);

    // Create a game and scene first
    db.exec(`
      INSERT INTO games (id, player_id, current_area_id)
      VALUES ('game-1', 'player-1', 'area-1')
    `);
    db.exec(`
      INSERT INTO scenes (id, game_id, started_turn)
      VALUES ('scene-1', 'game-1', 1)
    `);

    // First flag should work
    expect(() => {
      db.exec(`
        INSERT INTO scene_flags (id, game_id, scene_id, flag_name, set_turn)
        VALUES ('flag-1', 'game-1', 'scene-1', 'door_opened', 5)
      `);
    }).not.toThrow();

    // Duplicate flag (same game_id, scene_id, flag_name) should fail
    expect(() => {
      db.exec(`
        INSERT INTO scene_flags (id, game_id, scene_id, flag_name, set_turn)
        VALUES ('flag-2', 'game-1', 'scene-1', 'door_opened', 6)
      `);
    }).toThrow();

    // Same flag name in different scene should work
    db.exec(`
      INSERT INTO scenes (id, game_id, started_turn)
      VALUES ('scene-2', 'game-1', 10)
    `);
    expect(() => {
      db.exec(`
        INSERT INTO scene_flags (id, game_id, scene_id, flag_name, set_turn)
        VALUES ('flag-3', 'game-1', 'scene-2', 'door_opened', 10)
      `);
    }).not.toThrow();
  });

  it('should store scene_flags with correct values', () => {
    db = new Database(':memory:');
    const schemaPath = join(__dirname, '../schema.sql');
    const schema = readFileSync(schemaPath, 'utf-8');
    db.exec(schema);

    // Create a game and scene first
    db.exec(`
      INSERT INTO games (id, player_id, current_area_id)
      VALUES ('game-1', 'player-1', 'area-1')
    `);
    db.exec(`
      INSERT INTO scenes (id, game_id, started_turn)
      VALUES ('scene-1', 'game-1', 1)
    `);

    // Insert flag with custom value
    db.exec(`
      INSERT INTO scene_flags (id, game_id, scene_id, flag_name, flag_value, set_turn)
      VALUES ('flag-1', 'game-1', 'scene-1', 'chest_contents', 'gold_coins', 7)
    `);

    const flag = db.prepare(`SELECT * FROM scene_flags WHERE id = 'flag-1'`).get() as {
      id: string;
      game_id: string;
      scene_id: string;
      flag_name: string;
      flag_value: string;
      set_turn: number;
    };

    expect(flag.id).toBe('flag-1');
    expect(flag.game_id).toBe('game-1');
    expect(flag.scene_id).toBe('scene-1');
    expect(flag.flag_name).toBe('chest_contents');
    expect(flag.flag_value).toBe('gold_coins');
    expect(flag.set_turn).toBe(7);
  });

  it('should cascade delete scene_flags when game is deleted', () => {
    db = new Database(':memory:');
    db.pragma('foreign_keys = ON');  // Enable foreign key constraints
    const schemaPath = join(__dirname, '../schema.sql');
    const schema = readFileSync(schemaPath, 'utf-8');
    db.exec(schema);

    // Create a game, scene, and flag
    db.exec(`
      INSERT INTO games (id, player_id, current_area_id)
      VALUES ('game-1', 'player-1', 'area-1')
    `);
    db.exec(`
      INSERT INTO scenes (id, game_id, started_turn)
      VALUES ('scene-1', 'game-1', 1)
    `);
    db.exec(`
      INSERT INTO scene_flags (id, game_id, scene_id, flag_name, set_turn)
      VALUES ('flag-1', 'game-1', 'scene-1', 'test_flag', 1)
    `);

    // Verify flag exists
    let count = db.prepare(`SELECT COUNT(*) as count FROM scene_flags`).get() as { count: number };
    expect(count.count).toBe(1);

    // Delete the game
    db.exec(`DELETE FROM games WHERE id = 'game-1'`);

    // Flag should be deleted too
    count = db.prepare(`SELECT COUNT(*) as count FROM scene_flags`).get() as { count: number };
    expect(count.count).toBe(0);
  });

  it('should cascade delete scene_flags when scene is deleted', () => {
    db = new Database(':memory:');
    db.pragma('foreign_keys = ON');  // Enable foreign key constraints
    const schemaPath = join(__dirname, '../schema.sql');
    const schema = readFileSync(schemaPath, 'utf-8');
    db.exec(schema);

    // Create a game, scene, and flag
    db.exec(`
      INSERT INTO games (id, player_id, current_area_id)
      VALUES ('game-1', 'player-1', 'area-1')
    `);
    db.exec(`
      INSERT INTO scenes (id, game_id, started_turn)
      VALUES ('scene-1', 'game-1', 1)
    `);
    db.exec(`
      INSERT INTO scene_flags (id, game_id, scene_id, flag_name, set_turn)
      VALUES ('flag-1', 'game-1', 'scene-1', 'test_flag', 1)
    `);

    // Verify flag exists
    let count = db.prepare(`SELECT COUNT(*) as count FROM scene_flags`).get() as { count: number };
    expect(count.count).toBe(1);

    // Delete the scene
    db.exec(`DELETE FROM scenes WHERE id = 'scene-1'`);

    // Flag should be deleted too
    count = db.prepare(`SELECT COUNT(*) as count FROM scene_flags`).get() as { count: number };
    expect(count.count).toBe(0);
  });

  it('should have current_scene_id column in games table', () => {
    db = new Database(':memory:');
    const schemaPath = join(__dirname, '../schema.sql');
    const schema = readFileSync(schemaPath, 'utf-8');
    db.exec(schema);

    const tableInfo = db.prepare("PRAGMA table_info('games')").all();
    const columnNames = tableInfo.map((col: { name: string }) => col.name);

    expect(columnNames).toContain('current_scene_id');
  });

  it('should allow null current_scene_id in games table', () => {
    db = new Database(':memory:');
    const schemaPath = join(__dirname, '../schema.sql');
    const schema = readFileSync(schemaPath, 'utf-8');
    db.exec(schema);

    // Insert game without current_scene_id
    expect(() => {
      db.exec(`
        INSERT INTO games (id, player_id, current_area_id)
        VALUES ('game-1', 'player-1', 'area-1')
      `);
    }).not.toThrow();

    const game = db.prepare(`SELECT current_scene_id FROM games WHERE id = 'game-1'`).get() as { current_scene_id: string | null };
    expect(game.current_scene_id).toBeNull();
  });

  it('should allow setting current_scene_id to a valid scene', () => {
    db = new Database(':memory:');
    const schemaPath = join(__dirname, '../schema.sql');
    const schema = readFileSync(schemaPath, 'utf-8');
    db.exec(schema);

    // Create game and scene
    db.exec(`
      INSERT INTO games (id, player_id, current_area_id)
      VALUES ('game-1', 'player-1', 'area-1')
    `);
    db.exec(`
      INSERT INTO scenes (id, game_id, started_turn)
      VALUES ('scene-1', 'game-1', 1)
    `);

    // Update game with current_scene_id
    db.exec(`
      UPDATE games SET current_scene_id = 'scene-1' WHERE id = 'game-1'
    `);

    const game = db.prepare(`SELECT current_scene_id FROM games WHERE id = 'game-1'`).get() as { current_scene_id: string };
    expect(game.current_scene_id).toBe('scene-1');
  });
});
