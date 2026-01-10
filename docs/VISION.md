---
title: "The Reckoning: Product Vision"
type: vision
status: active
created: 2026-01-10
updated: 2026-01-10
authors:
  - human
related:
  - ./plan/README.md
tags:
  - vision
  - game-design
  - ai
  - rpg
---

# The Reckoning: Product Vision

## Vision Statement

**"You are not who you think you are, and you will be judged by who you actually became."**

A GenAI-powered tabletop RPG that synthesizes the improvisational freedom of human dungeon mastering with persistent, meaningful consequences. Every action is remembered, interpreted differently by everyone who witnessed it, and will eventually be used to judge who you truly are.

---

## Core Innovation: Why This Game Couldn't Exist Before

Traditional video game RPGs offer branching choices, but they're predetermined. Someone wrote every possible outcome. This fundamentally limits the experience.

This game uses generative AI to create something new:
- **Infinite action space**: Players can attempt anything describable in words
- **Non-deterministic interpretation**: The same history can yield different reactions
- **Emergent narrative**: NPCs, consequences, and even antagonists arise organically
- **True judgment**: The game evaluates who you became, not what boxes you checked

---

## The Four Pillars

### Pillar 1: The Unreliable Self

Players don't see objective truth about their character. They see what their character *believes* about themselves.

**How It Works:**
- After each significant event, the player's "Memory Journal" updates
- But this journal is written by an AI roleplaying as the character's biased mind
- The character may remember being brave when they hesitated, or justified when they were cruel

**Memory Distortion Types:**
- `self_aggrandizing`: "I was brave" → reality: you hesitated
- `guilt_suppression`: "They attacked first" → reality: you did
- `trauma_blocking`: "I don't remember" → reality: you do
- `hero_framing`: "I saved them" → reality: they saved themselves
- `villain_projecting`: "They betrayed me" → reality: you betrayed them
- `false_competence`: "I solved it" → reality: luck or others

**Truth Emerges Through Others:**
- NPCs mention events differently than the player remembers
- Party members have their own perspectives
- Physical evidence contradicts the journal
- These "dissonance moments" force the player to confront reality—or deny it

---

### Pillar 2: History as Text, Meaning as Inference

**No metrics. No mercy counters. No reputation numbers.**

Instead, everything is recorded as narrative text and interpreted at query-time by AI.

**The Architecture:**

```
Events occur
     │
     ▼
┌─────────────────────────────────────────┐
│         CANONICAL EVENT LOG             │
│  Raw facts, no interpretation           │
│  "Player drew sword. Merchant stepped   │
│   back. Player took 40 gold."           │
└─────────────────────────────────────────┘
     │
     ▼
┌─────────────────────────────────────────┐
│         PERSPECTIVE LAYERS              │
│                                         │
│  NPC View: "Robbed at swordpoint"       │
│  Party View: "Efficient, if cold"       │
│  Player View: "Negotiated firmly"       │
│  Narrator: "Shadow methods..."          │
└─────────────────────────────────────────┘
     │
     ▼
┌─────────────────────────────────────────┐
│      QUERY-TIME INTERPRETATION          │
│                                         │
│  "How would this merchant react?"       │
│  "What scenario challenges this player?"│
│  AI processes history → generates answer│
└─────────────────────────────────────────┘
```

**Why This Matters:**
- New mechanics can be added by asking new questions—no code changes
- The world feels alive because it doesn't react mechanically
- Nuance is preserved: "reluctant mercy" ≠ "eager mercy"
- Extensible to scenarios we haven't imagined yet

---

### Pillar 3: The Pattern Engine (Psychological Targeting)

The game learns YOUR tendencies and designs scenarios to challenge them specifically.

**What It Tracks (via text analysis, not metrics):**
- Decision patterns: Do you spare enemies? Trust quickly? Choose violence first?
- Psychological profile: Who are you attached to? What do you avoid? What are you proud of?
- Meta patterns: Exploration style, dialogue exhaustiveness

**How It Uses Patterns:**

