import { getDatabase } from './index.js';

/**
 * Seed the database with starter tavern area data
 */
export function seedDatabase(): void {
  const db = getDatabase();

  // Check if seed data already exists
  const existingArea = db.prepare('SELECT id FROM areas WHERE id = ?').get('tavern_common');
  if (existingArea) {
    return; // Already seeded
  }

  // Insert starter area: The Wayward Rest tavern common room
  db.prepare(`
    INSERT INTO areas (id, name, description, tags)
    VALUES (?, ?, ?, ?)
  `).run(
    'tavern_common',
    'The Wayward Rest - Common Room',
    'The common room of The Wayward Rest is warm and inviting, filled with the scent of woodsmoke and ale. Rough-hewn wooden tables are scattered about, their surfaces scarred by years of use. A large stone hearth dominates one wall, its fire crackling merrily. A notice board near the entrance is covered with various postings and requests.',
    JSON.stringify(['tavern', 'indoor', 'social'])
  );

  // Insert area exits
  const insertExit = db.prepare(`
    INSERT INTO area_exits (area_id, direction, target_area_id, description, locked)
    VALUES (?, ?, ?, ?, ?)
  `);

  insertExit.run(
    'tavern_common',
    'north',
    'tavern_stairs',
    'A narrow staircase leads up to the rooms above.',
    0
  );

  insertExit.run(
    'tavern_common',
    'east',
    'tavern_bar',
    'The bar area where drinks are served.',
    0
  );

  insertExit.run(
    'tavern_common',
    'south',
    'village_street',
    'The door leads out to the muddy village street.',
    0
  );

  // Insert area objects
  const insertObject = db.prepare(`
    INSERT INTO area_objects (id, area_id, name, description, interactable, tags)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  insertObject.run(
    'hearth_01',
    'tavern_common',
    'Stone Hearth',
    'A large stone hearth with a roaring fire. The warmth radiates throughout the room, chasing away the chill of the outside world.',
    1,
    JSON.stringify(['fire', 'warmth', 'comfort'])
  );

  insertObject.run(
    'notice_board_01',
    'tavern_common',
    'Notice Board',
    'A wooden board covered with various notices, job postings, and requests for aid. Some look recent, while others are yellowed with age.',
    1,
    JSON.stringify(['information', 'quests', 'jobs'])
  );

  // Insert NPC: Maren the bartender
  db.prepare(`
    INSERT INTO npcs (id, name, description, current_area_id, disposition, tags)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    'maren_01',
    'Maren',
    'The bartender of The Wayward Rest is a stout woman with kind eyes and calloused hands. Her graying hair is pulled back in a practical bun, and she wears a stained apron over simple clothes. She has a warm smile for regulars and a sharp eye for troublemakers.',
    'tavern_common',
    'friendly',
    JSON.stringify(['bartender', 'innkeeper', 'information'])
  );
}

// Allow running as a script
if (import.meta.url === `file://${process.argv[1]}`) {
  seedDatabase();
  console.log('Database seeded successfully');
}
