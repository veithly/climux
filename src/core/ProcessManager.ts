/**
 * Process Manager
 * Handles spawning, managing, and terminating CLI processes
 */

import { execa } from 'execa';
import { EventEmitter } from 'events';
import type { Provider, Workspace, RunOptions, SessionEvent, EventType } from '../types/index.js';
import * as SessionStore from './SessionStore.js';

interface ManagedProcess {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  process: any;
  sessionId: string;
  provider: Provider;
  workspace: Workspace;
  startTime: Date;
  output: string[];
}

/**
 * Process Manager class
 */
export class ProcessManager extends EventEmitter {
  private processes: Map<string, ManagedProcess> = new Map();
  private maxConcurrent: number;

  constructor(maxConcurrent: number = 5) {
    super();
    this.maxConcurrent = maxConcurrent;
  }

  /**
   * Spawn a new CLI process
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async spawn(
    sessionId: string,
    provider: Provider,
    task: string,
    options: RunOptions
  ): Promise<any> {
    // Check concurrency limit
    if (this.processes.size >= this.maxConcurrent) {
      throw new Error(
        `Maximum concurrent sessions (${this.maxConcurrent}) reached`
      );
    }

    // Build command arguments
    const args = provider.buildArgs(task, options);

    // Get environment variables
    const env: Record<string, string> = {
      ...process.env as Record<string, string>,
      ...provider.getEnv(),
      ...options.env,
    };

    // Spawn the process
    const proc = execa(provider.command, args, {
      cwd: options.workspace.path,
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
      reject: false,
    });

    const managed: ManagedProcess = {
      process: proc,
      sessionId,
      provider,
      workspace: options.workspace,
      startTime: new Date(),
      output: [],
    };

    this.processes.set(sessionId, managed);

    // Update session status and PID
    SessionStore.updateSessionStatus(sessionId, 'running');
    if (proc.pid) {
      SessionStore.updateSessionPid(sessionId, proc.pid);
    }

    // Setup output handlers
    this.setupOutputHandlers(managed);

    // Emit start event
    this.emitEvent('session:started', sessionId);

    return proc;
  }

  /**
   * Resume an existing session
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async resume(
    sessionId: string,
    provider: Provider,
    nativeSessionId: string,
    options: RunOptions
  ): Promise<any> {
    // Check if provider supports resume
    if (!provider.capabilities.resume) {
      throw new Error(`Provider ${provider.name} does not support session resume`);
    }

    // Build resume arguments
    const args = provider.buildResumeArgs(nativeSessionId, options);

    // Get environment variables
    const env: Record<string, string> = {
      ...process.env as Record<string, string>,
      ...provider.getEnv(),
      ...options.env,
    };

    // Spawn the process
    const proc = execa(provider.command, args, {
      cwd: options.workspace.path,
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
      reject: false,
    });

    const managed: ManagedProcess = {
      process: proc,
      sessionId,
      provider,
      workspace: options.workspace,
      startTime: new Date(),
      output: [],
    };

    this.processes.set(sessionId, managed);

    // Update session
    SessionStore.updateSessionStatus(sessionId, 'running');
    if (proc.pid) {
      SessionStore.updateSessionPid(sessionId, proc.pid);
    }

    // Setup output handlers
    this.setupOutputHandlers(managed);

    // Emit start event
    this.emitEvent('session:started', sessionId);

    return proc;
  }

  /**
   * Setup stdout/stderr handlers
   */
  private setupOutputHandlers(managed: ManagedProcess): void {
    const { process: proc, sessionId, provider } = managed;

    // Handle stdout
    proc.stdout?.on('data', (data: Buffer) => {
      const output = data.toString();
      managed.output.push(output);

      // Log to session
      SessionStore.addSessionLog(sessionId, 'assistant', output);

      // Parse output for stats
      const parsed = provider.parseOutput(output);
      if (parsed.tokens) {
        SessionStore.updateSessionStats(sessionId, {
          tokensIn: parsed.tokens.in,
          tokensOut: parsed.tokens.out,
        });
      }
      if (parsed.cost) {
        SessionStore.updateSessionStats(sessionId, {
          costEstimate: parsed.cost,
        });
      }

      // Emit output event
      this.emitEvent('session:output', sessionId, { output, parsed });

      // Check for completion
      if (provider.isTaskComplete(output)) {
        this.handleCompletion(sessionId, 'completed');
      }
    });

    // Handle stderr
    proc.stderr?.on('data', (data: Buffer) => {
      const output = data.toString();
      managed.output.push(output);
      SessionStore.addSessionLog(sessionId, 'system', output);
    });

    // Handle process exit
    proc.on('exit', (code: number | null) => {
      this.handleProcessExit(sessionId, code);
    });

    // Handle errors
    proc.on('error', (error: Error) => {
      this.handleProcessError(sessionId, error);
    });
  }

  /**
   * Send input to a running process
   */
  async send(sessionId: string, input: string): Promise<void> {
    const managed = this.processes.get(sessionId);
    if (!managed) {
      throw new Error(`Session ${sessionId} not found or not running`);
    }

    if (!managed.process.stdin) {
      throw new Error(`Session ${sessionId} stdin not available`);
    }

    // Log user input
    SessionStore.addSessionLog(sessionId, 'user', input);

    // Write to stdin
    managed.process.stdin.write(input + '\n');
  }

