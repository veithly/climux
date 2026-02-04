/**
 * Workspace Command
 * Manage workspaces and aliases
 */

import { Command } from 'commander';
import chalk from 'chalk';
import {
  getCurrentWorkspace,
  setCurrentWorkspace,
  saveAlias,
  getAlias,
  listAliases,
  removeAlias,
  resolveWorkspacePath,
} from '../../core/Workspace.js';

export function registerWorkspaceCommand(program: Command): void {
  const workspace = program
    .command('workspace')
    .description('Manage workspaces');

  // Show current workspace info
  workspace
    .command('info')
    .description('Show current workspace information')
    .action(async () => {
      await showWorkspaceInfo();
    });

  // Switch workspace
  workspace
    .command('switch')
    .description('Switch to a different workspace')
    .argument('<path>', 'Workspace path or @alias')
    .action(async (path: string) => {
      await switchWorkspace(path);
    });

  // List workspaces/aliases
  workspace
    .command('list')
    .description('List workspace aliases')
    .action(async () => {
      await listWorkspaces();
    });

  // Create alias
  workspace
    .command('alias')
    .description('Create a workspace alias')
    .argument('<name>', 'Alias name')
    .argument('<path>', 'Workspace path')
    .action(async (name: string, path: string) => {
      await createAlias(name, path);
    });

  // Remove alias
  workspace
    .command('unalias')
    .description('Remove a workspace alias')
    .argument('<name>', 'Alias name')
    .action(async (name: string) => {
      await deleteAlias(name);
    });
}

async function showWorkspaceInfo(): Promise<void> {
  const workspace = getCurrentWorkspace();

  console.log(chalk.bold('Current Workspace'));
  console.log(chalk.gray('-'.repeat(40)));
  console.log(`Name:        ${chalk.cyan(workspace.name)}`);
  console.log(`Path:        ${workspace.path}`);

  if (workspace.gitRoot) {
    console.log(`Git Root:    ${workspace.gitRoot}`);
  } else {
    console.log(`Git Root:    ${chalk.gray('(not a git repository)')}`);
  }

  if (workspace.worktrees.length > 0) {
    console.log();
    console.log(chalk.bold('Git Worktrees:'));
    for (const wt of workspace.worktrees) {
      const isMain = wt === workspace.gitRoot;
      console.log(`  ${isMain ? chalk.green('*') : ' '} ${wt}`);
    }
  }

  if (workspace.defaultProvider) {
    console.log();
    console.log(`Default Provider: ${workspace.defaultProvider}`);
  }
}

async function switchWorkspace(pathOrAlias: string): Promise<void> {
  try {
    const resolvedPath = resolveWorkspacePath(pathOrAlias);
    const workspace = setCurrentWorkspace(resolvedPath);
    console.log(chalk.green(`Switched to workspace: ${workspace.path}`));
  } catch (error) {
    console.error(chalk.red(error instanceof Error ? error.message : 'Failed to switch workspace'));
  }
}

async function listWorkspaces(): Promise<void> {
  const aliases = listAliases();

  if (aliases.length === 0) {
    console.log(chalk.gray('No workspace aliases defined'));
    console.log();
    console.log(chalk.gray('Create one with: climux workspace alias <name> <path>'));
    return;
  }

  console.log(chalk.bold('Workspace Aliases'));
  console.log(chalk.gray('-'.repeat(60)));

  for (const alias of aliases) {
    console.log(`${chalk.cyan('@' + alias.name).padEnd(20)} ${alias.path}`);
  }
}

async function createAlias(name: string, path: string): Promise<void> {
  // Don't allow @ prefix in name
  if (name.startsWith('@')) {
    name = name.substring(1);
  }

  try {
    saveAlias(name, path);
    console.log(chalk.green(`Created alias @${name} -> ${path}`));
  } catch (error) {
    console.error(chalk.red(error instanceof Error ? error.message : 'Failed to create alias'));
  }
}

async function deleteAlias(name: string): Promise<void> {
  // Remove @ prefix if present
  if (name.startsWith('@')) {
    name = name.substring(1);
  }

  const existing = getAlias(name);
  if (!existing) {
    console.error(chalk.red(`Alias @${name} not found`));
    return;
  }

  removeAlias(name);
  console.log(chalk.green(`Removed alias @${name}`));
}
