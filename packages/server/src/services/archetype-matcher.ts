/**
 * Archetype Matcher Service
 *
 * Service to find best matching archetype sprites for AI character casting.
 * Loads the manifest.json from generated archetypes and provides query-based
 * matching with scoring for partial matches.
 */

import { existsSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Path to the archetypes directory
 */
const ARCHETYPES_ROOT = join(__dirname, '..', '..', '..', '..', 'assets', 'archetypes');
const MANIFEST_PATH = join(ARCHETYPES_ROOT, 'manifest.json');

/**
 * Query parameters for finding matching archetypes
 */
export interface CharacterQuery {
  /** Filter by race (exact match) */
  race?: string;
  /** Filter by gender (exact match) */
  gender?: 'male' | 'female';
  /** Filter by archetype class */
  archetype?: string;
  /** Filter/boost by tags (partial match) */
  tags?: string[];
  /** Filter/boost by mood (partial match) */
  mood?: string[];
  /** Filter by skin tone */
  skinTone?: string;
  /** Filter by hair style */
  hair?: string;
}

/**
 * Manifest entry for a generated archetype sprite
 */
export interface ArchetypeEntry {
  id: string;
  path: string;
  race: string;
  gender: string;
  archetype: string;
  skinTone: string;
  hair: string;
  equipment: {
    weapon: string;
    armor: string;
    accessory: string;
  };
  tags: string[];
  mood: string;
  generatedAt: string;
}

/**
 * Full manifest structure
 */
interface Manifest {
  version: string;
  generatedAt: string;
  totalSprites: number;
  sprites: ArchetypeEntry[];
}

/**
 * Match result with score
 */
export interface ArchetypeMatch {
  /** The matched archetype */
  archetype: ArchetypeEntry;
  /** Match score (0-100, higher is better) */
  score: number;
  /** Breakdown of match factors */
  matchFactors: {
    race: boolean;
    gender: boolean;
    archetype: boolean;
    skinTone: boolean;
    hair: boolean;
    tagMatches: number;
    moodMatch: boolean;
  };
}

/**
 * Error thrown when archetype matching fails
 */
export class ArchetypeMatcherError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ArchetypeMatcherError';
  }
}

/**
 * Archetype Matcher
 *
 * Finds best matching archetype sprites based on character queries.
 *
 * Usage:
 * ```typescript
 * const matcher = new ArchetypeMatcher();
 * await matcher.loadManifest();
 *
 * const matches = matcher.findBestMatch({
 *   race: 'elf',
 *   archetype: 'mage',
 *   tags: ['villain', 'sinister'],
 *   mood: ['cold', 'calculating'],
 * });
 * ```
 */
export class ArchetypeMatcher {
  private manifest: Manifest | null = null;
  private archetypes: ArchetypeEntry[] = [];

