# Climux

> **Unified CLI orchestration layer for AI coding tools**

Climux enables AI agents to leverage professional coding CLI tools (Claude Code, Codex, Gemini CLI, OpenCode) through a unified interface. It handles task routing, session management, workspace coordination, and metrics tracking.

## Features

- **Multi-Provider Support**: Claude Code, Codex, Gemini CLI, OpenCode
- **Intelligent Routing**: Auto-select the best CLI based on task type
- **Session Management**: Persist, resume, and track coding sessions
- **Workspace Management**: Switch contexts, use aliases, integrate with git worktrees
- **MCP Server**: Expose functionality via Model Context Protocol
- **Metrics & Analytics**: Track tokens, costs, and code changes
- **Automatic Fallback**: Graceful degradation when providers unavailable

## Installation

```bash
# Install globally
npm install -g @veithly/climux

# Or use npx directly (no installation required)
npx @veithly/climux run "your task here"
```

### Prerequisites

At least one CLI tool must be installed:

```bash
# Claude Code
npm install -g @anthropic-ai/claude-code

# OpenAI Codex
npm install -g @openai/codex

# Gemini CLI
npm install -g @google/gemini-cli

# OpenCode
npm install -g opencode
```

## Quick Start

```bash
# Run a coding task (auto-routes to best provider)
climux run "add user authentication with JWT"

# Use a specific provider
climux run "fix the login bug" --provider codex

# Check what's running
climux status

# View statistics
climux stats
```

## Commands

### Task Execution

```bash
climux run <task> [options]

Options:
  -p, --provider <name>    Provider: claude-code, codex, gemini-cli, opencode
  -m, --mode <mode>        Mode: task (autonomous) or chat (interactive)
  -w, --workspace <path>   Workspace path or @alias
  -t, --worktree <name>    Git worktree name
  -b, --background         Run in background
  --timeout <ms>           Timeout in milliseconds
```

### Session Management

```bash
climux session list [--status <status>] [--workspace <path>]
climux session resume <session-id>
climux session show <session-id>
climux session log <session-id>
climux session export <session-id> --format markdown
climux session delete <session-id>
```

### Workspace Management

```bash
climux workspace info
climux workspace switch <path>
climux workspace list
climux workspace alias <name> <path>
```

### Git Worktree Integration

```bash
climux worktree create <name> [--branch <branch>]
climux worktree list
climux worktree switch <name>
climux worktree delete <name>
```

### Configuration

```bash
climux config show [--providers]
climux config set <key> <value>
climux config init
climux config export
climux config import <file>
```

### Monitoring

```bash
climux status                    # Real-time status
climux stats                     # Today's summary
climux stats --by provider       # Per-provider breakdown
climux stats --from 2024-01-01   # Historical stats
```

### MCP Server

```bash
climux mcp serve                 # Start MCP server
climux mcp list                  # List installed MCPs
climux mcp install <package>     # Install MCP
climux skill list                # List skills
climux skill sync                # Sync across providers
```

## Configuration

### Global Configuration (`~/.climux/config.yaml`)

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
```

### Project Configuration (`.climux/config.yaml`)

```yaml
defaultProvider: gemini-cli

routing:
  - pattern: "test|spec"
    provider: codex

presets:
  quick-fix:
    mode: task
    provider: claude-code
  frontend-task:
    mode: task
    provider: gemini-cli
```

## Provider Comparison

| Feature | Claude Code | Codex | Gemini CLI | OpenCode |
|---------|-------------|-------|------------|----------|
| Chat Mode | ✅ | ✅ | ✅ | ✅ |
| Task Mode | ✅ | ✅ | ✅ | ✅ |
| Session Resume | ✅ | ✅ | ✅ | ✅ |
| MCP Support | ✅ | ✅ | ✅ | ✅ |
| Skills | ✅ | ✅ | ✅ | ❌ |
| Streaming | ✅ | ✅ | ✅ | ✅ |

## MCP Server Integration

Climux can run as an MCP server, exposing tools for other AI systems:

```bash
climux mcp serve
```

### Available MCP Tools

| Tool | Description |
|------|-------------|
| `run_task` | Execute a coding task |
| `session_list` | List sessions with filters |
| `session_resume` | Resume a paused session |
| `session_send` | Send message to active session |
| `get_status` | Get system status |
| `worktree_create` | Create git worktree |
| `worktree_list` | List worktrees |
| `get_session_stats` | Get session statistics |
| `get_daily_summary` | Get aggregated metrics |

### MCP Client Example

```javascript
import { Client } from '@modelcontextprotocol/sdk/client/index.js';

