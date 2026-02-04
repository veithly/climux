import { describe, it, expect } from 'vitest';
import { CodexProvider } from '../../src/providers/codex.js';
import type { RunOptions, Workspace } from '../../src/types/index.js';

describe('CodexProvider', () => {
  const provider = new CodexProvider();
  const workspace: Workspace = {
    path: '/test/workspace',
    name: 'test',
    worktrees: [],
  };

  describe('properties', () => {
    it('should have correct name', () => {
      expect(provider.name).toBe('codex');
    });

    it('should have correct command', () => {
      expect(provider.command).toBe('codex');
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
    it('should build args for task mode with exec and full-auto', () => {
      const options: RunOptions = {
        mode: 'task',
        workspace,
      };

      const args = provider.buildArgs('debug the code', options);

      expect(args[0]).toBe('exec');
      expect(args).toContain('--full-auto');
      expect(args).toContain('debug the code');
    });

    it('should build args for chat mode with exec but without full-auto', () => {
      const options: RunOptions = {
        mode: 'chat',
        workspace,
      };

      const args = provider.buildArgs('help me', options);

      expect(args[0]).toBe('exec');
      expect(args).not.toContain('--full-auto');
      expect(args).toContain('help me');
    });
  });

  describe('buildResumeArgs', () => {
    it('should build resume args with --continue flag', () => {
      const options: RunOptions = {
        mode: 'chat',
        workspace,
      };

      const args = provider.buildResumeArgs('session-123', options);
      expect(args[0]).toBe('exec');
      expect(args).toContain('--continue');
      expect(args).toContain('session-123');
    });

    it('should include --full-auto for task mode resume', () => {
      const options: RunOptions = {
        mode: 'task',
        workspace,
      };

      const args = provider.buildResumeArgs('session-456', options);
      expect(args[0]).toBe('exec');
      expect(args).toContain('--continue');
      expect(args).toContain('session-456');
      expect(args).toContain('--full-auto');
    });
  });

  describe('getMcpConfigPath', () => {
    it('should return default mcp config path', () => {
      const path = provider.getMcpConfigPath();
      expect(path).toContain('.codex');
      expect(path).toContain('mcp.json');
    });
  });

  describe('getSkillsConfigPath', () => {
    it('should return default skills config path', () => {
      const path = provider.getSkillsConfigPath();
      expect(path).toContain('.codex');
      expect(path).toContain('skills.json');
    });
  });

  describe('parseOutput', () => {
    it('should parse token usage from input/output format', () => {
      const output = 'input: 500 output: 200';
      const parsed = provider.parseOutput(output);

      expect(parsed.tokens).toBeDefined();
      expect(parsed.tokens!.in).toBe(500);
      expect(parsed.tokens!.out).toBe(200);
    });

    it('should parse file changes from output', () => {
      const output = 'wrote file "src/index.ts"';
      const parsed = provider.parseOutput(output);

      expect(parsed.filesChanged).toBeDefined();
      expect(parsed.filesChanged!.length).toBeGreaterThan(0);
    });

    it('should return empty parsed for no match', () => {
      const output = 'Processing your request...';
      const parsed = provider.parseOutput(output);

      expect(parsed.tokens).toBeUndefined();
    });
  });

  describe('isTaskComplete', () => {
    it('should detect "completed successfully"', () => {
      expect(provider.isTaskComplete('completed successfully')).toBe(true);
    });

    it('should detect "task done"', () => {
      expect(provider.isTaskComplete('task done')).toBe(true);
    });

    it('should detect "finished"', () => {
      expect(provider.isTaskComplete('finished')).toBe(true);
    });

    it('should not detect from regular output', () => {
      expect(provider.isTaskComplete('processing...')).toBe(false);
    });
  });
});
