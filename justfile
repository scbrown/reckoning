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

# Quick rebuild server (quiet, only shows errors)
rb:
    @pnpm --filter @reckoning/server build 2>&1 | grep -E "^(error|Error|ERROR)" || echo "✓ Build OK"

# Quick rebuild server (verbose)
rbv:
    pnpm --filter @reckoning/server build

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
# E2E Testing (Playwright)
# ═══════════════════════════════════════════════════════════════════════════════

# Run E2E tests (starts servers automatically)
e2e:
    pnpm --filter @reckoning/client exec playwright test

# Run E2E tests in UI mode
e2e-ui:
    pnpm --filter @reckoning/client exec playwright test --ui

# Run E2E tests in headed mode (visible browser)
e2e-headed:
    pnpm --filter @reckoning/client exec playwright test --headed

# Run E2E tests for a specific browser
e2e-browser browser:
    pnpm --filter @reckoning/client exec playwright test --project={{browser}}

# Install Playwright browsers and dependencies
e2e-install:
    pnpm --filter @reckoning/client exec playwright install
    pnpm --filter @reckoning/client exec playwright install-deps

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
# Beads Task Management (uses gastown beads as source of truth)
# ═══════════════════════════════════════════════════════════════════════════════

# Gastown beads database path
beads_db := "/home/admin/gt/reckoning/.beads/beads.db"

# List all beads tasks
tasks:
    bd --db {{beads_db}} list

# Show tasks ready for work
ready:
    bd --db {{beads_db}} ready

# Add a new task (usage: just add-task "task description")
add-task description:
    bd --db {{beads_db}} create "{{description}}" && bd --db {{beads_db}} sync

# Show task details (usage: just task-info reckoning-xxxx)
task-info id:
    bd --db {{beads_db}} show {{id}}

# Start a task (usage: just start-task reckoning-xxxx)
start-task id:
    bd --db {{beads_db}} start {{id}}

# Mark a task as done (usage: just done reckoning-xxxx)
done id:
    bd --db {{beads_db}} close {{id}}

# Show beads status
beads-status:
    bd --db {{beads_db}} status

# Sync beads with remote
beads-sync:
    bd --db {{beads_db}} sync

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

# Dispatch work to a polecat using the reckoning-work formula
# This ensures polecats follow the structured workflow and submit to refinery
# Usage: just dispatch reckoning-xyz
dispatch issue:
    @echo "Dispatching {{issue}} with reckoning-work formula..."
    gt sling reckoning-work --on {{issue}} reckoning

# List active polecats in the reckoning rig
polecats:
    gt polecat list reckoning

# Check refinery merge queue status
refinery-status:
    gt refinery status reckoning

# Show convoy dashboard (all active work)
convoy:
    gt convoy list

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
# Demo
# ═══════════════════════════════════════════════════════════════════════════════

# Run the demo walkthrough (party, beats, world generation)
demo:
    bash scripts/demo.sh

# Demo specific section (party, beats, world, tts, engine, db, ui)
demo-section section:
    bash scripts/demo.sh --{{section}}

# Show demo help
demo-help:
    bash scripts/demo.sh --help

# ═══════════════════════════════════════════════════════════════════════════════
# TTS Testing
# ═══════════════════════════════════════════════════════════════════════════════

# Test TTS speak endpoint with sample text
tts-test text="Hello, this is a test of the text to speech system.":
    @PORT=$(cat .server-port 2>/dev/null || echo 3001) && \
    curl -s -X POST "http://localhost:$$PORT/api/tts/speak" \
        -H "Content-Type: application/json" \
        -d '{"text": "{{text}}", "role": "narrator"}' \
        -o /tmp/tts-test.mp3 && \
    echo "Audio saved to /tmp/tts-test.mp3" && \
    file /tmp/tts-test.mp3

# Test TTS with specific role
tts-test-role role text:
    @PORT=$(cat .server-port 2>/dev/null || echo 3001) && \
    curl -s -X POST "http://localhost:$$PORT/api/tts/speak" \
        -H "Content-Type: application/json" \
        -d '{"text": "{{text}}", "role": "{{role}}"}' \
        -o /tmp/tts-test.mp3 && \
    echo "Audio saved to /tmp/tts-test.mp3" && \
    file /tmp/tts-test.mp3

# List available TTS voices
tts-voices:
    @PORT=$(cat .server-port 2>/dev/null || echo 3001) && \
    curl -s "http://localhost:$$PORT/api/tts/voices" | jq .

# Show TTS configuration
tts-config:
    @PORT=$(cat .server-port 2>/dev/null || echo 3001) && \
    curl -s "http://localhost:$$PORT/api/tts/config" | jq .

# ═══════════════════════════════════════════════════════════════════════════════
# Utilities
# ═══════════════════════════════════════════════════════════════════════════════

# Kill processes on common dev ports (useful for multi-agent cleanup)
ports-clean:
    @echo "Cleaning up development ports..."
    -fuser -k 3001/tcp 2>/dev/null
    -fuser -k 3002/tcp 2>/dev/null
    -fuser -k 3003/tcp 2>/dev/null
    -fuser -k 5173/tcp 2>/dev/null
    -fuser -k 5174/tcp 2>/dev/null
    -fuser -k 5175/tcp 2>/dev/null
    -fuser -k 5176/tcp 2>/dev/null
    -fuser -k 5177/tcp 2>/dev/null
    @echo "Ports cleaned"

# Show current server port
server-port:
    @cat .server-port 2>/dev/null || echo "Server not running (no .server-port file)"

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
    @bd --db {{beads_db}} status 2>/dev/null || echo "Beads not available"
