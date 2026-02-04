/**
 * Configuration Loader
 * Handles global config (~/.climux/config.yaml) and project config (.climux/config.yaml)
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { homedir } from 'os';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import type { Config, GlobalConfig, ProjectConfig, ProviderConfig } from '../types/index.js';

const DEFAULT_GLOBAL_CONFIG: GlobalConfig = {
  defaultProvider: 'claude-code',
  routing: [
    { pattern: 'frontend|react|vue|css|ui|style', provider: 'gemini-cli' },
    { pattern: 'debug|fix|bug|error|issue', provider: 'codex' },
    { pattern: '.*', provider: 'claude-code' },
  ],
  fallbackOrder: ['claude-code', 'gemini-cli', 'codex', 'opencode'],
  concurrency: {
    maxActiveSessions: 5,
    maxSessionsPerWorkspace: 3,
  },
  monitoring: {
    trackTokens: true,
    trackCost: true,
    trackGitChanges: true,
    runQualityChecks: false,
  },
  retention: {
    sessionLogs: '30d',
    completedSessions: '90d',
  },
};

const DEFAULT_PROVIDERS: Record<string, ProviderConfig> = {
  'claude-code': {
    name: 'claude-code',
    command: 'claude',
    enabled: true,
    args: {
      task: ['--print', '--dangerously-skip-permissions'],
      chat: [],
      resume: ['--resume'],
    },
    pricing: {
      input: 0.003,
      output: 0.015,
    },
  },
  'codex': {
    name: 'codex',
    command: 'codex',
    enabled: true,
    args: {
      task: ['--approval-mode', 'full-auto'],
      chat: [],
      resume: [],
    },
    pricing: {
      input: 0.003,
      output: 0.012,
    },
  },
  'gemini-cli': {
    name: 'gemini-cli',
    command: 'gemini',
    enabled: true,
    args: {
      task: ['-p'],
      chat: [],
      resume: ['--resume'],
    },
    pricing: {
      input: 0.001,
      output: 0.002,
    },
  },
  'opencode': {
    name: 'opencode',
    command: 'opencode',
    enabled: true,
    args: {
      task: [],
      chat: [],
      resume: [],
    },
    pricing: {
      input: 0.002,
      output: 0.006,
    },
  },
};

/**
 * Get the global config directory
 */
export function getGlobalConfigDir(): string {
  return join(homedir(), '.climux');
}

/**
 * Get the global config file path
 */
export function getGlobalConfigPath(): string {
  return join(getGlobalConfigDir(), 'config.yaml');
}

/**
 * Get the project config file path
 */
export function getProjectConfigPath(workspacePath: string): string {
  return join(workspacePath, '.climux', 'config.yaml');
}

/**
 * Ensure the global config directory exists
 */
