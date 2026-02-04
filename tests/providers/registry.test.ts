import { describe, it, expect } from 'vitest';
import {
  getProvider,
  getProviderNames,
  hasProvider,
  registerProvider,
} from '../../src/providers/index.js';
import { BaseProvider } from '../../src/providers/base.js';
import type { ProviderCapabilities, RunOptions, ParsedOutput } from '../../src/types/index.js';

describe('Provider Registry', () => {
  describe('getProviderNames', () => {
    it('should return list of registered providers', () => {
      const names = getProviderNames();

      expect(names).toContain('claude-code');
      expect(names).toContain('codex');
      expect(names).toContain('gemini-cli');
      expect(names).toContain('opencode');
    });
  });

  describe('hasProvider', () => {
    it('should return true for registered providers', () => {
      expect(hasProvider('claude-code')).toBe(true);
      expect(hasProvider('codex')).toBe(true);
    });

    it('should return false for unknown providers', () => {
      expect(hasProvider('unknown-provider')).toBe(false);
    });
  });

  describe('getProvider', () => {
    it('should return provider instance for registered name', () => {
      const provider = getProvider('claude-code');

      expect(provider).toBeDefined();
      expect(provider!.name).toBe('claude-code');
    });

    it('should return undefined for unknown provider', () => {
      const provider = getProvider('unknown');

      expect(provider).toBeUndefined();
    });

    it('should cache provider instances', () => {
      const provider1 = getProvider('codex');
      const provider2 = getProvider('codex');

      expect(provider1).toBe(provider2);
    });

    it('should create new instance with custom config', () => {
      const provider1 = getProvider('claude-code');
      const provider2 = getProvider('claude-code', {
        name: 'claude-code',
        command: 'claude',
        enabled: true,
        env: { CUSTOM_VAR: 'value' },
      });

      // Different instances when config is provided
      expect(provider1).not.toBe(provider2);
      expect(provider2!.getEnv().CUSTOM_VAR).toBe('value');
    });
  });

  describe('registerProvider', () => {
    it('should register custom provider', () => {
      class CustomProvider extends BaseProvider {
        name = 'custom-test';
        command = 'custom-cli';
        capabilities: ProviderCapabilities = {
          chat: true,
          task: true,
          streaming: true,
          resume: false,
          mcp: false,
          skills: false,
        };

        buildArgs(task: string, _options: RunOptions): string[] {
          return [task];
        }

        buildResumeArgs(_sessionId: string, _options: RunOptions): string[] {
          return [];
        }

        parseOutput(_output: string): ParsedOutput {
          return {};
        }

        isTaskComplete(_output: string): boolean {
          return false;
        }
      }

      registerProvider('custom-test', () => new CustomProvider());

      expect(hasProvider('custom-test')).toBe(true);

      const provider = getProvider('custom-test');
      expect(provider).toBeDefined();
      expect(provider!.name).toBe('custom-test');
    });
  });
});
