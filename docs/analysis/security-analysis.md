# Security Analysis

## Summary

The reckoning project has a moderate security posture with several areas requiring attention. The codebase demonstrates good practices in some areas (XSS prevention, SQL injection prevention, secrets management via environment variables) but has significant gaps in authentication, authorization, and rate limiting. As a single-player game application, many enterprise security controls are less critical, but the external API integrations (ElevenLabs TTS) create financial and operational risks that should be addressed.

The most critical finding is the lack of any authentication mechanism, combined with the absence of rate limiting on the TTS endpoint which calls a paid external API. This creates potential for API abuse and unexpected billing costs.

## Findings

### Finding 1: No Authentication or Authorization
- **Severity**: P1
- **Category**: security
- **Location**: `packages/server/src/index.ts`, all route files
- **Description**: The API server has no authentication middleware. All endpoints are publicly accessible without any form of authentication. Any user can access any game, generate TTS audio, and consume external API credits. While this may be acceptable for a local single-player game, it becomes a security risk if the server is exposed on a network or the internet.
- **Suggestion**: Implement at minimum a simple session-based authentication or API key mechanism. Consider using Fastify's built-in session plugin or JWT tokens. For local-only use, add middleware that validates requests originate from localhost.
- **Effort**: Medium

### Finding 2: No Rate Limiting on TTS Endpoint
- **Severity**: P1
- **Category**: security
- **Location**: `packages/server/src/routes/tts.ts:237`
- **Description**: The `/api/tts/speak` endpoint calls the ElevenLabs API (a paid service) without any rate limiting. An attacker could make unlimited requests, resulting in unexpected charges. The endpoint accepts arbitrary text up to the service limits, creating potential for API abuse.
- **Suggestion**: Implement rate limiting using `@fastify/rate-limit` plugin. Suggested limits: 10-20 requests per minute per IP for TTS generation. Also consider request queue/throttling for the ElevenLabs client itself.
- **Effort**: Low

### Finding 3: Potential Command Injection in Claude CLI Provider
- **Severity**: P1
- **Category**: security
- **Location**: `packages/server/src/services/ai/claude-cli.ts:176-180`
- **Description**: The Claude CLI provider uses `spawn()` with `shell: true` option. The prompt text is passed as an argument. If the prompt contains shell metacharacters, command injection is theoretically possible. While prompts are typically AI-generated, DM guidance and injected content could potentially be user-controlled.
- **Suggestion**: Remove `shell: true` from spawn options - it's not necessary when passing arguments as an array. The current implementation should work without shell mode: `spawn(this.config.cliCommand, args, { env: { ...process.env } })`.
- **Effort**: Low

### Finding 4: SSE Connection Limit Not Enforced
- **Severity**: P2
- **Category**: security
- **Location**: `packages/server/src/services/sse/broadcast-manager.ts`
- **Description**: The SSE BroadcastManager doesn't limit the number of connections per game or total connections. An attacker could open thousands of SSE connections, exhausting server resources (file descriptors, memory).
- **Suggestion**: Add connection limits: max 10 connections per gameId, max 100 total connections. Reject new connections when limits are reached. Consider requiring some form of game ownership validation before allowing subscription.
- **Effort**: Low

### Finding 5: Permissive CORS in Development
- **Severity**: P3
- **Category**: security
- **Location**: `packages/server/src/index.ts:25-29`
- **Description**: CORS is set to allow all origins (`origin: true`) in development mode. While this is common for development, it could be a risk if the development server is accidentally exposed. In production, CORS is disabled entirely which may be overly restrictive.
- **Suggestion**: Consider allowing specific origins in production (e.g., the frontend domain) rather than disabling CORS entirely. For development, consider using a specific origin pattern.
- **Effort**: Low

### Finding 6: Missing Security Headers
- **Severity**: P2
- **Category**: security
- **Location**: `packages/server/src/index.ts`
- **Description**: The server doesn't set standard security headers like Content-Security-Policy, X-Content-Type-Options, X-Frame-Options, or Strict-Transport-Security. While less critical for a local application, these headers provide defense-in-depth.
- **Suggestion**: Add `@fastify/helmet` plugin with appropriate configuration. This provides sensible security header defaults.
- **Effort**: Low

### Finding 7: XSS Prevention Properly Implemented (Positive Finding)
- **Severity**: P3
- **Category**: security
- **Location**: `packages/client/src/components/*.ts`
- **Description**: Client-side components properly implement HTML escaping using a safe `escapeHtml()` function that uses `textContent` assignment. This pattern is used consistently across narrator-output.ts, save-load-modal.ts, and other components that render user or game content.
- **Suggestion**: Document this pattern as the standard approach for the project. Consider creating a shared utility function.
- **Effort**: Low

### Finding 8: SQL Injection Prevention (Positive Finding)
- **Severity**: P3
- **Category**: security
- **Location**: `packages/server/src/db/repositories/*.ts`
- **Description**: All database repositories use parameterized queries via better-sqlite3's `prepare().run()` and `prepare().get()` methods with placeholder values. No string concatenation is used for user-provided values in SQL queries.
- **Suggestion**: Continue this practice. Consider adding a code review checklist item to verify parameterized queries.
- **Effort**: Low

### Finding 9: Secrets Management via Environment Variables (Positive Finding)
- **Severity**: P3
- **Category**: security
- **Location**: `packages/server/src/routes/tts.ts:47`, `.env.example`
- **Description**: API keys (ELEVENLABS_API_KEY) are properly loaded from environment variables rather than being hardcoded. The `.env.example` file contains only placeholder values.
- **Suggestion**: Document secure handling of `.env` files. Ensure `.env` is in `.gitignore` (it currently is).
- **Effort**: Low

### Finding 10: Game ID Predictability
- **Severity**: P2
- **Category**: security
- **Location**: `packages/server/src/db/repositories/game-repository.ts:19`
- **Description**: Game IDs are generated using `randomUUID()` which is cryptographically secure. However, without authentication, anyone who discovers or guesses a game ID can access and modify that game's state. The UUID space is large enough that brute-force guessing is impractical.
- **Suggestion**: Combine with Finding 1 - implement authentication so that game access requires ownership proof.
- **Effort**: Medium

## Metrics
- Files analyzed: 25+
- Issues found: 10 (3 P1, 3 P2, 4 P3)
- Positive findings: 3
- Top areas needing attention:
  1. Authentication/Authorization (no implementation)
  2. Rate limiting on TTS endpoint
  3. Command injection risk in CLI provider

## Recommendations

1. **Immediate (P1)**: Remove `shell: true` from claude-cli.ts spawn() call - this is a one-line fix that eliminates command injection risk
2. **Immediate (P1)**: Add rate limiting to TTS endpoint using @fastify/rate-limit to prevent API abuse and unexpected billing
3. **Short-term**: Implement basic authentication - even a simple shared secret or session cookie for localhost validation
4. **Medium-term**: Add SSE connection limits to prevent resource exhaustion
5. **Medium-term**: Add security headers via @fastify/helmet
6. **Ongoing**: Continue using parameterized queries and escapeHtml patterns - consider documenting these as project standards

---
*Analysis conducted: 2026-01-12*
*Scope: packages/client, packages/server, packages/shared*
*Analyst: gastown/polecats/rictus*
