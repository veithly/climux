/**
 * Metrics Utility Module
 * Collects, aggregates, and reports usage metrics for BotCLI sessions
 */

import {
  getSession,
  getSessionStats,
  updateSessionStats,
  getAggregatedStats,
  listSessions,
} from '../core/SessionStore.js';
import { loadConfig } from './config.js';
import type { SessionStats } from '../types/index.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Summary of metrics for a time period
 */
export interface MetricsSummary {
  totalSessions: number;
  completedSessions: number;
  failedSessions: number;
  totalTokensIn: number;
  totalTokensOut: number;
  totalTokens: number;
  totalCost: number;
  totalFilesChanged: number;
  totalLinesAdded: number;
  totalLinesRemoved: number;
  totalDurationSeconds: number;
  averageTokensPerSession: number;
  averageCostPerSession: number;
  averageDurationPerSession: number;
}

/**
 * Provider-specific statistics
 */
export interface ProviderMetrics extends MetricsSummary {
  provider: string;
  pricing?: {
    input: number;
    output: number;
  };
}

/**
 * Workspace-specific statistics
 */
export interface WorkspaceMetrics extends MetricsSummary {
  workspacePath: string;
  providerBreakdown: Record<string, MetricsSummary>;
}

/**
 * Daily summary with provider breakdown
 */
export interface DailySummary extends MetricsSummary {
  date: string;
  providerBreakdown: Record<string, MetricsSummary>;
}

/**
 * Tracked session data
 */
interface TrackedSession {
  sessionId: string;
  startTime: number;
  tokensIn: number;
  tokensOut: number;
  cost: number;
  filesChanged: number;
  linesAdded: number;
  linesRemoved: number;
}

// ============================================================================
// MetricsCollector Class
// ============================================================================

/**
 * MetricsCollector - Collects and aggregates metrics for active sessions
 *
 * Usage:
 * ```typescript
 * const collector = new MetricsCollector();
 * collector.trackSession(sessionId);
 * collector.recordTokens(sessionId, 100, 50);
 * collector.recordCost(sessionId, 0.05);
 * collector.recordFileChanges(sessionId, 3, 150, 20);
 * collector.finishSession(sessionId);
 * ```
 */
export class MetricsCollector {
  private trackedSessions: Map<string, TrackedSession> = new Map();