| Pattern Detected | Challenge Generated |
|------------------|---------------------|
| Always merciful | Enemy you spared returns stronger; mercy has a body count |
| Never trusts anyone | The suspicious NPC is the only genuine ally |
| Greedy | Wealth offered is cursed/stolen/evidence |
| Attached to NPC X | NPC X faces moral compromise |
| Avoids caves (fear) | Critical path goes through caves |
| Proud of combat | Enemy can only be outwitted, not fought |

**Critical Design:** The engine also generates scenarios where your instinct was *correct*. You can't simply learn "never show mercy." The game teaches that heuristics fail—you must think.

---

### Pillar 4: The Living Chronicle & The Trial

**The Chronicle:**
An AI "historian" writes your adventure as it happens—but from a biased perspective you don't control.

- May be sympathetic, hostile, detached, or mocking
- NPCs in the world hear about you through the Chronicle's lens
- Your reputation precedes you in ways you didn't choose

**The Trial:**
At key moments (end of arcs, endgame), you face judgment:

```
1. CHARGES READ
   Chronicle excerpts vs. your memory (conflicts visible)

2. PROSECUTION
   Hostile NPCs testify
   Pattern evidence: "You ALWAYS do X"

3. DEFENSE
   Call friendly NPCs (if you made any)
   Present your version
   Challenge Chronicle bias

4. CROSS-EXAMINATION
   Question hostile witnesses
   Reveal THEIR unreliable memories

5. VERDICT
   Not guilty/innocent—but "Who are you, really?"
```

**Verdict Archetypes:**
- `the_hero`: Genuine good, even when hard
- `the_well_meaning_fool`: Good intentions, bad outcomes
- `the_pragmatist`: Did what was necessary
- `the_coward`: Avoided hard choices
- `the_hypocrite`: Preached values, violated them
- `the_monster`: Consistently cruel
- `the_mystery`: Contradictory, unreadable
- `the_growth`: Started bad, became good
- `the_fall`: Started good, became bad
- `the_mirror`: Reflected whoever they faced

---

## The Dungeon Master Engine

The heart of the system: interpreting freeform player actions like a human DM.

### Player Input Model

```
┌─────────────────────────────────────────────────────────────┐
│  [Attack]  [Defend]  [Talk]  [Examine]  [Something Else] │
└─────────────────────────────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────┐
│  "I pretend to surrender, then throw sand in the        │
│   guard's eyes while my companion steals his keys"      │
└─────────────────────────────────────────────────────────────┘
```

Pre-selected actions are seeds that can be modified or bypassed entirely.

### The DM Pipeline

```
INTERPRET → VALIDATE → CLARIFY? → RESOLVE → NARRATE → CAPTURE
```

**Stage 1: Interpret**
Parse freeform text into structured intent:
- What are they attempting (may be multiple steps)?
- What's the emotional subtext?
- What assumptions are they making?
- Who/what is involved?

**Stage 2: Validate**
Not "is this allowed" but "what could happen":
- Is this physically possible in the world?
- What skills/capabilities matter?
- What could go wrong? (failure modes)
- What could go exceptionally right?
- How do NPCs and environment factor in?

**Stage 3: Clarify (if needed)**
Sometimes the DM needs more info:
- "You want to convince him—but what's your approach?"
- "There's no sand, but there's straw. Proceed?"

**Stage 4: Resolve**
Roll dice (or equivalent), interpret results narratively:
- Critical success / Strong success / Weak success
- Weak failure / Strong failure / Critical failure
- Results affect the story, not just numbers

**Stage 5: Narrate**
Cinematic moment-by-moment breakdown:
- What happens
- Who perceives it
- Why it matters

**Stage 6: Capture**
Record canonical event + generate all perspectives for history.

---

### Handling Impossible Actions

The DM Engine doesn't just say "no"—it redirects creatively:

**Player:** "I cast fireball at the guard"
*(Player has no magic)*

**Response:**
```
You don't have arcane training—but you're looking to create chaos with fire?

The torch on the wall is within reach. Straw is everywhere.
This place would go up fast—though you'd be in it too.

You could:
- Grab the torch and throw it
- Kick straw toward the flame
- Threaten to start a fire (bluff)
- Something else?
```

---

## Data Architecture

### Core Types

