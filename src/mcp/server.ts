/**
 * BotCLI MCP Server
 * Exposes BotCLI functionality as MCP (Model Context Protocol) tools
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

import { initDb, closeDb } from '../utils/db.js';
import { loadConfig } from '../utils/config.js';
import { Router, initRouter } from '../core/Router.js';
import * as SessionStore from '../core/SessionStore.js';
import * as Workspace from '../core/Workspace.js';
import { getProcessManager } from '../core/ProcessManager.js';
import type { SessionStatus, RunMode } from '../types/index.js';

/**
 * Tool definitions for the MCP server
 */
const TOOLS = [
  {
    name: 'run_task',
    description: 'Execute a coding task using a professional CLI tool (Claude Code, Codex, Gemini CLI, or OpenCode)',
    inputSchema: {
      type: 'object' as const,
      properties: {
        task: {
          type: 'string',
          description: 'The coding task to execute',
        },
        provider: {
          type: 'string',
          description: 'Optional: specific provider to use (claude-code, codex, gemini-cli, opencode)',
        },
        mode: {
          type: 'string',
          enum: ['task', 'chat'],
          description: 'Execution mode: task (autonomous) or chat (interactive)',
          default: 'task',
        },
        workspace: {
          type: 'string',
          description: 'Optional: workspace path. Defaults to current directory',
        },
        worktree: {
          type: 'string',
          description: 'Optional: git worktree name to use',
        },
        timeout: {
          type: 'number',
          description: 'Optional: timeout in milliseconds',
        },
      },
      required: ['task'],
    },
  },
  {
    name: 'session_list',
    description: 'List BotCLI sessions with optional filters',
    inputSchema: {
      type: 'object' as const,
      properties: {
        workspace: {
          type: 'string',
          description: 'Filter by workspace path',
        },
        status: {
          type: 'string',
          enum: ['pending', 'running', 'paused', 'completed', 'failed', 'crashed', 'timeout'],
          description: 'Filter by session status',
        },
        provider: {
          type: 'string',
          description: 'Filter by provider name',
        },
        limit: {
          type: 'number',
          description: 'Maximum number of sessions to return',
          default: 20,
        },
      },
    },
  },
  {
    name: 'session_resume',
    description: 'Resume a paused or stopped session',
    inputSchema: {
      type: 'object' as const,
      properties: {
        sessionId: {
          type: 'string',
          description: 'The session ID to resume',
        },
      },
      required: ['sessionId'],
    },
  },
  {
    name: 'session_send',
    description: 'Send a message to an active (running) session',
    inputSchema: {
      type: 'object' as const,
      properties: {
        sessionId: {
          type: 'string',
          description: 'The session ID',
        },
        message: {
          type: 'string',
          description: 'The message to send',
        },
      },
      required: ['sessionId', 'message'],
    },
  },
  {
    name: 'get_status',
    description: 'Get current system status including active sessions and resource usage',
    inputSchema: {
      type: 'object' as const,
      properties: {},
    },
  },
  {
    name: 'worktree_create',
    description: 'Create a new git worktree for parallel development',
    inputSchema: {
      type: 'object' as const,
      properties: {
        name: {
          type: 'string',
          description: 'Name for the worktree (also used as directory name)',
        },
        branch: {
          type: 'string',
          description: 'Optional: branch name. Defaults to worktree name',
        },
        workspace: {
          type: 'string',
          description: 'Optional: workspace path. Defaults to current directory',
        },
      },
      required: ['name'],
    },
  },
  {
    name: 'worktree_list',
    description: 'List all git worktrees in the workspace',
    inputSchema: {
      type: 'object' as const,
      properties: {
        workspace: {
          type: 'string',
          description: 'Optional: workspace path. Defaults to current directory',
        },
      },
    },
  },
  {
    name: 'get_session_stats',
    description: 'Get statistics for a specific session',
    inputSchema: {
      type: 'object' as const,
      properties: {
        sessionId: {
          type: 'string',
          description: 'The session ID',
        },
      },
      required: ['sessionId'],
    },
  },
  {
    name: 'get_daily_summary',
    description: 'Get aggregated metrics summary for a time period',
    inputSchema: {
      type: 'object' as const,
      properties: {
        workspace: {
          type: 'string',
          description: 'Filter by workspace path',
        },
        provider: {
          type: 'string',
          description: 'Filter by provider name',
        },
        fromDate: {
          type: 'string',
          description: 'Start date (ISO format, e.g., 2024-01-01)',
        },
        toDate: {
          type: 'string',
          description: 'End date (ISO format)',
        },
      },
    },
  },
];

