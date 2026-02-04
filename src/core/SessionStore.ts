/**
 * Session Store
 * SQLite-based session persistence
 */

import { v4 as uuidv4 } from 'uuid';
import type {
  Session,
  SessionLog,
  SessionStats,
  SessionStatus,
  QualityCheck,
} from '../types/index.js';
import { query, run, get, transaction } from '../utils/db.js';

/**
 * Create a new session
 */
export function createSession(
  workspacePath: string,
  provider: string,
  task?: string
): Session {
  const id = uuidv4();
  const now = new Date().toISOString();

  run(
    `INSERT INTO sessions (id, workspace_path, provider, task, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'pending', ?, ?)`,
    [id, workspacePath, provider, task || null, now, now]
  );

  // Create initial stats record
  run(
    `INSERT INTO session_stats (session_id) VALUES (?)`,
    [id]
  );

  return {
    id,
    workspacePath,
    provider,
    task: task || null,
    status: 'pending',
    nativeSessionId: null,
    pid: null,
    createdAt: new Date(now),
    updatedAt: new Date(now),
  };
}

/**
 * Get a session by ID
 */
export function getSession(id: string): Session | undefined {
  const row = get<{
    id: string;
    workspace_path: string;
    provider: string;
    task: string | null;
    status: string;
    native_session_id: string | null;
    pid: number | null;
    created_at: string;
    updated_at: string;
  }>(`SELECT * FROM sessions WHERE id = ?`, [id]);

  if (!row) return undefined;

  return {
    id: row.id,
    workspacePath: row.workspace_path,
    provider: row.provider,
    task: row.task,
    status: row.status as SessionStatus,
    nativeSessionId: row.native_session_id,
    pid: row.pid,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

/**
 * Update session status
 */
export function updateSessionStatus(id: string, status: SessionStatus): void {
  run(
    `UPDATE sessions SET status = ?, updated_at = datetime('now') WHERE id = ?`,
    [status, id]
  );
}

/**
 * Update session PID
 */
export function updateSessionPid(id: string, pid: number | null): void {
  run(
    `UPDATE sessions SET pid = ?, updated_at = datetime('now') WHERE id = ?`,
    [pid, id]
  );
}

/**
 * Update native session ID
 */
export function updateNativeSessionId(id: string, nativeSessionId: string): void {
  run(
    `UPDATE sessions SET native_session_id = ?, updated_at = datetime('now') WHERE id = ?`,
    [nativeSessionId, id]
  );
}

/**
 * List sessions with optional filters
 */
export function listSessions(options?: {
  workspacePath?: string;
  status?: SessionStatus;
  provider?: string;
  limit?: number;
}): Session[] {
  let sql = `SELECT * FROM sessions WHERE 1=1`;
  const params: unknown[] = [];

  if (options?.workspacePath) {
    sql += ` AND workspace_path = ?`;
    params.push(options.workspacePath);
  }

  if (options?.status) {
    sql += ` AND status = ?`;
    params.push(options.status);
  }

  if (options?.provider) {
    sql += ` AND provider = ?`;
    params.push(options.provider);
  }

  sql += ` ORDER BY created_at DESC`;

  if (options?.limit) {
    sql += ` LIMIT ?`;
    params.push(options.limit);
  }

  const rows = query<{
    id: string;
    workspace_path: string;
    provider: string;
    task: string | null;
    status: string;
    native_session_id: string | null;
    pid: number | null;
    created_at: string;
    updated_at: string;
  }>(sql, params);

  return rows.map(row => ({
    id: row.id,
    workspacePath: row.workspace_path,
    provider: row.provider,
    task: row.task,
    status: row.status as SessionStatus,
    nativeSessionId: row.native_session_id,
    pid: row.pid,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  }));
}

/**
 * Delete a session and its related data
 */
export function deleteSession(id: string): void {
  transaction(() => {
    run(`DELETE FROM quality_checks WHERE session_id = ?`, [id]);
    run(`DELETE FROM session_stats WHERE session_id = ?`, [id]);
    run(`DELETE FROM session_logs WHERE session_id = ?`, [id]);
    run(`DELETE FROM sessions WHERE id = ?`, [id]);
  });
}

/**
 * Delete old sessions
 */
export function deleteOldSessions(olderThanDays: number, status?: SessionStatus): number {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);
  const cutoff = cutoffDate.toISOString();

  let sql = `SELECT id FROM sessions WHERE created_at < ?`;
  const params: unknown[] = [cutoff];

  if (status) {
    sql += ` AND status = ?`;
    params.push(status);
  }

  const sessions = query<{ id: string }>(sql, params);
  let count = 0;

  for (const session of sessions) {
    deleteSession(session.id);
    count++;
  }

  return count;
}

/**
 * Add a log entry to a session
 */
export function addSessionLog(
  sessionId: string,
  role: 'user' | 'assistant' | 'system',
  content: string
): void {
  run(
    `INSERT INTO session_logs (session_id, role, content) VALUES (?, ?, ?)`,
    [sessionId, role, content]
  );
}

/**
 * Get session logs
 */
export function getSessionLogs(sessionId: string): SessionLog[] {
  const rows = query<{
    id: number;
    session_id: string;
    role: string;
    content: string;
    timestamp: string;
  }>(
    `SELECT * FROM session_logs WHERE session_id = ? ORDER BY timestamp ASC`,
    [sessionId]
  );

  return rows.map(row => ({
    id: row.id,
    sessionId: row.session_id,
    role: row.role as 'user' | 'assistant' | 'system',
    content: row.content,
    timestamp: new Date(row.timestamp),
  }));
}

/**
 * Get session stats
 */
export function getSessionStats(sessionId: string): SessionStats | undefined {
  const row = get<{
    session_id: string;
    tokens_in: number;
    tokens_out: number;
    cost_estimate: number;
    files_changed: number;
    lines_added: number;
    lines_removed: number;
    duration_seconds: number;
  }>(
    `SELECT * FROM session_stats WHERE session_id = ?`,
    [sessionId]
  );

  if (!row) return undefined;

  return {
    sessionId: row.session_id,
    tokensIn: row.tokens_in,
    tokensOut: row.tokens_out,
    costEstimate: row.cost_estimate,
    filesChanged: row.files_changed,
    linesAdded: row.lines_added,
    linesRemoved: row.lines_removed,
    durationSeconds: row.duration_seconds,
  };
}

/**
 * Update session stats
 */
export function updateSessionStats(
  sessionId: string,
  stats: Partial<SessionStats>
): void {
  const updates: string[] = [];
  const params: unknown[] = [];

  if (stats.tokensIn !== undefined) {
    updates.push('tokens_in = tokens_in + ?');
    params.push(stats.tokensIn);
  }
  if (stats.tokensOut !== undefined) {
    updates.push('tokens_out = tokens_out + ?');
    params.push(stats.tokensOut);
  }
  if (stats.costEstimate !== undefined) {
    updates.push('cost_estimate = cost_estimate + ?');
    params.push(stats.costEstimate);
  }
  if (stats.filesChanged !== undefined) {
    updates.push('files_changed = ?');
    params.push(stats.filesChanged);
  }
  if (stats.linesAdded !== undefined) {
    updates.push('lines_added = ?');
    params.push(stats.linesAdded);
  }
  if (stats.linesRemoved !== undefined) {
    updates.push('lines_removed = ?');
    params.push(stats.linesRemoved);
  }
  if (stats.durationSeconds !== undefined) {
    updates.push('duration_seconds = ?');
    params.push(stats.durationSeconds);
  }

  if (updates.length === 0) return;

  params.push(sessionId);
  run(
    `UPDATE session_stats SET ${updates.join(', ')} WHERE session_id = ?`,
    params
  );
}

/**
 * Add quality check result
 */
export function addQualityCheck(
  sessionId: string,
  check: Omit<QualityCheck, 'id' | 'sessionId' | 'checkedAt'>
): void {
  run(
    `INSERT INTO quality_checks (session_id, lint_errors, type_errors, tests_passed, tests_failed)
     VALUES (?, ?, ?, ?, ?)`,
    [sessionId, check.lintErrors, check.typeErrors, check.testsPassed, check.testsFailed]
  );
}

/**
 * Get latest quality check for a session
 */
export function getLatestQualityCheck(sessionId: string): QualityCheck | undefined {
  const row = get<{
    id: number;
    session_id: string;
    lint_errors: number;
    type_errors: number;
    tests_passed: number;
    tests_failed: number;
    checked_at: string;
  }>(
    `SELECT * FROM quality_checks WHERE session_id = ? ORDER BY checked_at DESC LIMIT 1`,
    [sessionId]
  );

  if (!row) return undefined;

  return {
    id: row.id,
    sessionId: row.session_id,
    lintErrors: row.lint_errors,
    typeErrors: row.type_errors,
    testsPassed: row.tests_passed,
    testsFailed: row.tests_failed,
    checkedAt: new Date(row.checked_at),
  };
}

/**
 * Get aggregated stats for a time period
 */
export function getAggregatedStats(options?: {
  workspacePath?: string;
  provider?: string;
  fromDate?: string;
  toDate?: string;
}): {
  totalSessions: number;
  completedSessions: number;
  failedSessions: number;
  totalTokensIn: number;
  totalTokensOut: number;
  totalCost: number;
  totalFilesChanged: number;
  totalLinesAdded: number;
  totalLinesRemoved: number;
  totalDuration: number;
} {
  let sql = `
    SELECT
      COUNT(s.id) as total_sessions,
      SUM(CASE WHEN s.status = 'completed' THEN 1 ELSE 0 END) as completed_sessions,
      SUM(CASE WHEN s.status = 'failed' THEN 1 ELSE 0 END) as failed_sessions,
      COALESCE(SUM(st.tokens_in), 0) as total_tokens_in,
      COALESCE(SUM(st.tokens_out), 0) as total_tokens_out,
      COALESCE(SUM(st.cost_estimate), 0) as total_cost,
      COALESCE(SUM(st.files_changed), 0) as total_files_changed,
      COALESCE(SUM(st.lines_added), 0) as total_lines_added,
      COALESCE(SUM(st.lines_removed), 0) as total_lines_removed,
      COALESCE(SUM(st.duration_seconds), 0) as total_duration
    FROM sessions s
    LEFT JOIN session_stats st ON s.id = st.session_id
    WHERE 1=1
  `;
  const params: unknown[] = [];

  if (options?.workspacePath) {
    sql += ` AND s.workspace_path = ?`;
    params.push(options.workspacePath);
  }

  if (options?.provider) {
    sql += ` AND s.provider = ?`;
    params.push(options.provider);
  }

  if (options?.fromDate) {
    sql += ` AND s.created_at >= ?`;
    params.push(options.fromDate);
  }

  if (options?.toDate) {
    sql += ` AND s.created_at <= ?`;
    params.push(options.toDate);
  }

  const row = get<{
    total_sessions: number;
    completed_sessions: number;
    failed_sessions: number;
    total_tokens_in: number;
    total_tokens_out: number;
    total_cost: number;
    total_files_changed: number;
    total_lines_added: number;
    total_lines_removed: number;
    total_duration: number;
  }>(sql, params);

  return {
    totalSessions: row?.total_sessions || 0,
    completedSessions: row?.completed_sessions || 0,
    failedSessions: row?.failed_sessions || 0,
    totalTokensIn: row?.total_tokens_in || 0,
    totalTokensOut: row?.total_tokens_out || 0,
    totalCost: row?.total_cost || 0,
    totalFilesChanged: row?.total_files_changed || 0,
    totalLinesAdded: row?.total_lines_added || 0,
    totalLinesRemoved: row?.total_lines_removed || 0,
    totalDuration: row?.total_duration || 0,
  };
}
