---
title: "ADR-0001: Monorepo Architecture"
type: adr
status: active
created: 2026-01-10
updated: 2026-01-10
authors:
  - human
  - agent
related:
  - ../plan/phase-0-project-setup.md
tags:
  - architecture
  - monorepo
  - pnpm
  - typescript
adr: "0001"
---

# ADR-0001: Monorepo Architecture

## Status

Accepted

## Date

2026-01-10

## Context

Reckoning requires both a browser-based game client and a backend API server. Key considerations:

1. **Shared Types**: The client and server need to share TypeScript interfaces (e.g., `TTSRequest`, `VoiceRole`, API contracts). Keeping these in sync across separate repositories is error-prone.

2. **Development Experience**: Developers (human and AI agents) need to understand and navigate the full system. A unified codebase reduces context-switching.

3. **Coordinated Deployments**: When API contracts change, client and server often need to update together. Monorepo makes this atomic.

4. **AI Agent Workflow**: AI agents working on this codebase benefit from having all related code discoverable in one place. Beads task tracking works best with a single repository.

5. **Future Services**: We anticipate additional services (AI service, game state service). A monorepo pattern scales to accommodate these.

### Options Considered

**Option A: Monorepo with pnpm workspaces**
- Single repository with `packages/` directory
- Shared dependencies and types
- Unified tooling (ESLint, Prettier, TypeScript)

**Option B: Separate repositories**
- `reckoning-client` and `reckoning-api` repos
- Published npm package for shared types
- Independent versioning and deployment

**Option C: Single package (no workspace)**
- Everything in one `src/` with client/server subdirectories
- Simpler setup but messier as project grows

## Decision

We will use a **monorepo with pnpm workspaces**.

### Structure

```
reckoning/
├── packages/
│   ├── client/          # Vite + TypeScript browser app
│   │   ├── src/
│   │   ├── package.json
│   │   └── vite.config.ts
│   │
│   ├── server/          # Express/Fastify API server
│   │   ├── src/
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   └── shared/          # Shared types, interfaces, utilities
│       ├── src/
│       └── package.json
│
├── docs/                # Documentation (existing)
├── pnpm-workspace.yaml  # Workspace configuration
├── package.json         # Root package.json
├── tsconfig.json        # Base TypeScript config
└── justfile             # Command runner
```

### Package Manager: pnpm

We chose pnpm over npm/yarn because:
- Faster installs via content-addressable storage
- Strict dependency resolution (no phantom dependencies)
- Built-in workspace support
- Lower disk usage

### Package References

- `@reckoning/shared` - imported by both client and server
- `@reckoning/client` - the game frontend
- `@reckoning/server` - the API backend

## Consequences

### Positive

- **Type Safety Across Boundaries**: Change a shared interface, TypeScript catches mismatches in both client and server immediately.
- **Atomic Changes**: A PR can update shared types + client + server together.
- **Simplified Local Dev**: One `pnpm install`, one repo to clone.
- **Unified CI/CD**: Single pipeline can build, test, and deploy everything.
- **Agent Efficiency**: AI agents have full context without cross-repo navigation.

### Negative

- **Larger Clone Size**: Full history of all packages in one repo.
- **Build Complexity**: Need to manage build order (shared → server/client).
- **Deployment Coupling**: May need to deploy server even if only client changed (can be mitigated with change detection).

### Neutral

- **Learning Curve**: Team needs to understand pnpm workspaces (minor, well-documented).
- **Package Versioning**: We'll use fixed versioning (all packages same version) initially; can evolve to independent versioning later if needed.

## References

- [pnpm Workspaces](https://pnpm.io/workspaces)
- [TypeScript Project References](https://www.typescriptlang.org/docs/handbook/project-references.html)
- [Monorepo Explained](https://monorepo.tools/)
