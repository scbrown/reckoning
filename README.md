# Reckoning

A GenAI-powered tabletop RPG where every action is remembered and interpreted differently by witnesses. Players face judgment for who they became, not what they intended.

## Quick Start

```bash
# Install dependencies
pnpm install

# Start infrastructure (Redis)
just infra-up

# Start development servers
just dev
```

The client runs at `http://localhost:5173` and the API server at `http://localhost:3001`.

## Project Structure

```
reckoning/
├── packages/
│   ├── client/          # Browser game (Vite + TypeScript)
│   ├── server/          # API server (Fastify + TypeScript)
│   └── shared/          # Shared types and utilities
├── docs/                # Documentation
├── docker-compose.yml   # Local infrastructure
└── justfile             # Command runner
```

## Features

### Text-to-Speech (TTS)

Voice narration powered by ElevenLabs API with Redis caching:

- Multiple voice roles: narrator, judge, NPC, inner voice
- Configurable voice settings for different moods
- Automatic caching to minimize API costs
- Graceful fallback when cache is unavailable

**Quick Example:**
```bash
curl -X POST http://localhost:3001/api/tts/speak \
  -H "Content-Type: application/json" \
  -d '{"text":"Welcome to the realm of Reckoning.","role":"narrator"}' \
  --output speech.mp3
```

**Documentation:**
- [TTS Setup Guide](docs/tts-setup.md) - Installation and configuration
- [TTS API Reference](docs/tts-api.md) - Complete endpoint documentation

## Development

### Commands

```bash
# Development
just dev              # Start all services
just dev-client       # Start only client
just dev-server       # Start only server

# Testing
just test             # Run all tests
pnpm test             # Same as above

# Building
just build            # Build all packages
just typecheck        # Run TypeScript checks

# Infrastructure
just infra-up         # Start Redis
just infra-down       # Stop Redis
```

### Environment Variables

Copy `.env.example` to `.env` and configure:

```env
ELEVENLABS_API_KEY=your_api_key_here
REDIS_URL=redis://localhost:6379
PORT=3001
NODE_ENV=development
```

## Architecture

See [docs/plan/](docs/plan/) for detailed phase planning and architecture decisions.

- [Phase 0: Project Setup](docs/plan/phase-0-project-setup.md) - Foundation
- [Phase 1: TTS Engine](docs/plan/phase-1-tts-engine.md) - Voice synthesis

## Requirements

- Node.js 18+
- pnpm 8+
- Docker (for Redis) or Redis installed locally
- ElevenLabs API key (for TTS features)

## License

Private - All rights reserved.
