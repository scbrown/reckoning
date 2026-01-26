# Game Intro Scene

## Goal

Create a cinematic introduction sequence that sets the tone, introduces key characters, and immerses players in the world seed's atmosphere before gameplay begins.

**Inspiration:** Movie title sequences, JRPG chapter intros, visual novel openings

## When It Plays

```
World Seeding Complete
        │
        ▼
┌───────────────────┐
│   INTRO SCENE     │  ← 30-60 seconds
│   (skippable)     │
└───────────────────┘
        │
        ▼
   Game Begins
```

The intro serves as a polished "loading screen" while final world generation completes in the background.

## Scene Structure

### Act 1: Title Card (5-10 seconds)

```
┌────────────────────────────────────────────────────────────────┐
│                                                                │
│                                                                │
│                       CHAPTER ONE                              │
│                                                                │
│              ═══════════════════════════                       │
│                "The Siege of Ironhold"                         │
│              ═══════════════════════════                       │
│                                                                │
│                                                                │
│                  Inspired by Die Hard                          │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

**Elements:**
- Chapter number (always "Chapter One" for new games)
- Title (generated from WorldSeed setting/themes)
- Optional "Inspired by" credit line
- Fade in/out transitions
- Background: gradient or blurred location art

**TTS Narration (optional):**
> "Chapter One: The Siege of Ironhold"

### Act 2: Setting Establishment (10-15 seconds)

```
┌────────────────────────────────────────────────────────────────┐
│  ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░  │
│  ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░  │
│  ░░░░░░░░░░░░    IRONHOLD MOUNTAIN    ░░░░░░░░░░░░░░░░░░░░░  │
│  ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░  │
│  ░░░░░░░░░       [Mountain/Fortress Art]      ░░░░░░░░░░░░░  │
│  ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░  │
│  ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░  │
│                                                                │
│   "Deep within the Stonespire Mountains lies Ironhold,        │
│    the greatest dwarven treasury ever built..."                │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

**Elements:**
- Location artwork (from asset pack or pixelsrc)
- Location name overlay
- Scrolling/panning effect on artwork
- Setting description text (from WorldSeed.contextSummary)

**TTS Narration:**
> "Deep within the Stonespire Mountains lies Ironhold, the greatest dwarven treasury ever built. Tonight, during the Festival of the Golden Forge, shadows gather..."

### Act 3: Character Introductions (15-30 seconds)

Each major character gets a brief spotlight:

```
┌────────────────────────────────────────────────────────────────┐
│                                                                │
│                    ┌──────────────┐                            │
│                    │              │                            │
│                    │    ┌────┐    │                            │
│                    │    │ 🧔 │    │   GRUMLI STONEFIST        │
│                    │    └────┘    │   Retired Gate Warden      │
│                    │              │                            │
│                    └──────────────┘                            │
│                                                                │
│     "A dwarf who's seen too many battles, looking for peace.  │
│      But peace, it seems, has no plans for him tonight."       │
│                                                                │
│                         ● ○ ○ ○                                │
└────────────────────────────────────────────────────────────────┘
```

**For each character:**
- Portrait/sprite with frame effect
- Name and role/title
- One-line description (AI-generated from WorldSeed character data)
- Entrance animation (slide in, fade, etc.)
- Dot indicators showing progress through cast

**Character order:**
1. Player character (hero)
2. Key allies
3. Main antagonist (dramatic reveal, different framing)
4. Optional: mysterious figure (silhouette, foreshadowing)

**TTS Narration:**
> "Grumli Stonefist. A dwarf who's seen too many battles, looking for peace. But peace, it seems, has no plans for him tonight."

### Act 4: Hook/Tagline (5-10 seconds)

