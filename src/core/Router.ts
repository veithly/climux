/**
 * Router
 * Routes tasks to appropriate CLI providers based on task type and availability
 */

import type {
  Provider,
  Config,
  RoutingRule,
  RunOptions,
  RunResult,
  Workspace,
} from '../types/index.js';
import { BotCliError, ErrorCode } from '../types/index.js';
import {
  getProviderNames,
  createProvidersFromConfig,
} from '../providers/index.js';
import { getProcessManager, ProcessManager } from './ProcessManager.js';
import * as SessionStore from './SessionStore.js';
import { getGitDiffStats } from './Workspace.js';

/**
 * Router class for task routing and execution
 */
export class Router {
  private providers: Map<string, Provider>;
  private routingRules: RoutingRule[];
  private fallbackOrder: string[];
  private processManager: ProcessManager;

  constructor(config: Config) {
    // Create providers from config
    this.providers = createProvidersFromConfig(config.providers);

    // Setup routing rules
    this.routingRules = config.routing;

    // Setup fallback order
    this.fallbackOrder = config.fallbackOrder;

    // Get process manager
    this.processManager = getProcessManager(config.concurrency.maxActiveSessions);
  }

  /**
   * Select the best provider for a task
   */
  async selectProvider(task: string, preferred?: string): Promise<Provider> {
    // 1. Try preferred provider first
    if (preferred) {
      const provider = this.providers.get(preferred);
      if (provider && await provider.detect()) {
        return provider;
      }
    }

    // 2. Match routing rules
    for (const rule of this.routingRules) {
      const regex = new RegExp(rule.pattern, 'i');
      if (regex.test(task)) {
        const provider = this.providers.get(rule.provider);
        if (provider && await provider.detect()) {
          return provider;
        }
      }
    }

    // 3. Try fallback order
    for (const providerName of this.fallbackOrder) {
      const provider = this.providers.get(providerName);
      if (provider && await provider.detect()) {
        return provider;
      }
    }

    // 4. Try any available provider
    for (const provider of this.providers.values()) {
      if (await provider.detect()) {
        return provider;
      }
    }

    throw new BotCliError(
      ErrorCode.PROVIDER_NOT_AVAILABLE,
      'No available provider found',
      false,
      'Install one of: ' + getProviderNames().join(', ')
    );
  }

  /**
   * Run a task with automatic provider selection and fallback
   */
  async run(task: string, options: RunOptions): Promise<RunResult> {
    const providers = await this.getFallbackChain(task, options.provider);

    for (const provider of providers) {
      try {
        return await this.runWithProvider(provider, task, options);
      } catch (error) {
        if (error instanceof BotCliError) {
          if (
            error.code === ErrorCode.PROVIDER_NOT_AVAILABLE ||
            error.code === ErrorCode.RATE_LIMITED
          ) {
            // Try next provider
            continue;
          }
        }
        throw error;
      }
    }

    throw new BotCliError(
      ErrorCode.PROVIDER_NOT_AVAILABLE,
      'All providers exhausted',
      false,
      'Check provider installations with: climux config show --providers'
    );
  }

  /**
   * Run a task with a specific provider
   */
  private async runWithProvider(
    provider: Provider,
    task: string,
    options: RunOptions
  ): Promise<RunResult> {
    // Create session
    const session = SessionStore.createSession(
      options.workspace.path,
      provider.name,
      task
    );

    // Log user input
    SessionStore.addSessionLog(session.id, 'user', task);

    try {
      // Spawn process
      await this.processManager.spawn(
        session.id,
        provider,
        task,
        options
      );

      // For task mode, wait for completion
      if (options.mode === 'task') {
        const output = await this.processManager.waitForCompletion(
          session.id,
          options.timeout
        );

        // Get final stats
        const stats = SessionStore.getSessionStats(session.id);

        // Get git diff stats
        const gitStats = await getGitDiffStats(options.workspace);
        if (stats) {
          SessionStore.updateSessionStats(session.id, {
            filesChanged: gitStats.filesChanged,
            linesAdded: gitStats.linesAdded,
            linesRemoved: gitStats.linesRemoved,
          });
        }

        const finalStats = SessionStore.getSessionStats(session.id)!;
        const finalSession = SessionStore.getSession(session.id)!;

        return {
          sessionId: session.id,
          status: finalSession.status,
          output,
          stats: finalStats,
          summary: this.extractSummary(output),
        };
      }

      // For chat mode, return immediately with session info
      return {
        sessionId: session.id,
        status: 'running',
        output: '',
        stats: SessionStore.getSessionStats(session.id)!,
      };
    } catch (error) {
      SessionStore.updateSessionStatus(session.id, 'failed');
      throw error;
    }
  }

