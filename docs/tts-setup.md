---
title: "TTS Setup Guide"
type: guide
status: active
created: 2026-01-10
updated: 2026-01-10
authors:
  - agent
related:
  - ./tts-api.md
  - ./plan/phase-1-tts-engine.md
tags:
  - tts
  - setup
  - elevenlabs
  - redis
---

# TTS Setup Guide

This guide walks you through setting up the Text-to-Speech (TTS) system for Reckoning.

## Prerequisites

- Node.js 18+
- pnpm package manager
- Docker (for Redis) or Redis installed locally
- ElevenLabs account with API key

## Quick Start

```bash
# 1. Install dependencies
pnpm install

# 2. Start Redis
just infra-up

# 3. Configure environment
cp .env.example .env
# Edit .env with your ElevenLabs API key

# 4. Start the server
just dev
```

## Step 1: Get an ElevenLabs API Key

1. Create an account at [ElevenLabs](https://elevenlabs.io)
2. Go to your Profile Settings
3. Find the "API Key" section
4. Copy your API key

**Pricing Tiers:**
- **Free**: 10,000 characters/month
- **Starter** ($5/mo): 30,000 characters/month
- **Creator** ($22/mo): 100,000 characters/month
- **Pro** ($99/mo): 500,000 characters/month

For development, the free tier is sufficient. With caching enabled, characters are only consumed on cache misses.

## Step 2: Set Up Redis

Redis is used for caching generated audio to minimize API costs and improve response times.

### Option A: Docker (Recommended)

```bash
# Start Redis with docker-compose
just infra-up

# Or manually
docker run -d --name reckoning-redis -p 6379:6379 redis:7-alpine
```

### Option B: Local Installation

**macOS:**
```bash
brew install redis
brew services start redis
```

**Ubuntu/Debian:**
```bash
sudo apt update
sudo apt install redis-server
sudo systemctl start redis
```

**Windows:**
Use WSL2 with the Linux instructions, or download from [Redis for Windows](https://github.com/microsoftarchive/redis/releases).

### Verify Redis Connection

```bash
redis-cli ping
# Should return: PONG
```

## Step 3: Configure Environment

Create a `.env` file in the project root:

```bash
cp .env.example .env
```

Edit `.env` with your configuration:

```env
# Required: ElevenLabs API key
ELEVENLABS_API_KEY=your_api_key_here

# Redis connection (default: localhost:6379)
REDIS_URL=redis://localhost:6379

# Server configuration
PORT=3001
HOST=0.0.0.0
NODE_ENV=development

# Optional: Default voice IDs for each role
TTS_VOICE_NARRATOR=21m00Tcm4TlvDq8ikWAM
TTS_VOICE_JUDGE=AZnzlk1XvdvUeBnXmlld
TTS_VOICE_NPC=EXAVITQu4vr4xnSDxMaL
TTS_VOICE_INNER=MF3mGyEYCl7XYWbV9V6O
```

### Finding Voice IDs

You can find voice IDs in the ElevenLabs dashboard:

1. Go to [ElevenLabs Voices](https://elevenlabs.io/voices)
2. Click on a voice
3. Copy the Voice ID from the URL or voice details

**Recommended Voices for Reckoning:**

| Role | Voice Character | Suggested Voices |
|------|-----------------|------------------|
| Narrator | Deep, authoritative | Adam, Arnold, Antoni |
| Judge | Ethereal, detached | Bella, Elli (with effects) |
| NPC | Varied | Any voice that fits the character |
| Inner Voice | Soft, intimate | Rachel, Domi |

## Step 4: Start the Server

### Development Mode

```bash
# Start all services
just dev

# Or start only the server
pnpm --filter @reckoning/server dev
```

The server will start at `http://localhost:3001`.

### Production Mode

```bash
# Build the project
just build

# Start the server
pnpm --filter @reckoning/server start
```

## Step 5: Test the Setup

### Health Check

```bash
curl http://localhost:3001/health
# Should return: {"status":"ok"}
```

### Test TTS Endpoint

```bash
# Generate speech (requires valid voice ID or role mapping)
curl -X POST http://localhost:3001/api/tts/speak \
  -H "Content-Type: application/json" \
  -d '{"text":"Hello, world!","voiceId":"21m00Tcm4TlvDq8ikWAM"}' \
  --output test.mp3

# Play the audio
open test.mp3  # macOS
xdg-open test.mp3  # Linux
```

## Troubleshooting

### "ElevenLabs API key not configured"

Ensure `ELEVENLABS_API_KEY` is set in your `.env` file and the server has been restarted.

### "Redis connection failed"

1. Check Redis is running: `redis-cli ping`
2. Verify `REDIS_URL` in `.env` matches your Redis instance
3. Check for firewall issues if using remote Redis

The TTS system will continue to work without Redis, but caching will be disabled.

### "Voice not found"

1. Verify the voice ID is correct in ElevenLabs dashboard
2. Check that the role has a default voice configured in `.env`
3. Ensure you have access to the voice (some are premium only)

### Rate Limit Errors

If you see `PROVIDER_ERROR` with rate limit messages:

1. Check your ElevenLabs usage dashboard
2. Consider upgrading your plan
3. Enable caching (`cache: true`) to reduce API calls
4. Implement request queuing on the client side

### Audio Quality Issues

Adjust voice settings for better quality:

```json
{
  "text": "Your text here",
  "voiceId": "...",
  "settings": {
    "stability": 0.75,
    "similarityBoost": 0.85,
    "useSpeakerBoost": true
  }
}
```

## Cache Management

### View Cache Stats

```bash
# Connect to Redis CLI
redis-cli

# Count TTS cache entries
KEYS tts:*
```

### Clear Cache

```bash
# Clear all TTS cache entries
redis-cli KEYS "tts:*" | xargs redis-cli DEL

# Or clear everything (development only!)
redis-cli FLUSHALL
```

### Cache TTL Configuration

Cache TTL is configured in the source code (`packages/server/src/services/cache/tts-cache-service.ts`):

- **Narration content**: 7 days (narrator, judge roles)
- **Static dialogue**: 30 days (npc, inner_voice roles)

## Development Tips

### Testing Without API Calls

Use `cache: false` to bypass caching during development:

```json
{
  "text": "Test text",
  "voiceId": "...",
  "cache": false
}
```

### Running Tests

```bash
# Run all TTS tests
pnpm --filter @reckoning/server test

# Watch mode for development
pnpm --filter @reckoning/server test:watch
```

### Monitoring API Usage

Track your ElevenLabs usage at:
https://elevenlabs.io/usage

The `X-TTS-Response` header includes `characterCount` for each request to help estimate costs.

## Security Considerations

1. **Never expose your API key** in client-side code
2. **Use environment variables** for all sensitive configuration
3. **Implement rate limiting** for production deployments
4. **Monitor usage** to detect abuse or unexpected costs

## Next Steps

- Review the [TTS API Reference](./tts-api.md) for endpoint details
- Explore [Phase 1 Plan](./plan/phase-1-tts-engine.md) for architecture details
- Set up the client-side TTS service for audio playback
