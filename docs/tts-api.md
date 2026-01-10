---
title: "TTS API Reference"
type: reference
status: active
created: 2026-01-10
updated: 2026-01-10
authors:
  - agent
related:
  - ./tts-setup.md
  - ./plan/phase-1-tts-engine.md
tags:
  - tts
  - api
  - elevenlabs
  - audio
---

# TTS API Reference

This document provides the complete API reference for the Text-to-Speech (TTS) endpoints.

## Base URL

```
http://localhost:3001/api/tts
```

## Endpoints

### POST /api/tts/speak

Generate speech audio from text.

#### Request

**Headers:**
```
Content-Type: application/json
```

**Body:**

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `text` | string | Yes | - | The text to convert to speech (must not be empty) |
| `voiceId` | string | No* | - | ElevenLabs voice ID to use |
| `role` | VoiceRole | No* | - | Voice role for automatic voice selection |
| `preset` | string | No | - | Voice preset name (e.g., "chronicle", "dialogue_calm") |
| `settings` | VoiceSettings | No | - | Custom voice settings (overrides preset) |
| `priority` | "high" \| "normal" \| "low" | No | "normal" | Request priority for queue ordering |
| `cache` | boolean | No | true | Whether to use/store cached audio |

*Either `voiceId` or `role` must be provided. If both are provided, `voiceId` takes precedence.

**VoiceRole Values:**
- `narrator` - Chronicle narration voice
- `judge` - The Judge's ethereal voice
- `npc` - Generic NPC dialogue
- `inner_voice` - Player's inner thoughts

**VoiceSettings Object:**

| Field | Type | Range | Description |
|-------|------|-------|-------------|
| `stability` | number | 0-1 | Lower = more expressive variation |
| `similarityBoost` | number | 0-1 | How close to the original voice |
| `style` | number | 0-1 | Style exaggeration (v2 models only) |
| `useSpeakerBoost` | boolean | - | Enhances voice clarity |

#### Example Request

```json
{
  "text": "In the shadows of the forgotten realm, a hero emerged.",
  "role": "narrator",
  "settings": {
    "stability": 0.7,
    "similarityBoost": 0.8
  }
}
```

```bash
curl -X POST http://localhost:3001/api/tts/speak \
  -H "Content-Type: application/json" \
  -d '{
    "text": "Hello, brave adventurer.",
    "voiceId": "21m00Tcm4TlvDq8ikWAM",
    "settings": {
      "stability": 0.5,
      "similarityBoost": 0.75
    }
  }' \
  --output speech.mp3
```

#### Response

**Success (200 OK):**

Returns audio data as `audio/mpeg` binary stream.

**Response Headers:**
```
Content-Type: audio/mpeg
X-TTS-Response: {"cached":false,"contentType":"audio/mpeg","characterCount":53}
```

The `X-TTS-Response` header contains a JSON object with:

| Field | Type | Description |
|-------|------|-------------|
| `cached` | boolean | Whether audio was served from cache |
| `contentType` | string | Audio content type (always "audio/mpeg") |
| `characterCount` | number | Number of characters in the request text |
| `durationMs` | number | Audio duration in milliseconds (if available) |

#### Error Responses

All error responses follow this format:

```json
{
  "code": "ERROR_CODE",
  "message": "Human-readable error message",
  "retryable": false
}
```

**400 Bad Request - Invalid Request:**
```json
{
  "code": "INVALID_REQUEST",
  "message": "Text is required",
  "retryable": false
}
```

**400 Bad Request - Voice Not Found:**
```json
{
  "code": "VOICE_NOT_FOUND",
  "message": "No voice ID provided and no default for role",
  "retryable": false
}
```

**500 Internal Server Error:**
```json
{
  "code": "INTERNAL_ERROR",
  "message": "ElevenLabs API key not configured",
  "retryable": false
}
```

