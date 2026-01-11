-- Reckoning SQLite Schema

-- Games table
CREATE TABLE IF NOT EXISTS games (
  id TEXT PRIMARY KEY,
  player_id TEXT NOT NULL,
  current_area_id TEXT NOT NULL,
  turn INTEGER DEFAULT 0,
  playback_mode TEXT DEFAULT 'auto',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Players table
CREATE TABLE IF NOT EXISTS players (
  id TEXT PRIMARY KEY,
  game_id TEXT NOT NULL REFERENCES games(id),
  name TEXT NOT NULL,
  description TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Party members table
CREATE TABLE IF NOT EXISTS party_members (
  id TEXT PRIMARY KEY,
  game_id TEXT NOT NULL REFERENCES games(id),
  name TEXT NOT NULL,
  description TEXT,
  class TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Areas table
CREATE TABLE IF NOT EXISTS areas (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  tags TEXT,  -- JSON array
  created_at TEXT DEFAULT (datetime('now'))
);

-- Area exits table
CREATE TABLE IF NOT EXISTS area_exits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  area_id TEXT NOT NULL REFERENCES areas(id),
  direction TEXT NOT NULL,
  target_area_id TEXT NOT NULL,
  description TEXT,
  locked INTEGER DEFAULT 0
);

-- Area objects table
CREATE TABLE IF NOT EXISTS area_objects (
  id TEXT PRIMARY KEY,
  area_id TEXT NOT NULL REFERENCES areas(id),
  name TEXT NOT NULL,
  description TEXT,
  interactable INTEGER DEFAULT 1,
  tags TEXT  -- JSON array
);

-- NPCs table
CREATE TABLE IF NOT EXISTS npcs (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  current_area_id TEXT REFERENCES areas(id),
  disposition TEXT DEFAULT 'neutral',
  tags TEXT,  -- JSON array
  created_at TEXT DEFAULT (datetime('now'))
);

-- Events table
CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  game_id TEXT NOT NULL REFERENCES games(id),
  turn INTEGER NOT NULL,
  timestamp TEXT DEFAULT (datetime('now')),
  event_type TEXT NOT NULL,
  content TEXT NOT NULL,
  original_generated TEXT,
  speaker TEXT,
  location_id TEXT NOT NULL,
  witnesses TEXT  -- JSON array
);
CREATE INDEX IF NOT EXISTS idx_events_game ON events(game_id);
CREATE INDEX IF NOT EXISTS idx_events_turn ON events(game_id, turn);

-- Saves table
CREATE TABLE IF NOT EXISTS saves (
  id TEXT PRIMARY KEY,
  game_id TEXT NOT NULL REFERENCES games(id),
  name TEXT NOT NULL,
  turn INTEGER NOT NULL,
  session_duration_ms INTEGER,
  snapshot TEXT NOT NULL,  -- JSON blob of full state
  created_at TEXT DEFAULT (datetime('now'))
);

-- Editor state table
CREATE TABLE IF NOT EXISTS editor_state (
  game_id TEXT PRIMARY KEY REFERENCES games(id),
  pending_content TEXT,  -- JSON GeneratedContent
  edited_content TEXT,
  status TEXT DEFAULT 'empty',
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Seed default starting area (only if not exists)
INSERT OR IGNORE INTO areas (id, name, description, tags)
VALUES (
  'default-area',
  'The Crossroads',
  'A weathered stone marker stands at the intersection of two ancient roads. To the north, dark pines crowd the horizon. Eastward, the land slopes toward distant farmsteads. The western road vanishes into rolling hills, while southward lies the village you left behind. The wind carries whispers of journeys begun and fates yet unwritten.',
  '["starting", "outdoor", "crossroads"]'
);
