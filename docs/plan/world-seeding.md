# Pop Culture World Seeding

## Goal

Enable world generation seeded from pop culture references, allowing players to create games *inspired by* movies, books, TV shows, games, or historical events.

**Example:** "Create a game inspired by Die Hard" produces:
- Setting: Modern high-rise under siege
- NPCs: Charismatic villain, resourceful allies, hostages
- Themes: Cat-and-mouse, one-against-many, confined space tension
- Pixel art: 80s action movie aesthetic

## Why This Matters

Current world generation creates generic fantasy worlds. This limits:
- Player engagement (generic = forgettable)
- Narrative coherence (no shared reference points)
- AI context (lacks rich source material)
- Pixel art direction (no visual theme)

Pop culture seeding provides:
- **Instant familiarity** - Players know the vibe immediately
- **Rich context** - AI has deep source material to draw from
- **Thematic consistency** - Characters, settings, and plots align
- **Visual identity** - Pixel art has clear direction
- **Mashup potential** - "Die Hard meets Lord of the Rings"

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         WORLD CREATION FLOW                                  │
│                                                                              │
│   User Input                                                                 │
│   "Create a game inspired by Die Hard"                                       │
│            │                                                                 │
│            ▼                                                                 │
│   ┌─────────────────────────────────────────┐                               │
│   │         RESEARCH AGENT PHASE            │                               │
│   │                                          │                               │
│   │  1. WebSearch for source material        │                               │
│   │  2. WebFetch detailed pages              │                               │
│   │  3. Extract structured data:             │                               │
│   │     - Characters & archetypes            │                               │
│   │     - Settings & locations               │                               │
│   │     - Plot structure & beats             │                               │
│   │     - Themes & tone                      │                               │
│   │     - Visual style cues                  │                               │
│   │                                          │                               │
│   └─────────────────┬───────────────────────┘                               │
│                     │                                                        │
│                     ▼                                                        │
│   ┌─────────────────────────────────────────┐                               │
│   │          SEED DATA STRUCTURE            │                               │
│   │                                          │                               │
│   │  {                                       │                               │
│   │    source: "Die Hard (1988)",           │                               │
│   │    characters: [...],                   │                               │
│   │    locations: [...],                    │                               │
│   │    themes: [...],                       │                               │
│   │    visualStyle: {...}                   │                               │
│   │  }                                       │                               │
│   └─────────────────┬───────────────────────┘                               │
│                     │                                                        │
│                     ▼                                                        │
│   ┌─────────────────────────────────────────┐                               │
│   │    (Optional) USER REVIEW & EDIT        │                               │
│   │                                          │                               │
│   │  "Keep Hans Gruber, remove FBI agents,  │                               │
│   │   add a dragon"                          │                               │
│   │                                          │                               │
│   └─────────────────┬───────────────────────┘                               │
│                     │                                                        │
│                     ▼                                                        │
│   ┌─────────────────────────────────────────┐                               │
│   │        WORLD GENERATOR PHASE            │                               │
│   │                                          │                               │
│   │  Transform seed into game entities:      │                               │
│   │  - Characters → Party members            │                               │
│   │  - Locations → Areas with exits          │                               │
│   │  - Archetypes → NPCs with traits         │                               │
│   │  - Themes → Scene templates              │                               │
│   │  - Style → Pixel art prompts             │                               │
│   │                                          │                               │
│   └─────────────────┬───────────────────────┘                               │
│                     │                                                        │
│                     ▼                                                        │
│   ┌─────────────────────────────────────────┐                               │
│   │        PIXELSRC GENERATION              │                               │
│   │                                          │                               │
│   │  Generate with source context:           │                               │
│   │  - Character portraits (era-appropriate) │                               │
│   │  - Location backgrounds (themed)         │                               │
│   │  - Objects and props                     │                               │
│   │                                          │                               │
│   └─────────────────────────────────────────┘                               │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Research Agent Design

### Input Parsing

```typescript
interface SeedRequest {
  // Primary source
  primary: string;  // "Die Hard"

  // Optional modifiers
  mashup?: string;  // "meets Lord of the Rings"
  era?: string;     // "set in medieval times"
  tone?: string;    // "darker" | "comedic" | "romantic"

  // Constraints
  excludeCharacters?: string[];
  includeCharacters?: string[];
  focusOn?: 'characters' | 'setting' | 'plot';
}
```

