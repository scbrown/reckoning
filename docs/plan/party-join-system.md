# Party Join System Design

## Overview

Jackbox-style party join flow enabling multiplayer sessions without complex authentication.

**Core flow:**
1. DM creates a game session and generates a join code
2. Players join via short code entry OR direct link from DM
3. System issues short-lived session tokens for connected players
4. Tokens maintain player-to-game association during the session

## Design Goals

| Goal | Rationale |
|------|-----------|
| Zero friction | Players should join in <30 seconds |
| No accounts | Party games don't need persistent identity |
| Short codes | Easy to read aloud (Jackbox uses 4 chars) |
| Link sharing | DM can paste link in Discord/chat |
| Session-scoped | Tokens expire when game ends or after inactivity |

## API Design

### 1. Create Join Code

**Endpoint:** `POST /api/game/:gameId/join/create`

**Authorization:** DM only (must be game owner)

**Request:**
```typescript
interface CreateJoinCodeRequest {
  expiresIn?: number;    // Minutes until expiry (default: 60, max: 1440)
  maxUses?: number;      // Max joins (default: 10, max: 50)
}
```

**Response:**
```typescript
interface CreateJoinCodeResponse {
  code: string;          // e.g., "ABC123"
  expiresAt: string;     // ISO 8601 timestamp
  maxUses: number;
  currentUses: number;
  joinUrl: string;       // Full URL for direct sharing
}
```