  /**
   * Terminate a running process
   */
  async terminate(sessionId: string, force: boolean = false): Promise<void> {
    const managed = this.processes.get(sessionId);
    if (!managed) {
      return;
    }

    if (force) {
      managed.process.kill('SIGKILL');
    } else {
      // Try graceful termination first
      managed.process.kill('SIGTERM');

      // Wait 5 seconds, then force kill
      setTimeout(() => {
        if (this.processes.has(sessionId)) {
          managed.process.kill('SIGKILL');
        }
      }, 5000);
    }
  }

  /**
   * Check if a session is running
   */
  isRunning(sessionId: string): boolean {
    return this.processes.has(sessionId);
  }

  /**
   * Get active session count
   */
  getActiveCount(): number {
    return this.processes.size;
  }

  /**
   * Get all active session IDs
   */
  getActiveSessions(): string[] {
    return Array.from(this.processes.keys());
  }

  /**
   * Get session output
   */
  getOutput(sessionId: string): string {
    const managed = this.processes.get(sessionId);
    if (!managed) {
      return '';
    }
    return managed.output.join('');
  }

  /**
   * Handle process exit
   */
  private handleProcessExit(sessionId: string, code: number | null): void {
    const managed = this.processes.get(sessionId);
    if (!managed) return;

    // Calculate duration
    const duration = Math.floor(
      (Date.now() - managed.startTime.getTime()) / 1000
    );
    SessionStore.updateSessionStats(sessionId, { durationSeconds: duration });

    // Determine final status
    let status: 'completed' | 'failed' | 'crashed';
    if (code === 0) {
      status = 'completed';
    } else if (code === null) {
      status = 'crashed';
    } else {
      status = 'failed';
    }

    this.handleCompletion(sessionId, status);
  }

  /**
   * Handle process error
   */
  private handleProcessError(sessionId: string, error: Error): void {
    SessionStore.addSessionLog(
      sessionId,
      'system',
      `Error: ${error.message}`
    );
    this.handleCompletion(sessionId, 'crashed');
  }

  /**
   * Handle session completion
   */
  private handleCompletion(
    sessionId: string,
    status: 'completed' | 'failed' | 'crashed'
  ): void {
    // Update session status
    SessionStore.updateSessionStatus(sessionId, status);
    SessionStore.updateSessionPid(sessionId, null);

    // Emit event
    const eventType: EventType = status === 'completed'
      ? 'session:completed'
      : 'session:failed';
    this.emitEvent(eventType, sessionId);

    // Remove from active processes
    this.processes.delete(sessionId);
  }

  /**
   * Emit a session event
   */
  private emitEvent(type: EventType, sessionId: string, data?: unknown): void {
    const event: SessionEvent = {
      type,
      sessionId,
      timestamp: new Date(),
      data,
    };
    this.emit(type, event);
    this.emit('session', event);
  }

  /**
   * Wait for a session to complete
   */
  async waitForCompletion(sessionId: string, timeout?: number): Promise<string> {
    return new Promise((resolve, reject) => {
      const managed = this.processes.get(sessionId);
      if (!managed) {
        // Session might have already completed
        const session = SessionStore.getSession(sessionId);
        if (session && ['completed', 'failed', 'crashed'].includes(session.status)) {
          resolve(this.getSessionOutput(sessionId));
          return;
        }
        reject(new Error(`Session ${sessionId} not found`));
        return;
      }

      let timeoutId: NodeJS.Timeout | undefined;

      const cleanup = () => {
        this.off('session:completed', onComplete);
        this.off('session:failed', onFailed);
        if (timeoutId) clearTimeout(timeoutId);
      };

      const onComplete = (event: SessionEvent) => {
        if (event.sessionId === sessionId) {
          cleanup();
          resolve(this.getSessionOutput(sessionId));
        }
      };

      const onFailed = (event: SessionEvent) => {
        if (event.sessionId === sessionId) {
          cleanup();
          reject(new Error(`Session ${sessionId} failed`));
        }
      };

      this.on('session:completed', onComplete);
      this.on('session:failed', onFailed);

      if (timeout) {
        timeoutId = setTimeout(() => {
          cleanup();
          this.terminate(sessionId, true);
          reject(new Error(`Session ${sessionId} timed out`));
        }, timeout);
      }
    });
  }

  /**
   * Get session output from logs
   */
  private getSessionOutput(sessionId: string): string {
    const logs = SessionStore.getSessionLogs(sessionId);
    return logs
      .filter(log => log.role === 'assistant')
      .map(log => log.content)
      .join('');
  }
}

// Default instance
let defaultProcessManager: ProcessManager | null = null;

/**
 * Get the default process manager instance
 */
export function getProcessManager(maxConcurrent?: number): ProcessManager {
  if (!defaultProcessManager) {
    defaultProcessManager = new ProcessManager(maxConcurrent);
  }
  return defaultProcessManager;
}
