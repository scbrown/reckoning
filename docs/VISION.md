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
  - ./plan/phase-2-dm-engine.md
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

## The Player as Dungeon Master

**The human player takes on the role of Dungeon Master**, guiding the story with AI assistance. This inverts the traditional CRPG model:

```
┌─────────────────────────────────────────────────────────────┐
│                      GAMEPLAY LOOP                           │
│                                                              │
│   ┌──────────┐    ┌──────────┐    ┌──────────┐             │
│   │    AI    │───▶│    DM    │───▶│ Narrator │             │
│   │ Generates│    │  Edits   │    │ Presents │             │
│   └──────────┘    └──────────┘    └──────────┘             │
│        ▲               │               │                    │
│        │               │               ▼                    │
│        │          [regenerate]    [TTS plays]              │
│        │               │               │                    │
│        └───────────────┴───────────────┘                    │
│                   (next cycle)                              │
└─────────────────────────────────────────────────────────────┘
```

### Roles

| Role | Controller | Responsibilities |
|------|------------|------------------|
| **Dungeon Master** | Human Player | Reviews AI content, edits/rewrites, approves for presentation |
| **AI Assistant** | Claude | Generates story, party actions, NPC dialogue, world responses |
| **Narrator** | TTS Voice | Presents DM-approved content aloud |
| **Party Members** | Hybrid | AI suggests actions, DM can override or inject |

### The Event Loop

1. **AI Generates**: Story beats, party member actions, NPC responses, environment events
2. **DM Reviews**: Human reviews in editor panel, can:
   - Accept as-is
   - Edit/rewrite (full control)
   - Request regeneration (with optional feedback)
   - Inject original content
3. **DM Submits**: Content becomes canonical, recorded to history
4. **Narrator Presents**: TTS plays approved content, UI updates
5. **Loop Continues**: AI generates next content based on new state

### Why This Model?

- **Human creativity preserved**: DM shapes the story, AI assists
- **Quality control**: Nothing enters the narrative without DM approval
- **Collaborative storytelling**: Best of human imagination + AI generation
- **The Four Pillars still apply**: But to the party characters, not the player

---

## Core Innovation: Why This Game Couldn't Exist Before

Traditional video game RPGs offer branching choices, but they're predetermined. Someone wrote every possible outcome. This fundamentally limits the experience.

This game uses generative AI to create something new:
- **Infinite action space**: Party members can attempt anything describable in words
- **Non-deterministic interpretation**: The same history can yield different reactions
- **Emergent narrative**: NPCs, consequences, and even antagonists arise organically
- **True judgment**: The game evaluates who the party became, not what boxes they checked
- **DM as curator**: Human guides the story, AI handles the generation burden

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

> **Implementation Status:** Partially implemented. Pattern detection exists via `PatternObserver` (mercy ratio, honesty, violence tendency) and `EmergenceObserver` (villain/ally emergence). Scenario generation that actively targets patterns is NOT yet implemented.

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

> **Implementation Status:** NOT implemented. The Chronicle narrator bias system and Trial judgment mechanics are future work. Current implementation focuses on structured events and scene management, which provide the data foundation these systems would use.

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

## The AI Content Engine

The heart of the system: generating narrative content for the human DM to review and approve.

### Content Generation Types

The AI generates different types of content based on game state:

| Type | Description | Example |
|------|-------------|---------|
| `scene_description` | Setting the scene, atmosphere | "The tavern door creaks open, revealing..." |
| `party_action` | What party members do | "Kira draws her dagger and moves toward the door" |
| `party_dialogue` | What party members say | "'Did anyone else hear that?' Kira whispers" |
| `npc_response` | NPC reactions and speech | "The bartender sets down her glass slowly" |
| `environment_event` | World events, sounds, weather | "A cold wind rushes through the open door" |

### The Generation Pipeline

```
CONTEXT → GENERATE → REVIEW → EDIT? → SUBMIT → NARRATE → CAPTURE
```

**Stage 1: Context**
Gather state for generation:
- Current scene and location
- Party member states and positions
- Recent event history
- NPC states and dispositions
- DM guidance (optional hints)

**Stage 2: Generate**
AI produces suggested content:
- Narrative text for the moment
- Suggested speaker (for TTS role)
- Potential follow-up actions

**Stage 3: Review**
Human DM sees generated content in editor panel.

**Stage 4: Edit (Optional)**
DM can:
- Accept as-is
- Rewrite partially or completely
- Request regeneration with feedback
- Inject entirely original content

**Stage 5: Submit**
DM approves → content becomes canonical.

**Stage 6: Narrate**
TTS narrator speaks the approved content aloud.

**Stage 7: Capture**
Record canonical event + witnesses for history system.

---

### DM Controls

The human DM has full editorial control:

```
┌─────────────────────────────────────────────────────────────┐
│  AI suggests: "Marcus steps forward, hand on his sword     │
│  hilt. 'I'll check it out,' he says with false bravado."  │
└─────────────────────────────────────────────────────────────┘
     │
     ├── [Accept] → Use as-is
     ├── [Edit] → Modify in editor, then submit
     ├── [Regenerate] → Ask AI to try again (with optional feedback)
     └── [Inject] → Write original content instead
```

The DM shapes the story. The AI handles the generation burden.

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

*Document Version: 0.2 - Player as DM Model*
*Last Updated: January 2026*