**Implementation notes:**
- Generate 4-6 character alphanumeric code (uppercase, no ambiguous chars like 0/O, 1/I/L)
- Character set: `ABCDEFGHJKMNPQRSTUVWXYZ23456789` (24 chars, ~1.6M combinations for 4-char)
- Check for collision before inserting
- Return existing active code if one exists (don't create duplicates)

**Example:**
```http
POST /api/game/abc-123/join/create
Content-Type: application/json

{
  "expiresIn": 120,
  "maxUses": 6
}

Response:
{
  "code": "WXYZ",
  "expiresAt": "2026-01-26T07:30:00Z",
  "maxUses": 6,
  "currentUses": 0,
  "joinUrl": "https://reckoning.app/join/WXYZ"
}
```

### 2. Join with Code

**Endpoint:** `POST /api/game/:gameId/join`

**Authorization:** None (public endpoint)

**Request:**
```typescript
interface JoinRequest {
  code: string;          // The 4-6 char join code
  displayName: string;   // Player's display name (1-30 chars)
  characterId?: string;  // Optional: claim specific character
}
```

**Response:**
```typescript
interface JoinResponse {
  sessionToken: string;  // Bearer token for subsequent requests
  expiresAt: string;     // When token expires
  gameId: string;
  viewUrl: string;       // URL to player's view
  assignedCharacter?: {
    id: string;
    name: string;
  };
}
```

**Error responses:**
| Code | Condition |
|------|-----------|
| 400 | Invalid code format |
| 404 | Code not found or expired |
| 409 | Code exhausted (maxUses reached) |
| 409 | Character already claimed |
| 410 | Game has ended |

**Implementation notes:**
- Validate code exists and hasn't expired
- Increment `currentUses` counter
- Create session in `view_sessions` table
- Generate cryptographically secure session token
- Token is opaque (no JWT - simpler, no crypto overhead)

**Example:**
```http
POST /api/game/abc-123/join
Content-Type: application/json

{
  "code": "WXYZ",
  "displayName": "Alice"
}

Response:
{
  "sessionToken": "rk_sess_a1b2c3d4e5f6...",
  "expiresAt": "2026-01-26T11:30:00Z",
  "gameId": "abc-123",
  "viewUrl": "/game/abc-123/view/player"
}
```

### 3. Direct Join Link Handler

**Endpoint:** `GET /api/game/:gameId/join/:code`

**Authorization:** None

**Behavior:**
- Validates code is active
- Returns HTML page with join form (displayName input)
- On submit, calls `POST /api/game/:gameId/join` and redirects

**Alternative flow:**
For API clients, add `Accept: application/json` header to get:
```typescript
interface JoinLinkInfo {
  valid: boolean;
  gameId: string;
  gameName?: string;      // If we want to show game name
  remainingSlots: number; // How many more can join
  expiresAt: string;
}
```

This allows mobile apps or desktop clients to show a join preview.

### 4. Supporting Endpoints

**Get code status (DM only):**
```
GET /api/game/:gameId/join/status
→ { codes: JoinCode[], activeSessions: number }
```

**Revoke code (DM only):**
```
DELETE /api/game/:gameId/join/:codeId
→ 204 No Content
```

**List active sessions (DM only):**
```
GET /api/game/:gameId/sessions
→ { sessions: ViewSession[] }
```

**Kick player (DM only):**
```
DELETE /api/game/:gameId/sessions/:sessionId
→ 204 No Content
```

## Database Schema

### join_codes

```sql
CREATE TABLE join_codes (
  id TEXT PRIMARY KEY,               -- UUID
  game_id TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  code TEXT NOT NULL,                -- Short alphanumeric (e.g., "ABC123")
  expires_at TEXT NOT NULL,          -- ISO 8601
  max_uses INTEGER NOT NULL DEFAULT 10,
  current_uses INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  revoked_at TEXT,                   -- If manually revoked

  UNIQUE(code)                       -- Codes are globally unique
);

CREATE INDEX idx_join_codes_code ON join_codes(code) WHERE revoked_at IS NULL;
CREATE INDEX idx_join_codes_game ON join_codes(game_id);
```

### view_sessions

```sql
CREATE TABLE view_sessions (
  id TEXT PRIMARY KEY,               -- UUID
  game_id TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  view_type TEXT NOT NULL,           -- 'party', 'dm', 'player'
  character_id TEXT,                 -- For player views, which character
  display_name TEXT NOT NULL,        -- Player's chosen name
  token_hash TEXT NOT NULL,          -- SHA-256 hash of session token
  join_code_id TEXT REFERENCES join_codes(id),  -- Which code was used
  last_active TEXT NOT NULL DEFAULT (datetime('now')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  kicked_at TEXT,                    -- If DM kicked this session

  UNIQUE(token_hash)
);

CREATE INDEX idx_view_sessions_game ON view_sessions(game_id);
CREATE INDEX idx_view_sessions_token ON view_sessions(token_hash);
```

## Token Design

### Format

```
rk_sess_<32 random bytes as hex>

Example: rk_sess_a1b2c3d4e5f6789012345678901234567890abcdef12345678
```

**Properties:**
- Prefix `rk_sess_` makes tokens identifiable in logs
- 32 bytes = 256 bits of entropy (cryptographically secure)
- Stored as SHA-256 hash in database (prevents token theft from DB breach)
- Transmitted in `Authorization: Bearer <token>` header

### Lifecycle

```
┌─────────────┐         ┌─────────────┐         ┌─────────────┐
│   Created   │────────▶│   Active    │────────▶│   Expired   │
│ (join call) │         │ (heartbeat) │         │ (timeout)   │
└─────────────┘         └──────┬──────┘         └─────────────┘
                               │
                               ▼
                        ┌─────────────┐
                        │   Kicked    │
                        │ (DM action) │
                        └─────────────┘
```

**Expiration rules:**
- Initial TTL: 4 hours from creation
- Extended on activity (SSE connection, API calls)
- Max lifetime: 24 hours (prevents forever tokens)
- Game end: All sessions for that game invalidated

### Validation

```typescript
async function validateSession(token: string): Promise<Session | null> {
  // 1. Check format
  if (!token.startsWith('rk_sess_')) return null;

  // 2. Hash and lookup
  const hash = sha256(token);
  const session = await db.query(`
    SELECT * FROM view_sessions
    WHERE token_hash = ?
      AND kicked_at IS NULL
      AND last_active > datetime('now', '-4 hours')
  `, [hash]);

  if (!session) return null;

  // 3. Update last_active
  await db.run(`
    UPDATE view_sessions
    SET last_active = datetime('now')
    WHERE id = ?
  `, [session.id]);

  return session;
}
```

## Security Considerations

### Code Enumeration

**Risk:** Attacker tries all 4-character combinations to find valid codes.

**Mitigations:**
1. Rate limit join attempts: 10/minute per IP
2. Exponential backoff on failures: 1s, 2s, 4s, 8s...
3. Monitor for enumeration patterns
4. Consider 5-6 char codes for larger games

### Token Theft

**Risk:** Session token intercepted or stolen.

**Mitigations:**
1. HTTPS only (enforced)
2. Short token lifetime (4 hours default)
3. Single-use refresh (future enhancement)
4. IP binding (optional, may break mobile)

### Code Reuse

**Risk:** Old codes still work after game should be "private."

**Mitigations:**
1. Codes expire (default 1 hour)
2. DM can revoke codes
3. DM can kick joined players
4. Codes have max use count

### DM Impersonation

**Risk:** Player claims to be DM somehow.

**Mitigations:**
1. DM session created differently (game creation flow)
2. DM has `view_type: 'dm'` which can't be obtained via join code
3. All privileged endpoints check `view_type`

## Integration Points

### SSE Connection

Players connect to SSE with session token:
```
GET /api/game/:gameId/events?token=rk_sess_xxx
```

Server validates token and filters events based on `view_type`.

### View Routes

Frontend routes check session:
```typescript
// /game/:gameId/view/player
async function playerViewLoader({ params }) {
  const token = getStoredToken(params.gameId);
  const session = await validateToken(token);

  if (!session || session.viewType !== 'player') {
    redirect('/join/' + params.gameId);
  }

  return { session };
}
```

### Character Assignment

When player joins and claims a character:
1. Check character isn't already claimed (by `view_sessions.character_id`)
2. Update `view_sessions.character_id`
3. Emit SSE event `player_joined` to DM view

## UX Flow

### DM Flow

```
1. DM starts new game
   └── Game created, DM gets dm session token automatically

2. DM clicks "Invite Players"
   └── Modal shows:
       ├── Join code: "WXYZ" (big, readable)
       ├── Join link: "reckoning.app/join/WXYZ" (copyable)
       └── QR code (optional future enhancement)

3. DM sees players joining
   └── Party panel shows:
       ├── "Alice joined" (toast notification)
       ├── Player list with kick buttons
       └── Character assignment UI
```

### Player Flow

```
1. Player opens join link OR navigates to join page
   └── Sees join form:
       ├── Code input (if not in URL)
       └── Display name input

2. Player submits
   └── On success:
       ├── Token stored in localStorage
       └── Redirected to player view

3. Player in game
   └── Sees party view with TTS
       ├── Can see their character (if assigned)
       └── Can submit actions (future)

4. On page reload
   └── Token retrieved from localStorage
       ├── If valid: resume session
       └── If expired: redirect to join page
```

## Error Handling

### User-Friendly Errors

| Code | User Message |
|------|--------------|
| Invalid code format | "That doesn't look like a join code. Codes are 4 letters like WXYZ." |
| Code not found | "We couldn't find that code. Check with your DM for the right one." |
| Code expired | "This code has expired. Ask your DM for a new one." |
| Code exhausted | "The game is full. Ask your DM to increase the limit." |
| Game ended | "This game has ended. Thanks for playing!" |
| Kicked | "You've been removed from this game by the DM." |

### Reconnection

When session is lost:
1. Show "Reconnecting..." overlay
2. Retry SSE connection with token
3. If token invalid, show "Session expired" with rejoin option
4. Preserve any local state (unsent actions)

## Future Enhancements

### Phase 1 (Current)
- Basic join code flow
- Session tokens
- DM can view/kick players

### Phase 2 (Later)
- QR codes for join
- Character claiming/assignment
- Player action submission
- Reconnection handling

### Phase 3 (Future)
- Persistent player identity (optional accounts)
- Game history for players
- Friend system

## Implementation Tasks

The following tasks break down the implementation:

1. **Database migrations** (`re-nkesw.12`)
   - Add `join_codes` table
   - Add `view_sessions` table
   - Add indexes

2. **Join code service**
   - Code generation (collision-resistant)
   - Code validation
   - Expiration handling

3. **Session service**
   - Token generation
   - Token validation
   - Session lifecycle

4. **API routes**
   - POST `/api/game/:id/join/create`
   - POST `/api/game/:id/join`
   - GET `/api/game/:id/join/:code`
   - Supporting endpoints

5. **Frontend components**
   - Join code display modal (DM)
   - Join page (player)
   - Session status indicator

6. **SSE integration**
   - Token validation in SSE endpoint
   - Event filtering by view type