  /**
   * Load the manifest from the archetypes directory
   */
  async loadManifest(): Promise<void> {
    if (!existsSync(MANIFEST_PATH)) {
      throw new ArchetypeMatcherError(
        `Manifest not found: ${MANIFEST_PATH}. Run generate-archetype-library.ts first.`
      );
    }

    try {
      const content = readFileSync(MANIFEST_PATH, 'utf-8');
      this.manifest = JSON.parse(content) as Manifest;
      this.archetypes = this.manifest.sprites;
    } catch (error) {
      throw new ArchetypeMatcherError(
        `Failed to load manifest: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Check if manifest is loaded
   */
  isReady(): boolean {
    return this.manifest !== null && this.archetypes.length > 0;
  }

  /**
   * Get total number of archetypes
   */
  getCount(): number {
    return this.archetypes.length;
  }

  /**
   * Get an archetype by ID
   */
  getById(id: string): ArchetypeEntry | null {
    return this.archetypes.find((a) => a.id === id) ?? null;
  }

  /**
   * Find best matching archetypes for a query
   *
   * @param query - The character query
   * @param limit - Maximum number of results (default 5)
   * @returns Ranked list of matches
   */
  findBestMatch(query: CharacterQuery, limit: number = 5): ArchetypeMatch[] {
    if (!this.isReady()) {
      throw new ArchetypeMatcherError('Manifest not loaded. Call loadManifest() first.');
    }

    const scored = this.archetypes.map((archetype) =>
      this.scoreMatch(archetype, query)
    );

    // Sort by score descending
    scored.sort((a, b) => b.score - a.score);

    // Return top matches
    return scored.slice(0, limit);
  }

  /**
   * Find all archetypes matching exact criteria (no scoring)
   */
  findExact(query: CharacterQuery): ArchetypeEntry[] {
    if (!this.isReady()) {
      throw new ArchetypeMatcherError('Manifest not loaded. Call loadManifest() first.');
    }

    return this.archetypes.filter((archetype) => {
      if (query.race && archetype.race !== query.race) return false;
      if (query.gender && archetype.gender !== query.gender) return false;
      if (query.archetype && archetype.archetype !== query.archetype) return false;
      if (query.skinTone && archetype.skinTone !== query.skinTone) return false;
      if (query.hair && archetype.hair !== query.hair) return false;
      return true;
    });
  }

  /**
   * Score how well an archetype matches a query
   */
  private scoreMatch(archetype: ArchetypeEntry, query: CharacterQuery): ArchetypeMatch {
    let score = 0;
    const factors = {
      race: false,
      gender: false,
      archetype: false,
      skinTone: false,
      hair: false,
      tagMatches: 0,
      moodMatch: false,
    };

    // Exact match bonuses (high weight)
    if (query.race) {
      if (archetype.race === query.race) {
        score += 30;
        factors.race = true;
      }
    } else {
      // No preference = partial credit
      score += 10;
      factors.race = true;
    }

    if (query.gender) {
      if (archetype.gender === query.gender) {
        score += 20;
        factors.gender = true;
      }
    } else {
      score += 7;
      factors.gender = true;
    }

    if (query.archetype) {
      if (archetype.archetype === query.archetype) {
        score += 25;
        factors.archetype = true;
      }
    } else {
      score += 8;
      factors.archetype = true;
    }

    if (query.skinTone) {
      if (archetype.skinTone === query.skinTone) {
        score += 5;
        factors.skinTone = true;
      }
    } else {
      score += 2;
      factors.skinTone = true;
    }

    if (query.hair) {
      if (archetype.hair === query.hair) {
        score += 5;
        factors.hair = true;
      }
    } else {
      score += 2;
      factors.hair = true;
    }

    // Tag matching (fuzzy match)
    if (query.tags && query.tags.length > 0) {
      const archetypeTags = new Set(archetype.tags.map((t) => t.toLowerCase()));
      for (const queryTag of query.tags) {
        if (archetypeTags.has(queryTag.toLowerCase())) {
          factors.tagMatches++;
          score += 3; // Each matching tag adds to score
        }
      }
    }

    // Mood matching (fuzzy match)
    if (query.mood && query.mood.length > 0) {
      const archetypeMood = archetype.mood.toLowerCase();
      for (const queryMood of query.mood) {
        if (archetypeMood === queryMood.toLowerCase() || archetypeMood.includes(queryMood.toLowerCase())) {
          factors.moodMatch = true;
          score += 5;
          break; // Only count once
        }
      }
    }

    // Normalize score to 0-100
    const normalizedScore = Math.min(100, Math.round(score));

    return {
      archetype,
      score: normalizedScore,
      matchFactors: factors,
    };
  }

  /**
   * Get all unique values for a field (for autocomplete/filtering)
   */
  getUniqueValues(field: 'race' | 'gender' | 'archetype' | 'skinTone' | 'hair'): string[] {
    if (!this.isReady()) {
      return [];
    }

    const values = new Set<string>();
    for (const archetype of this.archetypes) {
      const value = archetype[field];
      if (value) {
        values.add(value);
      }
    }
    return Array.from(values).sort();
  }

  /**
   * Get all unique tags
   */
  getAllTags(): string[] {
    if (!this.isReady()) {
      return [];
    }

    const tags = new Set<string>();
    for (const archetype of this.archetypes) {
      for (const tag of archetype.tags) {
        tags.add(tag);
      }
    }
    return Array.from(tags).sort();
  }

  /**
   * Get all unique moods
   */
  getAllMoods(): string[] {
    if (!this.isReady()) {
      return [];
    }

    const moods = new Set<string>();
    for (const archetype of this.archetypes) {
      moods.add(archetype.mood);
    }
    return Array.from(moods).sort();
  }

  /**
   * Get the manifest path (for debugging)
   */
  getManifestPath(): string {
    return MANIFEST_PATH;
  }

  /**
   * Get the archetypes root path (for debugging)
   */
  getArchetypesRoot(): string {
    return ARCHETYPES_ROOT;
  }
}

/**
 * Singleton instance for convenience
 */
let defaultMatcher: ArchetypeMatcher | null = null;

/**
 * Get the default ArchetypeMatcher instance (lazy initialization)
 */
export async function getArchetypeMatcher(): Promise<ArchetypeMatcher> {
  if (!defaultMatcher) {
    defaultMatcher = new ArchetypeMatcher();
    try {
      await defaultMatcher.loadManifest();
    } catch {
      // Manifest may not exist yet - that's ok
    }
  }
  return defaultMatcher;
}
