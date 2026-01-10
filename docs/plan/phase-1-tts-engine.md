---
title: "Phase 1: Text-to-Speech Engine"
type: plan
status: active
created: 2026-01-10
updated: 2026-01-10
authors:
  - human
  - agent
related:
  - ./phase-0-project-setup.md
  - ./README.md
tags:
  - tts
  - elevenlabs
  - audio
  - streaming
phase: "1"
---

# Phase 1: Text-to-Speech Engine

## Overview

Implement a Text-to-Speech system using ElevenLabs to provide voice narration for the game. This will power the Chronicle narration, character dialogue, and Trial sequences.

## Goals

- Integrate ElevenLabs API for high-quality voice synthesis
- Support multiple distinct voices for different game elements
- Handle streaming audio for longer narration
- Implement caching to minimize API costs
- Create a clean service abstraction for game integration

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Browser Client                            │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────────────┐  │
│  │  Game UI    │───▶│  TTS Client │───▶│  Audio Player       │  │
│  │             │    │  Service    │    │  (Web Audio API)    │  │
│  └─────────────┘    └──────┬──────┘    └─────────────────────┘  │
└────────────────────────────┼────────────────────────────────────┘
                             │ HTTPS
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Backend Proxy                               │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────────────┐  │
│  │  /api/tts   │───▶│  TTS        │───▶│  Cache Layer        │  │
│  │  endpoint   │    │  Service    │    │  (Redis/Memory)     │  │
│  └─────────────┘    └──────┬──────┘    └─────────────────────┘  │
└────────────────────────────┼────────────────────────────────────┘
                             │ HTTPS
                             ▼
                    ┌─────────────────┐
                    │  ElevenLabs API │
                    └─────────────────┘
```

### Why a Backend Proxy?

ElevenLabs API keys cannot be exposed in browser code - they would be immediately compromised. The backend proxy:
- Keeps the API key secure server-side
- Enables caching of generated audio
- Allows rate limiting and request queuing
- Provides a stable interface if we ever switch TTS providers

## Voice Strategy

### Voice Assignments

| Role | Voice Character | ElevenLabs Voice (TBD) |
|------|-----------------|------------------------|
| **Narrator/Chronicle** | Authoritative, slightly ominous | Deep male voice |
| **The Judge** | Ethereal, detached | Processed/unusual voice |
| **Generic NPCs** | Varied by character | Pool of 4-6 voices |
| **Player's Inner Voice** | Intimate, uncertain | Softer voice |

### Voice Settings

ElevenLabs provides these parameters per-request:
- **stability**: 0-1 (lower = more expressive variation)
- **similarity_boost**: 0-1 (how close to original voice)
- **style**: 0-1 (style exaggeration, v2 models only)
- **use_speaker_boost**: boolean (enhances clarity)

We'll create presets for different contexts:
```typescript
const VOICE_PRESETS = {
  chronicle: { stability: 0.7, similarity_boost: 0.8 },
  dialogue_calm: { stability: 0.5, similarity_boost: 0.75 },
  dialogue_intense: { stability: 0.3, similarity_boost: 0.7 },
  trial_judgment: { stability: 0.8, similarity_boost: 0.9 }
};
```

## Implementation Tasks

### 1. Project Setup
- [ ] Initialize TypeScript project with Vite
- [ ] Set up project structure (`src/services/`, `src/types/`, etc.)
- [ ] Configure ESLint, Prettier, Vitest
- [ ] Set up environment variable handling (.env)

### 2. Backend Proxy Service
- [ ] Create Express/Fastify backend server
- [ ] Implement `/api/tts/speak` endpoint (streaming response)
- [ ] Add API key management (environment variables)
- [ ] Implement request validation
- [ ] Set up CORS for local development
- [ ] Health check endpoint

### 3. ElevenLabs Integration
- [ ] Create ElevenLabs API client wrapper
- [ ] Implement `textToSpeech()` method
- [ ] Implement `getVoices()` for voice discovery
- [ ] Handle streaming responses for long text
- [ ] Add error handling and retries
- [ ] Create TypeScript types for API responses

### 4. Caching Layer (Redis)
- [ ] Design cache key strategy (hash of text + voice + settings)
- [ ] Set up Redis connection with ioredis
- [ ] Implement cache-aside pattern (check cache → stream from ElevenLabs → store in cache)
- [ ] Buffer streamed response for cache storage while forwarding to client
- [ ] Set cache TTL policies (e.g., 7 days for narration, 30 days for static dialogue)
- [ ] Add cache hit/miss logging

### 5. Client-Side TTS Service
- [ ] Create `TTSService` class for browser
- [ ] Implement audio queue for sequential playback
- [ ] Add playback controls (pause, resume, skip, stop)
- [ ] Handle Web Audio API for playback
- [ ] Add volume control
- [ ] Implement preloading for anticipated speech

### 6. Voice Configuration System
- [ ] Create voice registry with role mappings
- [ ] Implement voice preset system
- [ ] Add runtime voice switching
- [ ] Create voice selection UI (for testing/configuration)

### 7. Testing & Documentation
- [ ] Unit tests for TTS service
- [ ] Integration tests with mocked ElevenLabs
- [ ] E2E test for full speech flow
- [ ] API documentation
- [ ] Usage examples

## Technical Details

### ElevenLabs API

**Endpoint**: `POST https://api.elevenlabs.io/v1/text-to-speech/{voice_id}`

