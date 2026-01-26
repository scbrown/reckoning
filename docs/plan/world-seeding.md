# Pop Culture World Seeding

## Goal

Enable world generation seeded from pop culture references, allowing the DM to create games *inspired by* movies, books, TV shows, games, or historical events through **Claude Code as the research agent**.

**Example:** DM types: "Create a game inspired by Die Hard, but set in a fantasy dwarven stronghold. Hans Gruber should be an elegant elf villain."

Claude Code researches, synthesizes, and outputs a structured WorldSeed for world generation.

## Key Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Research agent | Claude Code subprocess | Full autonomy, handles research strategy itself |
| DM input | Unstructured prompt | Natural language, no forms or JSON |
| AI model | Haiku via Claude Code | Fast, cost-effective |
| Progress visibility | Stream Claude Code console to web UI | Simple, transparent, DM sees everything |
| DM guidance | Type into Claude Code session | Same interface as prompting Claude Code directly |
| Haiku research visibility | DM sees Haiku's research in console, can course-correct | Same transparency applies to all AI work |
| Output | Structured WorldSeed JSON | Parsed by Reckoning for world generation |

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         WORLD SEEDING FLOW                                   │
│                                                                              │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │                     DM SEEDING INTERFACE                             │   │
│   │                                                                      │   │
│   │  ┌───────────────────────────────────────────────────────────────┐  │   │
│   │  │ Create a game inspired by Die Hard, but set in a fantasy      │  │   │
│   │  │ dwarven stronghold. Hans Gruber should be an elegant elf      │  │   │
│   │  │ villain trying to steal the mountain's dragon hoard.          │  │   │
│   │  │                                                                │  │   │
│   │  │ Make the player character a retired dwarven guard who's       │  │   │
│   │  │ just visiting for a feast when the siege begins.              │  │   │
│   │  └───────────────────────────────────────────────────────────────┘  │   │
│   │                                                                      │   │
│   │                         [Begin Research →]                           │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                                      │                                       │
│                                      ▼                                       │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │                 CLAUDE CODE RESEARCH SESSION                         │   │
│   │                                                                      │   │
│   │  ┌───────────────────────────────────────────────────────────────┐  │   │
│   │  │ $ claude --model haiku                                         │  │   │
│   │  │                                                                │  │   │
│   │  │ I'll research Die Hard to understand the key elements and     │  │   │
│   │  │ then adapt them to a fantasy setting...                       │  │   │
│   │  │                                                                │  │   │
│   │  │ [WebSearch: "Die Hard 1988 movie plot characters"]            │  │   │
│   │  │                                                                │  │   │
│   │  │ Found Wikipedia article. Key elements:                         │  │   │
│   │  │ - John McClane: Everyman hero, wrong place wrong time         │  │   │
│   │  │ - Hans Gruber: Sophisticated villain, heist mastermind        │  │   │
│   │  │ - Nakatomi Plaza: Confined vertical space                     │  │   │
│   │  │ - Christmas Eve setting                                        │  │   │
│   │  │ ...                                                            │  │   │
│   │  │                                                                │  │   │
│   │  │ [DM can type here to guide/redirect]                          │  │   │
│   │  │ > Also include Argyle the limo driver as comic relief         │  │   │
│   │  │                                                                │  │   │
│   │  │ Good idea! I'll adapt Argyle as a mine cart driver...         │  │   │
│   │  └───────────────────────────────────────────────────────────────┘  │   │
│   │                                                                      │   │
│   │  [Stop & Use Partial] [Cancel]                                       │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                                      │                                       │
│                                      ▼                                       │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │                    CLAUDE CODE OUTPUTS WORLDSEED                     │   │
│   │                                                                      │   │
│   │  ```json                                                             │   │
│   │  {                                                                   │   │
│   │    "sourceInspiration": "Die Hard (1988)",                          │   │
│   │    "setting": "Khazad-dum style dwarven stronghold",                │   │
│   │    "characters": [...],                                              │   │
│   │    "locations": [...],                                               │   │
│   │    "themes": ["one-against-many", "confined-space", "heist"],       │   │
│   │    "visualStyle": {...}                                              │   │
│   │  }                                                                   │   │
│   │  ```                                                                 │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                                      │                                       │
│                                      ▼                                       │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │                    RECKONING WORLD GENERATION                        │   │
│   │                                                                      │   │
│   │  Parse WorldSeed JSON → Create game entities                        │   │
│   │  - Areas from locations                                              │   │
│   │  - NPCs from characters                                              │   │
│   │  - Initial scenes from themes                                        │   │
│   │                                                                      │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

