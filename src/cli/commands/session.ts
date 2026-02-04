/**
 * Session Command
 * Manage coding sessions
 */

import { Command } from 'commander';
import chalk from 'chalk';
import type { SessionStatus } from '../../types/index.js';
import * as SessionStore from '../../core/SessionStore.js';
import { getRouter } from '../../core/Router.js';

export function registerSessionCommand(program: Command): void {
  const session = program
    .command('session')
    .description('Manage coding sessions');

  // List sessions
  session
    .command('list')
    .description('List sessions')
    .option('-s, --status <status>', 'Filter by status')
    .option('-w, --workspace <path>', 'Filter by workspace')
    .option('-p, --provider <name>', 'Filter by provider')
    .option('-n, --limit <number>', 'Limit results', '20')
    .action(async (options) => {
      await listSessions(options);
    });

  // Resume session
  session
    .command('resume')
    .description('Resume a paused session')
    .argument('<id>', 'Session ID')
    .action(async (id: string) => {
      await resumeSession(id);
    });

  // Show session details
  session
    .command('show')
    .description('Show session details')
    .argument('<id>', 'Session ID')
    .option('--stats', 'Show statistics')
    .action(async (id: string, options) => {
      await showSession(id, options);
    });

  // Show session logs
  session
    .command('log')
    .description('Show session conversation log')
    .argument('<id>', 'Session ID')
    .option('-f, --format <format>', 'Output format: text, markdown, json', 'text')
    .action(async (id: string, options) => {
      await showSessionLog(id, options);
    });

  // Export session
  session
    .command('export')
    .description('Export session data')
    .argument('<id>', 'Session ID')
    .option('-f, --format <format>', 'Output format: markdown, json', 'markdown')
    .action(async (id: string, options) => {
      await exportSession(id, options);
    });

  // Delete session
  session
    .command('delete')
    .description('Delete a session')
    .argument('[id]', 'Session ID (optional if using --status)')
    .option('-s, --status <status>', 'Delete all sessions with this status')
    .option('--older-than <days>', 'Delete sessions older than N days')
    .option('-y, --yes', 'Skip confirmation')
    .action(async (id: string | undefined, options) => {
      await deleteSession(id, options);
    });
}

async function listSessions(options: {
  status?: string;
  workspace?: string;
  provider?: string;
  limit?: string;
}): Promise<void> {
  const sessions = SessionStore.listSessions({
    status: options.status as SessionStatus,
    workspacePath: options.workspace || undefined,
    provider: options.provider || undefined,
    limit: options.limit ? parseInt(options.limit, 10) : 20,
  });

  if (sessions.length === 0) {
    console.log(chalk.gray('No sessions found'));
    return;
  }

  // Print table header
  console.log(
    chalk.bold(
      padRight('ID', 12) +
      padRight('Provider', 14) +
      padRight('Status', 12) +
      padRight('Workspace', 30) +
      'Task'
    )
  );
  console.log(chalk.gray('-'.repeat(100)));

  // Print sessions
  for (const session of sessions) {
    const statusColor = getStatusColor(session.status);
    const workspaceName = session.workspacePath.split(/[/\\]/).pop() || session.workspacePath;
    const taskPreview = session.task?.substring(0, 40) || '-';

    console.log(
      chalk.cyan(padRight(session.id.substring(0, 10), 12)) +
      padRight(session.provider, 14) +
      statusColor(padRight(session.status, 12)) +
      chalk.gray(padRight(workspaceName, 30)) +
      taskPreview
    );
  }
}

async function resumeSession(id: string): Promise<void> {
  const session = SessionStore.getSession(id);
  if (!session) {
    console.error(chalk.red(`Session ${id} not found`));
    return;
  }

  if (session.status === 'running') {
    console.log(chalk.yellow('Session is already running'));
    return;
  }

  if (!session.nativeSessionId) {
    console.error(chalk.red('Session cannot be resumed (no native session ID)'));
    return;
  }

  console.log(chalk.blue(`Resuming session ${id}...`));

  try {
    const router = getRouter();
    await router.resumeSession(id);
    console.log(chalk.green('Session resumed'));
  } catch (error) {
    console.error(chalk.red(`Failed to resume: ${error instanceof Error ? error.message : 'Unknown error'}`));
  }
}

