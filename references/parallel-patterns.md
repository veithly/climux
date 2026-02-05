# Parallel Execution Patterns

## Table of Contents
- [Multi-Agent Orchestration](#multi-agent-orchestration)
- [Worktree Lifecycle](#worktree-lifecycle)
- [Session Chaining](#session-chaining)
- [Resource Management](#resource-management)

## Multi-Agent Orchestration

### Pattern 1: Feature Decomposition

Split a large feature into parallel subtasks:

```bash
# 1. Create worktrees for each component
climux worktree create feat-backend --branch feature/user-auth
climux worktree create feat-frontend --branch feature/user-auth-ui
climux worktree create feat-tests --branch feature/user-auth-tests

# 2. Launch parallel tasks
climux run "implement JWT auth backend with login/logout/refresh" \
  --worktree feat-backend --mode task --provider claude-code &

climux run "create login/signup React components with form validation" \
  --worktree feat-frontend --mode task --provider gemini-cli &

climux run "write integration tests for auth flow" \
  --worktree feat-tests --mode task --provider codex &

# 3. Monitor progress
watch -n 5 climux status

# 4. After completion, merge worktrees
cd feat-backend && git push origin feature/user-auth
cd ../feat-frontend && git push origin feature/user-auth-ui
cd ../feat-tests && git push origin feature/user-auth-tests
```

### Pattern 2: Bug Fix Swarm

Attack multiple bugs simultaneously:

```bash
# Create worktrees for each bug
for bug in 123 456 789; do
  climux worktree create bugfix-$bug --branch bugfix/$bug
  climux run "fix issue #$bug: $(gh issue view $bug --json title -q .title)" \
    --worktree bugfix-$bug --mode task &
done
```

### Pattern 3: Refactoring Pipeline

Sequential-dependent refactoring with parallel independent steps:

```bash
# Phase 1: Independent refactors (parallel)
climux worktree create refactor-models
climux worktree create refactor-utils
climux worktree create refactor-types

climux run "refactor models to use TypeScript generics" --worktree refactor-models &
climux run "extract common utils to shared module" --worktree refactor-utils &
climux run "add strict TypeScript types" --worktree refactor-types &

# Wait for Phase 1
wait

# Phase 2: Integration (sequential, uses results from Phase 1)
climux run "integrate refactored modules and fix imports" --mode task
```

## Worktree Lifecycle

### Creation Best Practices

```bash
# Always create from a clean branch point
climux worktree create <name> --branch <base-branch>

# Naming conventions
# feature-*   : New features
# bugfix-*    : Bug fixes
# refactor-*  : Code refactoring
# experiment-*: Experimental work
# hotfix-*    : Production hotfixes
```

### Cleanup After Completion

```bash
# List all worktrees
climux worktree list

# Delete completed worktrees
climux worktree delete feature-auth

# Batch cleanup
for wt in $(climux worktree list --format names); do
  if [[ $wt == experiment-* ]]; then
    climux worktree delete $wt
  fi
done
```

### Worktree Isolation Rules

1. **One task per worktree** - Avoid running multiple tasks in the same worktree
2. **Branch alignment** - Worktree name should match branch purpose
3. **Clean state** - Ensure worktree is clean before starting new task
4. **Merge promptly** - Don't let worktrees diverge too far from main

## Session Chaining

### Continue Previous Work

```bash
# Find relevant past session
climux session list --workspace /path/to/project

# Resume with context
climux session resume abc123

# Or start new session that references old one
climux run "continue the auth implementation from session abc123, \
  specifically finish the token refresh logic" --mode task
```

### Export and Import Context

```bash
# Export session for documentation
climux session export abc123 --format md > auth-implementation.md

# Use exported context in new task
climux run "review auth-implementation.md and add rate limiting" --mode task
```

### Session Dependencies

```bash
# Chain sessions with explicit dependencies
SESSION1=$(climux run "create database schema" --mode task --json | jq -r .sessionId)
climux session wait $SESSION1

SESSION2=$(climux run "implement models based on schema" --mode task --json | jq -r .sessionId)
climux session wait $SESSION2

climux run "add API endpoints for models" --mode task
```

## Resource Management

### Concurrency Limits

```yaml
# ~/.climux/config.yaml
concurrency:
  maxActiveSessions: 5        # Total concurrent sessions
  maxSessionsPerWorkspace: 3  # Per workspace limit
```

### Check Before Starting

```bash
# Always check status before launching parallel tasks
climux status

# If at capacity, wait for slots
while [[ $(climux status --json | jq .activeSessions) -ge 5 ]]; do
  sleep 10
done

# Then launch new task
climux run "new task" --mode task
```

### Cost Monitoring

```bash
# Check costs before launching expensive parallel work
climux stats --by provider

# Set budget limits in config
# ~/.climux/config.yaml
monitoring:
  maxDailyBudget: 10.00  # USD
  alertThreshold: 0.80   # Alert at 80%
```
