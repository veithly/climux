import { describe, it, expect } from 'vitest';
import { ClaudeCodeProvider } from '../../src/providers/claude-code.js';
import type { RunOptions, Workspace } from '../../src/types/index.js';

describe('ClaudeCodeProvider', () => {
  const provider = new ClaudeCodeProvider();
  const workspace: Workspace = {
    path: '/test/workspace',
    name: 'test',
    worktrees: [],
  };

  describe('properties', () => {
    it('should have correct name', () => {
      expect(provider.name).toBe('claude-code');
    });

    it('should have correct command', () => {
      expect(provider.command).toBe('claude');
    });

    it('should have correct capabilities', () => {
      expect(provider.capabilities.chat).toBe(true);
      expect(provider.capabilities.task).toBe(true);
      expect(provider.capabilities.resume).toBe(true);
      expect(provider.capabilities.streaming).toBe(true);
      expect(provider.capabilities.mcp).toBe(true);
      expect(provider.capabilities.skills).toBe(true);
    });
  });

  describe('buildArgs', () => {
    it('should build args for task mode with --print flag', () => {
      const options: RunOptions = {
        mode: 'task',
        workspace,
      };

      const args = provider.buildArgs('fix the bug', options);

      expect(args).toContain('--print');
      expect(args).toContain('--dangerously-skip-permissions');
      expect(args).toContain('fix the bug');
    });

    it('should build args for chat mode without --print flag', () => {
      const options: RunOptions = {
        mode: 'chat',
        workspace,
      };

      const args = provider.buildArgs('help me debug', options);

      expect(args).not.toContain('--print');
      expect(args).not.toContain('--dangerously-skip-permissions');
      expect(args).toContain('help me debug');
    });
  });

  describe('buildResumeArgs', () => {
    it('should build resume args with session ID', () => {
      const options: RunOptions = {
        mode: 'chat',
        workspace,
      };

      const args = provider.buildResumeArgs('session-123', options);

      expect(args).toContain('--resume');
      expect(args).toContain('session-123');
    });

    it('should include --print for task mode resume', () => {
      const options: RunOptions = {
        mode: 'task',
        workspace,
      };

      const args = provider.buildResumeArgs('session-123', options);

      expect(args).toContain('--resume');
      expect(args).toContain('session-123');
      expect(args).toContain('--print');
    });
  });

  describe('parseOutput', () => {
    it('should parse token usage from output', () => {
      const output = 'Tokens: 500 in, 200 out';
      const parsed = provider.parseOutput(output);

      expect(parsed.tokens).toBeDefined();
      expect(parsed.tokens!.in).toBe(500);
      expect(parsed.tokens!.out).toBe(200);
    });

    it('should parse cost from output', () => {
      const output = 'Cost: $0.05';
      const parsed = provider.parseOutput(output);

      expect(parsed.cost).toBe(0.05);
    });

    it('should parse file changes from output', () => {
      const output = 'Created: src/index.ts\nModified: package.json';
      const parsed = provider.parseOutput(output);

      expect(parsed.filesChanged).toBeDefined();
      expect(parsed.filesChanged).toContain('src/index.ts');
      expect(parsed.filesChanged).toContain('package.json');
    });

    it('should return empty parsed for no match', () => {
      const output = 'Regular text output';
      const parsed = provider.parseOutput(output);

      expect(parsed.tokens).toBeUndefined();
      expect(parsed.cost).toBeUndefined();
    });
  });

  describe('isTaskComplete', () => {
    it('should detect task complete from "Task completed"', () => {
      expect(provider.isTaskComplete('Task completed')).toBe(true);
    });

    it('should detect task complete from "Done!"', () => {
      expect(provider.isTaskComplete('Done!')).toBe(true);
    });

    it('should detect task complete from "Successfully"', () => {
      expect(provider.isTaskComplete('Successfully completed the task')).toBe(true);
    });

    it('should not detect completion from other output', () => {
      expect(provider.isTaskComplete('Working on it...')).toBe(false);
    });
  });

  describe('getEnv', () => {
    it('should return empty env by default', () => {
      const env = provider.getEnv();
      expect(env).toEqual({});
    });

    it('should return configured env', () => {
      const configuredProvider = new ClaudeCodeProvider({
        env: { ANTHROPIC_API_KEY: 'test-key' },
      });

      const env = configuredProvider.getEnv();
      expect(env.ANTHROPIC_API_KEY).toBe('test-key');
    });
  });

  describe('getMcpConfigPath', () => {
    it('should return default MCP config path', () => {
      const path = provider.getMcpConfigPath();
      expect(path).toContain('.claude');
      expect(path).toContain('mcp_settings.json');
    });

    it('should return custom MCP config path when configured', () => {
      const configuredProvider = new ClaudeCodeProvider({
        mcpConfigPath: '/custom/mcp.json',
      });

      expect(configuredProvider.getMcpConfigPath()).toBe('/custom/mcp.json');
    });
  });
});
