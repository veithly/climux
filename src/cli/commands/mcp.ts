/**
 * MCP Command
 * Manage MCP servers and skills across providers
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { dirname, basename } from 'path';
import { startMcpServer } from '../../mcp/server.js';
import { getProvider, getProviderNames } from '../../providers/index.js';
import { loadConfig } from '../../utils/config.js';
import { getCurrentWorkspace } from '../../core/Workspace.js';

/**
 * MCP configuration structure (varies by provider but follows common patterns)
 */
interface McpConfig {
  mcpServers?: Record<string, McpServerEntry>;
  servers?: Record<string, McpServerEntry>;
}

interface McpServerEntry {
  command: string;
  args?: string[];
  env?: Record<string, string>;
  disabled?: boolean;
}

/**
 * Skill configuration structure
 */
interface SkillConfig {
  skills?: Record<string, SkillEntry>;
}

interface SkillEntry {
  name: string;
  path?: string;
  enabled?: boolean;
}

/**
 * Provider MCP info
 */
interface ProviderMcpInfo {
  provider: string;
  configPath: string;
  exists: boolean;
  mcps: McpEntry[];
  skills: SkillEntry[];
}

interface McpEntry {
  name: string;
  command: string;
  args?: string[];
  disabled?: boolean;
}

export function registerMcpCommand(program: Command): void {
  // MCP command group
  const mcp = program
    .command('mcp')
    .description('Manage MCP servers');

  // Start MCP server
  mcp
    .command('serve')
    .description('Start BotCLI as an MCP server')
    .action(async () => {
      await serveCommand();
    });

  // List MCPs
  mcp
    .command('list')
    .description('List installed MCPs across providers')
    .option('-p, --provider <name>', 'Filter by provider')
    .action(async (options) => {
      await listMcpsCommand(options);
    });

  // Install MCP
  mcp
    .command('install')
    .description('Install an MCP package')
    .argument('<package>', 'MCP package to install (e.g., @anthropic/mcp-server-filesystem)')
    .option('-p, --provider <name>', 'Install for specific provider')
    .option('-n, --name <name>', 'Custom name for the MCP server')
    .option('-a, --args <args>', 'Additional arguments (comma-separated)')
    .action(async (pkg: string, options) => {
      await installMcpCommand(pkg, options);
    });

  // Uninstall MCP
  mcp
    .command('uninstall')
    .description('Uninstall an MCP package')
    .argument('<name>', 'MCP server name to uninstall')
    .option('-p, --provider <name>', 'Uninstall from specific provider')
    .action(async (name: string, options) => {
      await uninstallMcpCommand(name, options);
    });

  // Skill command group
  const skill = program
    .command('skill')
    .description('Manage skills');

  // List skills
  skill
    .command('list')
    .description('List skills across providers')
    .option('-p, --provider <name>', 'Filter by provider')
    .action(async (options) => {
      await listSkillsCommand(options);
    });

  // Install skill
  skill
    .command('install')
    .description('Install a skill')
    .argument('<skill>', 'Skill to install')
    .option('-p, --provider <name>', 'Install for specific provider')
    .action(async (skillName: string, options) => {
      await installSkillCommand(skillName, options);
    });

  // Sync skills/MCPs
  skill
    .command('sync')
    .description('Sync skills and MCPs across providers')
    .option('-s, --source <provider>', 'Source provider to sync from')
    .option('-t, --target <provider>', 'Target provider to sync to')
    .option('--mcps-only', 'Only sync MCP configurations')
    .option('--skills-only', 'Only sync skills')
    .action(async (options) => {
      await syncCommand(options);
    });
}

/**
 * Start MCP server command
 */
async function serveCommand(): Promise<void> {
  console.log(chalk.blue('Starting BotCLI MCP server...'));
  console.log(chalk.gray('Press Ctrl+C to stop'));
  console.log();

  try {
    await startMcpServer();
  } catch (error) {
    console.error(chalk.red(`Failed to start MCP server: ${error instanceof Error ? error.message : 'Unknown error'}`));
    process.exit(1);
  }
}

/**
 * List MCPs across providers
 */
