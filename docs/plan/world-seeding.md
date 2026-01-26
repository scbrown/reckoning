# Pop Culture World Seeding

## Goal

Enable world generation seeded from pop culture references, allowing the DM to create games *inspired by* movies, books, TV shows, games, or historical events through an **interactive research session**.

**Example:** "Create a game inspired by Die Hard" produces:
- Setting: Modern high-rise under siege
- NPCs: Charismatic villain, resourceful allies, hostages
- Themes: Cat-and-mouse, one-against-many, confined space tension
- Pixel art: 80s action movie aesthetic

## Key Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Research implementation | WebSearch/WebFetch in world gen flow | Direct, no separate agent infrastructure |
| AI model | Haiku via Claude Code CLI | Fast, cost-effective for research/extraction |
| Pixel art model | Opus (out of scope for now) | Higher quality needed for visual generation |
| Error handling | Stop and alert DM with details | No silent failures, DM can course-correct |
| Caching | Out of scope | Simplify initial implementation |
| DM interaction | **Interactive session** | DM monitors, steers, and prompts during research |

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
- **DM control** - Interactive steering, not black-box generation

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    INTERACTIVE WORLD SEEDING FLOW                            │
│                                                                              │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │                     DM SEEDING INTERFACE                             │   │
│   │                                                                      │   │
│   │  Prompt: [Create a game inspired by Die Hard, set in a fantasy     ]│   │
│   │          [world. Include Hans Gruber as the main villain.          ]│   │
│   │                                                                      │   │
│   │  Reference URLs (optional):                                          │   │
│   │  [https://en.wikipedia.org/wiki/Die_Hard                           ]│   │
│   │  [https://villains.fandom.com/wiki/Hans_Gruber                     ]│   │
│   │                                                                      │   │
│   │  Pre-defined elements (optional):                                    │   │
│   │  Characters: [John McClane - player character, barefoot warrior    ]│   │
│   │  Areas:      [Nakatomi Tower Lobby, Executive Floor, Roof         ]│   │
│   │                                                                      │   │
│   │                              [Begin Research →]                      │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                                      │                                       │
│                                      ▼                                       │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │              INTERACTIVE RESEARCH SESSION                            │   │
│   │                                                                      │   │
│   │  ┌─────────────────────────────────────────────────────────────┐    │   │
│   │  │ Research Progress                              [ETA: ~2 min] │    │   │
│   │  │ ████████████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░  35%          │    │   │
│   │  └─────────────────────────────────────────────────────────────┘    │   │
│   │                                                                      │   │
│   │  Live Research Log:                                                  │   │
│   │  ┌─────────────────────────────────────────────────────────────┐    │   │
│   │  │ ✓ Searching for "Die Hard movie plot characters"...         │    │   │
│   │  │ ✓ Found Wikipedia article, fetching...                       │    │   │
│   │  │ ✓ Extracted 8 characters from source                         │    │   │
│   │  │ → Searching for "Die Hard filming locations Nakatomi"...     │    │   │
│   │  │                                                              │    │   │
│   │  └─────────────────────────────────────────────────────────────┘    │   │
│   │                                                                      │   │
│   │  DM Course Correction:                                               │   │
│   │  ┌─────────────────────────────────────────────────────────────┐    │   │
│   │  │ [Skip the FBI characters, focus more on the terrorists     ]│    │   │
│   │  │                                              [Send Guidance]│    │   │
│   │  └─────────────────────────────────────────────────────────────┘    │   │
│   │                                                                      │   │
│   │  Extracted So Far:                                                   │   │
│   │  Characters: John McClane, Hans Gruber, Holly, Karl, Argyle         │   │
│   │  Locations: Lobby, Executive Floor, Vault, Roof                      │   │
│   │  Themes: Christmas, one-man-army, cat-and-mouse                      │   │
│   │                                                                      │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                                      │                                       │
│                                      ▼                                       │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │                    SEED REVIEW & EDIT                                │   │
│   │                                                                      │   │
│   │  DM reviews extracted data, makes final edits before generation     │   │
│   │                                                                      │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                                      │                                       │
│                                      ▼                                       │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │                    WORLD GENERATION                                  │   │
│   │                                                                      │   │
│   │  Transform seed → Game entities (areas, NPCs, scenes)               │   │
│   │  Progress indicator + ETA                                            │   │
│   │                                                                      │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

## DM Input Model

The DM provides a **prompt** plus optional structured inputs:

```typescript
interface WorldSeedRequest {
  // Required: Natural language prompt
  prompt: string;
  // "Create a game inspired by Die Hard, set in a fantasy world.
  //  Hans Gruber should be the main villain. Make it darker than
  //  the original movie."

  // Optional: Reference URLs the DM already knows are useful
  referenceUrls?: string[];

  // Optional: Pre-defined characters (DM has specific ideas)
  predefinedCharacters?: {
    name: string;
    description: string;
    role?: 'player' | 'ally' | 'villain' | 'neutral';
  }[];

  // Optional: Pre-defined areas
  predefinedAreas?: {
    name: string;
    description: string;
  }[];

  // Optional: Constraints
  constraints?: {
    maxCharacters?: number;
    maxAreas?: number;
    excludeElements?: string[];  // "no FBI", "no romantic subplot"
  };
}
```

## Interactive Research Session

### Core Concept

The research phase is **not a black box**. The DM watches it happen and can steer:

1. **Progress visibility** - See what's being searched/fetched
2. **Live extraction** - See characters/locations as they're found
3. **Course correction** - Send guidance mid-research
4. **Early termination** - "That's enough, proceed to generation"

### Implementation: SSE-Driven Research

```typescript
// Server-side research session
class ResearchSession {
  private gameId: string;
  private sseChannel: SSEChannel;
  private claudeCLI: ClaudeCodeCLI;
  private dmGuidance: string[] = [];
  private extractedData: PartialWorldSeed = { characters: [], locations: [], themes: [] };

  async start(request: WorldSeedRequest): Promise<void> {
    this.emit('status', { phase: 'starting', message: 'Beginning research...' });

    try {
      // Phase 1: Initial search
      await this.searchPhase(request);

      // Phase 2: Fetch and extract
      await this.extractionPhase();

      // Phase 3: Synthesis
      await this.synthesisPhase();

      this.emit('complete', { seed: this.extractedData });
    } catch (error) {
      this.emit('error', {
        message: 'Research encountered an issue',
        details: error.message,
        recoverable: this.isRecoverable(error),
        partialData: this.extractedData,
      });
    }
  }

  // DM sends guidance mid-research
  async receiveGuidance(guidance: string): Promise<void> {
    this.dmGuidance.push(guidance);
    this.emit('guidance_received', { guidance });

    // Incorporate into next AI call
    // "DM guidance: Skip the FBI characters, focus more on the terrorists"
  }

  private emit(event: string, data: any): void {
    this.sseChannel.send({
      type: `research:${event}`,
      data,
      timestamp: new Date().toISOString(),
    });
  }
}
```

### SSE Event Types

```typescript
type ResearchEvent =
  | { type: 'research:status'; data: { phase: string; message: string; progress: number; eta?: string } }
  | { type: 'research:search'; data: { query: string; status: 'starting' | 'complete' | 'failed' } }
  | { type: 'research:fetch'; data: { url: string; status: 'starting' | 'complete' | 'failed' } }
  | { type: 'research:extraction'; data: { type: 'character' | 'location' | 'theme'; items: any[] } }
  | { type: 'research:guidance_received'; data: { guidance: string } }
  | { type: 'research:error'; data: { message: string; details: string; recoverable: boolean } }
  | { type: 'research:complete'; data: { seed: WorldSeed } };
```

### Progress Estimation

```typescript
interface ResearchProgress {
  phase: 'search' | 'fetch' | 'extract' | 'synthesize';
  currentStep: number;
  totalSteps: number;
  percentComplete: number;
  estimatedTimeRemaining: string;  // "~2 min", "< 1 min"
}

function estimateProgress(session: ResearchSession): ResearchProgress {
  // Rough estimates based on typical research
  const phases = {
    search: { weight: 0.2, avgDuration: 10 },    // 10 seconds
    fetch: { weight: 0.4, avgDuration: 30 },     // 30 seconds
    extract: { weight: 0.3, avgDuration: 45 },   // 45 seconds
    synthesize: { weight: 0.1, avgDuration: 15 }, // 15 seconds
  };
  // ... calculate based on current phase and steps
}
```

## Research Implementation

### Using Claude Code CLI (Haiku)

```typescript
import { ClaudeCodeCLI } from '../services/ai/claude-cli.js';

class WorldSeedingResearcher {
  private cli: ClaudeCodeCLI;

  constructor() {
    this.cli = new ClaudeCodeCLI({ model: 'haiku' });
  }

  async search(query: string, dmPrompt: string, guidance: string[]): Promise<SearchResult[]> {
    const prompt = `
You are researching source material for a tabletop RPG world.

DM's request: ${dmPrompt}

${guidance.length > 0 ? `DM guidance during research:\n${guidance.map(g => `- ${g}`).join('\n')}` : ''}

Search for: ${query}

Use WebSearch to find relevant information about this source material.
Focus on: characters, locations, plot elements, themes, and visual style.
`;

    const result = await this.cli.execute(prompt, {
      tools: ['WebSearch'],
      maxTurns: 3,
    });

    return this.parseSearchResults(result);
  }

  async fetchAndExtract(url: string, extractionFocus: string): Promise<ExtractedContent> {
    const prompt = `
Fetch the content from: ${url}

Extract the following for a tabletop RPG:
- Characters (name, role, description, personality traits)
- Locations (name, description, atmosphere)
- Themes and tone
- Visual style cues (era, aesthetic, colors)

Focus on: ${extractionFocus}

Return structured JSON.
`;

    const result = await this.cli.execute(prompt, {
      tools: ['WebFetch'],
      maxTurns: 2,
    });

    return this.parseExtraction(result);
  }

  async synthesize(
    extracted: ExtractedContent[],
    dmPrompt: string,
    predefined: { characters?: any[]; areas?: any[] }
  ): Promise<WorldSeed> {
    const prompt = `
Synthesize this research into a coherent world seed for a tabletop RPG.

DM's vision: ${dmPrompt}

Research findings:
${JSON.stringify(extracted, null, 2)}

${predefined.characters ? `DM pre-defined these characters:\n${JSON.stringify(predefined.characters)}` : ''}
${predefined.areas ? `DM pre-defined these areas:\n${JSON.stringify(predefined.areas)}` : ''}

Create a WorldSeed JSON that:
1. Honors the DM's vision and pre-defined elements
2. Incorporates the best of the research
3. Creates a coherent, playable world
4. Includes visual style guidance for pixel art generation

Return valid JSON matching the WorldSeed schema.
`;

    const result = await this.cli.execute(prompt, {
      maxTurns: 1,
    });

    return this.parseSeed(result);
  }
}
```

### Error Handling

```typescript
interface ResearchError {
  phase: 'search' | 'fetch' | 'extract' | 'synthesize';
  message: string;
  details: string;
  recoverable: boolean;
  suggestedAction?: string;
}

function handleResearchError(error: Error, phase: string): ResearchError {
  // Classify error and provide actionable feedback to DM
  if (error.message.includes('rate limit')) {
    return {
      phase,
      message: 'Search rate limit reached',
      details: 'Too many searches in a short time',
      recoverable: true,
      suggestedAction: 'Wait 30 seconds and try again, or provide direct URLs',
    };
  }

  if (error.message.includes('not found') || error.message.includes('404')) {
    return {
      phase,
      message: 'Source material not found',
      details: `Could not find information about this topic`,
      recoverable: true,
      suggestedAction: 'Try a more specific query or provide reference URLs',
    };
  }

  // Generic error
  return {
    phase,
    message: 'Research encountered an issue',
    details: error.message,
    recoverable: false,
    suggestedAction: 'Try again or proceed with partial data',
  };
}
```

## Seed Data Structure

```typescript
interface WorldSeed {
  // Metadata
  id: string;
  sourceQuery: string;           // DM's original prompt
  sourceTitle?: string;          // Identified primary source (e.g., "Die Hard (1988)")
  sourceType: 'movie' | 'book' | 'tv_series' | 'game' | 'historical' | 'original' | 'mashup';
  createdAt: string;

  // Characters (merged: extracted + DM pre-defined)
  characters: SeedCharacter[];

  // Locations (merged: extracted + DM pre-defined)
  locations: SeedLocation[];

  // Narrative elements
  themes: string[];
  tone: {
    overall: 'dark' | 'light' | 'comedic' | 'dramatic' | 'horror' | 'adventure';
    description: string;
  };
  plotBeats?: PlotBeat[];  // Optional story structure hints

  // Visual style for pixel art
  visualStyle: {
    era: string;           // "1980s", "medieval", "futuristic"
    aesthetic: string;     // "action movie", "noir", "whimsical"
    colorPalette: string[];
    lightingMood: string;
  };

  // For AI context during gameplay
  contextSummary: string;  // 500-word summary

  // DM modifications
  dmNotes?: string;
}

interface SeedCharacter {
  id: string;
  name: string;
  originalName?: string;  // If inspired by source character
  role: 'player' | 'ally' | 'villain' | 'neutral' | 'comic_relief';
  description: string;
  suggestedTraits: string[];  // Map to Reckoning trait system
  suggestedClass?: string;
  visualDescription: string;  // For pixel art
  relationships?: {
    targetId: string;
    type: 'ally' | 'enemy' | 'neutral' | 'complex';
  }[];
  isPreDefined: boolean;  // DM specified vs extracted
}

interface SeedLocation {
  id: string;
  name: string;
  originalName?: string;
  description: string;
  mood: string;
  tags: string[];
  connectedTo: string[];  // Other location IDs
  visualDescription: string;
  isPreDefined: boolean;
}
```

## API Design

### Endpoints

```
POST /api/game/:gameId/seed/start
  Body: WorldSeedRequest
  Returns: { sessionId: string }
  Starts interactive research session

POST /api/game/:gameId/seed/guidance
  Body: { sessionId: string, guidance: string }
  Returns: { received: true }
  Send DM course correction

POST /api/game/:gameId/seed/stop
  Body: { sessionId: string, proceed: boolean }
  Returns: { seed?: WorldSeed }
  Stop research early (proceed=true uses partial data)

GET /api/game/:gameId/seed/status
  Returns: ResearchProgress
  Poll for progress (backup if SSE fails)

POST /api/game/:gameId/seed/finalize
  Body: { sessionId: string, modifications?: Partial<WorldSeed> }
  Returns: { seed: WorldSeed }
  Finalize seed with optional DM edits

POST /api/game/:gameId/generate-from-seed
  Body: { seedId: string }
  Returns: { success: true }
  Trigger world generation from finalized seed
```

### SSE Endpoint

```
GET /api/game/:gameId/seed/events?sessionId=xxx
  Returns: SSE stream of ResearchEvent
```

## Database Schema

```sql
-- Research sessions (temporary, cleaned up after completion)
CREATE TABLE research_sessions (
  id TEXT PRIMARY KEY,
  game_id TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'active',  -- 'active', 'complete', 'failed', 'cancelled'
  request TEXT NOT NULL,      -- JSON WorldSeedRequest
  partial_seed TEXT,          -- JSON partial extraction
  dm_guidance TEXT,           -- JSON array of guidance strings
  error_details TEXT,         -- JSON error info if failed
  started_at TEXT DEFAULT (datetime('now')),
  completed_at TEXT
);

-- Finalized seeds (kept for reference)
CREATE TABLE world_seeds (
  id TEXT PRIMARY KEY,
  game_id TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  source_query TEXT NOT NULL,
  seed_data TEXT NOT NULL,    -- JSON WorldSeed
  created_at TEXT DEFAULT (datetime('now'))
);
```

## UI Components

### SeedingInterface Component

```typescript
// packages/client/src/components/world-seeding/seeding-interface.ts

export class SeedingInterface {
  private promptInput: HTMLTextAreaElement;
  private urlInputs: HTMLInputElement[];
  private characterInputs: CharacterInput[];
  private areaInputs: AreaInput[];
  private progressPanel: ProgressPanel;
  private guidanceInput: HTMLTextAreaElement;
  private extractedDataView: ExtractedDataView;

  // Start research session
  async startResearch(): Promise<void> {
    const request = this.buildRequest();
    const { sessionId } = await this.api.startSeedResearch(this.gameId, request);

    // Connect to SSE for live updates
    this.connectToResearchEvents(sessionId);
    this.showProgressPanel();
  }

  // Send guidance mid-research
  async sendGuidance(): Promise<void> {
    const guidance = this.guidanceInput.value;
    await this.api.sendSeedGuidance(this.gameId, this.sessionId, guidance);
    this.guidanceInput.value = '';
    this.addToGuidanceLog(guidance);
  }

  // Handle SSE events
  private handleResearchEvent(event: ResearchEvent): void {
    switch (event.type) {
      case 'research:status':
        this.progressPanel.update(event.data);
        break;
      case 'research:extraction':
        this.extractedDataView.addItems(event.data.type, event.data.items);
        break;
      case 'research:error':
        this.showError(event.data);
        break;
      case 'research:complete':
        this.showSeedReview(event.data.seed);
        break;
    }
  }
}
```

### ProgressPanel Component

```typescript
export class ProgressPanel {
  render(): HTMLElement {
    return html`
      <div class="research-progress">
        <div class="progress-header">
          <span class="phase">${this.phase}</span>
          <span class="eta">${this.eta}</span>
        </div>
        <div class="progress-bar">
          <div class="progress-fill" style="width: ${this.percent}%"></div>
        </div>
        <div class="progress-log">
          ${this.logEntries.map(entry => html`
            <div class="log-entry ${entry.status}">
              ${entry.status === 'complete' ? '✓' : entry.status === 'failed' ? '✗' : '→'}
              ${entry.message}
            </div>
          `)}
        </div>
      </div>
    `;
  }
}
```

## Flow Summary

```
1. DM creates party (existing flow)
          │
          ▼
2. DM opens World Seeding interface
   - Writes prompt describing desired world
   - Optionally adds reference URLs
   - Optionally pre-defines characters/areas
          │
          ▼
3. DM clicks "Begin Research"
   - Server starts ResearchSession
   - SSE connection established
          │
          ▼
4. Interactive Research Phase
   - DM sees live progress
   - DM sees extracted data as it's found
   - DM can send guidance to steer research
   - DM can stop early if satisfied
          │
          ▼
5. Seed Review
   - DM reviews complete WorldSeed
   - DM can edit/remove characters and locations
   - DM can adjust themes and visual style
          │
          ▼
6. World Generation
   - Transform seed → game entities
   - Create areas, NPCs, initial scenes
   - (Pixel art generation - future scope)
          │
          ▼
7. Game Ready
```

## Open Questions (Resolved)

| Question | Resolution |
|----------|------------|
| Research depth | DM controls via guidance and early stop |
| Caching | Out of scope for v1 |
| Error handling | Stop and alert DM with details |
| Model choice | Haiku for research, Opus for pixelsrc (later) |
| UX flow | Interactive session with live monitoring |

## Success Criteria

- [ ] DM can provide prompt + optional URLs + optional pre-defined elements
- [ ] Research session shows live progress via SSE
- [ ] DM can send guidance mid-research and see it acknowledged
- [ ] DM can stop research early and proceed with partial data
- [ ] Errors show clear message and suggested action
- [ ] Finalized seed can be edited before generation
- [ ] World generation uses seed to create themed game entities
- [ ] Works for movies, books, TV shows, games, and historical events