/**
 * MCP Server implementation for BotCLI
 */
class BotCliMcpServer {
  private server: Server;
  private router: Router | null = null;
  private initialized = false;

  constructor() {
    this.server = new Server(
      {
        name: 'climux',
        version: '0.1.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupHandlers();
  }

  /**
   * Initialize the server (database, config, router)
   */
  private async initialize(): Promise<void> {
    if (this.initialized) return;

    // Initialize database
    await initDb();

    // Load configuration
    const workspace = Workspace.getCurrentWorkspace();
    const config = loadConfig(workspace.path);

    // Initialize router
    this.router = initRouter(config);
    this.initialized = true;
  }

  /**
   * Setup request handlers
   */
  private setupHandlers(): void {
    // List tools handler
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return { tools: TOOLS };
    });

    // Call tool handler
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      await this.initialize();

      const { name, arguments: args } = request.params;

      try {
        const result = await this.handleToolCall(name, args || {});
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({ error: errorMessage }, null, 2),
            },
          ],
          isError: true,
        };
      }
    });
  }

  /**
   * Handle individual tool calls
   */
  private async handleToolCall(
    name: string,
    args: Record<string, unknown>
  ): Promise<unknown> {
    switch (name) {
      case 'run_task':
        return this.runTask(args);
      case 'session_list':
        return this.sessionList(args);
      case 'session_resume':
        return this.sessionResume(args);
      case 'session_send':
        return this.sessionSend(args);
      case 'get_status':
        return this.getStatus();
      case 'worktree_create':
        return this.worktreeCreate(args);
      case 'worktree_list':
        return this.worktreeList(args);
      case 'get_session_stats':
        return this.getSessionStats(args);
      case 'get_daily_summary':
        return this.getDailySummary(args);
      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  }

  /**
   * Tool: run_task
   */
  private async runTask(args: Record<string, unknown>): Promise<unknown> {
    const task = args.task as string;
    const provider = args.provider as string | undefined;
    const mode = (args.mode as RunMode) || 'task';
    const workspacePath = args.workspace as string | undefined;
    const worktree = args.worktree as string | undefined;
    const timeout = args.timeout as number | undefined;

    if (!task) {
      throw new Error('Task is required');
    }

    const workspace = workspacePath
      ? Workspace.createWorkspaceFromPath(workspacePath)
      : Workspace.getCurrentWorkspace();

    const result = await this.router!.run(task, {
      mode,
      workspace,
      provider,
      worktree,
      timeout,
    });

    return {
      sessionId: result.sessionId,
      status: result.status,
      output: result.output,
      summary: result.summary,
      stats: {
        tokensIn: result.stats.tokensIn,
        tokensOut: result.stats.tokensOut,
        costEstimate: result.stats.costEstimate,
        filesChanged: result.stats.filesChanged,
        linesAdded: result.stats.linesAdded,
        linesRemoved: result.stats.linesRemoved,
        durationSeconds: result.stats.durationSeconds,
      },
    };
  }

  /**
   * Tool: session_list
   */
  private sessionList(args: Record<string, unknown>): unknown {
    const sessions = SessionStore.listSessions({
      workspacePath: args.workspace as string | undefined,
      status: args.status as SessionStatus | undefined,
      provider: args.provider as string | undefined,
      limit: (args.limit as number) || 20,
    });

    return {
      count: sessions.length,
      sessions: sessions.map((s) => ({
        id: s.id,
        workspace: s.workspacePath,
        provider: s.provider,
        task: s.task,
        status: s.status,
        createdAt: s.createdAt.toISOString(),
        updatedAt: s.updatedAt.toISOString(),
      })),
    };
  }

  /**
   * Tool: session_resume
   */
  private async sessionResume(args: Record<string, unknown>): Promise<unknown> {
    const sessionId = args.sessionId as string;

    if (!sessionId) {
      throw new Error('Session ID is required');
    }

    await this.router!.resumeSession(sessionId);

    return {
      success: true,
      sessionId,
      message: `Session ${sessionId} resumed successfully`,
    };
  }

  /**
   * Tool: session_send
   */
  private async sessionSend(args: Record<string, unknown>): Promise<unknown> {
    const sessionId = args.sessionId as string;
    const message = args.message as string;

    if (!sessionId) {
      throw new Error('Session ID is required');
    }
    if (!message) {
      throw new Error('Message is required');
    }

    await this.router!.sendToSession(sessionId, message);

    return {
      success: true,
      sessionId,
      message: 'Message sent successfully',
    };
  }

  /**
   * Tool: get_status
   */
  private getStatus(): unknown {
    const processManager = getProcessManager();
    const activeSessions = processManager.getActiveSessions();

    // Get details for active sessions
    const activeSessionDetails = activeSessions.map((sessionId) => {
      const session = SessionStore.getSession(sessionId);
      return {
        id: sessionId,
        workspace: session?.workspacePath,
        provider: session?.provider,
        task: session?.task,
        status: session?.status,
        pid: session?.pid,
      };
    });

    // Get recent sessions
    const recentSessions = SessionStore.listSessions({ limit: 5 });

    return {
      activeSessions: {
        count: activeSessions.length,
        sessions: activeSessionDetails,
      },
      recentSessions: recentSessions.map((s) => ({
        id: s.id,
        provider: s.provider,
        status: s.status,
        task: s.task?.substring(0, 50),
        createdAt: s.createdAt.toISOString(),
      })),
      system: {
        currentWorkspace: Workspace.getCurrentWorkspace().path,
      },
    };
  }

  /**
   * Tool: worktree_create
   */
  private async worktreeCreate(args: Record<string, unknown>): Promise<unknown> {
    const name = args.name as string;
    const branch = args.branch as string | undefined;
    const workspacePath = args.workspace as string | undefined;

    if (!name) {
      throw new Error('Worktree name is required');
    }

    const workspace = workspacePath
      ? Workspace.createWorkspaceFromPath(workspacePath)
      : Workspace.getCurrentWorkspace();

    const worktreePath = await Workspace.createWorktree(name, branch, workspace);

    return {
      success: true,
      name,
      path: worktreePath,
      branch: branch || name,
    };
  }

  /**
   * Tool: worktree_list
   */
  private worktreeList(args: Record<string, unknown>): unknown {
    const workspacePath = args.workspace as string | undefined;

    const workspace = workspacePath
      ? Workspace.createWorkspaceFromPath(workspacePath)
      : Workspace.getCurrentWorkspace();

    const worktrees = Workspace.listWorktrees(workspace);

    return {
      workspace: workspace.path,
      gitRoot: workspace.gitRoot,
      count: worktrees.length,
      worktrees,
    };
  }

  /**
   * Tool: get_session_stats
   */
  private getSessionStats(args: Record<string, unknown>): unknown {
    const sessionId = args.sessionId as string;

    if (!sessionId) {
      throw new Error('Session ID is required');
    }

    const session = SessionStore.getSession(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    const stats = SessionStore.getSessionStats(sessionId);
    const logs = SessionStore.getSessionLogs(sessionId);
    const qualityCheck = SessionStore.getLatestQualityCheck(sessionId);

    return {
      session: {
        id: session.id,
        workspace: session.workspacePath,
        provider: session.provider,
        task: session.task,
        status: session.status,
        createdAt: session.createdAt.toISOString(),
        updatedAt: session.updatedAt.toISOString(),
      },
      stats: stats
        ? {
            tokensIn: stats.tokensIn,
            tokensOut: stats.tokensOut,
            costEstimate: stats.costEstimate,
            filesChanged: stats.filesChanged,
            linesAdded: stats.linesAdded,
            linesRemoved: stats.linesRemoved,
            durationSeconds: stats.durationSeconds,
          }
        : null,
      logsCount: logs.length,
      qualityCheck: qualityCheck
        ? {
            lintErrors: qualityCheck.lintErrors,
            typeErrors: qualityCheck.typeErrors,
            testsPassed: qualityCheck.testsPassed,
            testsFailed: qualityCheck.testsFailed,
            checkedAt: qualityCheck.checkedAt.toISOString(),
          }
        : null,
    };
  }

  /**
   * Tool: get_daily_summary
   */
  private getDailySummary(args: Record<string, unknown>): unknown {
    const workspace = args.workspace as string | undefined;
    const provider = args.provider as string | undefined;
    const fromDate = args.fromDate as string | undefined;
    const toDate = args.toDate as string | undefined;

    // Default to today if no dates provided
    const today = new Date().toISOString().split('T')[0];
    const effectiveFromDate = fromDate || today;
    const effectiveToDate = toDate || today + 'T23:59:59.999Z';

    const stats = SessionStore.getAggregatedStats({
      workspacePath: workspace,
      provider,
      fromDate: effectiveFromDate,
      toDate: effectiveToDate,
    });

    return {
      period: {
        from: effectiveFromDate,
        to: effectiveToDate,
      },
      filters: {
        workspace: workspace || 'all',
        provider: provider || 'all',
      },
      summary: {
        totalSessions: stats.totalSessions,
        completedSessions: stats.completedSessions,
        failedSessions: stats.failedSessions,
        successRate:
          stats.totalSessions > 0
            ? ((stats.completedSessions / stats.totalSessions) * 100).toFixed(1) + '%'
            : 'N/A',
      },
      tokens: {
        input: stats.totalTokensIn,
        output: stats.totalTokensOut,
        total: stats.totalTokensIn + stats.totalTokensOut,
      },
      cost: {
        total: stats.totalCost.toFixed(4),
        currency: 'USD',
      },
      codeChanges: {
        filesChanged: stats.totalFilesChanged,
        linesAdded: stats.totalLinesAdded,
        linesRemoved: stats.totalLinesRemoved,
        netLines: stats.totalLinesAdded - stats.totalLinesRemoved,
      },
      duration: {
        totalSeconds: stats.totalDuration,
        formatted: formatDuration(stats.totalDuration),
      },
    };
  }

  /**
   * Start the MCP server
   */
  async start(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);

    // Handle graceful shutdown
    process.on('SIGINT', () => this.shutdown());
    process.on('SIGTERM', () => this.shutdown());
  }

  /**
   * Shutdown the server
   */
  private shutdown(): void {
    closeDb();
    process.exit(0);
  }
}

/**
 * Format duration in seconds to human readable string
 */
function formatDuration(seconds: number): string {
  if (seconds < 60) {
    return `${seconds}s`;
  }
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (minutes < 60) {
    return `${minutes}m ${remainingSeconds}s`;
  }
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `${hours}h ${remainingMinutes}m`;
}

/**
 * Start the MCP server
 * This function is exported for use by the CLI
 */
export async function startMcpServer(): Promise<void> {
  const server = new BotCliMcpServer();
  await server.start();
}

// Allow direct execution
if (import.meta.url === `file://${process.argv[1]}`) {
  startMcpServer().catch((error) => {
    console.error('Failed to start MCP server:', error);
    process.exit(1);
  });
}
