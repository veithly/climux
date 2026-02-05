# Project Templates

## Table of Contents
- [CLAUDE.md Templates](#claudemd-templates)
- [AGENTS.md Templates](#agentsmd-templates)
- [Config Presets](#config-presets)

## CLAUDE.md Templates

### Node.js/TypeScript Project

```markdown
# Project: [Name]

## Tech Stack
- Runtime: Node.js 20+
- Language: TypeScript 5.x
- Package Manager: pnpm
- Test Framework: Vitest
- Linting: ESLint + Prettier

## Commands
- `pnpm install` - Install dependencies
- `pnpm build` - Build project
- `pnpm test` - Run tests
- `pnpm lint` - Lint code

## Architecture
- `src/` - Source code
- `src/core/` - Core business logic
- `src/utils/` - Utility functions
- `tests/` - Test files

## Key Patterns
- Use dependency injection for testability
- Prefer composition over inheritance
- All async functions must handle errors
- Export types from index.ts

## Conventions
- File names: kebab-case
- Class names: PascalCase
- Functions: camelCase
- Constants: UPPER_SNAKE_CASE
```

### React/Next.js Project

```markdown
# Project: [Name]

## Tech Stack
- Framework: Next.js 14+ (App Router)
- Language: TypeScript
- Styling: Tailwind CSS
- State: Zustand / React Query
- Testing: Jest + React Testing Library

## Commands
- `pnpm dev` - Development server
- `pnpm build` - Production build
- `pnpm test` - Run tests

## Architecture
- `app/` - Next.js app router pages
- `components/` - React components
- `lib/` - Utility functions
- `hooks/` - Custom React hooks
- `stores/` - State management

## Key Patterns
- Server Components by default
- Client Components only when needed (interactivity)
- Use React Query for server state
- Use Zustand for client state

## Conventions
- Components: PascalCase files
- Hooks: use* prefix
- Server actions in actions.ts
```

### Python Project

```markdown
# Project: [Name]

## Tech Stack
- Runtime: Python 3.11+
- Package Manager: uv
- Testing: pytest
- Linting: ruff
- Type Checking: pyright

## Commands
- `uv sync` - Install dependencies
- `uv run pytest` - Run tests
- `uv run ruff check .` - Lint code

## Architecture
- `src/[package]/` - Main package
- `tests/` - Test files
- `pyproject.toml` - Project config

## Key Patterns
- Type hints on all public functions
- Dataclasses for data structures
- Context managers for resources
- Async/await for I/O operations

## Conventions
- Modules: snake_case
- Classes: PascalCase
- Functions: snake_case
- Constants: UPPER_SNAKE_CASE
```

### Go Project

```markdown
# Project: [Name]

## Tech Stack
- Language: Go 1.21+
- Testing: go test
- Linting: golangci-lint

## Commands
- `go build ./...` - Build
- `go test ./...` - Run tests
- `golangci-lint run` - Lint

## Architecture
- `cmd/` - Entry points
- `internal/` - Private packages
- `pkg/` - Public packages

## Key Patterns
- Accept interfaces, return structs
- Error wrapping with context
- Table-driven tests
- Context propagation
```

## AGENTS.md Templates

### Standard Multi-Agent Setup

```markdown
# Agent Coordination

## Worktree Conventions
- `feature-*` - New features (branch from main)
- `bugfix-*` - Bug fixes (branch from main)
- `hotfix-*` - Production fixes (branch from production)
- `refactor-*` - Code improvements (branch from main)
- `experiment-*` - Exploratory work (branch from main)

## Task Assignment
| Task Type | Preferred Provider | Reason |
|-----------|-------------------|--------|
| New features | claude-code | Best planning |
| Bug fixes | codex | Best debugging |
| UI work | gemini-cli | Best frontend |
| Tests | codex | Systematic coverage |
| Docs | claude-code | Best writing |

## Merge Strategy
- Feature branches: Squash merge
- Bugfix branches: Regular merge
- Hotfix branches: Cherry-pick to production

## Review Requirements
- Security changes: Human review required
- API changes: Human review required
- Database migrations: Human review required
- Config changes: Auto-approve allowed

## Conflict Resolution
1. If worktrees conflict, the first-merged wins
2. Rebase other worktrees after merge
3. Re-run affected tests after rebase

## Communication
- Use session exports for handoffs
- Reference session IDs in commit messages
- Tag related sessions with workspace aliases
```

### High-Parallelism Setup

```markdown
# Agent Coordination - High Parallelism

## Concurrency Settings
```yaml
concurrency:
  maxActiveSessions: 10
  maxSessionsPerWorkspace: 5
```

## Worktree Pool
Maintain pre-created worktrees for fast task starts:
- `pool-1` through `pool-5` - Ready for any task

## Task Queue Strategy
1. Check `climux status` for available slots
2. Assign to first available pool worktree
3. Rename worktree after task assignment
4. Return to pool after completion

## Parallel Task Groups
```bash
# Group 1: Core (sequential)
climux run "task 1" --worktree pool-1

# Group 2: Independent (parallel)
climux run "task 2a" --worktree pool-2 &
climux run "task 2b" --worktree pool-3 &
climux run "task 2c" --worktree pool-4 &
wait

# Group 3: Integration (sequential)
climux run "task 3" --worktree pool-5
```

## Resource Limits
- Max 10 concurrent sessions
- Max $5/hour spend rate
- Pause if rate exceeded
```

## Config Presets

### Development Config

```yaml
# ~/.climux/config.yaml
defaultProvider: claude-code

routing:
  - pattern: "frontend|react|vue|css|ui|style"
    provider: gemini-cli
  - pattern: "debug|fix|bug|error|issue"
    provider: codex
  - pattern: "test|spec|coverage"
    provider: codex
  - pattern: ".*"
    provider: claude-code

fallbackOrder:
  - claude-code
  - gemini-cli
  - codex
  - opencode

concurrency:
  maxActiveSessions: 5
  maxSessionsPerWorkspace: 3

monitoring:
  trackTokens: true
  trackCost: true
  trackGitChanges: true
```

### CI/CD Config

```yaml
# .climux/config.yaml (in project)
defaultProvider: codex

routing:
  - pattern: ".*"
    provider: codex

concurrency:
  maxActiveSessions: 1
  maxSessionsPerWorkspace: 1

monitoring:
  trackTokens: true
  trackCost: true
  trackGitChanges: false
```

### Cost-Conscious Config

```yaml
defaultProvider: opencode

fallbackOrder:
  - opencode
  - gemini-cli
  - codex
  - claude-code

monitoring:
  trackCost: true
  maxDailyBudget: 5.00
```
