---
title: "Phase 0: Project Foundation"
type: plan
status: active
created: 2026-01-10
updated: 2026-01-10
authors:
  - human
  - agent
related:
  - ../adr/0001-monorepo-architecture.md
  - ./phase-1-tts-engine.md
  - ./README.md
tags:
  - setup
  - monorepo
  - infrastructure
phase: "0"
adr: "0001"
---

# Phase 0: Project Foundation

## Overview

Establish the monorepo structure, development tooling, and documentation foundation before implementing features. This phase creates the scaffolding that all future phases build upon.

## Goals

- Set up pnpm monorepo with workspace packages
- Configure TypeScript with project references
- Establish development workflow (local dev, testing, building)
- Create infrastructure for local development (Docker, Redis)
- Document everything for human and AI agent contributors

## Architecture

See [ADR-0001: Monorepo Architecture](../adr/0001-monorepo-architecture.md) for the full decision record.

### Package Structure

```
reckoning/
├── packages/
│   ├── client/                 # Browser game (Vite + TypeScript)
│   │   ├── src/
│   │   │   ├── services/       # Client-side services
│   │   │   ├── ui/             # UI components
│   │   │   └── main.ts         # Entry point
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── vite.config.ts
│   │
│   ├── server/                 # API server (Fastify + TypeScript)
│   │   ├── src/
│   │   │   ├── routes/         # API route handlers
│   │   │   ├── services/       # Backend services (TTS, AI, etc.)
│   │   │   └── index.ts        # Entry point
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   └── shared/                 # Shared types and utilities
│       ├── src/
│       │   ├── types/          # TypeScript interfaces
│       │   └── index.ts        # Public exports
│       ├── package.json
│       └── tsconfig.json
│
├── docs/                       # Documentation
│   ├── adr/                    # Architecture Decision Records
│   ├── plan/                   # Phase planning documents
│   └── VISION.md               # Product vision
│
├── docker-compose.yml          # Local infrastructure (Redis)
├── .env.example                # Environment variable template
├── pnpm-workspace.yaml         # Workspace configuration
├── package.json                # Root package.json
├── tsconfig.json               # Base TypeScript config
├── justfile                    # Command runner
├── AGENTS.md                   # AI agent guidelines
└── CONTRIBUTING.md             # Human contributor guide
```

## Implementation Tasks

### 1. Monorepo Setup
- [x] Create pnpm-workspace.yaml
- [x] Create root package.json with workspace scripts
- [x] Create base tsconfig.json with shared compiler options

### 2. Shared Package (@reckoning/shared)
- [x] Initialize packages/shared/package.json
- [x] Create packages/shared/tsconfig.json
- [x] Create initial type definitions (TTS types, common types)
- [x] Set up build script

### 3. Server Package (@reckoning/server)
- [x] Initialize packages/server/package.json
- [x] Create packages/server/tsconfig.json
- [x] Set up Fastify with TypeScript
- [x] Create health check endpoint
- [x] Configure environment variable loading

### 4. Client Package (@reckoning/client)
- [x] Initialize packages/client/package.json
- [x] Create packages/client/tsconfig.json
- [x] Set up Vite with TypeScript
- [x] Create minimal entry point
- [x] Configure dev server proxy to backend

### 5. Infrastructure
- [x] Create docker-compose.yml for Redis
- [x] Create .env.example with required variables
- [x] Document environment setup

### 6. Development Tooling
- [x] Update justfile with development recipes
- [x] Document all just commands

### 7. Documentation
- [x] Update AGENTS.md with monorepo structure
- [x] Update docs/plan/README.md with Phase 0
- [x] Ensure CONTRIBUTING.md reflects new setup

## Just Recipes

After Phase 0, these commands are available:

```bash
# Development
just dev           # Start all services (client + server + redis)
just dev-client    # Start only the client
just dev-server    # Start only the server

# Building
just build         # Build all packages
just build-client  # Build client for production
just build-server  # Build server for production

# Testing
just test          # Run all tests
just test-client   # Run client tests
just test-server   # Run server tests

# Infrastructure
just infra-up      # Start Redis via Docker
just infra-down    # Stop Redis

# Utilities
just install       # Install all dependencies
just clean         # Remove build artifacts and node_modules
just typecheck     # Run TypeScript compiler checks
just lint          # Run ESLint on all packages
just format        # Format code with Prettier
```

## Environment Variables

Required variables (see `.env.example`):

```bash
# ElevenLabs API (required for TTS)
ELEVENLABS_API_KEY=your_api_key_here

# Redis connection
REDIS_URL=redis://localhost:6379

# Server configuration
PORT=3001
NODE_ENV=development

# Client configuration (used by Vite)
VITE_API_URL=http://localhost:3001
```

## Acceptance Criteria

Phase 0 is complete when:

- [x] `pnpm install` succeeds from fresh clone
- [x] `just dev` starts client, server, and Redis
- [x] Client loads in browser at localhost:5173
- [x] Server responds to health check at localhost:3001/health
- [x] Shared types are importable in both client and server
- [x] TypeScript compilation succeeds with no errors
- [x] AGENTS.md accurately describes the project structure
- [x] All just recipes documented and functional

## Dependencies

### Root Development Dependencies
- pnpm (package manager)
- typescript
- @types/node
- prettier
- eslint

### Server Dependencies
- fastify
- @fastify/cors
- ioredis
- dotenv

### Client Dependencies
- vite
- typescript

### Infrastructure
- Docker (for Redis)

## Notes

- We use Fastify over Express for better TypeScript support and performance
- pnpm workspace protocol (`workspace:*`) ensures packages reference local versions
- TypeScript project references enable incremental builds
- The client's Vite dev server proxies `/api/*` to the backend for seamless local dev
