---
title: Contributing Guide
type: contributing
status: active
created: 2026-01-10
updated: 2026-01-10
authors:
  - human
related:
  - ./AGENTS.md
  - ./docs/plan/phase-0-project-setup.md
tags:
  - contributing
  - setup
  - development
---

# Contributing to Reckoning RPG

Welcome! This document covers how to set up your development environment and contribute to the project.

## Project Dependencies

| Tool | Version | Purpose |
|------|---------|---------|
| Go | 1.23+ | Build tool dependencies |
| beads (bd) | 0.44.0+ | Task/issue tracking for agents |
| gastown (gt) | latest | Multi-agent coordination |
| just | latest | Command runner |
| Git | 2.25+ | Version control |

## Installation Guide

### 1. Install Go

**Option A: System package manager**

```bash
# Ubuntu/Debian
sudo apt install golang-go

# macOS
brew install go

# Windows
winget install GoLang.Go
```

**Option B: Manual installation (no sudo required)**

```bash
# Download and extract Go
curl -fsSL https://go.dev/dl/go1.23.4.linux-amd64.tar.gz -o /tmp/go.tar.gz
mkdir -p ~/local
tar -C ~/local -xzf /tmp/go.tar.gz
rm /tmp/go.tar.gz

# Add to your shell profile (~/.bashrc or ~/.zshrc)
export PATH="$HOME/local/go/bin:$HOME/go/bin:$PATH"
```

### 2. Install beads (bd)

```bash
go install github.com/steveyegge/beads/cmd/bd@latest
```

Verify installation:
```bash
bd --version
```

### 3. Install gastown (gt)

```bash
go install github.com/steveyegge/gastown/cmd/gt@latest
```

Verify installation:
```bash
gt --version
```

### 4. Install just

**Option A: Quick install script**

```bash
curl --proto '=https' --tlsv1.2 -sSf https://just.systems/install.sh | bash -s -- --to ~/local/bin
```

**Option B: Package manager**

```bash
# macOS
brew install just

# Ubuntu/Debian (if available)
sudo apt install just

# Cargo
cargo install just
```

Verify installation:
```bash
just --version
```

### 5. Set up PATH

Add the following to your shell profile (`~/.bashrc`, `~/.zshrc`, or equivalent):

```bash
export PATH="$HOME/local/go/bin:$HOME/go/bin:$HOME/local/bin:$PATH"
```

Then reload your shell:
```bash
source ~/.bashrc  # or ~/.zshrc
```

## Project Setup

After installing dependencies:

```bash
# Clone the repository
git clone <repository-url>
cd reckoning

# Initialize beads (first time only)
just init-beads

# Verify everything works
just check
```

## Development Workflow

1. **Check available tasks**: `just tasks` or `bd list`
2. **Pick up a task**: `bd start <task-id>`
3. **Make changes** and test locally
4. **Commit**: `just commit "Your message"`
5. **Complete task**: `just done <task-id>`

## Getting Help

- Run `just` to see all available commands
- Check `AGENTS.md` for AI agent guidelines
- Review existing code for patterns and conventions
