/**
 * Stats Command
 * Show usage statistics and analytics
 */

import { Command } from 'commander';
import chalk from 'chalk';
import * as SessionStore from '../../core/SessionStore.js';

export function registerStatsCommand(program: Command): void {
  program
    .command('stats')
    .description('Show usage statistics')
    .option('--by <field>', 'Group by: provider, workspace, date')
    .option('--from <date>', 'Start date (YYYY-MM-DD)')
    .option('--to <date>', 'End date (YYYY-MM-DD)')
    .option('-w, --workspace <path>', 'Filter by workspace')
    .option('-p, --provider <name>', 'Filter by provider')
    .action(async (options) => {
      await showStats(options);
    });
}

async function showStats(options: {
  by?: string;
  from?: string;
  to?: string;
  workspace?: string;
  provider?: string;
}): Promise<void> {
  // Get date range
  const toDate = options.to || new Date().toISOString().split('T')[0];
  const fromDate = options.from || getDefaultFromDate();

  console.log();
  console.log(chalk.bold('Usage Statistics'));
  console.log(chalk.gray('═'.repeat(60)));
  console.log();
  console.log(`${chalk.bold('Period:')} ${fromDate} to ${toDate}`);
  if (options.workspace) {
    console.log(`${chalk.bold('Workspace:')} ${options.workspace}`);
  }
  if (options.provider) {
    console.log(`${chalk.bold('Provider:')} ${options.provider}`);
  }
  console.log();

  if (options.by === 'provider') {
    await showStatsByProvider(fromDate, toDate, options.workspace);
  } else if (options.by === 'date') {
    await showStatsByDate(fromDate, toDate, options.workspace, options.provider);
  } else {
    await showOverallStats(fromDate, toDate, options.workspace, options.provider);
  }
}

async function showOverallStats(
  fromDate: string,
  toDate: string,
  workspace?: string,
  provider?: string
): Promise<void> {
  const stats = SessionStore.getAggregatedStats({
    workspacePath: workspace,
    provider,
    fromDate: fromDate + 'T00:00:00',
    toDate: toDate + 'T23:59:59',
  });

  console.log(chalk.bold('Summary'));
  console.log(chalk.gray('-'.repeat(50)));

  // Sessions
  console.log();
  console.log(chalk.bold('Sessions:'));
  console.log(`  Total:       ${stats.totalSessions}`);
  console.log(`  Completed:   ${chalk.green(stats.completedSessions.toString())}`);
  console.log(`  Failed:      ${chalk.red(stats.failedSessions.toString())}`);

  if (stats.totalSessions > 0) {
    const successRate = ((stats.completedSessions / stats.totalSessions) * 100).toFixed(1);
    console.log(`  Success Rate: ${successRate}%`);
  }

  // Tokens
  console.log();
  console.log(chalk.bold('Token Usage:'));
  console.log(`  Input:  ${formatNumber(stats.totalTokensIn)} tokens`);
  console.log(`  Output: ${formatNumber(stats.totalTokensOut)} tokens`);
  console.log(`  Total:  ${formatNumber(stats.totalTokensIn + stats.totalTokensOut)} tokens`);

  // Cost
  console.log();
  console.log(chalk.bold('Estimated Cost:'));
  console.log(`  Total: ${chalk.yellow('$' + stats.totalCost.toFixed(2))}`);

  // Code changes
  console.log();
  console.log(chalk.bold('Code Changes:'));
  console.log(`  Files Changed: ${stats.totalFilesChanged}`);
  console.log(`  Lines Added:   ${chalk.green('+' + stats.totalLinesAdded)}`);
  console.log(`  Lines Removed: ${chalk.red('-' + stats.totalLinesRemoved)}`);

  // Duration
  console.log();
  console.log(chalk.bold('Time:'));
  console.log(`  Total Duration: ${formatDuration(stats.totalDuration)}`);
  if (stats.totalSessions > 0) {
    const avgDuration = Math.floor(stats.totalDuration / stats.totalSessions);
    console.log(`  Avg per Session: ${formatDuration(avgDuration)}`);
  }

  console.log();
}