  /**
   * Get fallback chain of providers for a task
   */
  private async getFallbackChain(
    task: string,
    preferred?: string
  ): Promise<Provider[]> {
    const chain: Provider[] = [];
    const added = new Set<string>();

    // 1. Add preferred provider
    if (preferred) {
      const provider = this.providers.get(preferred);
      if (provider && await provider.detect()) {
        chain.push(provider);
        added.add(provider.name);
      }
    }

    // 2. Add routing rule matches
    for (const rule of this.routingRules) {
      const regex = new RegExp(rule.pattern, 'i');
      if (regex.test(task)) {
        const provider = this.providers.get(rule.provider);
        if (provider && !added.has(provider.name) && await provider.detect()) {
          chain.push(provider);
          added.add(provider.name);
        }
      }
    }

    // 3. Add fallback order
    for (const providerName of this.fallbackOrder) {
      const provider = this.providers.get(providerName);
      if (provider && !added.has(providerName) && await provider.detect()) {
        chain.push(provider);
        added.add(providerName);
      }
    }

    return chain;
  }

  /**
   * Extract a summary from output
   */
  private extractSummary(output: string): string {
    // Try to find explicit summary
    const summaryMatch = output.match(/(?:summary|result|done):?\s*(.+)/i);
    if (summaryMatch) {
      return summaryMatch[1].trim();
    }

    // Return last non-empty line
    const lines = output.trim().split('\n').filter(line => line.trim());
    if (lines.length > 0) {
      return lines[lines.length - 1].substring(0, 200);
    }

    return 'Task completed';
  }

  /**
   * Get a provider by name
   */
  getProvider(name: string): Provider | undefined {
    return this.providers.get(name);
  }

  /**
   * Get all registered provider names
   */
  getProviderNames(): string[] {
    return Array.from(this.providers.keys());
  }

  /**
   * Get all available (installed) providers
   */
  async getAvailableProviders(): Promise<Provider[]> {
    const available: Provider[] = [];
    for (const provider of this.providers.values()) {
      if (await provider.detect()) {
        available.push(provider);
      }
    }
    return available;
  }

  /**
   * Get providers with a specific capability
   */
  getProvidersWithCapability(
    capability: keyof Provider['capabilities']
  ): Provider[] {
    return Array.from(this.providers.values()).filter(
      (provider) => provider.capabilities[capability]
    );
  }

  /**
   * Resume a session
   */
  async resumeSession(sessionId: string): Promise<void> {
    const session = SessionStore.getSession(sessionId);
    if (!session) {
      throw new BotCliError(
        ErrorCode.SESSION_NOT_FOUND,
        `Session ${sessionId} not found`
      );
    }

    const provider = this.providers.get(session.provider);
    if (!provider) {
      throw new BotCliError(
        ErrorCode.PROVIDER_NOT_FOUND,
        `Provider ${session.provider} not found`
      );
    }

    if (!provider.capabilities.resume) {
      throw new BotCliError(
        ErrorCode.PROVIDER_NOT_AVAILABLE,
        `Provider ${session.provider} does not support session resume`
      );
    }

    if (!session.nativeSessionId) {
      throw new BotCliError(
        ErrorCode.SESSION_NOT_FOUND,
        `Session ${sessionId} has no native session ID for resume`
      );
    }

    const workspace: Workspace = {
      path: session.workspacePath,
      name: session.workspacePath.split('/').pop() || 'workspace',
      worktrees: [],
    };

    await this.processManager.resume(
      sessionId,
      provider,
      session.nativeSessionId,
      {
        mode: 'chat',
        workspace,
      }
    );
  }

  /**
   * Send message to active session
   */
  async sendToSession(sessionId: string, message: string): Promise<void> {
    if (!this.processManager.isRunning(sessionId)) {
      throw new BotCliError(
        ErrorCode.SESSION_NOT_FOUND,
        `Session ${sessionId} is not running`
      );
    }

    await this.processManager.send(sessionId, message);
  }

  /**
   * Terminate a session
   */
  async terminateSession(sessionId: string, force: boolean = false): Promise<void> {
    await this.processManager.terminate(sessionId, force);
  }
}

// Default router instance
let defaultRouter: Router | null = null;

/**
 * Initialize the default router
 */
export function initRouter(config: Config): Router {
  defaultRouter = new Router(config);
  return defaultRouter;
}

/**
 * Get the default router instance
 */
export function getRouter(): Router {
  if (!defaultRouter) {
    throw new Error('Router not initialized. Call initRouter() first.');
  }
  return defaultRouter;
}
