# Asset Fallback System

## Goal

Provide a robust visual experience when pixelsrc isn't available by having AI creatively select and combine assets from a curated pack to represent any pop culture source material.

**Key insight:** Instead of generating images, the AI *casts* existing assets into roles - like a theater company with a fixed troupe of actors who can play any character through costume, lighting, and framing.

## The Theater Metaphor

```
Pop Culture Source: Die Hard
World Seed: Dwarven stronghold heist

AI Asset Mapping:
┌─────────────────────────────────────────────────────────────┐
│  Character: "Grumli Stonefist" (John McClane analog)        │
│                                                             │
│  Base sprite: dwarf_warrior_male_03                         │
│  Palette: worn/dusty (he's been through hell)               │
│  Expression overlay: determined_grit                        │
│  Props: none (barefoot, improvised weapons)                 │
│  Framing: hero_shot, low_angle                              │
│                                                             │
│  AI reasoning: "Everyman hero, wrong place wrong time.      │
│  Using weathered warrior sprite to show wear. No armor      │
│  or fancy weapons - he's underprepared but resourceful."    │
└─────────────────────────────────────────────────────────────┘
```

## Asset Pack Structure

### Characters (`assets/characters/`)

**Base Sprites** - Full character sprites with standard poses
```
characters/
├── humanoid/
│   ├── human_male_01.png ... human_male_10.png
│   ├── human_female_01.png ... human_female_10.png
│   ├── elf_male_01.png ... elf_female_05.png
│   ├── dwarf_male_01.png ... dwarf_female_05.png
│   ├── orc_01.png ... orc_05.png
│   └── ...
├── creature/
│   ├── dragon_01.png ... dragon_03.png
│   ├── wolf_01.png, bear_01.png, etc.
│   └── ...
└── abstract/
    ├── silhouette_humanoid.png    # Ultimate fallback
    ├── silhouette_beast.png
    └── silhouette_large.png
```

**Metadata per sprite** (`characters/manifest.json`):
```json
{
  "dwarf_male_03": {
    "tags": ["dwarf", "male", "warrior", "stocky", "beard"],
    "archetype_fit": ["everyman", "veteran", "gruff_hero", "reluctant_warrior"],
    "mood": ["determined", "weary", "stoic"],
    "era_fit": ["fantasy", "medieval", "steampunk"],
    "palette_zones": {
      "skin": [120, 80, 60],
      "hair": [60, 40, 20],
      "clothing_primary": [100, 100, 110],
      "clothing_secondary": [80, 70, 50]
    }
  }
}
```

### Locations (`assets/locations/`)

**Scene Backgrounds** - Tileable or static backgrounds
```
locations/
├── interior/
│   ├── tavern_01.png, castle_hall_01.png
│   ├── dungeon_01.png, mine_shaft_01.png
│   └── ...
├── exterior/
│   ├── forest_01.png, mountain_01.png
│   ├── village_01.png, city_01.png
│   └── ...
└── abstract/
    ├── gradient_warm.png
    ├── gradient_cool.png
    └── void.png
```

**Metadata:**
```json
{
  "mine_shaft_01": {
    "tags": ["underground", "industrial", "cramped", "dark"],
    "mood": ["claustrophobic", "dangerous", "working_class"],
    "source_fit": ["die_hard:nakatomi_vents", "lotr:moria", "snow_white:mines"],
    "lighting": "dim_warm",
    "verticality": "horizontal"
  }
}
```

### Overlays & Effects (`assets/overlays/`)

```
overlays/
├── expressions/
│   ├── happy.png, sad.png, angry.png, fearful.png
│   ├── determined.png, confused.png, smirking.png
│   └── ...
├── weather/
│   ├── rain.png, snow.png, fog.png
│   └── ...
├── lighting/
│   ├── spotlight.png, firelight.png, moonlight.png
│   └── ...
└── frames/
    ├── hero_shot.png, villain_frame.png
    ├── mysterious.png, comedic.png
    └── ...
```

### Props & Items (`assets/props/`)

```
props/
├── weapons/
├── tools/
├── furniture/
├── treasure/
└── misc/
```

## AI Asset Selection Process

During world seeding, the AI maps source material to assets:

### 1. Character Casting

```typescript
interface CharacterCasting {
  sourceCharacter: string;        // "Hans Gruber"
  adaptedName: string;            // "Vaelros the Gilded"

  baseSprite: string;             // "elf_male_02"
  paletteShift: PaletteShift;     // { clothing_primary: "rich_burgundy" }
  expressionOverlay: string;      // "smirking"
  props: string[];                // ["elegant_sword", "jeweled_ring"]

  reasoning: string;              // AI explains the casting choice
}
```

### 2. Location Mapping

