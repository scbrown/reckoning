import { describe, it, expect, beforeEach, vi } from 'vitest';
import { resolveAssetCasting } from '../asset-casting.js';
import { ArchetypeMatcher } from '../archetype-matcher.js';
import type { WorldSeed } from '../../db/repositories/world-seed-repository.js';

function makeWorldSeed(overrides: Partial<WorldSeed> = {}): WorldSeed {
  return {
    $schema: 'worldseed-v1',
    sourceInspiration: 'Test Source',
    setting: 'A test world',
    tone: { overall: 'adventure', description: 'Adventurous' },
    characters: [
      {
        name: 'Hero',
        role: 'player',
        description: 'The brave hero',
        suggestedTraits: ['brave'],
        visualDescription: 'A tall human male warrior with light skin',
      },
      {
        name: 'Villain',
        role: 'villain',
        description: 'The dark villain',
        suggestedTraits: ['cunning'],
        visualDescription: 'An elf female mage with dark robes',
      },
    ],
    locations: [
      {
        name: 'Town Square',
        description: 'A bustling town',
        mood: 'lively',
        connectedTo: ['Dungeon'],
        visualDescription: 'A medieval town square',
      },
    ],
    themes: ['good vs evil'],
    visualStyle: {
      era: 'medieval',
      aesthetic: 'fantasy',
      colorPalette: ['gold', 'green'],
      lightingMood: 'warm sunlight',
    },
    contextSummary: 'A test world for testing.',
    ...overrides,
  };
}

function makeMockMatcher(sprites: Array<{ id: string; race: string; gender: string; archetype: string }>) {
  const matcher = new ArchetypeMatcher();
  // Inject test data via loadManifest workaround
  const entries = sprites.map((s) => ({
    id: s.id,
    path: `archetypes/${s.id}.png`,
    race: s.race,
    gender: s.gender,
    archetype: s.archetype,
    skinTone: 'light',
    hair: 'short',
    equipment: { weapon: 'sword', armor: 'leather', accessory: 'none' },
    tags: [],
    mood: 'neutral',
    generatedAt: '2026-01-01T00:00:00Z',
  }));

  // Access private fields for testing
  (matcher as any).manifest = { version: '1', generatedAt: '', totalSprites: entries.length, sprites: entries };
  (matcher as any).archetypes = entries;

  return matcher;
}

describe('resolveAssetCasting', () => {
  let matcher: ArchetypeMatcher;

  beforeEach(() => {
    matcher = makeMockMatcher([
      { id: 'human_male_warrior_light_01', race: 'human', gender: 'male', archetype: 'warrior' },
      { id: 'elf_female_mage_dark_01', race: 'elf', gender: 'female', archetype: 'mage' },
      { id: 'dwarf_male_warrior_medium_01', race: 'dwarf', gender: 'male', archetype: 'warrior' },
    ]);
  });

  it('should resolve all characters via matcher when no assetMappings provided', async () => {
    const seed = makeWorldSeed();
    const result = await resolveAssetCasting(seed, matcher);

    expect(result.mappings.characters).toHaveLength(2);
    expect(result.fallbacks).toHaveLength(2);
    expect(result.fallbacks[0].reason).toContain('No asset mapping provided');
    expect(result.fallbacks[1].reason).toContain('No asset mapping provided');
  });

  it('should preserve valid AI-provided sprite IDs', async () => {
    const seed = makeWorldSeed({
      assetMappings: {
        characters: [
          { name: 'Hero', spriteId: 'human_male_warrior_light_01', reasoning: 'Fits the hero' },
          { name: 'Villain', spriteId: 'elf_female_mage_dark_01', reasoning: 'Fits the villain' },
        ],
        locations: [],
        globalPalette: 'warm_heroic',
      },
    });

    const result = await resolveAssetCasting(seed, matcher);

    expect(result.fallbacks).toHaveLength(0);
    expect(result.mappings.characters[0].spriteId).toBe('human_male_warrior_light_01');
    expect(result.mappings.characters[1].spriteId).toBe('elf_female_mage_dark_01');
  });

  it('should fallback for invalid sprite IDs', async () => {
    const seed = makeWorldSeed({
      assetMappings: {
        characters: [
          { name: 'Hero', spriteId: 'nonexistent_sprite', reasoning: 'Bad ID' },
          { name: 'Villain', spriteId: 'elf_female_mage_dark_01', reasoning: 'Good ID' },
        ],
        locations: [],
        globalPalette: 'warm_heroic',
      },
    });

    const result = await resolveAssetCasting(seed, matcher);

    expect(result.fallbacks).toHaveLength(1);
    expect(result.fallbacks[0].name).toBe('Hero');
    expect(result.fallbacks[0].originalSpriteId).toBe('nonexistent_sprite');
    expect(result.fallbacks[0].reason).toContain('Invalid sprite ID');
    // Should have resolved to best match
    expect(result.mappings.characters[0].spriteId).toBe('human_male_warrior_light_01');
  });

  it('should preserve AI-provided palette on fallback', async () => {
    const seed = makeWorldSeed({
      assetMappings: {
        characters: [
          {
            name: 'Hero',
            spriteId: 'bad_id',
            palette: { preset: 'gritty_worn' },
            reasoning: 'test',
          },
        ],
        locations: [],
        globalPalette: 'warm_heroic',
      },
    });

    const result = await resolveAssetCasting(seed, matcher);

    expect(result.mappings.characters[0].palette).toEqual({ preset: 'gritty_worn' });
  });

  it('should derive globalPalette from tone when not provided', async () => {
    const seed = makeWorldSeed();
    const result = await resolveAssetCasting(seed, matcher);
    expect(result.mappings.globalPalette).toBe('warm_heroic'); // adventure → warm_heroic
  });

  it('should map dark tone to noir palette', async () => {
    const seed = makeWorldSeed({ tone: { overall: 'dark', description: 'Dark' } });
    const result = await resolveAssetCasting(seed, matcher);
    expect(result.mappings.globalPalette).toBe('noir');
  });

  it('should map horror tone to horror palette', async () => {
    const seed = makeWorldSeed({ tone: { overall: 'horror', description: 'Scary' } });
    const result = await resolveAssetCasting(seed, matcher);
    expect(result.mappings.globalPalette).toBe('horror');
  });

  it('should generate default location mappings when none provided', async () => {
    const seed = makeWorldSeed();
    const result = await resolveAssetCasting(seed, matcher);

    expect(result.mappings.locations).toHaveLength(1);
    expect(result.mappings.locations[0].name).toBe('Town Square');
    expect(result.mappings.locations[0].lighting).toBe('lively');
  });

  it('should preserve AI-provided location mappings', async () => {
    const seed = makeWorldSeed({
      assetMappings: {
        characters: [],
        locations: [{ name: 'Town Square', background: 'village_01', lighting: 'warm' }],
        globalPalette: 'festive',
      },
    });

    const result = await resolveAssetCasting(seed, matcher);
    expect(result.mappings.locations[0].background).toBe('village_01');
  });

  it('should handle empty characters gracefully', async () => {
    const seed = makeWorldSeed({ characters: [] });
    const result = await resolveAssetCasting(seed, matcher);

    expect(result.mappings.characters).toHaveLength(0);
    expect(result.fallbacks).toHaveLength(0);
  });
});