```typescript
// The atomic unit: something happened
interface CanonicalEvent {
  id: string;
  timestamp: GameTimestamp;
  location: string;
  actions: Action[];           // Raw facts
  witnesses: string[];         // Who can have perspectives
  circumstances: string;       // Context
}

// Perspectives are text, not metrics
interface Perspective {
  eventId: string;
  perspectiveHolder: string;   // NPC, "narrator", "player"
  account: string;             // Their version
  emotionalColor: string;
  focusedOn: string[];
  overlooked: string[];
  interpretation: string;
}

// Query the history at runtime
interface HistoryQuery {
  question: string;
  relevantHistory: string[];
  perspectives: string[];
  purpose: string;
}
```

### Example: One Event, Multiple Truths

**Canonical Event:**
> Player threw gold at bandits and fled. Child was left behind. Bandits released her.

**Bandit's Perspective:**
> "A coward. Threw gold in the mud and ran. Left a child. I've seen desperate—this was just weak."

**Child's Perspective:**
> "The tall one was scared. They dropped so much gold. Then they ran. But the bad men let me go. I kept some gold. Mama got medicine."

**Player's Self-Narrative:**
> "Tactical retreat. Bought our escape. Everyone got out."

**Chronicle:**
> "Gold scattered like stars falling into mud. The hero's boots found speed they'd never shown in battle. Behind them, a child stood alone."

---

## Technical Stack

### Recommended: Web + TypeScript

| Criteria | Why It Matters |
|----------|----------------|
| LLM code familiarity | TypeScript has massive training data—fewer hallucinations |
| Testing maturity | Vitest + Playwright = comprehensive coverage |
| Headless execution | CI/CD friendly |
| Type safety | Interfaces act as contracts for AI-generated code |
| Modularity | Clean separation for parallel development |

### Stack Components

```
Rendering:        PixiJS or Phaser 3
Language:         TypeScript (strict mode)
Build:            Vite
Unit Tests:       Vitest
Integration:      Vitest
E2E:              Playwright
State:            Zustand or plain TS
API Layer:        Isolated service classes
```

### Project Structure

```
src/
├── core/                    # Pure logic, 100% testable
│   ├── types.ts
│   ├── grid.ts
│   ├── dice.ts
│   └── turn.ts
│
├── services/                # Side effects, mockable
│   ├── dm-engine.ts         # The DM interpretation pipeline
│   ├── history.service.ts   # Event/perspective storage
│   ├── ai.service.ts        # Claude API wrapper
│   └── tts.service.ts
│
├── entities/
│   ├── character.ts
│   ├── player.ts
│   └── npc.ts
│
├── ui/
│   ├── board.ts
│   ├── dialogue.ts
│   └── action-input.ts
│
└── __tests__/
```

---

## Proof of Concept Milestones

| Milestone | Deliverable | Verification |
|-----------|-------------|--------------|
| M1 | Grid + movement | Unit tests, type-safe |
| M2 | Freeform action input + interpretation | DM engine parses intent correctly |
| M3 | Single NPC encounter with AI responses | NPC reacts believably |
| M4 | Perspective generation after events | Multiple views captured |
| M5 | Memory dissonance (player vs. witness) | Contradiction surfaced to player |
| M6 | Pattern detection + targeted scenario | Challenge matches player tendency |
| M7 | Mini-trial at end of chapter | Judgment rendered based on history |
| M8 | TTS integration | Dialogue spoken aloud |

---

## Working Titles

- **The Reckoning**
- **Chronicle of the Accused**
- **Witness**
- **The Unreliable Self**

---

## Open Questions

1. **Multiplayer architecture**: How do forking parties reconcile? Server authority?
2. **Persistence**: How much history before context windows overflow? Summarization?
3. **Balancing challenge**: How to prevent Pattern Engine from feeling unfair?
4. **Onboarding**: How to teach these meta-mechanics without breaking immersion?
5. **Content rating**: How dark can consequences get? Player settings?

---

## Appendix: Key Prompts (To Be Developed)

- Action Interpretation Prompt
- Validation/Possibility Assessment Prompt
- Resolution Narration Prompt
- Perspective Generation Prompt (per perspective type)
- Pattern Analysis Prompt
- Scenario Generation Prompt
- Trial Prosecution/Defense Prompts
- Chronicle Entry Prompt

---

*Document Version: 0.1 - Initial Design*
*Last Updated: January 2026*