async function showStatsByProvider(
  fromDate: string,
  toDate: string,
  workspace?: string
): Promise<void> {
  console.log(chalk.bold('Statistics by Provider'));
  console.log(chalk.gray('-'.repeat(80)));
  console.log(
    chalk.bold(
      padRight('Provider', 14) +
      padRight('Sessions', 10) +
      padRight('Tokens', 18) +
      padRight('Cost', 10) +
      padRight('Avg Duration', 14)
    )
  );
  console.log(chalk.gray('-'.repeat(80)));

  const providers = ['claude-code', 'codex', 'gemini-cli', 'opencode'];

  for (const provider of providers) {
    const stats = SessionStore.getAggregatedStats({
      workspacePath: workspace,
      provider,
      fromDate: fromDate + 'T00:00:00',
      toDate: toDate + 'T23:59:59',
    });

    if (stats.totalSessions === 0) continue;

    const avgDuration = Math.floor(stats.totalDuration / stats.totalSessions);
    const totalTokens = stats.totalTokensIn + stats.totalTokensOut;

    console.log(
      chalk.cyan(padRight(provider, 14)) +
      padRight(stats.totalSessions.toString(), 10) +
      padRight(formatNumber(totalTokens), 18) +
      chalk.yellow(padRight('$' + stats.totalCost.toFixed(2), 10)) +
      padRight(formatDuration(avgDuration), 14)
    );
  }

  console.log();
}

async function showStatsByDate(
  fromDate: string,
  toDate: string,
  workspace?: string,
  provider?: string
): Promise<void> {
  console.log(chalk.bold('Statistics by Date'));
  console.log(chalk.gray('-'.repeat(80)));
  console.log(
    chalk.bold(
      padRight('Date', 14) +
      padRight('Sessions', 10) +
      padRight('Completed', 11) +
      padRight('Tokens', 16) +
      padRight('Cost', 10)
    )
  );
  console.log(chalk.gray('-'.repeat(80)));

  // Generate date range
  const dates = getDateRange(fromDate, toDate);

  for (const date of dates) {
    const stats = SessionStore.getAggregatedStats({
      workspacePath: workspace,
      provider,
      fromDate: date + 'T00:00:00',
      toDate: date + 'T23:59:59',
    });

    if (stats.totalSessions === 0) continue;

    const totalTokens = stats.totalTokensIn + stats.totalTokensOut;

    console.log(
      chalk.gray(padRight(date, 14)) +
      padRight(stats.totalSessions.toString(), 10) +
      chalk.green(padRight(stats.completedSessions.toString(), 11)) +
      padRight(formatNumber(totalTokens), 16) +
      chalk.yellow(padRight('$' + stats.totalCost.toFixed(2), 10))
    );
  }

  console.log();
}

// Helper functions
function padRight(str: string, length: number): string {
  return str.padEnd(length);
}

function formatNumber(num: number): string {
  if (num >= 1000000) {
    return (num / 1000000).toFixed(1) + 'M';
  }
  if (num >= 1000) {
    return (num / 1000).toFixed(1) + 'K';
  }
  return num.toString();
}

function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  if (hours > 0) {
    return `${hours}h ${mins}m`;
  } else if (mins > 0) {
    return `${mins}m ${secs}s`;
  }
  return `${secs}s`;
}

function getDefaultFromDate(): string {
  const date = new Date();
  date.setDate(date.getDate() - 7);
  return date.toISOString().split('T')[0];
}

function getDateRange(fromDate: string, toDate: string): string[] {
  const dates: string[] = [];
  const current = new Date(fromDate);
  const end = new Date(toDate);

  while (current <= end) {
    dates.push(current.toISOString().split('T')[0]);
    current.setDate(current.getDate() + 1);
  }

  return dates;
}
