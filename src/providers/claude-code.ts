/**
 * Claude Code Provider
 * Wrapper for the Claude Code CLI
 */

import { join } from 'path';
import { homedir } from 'os';
import { BaseProvider } from './base.js';
import type { ProviderCapabilities, RunOptions, ParsedOutput, ProviderConfig } from '../types/index.js';

export class ClaudeCodeProvider extends BaseProvider {
  name = 'claude-code';
  command = 'claude';

  capabilities: ProviderCapabilities = {
    chat: true,
    task: true,
    resume: true,
    streaming: true,
    mcp: true,
    skills: true,
  };

  constructor(config?: ProviderConfig) {
    super(config);
  }

  buildArgs(task: string, options: RunOptions): string[] {
    const args: string[] = [];

    if (options.mode === 'task') {
      // Task mode: non-interactive, auto-accept
      args.push('--print');
      args.push('--dangerously-skip-permissions');
    }

    // Add the task as the prompt
    args.push(task);

    return args;
  }

  buildResumeArgs(sessionId: string, options: RunOptions): string[] {
    const args = ['--resume', sessionId];

    if (options.mode === 'task') {
      args.push('--print');
      args.push('--dangerously-skip-permissions');
    }

    return args;
  }

  parseOutput(output: string): ParsedOutput {
    const result: ParsedOutput = {};

    // Parse token usage if available
    // Claude Code format: "Tokens: 1234 in, 5678 out"
    const tokenMatch = output.match(/Tokens?:\s*(\d+)\s*in,?\s*(\d+)\s*out/i);
    if (tokenMatch) {
      result.tokens = {
        in: parseInt(tokenMatch[1], 10),
        out: parseInt(tokenMatch[2], 10),
      };
    }

    // Parse cost if available
    // Claude Code format: "Cost: $0.123"
    const costMatch = output.match(/Cost:\s*\$?([\d.]+)/i);
    if (costMatch) {
      result.cost = parseFloat(costMatch[1]);
    }

    // Extract file changes
    // Look for patterns like "Created: file.ts" or "Modified: file.ts"
    const fileMatches = output.matchAll(/(Created|Modified|Deleted|Updated):\s*([^\n]+)/gi);
    const files: string[] = [];
    for (const match of fileMatches) {
      files.push(match[2].trim());
    }
    if (files.length > 0) {
      result.filesChanged = files;
    }

    return result;
  }

  isTaskComplete(output: string): boolean {
    // Claude Code completion indicators
    const completionIndicators = [
      /Task completed/i,
      /Done!/i,
      /Finished/i,
      /All done/i,
      /Successfully/i,
      /\[completed\]/i,
    ];

    for (const indicator of completionIndicators) {
      if (indicator.test(output)) {
        return true;
      }
    }

    return false;
  }

  getMcpConfigPath(): string {
    return this.config?.mcpConfigPath || join(homedir(), '.claude', 'mcp_settings.json');
  }
}
