# Epic: Pixelsrc Integration

Integrate pixelsrc for procedurally generated pixel art portraits, scenes, and animations.

## Overview

| Field | Value |
|-------|-------|
| **Epic ID** | pixelsrc-integration |
| **Prefix** | PXLS |
| **Status** | Complete (code) |
| **Dependencies** | None (can run parallel to other epics) |
| **Blocked By** | None |
| **Completed** | 2026-01-20 |
| **External Dep** | Requires `@stiwi/pixelsrc-wasm` (not bundled - local file ref to `~/workspace/ttp/wasm`) |

## Task Dependency Graph

```
PXLS-001 ─────────────────────────────────────────────────────────────────────┐
(Add @pixelsrc/wasm to server)                                                 │
    │                                                                          │
    ├────────────────┬────────────────┬────────────────┐                      │
    ▼                ▼                ▼                ▼                       │
PXLS-002         PXLS-003         PXLS-004         PXLS-005                   │
(ProjectManager) (Validator)      (Renderer)       (Types)                    │
    │                │                │                │                       │
    └────────────────┴────────────────┴────────────────┘                      │
                              │                                                │
                              ▼                                                │
                          PXLS-006                                             │
                          (Generator with primer)                              │
                              │                                                │
                              ├───────────────────┐                           │
                              ▼                   ▼                            │
                          PXLS-007            PXLS-008                        │
                          (Repairer)          (VisualValidator)               │
                              │                   │                            │
                              └─────────┬─────────┘                           │
                                        ▼                                      │
                                    PXLS-009                                   │
                                    (WorldGen integration)                     │
                                        │                                      │
                              ┌─────────┴─────────┐                           │
                              ▼                   ▼                            │
                          PXLS-010            PXLS-011                        │
                          (API endpoints)     (Client WASM)                   │
                              │                   │                            │
                              │                   ▼                            │
                              │               PXLS-012                        │
                              │               (AnimatedAvatar)                │
                              │                   │                            │
                              │                   ▼                            │
                              │               PXLS-013                        │
                              │               (UI integration)                │
                              │                   │                            │
                              └─────────┬─────────┘                           │
                                        ▼                                      │
                                    PXLS-014                                   │
                                    (Scene backgrounds)                        │
                                        │                                      │
                                        ▼                                      │
                                    PXLS-015                                   │
                                    (Art evolution)                            │
                                        │                                      │
                                        ▼                                      │
                                    PXLS-016 ◄─────────────────────────────────┘
                                    (Documentation)
```

---

## Tasks

### PXLS-001: Add @pixelsrc/wasm dependency to server

**Status**: done
**Dependencies**: none
**Blocked By**: none

#### Description
Add the pixelsrc WASM package to the server for validation and rendering.

#### Acceptance Criteria
- [ ] `@pixelsrc/wasm` added to `packages/server/package.json`
- [ ] WASM module initializes correctly in Node.js environment
- [ ] Basic smoke test: validate a simple sprite, render to PNG
- [ ] TypeScript types available (or create ambient declarations)

#### Technical Notes
```bash
pnpm --filter @reckoning/server add @pixelsrc/wasm
```

The WASM module may need async initialization. Ensure it's ready before server starts accepting requests.

#### Tests Required
- WASM module loads without error
- `validate()` function works
- `render_to_png()` function works

---

### PXLS-002: Implement PixelsrcProjectManager

**Status**: done
**Dependencies**: PXLS-001
**Blocked By**: none

#### Description
Create service for managing pixelsrc project directories for each game.

#### Acceptance Criteria
- [ ] Class created at `packages/server/src/services/pixelsrc/project.ts`
- [ ] Methods implemented:
  - `initialize(gameId)`: Create directory structure
  - `getProjectPath(gameId)`: Return path to game's pixelsrc project
  - `writeFile(gameId, relativePath, content)`: Write .pxl file
  - `readFile(gameId, relativePath)`: Read .pxl file
  - `deleteProject(gameId)`: Clean up on game delete
