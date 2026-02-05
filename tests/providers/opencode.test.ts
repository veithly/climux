import { describe, it, expect } from 'vitest';
import { OpenCodeProvider } from '../../src/providers/opencode.js';
import type { RunOptions, Workspace } from '../../src/types/index.js';

describe('OpenCodeProvider', () => {
  const provider = new OpenCodeProvider();
  const workspace: Workspace = {
    path: '/test/workspace',
    name: 'test',
    worktrees: [],
  };

  describe('properties', () => {
    it('should have correct name', () => {
      expect(provider.name).toBe('opencode');
    });

    it('should have correct command', () => {
      expect(provider.command).toBe('opencode');
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
    it('should build args for task mode with run subcommand', () => {
      const options: RunOptions = {
        mode: 'task',
        workspace,
      };

      const args = provider.buildArgs('debug the code', options);

      expect(args[0]).toBe('run');
      expect(args).toContain('debug the code');
      expect(args).toContain('--format');
      expect(args).toContain('json');
    });

    it('should build args for chat mode without json format', () => {
      const options: RunOptions = {
        mode: 'chat',
        workspace,
      };

      const args = provider.buildArgs('help me', options);

      expect(args[0]).toBe('run');
      expect(args).toContain('help me');
      expect(args).not.toContain('--format');
    });

    it('should include inner provider with -m flag', () => {
      const customProvider = new OpenCodeProvider({ innerProvider: 'openai' });
      const options: RunOptions = {
        mode: 'task',
        workspace,
      };

      const args = customProvider.buildArgs('test task', options);

      expect(args).toContain('-m');
      expect(args).toContain('openai');
    });
  });

  describe('buildResumeArgs', () => {
    it('should build resume args with -s flag', () => {
      const options: RunOptions = {
        mode: 'chat',
        workspace,
      };

      const args = provider.buildResumeArgs('session-123', options);
      expect(args[0]).toBe('run');
      expect(args).toContain('-s');
      expect(args).toContain('session-123');
    });

    it('should include json format for task mode resume', () => {
      const options: RunOptions = {
        mode: 'task',
        workspace,
      };

      const args = provider.buildResumeArgs('session-456', options);
      expect(args[0]).toBe('run');
      expect(args).toContain('-s');
      expect(args).toContain('session-456');
      expect(args).toContain('--format');
      expect(args).toContain('json');
    });
  });

  describe('getMcpConfigPath', () => {
    it('should return default mcp config path', () => {
      const path = provider.getMcpConfigPath();
      expect(path).toContain('.config');
      expect(path).toContain('opencode');
      expect(path).toContain('mcp.json');
    });
  });

  describe('getSkillsConfigPath', () => {
    it('should return default skills config path', () => {
      const path = provider.getSkillsConfigPath();
      expect(path).toContain('.config');
      expect(path).toContain('opencode');
      expect(path).toContain('skills');
    });
  });

  describe('innerProvider', () => {
    it('should default to anthropic', () => {
      expect(provider.getInnerProvider()).toBe('anthropic');
    });

    it('should allow setting inner provider', () => {
      const customProvider = new OpenCodeProvider({ innerProvider: 'gemini' });
      expect(customProvider.getInnerProvider()).toBe('gemini');
    });

    it('should allow changing inner provider', () => {
      const customProvider = new OpenCodeProvider();
      customProvider.setInnerProvider('openai');
      expect(customProvider.getInnerProvider()).toBe('openai');
    });
  });

  describe('parseOutput', () => {
    it('should parse token usage from input/output format', () => {
      const output = 'tokens: 500 input 200 output';
      const parsed = provider.parseOutput(output);

      expect(parsed.tokens).toBeDefined();
      expect(parsed.tokens!.in).toBe(500);
      expect(parsed.tokens!.out).toBe(200);
    });

    it('should parse cost from output', () => {
      const output = 'cost: $0.05';
      const parsed = provider.parseOutput(output);

      expect(parsed.cost).toBeDefined();
      expect(parsed.cost).toBe(0.05);
    });

    it('should parse file changes from output', () => {
      const output = 'wrote "src/index.ts"';
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
      expect(provider.isTaskComplete('task completed')).toBe(true);
    });

    it('should detect "done"', () => {
      expect(provider.isTaskComplete('done')).toBe(true);
    });

    it('should detect "finished"', () => {
      expect(provider.isTaskComplete('finished')).toBe(true);
    });

    it('should detect "success"', () => {
      expect(provider.isTaskComplete('success')).toBe(true);
    });

    it('should detect "all changes applied"', () => {
      expect(provider.isTaskComplete('all changes applied')).toBe(true);
    });

    it('should not detect from regular output', () => {
      expect(provider.isTaskComplete('processing...')).toBe(false);
    });
  });
});
