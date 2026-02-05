---
name: climux
description: |
  CLI multiplexer for delegating coding tasks to professional AI coding tools (Claude Code, Codex, Gemini CLI, OpenCode).

  Use this skill when:
  - Delegating complex coding tasks to specialized AI coding agents
  - Running parallel coding sessions across multiple git worktrees
  - Resuming previous coding sessions to maintain context
  - Orchestrating multi-agent workflows for large features
  - Initializing project documentation (CLAUDE.md, AGENTS.md)
  - Tracking costs and token usage across sessions

  Triggers: "use climux", "delegate to codex/claude/gemini", "parallel coding", "multi-agent", "resume session", "coding worktree"
---

# Climux

Orchestrate AI coding agents through a unified CLI interface.

## Quick Start

```bash
# Run a task (auto-routes to best provider)
climux run "implement feature X" --mode task

# Use specific provider
climux run "fix bug" --provider codex --mode task

# Resume previous session
climux session resume <session-id>
```

## Multi-Agent Parallel Execution

Create isolated worktrees and run tasks in parallel:

```bash
# Create worktrees for parallel work
climux worktree create feature-auth
climux worktree create feature-api
climux worktree create feature-ui

# Run parallel tasks (use & for background)
climux run "implement auth" --worktree feature-auth --mode task &
climux run "build API" --worktree feature-api --mode task &
climux run "create UI" --worktree feature-ui --mode task &

# Monitor all sessions
climux status
```

## Session Memory & Resume

Reuse previous session context:

```bash
# List sessions to find previous work
climux session list --status completed

# Resume with full context preserved
climux session resume <session-id>

# View session history
climux session log <session-id>

# Export for documentation
climux session export <session-id> --format md
```

## Project Initialization

Initialize project documentation for AI agents:

```bash
# Initialize climux config
climux config init

# Create workspace alias for quick access
climux workspace alias myproject .
```

Then create these files manually:

**CLAUDE.md** - Project context for Claude:
```markdown
# Project: [Name]
## Tech Stack: [frameworks, languages]
## Key Patterns: [architecture decisions]
## Testing: [how to run tests]
```

**AGENTS.md** - Multi-agent coordination rules:
```markdown
# Agent Coordination
## Worktree Naming: feature-*, bugfix-*, refactor-*
## Merge Strategy: squash commits
## Review Required: security changes
```

## Command Reference

| Command | Purpose |
|---------|---------|
| `climux run "<task>" --mode task` | Execute autonomous task |
| `climux run "<task>" --provider <name>` | Use specific provider |
| `climux run "<task>" --worktree <name>` | Run in worktree |
| `climux session list` | List all sessions |
| `climux session resume <id>` | Resume session |
| `climux worktree create <name>` | Create git worktree |
| `climux worktree list` | List worktrees |
| `climux status` | Show active sessions |
| `climux stats` | Show usage statistics |

## Provider Selection

| Pattern | Best Provider | Use Case |
|---------|---------------|----------|
| `frontend\|react\|vue\|css` | gemini-cli | UI/frontend |
| `debug\|fix\|bug\|error` | codex | Debugging |
| General tasks | claude-code | Default |

## Advanced Patterns

See [references/parallel-patterns.md](references/parallel-patterns.md) for:
- Complex multi-agent orchestration
- Worktree lifecycle management
- Session chaining strategies

See [references/project-templates.md](references/project-templates.md) for:
- CLAUDE.md templates by project type
- AGENTS.md coordination patterns
- Config presets

## Error Recovery

```bash
# If session crashed, resume it
climux session list --status crashed
climux session resume <session-id>

# If provider unavailable, fallback is automatic
# Order: claude-code → gemini-cli → codex → opencode
```