- [ ] Directory structure follows pixelsrc conventions:
  ```
  data/games/{game-id}/
  ├── src/palettes/
  ├── src/characters/
  ├── src/npcs/
  ├── src/scenes/
  ├── src/effects/
  └── src/evolved/
  ```
- [ ] Exported from service index

#### Technical Notes
Use `fs.promises` for async file operations. Ensure paths are sanitized to prevent directory traversal.

#### Tests Required
- Directory structure created correctly
- Files written and read correctly
- Cleanup removes all files
- Path sanitization prevents traversal attacks

---

### PXLS-003: Implement PixelsrcValidator

**Status**: done
**Dependencies**: PXLS-001
**Blocked By**: none

#### Description
Create WASM-based validation service for pixelsrc source.

#### Acceptance Criteria
- [ ] Class created at `packages/server/src/services/pixelsrc/validator.ts`
- [ ] Methods implemented:
  - `validate(source)`: Validate .pxl source, return errors/warnings
- [ ] ValidationResult interface defined with errors and warnings arrays
- [ ] Errors include line numbers where possible
- [ ] Exported from service index

#### Technical Notes
```typescript
import { validate } from '@pixelsrc/wasm';

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
}
```

#### Tests Required
- Valid source returns valid=true
- Invalid source returns errors with descriptions
- Warnings returned separately from errors

---

### PXLS-004: Implement PixelsrcRenderer

**Status**: done
**Dependencies**: PXLS-001
**Blocked By**: none

#### Description
Create WASM-based rendering service for pixelsrc source.

#### Acceptance Criteria
- [ ] Class created at `packages/server/src/services/pixelsrc/renderer.ts`
- [ ] Methods implemented:
  - `renderToPng(source, spriteName?, options?)`: Render to PNG bytes
  - `listSprites(source)`: List sprite names in source
- [ ] Options include scale factor
- [ ] Returns `Uint8Array` of PNG data
- [ ] Exported from service index

#### Technical Notes
```typescript
import { render_to_png, list_sprites } from '@pixelsrc/wasm';

export interface RenderOptions {
  scale?: number;  // Default 1, use 4 for visual validation
}
```

#### Tests Required
- Render simple sprite to PNG
- Render specific sprite by name
- Scale option works correctly
- List sprites returns correct names

---

### PXLS-005: Add PixelArtRef types to shared package

**Status**: done
**Dependencies**: PXLS-001
**Blocked By**: none

#### Description
Add TypeScript types for pixel art references to the shared package.

#### Acceptance Criteria
- [ ] Types added to `packages/shared/src/game/types.ts`:
  - `PixelArtRef`: Reference to .pxl file in project
  - `PixelArt`: Full source (for API responses)
  - `PixelArtAnimation`: Animation metadata
  - `AnimationState`: Keyframe data
- [ ] `Character`, `NPC`, `Area` extended with `pixelArtRef?: PixelArtRef`
- [ ] `GameState` extended with `pixelsrcProject?: string` and `act: number`
- [ ] Types exported from package

#### Technical Notes
See `docs/plan/pixelsrc-integration.md` for full type definitions.

#### Tests Required
- Types compile without errors
- Existing code still compiles with extended interfaces

---

### PXLS-006: Implement PixelsrcGenerator with primer

**Status**: done
**Dependencies**: PXLS-002, PXLS-003, PXLS-004, PXLS-005
**Blocked By**: none

#### Description
Create prompt builder that generates pixelsrc content via AI with format primer.

#### Acceptance Criteria
- [ ] Class created at `packages/server/src/services/pixelsrc/generator.ts`
- [ ] Pixelsrc primer loaded from bundled file or `~/workspace/ttp/docs/primer_brief.md`
- [ ] Methods implemented:
  - `generatePortrait(request)`: Generate character/NPC portrait
  - `generateScene(request)`: Generate area scene
  - `generatePalette(request)`: Generate world/character palettes
