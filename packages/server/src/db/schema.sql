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

-- Party members table (legacy)
CREATE TABLE IF NOT EXISTS party_members (
  id TEXT PRIMARY KEY,
  game_id TEXT NOT NULL REFERENCES games(id),
  name TEXT NOT NULL,
  description TEXT,
  class TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Parties table
CREATE TABLE IF NOT EXISTS parties (
  id TEXT PRIMARY KEY,
  game_id TEXT NOT NULL REFERENCES games(id),
  name TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_parties_game ON parties(game_id);

-- Characters table
CREATE TABLE IF NOT EXISTS characters (
  id TEXT PRIMARY KEY,
  party_id TEXT NOT NULL REFERENCES parties(id),
  name TEXT NOT NULL,
  description TEXT,
  class TEXT,
  role TEXT NOT NULL CHECK (role IN ('player', 'member', 'companion')),
  stats TEXT,  -- JSON blob
  voice_id TEXT,  -- ElevenLabs voice ID for TTS
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_characters_party ON characters(party_id);
CREATE INDEX IF NOT EXISTS idx_characters_role ON characters(party_id, role);

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

-- Entity traits table (Entity Evolution system)
CREATE TABLE IF NOT EXISTS entity_traits (
  id TEXT PRIMARY KEY,
  game_id TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL,  -- 'player', 'character', 'npc', 'location'
  entity_id TEXT NOT NULL,
  trait TEXT NOT NULL,
  acquired_turn INTEGER NOT NULL,
  source_event_id TEXT REFERENCES events(id),
  status TEXT NOT NULL DEFAULT 'active',  -- 'active', 'faded', 'removed'
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(game_id, entity_type, entity_id, trait)
);
CREATE INDEX IF NOT EXISTS idx_entity_traits_entity ON entity_traits(game_id, entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_entity_traits_trait ON entity_traits(game_id, trait);

-- Relationships table (Entity Evolution system)
-- Tracks multi-dimensional relationships between entities
CREATE TABLE IF NOT EXISTS relationships (
  id TEXT PRIMARY KEY,
  game_id TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  from_type TEXT NOT NULL,  -- 'player', 'character', 'npc', 'location'
  from_id TEXT NOT NULL,
  to_type TEXT NOT NULL,
  to_id TEXT NOT NULL,

  -- Dimensions (0.0 to 1.0)
  trust REAL NOT NULL DEFAULT 0.5 CHECK (trust >= 0.0 AND trust <= 1.0),
  respect REAL NOT NULL DEFAULT 0.5 CHECK (respect >= 0.0 AND respect <= 1.0),
  affection REAL NOT NULL DEFAULT 0.5 CHECK (affection >= 0.0 AND affection <= 1.0),
  fear REAL NOT NULL DEFAULT 0.0 CHECK (fear >= 0.0 AND fear <= 1.0),
  resentment REAL NOT NULL DEFAULT 0.0 CHECK (resentment >= 0.0 AND resentment <= 1.0),
  debt REAL NOT NULL DEFAULT 0.0 CHECK (debt >= 0.0 AND debt <= 1.0),

  updated_turn INTEGER NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),

  UNIQUE(game_id, from_type, from_id, to_type, to_id)
);
CREATE INDEX IF NOT EXISTS idx_relationships_from ON relationships(game_id, from_type, from_id);
CREATE INDEX IF NOT EXISTS idx_relationships_to ON relationships(game_id, to_type, to_id);

-- Pending evolutions table (Entity Evolution system)
-- Queues evolution suggestions for DM review before application
CREATE TABLE IF NOT EXISTS pending_evolutions (
  id TEXT PRIMARY KEY,
  game_id TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  turn INTEGER NOT NULL,
  evolution_type TEXT NOT NULL,  -- 'trait_add', 'trait_remove', 'relationship_change'
  entity_type TEXT NOT NULL,     -- 'player', 'character', 'npc', 'location'
  entity_id TEXT NOT NULL,

  -- For trait evolutions
  trait TEXT,

  -- For relationship evolutions
  target_type TEXT,
  target_id TEXT,
  dimension TEXT,  -- 'trust', 'respect', 'affection', 'fear', 'resentment', 'debt'
  old_value REAL,
  new_value REAL,

  reason TEXT NOT NULL,  -- AI-generated explanation for the suggestion
  source_event_id TEXT REFERENCES events(id),
  status TEXT NOT NULL DEFAULT 'pending',  -- 'pending', 'approved', 'edited', 'refused'
  dm_notes TEXT,

  created_at TEXT DEFAULT (datetime('now')),
  resolved_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_pending_evolutions_game ON pending_evolutions(game_id, status);

-- Trait catalog table (Entity Evolution system)
-- Predefined vocabulary of traits that entities can acquire
CREATE TABLE IF NOT EXISTS trait_catalog (
  trait TEXT PRIMARY KEY,  -- Unique trait identifier (used as FK in entity_traits)
  category TEXT NOT NULL CHECK (category IN ('moral', 'emotional', 'capability', 'reputation')),
  description TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_trait_catalog_category ON trait_catalog(category);

-- Seed trait catalog with predefined vocabulary (24 traits: 6 per category)
-- Moral traits: govern ethical choices and alignment
INSERT OR IGNORE INTO trait_catalog (trait, category, description) VALUES
  ('merciful', 'moral', 'Shows compassion to enemies and the defeated'),
  ('ruthless', 'moral', 'Shows no mercy, eliminates threats without hesitation'),
  ('honest', 'moral', 'Speaks truth even when it costs them'),
  ('deceptive', 'moral', 'Lies and manipulates to achieve goals'),
  ('honorable', 'moral', 'Keeps promises and fights fair'),
  ('treacherous', 'moral', 'Breaks promises and betrays when advantageous');

-- Emotional traits: govern reactions and temperament
INSERT OR IGNORE INTO trait_catalog (trait, category, description) VALUES
  ('brave', 'emotional', 'Faces danger without hesitation'),
  ('fearful', 'emotional', 'Avoids danger and is easily intimidated'),
  ('calm', 'emotional', 'Maintains composure under pressure'),
  ('volatile', 'emotional', 'Quick to anger or panic when stressed'),
  ('optimistic', 'emotional', 'Expects favorable outcomes in difficult situations'),
  ('pessimistic', 'emotional', 'Expects the worst and prepares for failure');

-- Capability traits: govern skills and competencies
INSERT OR IGNORE INTO trait_catalog (trait, category, description) VALUES
  ('cunning', 'capability', 'Clever strategist who outthinks opponents'),
  ('naive', 'capability', 'Easily fooled and misses hidden meanings'),
  ('charismatic', 'capability', 'Naturally persuasive and likeable'),
  ('awkward', 'capability', 'Socially inept and struggles with interaction'),
  ('resourceful', 'capability', 'Makes do with little and improvises solutions'),
  ('dependent', 'capability', 'Relies heavily on others for support');

-- Reputation traits: govern how others perceive the entity
INSERT OR IGNORE INTO trait_catalog (trait, category, description) VALUES
  ('renowned', 'reputation', 'Famous and respected across the land'),
  ('infamous', 'reputation', 'Famous but feared or hated by many'),
  ('mysterious', 'reputation', 'Unknown and secretive, hard to read'),
  ('transparent', 'reputation', 'An open book whose motives are clear'),
  ('trusted', 'reputation', 'People believe their word without question'),
  ('distrusted', 'reputation', 'People doubt their motives and honesty');

-- Seed default starting area (only if not exists)
INSERT OR IGNORE INTO areas (id, name, description, tags)
VALUES (
  'default-area',
  'The Crossroads',
  'A weathered stone marker stands at the intersection of two ancient roads. To the north, dark pines crowd the horizon. Eastward, the land slopes toward distant farmsteads. The western road vanishes into rolling hills, while southward lies the village you left behind. The wind carries whispers of journeys begun and fates yet unwritten.',
  '["starting", "outdoor", "crossroads"]'
);
