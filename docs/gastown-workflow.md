---
title: Gastown Workflow Customizations
type: guide
status: active
created: 2026-01-10
updated: 2026-01-10
authors:
  - human
  - agent
related:
  - ../AGENTS.md
  - ./plan/README.md
tags:
  - gastown
  - workflow
  - formulas
  - agents
---

# Gastown Workflow Customizations

This document describes Reckoning's customizations to the Gastown multi-agent workflow system, how to modify them, and ideas for future enhancements.

## Overview

Gastown uses **formulas** to define structured workflows for agents. Formulas are TOML files that specify:
- Steps with dependencies
- Entry/exit criteria for each step
- Variables for customization
- Project-specific tooling

Our formulas live in `.beads/formulas/` and are committed to the repo.

## Current Formulas

### `reckoning-work`

Our primary workflow formula, based on `mol-polecat-work` but customized for the Reckoning TypeScript monorepo.

**Location:** `.beads/formulas/reckoning-work.formula.toml`

**Steps:**
```
load-context → branch-setup → preflight-checks → implement →
self-review → run-checks → cleanup-workspace → prepare-for-review → submit-and-exit
```

**Customizations from upstream:**

| Step | Customization |
|------|---------------|
| `load-context` | Loads CLAUDE.md, docs/plan/README.md, reviews ADRs |
| `preflight-checks` | Uses `just check` instead of `go test` |
| `implement` | TypeScript conventions, TTS testing guidance |
| `run-checks` | `just check`, `just docs-lint`, `just tts-test` |

**Key project-specific additions:**
- TypeScript strict mode enforcement (no `any` types)
- `@reckoning/shared` import patterns
- TTS validation for Phase 1 features
- Docs linting for markdown changes

## Mayor Dispatch Protocol

**The Mayor MUST use the `just dispatch` recipe for the reckoning rig.**

### Dispatching Work

```bash
cd ~/gt/reckoning/mayor/rig
just dispatch <issue-id>     # e.g., just dispatch reckoning-xyz
```

This recipe runs `gt sling reckoning-work --on <issue> reckoning` which:
1. Instantiates the `reckoning-work` formula
2. Spawns a polecat with the structured workflow
3. Polecat follows defined steps through to MR submission

**DO NOT use bare `gt sling <issue> reckoning`** - polecats won't follow the formula.

### Merge Flow: Refinery Only

```
Polecat completes work
    ↓
Polecat runs: gt done
    ↓
MR bead created in merge queue
    ↓
Refinery processes MR (rebase, verify, merge)
    ↓
Refinery closes the issue bead
```

**CRITICAL:** The Mayor coordinates but does NOT merge code directly.
- ✅ Nudge refinery: `gt nudge reckoning/refinery "Process queue"`
- ✅ Push polecat branches if they forgot
- ✅ Close beads after refinery merges (if not auto-closed)
- ❌ NEVER run `git merge` on polecat branches
- ❌ NEVER bypass the refinery workflow

### Monitoring Commands

```bash
just polecats          # List active polecats
just refinery-status   # Check merge queue
just convoy            # Show convoy dashboard
bd ready               # Issues ready to dispatch
bd blocked             # Issues waiting on dependencies
```

### Known Limitation

The `--on` flag doesn't support `--var`, so the formula's `issue` variable
must be derived from the hook_bead. The `just dispatch` recipe handles this,
but if formula instantiation fails, fall back to direct sling:

```bash
gt sling <issue-id> reckoning/<polecat-name>
```

---

## How to Use Formulas

### Dispatch work with a formula

```bash
# Apply formula to an issue and sling to a rig
gt sling reckoning-work --on <issue-id> <target-rig>

# Apply formula to yourself
gt sling reckoning-work --on <issue-id>

# Just sling an issue (no formula, freestyle)
gt sling <issue-id> <target-rig>
```

### View available formulas

```bash
gt formula list                    # List all formulas
gt formula show reckoning-work     # Show formula details
```

### Attach formula to current work

```bash
gt mol attach reckoning-work       # Attach to your hook
gt mol progress                    # See step progress
gt mol step done                   # Complete current step
```

## Creating New Formulas

### Formula Types

| Type | Purpose | Example |
|------|---------|---------|
| `workflow` | Linear steps with dependencies | `reckoning-work` |
| `convoy` | Parallel execution with synthesis | `design`, `code-review` |
| `expansion` | Iterative refinement passes | `rule-of-five` |

### Create from template

```bash
gt formula create my-workflow      # Creates template in .beads/formulas/
```

### Formula structure

```toml
description = "What this formula does"
formula = "formula-name"
type = "workflow"
version = 1

[[steps]]
id = "step-1"
title = "First Step"
description = """
Detailed instructions for this step.

**Commands:**
```bash
just check
```

**Exit criteria:** What must be true to proceed.
"""

[[steps]]
id = "step-2"
title = "Second Step"
needs = ["step-1"]
description = "..."

[vars]
[vars.issue]
description = "The issue being worked on"
required = true
```

## Modifying Formulas

### Edit an existing formula

1. Open `.beads/formulas/<formula>.formula.toml`
2. Make changes
3. Bump the `version` number
4. Test with `gt formula show <formula>`
5. Commit the changes

### Adding project tooling

When adding new `just` recipes or tooling:
1. Update relevant formula steps to use the new commands
2. Document in the step description
3. Add to AGENTS.md if agents need to know about it

## Ideas for Future Formulas

### `reckoning-ai-prompt`
For developing and testing AI prompts (DM Engine, Chronicle, etc.):
- **draft**: Write initial prompt
- **test-cases**: Define test scenarios
- **iterate**: Run against test cases, refine
- **document**: Add to prompt library

### `reckoning-design` (convoy)
Parallel design exploration for game features:
- **mechanics**: Game mechanics analysis
- **narrative**: Story/Chronicle integration
- **psychology**: Player psychology (Pattern Engine)
- **technical**: Implementation approach
- **synthesis**: Combine into design doc

### `reckoning-phase-delivery`
End-of-phase validation:
- **typecheck**: Full TypeScript check
- **test**: All tests pass
- **build**: Production build succeeds
- **docs**: All docs lint clean
- **demo**: Manual feature verification
- **changelog**: Update changelog
- **tag**: Create release tag

### `reckoning-review` (convoy)
Specialized code review for RPG codebase:
- **correctness**: Logic errors
- **security**: Input validation, API keys
- **ai-safety**: Prompt injection risks
- **performance**: TTS latency, caching
- **synthesis**: Unified review

## Formula Search Path

Formulas are loaded in order:
1. `.beads/formulas/` - Project (committed, team-shared)
2. `~/.beads/formulas/` - User (personal, not committed)
3. `$GT_ROOT/.beads/formulas/` - Gastown (built-in defaults)

Project formulas override user/global formulas with the same name.

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Formula not found | Check `gt formula list`, verify file is in `.beads/formulas/` |
| TOML parse error | Validate syntax, check for unescaped quotes |
| Step not running | Check `needs` dependencies are satisfied |
| Variables missing | Ensure required vars are passed via `--var key=value` |

## References

- [Gastown documentation](https://github.com/steveyegge/gastown)
- [Beads task tracking](https://github.com/steveyegge/beads)
- [TOML specification](https://toml.io/en/)