  /**
   * Start tracking a session
   * @param sessionId - The session ID to track
   */
  trackSession(sessionId: string): void {
    // Verify session exists
    const session = getSession(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    // Initialize tracking data
    this.trackedSessions.set(sessionId, {
      sessionId,
      startTime: Date.now(),
      tokensIn: 0,
      tokensOut: 0,
      cost: 0,
      filesChanged: 0,
      linesAdded: 0,
      linesRemoved: 0,
    });
  }

  /**
   * Record token usage for a session
   * @param sessionId - The session ID
   * @param tokensIn - Number of input tokens
   * @param tokensOut - Number of output tokens
   */
  recordTokens(sessionId: string, tokensIn: number, tokensOut: number): void {
    const tracked = this.getTrackedSession(sessionId);

    // Update local tracking
    tracked.tokensIn += tokensIn;
    tracked.tokensOut += tokensOut;

    // Persist to database
    updateSessionStats(sessionId, {
      tokensIn,
      tokensOut,
    });
  }

  /**
   * Record cost for a session
   * @param sessionId - The session ID
   * @param cost - The cost amount
   */
  recordCost(sessionId: string, cost: number): void {
    const tracked = this.getTrackedSession(sessionId);

    // Update local tracking
    tracked.cost += cost;

    // Persist to database
    updateSessionStats(sessionId, {
      costEstimate: cost,
    });
  }

  /**
   * Record file changes for a session
   * @param sessionId - The session ID
   * @param filesChanged - Number of files changed
   * @param linesAdded - Number of lines added
   * @param linesRemoved - Number of lines removed
   */
  recordFileChanges(
    sessionId: string,
    filesChanged: number,
    linesAdded: number,
    linesRemoved: number
  ): void {
    const tracked = this.getTrackedSession(sessionId);

    // Update local tracking (use latest values, not cumulative)
    tracked.filesChanged = filesChanged;
    tracked.linesAdded = linesAdded;
    tracked.linesRemoved = linesRemoved;

    // Persist to database
    updateSessionStats(sessionId, {
      filesChanged,
      linesAdded,
      linesRemoved,
    });
  }

  /**
   * Record duration for a session
   * @param sessionId - The session ID
   * @param seconds - Duration in seconds
   */
  recordDuration(sessionId: string, seconds: number): void {
    this.getTrackedSession(sessionId); // Verify tracking

    // Persist to database
    updateSessionStats(sessionId, {
      durationSeconds: seconds,
    });
  }

  /**
   * Finish tracking a session and save final stats
   * @param sessionId - The session ID
   * @returns Final session statistics
   */
  finishSession(sessionId: string): SessionStats | undefined {
    const tracked = this.trackedSessions.get(sessionId);

    if (tracked) {
      // Calculate final duration if not already set
      const durationSeconds = Math.floor((Date.now() - tracked.startTime) / 1000);
      updateSessionStats(sessionId, {
        durationSeconds,
      });

      // Remove from tracking
      this.trackedSessions.delete(sessionId);
    }

    // Return final stats from database
    return getSessionStats(sessionId);
  }

  /**
   * Get current metrics for a tracked session
   * @param sessionId - The session ID
   * @returns Current tracked metrics or undefined if not tracking
   */
  getCurrentMetrics(sessionId: string): TrackedSession | undefined {
    return this.trackedSessions.get(sessionId);
  }

  /**
   * Check if a session is being tracked
   * @param sessionId - The session ID
   * @returns True if session is being tracked
   */
  isTracking(sessionId: string): boolean {
    return this.trackedSessions.has(sessionId);
  }

  /**
   * Get all currently tracked session IDs
   * @returns Array of session IDs
   */
  getTrackedSessionIds(): string[] {
    return Array.from(this.trackedSessions.keys());
  }

  /**
   * Stop tracking a session without saving final stats
   * @param sessionId - The session ID
   */
  stopTracking(sessionId: string): void {
    this.trackedSessions.delete(sessionId);
  }

  /**
   * Get tracked session or throw error
   */
  private getTrackedSession(sessionId: string): TrackedSession {
    const tracked = this.trackedSessions.get(sessionId);
    if (!tracked) {
      throw new Error(`Session not being tracked: ${sessionId}. Call trackSession() first.`);
    }
    return tracked;
  }
}

// ============================================================================
// Aggregation Functions
// ============================================================================

/**
 * Convert raw aggregated stats to MetricsSummary with calculated averages
 */
function toMetricsSummary(raw: ReturnType<typeof getAggregatedStats>): MetricsSummary {
  const totalSessions = raw.totalSessions || 1; // Avoid division by zero
  return {
    totalSessions: raw.totalSessions,
    completedSessions: raw.completedSessions,
    failedSessions: raw.failedSessions,
    totalTokensIn: raw.totalTokensIn,
    totalTokensOut: raw.totalTokensOut,
    totalTokens: raw.totalTokensIn + raw.totalTokensOut,
    totalCost: raw.totalCost,
    totalFilesChanged: raw.totalFilesChanged,
    totalLinesAdded: raw.totalLinesAdded,
    totalLinesRemoved: raw.totalLinesRemoved,
    totalDurationSeconds: raw.totalDuration,
    averageTokensPerSession: Math.round((raw.totalTokensIn + raw.totalTokensOut) / totalSessions),
    averageCostPerSession: raw.totalCost / totalSessions,
    averageDurationPerSession: Math.round(raw.totalDuration / totalSessions),
  };
}

/**
 * Get the start and end of a date (in ISO format)
 */
function getDateBounds(dateStr?: string): { fromDate: string; toDate: string } {
  const date = dateStr ? new Date(dateStr) : new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return {
    fromDate: `${year}-${month}-${day}T00:00:00.000Z`,
    toDate: `${year}-${month}-${day}T23:59:59.999Z`,
  };
}

/**
 * Get daily summary with provider breakdown
 * @param date - Optional date string (YYYY-MM-DD format). Defaults to today.
 * @returns Daily summary with per-provider metrics
 */
export function getDailySummary(date?: string): DailySummary {
  const { fromDate, toDate } = getDateBounds(date);
  const dateDisplay = date || new Date().toISOString().split('T')[0];

  // Get overall stats for the day
  const overallStats = getAggregatedStats({ fromDate, toDate });
  const summary = toMetricsSummary(overallStats);

  // Get provider breakdown
  const config = loadConfig();
  const providerNames = Object.keys(config.providers);
  const providerBreakdown: Record<string, MetricsSummary> = {};

  for (const provider of providerNames) {
    const providerStats = getAggregatedStats({ provider, fromDate, toDate });
    if (providerStats.totalSessions > 0) {
      providerBreakdown[provider] = toMetricsSummary(providerStats);
    }
  }

  return {
    date: dateDisplay,
    ...summary,
    providerBreakdown,
  };
}

/**
 * Get statistics for a specific provider
 * @param provider - Provider name (e.g., 'claude-code', 'gemini-cli')
 * @param options - Optional filters (fromDate, toDate)
 * @returns Provider metrics
 */
export function getProviderStats(
  provider: string,
  options?: { fromDate?: string; toDate?: string }
): ProviderMetrics {
  const rawStats = getAggregatedStats({
    provider,
    fromDate: options?.fromDate,
    toDate: options?.toDate,
  });

  const summary = toMetricsSummary(rawStats);

  // Get pricing from config
  const config = loadConfig();
  const providerConfig = config.providers[provider];

  return {
    provider,
    ...summary,
    pricing: providerConfig?.pricing,
  };
}

/**
 * Get statistics for a specific workspace
 * @param workspacePath - Absolute path to the workspace
 * @param options - Optional filters (fromDate, toDate)
 * @returns Workspace metrics with provider breakdown
 */
export function getWorkspaceStats(
  workspacePath: string,
  options?: { fromDate?: string; toDate?: string }
): WorkspaceMetrics {
  const rawStats = getAggregatedStats({
    workspacePath,
    fromDate: options?.fromDate,
    toDate: options?.toDate,
  });

  const summary = toMetricsSummary(rawStats);

  // Get provider breakdown for this workspace
  const sessions = listSessions({ workspacePath });
  const providers = [...new Set(sessions.map(s => s.provider))];
  const providerBreakdown: Record<string, MetricsSummary> = {};

  for (const provider of providers) {
    const providerStats = getAggregatedStats({
      workspacePath,
      provider,
      fromDate: options?.fromDate,
      toDate: options?.toDate,
    });
    if (providerStats.totalSessions > 0) {
      providerBreakdown[provider] = toMetricsSummary(providerStats);
    }
  }

  return {
    workspacePath,
    ...summary,
    providerBreakdown,
  };
}

// ============================================================================
// Cost Estimation
// ============================================================================

/**
 * Default pricing per 1K tokens (fallback if provider not configured)
 */
const DEFAULT_PRICING: Record<string, { input: number; output: number }> = {
  'claude-code': { input: 0.003, output: 0.015 },
  'codex': { input: 0.003, output: 0.012 },
  'gemini-cli': { input: 0.001, output: 0.002 },
  'opencode': { input: 0.002, output: 0.006 },
};

/**
 * Estimate cost based on provider pricing
 * @param provider - Provider name
 * @param tokensIn - Number of input tokens
 * @param tokensOut - Number of output tokens
 * @returns Estimated cost in USD
 */
export function estimateCost(
  provider: string,
  tokensIn: number,
  tokensOut: number
): number {
  // Try to get pricing from config
  const config = loadConfig();
  const providerConfig = config.providers[provider];
  let pricing = providerConfig?.pricing;

  // Fall back to defaults if not configured
  if (!pricing) {
    pricing = DEFAULT_PRICING[provider] || { input: 0.002, output: 0.006 };
  }

  // Calculate cost (pricing is per 1K tokens)
  const inputCost = (tokensIn / 1000) * pricing.input;
  const outputCost = (tokensOut / 1000) * pricing.output;

  return inputCost + outputCost;
}

/**
 * Get pricing configuration for a provider
 * @param provider - Provider name
 * @returns Pricing per 1K tokens or undefined if not configured
 */
export function getProviderPricing(
  provider: string
): { input: number; output: number } | undefined {
  const config = loadConfig();
  const providerConfig = config.providers[provider];
  return providerConfig?.pricing || DEFAULT_PRICING[provider];
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Format cost as currency string
 * @param cost - Cost in USD
 * @returns Formatted string (e.g., "$0.05")
 */
export function formatCost(cost: number): string {
  if (cost < 0.01) {
    return `$${cost.toFixed(4)}`;
  }
  return `$${cost.toFixed(2)}`;
}

/**
 * Format token count with thousands separator
 * @param tokens - Number of tokens
 * @returns Formatted string (e.g., "1,234")
 */
export function formatTokens(tokens: number): string {
  return tokens.toLocaleString();
}

/**
 * Format duration in human-readable form
 * @param seconds - Duration in seconds
 * @returns Formatted string (e.g., "5m 30s")
 */
export function formatDuration(seconds: number): string {
  if (seconds < 60) {
    return `${seconds}s`;
  }
  if (seconds < 3600) {
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return secs > 0 ? `${minutes}m ${secs}s` : `${minutes}m`;
  }
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
}

/**
 * Get a summary string for metrics
 * @param metrics - Metrics summary object
 * @returns Human-readable summary string
 */
export function formatMetricsSummary(metrics: MetricsSummary): string {
  const lines = [
    `Sessions: ${metrics.totalSessions} (${metrics.completedSessions} completed, ${metrics.failedSessions} failed)`,
    `Tokens: ${formatTokens(metrics.totalTokens)} (${formatTokens(metrics.totalTokensIn)} in, ${formatTokens(metrics.totalTokensOut)} out)`,
    `Cost: ${formatCost(metrics.totalCost)}`,
    `Duration: ${formatDuration(metrics.totalDurationSeconds)}`,
    `Changes: ${metrics.totalFilesChanged} files, +${metrics.totalLinesAdded}/-${metrics.totalLinesRemoved} lines`,
  ];
  return lines.join('\n');
}

// ============================================================================
// Singleton Instance
// ============================================================================

/**
 * Global metrics collector instance
 * Use this for simple access without creating a new instance
 */
export const metricsCollector = new MetricsCollector();

// ============================================================================
// Exports
// ============================================================================

export type { SessionStats };
