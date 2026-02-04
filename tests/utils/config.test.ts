import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { loadConfig, getGlobalConfigDir, getProjectConfigPath } from '../../src/utils/config.js';

describe('Config', () => {
  let testWorkspace: string;

  beforeEach(() => {
    // Create temporary workspace for project config tests
    testWorkspace = fs.mkdtempSync(path.join(os.tmpdir(), 'climux-config-test-'));
  });

  afterEach(() => {
    fs.rmSync(testWorkspace, { recursive: true, force: true });
  });

  describe('getGlobalConfigDir', () => {
    it('should return path under home directory', () => {
      const configDir = getGlobalConfigDir();
      expect(configDir).toContain('.climux');
      expect(configDir.startsWith(os.homedir())).toBe(true);
    });
  });

  describe('getProjectConfigPath', () => {
    it('should return .climux/config.yaml under workspace', () => {
      const configPath = getProjectConfigPath('/my/workspace');
      expect(configPath).toContain('.climux');
      expect(configPath).toContain('config.yaml');
    });
  });

  describe('loadConfig', () => {
    it('should return config with providers', () => {
      const config = loadConfig();

      expect(config).toBeDefined();
      expect(config.providers).toBeDefined();
    });

    it('should have claude-code as default provider', () => {
      const config = loadConfig();

      expect(config.providers['claude-code']).toBeDefined();
      expect(config.providers['claude-code'].enabled).toBe(true);
      expect(config.defaultProvider).toBe('claude-code');
    });

    it('should have reasonable concurrency defaults', () => {
      const config = loadConfig();

      expect(config.concurrency.maxActiveSessions).toBeGreaterThan(0);
      expect(config.concurrency.maxActiveSessions).toBeLessThanOrEqual(10);
    });

    it('should have default routing rules', () => {
      const config = loadConfig();

      expect(Array.isArray(config.routing)).toBe(true);
      expect(config.routing.length).toBeGreaterThan(0);
    });

    it('should have fallback order', () => {
      const config = loadConfig();

      expect(Array.isArray(config.fallbackOrder)).toBe(true);
      expect(config.fallbackOrder.length).toBeGreaterThan(0);
      expect(config.fallbackOrder).toContain('claude-code');
    });

    it('should load project config when workspace provided', () => {
      // Create project config
      const projectConfigDir = path.join(testWorkspace, '.climux');
      fs.mkdirSync(projectConfigDir, { recursive: true });

      fs.writeFileSync(
        path.join(projectConfigDir, 'config.yaml'),
        `defaultProvider: codex
routing:
  - pattern: test-pattern
    provider: opencode
`
      );

      const config = loadConfig(testWorkspace);

      expect(config.defaultProvider).toBe('codex');
      // Project routing rules are prepended to global rules
      expect(config.routing[0].pattern).toBe('test-pattern');
      expect(config.routing[0].provider).toBe('opencode');
    });

    it('should include project config object when workspace provided', () => {
      const projectConfigDir = path.join(testWorkspace, '.climux');
      fs.mkdirSync(projectConfigDir, { recursive: true });

      fs.writeFileSync(
        path.join(projectConfigDir, 'config.yaml'),
        `defaultProvider: gemini-cli
`
      );

      const config = loadConfig(testWorkspace);

      expect(config.project).toBeDefined();
      expect(config.project!.defaultProvider).toBe('gemini-cli');
    });

    it('should apply environment variable overrides', () => {
      const originalEnv = process.env.CLIMUX_DEFAULT_PROVIDER;
      process.env.CLIMUX_DEFAULT_PROVIDER = 'opencode';

      try {
        const config = loadConfig();
        expect(config.defaultProvider).toBe('opencode');
      } finally {
        if (originalEnv !== undefined) {
          process.env.CLIMUX_DEFAULT_PROVIDER = originalEnv;
        } else {
          delete process.env.CLIMUX_DEFAULT_PROVIDER;
        }
      }
    });
  });
});
