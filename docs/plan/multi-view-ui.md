# Multi-View UI Architecture

## Goal

Separate the game display from the control interface, enabling:
- A **Party View** for shared display (the "TV" everyone watches)
- A **DM View** for game control and behind-the-scenes management
- Optional **Player Views** for per-character perspectives

## Why This Matters

The current UI conflates display and control. This causes problems:
- DM controls visible to players break immersion
- No clean "presentation mode" for streaming or group play
- Can't leverage the **Unreliable Self** pillar - everyone sees the same truth

Separating views enables:
- Immersive group experience (clean narration, no chrome)
- DM sees what players can't (hidden traits, true relationships, emergence)
- Per-player views show subjective reality (their character's perspective)
- Better streaming/recording (Group View is broadcast-ready)

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              GAME SESSION                                    │
│                                                                              │
│   ┌─────────────────┐   ┌─────────────────┐   ┌─────────────────┐          │
│   │   PARTY VIEW    │   │    DM VIEW      │   │  PLAYER VIEWS   │          │
│   │   /view/party   │   │   /view/dm      │   │ /view/player/:id│          │
│   ├─────────────────┤   ├─────────────────┤   ├─────────────────┤          │
│   │ Display-only    │   │ Full control    │   │ Character POV   │          │
│   │ No controls     │   │ All approvals   │   │ Filtered info   │          │
│   │ TTS output      │   │ Hidden state    │   │ Subjective view │          │
│   │ Avatars/scenes  │   │ Beat editing    │   │ Personal notes  │          │
│   └────────┬────────┘   └────────┬────────┘   └────────┬────────┘          │
│            │                     │                     │                    │
│            └─────────────────────┼─────────────────────┘                    │
│                                  │                                          │
│                    ┌─────────────┴─────────────┐                            │
│                    │     SHARED GAME STATE      │                            │
│                    │   (Server + SSE Sync)      │                            │
│                    └────────────────────────────┘                            │
└─────────────────────────────────────────────────────────────────────────────┘
```

## View Specifications

### Party View (Display Mode)

**Purpose:** Shared screen for group play, streaming, or theater mode. This is the only view with TTS audio.

**Shows:**
- Narration text (styled, animated)
- Animated avatars for speaking characters
- Scene backgrounds
- TTS audio playback
- Current area name and description
- Speech bubbles during dialogue

**Hides:**
- All control buttons
- Approval panels
- Edit interfaces
- DM notes
- Raw game state

**Design considerations:**
- Should look like a polished game, not an admin panel
- Support for full-screen mode
- Dark theme optimized
- Configurable layout (avatars left/right, text size, etc.)

### DM View (Control Mode)

**Purpose:** Full game control and visibility.

**Shows:**
- Everything in Party View, plus:
- Beat editor (approve/edit/regenerate)
- Evolution approval panel
- Emergence notifications
- Scene controls (start/end/transition)
- All entity traits (including hidden)
- True relationship values
- Pattern observer insights
- World state editor
- NPC controls

**Features:**
- Side-by-side: Party View preview + controls
- Quick actions: approve, reject, edit inline
- Drag-drop scene ordering
- Real-time player activity indicators

### Player Views (Per-Character Mode)

**Purpose:** Show subjective reality for individual players.

**Shows:**
- Narration (same as group)
- Their character's known traits
- Their **perception** of relationships (may differ from truth)
- Personal inventory
- Character-specific notes
- Actions available to their character

**Hides:**
- Other players' character sheets
- Hidden traits (until revealed)
- True relationship values (shows perceived)
- DM notes
- Emergence/evolution internals

**Key feature: Unreliable perspective**
```
Truth (DM sees):        Player perceives:
─────────────────       ─────────────────
Guard trusts you: 0.2   "The guard seems friendly"
Guard fears you: 0.8    (hidden - player doesn't know)
```

## Technical Design

### Route Structure

```
/game/:gameId/view/party          # Display-only with TTS, join via code/link
/game/:gameId/view/dm             # Requires DM auth
/game/:gameId/view/player/:charId # Requires player auth for that character
```

### Authentication & Authorization

```typescript
interface SessionToken {
  gameId: string;
  role: 'dm' | 'player' | 'viewer';
  characterId?: string;  // For player role
  permissions: Permission[];
}

type Permission =
  | 'view:narration'
  | 'view:all_traits'
  | 'view:own_traits'
  | 'view:all_relationships'
  | 'view:own_relationships'
  | 'control:beats'
  | 'control:scenes'
  | 'control:evolutions'
  | 'action:play';
```

### SSE Event Filtering

All views connect to same SSE endpoint, but receive filtered events:

```typescript
interface SSEBroadcast {
  event: GameEvent;
  visibility: {
    party: boolean;      // Show in party view?
    dm: boolean;         // Show in DM view?
    players: string[];   // Which player IDs can see?
  };
}
```

**Example events:**
| Event | Party | DM | Player |
|-------|-------|-----|--------|
| narration | Yes | Yes | Yes |
| evolution_suggested | No | Yes | No |
| trait_acquired (hidden) | No | Yes | Owner only |
| emergence_detected | No | Yes | No |
| scene_boundary | No | Yes | No |

### State Filtering Layer

```typescript
// Server-side filter before sending to client
function filterGameStateForView(
  state: FullGameState,
  view: 'party' | 'dm' | 'player',
  characterId?: string
): FilteredGameState {
  switch (view) {
    case 'party':
      return filterForParty(state);
    case 'dm':
      return state; // DM sees everything
    case 'player':
      return filterForPlayer(state, characterId!);
  }
}

function filterForPlayer(state: FullGameState, charId: string): FilteredGameState {
  return {
    ...state,
    // Only show own character's hidden traits
    traits: state.traits.filter(t =>
      !t.hidden || t.entityId === charId
    ),
    // Transform relationships to perceived values
    relationships: state.relationships.map(r =>
      r.fromId === charId
        ? { ...r, ...getPerceivedRelationship(r) }
        : r
    ),
    // Hide DM-only data
    pendingEvolutions: [],
    emergenceNotifications: [],
  };
}
```

### Component Architecture

```
packages/client/src/
├── views/
│   ├── party-view.ts       # Display-only view with TTS
│   ├── dm-view.ts          # Full control view
│   └── player-view.ts      # Per-character view
├── components/
│   ├── shared/             # Used by all views
│   │   ├── narration-display.ts
│   │   ├── avatar-stage.ts
│   │   └── scene-background.ts
│   ├── dm/                 # DM-only components
│   │   ├── beat-editor.ts
│   │   ├── evolution-panel.ts
│   │   └── scene-controls.ts
│   └── player/             # Player-specific
│       ├── character-sheet.ts
│       └── action-bar.ts
└── services/
    └── view-state/
        ├── index.ts
        ├── party-state.ts
        ├── dm-state.ts
        └── player-state.ts
```

## Database Changes

### New Tables

```sql
-- Join codes for Jackbox-style party joining
CREATE TABLE join_codes (
  id TEXT PRIMARY KEY,
  game_id TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  code TEXT NOT NULL UNIQUE,       -- Short alphanumeric (e.g., "ABC123")
  expires_at TEXT NOT NULL,
  max_uses INTEGER DEFAULT 10,
  current_uses INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Track active view sessions
CREATE TABLE view_sessions (
  id TEXT PRIMARY KEY,
  game_id TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  view_type TEXT NOT NULL,  -- 'party', 'dm', 'player'
  character_id TEXT,        -- For player views
  display_name TEXT,        -- Player's chosen name
  token_hash TEXT NOT NULL, -- Hashed session token
  last_active TEXT DEFAULT (datetime('now')),
  created_at TEXT DEFAULT (datetime('now'))
);

-- Player-perceived relationship values (can differ from truth)
CREATE TABLE perceived_relationships (
  id TEXT PRIMARY KEY,
  game_id TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  perceiver_id TEXT NOT NULL,    -- Character doing the perceiving
  target_id TEXT NOT NULL,       -- Who they're perceiving
  perceived_trust REAL,          -- What they think the trust is
  perceived_respect REAL,
  perceived_affection REAL,
  -- fear/resentment usually hidden from perceiver
  last_updated_turn INTEGER,
  UNIQUE(game_id, perceiver_id, target_id)
);
```

## API Changes

### New Endpoints

```
# Join flow (Jackbox-style)
POST /api/game/:id/join/create            # DM creates join code
POST /api/game/:id/join                   # Player joins with code
GET  /api/game/:id/join/:code             # Direct join link handler

# View state
GET  /api/game/:id/view/:viewType/state   # Filtered state for view
GET  /api/game/:id/view/sessions          # List active sessions (DM only)
DELETE /api/game/:id/view/session/:sid    # Kick a viewer (DM only)
```

### SSE Changes

```
GET /api/game/:id/events?view=party&token=xxx
GET /api/game/:id/events?view=dm&token=xxx
GET /api/game/:id/events?view=player&character=xxx&token=xxx
```

## UI/UX Considerations

### Party View Design Goals
- Cinematic feel
- Readable at distance (10ft UI)
- Works on TV/projector
- Minimal UI chrome
- Smooth animations
- TTS audio (only view with audio)

### DM View Design Goals
- Information density
- Quick actions
- Keyboard shortcuts
- Preview of what party sees
- Real-time sync indicators

### Player View Design Goals
- Mobile-friendly
- Focus on their character
- Clear action affordances
- Notifications for relevant events

## Migration Path

### Phase 1: Infrastructure + Party View
- Add join_codes and view_sessions tables
- Design party join system (Jackbox-style codes + links)
- Create `/view/party` route with TTS
- Move display components to shared

### Phase 2: DM View Refactor
- Current UI becomes DM view
- Side-by-side layout with Party View preview
- Quick approve/reject
- Enhanced visibility

### Phase 3: Player Views
- Per-character routes
- Relationship perception system
- Subjective trait visibility
- SSE event filtering per view

### Phase 4: Polish (deferred)
- View customization
- Theming
- Mobile optimization

## Resolved Questions

1. **Session management**: Jackbox-style - DM creates party, players join via short code OR DM shares direct link
2. **Sync latency**: Not a concern for MVP - web page will eventually sync
3. **Audio routing**: TTS only on Party View
4. **Reconnection**: Deferred - not worried about this yet
5. **View switching**: Users open a different URL to switch views

## Success Criteria

- [ ] Party view runs independently, display-only with TTS
- [ ] DM can control game while party view shows results
- [ ] Players can join via code or link (Jackbox-style)
- [ ] Player views show subjective relationship data
- [ ] SSE properly filters events per view
- [ ] Works on mobile (player view)
- [ ] Works on TV (party view)
