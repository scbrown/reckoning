# Testability Analysis

## Summary

The reckoning project has a moderate level of test coverage with 20 test files covering 75 source files (~27% file coverage). The existing tests demonstrate good practices including proper mocking, isolated unit tests, and comprehensive integration tests. However, significant gaps exist in client-side component testing and some server-side service coverage.

The test infrastructure uses Vitest with strong mocking capabilities. Tests are well-organized in `__tests__` directories. However, all 10 UI components lack dedicated tests, and some recently added features (beat-editor, speech-bubble, area-panel) have no test coverage.

## Findings

### Finding 1: No UI Component Tests
- **Severity**: P1
- **Category**: testability
- **Location**: `packages/client/src/components/`
- **Description**: All 10 client components (area-panel, beat-editor, controls, dm-editor, game-stats, narrator-output, party-panel, playback-controls, save-load-modal, speech-bubble) have zero test coverage. These components contain significant business logic including state management, event handling, and DOM manipulation.
- **Suggestion**: Add component tests using Vitest with jsdom. Start with critical components: dm-editor (core editing flow), beat-editor (new feature), and controls (user interactions). Use DOM testing patterns similar to the TTS service tests.
- **Effort**: High

### Finding 2: Missing Tests for New Features
- **Severity**: P1
- **Category**: testability
- **Location**: `packages/client/src/components/beat-editor.ts`, `packages/client/src/services/tts/index.ts` (speakSequence)
- **Description**: Recently added features including the beat-editor component and speakSequence() method in TTS service have no test coverage. These are critical Phase 3 features.
- **Suggestion**: Add unit tests for beat-editor (collapsible list, drag-drop, inline editing) and speakSequence() (beat type mapping, pause handling, callbacks). The TTS test file already has good patterns to follow.
- **Effort**: Medium

### Finding 3: Hard-coded DOM Dependencies in Components
- **Severity**: P2
- **Category**: testability
- **Location**: `packages/client/src/components/*.ts`
- **Description**: Components use `document.getElementById()` directly in constructors, making them difficult to test in isolation. The pattern `const container = document.getElementById(config.containerId)` is used across all components.
- **Suggestion**: Refactor to accept container elements directly or use dependency injection for the document object. Example: `constructor(container: HTMLElement | string, doc: Document = document)`
- **Effort**: Medium

### Finding 4: Excellent TTS Service Test Coverage
- **Severity**: P3 (positive finding)
- **Category**: testability
- **Location**: `packages/client/src/services/tts/__tests__/index.test.ts`
- **Description**: The TTS service has comprehensive test coverage (1000+ lines) with proper mocking of browser APIs (fetch, Audio, URL), lifecycle testing, error handling, and integration scenarios. This is a model for other service tests.
- **Suggestion**: Use this test file as a template for testing other services and components. Document the mocking patterns for reuse.
- **Effort**: Low

### Finding 5: Missing Error Path Tests in Some Services
- **Severity**: P2
- **Category**: testability
- **Location**: `packages/server/src/services/ai/`, `packages/server/src/services/game-engine/`
- **Description**: While happy-path tests exist, some error scenarios (API timeouts, malformed responses, concurrent access) may not be fully covered based on test file sizes.
- **Suggestion**: Audit error handling paths and add specific tests for failure modes. Consider adding chaos testing for network-related services.
- **Effort**: Medium

### Finding 6: Test Data Management
- **Severity**: P2
- **Category**: testability
- **Location**: Various test files
- **Description**: Test data (mock characters, game states, TTS requests) is defined inline in test files. Some duplication exists across test files.
- **Suggestion**: Create a shared `__fixtures__` directory with reusable test data factories. Example: `createMockCharacter()`, `createMockGameState()`, `createMockTTSRequest()`.
- **Effort**: Low

### Finding 7: Missing Shared Package Tests
- **Severity**: P2
- **Category**: testability
- **Location**: `packages/shared/src/`
- **Description**: The shared package contains type definitions and utility functions but appears to have no dedicated tests. Functions like `getPreset()` and beat-related utilities should be tested.
- **Suggestion**: Add tests for shared utilities and type guards. These are low-risk, high-value tests.
- **Effort**: Low

## Metrics
- Files analyzed: 95 (75 source + 20 test)
- Test files: 20
- Source files without tests: ~55
- Issues found: 7 (2 P1, 4 P2, 1 P3)
- Top areas needing attention:
  1. Client UI components (0% coverage)
  2. New Phase 3 features (beat-editor, speakSequence)
  3. Shared package utilities

## Recommendations

1. **Immediate (P1)**: Add tests for beat-editor and speakSequence - these are new critical features
2. **Short-term**: Create component testing infrastructure with jsdom, add tests for dm-editor and controls
3. **Medium-term**: Refactor component constructors for testability, create shared test fixtures
4. **Ongoing**: Ensure new features have tests before merge (add to PR checklist)

---
*Analysis conducted: 2026-01-11*
*Scope: packages/client, packages/server, packages/shared*
