/**
 * BotCLI Type Definitions
 */

// ============================================================================
// Provider Types
// ============================================================================

export interface ProviderCapabilities {
  chat: boolean;       // Supports interactive chat mode
  task: boolean;       // Supports autonomous task mode
  resume: boolean;     // Supports session resume
  streaming: boolean;  // Supports streaming output
  mcp: boolean;        // Supports MCP integration
  skills: boolean;     // Supports Skills
}

export interface Provider {
  name: string;
  command: string;
  capabilities: ProviderCapabilities;
  detect(): Promise<boolean>;
  buildArgs(task: string, options: RunOptions): string[];
  buildResumeArgs(sessionId: string, options: RunOptions): string[];
  parseOutput(output: string): ParsedOutput;
  isTaskComplete(output: string): boolean;
  getMcpConfigPath(): string | undefined;
  getSkillsConfigPath(): string | undefined;
  getEnv(): Record<string, string>;
}

export interface ParsedOutput {
  tokens?: {
    in: number;
    out: number;
  };
  cost?: number;
  filesChanged?: string[];
  summary?: string;
}

// ============================================================================
// Session Types
// ============================================================================

export type SessionStatus = 'pending' | 'running' | 'paused' | 'completed' | 'failed' | 'crashed' | 'timeout';

export interface Session {
  id: string;
  workspacePath: string;
  provider: string;
  task: string | null;
  status: SessionStatus;
  nativeSessionId: string | null;
  pid: number | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface SessionLog {
  id: number;
  sessionId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
}

export interface SessionStats {
  sessionId: string;
  tokensIn: number;
  tokensOut: number;
  costEstimate: number;
  filesChanged: number;
  linesAdded: number;
  linesRemoved: number;
  durationSeconds: number;
}

export interface QualityCheck {
  id: number;
  sessionId: string;
  lintErrors: number;
  typeErrors: number;
  testsPassed: number;
  testsFailed: number;
  checkedAt: Date;
}

// ============================================================================
// Workspace Types
// ============================================================================

export interface Workspace {
  path: string;          // Absolute path
  name: string;          // Workspace name (directory name or custom)
  gitRoot?: string;      // Git repository root (if exists)
  worktrees: string[];   // Associated git worktrees
  defaultProvider?: string;
}

export interface WorkspaceAlias {
  name: string;
  path: string;
}

// ============================================================================
// Run Options
// ============================================================================

export type RunMode = 'task' | 'chat';

export interface RunOptions {
  mode: RunMode;
  workspace: Workspace;
  worktree?: string;
  timeout?: number;
  env?: Record<string, string>;
  background?: boolean;
  provider?: string;
  preset?: string;
}

export interface RunResult {
  sessionId: string;
  status: SessionStatus;
  output: string;
  stats: SessionStats;
  summary?: string;
}

// ============================================================================
// Configuration Types
// ============================================================================

export interface RoutingRule {
  pattern: string;
  provider: string;
}

export interface ConcurrencyConfig {
  maxActiveSessions: number;
  maxSessionsPerWorkspace: number;
}

export interface MonitoringConfig {
  trackTokens: boolean;
  trackCost: boolean;
  trackGitChanges: boolean;
  runQualityChecks: boolean;
}

export interface RetentionConfig {
  sessionLogs: string;  // e.g., '30d'
  completedSessions: string;  // e.g., '90d'
}

export interface ProviderConfig {
  name: string;
  command: string;
  enabled: boolean;
  args?: {
    task?: string[];
    chat?: string[];
    resume?: string[];
  };
  env?: Record<string, string>;
  mcpConfigPath?: string;
  skillsConfigPath?: string;
  pricing?: {
    input: number;
    output: number;
  };
}

export interface PresetConfig {
  mode: RunMode;
  provider: string;
  args?: string[];
}

export interface ProjectConfig {
  defaultProvider?: string;
  routing?: RoutingRule[];
  workspaces?: Record<string, string>;
  presets?: Record<string, PresetConfig>;
}

export interface GlobalConfig {
  defaultProvider: string;
  routing: RoutingRule[];
  fallbackOrder: string[];
  concurrency: ConcurrencyConfig;
  monitoring: MonitoringConfig;
  retention: RetentionConfig;
}

export interface Config extends GlobalConfig {
  providers: Record<string, ProviderConfig>;
  project?: ProjectConfig;
}

// ============================================================================
// Error Types
// ============================================================================

export enum ErrorCode {
  PROVIDER_NOT_FOUND = 'PROVIDER_NOT_FOUND',
  PROVIDER_NOT_AVAILABLE = 'PROVIDER_NOT_AVAILABLE',
  SESSION_NOT_FOUND = 'SESSION_NOT_FOUND',
  WORKSPACE_NOT_FOUND = 'WORKSPACE_NOT_FOUND',
  WORKTREE_NOT_FOUND = 'WORKTREE_NOT_FOUND',
  PROCESS_CRASHED = 'PROCESS_CRASHED',
  TIMEOUT = 'TIMEOUT',
  RATE_LIMITED = 'RATE_LIMITED',
  CONFIG_INVALID = 'CONFIG_INVALID',
  DATABASE_ERROR = 'DATABASE_ERROR',
}

export class BotCliError extends Error {
  constructor(
    public code: ErrorCode,
    message: string,
    public recoverable: boolean = false,
    public suggestion?: string
  ) {
    super(message);
    this.name = 'BotCliError';
  }
}

// ============================================================================
// MCP Types
// ============================================================================

export interface McpTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface McpServerConfig {
  command: string;
  args: string[];
  env?: Record<string, string>;
}

// ============================================================================
// Event Types
// ============================================================================

export type EventType =
  | 'session:created'
  | 'session:started'
  | 'session:output'
  | 'session:completed'
  | 'session:failed'
  | 'session:crashed';

export interface SessionEvent {
  type: EventType;
  sessionId: string;
  timestamp: Date;
  data?: unknown;
}
