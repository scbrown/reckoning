#!/usr/bin/env npx ts-node
/**
 * Archetype Library Generator
 *
 * Generates pre-built character sprites from archetype definitions.
 * Run with: npx ts-node scripts/generate-archetype-library.ts
 *
 * Options:
 *   --dry-run     List what would be generated without creating files
 *   --force       Overwrite existing sprites
 *   --limit=N     Only generate first N sprites (for testing)
 *   --filter=STR  Only generate archetypes matching filter (e.g., "human-male")
 */

import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Dynamically import the sprite generator (ESM module)
const DEFINITIONS_PATH = join(__dirname, 'archetype-definitions.json');
const OUTPUT_DIR = join(__dirname, '..', 'assets', 'archetypes');
const MANIFEST_PATH = join(OUTPUT_DIR, 'manifest.json');

/**
 * Archetype definition from JSON
 */
interface ArchetypeDefinition {
  id: string;
  race: string;
  gender: 'male' | 'female';
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
}

/**
 * Full definitions file structure
 */
interface ArchetypeDefinitions {
  version: string;
  description: string;
  archetypes: ArchetypeDefinition[];
  metadata: {
    totalArchetypes: number;
    [key: string]: unknown;
  };
}

/**
 * Manifest entry for generated sprite
 */
interface ManifestEntry {
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
  sprites: ManifestEntry[];
}

/**
 * CLI options
 */
interface Options {
  dryRun: boolean;
  force: boolean;
  limit?: number;
  filter?: string;
}

/**
 * Parse CLI arguments
 */
function parseArgs(): Options {
  const args = process.argv.slice(2);
  const options: Options = {
    dryRun: false,
    force: false,
  };

  for (const arg of args) {
    if (arg === '--dry-run') {
      options.dryRun = true;
    } else if (arg === '--force') {
      options.force = true;
    } else if (arg.startsWith('--limit=')) {
      options.limit = parseInt(arg.replace('--limit=', ''), 10);
    } else if (arg.startsWith('--filter=')) {
      options.filter = arg.replace('--filter=', '');
    } else if (arg === '--help' || arg === '-h') {
      console.log(`
Archetype Library Generator

Usage: npx ts-node scripts/generate-archetype-library.ts [options]

Options:
  --dry-run     List what would be generated without creating files
  --force       Overwrite existing sprites
  --limit=N     Only generate first N sprites (for testing)
  --filter=STR  Only generate archetypes matching filter (e.g., "human-male")
  --help, -h    Show this help message
`);
      process.exit(0);
    }
  }

  return options;
}

/**
 * Convert archetype definition to CharacterSpec
 */
function archetypeToSpec(archetype: ArchetypeDefinition) {
  // Map archetype fields to CharacterSpec
  // Note: The actual layer files may not exist for all combinations
  // The generator will handle missing layers gracefully

  const spec: {
    body: 'male' | 'female';
    skinTone: string;
    hair?: { style: string; color: string };
    armor?: { type: string; color?: string };
    weapon?: string;
    accessories?: string[];
  } = {
    body: archetype.gender,
    skinTone: archetype.skinTone,
  };

  // Add hair if not bald
  if (archetype.hair && archetype.hair !== 'bald') {
    spec.hair = {
      style: archetype.hair,
      color: 'default', // Color could be derived from race/archetype later
    };
  }

  // Add armor if not 'none' or 'clothes'
  if (archetype.equipment.armor && !['none', 'clothes', 'rags'].includes(archetype.equipment.armor)) {
    spec.armor = {
      type: archetype.equipment.armor,
    };
  }

  // Add weapon if not 'none'
  if (archetype.equipment.weapon && archetype.equipment.weapon !== 'none') {
    spec.weapon = archetype.equipment.weapon;
  }

  // Add accessories if not 'none'
  if (archetype.equipment.accessory && archetype.equipment.accessory !== 'none') {
    spec.accessories = [archetype.equipment.accessory];
  }

  return spec;
}

/**
 * Main generation function
 */
