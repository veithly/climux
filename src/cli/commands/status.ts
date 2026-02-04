/**
 * Status Command
 * Show real-time status of active sessions
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { getProcessManager } from '../../core/ProcessManager.js';
import * as SessionStore from '../../core/SessionStore.js';
import { getCurrentWorkspace } from '../../core/Workspace.js';

export function registerStatusCommand(program: Command): void {
  program
    .command('status')
    .description('Show status of active sessions')
    .option('-a, --all', 'Show all recent sessions, not just active ones')
    .option('-w, --workspace <path>', 'Filter by workspace')
    .action(async (options) => {
      await showStatus(options);
    });
}

async function showStatus(options: { all?: boolean; workspace?: string }): Promise<void> {
  const processManager = getProcessManager();
  const activeSessions = processManager.getActiveSessions();
  const workspace = getCurrentWorkspace();

  console.log();
  console.log(chalk.bold('BotCLI Status'));
  console.log(chalk.gray('═'.repeat(70)));
  console.log();

  // Show workspace info
  console.log(`${chalk.bold('Workspace:')} ${workspace.path}`);
  console.log(`${chalk.bold('Active Sessions:')} ${activeSessions.length}`);
  console.log();

  if (activeSessions.length > 0) {
    // Show active sessions
    console.log(chalk.bold('Running Sessions'));
    console.log(chalk.gray('-'.repeat(70)));
    console.log(
      chalk.bold(
        padRight('ID', 12) +
        padRight('Provider', 14) +
        padRight('Status', 10) +
        padRight('Duration', 12) +
        'Task'
      )
    );
    console.log(chalk.gray('-'.repeat(70)));

    for (const sessionId of activeSessions) {
      const session = SessionStore.getSession(sessionId);
      if (!session) continue;

      // Filter by workspace if specified
      if (options.workspace && session.workspacePath !== options.workspace) {
        continue;
      }

      const duration = formatDuration(
        Math.floor((Date.now() - session.createdAt.getTime()) / 1000)
      );
      const taskPreview = session.task?.substring(0, 30) || '-';

      console.log(
        chalk.cyan(padRight(session.id.substring(0, 10), 12)) +
        padRight(session.provider, 14) +
        chalk.blue(padRight('running', 10)) +
        chalk.yellow(padRight(duration, 12)) +
        taskPreview
      );
    }
  } else {
    console.log(chalk.gray('No active sessions'));
  }

  if (options.all) {
    console.log();

    // Show recent sessions
    const recentSessions = SessionStore.listSessions({
      workspacePath: options.workspace,
      limit: 10,
    });

    // Filter out currently active ones
    const completedSessions = recentSessions.filter(
      (s) => !activeSessions.includes(s.id)
    );

    if (completedSessions.length > 0) {
      console.log(chalk.bold('Recent Sessions'));
      console.log(chalk.gray('-'.repeat(70)));
      console.log(
        chalk.bold(
          padRight('ID', 12) +
          padRight('Provider', 14) +
          padRight('Status', 12) +
          padRight('When', 16) +
          'Task'
        )
      );
      console.log(chalk.gray('-'.repeat(70)));

      for (const session of completedSessions) {
        const statusColor = getStatusColor(session.status);
        const when = formatTimeAgo(session.updatedAt);
        const taskPreview = session.task?.substring(0, 25) || '-';

        console.log(
          chalk.cyan(padRight(session.id.substring(0, 10), 12)) +
          padRight(session.provider, 14) +
          statusColor(padRight(session.status, 12)) +
          chalk.gray(padRight(when, 16)) +
          taskPreview
        );
      }
    }
  }

  console.log();
}

// Helper functions
function padRight(str: string, length: number): string {
  return str.padEnd(length);
}

function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  if (hours > 0) {
    return `${hours}h ${mins}m ${secs}s`;
  } else if (mins > 0) {
    return `${mins}m ${secs}s`;
  }
  return `${secs}s`;
}

function formatTimeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);

  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} hours ago`;
  return `${Math.floor(seconds / 86400)} days ago`;
}

function getStatusColor(status: string): (text: string) => string {
  switch (status) {
    case 'running':
      return chalk.blue;
    case 'completed':
      return chalk.green;
    case 'failed':
    case 'crashed':
      return chalk.red;
    case 'paused':
      return chalk.yellow;
    case 'timeout':
      return chalk.magenta;
    default:
      return chalk.gray;
  }
}