```
┌────────────────────────────────────────────────────────────────┐
│                                                                │
│                                                                │
│                                                                │
│           "One dwarf. Forty thieves. One night."               │
│                                                                │
│                                                                │
│                      [Begin Adventure]                         │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

**Elements:**
- Dramatic tagline (AI-generated, inspired by source material)
- Call-to-action button
- Optional: key art montage behind text

## Data Model

### IntroScene (generated during world seeding)

```typescript
interface IntroScene {
  // Title card
  chapterTitle: string;           // "The Siege of Ironhold"
  inspiredBy?: string;            // "Die Hard" (optional credit)

  // Setting
  settingName: string;            // "Ironhold Mountain"
  settingDescription: string;     // 2-3 sentences
  settingAsset?: string;          // Asset ID or pixelsrc reference

  // Characters
  characterIntros: CharacterIntro[];

  // Hook
  tagline: string;                // "One dwarf. Forty thieves. One night."

  // Style
  tone: 'epic' | 'mysterious' | 'comedic' | 'dark' | 'whimsical';
  musicCue?: string;              // Future: background music hint
}

interface CharacterIntro {
  name: string;
  title: string;                  // "Retired Gate Warden"
  description: string;            // One-liner
  role: 'hero' | 'ally' | 'villain' | 'mysterious';
  assetId?: string;               // Portrait/sprite reference
  voiceId?: string;               // TTS voice for their intro
}
```

### WorldSeed Extension

```typescript
interface WorldSeed {
  // ... existing fields ...

  introScene?: IntroScene;        // Generated alongside world data
}
```

## AI Generation Prompt Addition

Add to Claude Code research system prompt:

```
After creating the WorldSeed, also create an IntroScene for the game opening.

The intro should:
1. Create a dramatic chapter title that captures the adventure's essence
2. Write a 2-3 sentence setting description for narration
3. Create a one-liner intro for each major character (evocative, not expository)
4. Write a punchy tagline that hooks the player (think movie poster)

Match the tone to the source material:
- Action movie → punchy, dramatic
- Mystery → atmospheric, questions
- Comedy → witty, self-aware
- Horror → dread, foreboding
- Romance → emotional, poetic

Example for Die Hard inspiration:
- Title: "The Siege of Ironhold"
- Setting: "Deep within the Stonespire Mountains lies Ironhold..."
- Hero intro: "A dwarf who's seen too many battles, looking for peace."
- Villain intro: "An elf who believes elegance and cruelty are the same art."
- Tagline: "One dwarf. Forty thieves. One night."
```

## Animation & Transitions

### Transition Effects

| Transition | Use Case | Implementation |
|------------|----------|----------------|
| Fade | Title card in/out | CSS opacity animation |
| Slide | Character intros | CSS transform |
| Ken Burns | Setting image | CSS scale + translate on image |
| Typewriter | Text reveal | Character-by-character with delay |
| Cinematic bars | Letterbox effect | Fixed height black bars top/bottom |

### Timing

```typescript
const INTRO_TIMING = {
  titleCard: {
    fadeIn: 1000,
    hold: 4000,
    fadeOut: 1000,
  },
  setting: {
    imageReveal: 2000,
    textDelay: 1000,
    textDuration: 8000,  // Matches TTS
  },
  character: {
    each: 5000,          // Per character
    transitionBetween: 500,
  },
  tagline: {
    fadeIn: 1000,
    hold: 3000,
  },
  total: 45000,          // ~45 seconds typical
};
```

## UI Components

### IntroScenePlayer

```typescript
class IntroScenePlayer extends EventEmitter {
  private scene: IntroScene;
  private currentAct: number = 0;
  private ttsQueue: TTSQueue;
  private isSkipped: boolean = false;

  constructor(scene: IntroScene, container: HTMLElement) {
    this.scene = scene;
    this.render(container);
  }

  async play(): Promise<void> {
    await this.playTitleCard();
    if (this.isSkipped) return;

    await this.playSetting();
    if (this.isSkipped) return;

    await this.playCharacters();
    if (this.isSkipped) return;

    await this.playTagline();

    this.emit('complete');
  }