- [ ] Prompts include:
  - Pixelsrc format primer
  - Character/area description
  - Style hints based on class/tags
  - Animation requirements (idle, talking)
- [ ] Returns raw .pxl source string
- [ ] Exported from service index

#### Technical Notes
Primer should be loaded once at startup and cached. Prompts should specify JSONL output only, no markdown.

#### Tests Required
- Primer loads correctly
- Portrait prompt includes all required sections
- Scene prompt includes all required sections
- AI response parsed correctly

---

### PXLS-007: Implement PixelsrcRepairer

**Status**: done
**Dependencies**: PXLS-006
**Blocked By**: none

#### Description
Create repair service that uses AI to fix invalid pixelsrc source.

#### Acceptance Criteria
- [ ] Class created at `packages/server/src/services/pixelsrc/repair.ts`
- [ ] Methods implemented:
  - `repair(source, validationResult, context)`: Attempt to fix invalid source
- [ ] Repair loop:
  1. Build prompt with original source + validation errors
  2. Ask AI to fix issues
  3. Validate result
  4. Retry up to 3 times if still invalid
- [ ] Returns `RepairResult` with success status and final source
- [ ] Exported from service index

#### Technical Notes
Include validation errors in repair prompt so AI knows what to fix. Pass original context (character description) for reference.

#### Tests Required
- Single-pass repair succeeds
- Multi-pass repair succeeds
- Gives up after 3 attempts
- Returns original source on complete failure

---

### PXLS-008: Implement PixelsrcVisualValidator

**Status**: done
**Dependencies**: PXLS-004, PXLS-006
**Blocked By**: none

#### Description
Create visual validation service that uses AI to review rendered output.

#### Acceptance Criteria
- [ ] Class created at `packages/server/src/services/pixelsrc/visual-validator.ts`
- [ ] Methods implemented:
  - `validate(source, context)`: Render and visually verify
- [ ] Process:
  1. Render source to PNG at 4x scale via WASM
  2. Convert to base64 data URI
  3. Send to Claude with original description
  4. Parse approval/feedback response
- [ ] Returns `VisualValidationResult` with approved boolean and feedback
- [ ] Exported from service index

#### Technical Notes
Visual validation prompt should ask Claude to evaluate:
- Does it match the description (colors, features)?
- Is the face/subject clearly visible?
- Are proportions appropriate?
- Overall quality acceptable?

#### Tests Required
- Renders PNG correctly
- Sends image to AI
- Parses approval response
- Parses rejection with feedback

---

### PXLS-009: Integrate pixelsrc with WorldGenerator

**Status**: done
**Dependencies**: PXLS-007, PXLS-008
**Blocked By**: none

#### Description
Update WorldGenerator to create pixelsrc project and generate art during world creation.

#### Acceptance Criteria
- [ ] WorldGenerator calls PixelsrcProjectManager.initialize() on game creation
- [ ] After party/NPC generation, generate pixel art for each:
  1. Generate .pxl source
  2. Validate structurally (WASM)
  3. If invalid, repair with AI
  4. Validate visually (Claude review)
  5. If rejected, regenerate with feedback
  6. Write .pxl file to project directory
  7. Set pixelArtRef on entity
- [ ] Generate world and character palettes based on theme
- [ ] All art generation happens before returning to client
- [ ] Failures logged but don't block world creation

#### Technical Notes
Art generation adds significant time to world creation. Consider progress updates via SSE.

#### Tests Required
- Project initialized on game creation
- Characters get pixel art generated
- NPCs get pixel art generated
- Validation loop works
- Visual validation loop works
- Partial failures don't break world gen

---

### PXLS-010: Add pixel art API endpoints

**Status**: done
**Dependencies**: PXLS-009
**Blocked By**: none