**502 Bad Gateway - Provider Error:**
```json
{
  "code": "PROVIDER_ERROR",
  "message": "ElevenLabs API error: Rate limit exceeded",
  "retryable": true
}
```

## Error Codes

| Code | HTTP Status | Retryable | Description |
|------|-------------|-----------|-------------|
| `INVALID_REQUEST` | 400 | No | Invalid or missing request parameters |
| `VOICE_NOT_FOUND` | 400 | No | Voice ID not found or not configured |
| `RATE_LIMITED` | 429 | Yes | ElevenLabs API rate limit exceeded |
| `PROVIDER_ERROR` | 502 | Yes | ElevenLabs API error |
| `CACHE_ERROR` | 500 | Yes | Redis cache error |
| `INTERNAL_ERROR` | 500 | No | Internal server error |

## Caching

The TTS system implements a cache-aside pattern with Redis:

1. On request, the cache is checked first using a hash of text + voiceId + settings
2. On cache hit, audio is returned immediately from cache
3. On cache miss, audio is fetched from ElevenLabs and stored in cache
4. TTL depends on content type:
   - **Narration** (narrator, judge): 7 days
   - **Static dialogue** (npc, inner_voice): 30 days

### Cache Key Generation

Cache keys are SHA-256 hashes of the normalized request parameters:
- Text content
- Voice ID
- Voice settings (only defined properties)

### Bypassing Cache

Set `cache: false` in the request body to:
- Skip cache lookup
- Skip storing the response in cache

This is useful for:
- Testing fresh TTS generation
- Regenerating audio with the same parameters
- Development and debugging

## Voice Presets

Built-in presets for common scenarios:

| Preset | Stability | Similarity Boost | Use Case |
|--------|-----------|------------------|----------|
| `chronicle` | 0.7 | 0.8 | Narration, story text |
| `dialogue_calm` | 0.5 | 0.75 | Normal NPC dialogue |
| `dialogue_intense` | 0.3 | 0.7 | Emotional/dramatic dialogue |
| `trial_judgment` | 0.8 | 0.9 | The Judge's pronouncements |
| `inner_voice` | 0.6 | 0.85 | Player's internal thoughts |

## Rate Limits

ElevenLabs API has rate limits based on your subscription plan. The server will:
- Return `PROVIDER_ERROR` with `retryable: true` on rate limit
- Log rate limit errors for monitoring
- Not cache failed requests

## Usage Examples

### Basic Text-to-Speech

```typescript
const response = await fetch('/api/tts/speak', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    text: 'Welcome to the realm of Reckoning.',
    role: 'narrator'
  })
});

if (response.ok) {
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const audio = new Audio(url);
  audio.play();
}
```

### With Custom Voice Settings

```typescript
const response = await fetch('/api/tts/speak', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    text: 'The Judge has rendered the verdict.',
    role: 'judge',
    settings: {
      stability: 0.85,
      similarityBoost: 0.9,
      useSpeakerBoost: true
    }
  })
});
```

### Direct Voice ID

```typescript
const response = await fetch('/api/tts/speak', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    text: 'Greetings, traveler.',
    voiceId: '21m00Tcm4TlvDq8ikWAM'  // Specific ElevenLabs voice
  })
});
```

### Checking Cache Status

```typescript
const response = await fetch('/api/tts/speak', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    text: 'Hello world',
    role: 'narrator'
  })
});

const ttsResponse = JSON.parse(response.headers.get('X-TTS-Response'));
console.log('From cache:', ttsResponse.cached);
console.log('Character count:', ttsResponse.characterCount);
```

## TypeScript Types

Import types from `@reckoning/shared`:

```typescript
import type {
  TTSRequest,
  TTSResponse,
  TTSError,
  TTSErrorCode,
  VoiceRole,
  VoiceSettings,
  AvailableVoice,
} from '@reckoning/shared';
```

See the [shared types documentation](../packages/shared/src/tts/index.ts) for complete type definitions.