```typescript
interface LocationMapping {
  sourceLocation: string;         // "Nakatomi Plaza"
  adaptedName: string;            // "Ironhold Treasury"

  background: string;             // "castle_vault_01"
  lightingOverlay: string;        // "torchlight"
  weatherOverlay?: string;        // null
  paletteShift: PaletteShift;     // { overall: "gold_tint" }

  reasoning: string;
}
```

### 3. Palette Shifting

The AI specifies mood-based palette shifts:

```typescript
type PalettePreset =
  | 'warm_heroic'      // Golds, warm browns
  | 'cool_villain'     // Purples, dark blues
  | 'gritty_worn'      // Desaturated, dusty
  | 'festive'          // Bright, saturated
  | 'noir'             // High contrast B&W + accent
  | 'horror'           // Greens, sickly yellows
  | 'custom';          // AI specifies HSL shifts

interface PaletteShift {
  preset?: PalettePreset;
  hueShift?: number;      // -180 to 180
  saturation?: number;    // 0.0 to 2.0
  brightness?: number;    // 0.0 to 2.0
  zones?: Record<string, [number, number, number]>;  // Per-zone RGB targets
}
```

## Integration with World Seeding

The WorldSeed output expands to include asset mappings:

```typescript
interface WorldSeed {
  // ... existing fields ...

  assetMappings?: {
    characters: CharacterCasting[];
    locations: LocationMapping[];
    globalPalette: PalettePreset;
    visualTone: string;  // "gritty action movie" | "whimsical fairy tale" | etc.
  };
}
```

**Claude Code research prompt addition:**
```
When creating the WorldSeed, also create asset mappings. You have access to
a curated sprite pack with the following categories:

[Insert asset manifest summary]

For each character and location, select the best-fit base asset and specify
how to modify it (palette shifts, overlays, props) to match the source material.

Explain your casting choices - why does this sprite work for this character?
```

## Fallback Chain

```
1. pixelsrc available?
   → Generate custom pixel art (best quality)

2. Asset pack + AI mapping available?
   → Use curated sprites with AI-directed palette/overlay

3. Asset pack only (no AI mapping)?
   → Use tag-based matching (less creative)

4. Nothing available?
   → Use silhouettes with color coding
```

## Asset Pack Sourcing

### Recommended Free Packs

