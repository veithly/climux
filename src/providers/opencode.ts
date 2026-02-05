/**
 * OpenCode Provider
 * Wrapper for the OpenCode CLI (meta-provider that can use multiple backends)
 */

import { join } from 'path';
import { homedir } from 'os';
import { BaseProvider } from './base.js';
import type { ProviderCapabilities, RunOptions, ParsedOutput, ProviderConfig } from '../types/index.js';

export interface OpenCodeConfig extends ProviderConfig {
  innerProvider?: string;  // 'anthropic', 'openai', 'gemini', etc.
}

export class OpenCodeProvider extends BaseProvider {
  name = 'opencode';
  command = 'opencode';

  capabilities: ProviderCapabilities = {
    chat: true,
    task: true,
    resume: true,
    streaming: true,
    mcp: true,
    skills: true,
  };

  private innerProvider: string;

  constructor(config?: OpenCodeConfig) {
    super(config);
    this.innerProvider = config?.innerProvider || 'anthropic';
  }

  buildArgs(task: string, options: RunOptions): string[] {
    // Use 'run' subcommand for execution
    const args: string[] = ['run'];

    // Add the task/message first
    args.push(task);

    // Specify the model/provider with -m flag
    if (this.innerProvider) {
      args.push('-m', this.innerProvider);
    }

    // Use JSON format for easier parsing
    if (options.mode === 'task') {
      args.push('--format', 'json');
    }

    return args;
  }

  buildResumeArgs(sessionId: string, options: RunOptions): string[] {
    // Use 'run' subcommand with -s for session continuation
    const args: string[] = ['run'];

    // Use -s for session continuation
    args.push('-s', sessionId);

    // Specify the model/provider
    if (this.innerProvider) {
      args.push('-m', this.innerProvider);
    }

    // Use JSON format for easier parsing
    if (options.mode === 'task') {
      args.push('--format', 'json');
    }

    return args;
  }

  parseOutput(output: string): ParsedOutput {
    const result: ParsedOutput = {};

    // Parse token usage - OpenCode typically shows this in a summary
    const tokenMatch = output.match(/tokens?:?\s*(\d+)\s*(?:input|in).*?(\d+)\s*(?:output|out)/i) ||
                       output.match(/usage:?\s*(\d+)\s*\/\s*(\d+)/i);
    if (tokenMatch) {
      result.tokens = {
        in: parseInt(tokenMatch[1], 10),
        out: parseInt(tokenMatch[2], 10),
      };
    }

    // Parse cost
    const costMatch = output.match(/cost:?\s*\$?([\d.]+)/i) ||
                       output.match(/spent:?\s*\$?([\d.]+)/i);
    if (costMatch) {
      result.cost = parseFloat(costMatch[1]);
    }

    // Extract file changes
    const filePatterns = [
      /(?:created|wrote|modified|updated|edited)\s+['"`]?([^'"`\n]+\.[a-z]+)['"`]?/gi,
      /(?:file|path):?\s*['"`]?([^'"`\n]+\.[a-z]+)['"`]?/gi,
    ];

    const files = new Set<string>();
    for (const pattern of filePatterns) {
      const matches = output.matchAll(pattern);
      for (const match of matches) {
        const file = match[1].trim();
        // Filter out URLs and obvious non-files
        if (!file.startsWith('http') && !file.includes('://') && file.includes('.')) {
          files.add(file);
        }
      }
    }
    if (files.size > 0) {
      result.filesChanged = Array.from(files);
    }

    return result;
  }

  isTaskComplete(output: string): boolean {
    const completionIndicators = [
      /completed/i,
      /done/i,
      /finished/i,
      /success/i,
      /all changes applied/i,
    ];

    for (const indicator of completionIndicators) {
      if (indicator.test(output)) {
        return true;
      }
    }

    return false;
  }

  getMcpConfigPath(): string {
    return this.config?.mcpConfigPath || join(homedir(), '.config', 'opencode', 'mcp.json');
  }

  getSkillsConfigPath(): string | undefined {
    return this.config?.skillsConfigPath || join(homedir(), '.config', 'opencode', 'skills');
  }

  /**
   * Set the inner provider to use
   */
  setInnerProvider(provider: string): void {
    this.innerProvider = provider;
  }

  /**
   * Get the current inner provider
   */
  getInnerProvider(): string {
    return this.innerProvider;
  }
}