**Request**:
```typescript
interface TTSRequest {
  text: string;
  model_id: string;  // "eleven_monolingual_v1" or "eleven_multilingual_v2"
  voice_settings: {
    stability: number;
    similarity_boost: number;
    style?: number;
    use_speaker_boost?: boolean;
  };
}
```

**Response**: Audio stream (mp3 or pcm)

### Service Interface

```typescript
interface ITTSService {
  // Core methods
  speak(text: string, options?: SpeakOptions): Promise<void>;
  speakAs(role: VoiceRole, text: string): Promise<void>;

  // Playback control
  pause(): void;
  resume(): void;
  stop(): void;
  skip(): void;

  // Queue management
  queue(text: string, options?: SpeakOptions): void;
  clearQueue(): void;

  // Configuration
  setVolume(level: number): void;
  setVoice(role: VoiceRole, voiceId: string): void;

  // Events
  on(event: 'start' | 'end' | 'error', callback: Function): void;
}

type VoiceRole = 'narrator' | 'judge' | 'npc' | 'inner_voice';

interface SpeakOptions {
  voice?: string;
  preset?: string;
  priority?: 'high' | 'normal' | 'low';
  cache?: boolean;
}
```

## Decisions

1. **Streaming + Cache Hybrid**: Stream audio to client for immediate playback, while backend buffers the complete response and caches it in Redis. First play streams live, subsequent plays serve from cache instantly.

2. **Cache Storage**: Redis for distributed caching. Provides persistence across restarts and supports future multi-instance deployments.

3. **No Fallback**: If ElevenLabs is unavailable, TTS simply fails. Text will still be displayed in the UI, but no backup voice synthesis.

4. **Throttling**: Deferred to a later phase. See "Deferred: Throttling & Cost Management" section below.

## Open Questions

1. **Voice selection**: How do we pick ElevenLabs voices?
   - Need to evaluate available voices for each role
   - Consider voice cloning for unique character voices later

## Acceptance Criteria

Phase 1 is complete when:

- [ ] Backend proxy running with secure API key handling
- [ ] Can generate speech from text via API call
- [ ] At least 3 distinct voices configured for different roles
- [ ] Audio plays in browser with basic controls (play/pause/stop)
- [ ] Caching reduces redundant API calls
- [ ] Unit tests passing with >80% coverage on TTS service
- [ ] Can queue multiple speech segments and play sequentially

## Cost Estimation

ElevenLabs pricing (as of 2024):
- Starter: $5/month - 30,000 characters
- Creator: $22/month - 100,000 characters
- Pro: $99/month - 500,000 characters

**Rough estimates**:
- Average Chronicle entry: ~500 characters
- Average dialogue line: ~100 characters
- Trial sequence: ~2,000 characters

With caching, a typical play session might use 5,000-10,000 characters.

## Dependencies

- Node.js 18+
- TypeScript 5+
- Vite
- Express or Fastify (backend)
- ElevenLabs account with API key
- Redis (for audio caching)
- ioredis (Redis client for Node.js)

## Deferred: Throttling & Cost Management

To be implemented in a future phase:

- **Rate limiting**: Limit requests per user/session (e.g., 100 requests/hour)
- **Character quotas**: Daily/monthly character limits per user
- **Usage tracking**: Store usage metrics in Redis, expose via admin API
- **Cost alerts**: Webhook/email when approaching ElevenLabs plan limits
- **Request queuing**: Priority queue to smooth burst traffic
- **Circuit breaker**: Temporarily disable TTS if error rate spikes

## Next Steps After Phase 1

Phase 2 will build on this foundation to add:
- Integration with AI-generated Chronicle text
- Dynamic voice selection based on NPC characteristics
- SSML support for more expressive speech
- Sound effects and ambient audio mixing
- Throttling and cost management (from deferred items above)
