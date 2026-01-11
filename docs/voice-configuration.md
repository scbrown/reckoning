---
title: Voice Configuration System
type: guide
status: active
created: 2026-01-10
updated: 2026-01-10
authors:
  - agent
related:
  - ./plan/phase-1-tts-engine.md
tags:
  - tts
  - voice
  - elevenlabs
  - configuration
phase: "1"
---

# Voice Configuration System

This guide covers the voice configuration system for Reckoning's Text-to-Speech engine.

## Overview

The voice configuration system allows you to:

- Map game roles (narrator, judge, NPC, inner voice) to specific ElevenLabs voices
- Configure voice presets for different speaking contexts
- Change voice mappings at runtime through the API or UI
- Test different voices with the built-in voice tester

## Architecture

```
packages/
├── shared/src/tts/
│   └── index.ts          # Types, presets, getPreset()
├── server/src/
│   ├── services/
│   │   └── voice-registry.ts  # Voice registry service
│   └── routes/
│       └── tts.ts         # TTS API endpoints
└── client/src/
    └── main.ts            # Voice tester UI
```

## Voice Roles

The game uses four voice roles:

| Role | Purpose | Default Voice |
|------|---------|---------------|
| `narrator` | Story narration and descriptions | Narrator (custom) |
| `judge` | The cosmic judge at trial | Domi |
| `npc` | Non-player characters | Bella |
| `inner_voice` | Player's internal thoughts | Elli |

## Custom Voices

| Voice | Voice ID | Purpose |
|-------|----------|---------|
| Narrator | `EC45bTQTXqWg2aqlp4ch` | Custom narrator for main storytelling |
| Stiwi | `iKa6KVAfDE7NBkGe3dJo` | Voice for the character Stiwi |

## Voice Presets

Presets control voice characteristics for different speaking contexts:

| Preset | Use Case | Stability | Similarity |
|--------|----------|-----------|------------|
| `chronicle` | Narration | 0.7 | 0.8 |
| `dialogue_calm` | Normal NPC speech | 0.5 | 0.75 |
| `dialogue_intense` | Emotional scenes | 0.3 | 0.7 |
| `trial_judgment` | Judge's verdict | 0.8 | 0.9 |
| `inner_voice` | Internal monologue | 0.6 | 0.85 |

### Using Presets

```typescript
import { getPreset, getPresetNames } from '@reckoning/shared';

// Get a specific preset
const settings = getPreset('chronicle');
// { stability: 0.7, similarityBoost: 0.8 }

// List all preset names
const names = getPresetNames();
// ['chronicle', 'dialogue_calm', 'dialogue_intense', 'trial_judgment', 'inner_voice']
```

## Environment Variables

Configure default voice IDs via environment variables:

```bash
# .env or environment
VOICE_ID_NARRATOR=EC45bTQTXqWg2aqlp4ch    # Custom Narrator
VOICE_ID_JUDGE=AZnzlk1XvdvUeBnXmlld       # Domi
VOICE_ID_NPC=EXAVITQu4vr4xnSDxMaL         # Bella
VOICE_ID_INNER_VOICE=MF3mGyEYCl7XYWbV9V6O # Elli
```

## API Endpoints

### List Available Voices

```http
GET /api/tts/voices
```

Response:
```json
{
  "voices": [
    {
      "voiceId": "21m00Tcm4TlvDq8ikWAM",
      "name": "Rachel",
      "category": "premade",
      "description": "Calm, narrative voice suitable for storytelling"
    }
  ]
}
```

### Get Current Configuration

```http
GET /api/tts/config
```

Response:
```json
{
  "mappings": [
    {
      "role": "narrator",
      "voiceId": "21m00Tcm4TlvDq8ikWAM",
      "voiceName": "Rachel",
      "defaultPreset": "chronicle"
    }
  ],
  "presets": {
    "chronicle": { "stability": 0.7, "similarityBoost": 0.8 }
  }
}
```

### Update Voice Mapping

```http
POST /api/tts/config/voice
Content-Type: application/json

{
  "role": "narrator",
  "voiceId": "TxGEqnHWrfWFTfGW9XjX"
}
```

Response:
```json
{
  "success": true,
  "mapping": {
    "role": "narrator",
    "voiceId": "TxGEqnHWrfWFTfGW9XjX",
    "voiceName": "Josh",
    "defaultPreset": "chronicle"
  }
}
```

### Reset to Defaults

```http
POST /api/tts/config/reset
```

### Get Voice Presets

```http
GET /api/tts/presets
GET /api/tts/presets/:name
```

### Get Role Configuration

```http
GET /api/tts/role/:role
```

## Voice Tester UI

The client includes a voice configuration UI that appears when the server is connected.

Features:
- Role selector dropdown
- Voice selector with descriptions
- Apply button to update mappings
- Preview button (placeholder for ElevenLabs preview)
- Table showing current role-to-voice mappings

## Server Usage

```typescript
import { voiceRegistry } from './services/index.js';

// Get voice ID for a role
const voiceId = voiceRegistry.getVoiceForRole('narrator');

// Get full mapping
const mapping = voiceRegistry.getMappingForRole('narrator');

// Update mapping at runtime
voiceRegistry.updateVoiceMapping('narrator', 'new-voice-id', 'New Voice');

// Reset all to defaults
voiceRegistry.resetAllToDefaults();
```

## Adding New Voices

To add a new voice to the available list (development mode):

1. Add to `MOCK_VOICES` in `packages/server/src/services/voice-registry.ts`
2. For production, implement the ElevenLabs API integration

## Future Enhancements

- ElevenLabs API integration for real voice listing
- Voice preview audio playback
- Persistent voice configuration (Redis storage)
- Per-session voice preferences
