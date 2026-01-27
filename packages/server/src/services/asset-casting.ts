/**
 * Asset Casting Service
 *
 * Validates AI-provided asset mappings in a WorldSeed against the archetype
 * manifest, and falls back to the archetype matcher for invalid or missing
 * sprite IDs.
 */

import type {
  WorldSeed,
  AssetMappings,
  CharacterCasting,
  PalettePreset,
} from '../db/repositories/world-seed-repository.js';
import { ArchetypeMatcher, type CharacterQuery } from './archetype-matcher.js';

/**
 * Result of validating and resolving asset mappings
 */
export interface AssetCastingResult {
  /** The resolved asset mappings (all sprite IDs validated) */
  mappings: AssetMappings;
  /** Characters that needed fallback resolution */
  fallbacks: Array<{
    name: string;
    originalSpriteId?: string;
    resolvedSpriteId: string;
    reason: string;
  }>;
}

/**
 * Map a WorldSeed tone to a palette preset
 */
function toneToGlobalPalette(tone: string): PalettePreset {
  switch (tone) {
    case 'dark':
      return 'noir';
    case 'horror':
      return 'horror';
    case 'comedic':
    case 'light':
      return 'festive';
    case 'adventure':
      return 'warm_heroic';
    case 'dramatic':
      return 'cool_villain';
    default:
      return 'warm_heroic';
  }
}

/**
 * Parse a visual description into a CharacterQuery for archetype matching.
 * Extracts race, gender, archetype, and mood keywords.
 */
function visualDescriptionToQuery(
  visualDescription: string,
  role: string
): CharacterQuery {
  const desc = visualDescription.toLowerCase();
  const query: CharacterQuery = {};

  // Extract race
  const races = ['human', 'elf', 'dwarf', 'orc'];
  for (const race of races) {
    if (desc.includes(race)) {
      query.race = race;
      break;
    }
  }

  // Extract gender
  if (desc.includes('female') || desc.includes('woman') || desc.includes('she')) {
    query.gender = 'female';
  } else if (desc.includes('male') || desc.includes('man') || desc.includes('he')) {
    query.gender = 'male';
  }

  // Extract archetype
  const archetypes = ['warrior', 'mage', 'rogue', 'noble', 'commoner'];
  for (const archetype of archetypes) {
    if (desc.includes(archetype)) {
      query.archetype = archetype;
      break;
    }
  }

  // Build tags from role
  const tags: string[] = [];
  if (role === 'villain') tags.push('villain');
  if (role === 'player') tags.push('hero');
  if (role === 'ally') tags.push('ally');
  if (tags.length > 0) query.tags = tags;

  return query;
}

/**
 * Validate and resolve asset mappings for a WorldSeed.
 *
 * If the WorldSeed already contains assetMappings with valid sprite IDs,
 * those are preserved. Invalid or missing IDs are resolved via the
 * archetype matcher.
 *
 * If no assetMappings exist, all characters are resolved via matcher.
 */
export async function resolveAssetCasting(
  seed: WorldSeed,
  matcher: ArchetypeMatcher
): Promise<AssetCastingResult> {
  const fallbacks: AssetCastingResult['fallbacks'] = [];
  const existing = seed.assetMappings;

  // Build a lookup of existing character castings by name
  const existingCastings = new Map<string, CharacterCasting>();
  if (existing?.characters) {
    for (const casting of existing.characters) {
      existingCastings.set(casting.name, casting);
    }
  }

  // Resolve each character
  const resolvedCharacters: CharacterCasting[] = [];
  for (const character of seed.characters) {
    const existing = existingCastings.get(character.name);

    if (existing?.spriteId && matcher.getById(existing.spriteId)) {
      // Valid sprite ID from AI — keep it
      resolvedCharacters.push(existing);
    } else {
      // Need fallback: either no mapping, or invalid sprite ID
      const query = visualDescriptionToQuery(
        character.visualDescription,
        character.role
      );
      const matches = matcher.findBestMatch(query, 1);

      const resolvedSpriteId = matches.length > 0
        ? matches[0].archetype.id
        : 'silhouette_humanoid';

      const reason = existing?.spriteId
        ? `Invalid sprite ID "${existing.spriteId}" — resolved via archetype matcher`
        : 'No asset mapping provided — resolved via archetype matcher';

      fallbacks.push({
        name: character.name,
        originalSpriteId: existing?.spriteId,
        resolvedSpriteId,
        reason,
      });

      resolvedCharacters.push({
        name: character.name,
        spriteId: resolvedSpriteId,
        palette: existing?.palette,
        reasoning: existing?.reasoning ?? `Auto-matched from: ${character.visualDescription}`,
      });
    }
  }

  // Resolve global palette
  const globalPalette = existing?.globalPalette ?? toneToGlobalPalette(seed.tone.overall);

  // Pass through locations as-is (no manifest validation for backgrounds yet)
  const resolvedLocations = existing?.locations ?? seed.locations.map((loc) => ({
    name: loc.name,
    background: 'gradient_warm',
    lighting: loc.mood,
  }));

  return {
    mappings: {
      characters: resolvedCharacters,
      locations: resolvedLocations,
      globalPalette,
    },
    fallbacks,
  };
}