function ensureGlobalConfigDir(): void {
  const dir = getGlobalConfigDir();
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

/**
 * Load YAML file
 */
function loadYaml<T>(path: string): T | null {
  if (!existsSync(path)) {
    return null;
  }
  try {
    const content = readFileSync(path, 'utf-8');
    return parseYaml(content) as T;
  } catch {
    return null;
  }
}

/**
 * Save YAML file
 */
function saveYaml<T>(path: string, data: T): void {
  const dir = dirname(path);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  const content = stringifyYaml(data);
  writeFileSync(path, content, 'utf-8');
}

/**
 * Deep merge objects
 */
function deepMerge<T extends object>(target: T, source: Partial<T>): T {
  const result = { ...target };
  for (const key in source) {
    if (Object.prototype.hasOwnProperty.call(source, key)) {
      const sourceValue = source[key];
      const targetValue = result[key];
      if (
        sourceValue !== null &&
        typeof sourceValue === 'object' &&
        !Array.isArray(sourceValue) &&
        targetValue !== null &&
        typeof targetValue === 'object' &&
        !Array.isArray(targetValue)
      ) {
        result[key] = deepMerge(
          targetValue as object,
          sourceValue as object
        ) as T[Extract<keyof T, string>];
      } else if (sourceValue !== undefined) {
        result[key] = sourceValue as T[Extract<keyof T, string>];
      }
    }
  }
  return result;
}

/**
 * Load the full configuration
 */
export function loadConfig(workspacePath?: string): Config {
  ensureGlobalConfigDir();

  // Start with defaults
  let config: Config = {
    ...DEFAULT_GLOBAL_CONFIG,
    providers: { ...DEFAULT_PROVIDERS },
  };

  // Load global config
  const globalConfigPath = getGlobalConfigPath();
  const globalConfig = loadYaml<Partial<GlobalConfig>>(globalConfigPath);
  if (globalConfig) {
    config = deepMerge(config, globalConfig as Partial<Config>);
  }

  // Load provider configs
  const providersDir = join(getGlobalConfigDir(), 'providers');
  if (existsSync(providersDir)) {
    for (const providerName of Object.keys(DEFAULT_PROVIDERS)) {
      const providerConfigPath = join(providersDir, `${providerName}.yaml`);
      const providerConfig = loadYaml<Partial<ProviderConfig>>(providerConfigPath);
      if (providerConfig) {
        config.providers[providerName] = deepMerge(
          config.providers[providerName],
          providerConfig
        );
      }
    }
  }

  // Load project config if workspace provided
  if (workspacePath) {
    const projectConfigPath = getProjectConfigPath(workspacePath);
    const projectConfig = loadYaml<ProjectConfig>(projectConfigPath);
    if (projectConfig) {
      config.project = projectConfig;

      // Override global settings with project settings
      if (projectConfig.defaultProvider) {
        config.defaultProvider = projectConfig.defaultProvider;
      }
      if (projectConfig.routing) {
        config.routing = [...projectConfig.routing, ...config.routing];
      }
    }
  }

  // Apply environment variable overrides
  config = applyEnvOverrides(config);

  return config;
}

/**
 * Apply environment variable overrides
 */
function applyEnvOverrides(config: Config): Config {
  const envProvider = process.env['CLIMUX_DEFAULT_PROVIDER'];
  if (envProvider) {
    config.defaultProvider = envProvider;
  }

  const envMonitoring = process.env['CLIMUX_MONITORING_ENABLED'];
  if (envMonitoring === 'false') {
    config.monitoring.trackTokens = false;
    config.monitoring.trackCost = false;
    config.monitoring.trackGitChanges = false;
  }

  return config;
}

/**
 * Save global config
 */
export function saveGlobalConfig(config: Partial<GlobalConfig>): void {
  const path = getGlobalConfigPath();
  const existing = loadYaml<GlobalConfig>(path) || {};
  const merged = deepMerge(existing, config);
  saveYaml(path, merged);
}

/**
 * Save project config
 */
export function saveProjectConfig(workspacePath: string, config: ProjectConfig): void {
  const path = getProjectConfigPath(workspacePath);
  saveYaml(path, config);
}

/**
 * Initialize project config
 */
export function initProjectConfig(workspacePath: string): void {
  const configPath = getProjectConfigPath(workspacePath);
  if (existsSync(configPath)) {
    throw new Error('Project config already exists');
  }

  const defaultProjectConfig: ProjectConfig = {
    defaultProvider: 'claude-code',
    routing: [],
    workspaces: {},
    presets: {},
  };

  saveYaml(configPath, defaultProjectConfig);
}

/**
 * Get config value by path (e.g., 'monitoring.trackTokens')
 */
export function getConfigValue(config: Config, path: string): unknown {
  const parts = path.split('.');
  let current: unknown = config;
  for (const part of parts) {
    if (current === null || typeof current !== 'object') {
      return undefined;
    }
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

/**
 * Set config value by path
 */
export function setConfigValue(
  config: Config,
  path: string,
  value: unknown
): Config {
  const parts = path.split('.');
  const result = { ...config };
  let current: Record<string, unknown> = result as unknown as Record<string, unknown>;

  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    if (!current[part] || typeof current[part] !== 'object') {
      current[part] = {};
    }
    current[part] = { ...(current[part] as object) };
    current = current[part] as Record<string, unknown>;
  }

  current[parts[parts.length - 1]] = value;
  return result;
}