### Research Strategy

```typescript
async function researchSource(source: string): Promise<SourceMaterial> {
  // 1. Initial search to understand what we're dealing with
  const searchResults = await webSearch(`${source} plot characters setting overview`);

  // 2. Identify authoritative sources
  const sources = identifySources(searchResults);
  // Prefer: Wikipedia, IMDB, fan wikis, official sites

  // 3. Fetch and extract from each source
  const materials = await Promise.all(
    sources.map(url => webFetch(url, extractionPrompt))
  );

  // 4. Synthesize into structured data
  return synthesizeMaterials(materials);
}
```

### Extraction Prompts

```typescript
const CHARACTER_EXTRACTION_PROMPT = `
Extract characters from this content. For each character provide:
- name: Full name
- role: protagonist, antagonist, ally, neutral, comic_relief
- archetype: hero, villain, mentor, trickster, guardian, etc.
- description: Physical and personality summary
- relationships: Key relationships to other characters
- traits: Personality traits that would translate to game traits
- visualCues: Distinctive visual features for pixel art
`;

const LOCATION_EXTRACTION_PROMPT = `
Extract key locations/settings from this content. For each provide:
- name: Location name
- type: indoor, outdoor, vehicle, etc.
- description: Physical description
- mood: Atmosphere and feeling
- significance: Why this location matters to the plot
- connections: How it connects to other locations
- visualCues: Key visual elements for pixel art
`;

const THEME_EXTRACTION_PROMPT = `
Extract themes and tone from this content:
- primaryThemes: Main thematic elements
- tone: Overall mood (dark, light, comedic, dramatic, etc.)
- era: Time period and aesthetic
- genre: Genre classification
- conflictTypes: Types of conflict (person vs person, etc.)
- narrativeStructure: How the story typically unfolds
`;
```

## Seed Data Structure

```typescript
interface WorldSeed {
  // Metadata
  sourceTitle: string;
  sourceType: 'movie' | 'book' | 'tv_series' | 'game' | 'historical' | 'original';
  sourceYear?: number;
  researchedAt: string;

  // Characters
  characters: SeedCharacter[];

  // Locations
  locations: SeedLocation[];

  // Narrative
  themes: string[];
  tone: ToneProfile;
  plotBeats: PlotBeat[];

  // Visual
  visualStyle: VisualStyle;

  // For AI context
  contextSummary: string;  // 500-word summary for AI prompts
}

interface SeedCharacter {
  name: string;
  originalName: string;  // Keep track of source
  role: CharacterRole;
  archetype: string;
  description: string;

  // Map to Reckoning systems
  suggestedTraits: string[];
  suggestedClass?: string;

  // Relationships to other seed characters
  relationships: {
    targetName: string;
    type: 'ally' | 'enemy' | 'neutral' | 'complex';
    description: string;
  }[];

  // For pixel art
  visualDescription: string;
  distinctiveFeatures: string[];
}

interface SeedLocation {
  name: string;
  originalName: string;
  type: 'area' | 'region' | 'building' | 'room';
  description: string;
  mood: string;
  tags: string[];

  // Connections
  connectedTo: string[];

  // For pixel art
  visualDescription: string;
  palette: string[];  // Suggested colors
}

interface VisualStyle {
  era: string;           // "1980s", "medieval", "futuristic"
  aesthetic: string;     // "action movie", "noir", "whimsical"
  colorPalette: string[];
  lightingMood: string;  // "harsh", "soft", "neon", "natural"
  references: string[];  // Visual references for pixel art
}
```

## World Generator Integration

### Transformation Layer

