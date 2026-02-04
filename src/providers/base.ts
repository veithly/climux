/**
 * Base Provider Abstract Class
 * All CLI providers must extend this class
 */

import { execa } from 'execa';
import type { Provider, ProviderCapabilities, RunOptions, ParsedOutput, ProviderConfig } from '../types/index.js';

export abstract class BaseProvider implements Provider {
  abstract name: string;
  abstract command: string;
  abstract capabilities: ProviderCapabilities;

  protected config?: ProviderConfig;

  constructor(config?: ProviderConfig) {
    this.config = config;
  }

  /**
   * Detect if the CLI tool is installed
   */
  async detect(): Promise<boolean> {
    try {
      await execa(this.command, ['--version']);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Build command arguments for running a task
   */
  abstract buildArgs(task: string, options: RunOptions): string[];

  /**
   * Build command arguments for resuming a session
   */
  abstract buildResumeArgs(sessionId: string, options: RunOptions): string[];

  /**
   * Parse output to extract statistics
   */
  abstract parseOutput(output: string): ParsedOutput;

  /**
   * Check if the task is complete based on output
   */
  abstract isTaskComplete(output: string): boolean;

  /**
   * Get the MCP config path for this CLI
   */
  getMcpConfigPath(): string | undefined {
    return this.config?.mcpConfigPath;
  }

  /**
   * Get the Skills config path for this CLI
   */
  getSkillsConfigPath(): string | undefined {
    return this.config?.skillsConfigPath;
  }

  /**
   * Get environment variables for this provider
   */
  getEnv(): Record<string, string> {
    return this.config?.env || {};
  }

  /**
   * Get pricing information
   */
  getPricing(): { input: number; output: number } | undefined {
    return this.config?.pricing;
  }

  /**
   * Estimate cost based on token usage
   */
  estimateCost(tokensIn: number, tokensOut: number): number {
    const pricing = this.getPricing();
    if (!pricing) return 0;
    return (tokensIn / 1000) * pricing.input + (tokensOut / 1000) * pricing.output;
  }
}
