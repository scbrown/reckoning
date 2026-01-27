/**
 * Tests for the Archetype Matcher Service
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  ArchetypeMatcher,
  ArchetypeMatcherError,
  type CharacterQuery,
  type ArchetypeEntry,
} from '../archetype-matcher.js';
import { existsSync, readFileSync } from 'fs';

// Mock fs module
vi.mock('fs', () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
}));

const mockExistsSync = vi.mocked(existsSync);
const mockReadFileSync = vi.mocked(readFileSync);

// Sample test data
const sampleManifest = {
  version: '1.0.0',
  generatedAt: '2026-01-26T00:00:00Z',
  totalSprites: 5,
  sprites: [
    {
      id: 'human-male-warrior-light-short',
      path: 'human-male-warrior-light-short.png',
      race: 'human',
      gender: 'male',
      archetype: 'warrior',
      skinTone: 'light',
      hair: 'short',
      equipment: { weapon: 'sword', armor: 'plate', accessory: 'shield' },
      tags: ['protagonist', 'combat', 'melee'],
      mood: 'determined',
      generatedAt: '2026-01-26T00:00:00Z',
    },
    {
      id: 'elf-female-mage-light-long',
      path: 'elf-female-mage-light-long.png',
      race: 'elf',
      gender: 'female',
      archetype: 'mage',
      skinTone: 'light',
      hair: 'long',
      equipment: { weapon: 'staff', armor: 'robes', accessory: 'circlet' },
      tags: ['enchantress', 'magic', 'beautiful'],
      mood: 'ethereal',
      generatedAt: '2026-01-26T00:00:00Z',
    },
    {
      id: 'dwarf-male-warrior-medium-short',
      path: 'dwarf-male-warrior-medium-short.png',
      race: 'dwarf',
      gender: 'male',
      archetype: 'warrior',
      skinTone: 'medium',
      hair: 'short',
      equipment: { weapon: 'axe', armor: 'plate', accessory: 'shield' },
      tags: ['combat', 'melee', 'tough'],
      mood: 'fierce',
      generatedAt: '2026-01-26T00:00:00Z',
    },
    {
      id: 'human-female-rogue-dark-short',
      path: 'human-female-rogue-dark-short.png',
      race: 'human',
      gender: 'female',
      archetype: 'rogue',
      skinTone: 'dark',
      hair: 'short',
      equipment: { weapon: 'daggers', armor: 'leather', accessory: 'cloak' },
      tags: ['shadow', 'stealth', 'agile'],
      mood: 'mysterious',
      generatedAt: '2026-01-26T00:00:00Z',
    },
    {
      id: 'orc-male-mage-dark-long',
      path: 'orc-male-mage-dark-long.png',
      race: 'orc',
      gender: 'male',
      archetype: 'mage',
      skinTone: 'dark',
      hair: 'long',
      equipment: { weapon: 'staff', armor: 'robes', accessory: 'orb' },
      tags: ['warlock', 'magic', 'powerful'],
      mood: 'intense',
      generatedAt: '2026-01-26T00:00:00Z',
    },
  ] as ArchetypeEntry[],
};

describe('ArchetypeMatcher', () => {
  let matcher: ArchetypeMatcher;

  beforeEach(() => {
    matcher = new ArchetypeMatcher();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('loadManifest', () => {
    it('should load manifest successfully', async () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(JSON.stringify(sampleManifest));

      await matcher.loadManifest();

      expect(matcher.isReady()).toBe(true);
      expect(matcher.getCount()).toBe(5);
    });

    it('should throw error if manifest not found', async () => {
      mockExistsSync.mockReturnValue(false);

      await expect(matcher.loadManifest()).rejects.toThrow(ArchetypeMatcherError);
    });

    it('should throw error if manifest is invalid JSON', async () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue('invalid json');

      await expect(matcher.loadManifest()).rejects.toThrow(ArchetypeMatcherError);
    });
  });

  describe('findBestMatch', () => {
    beforeEach(async () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(JSON.stringify(sampleManifest));
      await matcher.loadManifest();
    });

    it('should throw if manifest not loaded', () => {
      const unloadedMatcher = new ArchetypeMatcher();
      expect(() => unloadedMatcher.findBestMatch({})).toThrow(ArchetypeMatcherError);
    });

    it('should find matches by race', () => {
      const query: CharacterQuery = { race: 'human' };
      const matches = matcher.findBestMatch(query);

      expect(matches.length).toBeGreaterThan(0);
      // Human matches should have higher scores
      const humanMatches = matches.filter(m => m.archetype.race === 'human');
      const otherMatches = matches.filter(m => m.archetype.race !== 'human');

      if (humanMatches.length > 0 && otherMatches.length > 0) {
        expect(humanMatches[0].score).toBeGreaterThan(otherMatches[0].score);
      }
    });

    it('should find matches by gender', () => {
      const query: CharacterQuery = { gender: 'female' };
      const matches = matcher.findBestMatch(query);

      const femaleMatches = matches.filter(m => m.archetype.gender === 'female');
      expect(femaleMatches.length).toBeGreaterThan(0);
    });

    it('should find matches by archetype class', () => {
      const query: CharacterQuery = { archetype: 'warrior' };
      const matches = matcher.findBestMatch(query);

      const warriorMatches = matches.filter(m => m.archetype.archetype === 'warrior');
      expect(warriorMatches.length).toBe(2); // human and dwarf warriors
    });

    it('should find matches by multiple criteria', () => {
      const query: CharacterQuery = {
        race: 'elf',
        gender: 'female',
        archetype: 'mage',
      };
      const matches = matcher.findBestMatch(query);

      expect(matches[0].archetype.id).toBe('elf-female-mage-light-long');
      expect(matches[0].score).toBeGreaterThanOrEqual(75); // High score for exact match
    });

    it('should boost matches by tags', () => {
      const query: CharacterQuery = {
        tags: ['magic', 'powerful'],
      };
      const matches = matcher.findBestMatch(query);

      // Orc mage has both 'magic' and 'powerful' tags
      const orcMage = matches.find(m => m.archetype.id === 'orc-male-mage-dark-long');
      expect(orcMage).toBeDefined();
      expect(orcMage!.matchFactors.tagMatches).toBe(2);
    });

    it('should boost matches by mood', () => {
      const query: CharacterQuery = {
        mood: ['mysterious'],
      };
      const matches = matcher.findBestMatch(query);

      // Human female rogue has 'mysterious' mood
      const rogue = matches.find(m => m.archetype.id === 'human-female-rogue-dark-short');
      expect(rogue).toBeDefined();
      expect(rogue!.matchFactors.moodMatch).toBe(true);
    });

    it('should respect limit parameter', () => {
      const matches = matcher.findBestMatch({}, 2);
      expect(matches.length).toBe(2);
    });

    it('should return scores between 0 and 100', () => {
      const matches = matcher.findBestMatch({});
      for (const match of matches) {
        expect(match.score).toBeGreaterThanOrEqual(0);
        expect(match.score).toBeLessThanOrEqual(100);
      }
    });
  });

  describe('findExact', () => {
    beforeEach(async () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(JSON.stringify(sampleManifest));
      await matcher.loadManifest();
    });

    it('should find exact matches', () => {
      const query: CharacterQuery = {
        race: 'dwarf',
        gender: 'male',
        archetype: 'warrior',
      };
      const matches = matcher.findExact(query);

      expect(matches.length).toBe(1);
      expect(matches[0].id).toBe('dwarf-male-warrior-medium-short');
    });

    it('should return empty array if no exact match', () => {
      const query: CharacterQuery = {
        race: 'halfling', // Not in our test data
      };
      const matches = matcher.findExact(query);

      expect(matches.length).toBe(0);
    });
  });

  describe('getById', () => {
    beforeEach(async () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(JSON.stringify(sampleManifest));
      await matcher.loadManifest();
    });

    it('should return archetype by ID', () => {
      const archetype = matcher.getById('elf-female-mage-light-long');

      expect(archetype).not.toBeNull();
      expect(archetype!.race).toBe('elf');
    });

    it('should return null for unknown ID', () => {
      const archetype = matcher.getById('nonexistent-id');
      expect(archetype).toBeNull();
    });
  });

  describe('getUniqueValues', () => {
    beforeEach(async () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(JSON.stringify(sampleManifest));
      await matcher.loadManifest();
    });

    it('should return unique races', () => {
      const races = matcher.getUniqueValues('race');
      expect(races).toEqual(['dwarf', 'elf', 'human', 'orc']);
    });

    it('should return unique genders', () => {
      const genders = matcher.getUniqueValues('gender');
      expect(genders).toEqual(['female', 'male']);
    });

    it('should return unique archetypes', () => {
      const archetypes = matcher.getUniqueValues('archetype');
      expect(archetypes).toEqual(['mage', 'rogue', 'warrior']);
    });
  });

  describe('getAllTags', () => {
    beforeEach(async () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(JSON.stringify(sampleManifest));
      await matcher.loadManifest();
    });

    it('should return all unique tags', () => {
      const tags = matcher.getAllTags();
      expect(tags).toContain('combat');
      expect(tags).toContain('magic');
      expect(tags).toContain('stealth');
    });
  });

  describe('getAllMoods', () => {
    beforeEach(async () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(JSON.stringify(sampleManifest));
      await matcher.loadManifest();
    });

    it('should return all unique moods', () => {
      const moods = matcher.getAllMoods();
      expect(moods).toContain('determined');
      expect(moods).toContain('ethereal');
      expect(moods).toContain('mysterious');
    });
  });
});

describe('ArchetypeMatcherError', () => {
  it('should have correct name', () => {
    const error = new ArchetypeMatcherError('test error');
    expect(error.name).toBe('ArchetypeMatcherError');
  });
});
