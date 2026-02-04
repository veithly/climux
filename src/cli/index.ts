#!/usr/bin/env node

/**
 * Climux - CLI multiplexer for AI agents to leverage professional coding CLI tools
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { initDb, closeDb } from '../utils/db.js';
import { loadConfig } from '../utils/config.js';
import { initRouter } from '../core/Router.js';
import { getCurrentWorkspace } from '../core/Workspace.js';

// Import commands
import { registerRunCommand } from './commands/run.js';
import { registerSessionCommand } from './commands/session.js';
import { registerWorkspaceCommand } from './commands/workspace.js';
import { registerWorktreeCommand } from './commands/worktree.js';
import { registerConfigCommand } from './commands/config.js';
import { registerStatusCommand } from './commands/status.js';
import { registerStatsCommand } from './commands/stats.js';
import { registerMcpCommand } from './commands/mcp.js';

const program = new Command();

program
  .name('climux')
  .description('CLI multiplexer for AI agents to leverage professional coding CLI tools')
  .version('0.1.0');

/**
 * Initialize the application
 */
async function init(): Promise<void> {
  // Initialize database
  await initDb();

  // Load configuration
  const workspace = getCurrentWorkspace();
  const config = loadConfig(workspace.path);

  // Initialize router
  initRouter(config);
}

/**
 * Cleanup on exit
 */
function cleanup(): void {
  closeDb();
}

// Register commands
registerRunCommand(program);
registerSessionCommand(program);
registerWorkspaceCommand(program);
registerWorktreeCommand(program);
registerConfigCommand(program);
registerStatusCommand(program);
registerStatsCommand(program);
registerMcpCommand(program);

// Global error handler
program.exitOverride((err) => {
  if (err.code === 'commander.help') {
    process.exit(0);
  }
  throw err;
});

// Parse and execute
async function main(): Promise<void> {
  try {
    await init();
    await program.parseAsync(process.argv);
  } catch (error) {
    if (error instanceof Error) {
      console.error(chalk.red(`Error: ${error.message}`));
      if (process.env['DEBUG']) {
        console.error(error.stack);
      }
    } else {
      console.error(chalk.red('An unknown error occurred'));
    }
    process.exit(1);
  } finally {
    cleanup();
  }
}

main();