const client = new Client({ name: 'my-agent' });
await client.connect(transport);

const result = await client.callTool('run_task', {
  task: 'add input validation to API endpoints',
  mode: 'task',
  workspace: '/path/to/project'
});
```

## Architecture

```
climux/
├── src/
│   ├── core/
│   │   ├── ProcessManager.ts    # Process lifecycle management
│   │   ├── Router.ts            # Task → Provider routing
│   │   ├── SessionStore.ts      # SQLite session storage
│   │   └── Workspace.ts         # Workspace management
│   │
│   ├── providers/               # CLI provider adapters
│   │   ├── base.ts              # Abstract base class
│   │   ├── claude-code.ts
│   │   ├── codex.ts
│   │   ├── gemini-cli.ts
│   │   └── opencode.ts
│   │
│   ├── cli/                     # CLI commands
│   │   ├── index.ts
│   │   └── commands/
│   │
│   ├── mcp/                     # MCP Server
│   │   └── server.ts
│   │
│   └── utils/
│       ├── config.ts            # Configuration loader
│       ├── db.ts                # SQLite wrapper
│       └── metrics.ts           # Metrics collector
│
└── ~/.climux/
    ├── config.yaml              # Global configuration
    └── climux.db                # SQLite database
```

## Database Schema

Climux uses SQLite for session persistence:

- **sessions**: Session metadata (id, workspace, provider, status, task)
- **session_logs**: Complete conversation history
- **session_stats**: Token usage, cost, code changes
- **quality_checks**: Lint, type, and test results
- **workspace_aliases**: Workspace shortcut mappings

## Error Handling

| Error Code | Description | Recovery |
|------------|-------------|----------|
| `PROVIDER_NOT_FOUND` | Unknown provider | Use valid provider name |
| `PROVIDER_NOT_AVAILABLE` | Provider not installed | Auto-fallback to next |
| `SESSION_NOT_FOUND` | Invalid session ID | List sessions to find ID |
| `PROCESS_CRASHED` | CLI process crashed | Auto-resume if supported |
| `RATE_LIMITED` | API rate limited | Auto-fallback to next |

## For AI Agents

See [SKILL.md](./SKILL.md) for detailed instructions on using Climux as an AI agent.

### Key Points for Agents

1. Use `--mode task` for autonomous operations
2. Create worktrees for parallel feature development
3. Check `climux status` before starting resource-intensive tasks
4. Use workspace aliases (`@myproject`) for frequent projects
5. Monitor costs with `climux stats`
6. Export sessions for documentation

### Example Agent Workflow

```bash
# 1. Create isolated workspace
climux worktree create feature-auth --branch feature/auth

# 2. Run the task
climux run "implement JWT authentication" --worktree feature-auth --mode task

# 3. Monitor progress
climux status

# 4. Review results
climux session show <session-id>
climux session log <session-id>

# 5. Get statistics
climux stats --by provider
```

## Development

```bash
# Clone the repository
git clone https://github.com/user/climux.git
cd climux

# Install dependencies
npm install

# Build
npm run build

# Run tests
npm test

# Run in development mode
npm run dev
```

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing`)
3. Make your changes
4. Run tests (`npm test`)
5. Commit your changes (`git commit -m 'Add amazing feature'`)
6. Push to the branch (`git push origin feature/amazing`)
7. Open a Pull Request

## License

MIT License - see [LICENSE](./LICENSE) for details.

## Acknowledgments

- [Claude Code](https://github.com/anthropics/claude-code) by Anthropic
- [Codex CLI](https://github.com/openai/codex) by OpenAI
- [Gemini CLI](https://github.com/google/gemini-cli) by Google
- [OpenCode](https://github.com/opencode-ai/opencode) by OpenCode AI
- [Model Context Protocol](https://modelcontextprotocol.io/) for MCP specification
