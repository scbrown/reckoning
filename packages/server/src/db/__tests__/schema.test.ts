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
});
