---
title: AI Agent Guidelines
type: agent
status: active
created: 2026-01-10
updated: 2026-01-10
authors:
  - human
related:
  - ./CONTRIBUTING.md
  - ./docs/VISION.md
  - ./docs/plan/README.md
  - ./docs/adr/README.md
  - ./docs/gastown-workflow.md
tags:
  - agents
  - guidelines
  - workflow
---

# AI Agent Guidelines for Reckoning RPG

This document provides instructions for AI coding agents (Claude, Gemini, etc.) working on the Reckoning RPG project.

## Project Overview

**Reckoning** is a GenAI-powered tabletop RPG where every action is remembered and interpreted differently by witnesses. Players face judgment for who they became, not what they intended.

### Architecture

This is a **TypeScript monorepo** with pnpm workspaces:

```
reckoning/
├── packages/
│   ├── client/          # Browser game (Vite + TypeScript)
│   ├── server/          # API server (Fastify + TypeScript)
│   └── shared/          # Shared types and utilities
├── docs/
│   ├── VISION.md        # Product vision and game design
│   ├── STANDARDS.md     # Documentation standards
│   ├── adr/             # Architecture Decision Records
│   └── plan/            # Phase planning documents
├── scripts/             # Development tooling
├── docker-compose.yml   # Local infrastructure (Redis)
└── justfile             # Command runner
```

### Key Tools

| Tool | Purpose | Commands |
|------|---------|----------|
| **pnpm** | Package manager | `pnpm install`, `pnpm run dev` |
| **just** | Command runner | `just dev`, `just build`, `just test` |
| **beads (bd)** | Task tracking | `bd list`, `bd start`, `bd done` |
| **gastown (gt)** | Multi-agent coordination | `gt crew list` |
| **Docker** | Infrastructure | `docker compose up -d` |

## Getting Started

```bash
# 1. Install dependencies
just install

# 2. Start infrastructure (Redis)
just infra-up

# 3. Start development servers
just dev

# 4. Check project health
just check
```

## Development Workflow

### Before Starting Work

1. **Check tasks**: `just tasks` or `bd list`
2. **Pick a task**: `just start-task <id>` or `bd start <id>`
3. **Check for conflicts**: Review active agents with `gt crew list`

### While Working

1. **Use shared types**: Import from `@reckoning/shared`
2. **Follow existing patterns**: Check similar code first
3. **Test changes**: `just test` before committing

### Completing Work

1. **Commit**: `just commit "message"`
2. **Mark done**: `just done <id>` with summary

## Code Conventions

### TypeScript

- Strict mode enabled - no `any` types
- Use interfaces over type aliases for objects
- Export types from `@reckoning/shared` for cross-package use

### File Organization

| Package | Purpose | Example |
|---------|---------|---------|
| `@reckoning/shared` | Types, constants | `TTSRequest`, `VoiceRole` |
| `@reckoning/server` | API routes, services | `/api/tts/speak` |
| `@reckoning/client` | UI, client services | `TTSPlayer` |

### Naming

- Files: `kebab-case.ts`
- Types/Interfaces: `PascalCase`
- Functions/Variables: `camelCase`
- Constants: `SCREAMING_SNAKE_CASE`

## Documentation

All markdown files require **frontmatter**. See `docs/STANDARDS.md` for format.

### Lint Docs

```bash
just docs-lint         # Check all docs
just docs-lint-verbose # Show passing files too
```

### Document Types

| Type | Location | Purpose |
|------|----------|---------|
| `vision` | `docs/VISION.md` | Core game design |
| `plan` | `docs/plan/` | Phase implementation plans |
| `adr` | `docs/adr/` | Architecture decisions |
| `guide` | `docs/` | How-to documentation |

## Architecture Decisions

Major decisions are documented in `docs/adr/`. Check these before making changes:

- [ADR-0001: Monorepo Architecture](docs/adr/0001-monorepo-architecture.md)

## Development Phases

Work is organized into phases. See `docs/plan/README.md` for the roadmap:

- **Phase 0**: Project foundation (complete)
- **Phase 1**: Text-to-Speech engine (in progress)
  - ElevenLabs integration with streaming
  - Voice configuration UI
  - Redis caching (graceful fallback when unavailable)
  - Dynamic port allocation for multi-agent support
- **Phase 2+**: Game features

## Quick Reference

### Just Recipes

