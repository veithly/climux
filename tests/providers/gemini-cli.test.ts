import { describe, it, expect } from 'vitest';
import { GeminiCliProvider } from '../../src/providers/gemini-cli.js';
import type { RunOptions, Workspace } from '../../src/types/index.js';

describe('GeminiCliProvider', () => {
  const provider = new GeminiCliProvider();
  const workspace: Workspace = {
    path: '/test/workspace',
    name: 'test',
    worktrees: [],
  };

  describe('properties', () => {
    it('should have correct name', () => {
      expect(provider.name).toBe('gemini-cli');
    });

    it('should have correct command', () => {
      expect(provider.command).toBe('gemini');
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
    it('should build args with -p flag for prompt', () => {
      const options: RunOptions = {
        mode: 'chat',
        workspace,
      };

      const args = provider.buildArgs('help me', options);

      expect(args).toContain('-p');
      expect(args).toContain('help me');
    });

    it('should include --sandbox=false for task mode', () => {
      const options: RunOptions = {
        mode: 'task',
        workspace,
      };

      const args = provider.buildArgs('fix the bug', options);

      expect(args).toContain('-p');
      expect(args).toContain('fix the bug');
      expect(args).toContain('--sandbox=false');
    });
  });

  describe('buildResumeArgs', () => {
    it('should build resume args with --resume flag', () => {
      const options: RunOptions = {
        mode: 'chat',
        workspace,
      };

      const args = provider.buildResumeArgs('session-123', options);
      expect(args).toContain('--resume');
      expect(args).toContain('session-123');
    });

    it('should include --sandbox=false for task mode resume', () => {
      const options: RunOptions = {
        mode: 'task',
        workspace,
      };

      const args = provider.buildResumeArgs('session-456', options);
      expect(args).toContain('--resume');
      expect(args).toContain('session-456');
      expect(args).toContain('--sandbox=false');
    });
  });

  describe('getMcpConfigPath', () => {
    it('should return default mcp config path', () => {
      const path = provider.getMcpConfigPath();
      expect(path).toContain('.gemini');
      expect(path).toContain('mcp.json');
    });
  });

  describe('getSkillsConfigPath', () => {
    it('should return default skills config path', () => {
      const path = provider.getSkillsConfigPath();
      expect(path).toContain('.gemini');
      expect(path).toContain('skills.json');
    });
  });

  describe('parseOutput', () => {
    it('should parse token usage from Gemini format', () => {
      const output = 'Token count: input=500, output=200';
      const parsed = provider.parseOutput(output);

      expect(parsed.tokens).toBeDefined();
      expect(parsed.tokens!.in).toBe(500);
      expect(parsed.tokens!.out).toBe(200);
    });

    it('should parse file changes from output', () => {
      const output = 'created file "src/index.ts"';
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
    it('should detect "completed"', () => {
      expect(provider.isTaskComplete('completed')).toBe(true);
    });

    it('should detect "done"', () => {
      expect(provider.isTaskComplete('done')).toBe(true);
    });

    it('should detect "finished"', () => {
      expect(provider.isTaskComplete('finished')).toBe(true);
    });

    it('should not detect from regular output', () => {
      expect(provider.isTaskComplete('processing...')).toBe(false);
    });
  });
});
