# Climux

> **Unified CLI multiplexer for AI coding agents**

Climux provides a single interface for AI agents to orchestrate multiple coding CLI tools (Claude Code, Codex, Gemini CLI, OpenCode). Instead of learning each tool's unique syntax, agents use one consistent API.

## Why Climux?

- **One Interface**: Single command syntax for all providers
- **Smart Routing**: Automatically selects the best CLI for each task type
- **Session Persistence**: Resume interrupted work across restarts
- **Parallel Workspaces**: Isolate work with git worktrees
- **Cost Tracking**: Monitor token usage and API costs
- **Graceful Fallback**: Automatic provider switching when one fails

## Installation

```bash
# Global install
npm install -g @veithly/climux

# Or run directly with npx
npx @veithly/climux run "your task"
```

**Prerequisites**: At least one CLI must be installed:

```bash
npm install -g @anthropic-ai/claude-code   # Claude Code
npm install -g @openai/codex               # Codex
npm install -g @google/gemini-cli          # Gemini CLI
npm install -g opencode                    # OpenCode
```

## Usage

### Run a Task

```bash
# Auto-route to best provider
climux run "add user authentication with JWT"

# Specify provider
climux run "fix the login bug" --provider codex

# Run autonomously (non-interactive)
climux run "refactor database layer" --mode task

# Run in background
climux run "implement caching" --background
```

### Session Management

```bash
climux session list                        # List all sessions
climux session list --status active        # Filter by status
climux session resume <id>                 # Resume session
climux session show <id>                   # Show session details
climux session log <id>                    # View conversation log
climux session export <id> --format md     # Export to markdown
climux session delete <id>                 # Delete session
```

### Workspace Management

```bash
climux workspace info                      # Current workspace info
climux workspace list                      # List known workspaces
climux workspace switch /path/to/project   # Switch workspace
climux workspace alias api ~/projects/api  # Create alias
climux run "task" --workspace @api         # Use alias
```

### Git Worktree Integration

```bash
climux worktree create feature-auth        # Create worktree
climux worktree create hotfix -b main      # From specific branch
climux worktree list                       # List worktrees
climux worktree switch feature-auth        # Switch to worktree
climux worktree delete feature-auth        # Delete worktree
```

### Monitoring

```bash
climux status                              # Real-time status
climux stats                               # Today's summary
climux stats --by provider                 # Per-provider breakdown
climux stats --from 2024-01-01             # Historical data
```

### Configuration

```bash
climux config show                         # Show current config
climux config show --providers             # Show provider status
climux config set defaultProvider codex    # Set default
climux config init                         # Initialize config
```

## Configuration File

**Global**: `~/.climux/config.yaml`

```yaml
defaultProvider: claude-code

routing:
  - pattern: "frontend|react|vue|css"
    provider: gemini-cli
  - pattern: "debug|fix|bug|error"
    provider: codex
  - pattern: ".*"
    provider: claude-code

fallbackOrder:
  - claude-code
  - codex
  - gemini-cli
  - opencode

concurrency:
  maxActiveSessions: 5
  maxSessionsPerWorkspace: 3

monitoring:
  trackTokens: true
  trackCost: true
```

**Project-level**: `.climux/config.yaml` (overrides global)

```yaml
defaultProvider: gemini-cli

presets:
  quick-fix:
    mode: task
    provider: claude-code
```

## MCP Server

Climux can run as an MCP server, allowing other AI systems to use it as a tool:

```bash
climux mcp serve
```

**Available MCP Tools**:

| Tool | Description |
|------|-------------|
| `run_task` | Execute a coding task |
| `session_list` | List sessions |
| `session_resume` | Resume a session |
| `session_send` | Send message to active session |
| `get_status` | Get system status |
| `worktree_create` | Create git worktree |
| `worktree_list` | List worktrees |
| `get_session_stats` | Get statistics |

**MCP Client Example**:

```javascript
const result = await client.callTool('run_task', {
  task: 'add input validation',
  mode: 'task',
  workspace: '/path/to/project'
});
```

## Skills & MCP Management

```bash
climux skill list                          # List available skills
climux skill sync                          # Sync skills across providers
climux mcp list                            # List installed MCPs
climux mcp install <package>               # Install MCP package
```

## For AI Agents

See [SKILL.md](./SKILL.md) for detailed agent instructions.

### Quick Reference

```bash
# Parallel feature development
climux worktree create feature-x
climux run "implement feature X" --worktree feature-x --mode task

# Check before starting heavy work
climux status

# Monitor costs
climux stats --by provider

# Resume interrupted work
climux session list --status paused
climux session resume <id>

# Export for documentation
climux session export <id> --format md > session.md
```

### Best Practices

1. Use `--mode task` for autonomous operations
2. Create worktrees for parallel development
3. Check `climux status` before resource-intensive tasks
4. Use aliases for frequent projects (`@api`, `@web`)
5. Monitor costs with `climux stats`

## Data Storage

- **Config**: `~/.climux/config.yaml`
- **Database**: `~/.climux/climux.db` (SQLite)
- **Tables**: sessions, session_logs, session_stats, workspace_aliases

## Error Handling

| Error | Cause | Solution |
|-------|-------|----------|
| `PROVIDER_NOT_AVAILABLE` | CLI not installed | Install or auto-fallback |
| `SESSION_NOT_FOUND` | Invalid session ID | List sessions |
| `PROCESS_CRASHED` | CLI crashed | Auto-resume |
| `RATE_LIMITED` | API limit hit | Auto-fallback |

## Development

```bash
git clone https://github.com/veithly/climux.git
cd climux
pnpm install
pnpm build
pnpm test
```

## License

MIT
