/**
 * Run Command
 * Execute coding tasks with AI CLI tools
 */

import { Command } from 'commander';
import chalk from 'chalk';
import type { RunMode, RunOptions, Workspace } from '../../types/index.js';
import { getRouter } from '../../core/Router.js';
import {
  getCurrentWorkspace,
  setCurrentWorkspace,
  resolveWorkspacePath,
} from '../../core/Workspace.js';
import { loadConfig } from '../../utils/config.js';

interface RunCommandOptions {
  provider?: string;
  mode?: RunMode;
  workspace?: string;
  worktree?: string;
  timeout?: string;
  background?: boolean;
  preset?: string;
  json?: boolean;
}

export function registerRunCommand(program: Command): void {
  program
    .command('run')
    .description('Execute a coding task')
    .argument('<task>', 'The task description')
    .option('-p, --provider <name>', 'Specify the CLI provider to use')
    .option('-m, --mode <mode>', 'Execution mode: task (autonomous) or chat (interactive)', 'task')
    .option('-w, --workspace <path>', 'Workspace path (default: current directory)')
    .option('--worktree <name>', 'Git worktree to use')
    .option('-t, --timeout <ms>', 'Timeout in milliseconds')
    .option('-b, --background', 'Run in background')
    .option('--preset <name>', 'Use a preset configuration')
    .option('--json', 'Output result as JSON')
    .action(async (task: string, options: RunCommandOptions) => {
      await runTask(task, options);
    });
}

async function runTask(task: string, options: RunCommandOptions): Promise<void> {
  const router = getRouter();

  // Resolve workspace
  let workspace: Workspace;
  if (options.workspace) {
    const resolvedPath = resolveWorkspacePath(options.workspace);
    workspace = setCurrentWorkspace(resolvedPath);
  } else {
    workspace = getCurrentWorkspace();
  }

  // Load config for potential preset
  const config = loadConfig(workspace.path);

  // Apply preset if specified
  let mode: RunMode = (options.mode as RunMode) || 'task';
  let provider = options.provider;

  if (options.preset && config.project?.presets?.[options.preset]) {
    const preset = config.project.presets[options.preset];
    mode = preset.mode || mode;
    provider = preset.provider || provider;
  }

  // Build run options
  const runOptions: RunOptions = {
    mode,
    workspace,
    worktree: options.worktree,
    timeout: options.timeout ? parseInt(options.timeout, 10) : undefined,
    background: options.background,
    provider,
  };

  if (!options.json) {
    console.log(chalk.blue('Starting task...'));
    console.log(chalk.gray(`Workspace: ${workspace.path}`));
    if (provider) {
      console.log(chalk.gray(`Provider: ${provider}`));
    }
    console.log(chalk.gray(`Mode: ${mode}`));
    console.log();
  }

  try {
    const result = await router.run(task, runOptions);

    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      if (result.status === 'running') {
        console.log(chalk.green(`Session started: ${result.sessionId}`));
        console.log(chalk.gray('Use `climux session resume <id>` to continue'));
      } else if (result.status === 'completed') {
        console.log(chalk.green('Task completed successfully!'));
        console.log();

        // Show stats
        if (result.stats) {
          console.log(chalk.bold('Statistics:'));
          console.log(`  Tokens: ${result.stats.tokensIn} in / ${result.stats.tokensOut} out`);
          if (result.stats.costEstimate > 0) {
            console.log(`  Cost: $${result.stats.costEstimate.toFixed(4)}`);
          }
          if (result.stats.filesChanged > 0) {
            console.log(`  Files changed: ${result.stats.filesChanged}`);
            console.log(`  Lines: +${result.stats.linesAdded} / -${result.stats.linesRemoved}`);
          }
          if (result.stats.durationSeconds > 0) {
            const mins = Math.floor(result.stats.durationSeconds / 60);
            const secs = result.stats.durationSeconds % 60;
            console.log(`  Duration: ${mins}m ${secs}s`);
          }
        }

        if (result.summary) {
          console.log();
          console.log(chalk.bold('Summary:'));
          console.log(result.summary);
        }
      } else {
        console.log(chalk.red(`Task ${result.status}`));
      }

      console.log();
      console.log(chalk.gray(`Session ID: ${result.sessionId}`));
    }
  } catch (error) {
    if (options.json) {
      console.log(JSON.stringify({
        error: true,
        message: error instanceof Error ? error.message : 'Unknown error',
      }));
    } else {
      throw error;
    }
  }
}
