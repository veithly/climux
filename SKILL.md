# Climux Skill Definition

> **Skill Name**: climux
> **Version**: 0.1.0
> **Purpose**: Delegate coding tasks to professional CLI tools (Claude Code, Codex, Gemini CLI, OpenCode)

## When to Use This Skill

Use Climux when you need to:
- Execute complex coding tasks that benefit from specialized AI coding tools
- Run autonomous coding tasks in the background
- Manage multiple parallel coding sessions across different workspaces
- Track token usage, costs, and code changes across sessions
- Leverage git worktrees for parallel feature development

## Prerequisites

Ensure at least one CLI tool is installed:
- **Claude Code**: `npm install -g @anthropic-ai/claude-code` or `claude --version`
- **Codex**: `npm install -g @openai/codex` or `codex --version`
- **Gemini CLI**: `npm install -g @google/gemini-cli` or `gemini --version`
- **OpenCode**: `npm install -g opencode` or `opencode --version`

Install Climux:
```bash
npm install -g @veithly/climux

# Or use npx directly (no installation required)
npx @veithly/climux <command>
```

## Core Commands

### 1. Execute a Coding Task

```bash
# Auto-route to best provider based on task type
climux run "add user authentication with JWT"

# Specify a provider
climux run "fix React component bug" --provider gemini-cli

# Task mode (autonomous, non-interactive)
climux run "refactor database module" --mode task

# Chat mode (interactive)
climux run "help me understand this code" --mode chat

# Run in specific workspace
climux run "add tests" --workspace /path/to/project

# Run in git worktree
climux run "implement feature" --worktree feature-branch
```

### 2. Session Management

```bash
# List all sessions
climux session list

# List sessions by status
climux session list --status running

# Resume a paused session
climux session resume <session-id>

# View session details
climux session show <session-id>

# View session logs
climux session log <session-id>

# Export session to markdown
climux session export <session-id> --format markdown

# Delete a session
climux session delete <session-id>
```

### 3. Workspace Management

```bash
# Show current workspace info
climux workspace info

# Switch workspace
climux workspace switch /path/to/project

# Create workspace alias
climux workspace alias myproject /path/to/project

# Use alias
climux run "add feature" --workspace @myproject
```

### 4. Git Worktree Management

```bash
# Create worktree for parallel development
climux worktree create feature-auth --branch auth-system

# List worktrees
climux worktree list

# Switch to worktree
climux worktree switch feature-auth

# Delete worktree
climux worktree delete feature-auth
```

### 5. Status and Statistics

```bash
# Show real-time status
climux status

# Show today's statistics
climux stats

# Show stats by provider
climux stats --by provider

# Show historical stats
climux stats --from 2024-01-01 --to 2024-01-31
```

### 6. Configuration

```bash
# Show current config
climux config show

# Show provider status
climux config show --providers

# Set default provider
climux config set defaultProvider gemini-cli

# Initialize project config
climux config init

# Export config
climux config export > config.yaml

# Import config
climux config import config.yaml
```

### 7. MCP Server Mode

```bash
# Start as MCP server (for integration with other AI tools)
climux mcp serve

# List installed MCPs
climux mcp list

# Install MCP package
climux mcp install @anthropic/mcp-server-filesystem

# Sync skills across providers
climux skill sync
```

## Routing Rules

Climux automatically routes tasks to the best provider:

| Task Pattern | Provider | Reason |
|--------------|----------|--------|
| `frontend\|react\|vue\|css\|ui\|style` | gemini-cli | Best for UI/frontend work |
| `debug\|fix\|bug\|error\|issue` | codex | Specialized for debugging |
| `.*` (default) | claude-code | General-purpose coding |

## Provider Capabilities

| Provider | Chat | Task | Resume | MCP | Skills |
|----------|------|------|--------|-----|--------|
| claude-code | ✅ | ✅ | ✅ | ✅ | ✅ |
| codex | ✅ | ✅ | ✅ | ✅ | ✅ |
| gemini-cli | ✅ | ✅ | ✅ | ✅ | ✅ |
| opencode | ✅ | ✅ | ✅ | ✅ | ❌ |

## MCP Server Tools

When running as an MCP server, Climux exposes these tools:

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

## Usage Examples for AI Agents

### Example 1: Execute a Complex Feature

```bash
# Create a worktree for the feature
climux worktree create auth-system --branch feature/auth

# Run the coding task
climux run "implement user authentication with JWT tokens, including login, logout, and token refresh endpoints" --worktree auth-system --mode task

# Check progress
climux status

# View the session
climux session show <session-id>
```

### Example 2: Parallel Development

```bash
# Create multiple worktrees
climux worktree create frontend-updates
climux worktree create api-refactor
climux worktree create test-coverage

# Run tasks in parallel (each in its own worktree)
climux run "update React components to use hooks" --worktree frontend-updates &
climux run "refactor API endpoints for REST compliance" --worktree api-refactor &
climux run "add unit tests for core modules" --worktree test-coverage &

# Monitor all sessions
climux status
```

### Example 3: Debug and Fix

```bash
# Use Codex for debugging (auto-routed)
climux run "debug the authentication failure in login.ts"

# Or explicitly use Codex
climux run "fix the memory leak in processQueue" --provider codex
```

### Example 4: Integration via MCP

```javascript
// In your MCP client
const result = await mcpClient.callTool('run_task', {
  task: 'add input validation to all API endpoints',
  mode: 'task',
  workspace: '/path/to/project'
});

console.log(result.sessionId);
console.log(result.status);
```

## Error Handling

| Error | Meaning | Recovery |
|-------|---------|----------|
| `PROVIDER_NOT_FOUND` | Unknown provider name | Use: claude-code, codex, gemini-cli, opencode |
| `PROVIDER_NOT_AVAILABLE` | Provider not installed | Install the provider CLI or use fallback |
| `SESSION_NOT_FOUND` | Session ID doesn't exist | Use `climux session list` to find valid IDs |
| `PROCESS_CRASHED` | CLI process crashed | Session auto-recovers if provider supports resume |
| `RATE_LIMITED` | API rate limit hit | Auto-fallback to next provider |

## Configuration File Locations

- **Global config**: `~/.climux/config.yaml`
- **Project config**: `.climux/config.yaml` (in project root)
- **Database**: `~/.climux/climux.db` (SQLite)

## Best Practices for AI Agents

1. **Use task mode** for autonomous operations: `--mode task`
2. **Create worktrees** for parallel feature development to avoid conflicts
3. **Check status** before starting new tasks to avoid resource contention
4. **Use workspace aliases** for frequently accessed projects
5. **Review session logs** to understand what changes were made
6. **Export sessions** for documentation or handoff to humans
7. **Monitor costs** with `climux stats` for budget awareness

## Fallback Behavior

If the preferred provider is unavailable, Climux automatically falls back:

```
claude-code → gemini-cli → codex → opencode
```

You can customize this in config:
```yaml
fallbackOrder:
  - claude-code
  - gemini-cli
  - codex
  - opencode
```