## How It Works

### 1. DM Writes a Prompt

Just natural language. No forms. No structured input. Examples:

- "Create a game inspired by Die Hard"
- "I want a noir detective story like Chinatown meets Blade Runner"
- "Base it on the War of the Roses, but with dragons"
- "Something like The Office but in a dungeon, comedic tone"

### 2. Server Spawns Claude Code

```typescript
// Simplified - actual implementation in claude-cli.ts
const session = spawn('claude', [
  '--model', 'haiku',
  '--allowedTools', 'WebSearch,WebFetch',
  '-p', buildResearchPrompt(dmPrompt),
]);

// Stream stdout/stderr to SSE
session.stdout.on('data', (data) => {
  sseChannel.send({ type: 'console', data: data.toString() });
});
```

### 3. Claude Code Does Research

Given the system prompt (see below), Claude Code:
1. Searches for source material
2. Extracts relevant elements
3. Adapts to DM's requirements
4. Synthesizes into WorldSeed

### 4. DM Can Interact

The web UI shows Claude Code's console output in real-time. The DM can:
- Watch the research happen
- Type additional guidance (sent as follow-up prompts)
- Stop early and use partial results
- Cancel entirely

### 5. Claude Code Outputs WorldSeed JSON

When done, Claude Code outputs a structured JSON block that Reckoning parses:

```json
{
  "$schema": "worldseed-v1",
  "sourceInspiration": "Die Hard (1988)",
  "characters": [...],
  "locations": [...],
  ...
}
```

### 6. Reckoning Generates World

The existing world generation flow takes the WorldSeed and creates game entities.

## System Prompt for Claude Code

```
You are a world-building research assistant for a tabletop RPG called Reckoning.

The Dungeon Master has asked you to create a game world inspired by source material.
Your job is to:

1. RESEARCH the source material using WebSearch and WebFetch
   - Find plot summaries, character descriptions, key locations
   - Understand themes, tone, and visual style
   - Note distinctive elements that make the source memorable

2. ADAPT the source material to the DM's requirements
   - The DM may want changes (different setting, tone, characters)
   - Honor their creative vision while keeping the source's essence
   - Transform copyrighted elements into inspired-by equivalents

3. SYNTHESIZE into a WorldSeed
   - Characters with roles, descriptions, and suggested traits
   - Locations with descriptions, moods, and connections
   - Themes and tone for the AI narrator
   - Visual style hints for pixel art generation

4. OUTPUT valid JSON matching this schema:

```json
{
  "$schema": "worldseed-v1",
  "sourceInspiration": "string - what inspired this",
  "setting": "string - one-line setting description",
  "tone": {
    "overall": "dark|light|comedic|dramatic|horror|adventure",
    "description": "string - tone guidance for AI"
  },
  "characters": [
    {
      "name": "string",
      "role": "player|ally|villain|neutral",
      "description": "string",
      "suggestedTraits": ["string"],
      "visualDescription": "string - for pixel art"
    }
  ],
  "locations": [
    {
      "name": "string",
      "description": "string",
      "mood": "string",
      "connectedTo": ["string - other location names"],
      "visualDescription": "string - for pixel art"
    }
  ],
  "themes": ["string"],
  "visualStyle": {
    "era": "string - 1980s, medieval, etc",
    "aesthetic": "string - action movie, noir, etc",
    "colorPalette": ["string - color descriptions"],
    "lightingMood": "string"
  },
  "contextSummary": "string - 200 word summary for AI narrator context"
}
```

Work step by step. Show your research process. The DM is watching and may
provide additional guidance during the session.

When you're done researching and ready to output the WorldSeed, say
"WORLDSEED OUTPUT:" followed by the JSON block.

---

DM's request:
{dmPrompt}
```

## Web UI: Console View

The UI shows Claude Code's console output directly:

```typescript
// packages/client/src/components/world-seeding/research-console.ts

export class ResearchConsole {
  private outputElement: HTMLPreElement;
  private inputElement: HTMLInputElement;
  private eventSource: EventSource;

  constructor(private gameId: string, private sessionId: string) {
    this.outputElement = document.createElement('pre');
    this.outputElement.className = 'research-console-output';

    this.inputElement = document.createElement('input');
    this.inputElement.className = 'research-console-input';
    this.inputElement.placeholder = 'Type to guide research...';
    this.inputElement.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this.sendInput();
    });
  }

  connect(): void {
    this.eventSource = new EventSource(
      `/api/game/${this.gameId}/seed/events?session=${this.sessionId}`
    );

    this.eventSource.onmessage = (event) => {
      const data = JSON.parse(event.data);

      switch (data.type) {
        case 'console':
          this.appendOutput(data.data);
          break;
        case 'worldseed':
          this.handleWorldSeed(data.seed);
          break;
        case 'error':
          this.showError(data.message);
          break;
        case 'complete':
          this.handleComplete();
          break;
      }
    };
  }

  private appendOutput(text: string): void {
    this.outputElement.textContent += text;
    this.outputElement.scrollTop = this.outputElement.scrollHeight;
  }

  private async sendInput(): void {
    const input = this.inputElement.value.trim();
    if (!input) return;

    await fetch(`/api/game/${this.gameId}/seed/input`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: this.sessionId, input }),
    });

    this.inputElement.value = '';
    this.appendOutput(`\n> ${input}\n`);
  }

  render(): HTMLElement {
    const container = document.createElement('div');
    container.className = 'research-console';
    container.appendChild(this.outputElement);
    container.appendChild(this.inputElement);
    return container;
  }
}
```

## Server Implementation

### Spawning Claude Code Session

```typescript
// packages/server/src/services/world-seeding/research-session.ts

import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';

export class ResearchSession extends EventEmitter {
  private process: ChildProcess | null = null;
  private outputBuffer: string = '';

  constructor(
    private sessionId: string,
    private gameId: string
  ) {
    super();
  }

  async start(dmPrompt: string): Promise<void> {
    const systemPrompt = buildResearchSystemPrompt(dmPrompt);

    this.process = spawn('claude', [
      '--model', 'haiku',
      '--allowedTools', 'WebSearch,WebFetch',
      '-p', systemPrompt,
    ]);

    this.process.stdout?.on('data', (data) => {
      const text = data.toString();
      this.outputBuffer += text;
      this.emit('console', text);

      // Check for WorldSeed output
      this.checkForWorldSeed();
    });

    this.process.stderr?.on('data', (data) => {
      this.emit('console', data.toString());
    });

    this.process.on('close', (code) => {
      if (code === 0) {
        this.emit('complete');
      } else {
        this.emit('error', `Process exited with code ${code}`);
      }
    });
  }

  async sendInput(input: string): Promise<void> {
    // Send input to Claude Code's stdin
    this.process?.stdin?.write(input + '\n');
  }

  stop(): void {
    this.process?.kill('SIGTERM');
  }

  private checkForWorldSeed(): void {
    const marker = 'WORLDSEED OUTPUT:';
    const markerIndex = this.outputBuffer.indexOf(marker);

    if (markerIndex !== -1) {
      const jsonStart = this.outputBuffer.indexOf('{', markerIndex);
      const jsonEnd = this.findJsonEnd(this.outputBuffer, jsonStart);

      if (jsonEnd !== -1) {
        const jsonStr = this.outputBuffer.slice(jsonStart, jsonEnd + 1);
        try {
          const seed = JSON.parse(jsonStr);
          this.emit('worldseed', seed);
        } catch (e) {
          this.emit('error', 'Failed to parse WorldSeed JSON');
        }
      }
    }
  }

  private findJsonEnd(str: string, start: number): number {
    let depth = 0;
    for (let i = start; i < str.length; i++) {
      if (str[i] === '{') depth++;
      if (str[i] === '}') depth--;
      if (depth === 0) return i;
    }
    return -1;
  }
}
```

### API Routes