```bash
# Development
just dev              # Start all services
just dev-client       # Start only client
just dev-server       # Start only server

# Building
just build            # Build all packages
just typecheck        # Run TypeScript checks

# Testing
just test             # Run all tests
just lint             # Run ESLint

# Infrastructure
just infra-up         # Start Redis
just infra-down       # Stop Redis

# Documentation
just docs-lint        # Lint markdown files

# Tasks
just tasks            # List all tasks
just add-task "desc"  # Add new task
just done <id>        # Complete task

# TTS Testing
just tts-test                    # Test TTS with default text
just tts-test "Custom text"      # Test with custom text
just tts-test-role judge "text"  # Test specific role
just tts-voices                  # List available voices
just tts-config                  # Show current configuration

# Utilities
just ports-clean      # Kill processes on dev ports
just server-port      # Show current server port
```

### Package Scripts

```bash
# From root
pnpm run dev          # Start all
pnpm run build        # Build all
pnpm run test         # Test all

# Filter to package
pnpm --filter @reckoning/server dev
pnpm --filter @reckoning/client build
```

## Gastown Multi-Agent Workflow

Reckoning uses Gastown for multi-agent coordination with custom formulas.

### Beads: Single Source of Truth

**IMPORTANT:** Always use the gastown beads database, not the workspace `.beads` directory.

There are two beads locations - only use gastown:
- `/home/admin/gt/reckoning/.beads/` - **USE THIS** (gastown, visible to polecats)
- `/home/admin/workspace/reckoning/.beads/` - **IGNORE** (local only, not dispatched)

The `just` recipes automatically use the correct database:
```bash
just tasks              # Lists gastown beads
just add-task "desc"    # Creates in gastown + syncs
just done <id>          # Closes in gastown
just beads-sync         # Syncs gastown beads
```

If you need to use `bd` directly, always specify the database:
```bash
bd --db /home/admin/gt/reckoning/.beads/beads.db list
bd --db /home/admin/gt/reckoning/.beads/beads.db create "task"
```

### For Mayor: Dispatching Work

**ALWAYS use the `reckoning-work` formula when slinging work to polecats:**

```bash
# Preferred: Apply our formula when dispatching
gt sling reckoning-work --on <issue-id> <rig-name>

# Example
gt sling reckoning-work --on reckoning-abc reckoning
```

This ensures agents follow our TypeScript conventions, use `just` tooling, and run proper quality gates.

**Do NOT sling raw issues without the formula** unless the work is trivial or exploratory.

### Formula Details

The `reckoning-work` formula enforces:
1. Load project context (CLAUDE.md, docs/plan)
2. Preflight checks with `just check`
3. TypeScript strict mode (no `any` types)
4. TTS testing for Phase 1 features
5. Docs linting for markdown changes
6. Clean workspace before submission

See `docs/gastown-workflow.md` for full documentation.

### Available Commands

```bash
gt formula list                    # List formulas
gt formula show reckoning-work     # Show our workflow
gt sling <formula> --on <issue>    # Dispatch with formula
gt mol progress                    # Check step progress
```

## Communication

When working with other agents:
- Check `bd status` before starting
- Use beads to claim tasks
- Don't modify files another agent is working on
- Use clear commit messages referencing task IDs

## Troubleshooting

| Issue | Solution |
|-------|----------|
| pnpm not found | Install: `npm install -g pnpm` |
| Port in use | Run: `just ports-clean` or server auto-finds next port |
| Redis not running | Start: `just infra-up` (TTS works without Redis) |
| TypeScript errors | Run: `just typecheck` |
| Missing types | Build shared: `pnpm --filter @reckoning/shared build` |
| Finding server port | Check: `just server-port` or `cat .server-port` |

### Multi-Agent Port Handling

The server automatically finds an available port if the default (3001) is in use:
- Server writes its port to `.server-port` file
- Vite client reads this file for proxy configuration
- Run `just ports-clean` to free up stuck ports

## Landing the Plane (Session Completion)

**When ending a work session**, you MUST complete ALL steps below. Work is NOT complete until `git push` succeeds.

**MANDATORY WORKFLOW:**

1. **File issues for remaining work** - Create issues for anything that needs follow-up
2. **Run quality gates** (if code changed) - Tests, linters, builds
3. **Update issue status** - Close finished work, update in-progress items
4. **PUSH TO REMOTE** - This is MANDATORY:
   ```bash
   git pull --rebase
   just beads-sync        # Sync gastown beads
   git push
   git status  # MUST show "up to date with origin"
   ```
5. **Clean up** - Clear stashes, prune remote branches
6. **Verify** - All changes committed AND pushed
7. **Hand off** - Provide context for next session

**CRITICAL RULES:**
- Work is NOT complete until `git push` succeeds
- NEVER stop before pushing - that leaves work stranded locally
- NEVER say "ready to push when you are" - YOU must push
- If push fails, resolve and retry until it succeeds