#### Description
Add REST API routes for pixel art retrieval and regeneration.

#### Acceptance Criteria
- [ ] Routes created at `packages/server/src/routes/pixelart.ts`
- [ ] Endpoints implemented:
  - `GET /api/game/:id/pixelart/:entityType/:entityId` - Get .pxl source
  - `POST /api/game/:id/pixelart/:entityType/:entityId/regenerate` - Regenerate art
- [ ] Retrieval loads from filesystem via ProjectManager
- [ ] Regeneration triggers full generation/validation loop
- [ ] Request/response validation with Zod
- [ ] Routes registered in server

#### Technical Notes
Follow existing route patterns. Include animation metadata in response.

#### Tests Required
- Retrieval returns .pxl source
- Retrieval returns 404 for missing art
- Regeneration creates new art
- Regeneration updates pixelArtRef

---

### PXLS-011: Add @pixelsrc/wasm to client

**Status**: done
**Dependencies**: PXLS-001
**Blocked By**: none

#### Description
Add pixelsrc WASM package to client for browser-side rendering.

#### Acceptance Criteria
- [ ] `@pixelsrc/wasm` added to `packages/client/package.json`
- [ ] WASM module initializes correctly in browser
- [ ] Create `PixelsrcRenderer` service at `packages/client/src/services/pixelsrc/`
- [ ] Methods:
  - `init()`: Initialize WASM module
  - `render(source, spriteName?)`: Render to ImageData
  - `listSprites(source)`: List available sprites
- [ ] Caches rendered frames for performance

#### Technical Notes
WASM initialization is async. Initialize early in app startup. Use `render_to_rgba()` for canvas rendering.

#### Tests Required
- WASM loads in browser
- Render produces valid ImageData
- Cache prevents redundant renders

---

### PXLS-012: Implement AnimatedAvatar component

**Status**: done
**Dependencies**: PXLS-011
**Blocked By**: none

#### Description
Create component that renders animated pixel art avatars.

#### Acceptance Criteria
- [ ] Component at `packages/client/src/components/animated-avatar.ts`
- [ ] Constructor accepts PixelArt source and config
- [ ] Renders to canvas element (64x64 or configurable)
- [ ] Animation state machine:
  - `idle`: Default state, subtle breathing
  - `talking`: Active during TTS
- [ ] Methods:
  - `play(state)`: Play animation state
  - `stop()`: Return to idle
  - `startSpeaking()`: Trigger talking animation
  - `stopSpeaking()`: Return to idle after delay
  - `getElement()`: Return canvas element
  - `destroy()`: Cleanup
- [ ] CSS-based scaling for display size

#### Technical Notes
Use `requestAnimationFrame` for smooth animation. Parse keyframes from PixelArt.animation metadata.

#### Tests Required
- Renders static sprite
- Plays animation frames
- State transitions work
- Speaking triggers correctly
- Cleanup stops animation loop

---

### PXLS-013: Integrate AnimatedAvatar with UI

**Status**: done
**Dependencies**: PXLS-012
**Blocked By**: none

#### Description
Replace avatar placeholders with AnimatedAvatar in existing components.

#### Acceptance Criteria
- [ ] CharacterCard modified:
  - If character has pixelArtRef, render AnimatedAvatar
  - Else fall back to initials placeholder
- [ ] PartyPanel updated to handle animated avatars
- [ ] SpeechBubble integration:
  - On show(), call avatar.startSpeaking()
  - On scheduleFade(), call avatar.stopSpeaking()
- [ ] Avatar manager tracks active avatars by characterId
- [ ] Graceful degradation if WASM fails to load

#### Technical Notes
Need to coordinate avatar lookup between components. Consider a central AvatarManager service.

#### Tests Required
- Avatars render for characters with pixelArt
- Fallback works for characters without
- Speaking animation triggers during TTS
- Speaking animation stops after TTS ends