async function listMcpsCommand(options: { provider?: string }): Promise<void> {
  const providerInfos = await getProviderMcpInfos(options.provider);

  if (providerInfos.length === 0) {
    console.log(chalk.gray('No providers found'));
    return;
  }

  for (const info of providerInfos) {
    console.log(chalk.bold(`\n${info.provider}`));
    console.log(chalk.gray(`Config: ${info.configPath}`));
    console.log(chalk.gray(`Status: ${info.exists ? chalk.green('exists') : chalk.yellow('not found')}`));

    if (!info.exists) {
      continue;
    }

    if (info.mcps.length === 0) {
      console.log(chalk.gray('  No MCPs installed'));
    } else {
      console.log(chalk.gray('-'.repeat(50)));
      console.log(chalk.bold(padRight('  Name', 25) + padRight('Command', 30) + 'Status'));
      console.log(chalk.gray('-'.repeat(50)));

      for (const mcp of info.mcps) {
        const status = mcp.disabled ? chalk.yellow('disabled') : chalk.green('enabled');
        const command = mcp.command + (mcp.args ? ` ${mcp.args.join(' ')}` : '');
        console.log(
          chalk.cyan(padRight(`  ${mcp.name}`, 25)) +
          chalk.gray(padRight(truncate(command, 28), 30)) +
          status
        );
      }
    }
  }
  console.log();
}

/**
 * Install MCP command
 */