  skip(): void {
    this.isSkipped = true;
    this.ttsQueue.stop();
    this.emit('skipped');
  }

  private async playTitleCard(): Promise<void> { /* ... */ }
  private async playSetting(): Promise<void> { /* ... */ }
  private async playCharacters(): Promise<void> { /* ... */ }
  private async playTagline(): Promise<void> { /* ... */ }
}
```

### Skip Behavior

- Press any key or click "Skip" button to skip
- Skip immediately transitions to "Begin Adventure" button
- TTS stops immediately on skip
- Skipping is fine - don't punish players who've seen it

## Integration Points

### With World Seeding

```typescript
// After WorldSeed is complete
const worldSeed = await researchSession.getWorldSeed();

// IntroScene is part of WorldSeed
if (worldSeed.introScene) {
  await playIntroScene(worldSeed.introScene);
}

// Then proceed to game
await createGameFromSeed(worldSeed);
```

### With TTS System

- Queue narration for each act
- Use appropriate voice (narrator voice, not character voices)
- Sync text display with TTS timing
- Stop TTS on skip

### With Asset System

- Resolve asset IDs to actual images
- Apply palette shifts per WorldSeed.visualStyle
- Fallback to silhouettes if assets unavailable

## Examples by Tone

### Epic (Die Hard → Dwarven Heist)

```
Title: "The Siege of Ironhold"
Setting: "Deep within the Stonespire Mountains lies Ironhold, the greatest dwarven treasury ever built. Tonight, during the Festival of the Golden Forge, shadows gather at the gates."
Hero: "A dwarf who's seen too many battles, looking for peace."
Villain: "An elf who believes elegance and cruelty are the same art."
Tagline: "One dwarf. Forty thieves. One night."
```

### Comedic (The Office → Dungeon Bureaucracy)

```
Title: "The Quarterly Performance Review"
Setting: "Welcome to Undermountain Regional, the kingdom's most adequate dungeon management firm. Where dreams go to be filed in triplicate."
Hero: "A middle manager with delusions of leadership and a 'World's Best Boss' tankard."
Ally: "His assistant, who takes dungeon protocol far too seriously."
Tagline: "That's what she said. And by 'she,' we mean the dragon."
```

### Mystery (Knives Out → Manor Murder)

```
Title: "The Last Feast"
Setting: "Ravenshollow Manor has stood for three hundred years. Tonight, one of its secrets will finally be buried—along with someone who knows too much."
Hero: "A detective who asks questions that make the nobility uncomfortable."
Villain: "A family where everyone has a motive, and no one has an alibi."
Tagline: "In this house, the only thing sharper than the knives is the inheritance."
```

### Horror (The Shining → Haunted Keep)

```
Title: "The Long Winter"
Setting: "Frostwatch Keep needs a caretaker for the cold months. The last one didn't make it to spring. Neither did the one before that."
Hero: "A man seeking solitude finds something that's been waiting."
Mystery: "The children who play in empty halls, though no children live here."
Tagline: "Redrum, redrum, redrum."
```

## Success Criteria

- [ ] Intro plays automatically after world seeding
- [ ] All text is TTS-narrated with proper timing
- [ ] Character portraits display (from assets or pixelsrc)
- [ ] Skip works instantly without jarring transition
- [ ] Tone matches WorldSeed (epic/comedic/dark/etc)
- [ ] Total duration under 60 seconds
- [ ] Works on Party View (display-only, auto-plays)
- [ ] Accessible (screen reader announces text content)

## Future Enhancements

- **Background music:** Mood-appropriate ambient music
- **Animated sprites:** Characters with idle animations
- **Parallax backgrounds:** Multiple layers for depth
- **Voice acting:** Different TTS voices per character
- **Recap intros:** "Previously on..." for returning to saved games
- **Custom intros:** DM can edit/reorder intro elements