---

### PXLS-014: Implement scene backgrounds

**Status**: done
**Dependencies**: PXLS-013
**Blocked By**: none

#### Description
Add pixel art scene backgrounds to AreaPanel.

#### Acceptance Criteria
- [ ] Scene generation prompts added to PixelsrcGenerator
- [ ] Areas get pixelArtRef during world generation
- [ ] AreaPanel renders scene background if available
- [ ] Support for ambient animations (palette cycling)
- [ ] Fallback to text-only description if no art

#### Technical Notes
Scenes are larger (128x96 or similar). May need different rendering approach for performance.

#### Tests Required
- Scene generated for areas
- AreaPanel renders scene
- Ambient animation works
- Fallback to text works

---

### PXLS-015: Implement art evolution system

**Status**: done
**Dependencies**: PXLS-014
**Blocked By**: none

#### Description
Create system for evolving character art over game progression.

#### Acceptance Criteria
- [ ] ArtEvolutionService created
- [ ] Detects evolution triggers:
  - Act transitions
  - Major events (battle, betrayal, discovery)
  - Status effects
  - Equipment changes
- [ ] Evolution strategies:
  - Variant: Palette swaps for mood/damage
  - Composition: Layer new elements
  - Regenerate: Full new portrait for act transitions
- [ ] Archives current art to `evolved/act-{n}/` before replacing
- [ ] Art history stored for reference in prompts
- [ ] GameState.act tracked and updated

#### Technical Notes
Use pixelsrc variant and composition types for efficient evolution without full regeneration.

#### Tests Required
- Act transition triggers evolution
- Variant evolution changes palette
- Composition adds layers
- Full regeneration preserves recognizable elements
- History archived correctly

---

### PXLS-016: Write pixelsrc integration documentation

**Status**: done
**Dependencies**: PXLS-015
**Blocked By**: none

#### Description
Write comprehensive documentation for the pixelsrc integration.

#### Acceptance Criteria
- [ ] Architecture documentation:
  - Data flow diagrams
  - Service interactions
  - WASM usage on server and client
- [ ] API documentation for pixel art endpoints
- [ ] Project structure documentation
- [ ] Art evolution rules documented
- [ ] Troubleshooting guide:
  - WASM initialization issues
  - Generation failures
  - Visual validation rejections
- [ ] Developer guide for extending/customizing

#### Technical Notes
Documentation should live in `docs/` and be linked from README.

#### Tests Required
- Documentation review for accuracy
- Code examples tested and working

---

## Summary

| Task | Title | Dependencies |
|------|-------|--------------|
| PXLS-001 | Add @pixelsrc/wasm to server | none |
| PXLS-002 | Implement PixelsrcProjectManager | PXLS-001 |
| PXLS-003 | Implement PixelsrcValidator | PXLS-001 |
| PXLS-004 | Implement PixelsrcRenderer | PXLS-001 |
| PXLS-005 | Add PixelArtRef types | PXLS-001 |
| PXLS-006 | Implement PixelsrcGenerator | PXLS-002, PXLS-003, PXLS-004, PXLS-005 |
| PXLS-007 | Implement PixelsrcRepairer | PXLS-006 |
| PXLS-008 | Implement PixelsrcVisualValidator | PXLS-004, PXLS-006 |
| PXLS-009 | Integrate with WorldGenerator | PXLS-007, PXLS-008 |
| PXLS-010 | Add pixel art API endpoints | PXLS-009 |
| PXLS-011 | Add @pixelsrc/wasm to client | PXLS-001 |
| PXLS-012 | Implement AnimatedAvatar | PXLS-011 |
| PXLS-013 | Integrate with UI | PXLS-012 |
| PXLS-014 | Implement scene backgrounds | PXLS-013 |
| PXLS-015 | Implement art evolution | PXLS-014 |
| PXLS-016 | Write documentation | PXLS-015 |
