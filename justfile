# Reckoning RPG Game - Justfile
# Run `just` to see all available recipes

# Default recipe - show help
default:
    @just --list

# ═══════════════════════════════════════════════════════════════════════════════
# Development
# ═══════════════════════════════════════════════════════════════════════════════

# Start all services (client + server + infrastructure)
dev: infra-up
    pnpm run dev

# Start only the client (Vite dev server)
dev-client:
    pnpm run dev:client

# Start only the server (Fastify)
dev-server:
    pnpm run dev:server

# ═══════════════════════════════════════════════════════════════════════════════
# Building
# ═══════════════════════════════════════════════════════════════════════════════

# Build all packages
build:
    pnpm run build

# Build only the client
build-client:
    pnpm run build:client

# Build only the server
build-server:
    pnpm run build:server

# ═══════════════════════════════════════════════════════════════════════════════
# Testing & Quality
# ═══════════════════════════════════════════════════════════════════════════════

# Run all tests
test:
    pnpm run test

# Run client tests
test-client:
    pnpm run test:client

# Run server tests
test-server:
    pnpm run test:server

# Run TypeScript type checking
typecheck:
    pnpm run typecheck

# Run ESLint
lint:
    pnpm run lint

# Format code with Prettier
format:
    pnpm run format

# Check formatting without making changes
format-check:
    pnpm run format:check

# ═══════════════════════════════════════════════════════════════════════════════
# Infrastructure
# ═══════════════════════════════════════════════════════════════════════════════

# Start infrastructure services (Redis)
infra-up:
    docker compose up -d

# Stop infrastructure services
infra-down:
    docker compose down

# View infrastructure logs
infra-logs:
    docker compose logs -f

# Reset infrastructure (remove volumes)
infra-reset:
    docker compose down -v

# ═══════════════════════════════════════════════════════════════════════════════
# Setup & Installation
# ═══════════════════════════════════════════════════════════════════════════════

# Install all dependencies
install:
    pnpm install

# Full project setup (install + infrastructure)
setup: install infra-up
    @echo ""
    @echo "✓ Setup complete!"
    @echo "  Run 'just dev' to start development"

# Check all dependencies are installed
check-deps:
    @echo "Checking dependencies..."
    @echo ""
    @echo "Node.js:  $(node --version 2>/dev/null || echo 'NOT FOUND')"
    @echo "pnpm:     $(pnpm --version 2>/dev/null || echo 'NOT FOUND')"
    @echo "Docker:   $(docker --version 2>/dev/null || echo 'NOT FOUND')"
    @echo "Go:       $(go version 2>/dev/null || echo 'NOT FOUND (optional)')"
    @echo "beads:    $(bd --version 2>/dev/null || echo 'NOT FOUND (optional)')"
    @echo "gastown:  $(gt --version 2>/dev/null || echo 'NOT FOUND (optional)')"

# Clean build artifacts and dependencies
clean:
    pnpm run clean
    rm -rf node_modules packages/*/node_modules

# ═══════════════════════════════════════════════════════════════════════════════
# Documentation
# ═══════════════════════════════════════════════════════════════════════════════

# Lint documentation (check frontmatter)
docs-lint:
    bash scripts/lint-docs.sh

# Lint docs with verbose output
docs-lint-verbose:
    bash scripts/lint-docs.sh --verbose

# Check specific doc file
docs-check file:
    bash scripts/lint-docs.sh "{{file}}"

# ═══════════════════════════════════════════════════════════════════════════════
# Beads Task Management
# ═══════════════════════════════════════════════════════════════════════════════

# Initialize beads for the project
init-beads:
    bd init

# List all beads tasks
tasks:
    bd list

# Show tasks ready for work
ready:
    bd ready

# Add a new task (usage: just add-task "task description")
add-task description:
    bd add "{{description}}"

# Show task details (usage: just task-info bd-xxxx)
task-info id:
    bd show {{id}}

# Start a task (usage: just start-task bd-xxxx)
start-task id:
    bd start {{id}}

# Mark a task as done (usage: just done bd-xxxx)
done id:
    bd done {{id}}

# Show beads status
beads-status:
    bd status

# ═══════════════════════════════════════════════════════════════════════════════
# Gastown Multi-Agent Coordination
# ═══════════════════════════════════════════════════════════════════════════════

# Initialize gastown workspace
init-gastown:
    gt install ~/gt --git

# List active agents
agents:
    gt crew list

# Add a new agent crew member (usage: just add-agent name)
add-agent name:
    gt crew add {{name}}

# ═══════════════════════════════════════════════════════════════════════════════
# Git Shortcuts
# ═══════════════════════════════════════════════════════════════════════════════

# Quick commit with message
commit message:
    git add -A && git commit -m "{{message}}"

# Push to remote
push:
    git push

# Pull latest changes
pull:
    git pull

# Show recent git log
log:
    git log --oneline -10

# ═══════════════════════════════════════════════════════════════════════════════
# Claude Dev Container
# ═══════════════════════════════════════════════════════════════════════════════

# Build the Claude development container
claude-build:
    docker build -f Dockerfile.claude -t claude-dev .

# Run Claude dev container interactively
# Uses named volume for full home directory persistence
claude-run:
    docker run -it \
        -v claude-home:/home/admin \
        -v "$(pwd)":/home/admin/workspace/reckoning \
        -v /var/run/docker.sock:/var/run/docker.sock \
        -p 3001:3001 \
        -p 5173:5173 \
        -p 5174:5174 \
        --add-host=host.docker.internal:host-gateway \
        --name claude-dev-container \
        claude-dev

# Run Claude dev container in detached mode
claude-start:
    docker run -dit --name claude-dev-container \
        -v claude-home:/home/admin \
        -v "$(pwd)":/home/admin/workspace/reckoning \
        -v /var/run/docker.sock:/var/run/docker.sock \
        -p 3001:3001 \
        -p 5173:5173 \
        -p 5174:5174 \
        --add-host=host.docker.internal:host-gateway \
        claude-dev

# Attach to running Claude dev container
claude-attach:
    docker exec -it -u admin claude-dev-container bash

# Stop Claude dev container (keeps container for later)
# WARNING: May interrupt running processes
claude-stop:
    @echo "WARNING: This will stop the container and may interrupt running processes."
    @echo "Your home directory volume will be preserved."
    @read -p "Are you sure? [y/N] " confirm && [ "$$confirm" = "y" ] || (echo "Cancelled." && exit 1)
    docker stop claude-dev-container

# Remove Claude dev container (volume persists, safe to remove)
claude-rm:
    @echo "WARNING: This will remove the container."
    @echo "Your home directory volume will be preserved."
    @read -p "Are you sure? [y/N] " confirm && [ "$$confirm" = "y" ] || (echo "Cancelled." && exit 1)
    docker rm claude-dev-container

# ═══════════════════════════════════════════════════════════════════════════════
# Project Status
# ═══════════════════════════════════════════════════════════════════════════════

# Check project health
check:
    @echo "╔═══════════════════════════════════════════════════════════╗"
    @echo "║              RECKONING PROJECT STATUS                      ║"
    @echo "╚═══════════════════════════════════════════════════════════╝"
    @echo ""
    @echo "=== Dependencies ==="
    @just check-deps
    @echo ""
    @echo "=== Git Status ==="
    @git status --short 2>/dev/null || echo "Not a git repository"
    @echo ""
    @echo "=== Infrastructure ==="
    @docker compose ps 2>/dev/null || echo "Docker not available"
    @echo ""
    @echo "=== Beads Status ==="
    @bd status 2>/dev/null || echo "Beads not initialized - run: just init-beads"