async function installMcpCommand(
  pkg: string,
  options: { provider?: string; name?: string; args?: string }
): Promise<void> {
  const targetProviders = options.provider
    ? [options.provider]
    : getProviderNames().filter((name) => {
        const provider = getProvider(name);
        return provider?.capabilities.mcp;
      });

  if (targetProviders.length === 0) {
    console.error(chalk.red('No providers with MCP support found'));
    return;
  }

  // Determine MCP name and command
  const mcpName = options.name || basename(pkg).replace(/^@[^/]+\//, '').replace(/^mcp-server-/, '');
  const mcpCommand = pkg.startsWith('@') || pkg.includes('/') ? 'npx' : pkg;
  const mcpArgs = mcpCommand === 'npx' ? ['-y', pkg] : [];

  if (options.args) {
    mcpArgs.push(...options.args.split(',').map((a) => a.trim()));
  }

  console.log(chalk.blue(`Installing MCP: ${mcpName}`));
  console.log(chalk.gray(`Command: ${mcpCommand} ${mcpArgs.join(' ')}`));
  console.log();

  let successCount = 0;

  for (const providerName of targetProviders) {
    const provider = getProvider(providerName);
    if (!provider) continue;

    const configPath = provider.getMcpConfigPath();
    if (!configPath) {
      console.log(chalk.yellow(`  ${providerName}: No MCP config path`));
      continue;
    }

    try {
      const config = readMcpConfig(configPath);
      const servers = config.mcpServers || config.servers || {};

      if (servers[mcpName]) {
        console.log(chalk.yellow(`  ${providerName}: ${mcpName} already exists (skipped)`));
        continue;
      }

      servers[mcpName] = {
        command: mcpCommand,
        args: mcpArgs.length > 0 ? mcpArgs : undefined,
      };

      // Write back using the original key format
      if (config.mcpServers) {
        config.mcpServers = servers;
      } else {
        config.servers = servers;
      }

      writeMcpConfig(configPath, config);
      console.log(chalk.green(`  ${providerName}: Installed successfully`));
      successCount++;
    } catch (error) {
      console.log(chalk.red(`  ${providerName}: ${error instanceof Error ? error.message : 'Failed'}`));
    }
  }

  console.log();
  if (successCount > 0) {
    console.log(chalk.green(`Installed ${mcpName} to ${successCount} provider(s)`));
  } else {
    console.log(chalk.yellow('No installations were made'));
  }
}

/**
 * Uninstall MCP command
 */
async function uninstallMcpCommand(
  name: string,
  options: { provider?: string }
): Promise<void> {
  const targetProviders = options.provider
    ? [options.provider]
    : getProviderNames().filter((providerName) => {
        const provider = getProvider(providerName);
        return provider?.capabilities.mcp;
      });

  console.log(chalk.blue(`Uninstalling MCP: ${name}`));
  console.log();

  let successCount = 0;

  for (const providerName of targetProviders) {
    const provider = getProvider(providerName);
    if (!provider) continue;

    const configPath = provider.getMcpConfigPath();
    if (!configPath || !existsSync(configPath)) {
      continue;
    }

    try {
      const config = readMcpConfig(configPath);
      const servers = config.mcpServers || config.servers || {};

      if (!servers[name]) {
        continue;
      }

      delete servers[name];

      // Write back
      if (config.mcpServers) {
        config.mcpServers = servers;
      } else {
        config.servers = servers;
      }

      writeMcpConfig(configPath, config);
      console.log(chalk.green(`  ${providerName}: Uninstalled successfully`));
      successCount++;
    } catch (error) {
      console.log(chalk.red(`  ${providerName}: ${error instanceof Error ? error.message : 'Failed'}`));
    }
  }

  console.log();
  if (successCount > 0) {
    console.log(chalk.green(`Uninstalled ${name} from ${successCount} provider(s)`));
  } else {
    console.log(chalk.yellow(`${name} was not found in any provider`));
  }
}

/**
 * List skills across providers
 */
async function listSkillsCommand(options: { provider?: string }): Promise<void> {
  const providerInfos = await getProviderMcpInfos(options.provider);

  if (providerInfos.length === 0) {
    console.log(chalk.gray('No providers found'));
    return;
  }

  let hasSkills = false;

  for (const info of providerInfos) {
    const provider = getProvider(info.provider);
    if (!provider?.capabilities.skills) {
      continue;
    }

    console.log(chalk.bold(`\n${info.provider}`));

    if (info.skills.length === 0) {
      console.log(chalk.gray('  No skills installed'));
    } else {
      hasSkills = true;
      console.log(chalk.gray('-'.repeat(40)));
      console.log(chalk.bold(padRight('  Name', 25) + 'Status'));
      console.log(chalk.gray('-'.repeat(40)));

      for (const skill of info.skills) {
        const status = skill.enabled === false ? chalk.yellow('disabled') : chalk.green('enabled');
        console.log(chalk.cyan(padRight(`  ${skill.name}`, 25)) + status);
      }
    }
  }

  if (!hasSkills) {
    console.log(chalk.gray('\nNo skills found across providers'));
    console.log(chalk.gray('Note: Only claude-code currently supports skills'));
  }
  console.log();
}

/**
 * Install skill command
 */
async function installSkillCommand(
  skillName: string,
  options: { provider?: string }
): Promise<void> {
  const targetProviders = options.provider
    ? [options.provider]
    : getProviderNames().filter((name) => {
        const provider = getProvider(name);
        return provider?.capabilities.skills;
      });

  if (targetProviders.length === 0) {
    console.error(chalk.red('No providers with skills support found'));
    console.log(chalk.gray('Note: Only claude-code currently supports skills'));
    return;
  }

  console.log(chalk.blue(`Installing skill: ${skillName}`));
  console.log();

  // For Claude Code, skills are typically managed differently
  // This is a placeholder for future implementation
  for (const providerName of targetProviders) {
    console.log(chalk.yellow(`  ${providerName}: Skill installation not yet implemented`));
    console.log(chalk.gray(`  Skills for ${providerName} are typically managed through the CLI directly`));
    console.log(chalk.gray(`  Try: ${providerName === 'claude-code' ? 'claude skill install ' + skillName : providerName + ' skill install ' + skillName}`));
  }
  console.log();
}

/**
 * Sync MCPs and skills across providers
 */
async function syncCommand(options: {
  source?: string;
  target?: string;
  mcpsOnly?: boolean;
  skillsOnly?: boolean;
}): Promise<void> {
  const allProviders = getProviderNames().filter((name) => {
    const provider = getProvider(name);
    return provider?.capabilities.mcp;
  });

  if (allProviders.length < 2) {
    console.error(chalk.red('Need at least 2 providers with MCP support for sync'));
    return;
  }

  const sourceProvider = options.source || allProviders[0];
  const targetProviders = options.target
    ? [options.target]
    : allProviders.filter((p) => p !== sourceProvider);

  console.log(chalk.blue(`Syncing from ${sourceProvider} to: ${targetProviders.join(', ')}`));
  console.log();

  // Get source MCPs
  const sourceInfos = await getProviderMcpInfos(sourceProvider);
  const sourceInfo = sourceInfos[0];

  if (!sourceInfo || !sourceInfo.exists) {
    console.error(chalk.red(`Source provider ${sourceProvider} has no MCP config`));
    return;
  }

  if (!options.skillsOnly && sourceInfo.mcps.length > 0) {
    console.log(chalk.bold('Syncing MCPs:'));

    for (const targetName of targetProviders) {
      const provider = getProvider(targetName);
      if (!provider) continue;

      const configPath = provider.getMcpConfigPath();
      if (!configPath) {
        console.log(chalk.yellow(`  ${targetName}: No MCP config path`));
        continue;
      }

      try {
        const config = readMcpConfig(configPath);
        const servers = config.mcpServers || config.servers || {};
        let addedCount = 0;

        for (const mcp of sourceInfo.mcps) {
          if (!servers[mcp.name]) {
            servers[mcp.name] = {
              command: mcp.command,
              args: mcp.args,
              disabled: mcp.disabled,
            };
            addedCount++;
          }
        }

        if (addedCount > 0) {
          if (config.mcpServers) {
            config.mcpServers = servers;
          } else {
            config.servers = servers;
          }
          writeMcpConfig(configPath, config);
          console.log(chalk.green(`  ${targetName}: Added ${addedCount} MCP(s)`));
        } else {
          console.log(chalk.gray(`  ${targetName}: Already up to date`));
        }
      } catch (error) {
        console.log(chalk.red(`  ${targetName}: ${error instanceof Error ? error.message : 'Failed'}`));
      }
    }
  }

  if (!options.mcpsOnly) {
    console.log(chalk.gray('\nSkill sync not yet implemented'));
  }

  console.log();
  console.log(chalk.green('Sync complete'));
}

/**
 * Get MCP info for all or specific providers
 */
async function getProviderMcpInfos(filterProvider?: string): Promise<ProviderMcpInfo[]> {
  const providerNames = filterProvider ? [filterProvider] : getProviderNames();
  const workspace = getCurrentWorkspace();
  const config = loadConfig(workspace.path);
  const infos: ProviderMcpInfo[] = [];

  for (const name of providerNames) {
    const provider = getProvider(name, config.providers[name]);
    if (!provider) continue;

    const configPath = provider.getMcpConfigPath();
    if (!configPath) {
      infos.push({
        provider: name,
        configPath: 'N/A',
        exists: false,
        mcps: [],
        skills: [],
      });
      continue;
    }

    const exists = existsSync(configPath);
    let mcps: McpEntry[] = [];
    let skills: SkillEntry[] = [];

    if (exists) {
      try {
        const mcpConfig = readMcpConfig(configPath);
        const servers = mcpConfig.mcpServers || mcpConfig.servers || {};

        mcps = Object.entries(servers).map(([name, entry]) => ({
          name,
          command: entry.command,
          args: entry.args,
          disabled: entry.disabled,
        }));

        // Try to read skills if provider supports them
        if (provider.capabilities.skills) {
          const skillConfig = readSkillConfig(configPath);
          if (skillConfig.skills) {
            skills = Object.entries(skillConfig.skills).map(([name, entry]) => ({
              name,
              path: entry.path,
              enabled: entry.enabled,
            }));
          }
        }
      } catch {
        // Config exists but couldn't be parsed
      }
    }

    infos.push({
      provider: name,
      configPath,
      exists,
      mcps,
      skills,
    });
  }

  return infos;
}

/**
 * Read MCP configuration file
 */
function readMcpConfig(configPath: string): McpConfig {
  if (!existsSync(configPath)) {
    return {};
  }

  const content = readFileSync(configPath, 'utf-8');
  return JSON.parse(content) as McpConfig;
}

/**
 * Write MCP configuration file
 */
function writeMcpConfig(configPath: string, config: McpConfig): void {
  const dir = dirname(configPath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n', 'utf-8');
}

/**
 * Read skill configuration (may be in same file as MCP config)
 */
function readSkillConfig(configPath: string): SkillConfig {
  if (!existsSync(configPath)) {
    return {};
  }

  try {
    const content = readFileSync(configPath, 'utf-8');
    return JSON.parse(content) as SkillConfig;
  } catch {
    return {};
  }
}

// Helper functions
function padRight(str: string, length: number): string {
  return str.padEnd(length);
}

function truncate(str: string, length: number): string {
  if (str.length <= length) return str;
  return str.substring(0, length - 3) + '...';
}