async function main() {
  const options = parseArgs();
  const startTime = Date.now();

  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║         Archetype Library Generator                        ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log();

  // Load definitions
  if (!existsSync(DEFINITIONS_PATH)) {
    console.error(`Error: Definitions file not found: ${DEFINITIONS_PATH}`);
    process.exit(1);
  }

  const definitions: ArchetypeDefinitions = JSON.parse(
    readFileSync(DEFINITIONS_PATH, 'utf-8')
  );

  console.log(`📋 Loaded ${definitions.archetypes.length} archetype definitions`);

  // Filter archetypes if needed
  let archetypes = definitions.archetypes;
  if (options.filter) {
    archetypes = archetypes.filter(a => a.id.includes(options.filter!));
    console.log(`🔍 Filtered to ${archetypes.length} archetypes matching "${options.filter}"`);
  }
  if (options.limit) {
    archetypes = archetypes.slice(0, options.limit);
    console.log(`📊 Limited to first ${archetypes.length} archetypes`);
  }

  if (options.dryRun) {
    console.log('\n🔍 DRY RUN - No files will be created\n');
  }

  // Ensure output directory exists
  if (!options.dryRun && !existsSync(OUTPUT_DIR)) {
    mkdirSync(OUTPUT_DIR, { recursive: true });
    console.log(`📁 Created output directory: ${OUTPUT_DIR}`);
  }

  // Import sprite generator (ESM)
  let SpriteGenerator: typeof import('../packages/server/src/services/sprite-generator.js').SpriteGenerator;
  try {
    const module = await import('../packages/server/src/services/sprite-generator.js');
    SpriteGenerator = module.SpriteGenerator;
  } catch (error) {
    console.error('Error: Could not load sprite generator. Make sure the server package is built.');
    console.error('Run: pnpm --filter @reckoning/server build');
    console.error(error);
    process.exit(1);
  }

  const generator = new SpriteGenerator();

  // Check if LPC assets are available
  if (!generator.isReady()) {
    console.warn('\n⚠️  Warning: LPC assets not found at expected location.');
    console.warn(`   Expected: ${generator.getLpcRoot()}`);
    console.warn('   Run: ./scripts/fetch-lpc-assets.sh to download assets');
    console.warn('   Continuing anyway - sprites will fail gracefully...\n');
  }

  // Generate sprites
  const manifest: ManifestEntry[] = [];
  let generated = 0;
  let skipped = 0;
  let failed = 0;

  console.log('\n🎨 Generating sprites...\n');

  for (let i = 0; i < archetypes.length; i++) {
    const archetype = archetypes[i];
    const outputPath = join(OUTPUT_DIR, `${archetype.id}.png`);
    const progress = `[${String(i + 1).padStart(3)}/${archetypes.length}]`;

    // Check if already exists
    if (!options.force && existsSync(outputPath)) {
      console.log(`${progress} ⏭️  ${archetype.id} (exists)`);
      skipped++;
      // Still add to manifest
      manifest.push({
        id: archetype.id,
        path: `${archetype.id}.png`,
        race: archetype.race,
        gender: archetype.gender,
        archetype: archetype.archetype,
        skinTone: archetype.skinTone,
        hair: archetype.hair,
        equipment: archetype.equipment,
        tags: archetype.tags,
        mood: archetype.mood,
        generatedAt: 'existing',
      });
      continue;
    }

    if (options.dryRun) {
      console.log(`${progress} 📝 Would generate: ${archetype.id}`);
      generated++;
      continue;
    }

    try {
      const spec = archetypeToSpec(archetype);
      const result = await generator.generate(spec as Parameters<typeof generator.generate>[0]);

      writeFileSync(outputPath, result.data);
      console.log(`${progress} ✅ ${archetype.id} (${result.data.length} bytes)`);

      manifest.push({
        id: archetype.id,
        path: `${archetype.id}.png`,
        race: archetype.race,
        gender: archetype.gender,
        archetype: archetype.archetype,
        skinTone: archetype.skinTone,
        hair: archetype.hair,
        equipment: archetype.equipment,
        tags: archetype.tags,
        mood: archetype.mood,
        generatedAt: new Date().toISOString(),
      });
      generated++;
    } catch (error) {
      console.log(`${progress} ❌ ${archetype.id}: ${error instanceof Error ? error.message : String(error)}`);
      failed++;
    }
  }

  // Write manifest
  if (!options.dryRun && manifest.length > 0) {
    const fullManifest: Manifest = {
      version: definitions.version,
      generatedAt: new Date().toISOString(),
      totalSprites: manifest.length,
      sprites: manifest,
    };
    writeFileSync(MANIFEST_PATH, JSON.stringify(fullManifest, null, 2));
    console.log(`\n📄 Manifest written: ${MANIFEST_PATH}`);
  }

  // Summary
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║                      Summary                                ║');
  console.log('╠════════════════════════════════════════════════════════════╣');
  console.log(`║  Generated: ${String(generated).padStart(4)} sprites                               ║`);
  console.log(`║  Skipped:   ${String(skipped).padStart(4)} (already exist)                        ║`);
  console.log(`║  Failed:    ${String(failed).padStart(4)}                                         ║`);
  console.log(`║  Time:      ${String(elapsed).padStart(4)}s                                        ║`);
  console.log('╚════════════════════════════════════════════════════════════╝');

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