async function showSession(
  id: string,
  options: { stats?: boolean }
): Promise<void> {
  const session = SessionStore.getSession(id);
  if (!session) {
    console.error(chalk.red(`Session ${id} not found`));
    return;
  }

  console.log(chalk.bold('Session Details'));
  console.log(chalk.gray('-'.repeat(40)));
  console.log(`ID:              ${chalk.cyan(session.id)}`);
  console.log(`Provider:        ${session.provider}`);
  console.log(`Status:          ${getStatusColor(session.status)(session.status)}`);
  console.log(`Workspace:       ${session.workspacePath}`);
  console.log(`Task:            ${session.task || '-'}`);
  console.log(`Created:         ${session.createdAt.toLocaleString()}`);
  console.log(`Updated:         ${session.updatedAt.toLocaleString()}`);

  if (session.nativeSessionId) {
    console.log(`Native ID:       ${session.nativeSessionId}`);
  }

  if (options.stats) {
    const stats = SessionStore.getSessionStats(id);
    if (stats) {
      console.log();
      console.log(chalk.bold('Statistics'));
      console.log(chalk.gray('-'.repeat(40)));
      console.log(`Tokens In:       ${stats.tokensIn}`);
      console.log(`Tokens Out:      ${stats.tokensOut}`);
      console.log(`Cost Estimate:   $${stats.costEstimate.toFixed(4)}`);
      console.log(`Files Changed:   ${stats.filesChanged}`);
      console.log(`Lines Added:     ${stats.linesAdded}`);
      console.log(`Lines Removed:   ${stats.linesRemoved}`);
      console.log(`Duration:        ${formatDuration(stats.durationSeconds)}`);
    }
  }
}

async function showSessionLog(
  id: string,
  options: { format?: string }
): Promise<void> {
  const logs = SessionStore.getSessionLogs(id);
  if (logs.length === 0) {
    console.log(chalk.gray('No logs found'));
    return;
  }

  if (options.format === 'json') {
    console.log(JSON.stringify(logs, null, 2));
    return;
  }

  for (const log of logs) {
    const timestamp = log.timestamp.toLocaleString();
    const roleColor = log.role === 'user' ? chalk.green : log.role === 'assistant' ? chalk.blue : chalk.gray;

    if (options.format === 'markdown') {
      console.log(`### [${timestamp}] ${log.role.toUpperCase()}`);
      console.log(log.content);
      console.log();
    } else {
      console.log(roleColor(`[${timestamp}] ${log.role.toUpperCase()}`));
      console.log(log.content);
      console.log();
    }
  }
}

async function exportSession(
  id: string,
  options: { format?: string }
): Promise<void> {
  const session = SessionStore.getSession(id);
  if (!session) {
    console.error(chalk.red(`Session ${id} not found`));
    return;
  }

  const logs = SessionStore.getSessionLogs(id);
  const stats = SessionStore.getSessionStats(id);

  if (options.format === 'json') {
    console.log(JSON.stringify({ session, logs, stats }, null, 2));
    return;
  }

  // Markdown format
  console.log(`# Session ${session.id}`);
  console.log();
  console.log(`- **Provider:** ${session.provider}`);
  console.log(`- **Status:** ${session.status}`);
  console.log(`- **Workspace:** ${session.workspacePath}`);
  console.log(`- **Created:** ${session.createdAt.toISOString()}`);
  console.log();

  if (session.task) {
    console.log(`## Task`);
    console.log(session.task);
    console.log();
  }

  if (stats) {
    console.log(`## Statistics`);
    console.log(`- Tokens: ${stats.tokensIn} in / ${stats.tokensOut} out`);
    console.log(`- Cost: $${stats.costEstimate.toFixed(4)}`);
    console.log(`- Files Changed: ${stats.filesChanged}`);
    console.log(`- Lines: +${stats.linesAdded} / -${stats.linesRemoved}`);
    console.log(`- Duration: ${formatDuration(stats.durationSeconds)}`);
    console.log();
  }

  console.log(`## Conversation`);
  console.log();
  for (const log of logs) {
    console.log(`### [${log.timestamp.toISOString()}] ${log.role.toUpperCase()}`);
    console.log(log.content);
    console.log();
  }
}

async function deleteSession(
  id: string | undefined,
  options: { status?: string; olderThan?: string; yes?: boolean }
): Promise<void> {
  if (id) {
    // Delete specific session
    const session = SessionStore.getSession(id);
    if (!session) {
      console.error(chalk.red(`Session ${id} not found`));
      return;
    }

    SessionStore.deleteSession(id);
    console.log(chalk.green(`Session ${id} deleted`));
  } else if (options.olderThan) {
    // Delete old sessions
    const days = parseInt(options.olderThan, 10);
    const count = SessionStore.deleteOldSessions(
      days,
      options.status as SessionStatus
    );
    console.log(chalk.green(`Deleted ${count} sessions`));
  } else if (options.status) {
    // Delete by status
    const sessions = SessionStore.listSessions({
      status: options.status as SessionStatus,
    });

    if (sessions.length === 0) {
      console.log(chalk.gray('No sessions to delete'));
      return;
    }

    console.log(`Found ${sessions.length} sessions with status '${options.status}'`);

    for (const session of sessions) {
      SessionStore.deleteSession(session.id);
    }
    console.log(chalk.green(`Deleted ${sessions.length} sessions`));
  } else {
    console.error(chalk.red('Please specify a session ID or use --status/--older-than'));
  }
}

// Helper functions
function padRight(str: string, length: number): string {
  return str.padEnd(length);
}

function getStatusColor(status: SessionStatus): (text: string) => string {
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

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (mins > 0) {
    return `${mins}m ${secs}s`;
  }
  return `${secs}s`;
}
