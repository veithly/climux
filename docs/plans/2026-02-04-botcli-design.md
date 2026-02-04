# BotCLI Design Document

> **Date**: 2026-02-04
> **Status**: Approved
> **Author**: Claude + User Collaboration

## Overview

BotCLI is a CLI tool that enables AI agents (like OpenClaw) to leverage professional coding CLI tools (Claude Code, Codex, Gemini CLI, OpenCode) for vibe coding tasks. It acts as a unified orchestration layer that routes coding tasks to the most appropriate CLI based on task type and availability.

## Problem Statement

AI agents like OpenClaw have limited programming capabilities compared to professional coding CLI tools. BotCLI bridges this gap by allowing agents to delegate coding tasks to specialized tools while maintaining session context, progress tracking, and quality metrics.

## Core Requirements

### Functional Requirements

1. **Task Execution**
   - Execute coding tasks via professional CLI tools
   - Support both task mode (autonomous) and chat mode (interactive)
   - Automatic CLI selection based on task type

2. **Session Management**
   - Persist sessions with process management
   - Store session metadata in SQLite
   - Support session resume via native CLI mechanisms
   - Session export/import for cross-CLI migration

3. **Workspace Management**
   - Current directory as default workspace
   - Support switching workspaces via commands
   - Git worktree integration for parallel work

4. **Provider Management**
   - Claude Code, Codex, Gemini CLI, OpenCode support
   - Extensible provider architecture
   - Automatic fallback when provider unavailable

5. **MCP & Skill Integration**
   - Expose functionality as MCP Server
   - Manage MCP/Skill installation across CLIs
   - Sync configurations between providers

6. **Monitoring & Analytics**
   - Task status tracking
   - Token consumption and cost estimation
   - Code change tracking (files, lines)
   - Quality metrics (lint, typecheck, tests)
   - Complete session logs

### Non-Functional Requirements

- **Latency**: < 500ms for command parsing and routing
- **Reliability**: Auto-recovery from process crashes
- **Extensibility**: New providers via simple adapter pattern

## Architecture

```
botcli/
├── src/
│   ├── core/
│   │   ├── ProcessManager.ts    # Process lifecycle management
│   │   ├── Router.ts            # Task type → CLI routing
│   │   ├── SessionStore.ts      # SQLite session storage
│   │   └── Workspace.ts         # Workspace management
│   │
│   ├── providers/               # CLI providers
│   │   ├── base.ts              # Abstract base class
│   │   ├── claude-code.ts
│   │   ├── codex.ts
│   │   ├── gemini-cli.ts
│   │   └── opencode.ts
│   │
│   ├── cli/                     # CLI entry points
│   │   ├── index.ts             # Main entry
│   │   └── commands/
│   │       ├── run.ts           # botcli run "task"
│   │       ├── session.ts       # botcli session list/resume/delete
│   │       ├── worktree.ts      # botcli worktree create/switch
│   │       ├── workspace.ts     # botcli workspace switch/info
│   │       ├── config.ts        # botcli config set/get
│   │       ├── status.ts        # botcli status
│   │       ├── stats.ts         # botcli stats
│   │       └── mcp.ts           # botcli mcp serve/install
│   │
│   ├── mcp/                     # MCP Server
│   │   └── server.ts
│   │
│   └── utils/
│       ├── config.ts            # Config loader
│       ├── db.ts                # SQLite wrapper
│       └── metrics.ts           # Metrics collector
│
├── data/
│   └── botcli.db                # SQLite database
│
└── config/
    └── presets/                 # Project presets
```

## Core Components

### 1. ProcessManager

Manages CLI process lifecycle with stdin/stdout piping.

```typescript
interface ProcessManager {
  spawn(sessionId: string, provider: Provider, workspace: Workspace): Promise<ChildProcess>;
  send(sessionId: string, input: string): Promise<void>;
  terminate(sessionId: string): Promise<void>;
  isRunning(sessionId: string): boolean;
}
```

**Responsibilities:**
- Spawn CLI processes with correct cwd and env
- Pipe stdin/stdout for bidirectional communication
- Handle process crashes with auto-recovery
- Manage process pool with concurrency limits

### 2. Router

Routes tasks to appropriate CLI based on task type and availability.

```typescript
interface Router {
  selectProvider(task: string, preferred?: string): Promise<Provider>;
  runWithFallback(task: string, options: RunOptions): Promise<RunResult>;
}
```

**Default Routing Rules:**
- Frontend/UI tasks → Gemini CLI
- Debug/fix tasks → Codex
- General coding → Claude Code

### 3. SessionStore

SQLite-based session persistence.

**Tables:**
- `sessions` - Session metadata (id, workspace, provider, status, etc.)
- `session_logs` - Complete conversation history
- `session_stats` - Token usage, cost, code changes

### 4. Workspace

Manages workspace context and git worktrees.

```typescript
interface Workspace {
  path: string;          // Absolute path
  name: string;          // Workspace name
  gitRoot?: string;      // Git repository root
  worktrees: string[];   // Associated git worktrees
  defaultProvider?: string;
}
```

### 5. Provider (Base Class)

Abstract interface for CLI providers.

```typescript
abstract class BaseProvider {
  abstract name: string;
  abstract command: string;
  abstract capabilities: ProviderCapabilities;

  abstract detect(): Promise<boolean>;
  abstract buildArgs(task: string, options: RunOptions): string[];
  abstract buildResumeArgs(sessionId: string, options: RunOptions): string[];
  abstract parseOutput(output: string): ParsedOutput;
  abstract isTaskComplete(output: string): boolean;
}
```

