---
title: "Git Workflow Guide"
type: guide
status: active
created: 2026-01-19
updated: 2026-01-19
version: "1.0.0"
authors:
  - agent
related:
  - ./export-format-specification.md
  - ./import-guide.md
  - ./plan/export-layer.md
tags:
  - git
  - version-control
  - workflow
  - backup
  - collaboration
---

# Git Workflow Guide

This guide explains how to use Git version control with Reckoning game exports. The TOML export format is designed to be git-friendly, making it easy to track changes, create save points, explore alternate storylines, and share games.

## Table of Contents

1. [Why Git?](#why-git)
2. [Getting Started](#getting-started)
3. [Basic Workflow](#basic-workflow)
4. [Branching for Alternate Stories](#branching-for-alternate-stories)
5. [Collaboration](#collaboration)
6. [Resolving Conflicts](#resolving-conflicts)
7. [Advanced Patterns](#advanced-patterns)
8. [Best Practices](#best-practices)

---

## Why Git?

Using Git with your game exports provides:

- **Complete History**: Every save is tracked; roll back to any point
- **Branching**: Explore "what if" scenarios without losing progress
- **Collaboration**: Share worlds with friends or co-DMs
- **Backup**: Push to GitHub/GitLab for offsite backup
- **Diffing**: See exactly what changed between saves
- **Annotation**: Add commit messages explaining story beats

### Git-Friendly Format

The TOML export format is designed for clean diffs:

```diff
# Easy to see a character leveled up
 [stats]
-health = 85
-max_health = 100
+health = 100
+max_health = 120
```

```diff
# Easy to see a new NPC was added
+[npc]
+id = "npc-mysterious-stranger"
+name = "The Mysterious Stranger"
+description = "A hooded figure who speaks in riddles"
+disposition = "neutral"
```

---

## Getting Started

### Prerequisites

- Git installed (`git --version`)
- A Reckoning game to export
- Basic familiarity with terminal commands

### Initial Setup

1. **Export your game to TOML format:**

```bash
reckoning export --format toml --output ./my-adventure/ <game-id>
```

2. **Initialize a Git repository:**

```bash
cd my-adventure
git init
```

3. **Create initial commit:**

```bash
git add .
git commit -m "Initial game export: Session 1 - Character creation"
```

4. **Optional: Push to remote repository:**

```bash
# Create a new repository on GitHub/GitLab first, then:
git remote add origin https://github.com/username/my-adventure.git
git push -u origin main
```

---

## Basic Workflow

### Saving Your Progress

After each play session, re-export and commit:

```bash
# Export current game state (overwrites existing files)
reckoning export --format toml --output ./my-adventure/ <game-id>

# See what changed
cd my-adventure
git status
git diff

# Commit the changes
git add .
git commit -m "Session 5: Defeated the bandits, gained Thorne's trust"
```

### Viewing History

```bash
# See commit history
git log --oneline

# Example output:
# a1b2c3d Session 5: Defeated the bandits, gained Thorne's trust
# e4f5g6h Session 4: Arrived at the crossroads, met Guard Captain Thorne
# i7j8k9l Session 3: Left the village, traveled through the forest
# m0n1o2p Session 2: Accepted the merchant's quest
# q3r4s5t Initial game export: Session 1 - Character creation
```

### Rolling Back

To restore a previous save:

```bash
# View the state at a specific commit
git checkout a1b2c3d

# Or create a new branch from that point
git checkout -b alternate-story a1b2c3d

# To permanently revert (destructive!)
git reset --hard a1b2c3d
```

---

## Branching for Alternate Stories

Git branches let you explore different story paths without losing your main progress.

### Creating a Story Branch

```bash
# At a decision point, create a branch
git checkout -b path-help-bandits

# Make different choices, export, commit
reckoning export --format toml --output ./my-adventure/ <game-id>
git add .
git commit -m "Chose to help the bandits instead"
```

### Switching Between Stories

```bash
# List all branches
git branch
# * path-help-bandits
#   main
#   path-betray-thorne

# Switch to main story
git checkout main

# Import to resume that storyline
reckoning import ./my-adventure/
```

### Example Branch Structure

```
main (primary story)
├── Session 1: Character creation
├── Session 2: Accepted quest
├── Session 3: Forest journey
├── Session 4: Met Thorne ◄─────────┐
│   └── Session 5: Helped Thorne    │
│       └── Session 6: Castle siege │
│                                   │
└── path-betray-thorne (branched)   │
    └── Session 5-alt: Betrayed ────┘
        └── Session 6-alt: Outlaw life
```

---

## Collaboration

### Sharing Your World

Push your repository to GitHub/GitLab to share with others:

```bash
git push origin main
```

Others can clone and play:

```bash
git clone https://github.com/username/my-adventure.git
cd my-adventure
reckoning import .
```

### Co-DM Workflow

Multiple DMs can contribute to the same world:

1. **Fork or clone the repository**
2. **Create a branch for your session:**
   ```bash
   git checkout -b dm-alice-session-7
   ```
3. **Run your session, export, commit**
4. **Push and create a pull request**
5. **Primary DM reviews and merges**

### Player-DM Workflow

Players can submit character updates:

1. Player edits their character file directly:
   ```bash
   vim characters/player.toml
   # Update backstory, add notes, etc.
   ```
2. Player commits and pushes
3. DM pulls changes before next session

---

## Resolving Conflicts

Conflicts occur when the same file is modified in different branches.

### Understanding Conflict Markers

```toml
# relationships.toml after a merge conflict
[[relationships]]
id = "rel-player-thorne"
from_id = "player-uuid"
to_id = "npc-thorne"
<<<<<<< HEAD
# Your version (current branch)
[relationships.dimensions]
trust = 0.8
respect = 0.7
=======
# Their version (incoming branch)
[relationships.dimensions]
trust = 0.3
respect = 0.4
>>>>>>> path-betray-thorne
```

### Resolving the Conflict

1. **Edit the file** to keep the correct values:
   ```toml
   [[relationships]]
   id = "rel-player-thorne"
   from_id = "player-uuid"
   to_id = "npc-thorne"
   [relationships.dimensions]
   trust = 0.8
   respect = 0.7
   ```

2. **Mark as resolved:**
   ```bash
   git add relationships.toml
   git commit -m "Merge: kept main storyline relationship values"
   ```

### Conflict-Prone Files

Some files are more likely to conflict:

| File | Conflict Likelihood | Strategy |
|------|---------------------|----------|
| `game.toml` | High | Turn count always conflicts; take higher |
| `relationships.toml` | High | Decide which story is canonical |
| `events/events.jsonl` | Medium | May need to interleave or pick one |
| `flags.toml` | Medium | Merge flags from both branches |
| `scenes/index.toml` | Low | Usually additive |
| `characters/player.toml` | Low | Should be same across branches |

### Merge Tools

Use a visual merge tool for complex conflicts:

```bash
# Configure a merge tool (one-time setup)
git config --global merge.tool vimdiff
# or: meld, kdiff3, vscode, etc.

# Use it during conflicts
git mergetool
```

---

## Advanced Patterns

### Tagging Milestones

Mark significant story events with tags:

```bash
# Tag a major story milestone
git tag -a "act-1-complete" -m "Completed Act 1: The Gathering Storm"

# Tag a character death
git tag -a "aria-death" -m "Companion Aria fell in battle"

# List tags
git tag

# Checkout a tag
git checkout act-1-complete
```

### Squashing Sessions

Combine multiple small commits into one:

```bash
# Squash last 3 commits into one
git rebase -i HEAD~3

# In the editor, change 'pick' to 'squash' for commits to combine
# Save and write a new combined message
```

### Stashing Work-in-Progress

Temporarily save uncommitted changes:

```bash
# Save current changes
git stash push -m "Mid-session save"

# Do something else (switch branches, etc.)

# Restore changes
git stash pop
```

### Git Hooks for Auto-Export

Automate exports with git hooks (advanced):

```bash
# .git/hooks/post-commit
#!/bin/bash
# Auto-export after each commit
GAME_ID="your-game-id"
reckoning export --format toml --output . $GAME_ID
```

---

## Best Practices

### Commit Messages

Write descriptive commit messages that capture story beats:

```bash
# Good commit messages
git commit -m "Session 7: Infiltrated the thieves guild, learned about the artifact"
git commit -m "Character update: Kira gains 'battle-hardened' trait after siege"
git commit -m "World building: Added three new NPCs to the market district"

# Avoid vague messages
git commit -m "Update"  # Bad
git commit -m "Changes" # Bad
git commit -m "Save"    # Bad
```

### Branch Naming

Use consistent branch names:

```
main                    # Primary canon storyline
alt/betrayed-thorne     # Alternate path
alt/saved-aria          # Another alternate path
wip/dm-notes            # Work in progress
player/backstory-update # Player contributions
```

### .gitignore

Create a `.gitignore` for files you don't want tracked:

```gitignore
# .gitignore for Reckoning exports

# Temporary files
*.tmp
*.bak

# OS files
.DS_Store
Thumbs.db

# Editor files
*.swp
*~

# Keep events but ignore very large backups
events/events-backup-*.jsonl
```

### Backup Strategy

1. **Local commits** - After every session
2. **Remote push** - At least weekly
3. **Tags** - At major story milestones
4. **Archive** - Occasional zip of full repo

### Repository Organization

For multiple games, consider:

```
reckoning-campaigns/
├── dragons-quest/         # Game 1
│   ├── .git/
│   ├── manifest.toml
│   └── ...
├── shadow-realm/          # Game 2
│   ├── .git/
│   └── ...
└── shared-world/          # Shared campaign setting
    ├── .git/
    └── ...
```

Or a monorepo approach:

```
my-reckoning-games/
├── .git/
├── games/
│   ├── dragons-quest/
│   └── shadow-realm/
└── shared/
    └── custom-traits.toml
```

---

## Quick Reference

### Common Commands

| Command | Purpose |
|---------|---------|
| `git status` | See what's changed |
| `git diff` | View changes in detail |
| `git add .` | Stage all changes |
| `git commit -m "msg"` | Save changes |
| `git log --oneline` | View history |
| `git checkout <commit>` | View old state |
| `git branch <name>` | Create branch |
| `git checkout <branch>` | Switch branch |
| `git merge <branch>` | Merge branch |
| `git push` | Upload to remote |
| `git pull` | Download from remote |

### Workflow Cheatsheet

```bash
# After each session
reckoning export --format toml --output ./my-game/ $GAME_ID
cd my-game
git add .
git commit -m "Session N: <summary>"
git push  # if using remote

# To try alternate path
git checkout -b alt/different-choice
# ... play alternate path ...
reckoning export --format toml --output ./my-game/ $GAME_ID
git add .
git commit -m "Alt path: <description>"

# To return to main story
git checkout main
reckoning import ./my-game/
```

---

## Related Documentation

- [Export Format Specification](./export-format-specification.md) - Detailed format schema
- [Import Guide](./import-guide.md) - Importing game state
- [Export Layer Plan](./plan/export-layer.md) - Design overview