```typescript
async function transformSeedToWorld(seed: WorldSeed): Promise<WorldGenParams> {
  return {
    // Context for all AI generation
    thematicContext: seed.contextSummary,

    // Party generation
    partyTemplate: {
      size: determinePartySize(seed),
      roles: mapCharactersToRoles(seed.characters),
      // Player character inspired by protagonist
      playerInspiration: seed.characters.find(c => c.role === 'protagonist'),
    },

    // NPC generation
    npcTemplates: seed.characters
      .filter(c => c.role !== 'protagonist')
      .map(c => ({
        inspiration: c,
        traits: c.suggestedTraits,
        disposition: c.role === 'antagonist' ? 'hostile' : 'neutral',
      })),

    // Area generation
    areaTemplates: seed.locations.map(loc => ({
      inspiration: loc,
      tags: loc.tags,
      mood: loc.mood,
    })),

    // Scene templates from plot beats
    initialScenes: seed.plotBeats.map(beat => ({
      name: beat.name,
      type: beat.type,
      mood: beat.mood,
      stakes: beat.stakes,
    })),

    // Pixel art context
    visualContext: seed.visualStyle,
  };
}
```

### AI Prompt Enhancement

```typescript
function buildContextWithSeed(baseContext: string, seed: WorldSeed): string {
  return `
${baseContext}

## Source Material Context

This game is inspired by "${seed.sourceTitle}". Key elements to maintain:

### Tone and Theme
${seed.tone.description}
Themes: ${seed.themes.join(', ')}

### Character Dynamics
${seed.characters.map(c => `- ${c.name}: ${c.archetype} - ${c.description}`).join('\n')}

### Setting Atmosphere
${seed.visualStyle.aesthetic} aesthetic, ${seed.visualStyle.era} era
Mood: ${seed.visualStyle.lightingMood}

When generating content, maintain consistency with these elements while allowing
for player agency and emergent narrative. The source material is inspiration,
not a script to follow.
`;
}
```

## Mashup Support

### Combining Sources

```typescript
async function researchMashup(
  primary: string,
  secondary: string
): Promise<WorldSeed> {
  // Research both sources
  const [seed1, seed2] = await Promise.all([
    researchSource(primary),
    researchSource(secondary),
  ]);

  // Combine intelligently
  return {
    sourceTitle: `${primary} meets ${secondary}`,
    sourceType: 'original',

    // Blend characters - map archetypes across sources
    characters: blendCharacters(seed1.characters, seed2.characters),

    // Combine settings - primary setting with secondary elements
    locations: blendLocations(seed1.locations, seed2.locations),

    // Merge themes
    themes: [...new Set([...seed1.themes, ...seed2.themes])],

    // Blend visual styles
    visualStyle: blendVisualStyles(seed1.visualStyle, seed2.visualStyle),

    // Generate new context summary
    contextSummary: await generateMashupContext(seed1, seed2),
  };
}
```

**Example mashup: "Die Hard meets Lord of the Rings"**
- Setting: Dwarven mountain stronghold under siege
- Villain: Elegant elf crime lord (Hans Gruber archetype)
- Hero: Off-duty ranger (John McClane archetype)
- Stakes: Dragon hoard instead of bearer bonds
- Tone: Action movie pacing in fantasy setting

## Pixel Art Integration

### Enhanced Prompts

```typescript
function buildPixelArtPrompt(
  entity: Character | Location,
  seed: WorldSeed
): string {
  const style = seed.visualStyle;

  return `
Generate pixel art for: ${entity.name}

Visual Style Context:
- Era: ${style.era}
- Aesthetic: ${style.aesthetic}
- Color palette: ${style.colorPalette.join(', ')}
- Lighting: ${style.lightingMood}

${entity.visualDescription}

Distinctive features to include:
${entity.distinctiveFeatures?.map(f => `- ${f}`).join('\n') || 'None specified'}

Reference: This character/location is inspired by ${seed.sourceTitle}.
Capture the essence while making it work as ${style.aesthetic} pixel art.
`;
}
```

## Database Changes

### New Tables

```sql
-- Store researched source material for reuse
CREATE TABLE world_seeds (
  id TEXT PRIMARY KEY,
  source_query TEXT NOT NULL,        -- Original user query
  source_title TEXT NOT NULL,        -- Identified source
  source_type TEXT NOT NULL,         -- movie, book, etc.
  seed_data TEXT NOT NULL,           -- JSON WorldSeed
  researched_at TEXT DEFAULT (datetime('now')),
  UNIQUE(source_query)
);

CREATE INDEX idx_world_seeds_title ON world_seeds(source_title);

-- Track which games used which seeds
CREATE TABLE game_seeds (
  game_id TEXT PRIMARY KEY REFERENCES games(id) ON DELETE CASCADE,
  seed_id TEXT NOT NULL REFERENCES world_seeds(id),
  customizations TEXT,  -- JSON of user modifications
  created_at TEXT DEFAULT (datetime('now'))
);

-- Cache research results to avoid repeated lookups
CREATE TABLE research_cache (
  url_hash TEXT PRIMARY KEY,
  url TEXT NOT NULL,
  content TEXT NOT NULL,
  extracted_data TEXT,  -- JSON extracted content
  fetched_at TEXT DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL
);
```

