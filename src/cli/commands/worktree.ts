/**
 * Worktree Command
 * Manage git worktrees for parallel development
 */

import { Command } from 'commander';
import chalk from 'chalk';
import {
  getCurrentWorkspace,
  createWorktree,
  removeWorktree,
  listWorktrees,
  setCurrentWorkspace,
} from '../../core/Workspace.js';

export function registerWorktreeCommand(program: Command): void {
  const worktree = program
    .command('worktree')
    .description('Manage git worktrees');

  // List worktrees
  worktree
    .command('list')
    .description('List git worktrees')
    .action(async () => {
      await listWorktreesCommand();
    });

  // Create worktree
  worktree
    .command('create')
    .description('Create a new git worktree')
    .argument('<name>', 'Worktree name (also used as directory name)')
    .option('-b, --branch <branch>', 'Branch name (defaults to worktree name)')
    .action(async (name: string, options) => {
      await createWorktreeCommand(name, options);
    });

  // Switch to worktree
  worktree
    .command('switch')
    .description('Switch to a worktree')
    .argument('<name>', 'Worktree name')
    .action(async (name: string) => {
      await switchWorktreeCommand(name);
    });

  // Remove worktree
  worktree
    .command('delete')
    .description('Remove a git worktree')
    .argument('<name>', 'Worktree name')
    .option('-f, --force', 'Force removal')
    .action(async (name: string, options) => {
      await removeWorktreeCommand(name, options);
    });
}

async function listWorktreesCommand(): Promise<void> {
  const workspace = getCurrentWorkspace();

  if (!workspace.gitRoot) {
    console.error(chalk.red('Current workspace is not a git repository'));
    return;
  }

  const worktrees = listWorktrees(workspace);

  if (worktrees.length === 0) {
    console.log(chalk.gray('No worktrees found'));
    return;
  }

  console.log(chalk.bold('Git Worktrees'));
  console.log(chalk.gray('-'.repeat(60)));

  for (const wt of worktrees) {
    const isMain = wt === workspace.gitRoot;
    const isCurrent = wt === workspace.path;

    let prefix = '  ';
    if (isCurrent) {
      prefix = chalk.green('* ');
    } else if (isMain) {
      prefix = chalk.blue('M ');
    }

    // Extract name from path
    const name = wt.split(/[/\\]/).pop() || wt;

    console.log(`${prefix}${chalk.cyan(name.padEnd(20))} ${chalk.gray(wt)}`);
  }

  console.log();
  console.log(chalk.gray('* = current, M = main'));
}

async function createWorktreeCommand(
  name: string,
  options: { branch?: string }
): Promise<void> {
  const workspace = getCurrentWorkspace();

  if (!workspace.gitRoot) {
    console.error(chalk.red('Current workspace is not a git repository'));
    return;
  }

  console.log(chalk.blue(`Creating worktree '${name}'...`));

  try {
    const worktreePath = await createWorktree(name, options.branch, workspace);
    console.log(chalk.green(`Created worktree at: ${worktreePath}`));
    console.log();
    console.log(chalk.gray(`Switch to it with: climux worktree switch ${name}`));
    console.log(chalk.gray(`Or use it directly: climux run "task" --worktree ${name}`));
  } catch (error) {
    console.error(chalk.red(error instanceof Error ? error.message : 'Failed to create worktree'));
  }
}

async function switchWorktreeCommand(name: string): Promise<void> {
  const workspace = getCurrentWorkspace();

  if (!workspace.gitRoot) {
    console.error(chalk.red('Current workspace is not a git repository'));
    return;
  }

  const worktrees = listWorktrees(workspace);

  // Find worktree by name
  const targetWorktree = worktrees.find((wt) => {
    const wtName = wt.split(/[/\\]/).pop();
    return wtName === name;
  });

  if (!targetWorktree) {
    console.error(chalk.red(`Worktree '${name}' not found`));
    console.log();
    console.log(chalk.gray('Available worktrees:'));
    for (const wt of worktrees) {
      const wtName = wt.split(/[/\\]/).pop();
      console.log(chalk.gray(`  - ${wtName}`));
    }
    return;
  }

  try {
    setCurrentWorkspace(targetWorktree);
    console.log(chalk.green(`Switched to worktree: ${targetWorktree}`));
  } catch (error) {
    console.error(chalk.red(error instanceof Error ? error.message : 'Failed to switch worktree'));
  }
}

async function removeWorktreeCommand(
  name: string,
  _options: { force?: boolean }
): Promise<void> {
  const workspace = getCurrentWorkspace();

  if (!workspace.gitRoot) {
    console.error(chalk.red('Current workspace is not a git repository'));
    return;
  }

  // Don't allow removing the current worktree
  const currentName = workspace.path.split(/[/\\]/).pop();
  if (currentName === name) {
    console.error(chalk.red('Cannot remove the current worktree'));
    console.log(chalk.gray('Switch to a different worktree first'));
    return;
  }

  console.log(chalk.blue(`Removing worktree '${name}'...`));

  try {
    await removeWorktree(name, workspace);
    console.log(chalk.green(`Removed worktree '${name}'`));
  } catch (error) {
    console.error(chalk.red(error instanceof Error ? error.message : 'Failed to remove worktree'));
  }
}
