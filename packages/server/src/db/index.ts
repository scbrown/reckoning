import Database from 'better-sqlite3';
import { readFileSync, mkdirSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

let db: Database.Database | null = null;

/**
 * Get the database path from environment or use default
 */
function getDatabasePath(): string {
  return process.env.DATABASE_PATH || './data/reckoning.db';
}

/**
 * Get or create the database connection (lazy initialization)
 */
export function getDatabase(): Database.Database {
  if (db) {
    return db;
  }

  const dbPath = getDatabasePath();
  const dbDir = dirname(dbPath);

  // Ensure data directory exists
  if (!existsSync(dbDir)) {
    mkdirSync(dbDir, { recursive: true });
  }

  // Create database connection
  db = new Database(dbPath);

  // Enable WAL mode for better concurrency
  db.pragma('journal_mode = WAL');

  // Run migrations on first connection
  runMigrations(db);

  return db;
}

/**
 * Check if a column exists in a table
 */
function columnExists(database: Database.Database, table: string, column: string): boolean {
  const columns = database.pragma(`table_info(${table})`) as Array<{ name: string }>;
  return columns.some(col => col.name === column);
}

/**
 * Add a column to a table if it doesn't exist
 */
function addColumnIfNotExists(database: Database.Database, table: string, column: string, type: string): void {
  if (!columnExists(database, table, column)) {
    database.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
  }
}

/**
 * Run database migrations (schema creation)
 */
export function runMigrations(database: Database.Database): void {
  const schemaPath = join(__dirname, 'schema.sql');
  const schema = readFileSync(schemaPath, 'utf-8');

  // Execute schema (all statements)
  database.exec(schema);

  // Migration: SEVT-001 - Add structured event fields
  // These columns are added via ALTER TABLE for existing databases
  // (CREATE TABLE IF NOT EXISTS won't modify existing tables)
  addColumnIfNotExists(database, 'events', 'action', 'TEXT');
  addColumnIfNotExists(database, 'events', 'actor_type', 'TEXT');
  addColumnIfNotExists(database, 'events', 'actor_id', 'TEXT');
  addColumnIfNotExists(database, 'events', 'target_type', 'TEXT');
  addColumnIfNotExists(database, 'events', 'target_id', 'TEXT');
  addColumnIfNotExists(database, 'events', 'tags', 'TEXT');
}

/**
 * Close the database connection
 */
export function closeDatabase(): void {
  if (db) {
    db.close();
    db = null;
  }
}
