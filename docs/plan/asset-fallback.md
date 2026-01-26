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

### Option A: License Existing Packs

| Source | License | Style | Cost |
|--------|---------|-------|------|
| [Kenney](https://kenney.nl) | CC0 | Clean, simple | Free |
| [LPC](http://lpc.opengameart.org) | CC-BY/GPL | Classic RPG | Free |
| [itch.io bundles](https://itch.io) | Varies | Varied | $5-50 |

**Pros:** Fast, cheap, proven quality
**Cons:** May need multiple packs for coverage, style consistency issues

### Option B: Commission Custom Pack

Have an artist create a unified pack designed for this system:
- Consistent style across all assets
- Designed for palette swapping
- Clear zone maps for recoloring
- Modular character parts

**Pros:** Perfect fit, unique look
**Cons:** Cost ($500-2000), time (weeks)

### Option C: Hybrid

Start with licensed assets, commission gap-fills and unifying elements.

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
