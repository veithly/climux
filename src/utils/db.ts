/**
 * SQLite Database Wrapper using sql.js
 */

import initSqlJs from 'sql.js';
import type { Database as SqlJsDatabase } from 'sql.js';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { homedir } from 'os';
import { ErrorCode, BotCliError } from '../types/index.js';

let db: SqlJsDatabase | null = null;
let dbPath: string;

/**
 * Get the database file path
 */
export function getDbPath(): string {
  if (dbPath) return dbPath;
  const climuxDir = join(homedir(), '.climux');
  if (!existsSync(climuxDir)) {
    mkdirSync(climuxDir, { recursive: true });
  }
  dbPath = join(climuxDir, 'climux.db');
  return dbPath;
}

/**
 * Initialize the database
 */
export async function initDb(): Promise<SqlJsDatabase> {
  if (db) return db;

  const SQL = await initSqlJs();
  const path = getDbPath();

  try {
    if (existsSync(path)) {
      const buffer = readFileSync(path);
      db = new SQL.Database(buffer);
    } else {
      db = new SQL.Database();
    }

    // Create tables
    createTables(db);

    // Save to ensure file exists
    saveDb();

    return db;
  } catch (error) {
    throw new BotCliError(
      ErrorCode.DATABASE_ERROR,
      `Failed to initialize database: ${error}`,
      false
    );
  }
}

/**
 * Create database tables
 */
function createTables(database: SqlJsDatabase): void {
  database.run(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      workspace_path TEXT NOT NULL,
      provider TEXT NOT NULL,
      task TEXT,
      status TEXT DEFAULT 'pending',
      native_session_id TEXT,
      pid INTEGER,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `);

  database.run(`
    CREATE TABLE IF NOT EXISTS session_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT REFERENCES sessions(id),
      role TEXT,
      content TEXT,
      timestamp TEXT DEFAULT (datetime('now'))
    )
  `);

  database.run(`
    CREATE TABLE IF NOT EXISTS session_stats (
      session_id TEXT PRIMARY KEY REFERENCES sessions(id),
      tokens_in INTEGER DEFAULT 0,
      tokens_out INTEGER DEFAULT 0,
      cost_estimate REAL DEFAULT 0,
      files_changed INTEGER DEFAULT 0,
      lines_added INTEGER DEFAULT 0,
      lines_removed INTEGER DEFAULT 0,
      duration_seconds INTEGER DEFAULT 0
    )
  `);

  database.run(`
    CREATE TABLE IF NOT EXISTS quality_checks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT REFERENCES sessions(id),
      lint_errors INTEGER DEFAULT 0,
      type_errors INTEGER DEFAULT 0,
      tests_passed INTEGER DEFAULT 0,
      tests_failed INTEGER DEFAULT 0,
      checked_at TEXT DEFAULT (datetime('now'))
    )
  `);

  database.run(`
    CREATE TABLE IF NOT EXISTS workspace_aliases (
      name TEXT PRIMARY KEY,
      path TEXT NOT NULL
    )
  `);

  // Create indexes
  database.run(`CREATE INDEX IF NOT EXISTS idx_sessions_workspace ON sessions(workspace_path)`);
  database.run(`CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions(status)`);
  database.run(`CREATE INDEX IF NOT EXISTS idx_session_logs_session ON session_logs(session_id)`);
}

/**
 * Save database to file
 */
export function saveDb(): void {
  if (!db) return;
  const data = db.export();
  const buffer = Buffer.from(data);
  const dir = dirname(getDbPath());
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(getDbPath(), buffer);
}

/**
 * Get the database instance
 */
export function getDb(): SqlJsDatabase {
  if (!db) {
    throw new BotCliError(
      ErrorCode.DATABASE_ERROR,
      'Database not initialized. Call initDb() first.',
      false
    );
  }
  return db;
}

/**
 * Close the database
 */
export function closeDb(): void {
  if (db) {
    saveDb();
    db.close();
    db = null;
  }
}

/**
 * Run a query that returns results
 */
export function query<T>(sql: string, params: unknown[] = []): T[] {
  const database = getDb();
  const stmt = database.prepare(sql);
  stmt.bind(params);

  const results: T[] = [];
  while (stmt.step()) {
    const row = stmt.getAsObject() as T;
    results.push(row);
  }
  stmt.free();

  return results;
}

/**
 * Track if we're inside a transaction to avoid premature saves
 */
let inTransaction = false;

/**
 * Run a query that doesn't return results (INSERT, UPDATE, DELETE)
 */
export function run(sql: string, params: unknown[] = []): void {
  const database = getDb();
  database.run(sql, params);
  // Only save if not inside a transaction (transaction will save at end)
  if (!inTransaction) {
    saveDb();
  }
}

/**
 * Get a single row
 */
export function get<T>(sql: string, params: unknown[] = []): T | undefined {
  const results = query<T>(sql, params);
  return results[0];
}

/**
 * Transaction helper
 */
export function transaction<T>(fn: () => T): T {
  const database = getDb();

  // Prevent nested transactions
  if (inTransaction) {
    return fn();
  }

  inTransaction = true;
  database.run('BEGIN TRANSACTION');
  try {
    const result = fn();
    database.run('COMMIT');
    inTransaction = false;
    saveDb();
    return result;
  } catch (error) {
    try {
      database.run('ROLLBACK');
    } catch {
      // Ignore rollback errors if transaction already ended
    }
    inTransaction = false;
    throw error;
  }
}