## API Design

### New Endpoints

```
POST /api/seed/research
  Body: { query: "Die Hard", mashup?: "Lord of the Rings" }
  Returns: WorldSeed (or job ID for async)

GET /api/seed/:id
  Returns: WorldSeed

POST /api/seed/:id/customize
  Body: { modifications: {...} }
  Returns: Modified WorldSeed

POST /api/game/create-from-seed
  Body: { seedId: "xxx", options: {...} }
  Returns: Game

GET /api/seed/popular
  Returns: List of commonly used seeds
```

## UI Flow

### New Game Creation

```
┌─────────────────────────────────────────────────────────────────┐
│                    CREATE NEW GAME                               │
│                                                                  │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │ What inspires your game?                                   │  │
│  │                                                            │  │
│  │ [Die Hard                                        ] [Search]│  │
│  │                                                            │  │
│  │ Optional: Mashup with...                                   │  │
│  │ [Lord of the Rings                               ]         │  │
│  │                                                            │  │
│  │ Or choose from popular seeds:                              │  │
│  │ [Star Wars] [The Matrix] [Game of Thrones] [Sherlock]     │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                  │
│                        [Research →]                              │
└─────────────────────────────────────────────────────────────────┘

        ↓ (after research completes)

┌─────────────────────────────────────────────────────────────────┐
│                    REVIEW SEED DATA                              │
│                                                                  │
│  Source: Die Hard (1988)                                         │
│                                                                  │
│  Characters Found:                               [Edit]          │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │ ☑ John McClane (protagonist) - NYC cop, resourceful     │    │
│  │ ☑ Hans Gruber (antagonist) - Elegant villain            │    │
│  │ ☑ Holly Gennaro (ally) - Hostage, estranged wife        │    │
│  │ ☐ Agent Johnson (neutral) - FBI agent (excluded)        │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                  │
│  Locations Found:                                [Edit]          │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │ ☑ Nakatomi Plaza Lobby                                   │    │
│  │ ☑ Executive Floor                                        │    │
│  │ ☑ Ventilation Ducts                                      │    │
│  │ ☑ Rooftop                                                │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                  │
│  Visual Style: 1980s action movie, corporate setting             │
│  Themes: One-man-army, cat-and-mouse, Christmas                  │
│                                                                  │
│            [← Back]              [Generate World →]              │
└─────────────────────────────────────────────────────────────────┘
```

## Legal & Ethical Considerations

### Copyright Notice

- Generated content is *inspired by*, not copied from sources
- Character names can be changed to avoid direct copying
- Users should understand this is transformative use
- No copyrighted text is stored verbatim

### Content Filtering

```typescript
interface ContentFilter {
  // Exclude certain types of source material
  excludedCategories: string[];  // e.g., "adult", "hate_content"

  // Age-appropriate filtering
  maxRating: 'G' | 'PG' | 'PG-13' | 'R';

  // Real-person exclusions
  excludeRealPeople: boolean;
}
```

## Open Questions

1. **Research depth**: How many sources to fetch? Trade-off: quality vs speed
2. **Caching strategy**: How long to cache research? Popular sources could be pre-cached
3. **User editing**: How much can users modify seeds before it defeats the purpose?
4. **Mashup limits**: Allow 3+ sources? Gets complex fast
5. **Original content**: Support "like Die Hard but original" mode?
6. **Spoiler handling**: What if user hasn't seen the source? Warn about spoilers?

## Success Criteria

- [ ] Research agent extracts meaningful data from 3+ source types (movie, book, game)
- [ ] Generated worlds feel thematically consistent with source
- [ ] Pixel art reflects source material's visual style
- [ ] Mashups produce coherent combined worlds
- [ ] User can customize seed before generation
- [ ] Research results are cached for reuse
- [ ] Works for obscure sources (not just blockbusters)
