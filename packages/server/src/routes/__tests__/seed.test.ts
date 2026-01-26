/**
 * Seed Routes Tests
 *
 * Tests for the world seeding API endpoints.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { sessionManager, SeedSessionManager } from '../seed.js';
import type { WorldSeed, SeedEventType } from '../seed.js';

// =============================================================================
// Test Data
// =============================================================================

const VALID_WORLDSEED: WorldSeed = {
  $schema: 'worldseed-v1',
  sourceInspiration: 'Die Hard (1988)',
  setting: 'A dwarven stronghold under siege',
  tone: {
    overall: 'adventure',
    description: 'Action-packed with moments of humor and tension',
  },
  characters: [
    {
      name: 'Thorin McClane',
      role: 'player',
      description: 'A retired dwarven guard visiting for a feast',
      suggestedTraits: ['brave', 'resourceful', 'wisecracking'],
      visualDescription: 'Gruff dwarf with a worn leather vest and stubble',
    },
    {
      name: 'Hans Gruberalion',
      role: 'villain',
      description: 'An elegant elf mastermind seeking the dragon hoard',
      suggestedTraits: ['cunning', 'charismatic', 'ruthless'],
      visualDescription: 'Tall elf in a tailored black coat with silver buttons',
    },
  ],
  locations: [
    {
      name: 'Great Feasting Hall',
      description: 'A massive stone hall filled with long tables and a roaring fireplace',
      mood: 'festive turning to tense',
      connectedTo: ['Treasury Corridor', 'Kitchen'],
      visualDescription: 'Grand dwarven hall with stone pillars and chandeliers',
    },
    {
      name: 'Treasury Corridor',
      description: 'A narrow passage lined with vault doors',
      mood: 'ominous',
      connectedTo: ['Great Feasting Hall', 'Dragon Vault'],
      visualDescription: 'Torchlit corridor with heavy iron vault doors',
    },
    {
      name: 'Dragon Vault',
      description: 'The legendary vault containing the accumulated wealth of centuries',
      mood: 'awe-inspiring',
      connectedTo: ['Treasury Corridor'],
      visualDescription: 'Massive circular vault with piles of gold and gems',
    },
    {
      name: 'Kitchen',
      description: 'A busy kitchen with roaring ovens and chopping blocks',
      mood: 'chaotic',
      connectedTo: ['Great Feasting Hall'],
      visualDescription: 'Smoky kitchen with copper pots and butcher blocks',
    },
  ],
  themes: ['one-against-many', 'confined-space', 'heist'],
  visualStyle: {
    era: 'medieval fantasy',
    aesthetic: 'gritty action',
    colorPalette: ['deep gold', 'stone grey', 'torch orange', 'shadow black'],
    lightingMood: 'dramatic with flickering torchlight',
  },
  contextSummary: 'A Die Hard-inspired adventure set in a dwarven stronghold during a winter feast. When a band of mercenaries led by the elegant elf Hans Gruberalion takes over the mountain to steal the legendary dragon hoard, retired guard Thorin McClane becomes the only hope. Armed with wit, improvised weapons, and intimate knowledge of the halls, Thorin must outwit the invaders, rescue the hostages, and stop the heist before dawn.',
};

// =============================================================================
// Session Manager Tests
// =============================================================================

describe('SeedSessionManager', () => {
  let manager: SeedSessionManager;

  beforeEach(() => {
    manager = new SeedSessionManager();
  });

  describe('create', () => {
    it('should create a new session with generated id', () => {
      const session = manager.create();

      expect(session.id).toMatch(/^seed-[a-z0-9]+-[a-z0-9]+$/);
      expect(session.status).toBe('active');
      expect(session.events).toEqual([]);
      expect(session.createdAt).toBeDefined();
    });

    it('should create a session with gameId and dmPrompt', () => {
      const session = manager.create('game-123', 'Create a Die Hard inspired adventure');

      expect(session.gameId).toBe('game-123');
      expect(session.dmPrompt).toBe('Create a Die Hard inspired adventure');
    });
  });

  describe('get', () => {
    it('should return a session by id', () => {
      const created = manager.create();
      const retrieved = manager.get(created.id);

      expect(retrieved).toEqual(created);
    });

    it('should return undefined for non-existent session', () => {
      const retrieved = manager.get('non-existent');

      expect(retrieved).toBeUndefined();
    });
  });

  describe('addEvent', () => {
    it('should add an event to an active session', () => {
      const session = manager.create();
      const result = manager.addEvent(session.id, 'research-started');

      expect(result).toBe(true);

      const updated = manager.get(session.id);
      expect(updated?.events).toHaveLength(1);
      expect(updated?.events[0].type).toBe('research-started');
      expect(updated?.events[0].timestamp).toBeDefined();
    });

    it('should add an event with data', () => {
      const session = manager.create();
      const data = { source: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Die_Hard' };
      const result = manager.addEvent(session.id, 'source-found', data);

      expect(result).toBe(true);

      const updated = manager.get(session.id);
      expect(updated?.events[0].data).toEqual(data);
    });

    it('should return false for non-existent session', () => {
      const result = manager.addEvent('non-existent', 'research-started');

      expect(result).toBe(false);
    });

    it('should emit an event when adding', () => {
      const session = manager.create();
      let emittedEvent: unknown = null;

      manager.on('event', (sid, event) => {
        if (sid === session.id) {
          emittedEvent = event;
        }
      });

      manager.addEvent(session.id, 'adapting');

      expect(emittedEvent).toBeDefined();
      expect((emittedEvent as { type: string }).type).toBe('adapting');
    });
  });

  describe('submit', () => {
    it('should submit a WorldSeed to an active session', () => {
      const session = manager.create();
      const result = manager.submit(session.id, VALID_WORLDSEED);

      expect(result).toBe(true);

      const updated = manager.get(session.id);
      expect(updated?.status).toBe('completed');
      expect(updated?.seed).toEqual(VALID_WORLDSEED);
      expect(updated?.completedAt).toBeDefined();
    });

    it('should return false for non-existent session', () => {
      const result = manager.submit('non-existent', VALID_WORLDSEED);

      expect(result).toBe(false);
    });

    it('should return false for already completed session', () => {
      const session = manager.create();
      manager.submit(session.id, VALID_WORLDSEED);

      const result = manager.submit(session.id, VALID_WORLDSEED);

      expect(result).toBe(false);
    });

    it('should emit worldseed and complete events', () => {
      const session = manager.create();
      let emittedSeed: unknown = null;
      let completed = false;

      manager.on('worldseed', (sid, seed) => {
        if (sid === session.id) {
          emittedSeed = seed;
        }
      });

      manager.on('complete', (sid) => {
        if (sid === session.id) {
          completed = true;
        }
      });

      manager.submit(session.id, VALID_WORLDSEED);

      expect(emittedSeed).toEqual(VALID_WORLDSEED);
      expect(completed).toBe(true);
    });
  });

  describe('fail', () => {
    it('should mark a session as failed', () => {
      const session = manager.create();
      const result = manager.fail(session.id, 'Research timeout');

      expect(result).toBe(true);

      const updated = manager.get(session.id);
      expect(updated?.status).toBe('failed');
      expect(updated?.completedAt).toBeDefined();
    });

    it('should emit an error event', () => {
      const session = manager.create();
      let emittedError: string | null = null;

      manager.on('error', (sid, error) => {
        if (sid === session.id) {
          emittedError = error;
        }
      });

      manager.fail(session.id, 'Research timeout');

      expect(emittedError).toBe('Research timeout');
    });
  });

  describe('delete', () => {
    it('should delete a session', () => {
      const session = manager.create();
      const result = manager.delete(session.id);

      expect(result).toBe(true);
      expect(manager.get(session.id)).toBeUndefined();
    });

    it('should return false for non-existent session', () => {
      const result = manager.delete('non-existent');

      expect(result).toBe(false);
    });
  });
});

// =============================================================================
// Event Type Tests
// =============================================================================

describe('SeedEventType', () => {
  it('should accept valid event types', () => {
    const session = sessionManager.create();
    const types: SeedEventType[] = ['research-started', 'source-found', 'adapting', 'synthesizing'];

    for (const type of types) {
      const result = sessionManager.addEvent(session.id, type);
      expect(result).toBe(true);
    }

    const updated = sessionManager.get(session.id);
    expect(updated?.events).toHaveLength(4);

    // Cleanup
    sessionManager.delete(session.id);
  });
});

// =============================================================================
// WorldSeed Validation Tests
// =============================================================================

describe('WorldSeed', () => {
  it('should have required fields', () => {
    expect(VALID_WORLDSEED.$schema).toBe('worldseed-v1');
    expect(VALID_WORLDSEED.sourceInspiration).toBeDefined();
    expect(VALID_WORLDSEED.setting).toBeDefined();
    expect(VALID_WORLDSEED.tone).toBeDefined();
    expect(VALID_WORLDSEED.characters).toBeDefined();
    expect(VALID_WORLDSEED.locations).toBeDefined();
    expect(VALID_WORLDSEED.themes).toBeDefined();
    expect(VALID_WORLDSEED.visualStyle).toBeDefined();
    expect(VALID_WORLDSEED.contextSummary).toBeDefined();
  });

  it('should have valid tone values', () => {
    const validTones = ['dark', 'light', 'comedic', 'dramatic', 'horror', 'adventure'];
    expect(validTones).toContain(VALID_WORLDSEED.tone.overall);
  });

  it('should have valid character roles', () => {
    const validRoles = ['player', 'ally', 'villain', 'neutral'];
    for (const character of VALID_WORLDSEED.characters) {
      expect(validRoles).toContain(character.role);
    }
  });

  it('should have connected locations forming a graph', () => {
    const locationNames = VALID_WORLDSEED.locations.map(l => l.name);

    for (const location of VALID_WORLDSEED.locations) {
      for (const connection of location.connectedTo) {
        expect(locationNames).toContain(connection);
      }
    }
  });
});