| Source | Assets | License | Style | Notes |
|--------|--------|---------|-------|-------|
| [LPC Character Generator](https://liberatedpixelcup.github.io/Universal-LPC-Spritesheet-Character-Generator/) | Infinite combos | CC-BY-SA 3.0 | Classic RPG 64x64 | **Top pick for characters.** Modular parts, 13+ animations (walk, attack, cast, etc). Mix hair, armor, weapons. Requires attribution. |
| [Kenney All-in-1](https://kenney.itch.io/kenney-game-assets) | 60,000+ | CC0 | Clean vector/pixel | $20 bundle or free individual packs at [kenney.nl/assets](https://kenney.nl/assets). Great for UI, items, effects. |
| [Hyptosis Collection](https://opengameart.org/content/lots-of-free-2d-tiles-and-sprites-by-hyptosis) | 1000s | CC-BY 3.0 | Zelda-like RPG | **Top pick for environments.** Tiles, items, NPCs. Credit "Hyptosis". |
| [700 Sprites Pack](https://opengameart.org/content/700-sprites) | 700+ | CC0 | Fantasy 32x32 | Characters with 4 directions, 2 genders, 2 skin tones each. |
| [itch.io CC0 Pixel Art](https://itch.io/game-assets/free/tag-cc0/tag-pixel-art) | Varies | CC0 | Mixed | Curated CC0 pixel art, good for gap-filling. |
| [OpenGameArt Fantasy/RPG](https://opengameart.org/content/theme-fantasy-rpg) | 1000s | Mixed | Mixed | Large collection, check individual licenses. |

### Recommended Starting Combo

1. **Characters:** LPC Generator - generates spritesheets on demand with full animation
2. **Environments:** Hyptosis - cohesive Zelda-like style, lots of variety
3. **Items/UI:** Kenney individual packs - clean, consistent, CC0
4. **Gap-fill:** itch.io CC0 searches for specific needs

### License Considerations

| License | Attribution Required | Derivative Works | Commercial OK |
|---------|---------------------|------------------|---------------|
| CC0 | No | Yes | Yes |
| CC-BY | Yes | Yes | Yes |
| CC-BY-SA | Yes | Must share alike | Yes |
| GPL | Yes | Must open source | Yes |

**For Reckoning:** CC0 and CC-BY are ideal. CC-BY-SA is fine for assets we don't modify. GPL may require open-sourcing derivative sprites.

### Option B: Commission Custom Pack

Have an artist create a unified pack designed for this system:
- Consistent style across all assets
- Designed for palette swapping
- Clear zone maps for recoloring
- Modular character parts

**Pros:** Perfect fit, unique look
**Cons:** Cost ($500-2000), time (weeks)

### Option C: Hybrid (Recommended)

Start with LPC + Hyptosis + Kenney, commission:
- Unique frames/overlays for our "theater" system
- Expression overlays that work across LPC bases
- Custom props for common archetypes

## LPC Integration Strategy

### Two-Tier Approach

1. **Pre-generated Library** - Cover common archetypes upfront
2. **Runtime Composition** - Generate on-demand for edge cases

### Tier 1: Pre-generated Character Library

Generate 100-200 character sprites covering common combinations:

```
archetypes/
├── warriors/
│   ├── human_male_warrior_light.png
│   ├── human_male_warrior_dark.png
│   ├── human_female_warrior_light.png
│   ├── dwarf_male_warrior_01.png
│   └── ...
├── mages/
│   ├── elf_male_mage_01.png
│   ├── human_female_mage_01.png
│   └── ...
├── rogues/
├── nobles/
├── commoners/
└── creatures/
```

**Coverage matrix:**

| Dimension | Options | Count |
|-----------|---------|-------|
| Race | Human, Elf, Dwarf, Orc | 4 |
| Gender | Male, Female | 2 |
| Class | Warrior, Mage, Rogue, Noble, Commoner | 5 |
| Skin tone | Light, Medium, Dark | 3 |
| Hair | Varied per archetype | ~3 |

**Total:** ~200 pre-generated sprites covering most casting needs.

**Metadata per sprite:**
```json
{
  "id": "human_male_warrior_light_01",
  "race": "human",
  "gender": "male",
  "archetype": "warrior",
  "skinTone": "light",
  "hair": "brown_short",
  "equipment": ["chainmail", "sword"],
  "tags": ["fighter", "soldier", "guard", "hero", "everyman"],
  "mood": ["determined", "brave", "stoic"]
}
```

### Tier 2: Runtime Composition (Edge Cases)

When no pre-generated sprite fits, compose on-demand using LPC layers.

**Server-side with Sharp:**

```typescript
// packages/server/src/services/sprite-generator.ts

import sharp from 'sharp';
import path from 'path';

interface CharacterSpec {
  body: 'male' | 'female';
  skinTone: 'light' | 'medium' | 'dark' | 'green' | 'blue';
  hair?: { style: string; color: string };
  armor?: { type: string; color?: string };
  weapon?: string;
  accessories?: string[];
}

const LPC_ROOT = path.join(__dirname, '../../../assets/lpc-layers');

export async function generateCharacterSprite(spec: CharacterSpec): Promise<Buffer> {
  // Build layer stack (order matters - bottom to top)
  const layers: string[] = [];

  // Base body
  layers.push(`${LPC_ROOT}/body/${spec.body}/${spec.skinTone}.png`);

  // Hair (optional)
  if (spec.hair) {
    layers.push(`${LPC_ROOT}/hair/${spec.hair.style}/${spec.hair.color}.png`);
  }

  // Armor (optional)
  if (spec.armor) {
    layers.push(`${LPC_ROOT}/armor/${spec.armor.type}/${spec.armor.color ?? 'steel'}.png`);
  }

  // Weapon (optional)
  if (spec.weapon) {
    layers.push(`${LPC_ROOT}/weapons/${spec.weapon}.png`);
  }

  // Composite all layers
  let composite = sharp(layers[0]);
  for (const layer of layers.slice(1)) {
    composite = composite.composite([{ input: layer, blend: 'over' }]);
  }

  return composite.png().toBuffer();
}
```

**When to use runtime generation:**
- AI requests a combination not in pre-generated library
- User creates custom character in future character editor
- Specific equipment/color combinations needed

### LPC Asset Setup

**Step 1:** Clone LPC assets
```bash
git clone https://github.com/LiberatedPixelCup/Universal-LPC-Spritesheet-Character-Generator.git
cp -r Universal-LPC-Spritesheet-Character-Generator/spritesheets assets/lpc-layers/
```

**Step 2:** Organize layers
```
assets/lpc-layers/
├── body/
│   ├── male/
│   │   ├── light.png
│   │   ├── dark.png
│   │   └── ...
│   └── female/
├── hair/
│   ├── long/
│   ├── short/
│   ├── mohawk/
│   └── ...
├── armor/
│   ├── leather/
│   ├── chainmail/
│   ├── plate/
│   └── ...
├── weapons/
│   ├── sword.png
│   ├── bow.png
│   └── ...
└── accessories/
```

**Step 3:** Generate pre-built library using a script
```typescript
// scripts/generate-archetype-library.ts
const ARCHETYPES = [
  { race: 'human', gender: 'male', class: 'warrior', ... },
  { race: 'human', gender: 'female', class: 'warrior', ... },
  // ... 200 combinations
];

for (const archetype of ARCHETYPES) {
  const sprite = await generateCharacterSprite(archetypeToSpec(archetype));
  await fs.writeFile(`assets/archetypes/${archetype.id}.png`, sprite);
  manifest.push({ id: archetype.id, ...archetype.metadata });
}
```

### AI Selection Flow

```
1. AI analyzes character from WorldSeed
   "Hans Gruber analog - elegant, villainous, elf"

2. Search pre-generated library
   Query: race=elf, archetype=noble, mood=villainous
   Result: elf_male_noble_dark_01

3. If no match → runtime generate
   Spec: { body: 'male', skinTone: 'pale', hair: { style: 'long', color: 'black' }, ... }

4. Apply palette shift for mood
   Shift: cool_villain preset

5. Return final sprite
```

## Technical Implementation

### Asset Loading

```typescript
class AssetPack {
  private manifest: AssetManifest;
  private cache: Map<string, HTMLImageElement>;

  async loadManifest(): Promise<void>;

  getCharacter(id: string): CharacterAsset;
  getLocation(id: string): LocationAsset;
  getOverlay(id: string): OverlayAsset;

  // Apply palette shift to cached image
  applyPalette(assetId: string, shift: PaletteShift): HTMLCanvasElement;

  // Composite character with overlays
  composeCharacter(casting: CharacterCasting): HTMLCanvasElement;
}
```

### Palette Shifting (Canvas-based)

```typescript
function applyPaletteShift(
  source: HTMLImageElement,
  shift: PaletteShift
): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d')!;

  canvas.width = source.width;
  canvas.height = source.height;
  ctx.drawImage(source, 0, 0);

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;

  for (let i = 0; i < data.length; i += 4) {
    // Convert RGB to HSL
    const [h, s, l] = rgbToHsl(data[i], data[i+1], data[i+2]);

    // Apply shifts
    const newH = (h + (shift.hueShift ?? 0)) % 360;
    const newS = Math.min(1, Math.max(0, s * (shift.saturation ?? 1)));
    const newL = Math.min(1, Math.max(0, l * (shift.brightness ?? 1)));

    // Convert back
    const [r, g, b] = hslToRgb(newH, newS, newL);
    data[i] = r;
    data[i+1] = g;
    data[i+2] = b;
  }

  ctx.putImageData(imageData, 0, 0);
  return canvas;
}
```

## Creative Examples

### Die Hard → Dwarven Stronghold

| Source | Asset Selection | Modifications |
|--------|-----------------|---------------|
| John McClane | `dwarf_warrior_03` | Gritty palette, no armor, barefoot prop |
| Hans Gruber | `elf_noble_02` | Villain frame, smirking expression, rich burgundy |
| Nakatomi Plaza | `castle_treasury_01` | Gold tint, torchlight overlay |
| Ventilation shafts | `mine_tunnel_02` | Claustrophobic crop, dust overlay |

### Princess Bride → Swashbuckler Fantasy

| Source | Asset Selection | Modifications |
|--------|-----------------|---------------|
| Westley | `human_male_rogue_01` | Hero frame, black palette, mysterious overlay |
| Inigo Montoya | `human_male_duelist_01` | Determined expression, warm heroic palette |
| Fire Swamp | `swamp_01` + `fire_overlay` | Danger lighting, green-orange palette |

### The Office → Dungeon Comedy

| Source | Asset Selection | Modifications |
|--------|-----------------|---------------|
| Michael Scott | `human_male_noble_01` | Comedic frame, confused expression, ill-fitting crown |
| Dwight | `human_male_guard_02` | Overly serious, farming tool prop |
| Dunder Mifflin | `castle_office_01` | Mundane lighting, beige palette |

## Open Questions

1. **Asset count:** How many sprites do we need for good coverage? 50? 200?
2. **Style direction:** Pixel art? Vector? Hand-drawn?
3. **Animation:** Static only, or simple 2-frame animations?
4. **Zone mapping:** How detailed should palette zones be?
5. **AI model:** Should asset selection be a separate (cheaper) AI call, or part of world seeding?

## Success Criteria

- [ ] Asset pack covers 90%+ of common fantasy archetypes
- [ ] AI can creatively map any pop culture source to assets
- [ ] Palette shifting produces visually distinct results
- [ ] Load time under 500ms for full scene
- [ ] Fallback is visually acceptable (not embarrassing)
- [ ] Artists can extend pack without code changes