## CLI Commands

### Task Execution

```bash
# Basic usage (current directory, auto-route)
botcli run "add user authentication"

# Specify provider
botcli run "fix React bug" --provider gemini

# Specify workspace
botcli run "refactor database" --workspace /path/to/project

# Specify worktree
botcli run "implement feature" --worktree feature-branch

# Task mode (non-interactive)
botcli run "add unit tests" --mode task

# Chat mode (interactive)
botcli run "help optimize performance" --mode chat

# Background execution
botcli run "run test suite" --background
```

### Session Management

```bash
botcli session list [--status <status>] [--workspace <path>]
botcli session resume <session-id>
botcli session show <session-id>
botcli session export <session-id> --format markdown
botcli session delete <session-id>
botcli session log <session-id>
```

### Workspace Management

```bash
botcli workspace info
botcli workspace switch <path>
botcli workspace list
botcli workspace alias <name> <path>
```

### Worktree Management

```bash
botcli worktree create <name> [--branch <branch>]
botcli worktree list
botcli worktree switch <name>
botcli worktree delete <name>
```

### Configuration

```bash
botcli config show [--provider <name>]
botcli config set <key> <value>
botcli config export > config.yaml
botcli config import config.yaml
botcli init  # Initialize project config
```

### Monitoring

```bash
botcli status                    # Real-time status panel
botcli stats                     # Today's summary
botcli stats --by provider       # Per-provider breakdown
botcli stats --from 2024-01-01   # Historical stats
```

### MCP & Skills

```bash
botcli mcp serve                 # Start MCP server
botcli mcp list                  # List installed MCPs
botcli mcp install <package>     # Install MCP
botcli skill list                # List skills
botcli skill install <skill>     # Install skill
botcli skill sync                # Sync across providers
```

## MCP Server Tools

When running as MCP server, exposes these tools:

| Tool | Description |
|------|-------------|
| `run_task` | Execute a coding task |
| `session_list` | List sessions |
| `session_resume` | Resume a session |
| `session_send` | Send message to active session |
| `get_status` | Get system status |
| `worktree_create` | Create git worktree |
| `worktree_list` | List worktrees |
| `get_session_stats` | Get session statistics |
| `get_daily_summary` | Get daily metrics summary |

## Database Schema

```sql
CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  workspace_path TEXT NOT NULL,
  provider TEXT NOT NULL,
  task TEXT,
  status TEXT DEFAULT 'pending',
  native_session_id TEXT,
  pid INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE session_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT REFERENCES sessions(id),
  role TEXT,
  content TEXT,
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE session_stats (
  session_id TEXT PRIMARY KEY REFERENCES sessions(id),
  tokens_in INTEGER DEFAULT 0,
  tokens_out INTEGER DEFAULT 0,
  cost_estimate REAL DEFAULT 0,
  files_changed INTEGER DEFAULT 0,
  lines_added INTEGER DEFAULT 0,
  lines_removed INTEGER DEFAULT 0,
  duration_seconds INTEGER DEFAULT 0
);

CREATE TABLE quality_checks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT REFERENCES sessions(id),
  lint_errors INTEGER DEFAULT 0,
  type_errors INTEGER DEFAULT 0,
  tests_passed INTEGER DEFAULT 0,
  tests_failed INTEGER DEFAULT 0,
  checked_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

## Configuration

### Global Config (`~/.botcli/config.yaml`)

```yaml
defaultProvider: claude-code

routing:
  - pattern: "frontend|react|vue|css|ui|style"
    provider: gemini-cli
  - pattern: "debug|fix|bug|error|issue"
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
  runQualityChecks: false

retention:
  sessionLogs: 30d
  completedSessions: 90d
```

### Project Config (`.botcli/config.yaml`)

```yaml
defaultProvider: gemini-cli

routing:
  - pattern: "test|spec"
    provider: codex
  - pattern: ".*"
    provider: gemini-cli

workspaces:
  main: .
  api: ./packages/api
  web: ./packages/web

presets:
  quick-fix:
    mode: task
    provider: claude-code
  frontend-task:
    mode: task
    provider: gemini-cli
```

## Error Handling

### Error Types

| Error Code | Description | Recovery |
|------------|-------------|----------|
| `PROVIDER_NOT_FOUND` | Unknown provider | Suggest alternatives |
| `PROVIDER_NOT_AVAILABLE` | Provider not installed | Auto-fallback |
| `SESSION_NOT_FOUND` | Session doesn't exist | Show recent sessions |
| `PROCESS_CRASHED` | CLI process crashed | Auto-resume if supported |
| `TIMEOUT` | Task timed out | Graceful termination |
| `RATE_LIMITED` | API rate limited | Auto-fallback to next provider |

### Auto-Recovery

1. **Process Crash**: Attempt resume via native session mechanism
2. **Provider Unavailable**: Fallback to next provider in chain
3. **Rate Limit**: Switch to alternative provider

## Technology Stack

- **Language**: TypeScript
- **CLI Framework**: Commander.js
- **Database**: better-sqlite3
- **Process Management**: execa
- **MCP SDK**: @modelcontextprotocol/sdk

## Future Considerations

1. **Web Dashboard**: Real-time monitoring UI
2. **Plugin System**: Community provider extensions
3. **Cloud Sync**: Session sync across machines
4. **Team Features**: Shared configurations and presets