```typescript
// packages/server/src/routes/seed.ts

const sessions = new Map<string, ResearchSession>();

// Start research session
app.post('/api/game/:gameId/seed/start', async (req, res) => {
  const { gameId } = req.params;
  const { prompt } = req.body;

  const sessionId = generateId();
  const session = new ResearchSession(sessionId, gameId);
  sessions.set(sessionId, session);

  session.start(prompt);

  res.json({ sessionId });
});

// SSE endpoint for console output
app.get('/api/game/:gameId/seed/events', (req, res) => {
  const { session: sessionId } = req.query;
  const session = sessions.get(sessionId as string);

  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const onConsole = (data: string) => {
    res.write(`data: ${JSON.stringify({ type: 'console', data })}\n\n`);
  };

  const onWorldSeed = (seed: any) => {
    res.write(`data: ${JSON.stringify({ type: 'worldseed', seed })}\n\n`);
  };

  const onError = (message: string) => {
    res.write(`data: ${JSON.stringify({ type: 'error', message })}\n\n`);
  };

  const onComplete = () => {
    res.write(`data: ${JSON.stringify({ type: 'complete' })}\n\n`);
    cleanup();
    res.end();
  };

  session.on('console', onConsole);
  session.on('worldseed', onWorldSeed);
  session.on('error', onError);
  session.on('complete', onComplete);

  const cleanup = () => {
    session.off('console', onConsole);
    session.off('worldseed', onWorldSeed);
    session.off('error', onError);
    session.off('complete', onComplete);
  };

  req.on('close', cleanup);
});

// Send DM input to session
app.post('/api/game/:gameId/seed/input', async (req, res) => {
  const { sessionId, input } = req.body;
  const session = sessions.get(sessionId);

  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }

  await session.sendInput(input);
  res.json({ sent: true });
});

// Stop session
app.post('/api/game/:gameId/seed/stop', (req, res) => {
  const { sessionId } = req.body;
  const session = sessions.get(sessionId);

  if (session) {
    session.stop();
    sessions.delete(sessionId);
  }

  res.json({ stopped: true });
});
```

## WorldSeed Schema

```typescript
interface WorldSeed {
  $schema: 'worldseed-v1';

  // What inspired this world
  sourceInspiration: string;

  // One-line setting
  setting: string;

  // Tone guidance
  tone: {
    overall: 'dark' | 'light' | 'comedic' | 'dramatic' | 'horror' | 'adventure';
    description: string;
  };

  // Characters to create
  characters: {
    name: string;
    role: 'player' | 'ally' | 'villain' | 'neutral';
    description: string;
    suggestedTraits: string[];
    visualDescription: string;
  }[];

  // Locations to create
  locations: {
    name: string;
    description: string;
    mood: string;
    connectedTo: string[];
    visualDescription: string;
  }[];

  // Theme tags
  themes: string[];

  // Visual style for pixel art (future)
  visualStyle: {
    era: string;
    aesthetic: string;
    colorPalette: string[];
    lightingMood: string;
  };

  // Context for AI narrator
  contextSummary: string;
}
```

## Database Schema

```sql
-- Store completed seeds for reference
CREATE TABLE world_seeds (
  id TEXT PRIMARY KEY,
  game_id TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  dm_prompt TEXT NOT NULL,           -- Original DM prompt
  seed_data TEXT NOT NULL,           -- JSON WorldSeed
  research_log TEXT,                 -- Full console output (optional)
  created_at TEXT DEFAULT (datetime('now'))
);
```

## Flow Summary

```
1. DM writes natural language prompt
        │
        ▼
2. Server spawns Claude Code with research system prompt
        │
        ▼
3. Claude Code console streams to web UI
   - DM watches research happen
   - DM can type additional guidance
        │
        ▼
4. Claude Code outputs "WORLDSEED OUTPUT:" + JSON
        │
        ▼
5. Server parses WorldSeed, triggers world generation
        │
        ▼
6. Game entities created from seed
```

## Future Enhancements (Out of Scope)

- **Progress reporting tools**: Give Claude Code tools to report structured progress
- **Seed editing UI**: Let DM edit the parsed WorldSeed before generation
- **Seed library**: Save and reuse seeds across games
- **Pixel art integration**: Pass visualStyle to pixelsrc generator

## Success Criteria

- [ ] DM can type natural language prompt to start research
- [ ] Claude Code console streams to web UI in real-time
- [ ] DM can type additional guidance during research
- [ ] DM can stop research early
- [ ] Claude Code outputs valid WorldSeed JSON
- [ ] WorldSeed is parsed and used for world generation
- [ ] Works for movies, books, TV shows, games, historical events
