/**
 * Gemini CLI Provider
 * Wrapper for the Google Gemini CLI
 */

import { join } from 'path';
import { homedir } from 'os';
import { BaseProvider } from './base.js';
import type { ProviderCapabilities, RunOptions, ParsedOutput, ProviderConfig } from '../types/index.js';

export class GeminiCliProvider extends BaseProvider {
  name = 'gemini-cli';
  command = 'gemini';

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

    // Use -p for prompt mode
    args.push('-p', task);

    if (options.mode === 'task') {
      // Disable sandbox for full access
      args.push('--sandbox=false');
    }

    return args;
  }

  buildResumeArgs(sessionId: string, options: RunOptions): string[] {
    const args = ['--resume', sessionId];

    if (options.mode === 'task') {
      args.push('--sandbox=false');
    }

    return args;
  }

  parseOutput(output: string): ParsedOutput {
    const result: ParsedOutput = {};

    // Parse token usage
    // Gemini format: "Token count: input=1234, output=5678"
    const tokenMatch = output.match(/(?:token|tokens)\s*(?:count)?:?\s*input[=:]?\s*(\d+).*output[=:]?\s*(\d+)/i);
    if (tokenMatch) {
      result.tokens = {
        in: parseInt(tokenMatch[1], 10),
        out: parseInt(tokenMatch[2], 10),
      };
    }

    // Parse cost
    const costMatch = output.match(/cost:?\s*\$?([\d.]+)/i);
    if (costMatch) {
      result.cost = parseFloat(costMatch[1]);
    }

    // Extract file changes
    const filePatterns = [
      /(?:created|wrote|modified|updated|saved)\s+(?:file\s+)?['"`]?([^'"`\n:]+\.[a-z]+)['"`]?/gi,
      /file:\s*['"`]?([^'"`\n]+\.[a-z]+)['"`]?/gi,
    ];

    const files = new Set<string>();
    for (const pattern of filePatterns) {
      const matches = output.matchAll(pattern);
      for (const match of matches) {
        const file = match[1].trim();
        if (!file.startsWith('http') && !file.includes('://')) {
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
      /task complete/i,
    ];

    for (const indicator of completionIndicators) {
      if (indicator.test(output)) {
        return true;
      }
    }

    return false;
  }

  getMcpConfigPath(): string {
    return this.config?.mcpConfigPath || join(homedir(), '.gemini', 'mcp.json');
  }

  getSkillsConfigPath(): string {
    return this.config?.skillsConfigPath || join(homedir(), '.gemini', 'skills.json');
  }
}
