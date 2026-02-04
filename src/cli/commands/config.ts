/**
 * Config Command
 * Manage BotCLI configuration
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';
import {
  loadConfig,
  saveGlobalConfig,
  saveProjectConfig,
  initProjectConfig,
  getGlobalConfigPath,
  getProjectConfigPath,
} from '../../utils/config.js';
import type { GlobalConfig, ProjectConfig } from '../../types/index.js';
import { getCurrentWorkspace } from '../../core/Workspace.js';
import { getProvider, getProviderNames } from '../../providers/index.js';

export function registerConfigCommand(program: Command): void {
  const config = program
    .command('config')
    .description('Manage configuration');

  // Show config
  config
    .command('show')
    .description('Show current configuration')
    .option('-p, --provider <name>', 'Show specific provider config')
    .option('--providers', 'Show all providers status')
    .option('--global', 'Show only global config')
    .option('--project', 'Show only project config')
    .action(async (options) => {
      await showConfig(options);
    });

  // Set config
  config
    .command('set')
    .description('Set a configuration value')
    .argument('<key>', 'Configuration key (e.g., defaultProvider)')
    .argument('<value>', 'Configuration value')
    .option('-g, --global', 'Set in global config')
    .action(async (key: string, value: string, options) => {
      await setConfig(key, value, options);
    });

  // Initialize project config
  config
    .command('init')
    .description('Initialize project configuration')
    .action(async () => {
      await initConfig();
    });

  // Export config
  config
    .command('export')
    .description('Export configuration as YAML')
    .action(async () => {
      await exportConfig();
    });

  // Import config
  config
    .command('import')
    .description('Import configuration from a YAML file')
    .argument('<file>', 'Path to YAML configuration file')
    .option('-g, --global', 'Import to global config')
    .option('-m, --merge', 'Merge with existing config instead of replacing')
    .action(async (file: string, options: { global?: boolean; merge?: boolean }) => {
      await importConfig(file, options);
    });
}

async function showConfig(options: {
  provider?: string;
  providers?: boolean;
  global?: boolean;
  project?: boolean;
}): Promise<void> {
  const workspace = getCurrentWorkspace();
  const config = loadConfig(workspace.path);

  if (options.providers) {
    await showProviders();
    return;
  }

  if (options.provider) {
    await showProviderConfig(options.provider);
    return;
  }

  // Show config paths
  console.log(chalk.bold('Configuration Files'));
  console.log(chalk.gray('-'.repeat(60)));

  const globalPath = getGlobalConfigPath();
  const projectPath = getProjectConfigPath(workspace.path);

  console.log(`Global:  ${chalk.cyan(globalPath)}`);
  console.log(`         ${existsSync(globalPath) ? chalk.green('exists') : chalk.gray('not found')}`);
  console.log(`Project: ${chalk.cyan(projectPath)}`);
  console.log(`         ${existsSync(projectPath) ? chalk.green('exists') : chalk.gray('not found')}`);
  console.log();

  if (!options.project) {
    console.log(chalk.bold('Global Configuration'));
    console.log(chalk.gray('-'.repeat(60)));
    console.log(`Default Provider: ${chalk.cyan(config.defaultProvider)}`);
    console.log(`Fallback Order:   ${config.fallbackOrder.join(' -> ')}`);
    console.log();

    console.log(chalk.bold('Routing Rules:'));
    for (const rule of config.routing) {
      console.log(`  ${chalk.gray(rule.pattern)} -> ${chalk.cyan(rule.provider)}`);
    }
    console.log();

    console.log(chalk.bold('Concurrency:'));
    console.log(`  Max Active Sessions:     ${config.concurrency.maxActiveSessions}`);
    console.log(`  Max Sessions/Workspace:  ${config.concurrency.maxSessionsPerWorkspace}`);
    console.log();

    console.log(chalk.bold('Monitoring:'));
    console.log(`  Track Tokens:        ${boolStr(config.monitoring.trackTokens)}`);
    console.log(`  Track Cost:          ${boolStr(config.monitoring.trackCost)}`);
    console.log(`  Track Git Changes:   ${boolStr(config.monitoring.trackGitChanges)}`);
    console.log(`  Run Quality Checks:  ${boolStr(config.monitoring.runQualityChecks)}`);
  }

  if (!options.global && config.project) {
    console.log();
    console.log(chalk.bold('Project Configuration'));
    console.log(chalk.gray('-'.repeat(60)));

    if (config.project.defaultProvider) {
      console.log(`Default Provider: ${chalk.cyan(config.project.defaultProvider)}`);
    }

    if (config.project.routing && config.project.routing.length > 0) {
      console.log(chalk.bold('Project Routing Rules:'));
      for (const rule of config.project.routing) {
        console.log(`  ${chalk.gray(rule.pattern)} -> ${chalk.cyan(rule.provider)}`);
      }
    }

    if (config.project.presets && Object.keys(config.project.presets).length > 0) {
      console.log(chalk.bold('Presets:'));
      for (const [name, preset] of Object.entries(config.project.presets)) {
        console.log(`  ${chalk.cyan(name)}: mode=${preset.mode}, provider=${preset.provider}`);
      }
    }
  }
}

async function showProviders(): Promise<void> {
  console.log(chalk.bold('Provider Status'));
  console.log(chalk.gray('-'.repeat(60)));
  console.log(
    chalk.bold(
      padRight('Provider', 16) +
      padRight('Command', 12) +
      padRight('Status', 14) +
      'Capabilities'
    )
  );
  console.log(chalk.gray('-'.repeat(60)));

  const names = getProviderNames();

  for (const name of names) {
    const provider = getProvider(name);
    if (!provider) continue;

    const installed = await provider.detect();
    const status = installed ? chalk.green('installed') : chalk.red('not found');

    const caps = [];
    if (provider.capabilities.chat) caps.push('chat');
    if (provider.capabilities.task) caps.push('task');
    if (provider.capabilities.resume) caps.push('resume');
    if (provider.capabilities.mcp) caps.push('mcp');
    if (provider.capabilities.skills) caps.push('skills');

    console.log(
      chalk.cyan(padRight(name, 16)) +
      padRight(provider.command, 12) +
      padRight(status, 14) +
      chalk.gray(caps.join(', '))
    );
  }
}

async function showProviderConfig(name: string): Promise<void> {
  const workspace = getCurrentWorkspace();
  const config = loadConfig(workspace.path);

  const providerConfig = config.providers[name];
  if (!providerConfig) {
    console.error(chalk.red(`Provider '${name}' not found`));
    return;
  }

  const provider = getProvider(name);
  const installed = provider ? await provider.detect() : false;

  console.log(chalk.bold(`Provider: ${name}`));
  console.log(chalk.gray('-'.repeat(40)));
  console.log(`Command:    ${providerConfig.command}`);
  console.log(`Enabled:    ${boolStr(providerConfig.enabled !== false)}`);
  console.log(`Status:     ${installed ? chalk.green('installed') : chalk.red('not found')}`);

  if (providerConfig.pricing) {
    console.log();
    console.log(chalk.bold('Pricing (per 1K tokens):'));
    console.log(`  Input:  $${providerConfig.pricing.input}`);
    console.log(`  Output: $${providerConfig.pricing.output}`);
  }

  if (provider) {
    console.log();
    console.log(chalk.bold('Capabilities:'));
    console.log(`  Chat:      ${boolStr(provider.capabilities.chat)}`);
    console.log(`  Task:      ${boolStr(provider.capabilities.task)}`);
    console.log(`  Resume:    ${boolStr(provider.capabilities.resume)}`);
    console.log(`  Streaming: ${boolStr(provider.capabilities.streaming)}`);
    console.log(`  MCP:       ${boolStr(provider.capabilities.mcp)}`);
    console.log(`  Skills:    ${boolStr(provider.capabilities.skills)}`);
  }
}

async function setConfig(
  key: string,
  value: string,
  _options: { global?: boolean }
): Promise<void> {
  // Parse value
  let parsedValue: unknown = value;
  if (value === 'true') parsedValue = true;
  else if (value === 'false') parsedValue = false;
  else if (!isNaN(Number(value))) parsedValue = Number(value);

  // Set in global config
  const updates: Record<string, unknown> = {};

  // Handle nested keys
  const parts = key.split('.');
  let current = updates;
  for (let i = 0; i < parts.length - 1; i++) {
    current[parts[i]] = {};
    current = current[parts[i]] as Record<string, unknown>;
  }
  current[parts[parts.length - 1]] = parsedValue;

  saveGlobalConfig(updates as never);
  console.log(chalk.green(`Set ${key} = ${value}`));
}

async function initConfig(): Promise<void> {
  const workspace = getCurrentWorkspace();
  const projectPath = getProjectConfigPath(workspace.path);

  if (existsSync(projectPath)) {
    console.error(chalk.yellow('Project config already exists'));
    console.log(chalk.gray(`Path: ${projectPath}`));
    return;
  }

  try {
    initProjectConfig(workspace.path);
    console.log(chalk.green('Initialized project configuration'));
    console.log(chalk.gray(`Created: ${projectPath}`));
  } catch (error) {
    console.error(chalk.red(error instanceof Error ? error.message : 'Failed to initialize config'));
  }
}

async function exportConfig(): Promise<void> {
  const workspace = getCurrentWorkspace();
  const config = loadConfig(workspace.path);

  // Convert to YAML-like output
  const yaml = await import('yaml');
  console.log(yaml.stringify(config));
}

async function importConfig(
  file: string,
  options: { global?: boolean; merge?: boolean }
): Promise<void> {
  const yaml = await import('yaml');
  const workspace = getCurrentWorkspace();

  // Resolve file path
  const filePath = resolve(file);

  // Check if file exists
  if (!existsSync(filePath)) {
    console.error(chalk.red(`File not found: ${filePath}`));
    return;
  }

  // Read and parse the YAML file
  let importedConfig: unknown;
  try {
    const content = readFileSync(filePath, 'utf-8');
    importedConfig = yaml.parse(content);
  } catch (error) {
    console.error(chalk.red(`Failed to parse YAML file: ${error instanceof Error ? error.message : 'Unknown error'}`));
    return;
  }

  // Validate config structure
  if (!importedConfig || typeof importedConfig !== 'object') {
    console.error(chalk.red('Invalid config: must be a YAML object'));
    return;
  }

  const configObj = importedConfig as Record<string, unknown>;

  // Determine target (global or project)
  if (options.global) {
    // Import to global config
    const validationResult = validateGlobalConfig(configObj);
    if (!validationResult.valid) {
      console.error(chalk.red(`Invalid global config: ${validationResult.error}`));
      return;
    }

    if (options.merge) {
      // Merge with existing global config
      saveGlobalConfig(configObj as Partial<GlobalConfig>);
      console.log(chalk.green('Merged configuration into global config'));
    } else {
      // Replace global config
      saveGlobalConfig(configObj as Partial<GlobalConfig>);
      console.log(chalk.green('Imported configuration to global config'));
    }

    const globalPath = getGlobalConfigPath();
    console.log(chalk.gray(`Path: ${globalPath}`));
  } else {
    // Import to project config
    const validationResult = validateProjectConfig(configObj);
    if (!validationResult.valid) {
      console.error(chalk.red(`Invalid project config: ${validationResult.error}`));
      return;
    }

    const projectPath = getProjectConfigPath(workspace.path);

    if (options.merge && existsSync(projectPath)) {
      // Merge with existing project config
      const existingConfig = loadConfig(workspace.path);
      const mergedProjectConfig = deepMergeConfig(
        existingConfig.project || {},
        configObj
      ) as ProjectConfig;
      saveProjectConfig(workspace.path, mergedProjectConfig);
      console.log(chalk.green('Merged configuration into project config'));
    } else {
      // Replace or create project config
      saveProjectConfig(workspace.path, configObj as ProjectConfig);
      console.log(chalk.green('Imported configuration to project config'));
    }

    console.log(chalk.gray(`Path: ${projectPath}`));
  }

  // Show what was imported
  console.log();
  console.log(chalk.bold('Imported settings:'));
  const keys = Object.keys(configObj);
  for (const key of keys) {
    const value = configObj[key];
    if (Array.isArray(value)) {
      console.log(`  ${chalk.cyan(key)}: ${value.length} items`);
    } else if (typeof value === 'object' && value !== null) {
      console.log(`  ${chalk.cyan(key)}: ${Object.keys(value).length} properties`);
    } else {
      console.log(`  ${chalk.cyan(key)}: ${value}`);
    }
  }
}

function validateGlobalConfig(config: Record<string, unknown>): { valid: boolean; error?: string } {
  // Check for known global config fields
  const validGlobalKeys = [
    'defaultProvider',
    'routing',
    'fallbackOrder',
    'concurrency',
    'monitoring',
    'retention',
    'providers',
  ];

  // At least one valid key should be present
  const hasValidKey = Object.keys(config).some(key => validGlobalKeys.includes(key));
  if (!hasValidKey) {
    return {
      valid: false,
      error: `No valid global config keys found. Expected one of: ${validGlobalKeys.join(', ')}`,
    };
  }

  // Validate specific fields if present
  if (config.routing !== undefined && !Array.isArray(config.routing)) {
    return { valid: false, error: 'routing must be an array' };
  }

  if (config.fallbackOrder !== undefined && !Array.isArray(config.fallbackOrder)) {
    return { valid: false, error: 'fallbackOrder must be an array' };
  }

  if (config.concurrency !== undefined && typeof config.concurrency !== 'object') {
    return { valid: false, error: 'concurrency must be an object' };
  }

  if (config.monitoring !== undefined && typeof config.monitoring !== 'object') {
    return { valid: false, error: 'monitoring must be an object' };
  }

  return { valid: true };
}

function validateProjectConfig(config: Record<string, unknown>): { valid: boolean; error?: string } {
  // Check for known project config fields
  const validProjectKeys = [
    'defaultProvider',
    'routing',
    'workspaces',
    'presets',
  ];

  // At least one valid key should be present
  const hasValidKey = Object.keys(config).some(key => validProjectKeys.includes(key));
  if (!hasValidKey) {
    return {
      valid: false,
      error: `No valid project config keys found. Expected one of: ${validProjectKeys.join(', ')}`,
    };
  }

  // Validate specific fields if present
  if (config.routing !== undefined && !Array.isArray(config.routing)) {
    return { valid: false, error: 'routing must be an array' };
  }

  if (config.workspaces !== undefined && typeof config.workspaces !== 'object') {
    return { valid: false, error: 'workspaces must be an object' };
  }

  if (config.presets !== undefined && typeof config.presets !== 'object') {
    return { valid: false, error: 'presets must be an object' };
  }

  return { valid: true };
}

function deepMergeConfig<T extends object>(target: T, source: Partial<T>): T {
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
        result[key] = deepMergeConfig(
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

// Helpers
function boolStr(value: boolean): string {
  return value ? chalk.green('yes') : chalk.gray('no');
}

function padRight(str: string, length: number): string {
  return str.padEnd(length);
}
