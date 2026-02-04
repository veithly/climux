/**
 * Codex Provider
 * Wrapper for the OpenAI Codex CLI
 */

import { join } from 'path';
import { homedir } from 'os';
import { BaseProvider } from './base.js';
import type { ProviderCapabilities, RunOptions, ParsedOutput, ProviderConfig } from '../types/index.js';

export class CodexProvider extends BaseProvider {
  name = 'codex';
  command = 'codex';

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
    // Use 'exec' subcommand for non-interactive programmatic execution
    const args: string[] = ['exec'];

    if (options.mode === 'task') {
      // Full auto mode for autonomous execution
      args.push('--full-auto');
    }

    // Add the task as the prompt
    args.push(task);

    return args;
  }

  buildResumeArgs(sessionId: string, options: RunOptions): string[] {
    // Codex supports session continuation with --continue flag
    const args: string[] = ['exec'];

    // Use --continue with session ID for resumption
    args.push('--continue', sessionId);

    if (options.mode === 'task') {
      args.push('--full-auto');
    }

    return args;
  }

  getMcpConfigPath(): string {
    return this.config?.mcpConfigPath || join(homedir(), '.codex', 'mcp.json');
  }

  getSkillsConfigPath(): string {
    return this.config?.skillsConfigPath || join(homedir(), '.codex', 'skills.json');
  }

  parseOutput(output: string): ParsedOutput {
    const result: ParsedOutput = {};

    // Parse token usage
    // Codex format varies, try common patterns
    const tokenMatch = output.match(/tokens?\s*used:\s*(\d+)/i) ||
                       output.match(/input:\s*(\d+).*output:\s*(\d+)/i);
    if (tokenMatch) {
      if (tokenMatch[2]) {
        result.tokens = {
          in: parseInt(tokenMatch[1], 10),
          out: parseInt(tokenMatch[2], 10),
        };
      } else {
        result.tokens = {
          in: Math.floor(parseInt(tokenMatch[1], 10) * 0.3),
          out: Math.floor(parseInt(tokenMatch[1], 10) * 0.7),
        };
      }
    }

    // Extract file changes from common patterns
    const filePatterns = [
      /(?:wrote|created|modified|updated)\s+(?:file\s+)?['"]?([^'":\n]+\.[a-z]+)['"]?/gi,
      /(?:saving|writing)\s+(?:to\s+)?['"]?([^'":\n]+\.[a-z]+)['"]?/gi,
    ];

    const files = new Set<string>();
    for (const pattern of filePatterns) {
      const matches = output.matchAll(pattern);
      for (const match of matches) {
        files.add(match[1].trim());
      }
    }
    if (files.size > 0) {
      result.filesChanged = Array.from(files);
    }

    return result;
  }

  isTaskComplete(output: string): boolean {
    const completionIndicators = [
      /completed successfully/i,
      /task done/i,
      /finished/i,
      /all changes applied/i,
      /execution complete/i,
    ];

    for (const indicator of completionIndicators) {
      if (indicator.test(output)) {
        return true;
      }
    }

    return false;
  }
}
