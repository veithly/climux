import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { initDb, closeDb, getDb, run, query, get } from '../../src/utils/db.js';

describe('Database', () => {
  beforeAll(async () => {
    // Initialize database (uses default path in home dir)
    await initDb();
  });

  afterAll(() => {
    closeDb();
  });

  describe('initDb', () => {
    it('should initialize database', () => {
      const db = getDb();
      expect(db).toBeDefined();
    });

    it('should create sessions table', () => {
      const result = query<{ name: string }>(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='sessions'"
      );
      expect(result.length).toBe(1);
      expect(result[0].name).toBe('sessions');
    });

    it('should create session_logs table', () => {
      const result = query<{ name: string }>(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='session_logs'"
      );
      expect(result.length).toBe(1);
      expect(result[0].name).toBe('session_logs');
    });

    it('should create session_stats table', () => {
      const result = query<{ name: string }>(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='session_stats'"
      );
      expect(result.length).toBe(1);
      expect(result[0].name).toBe('session_stats');
    });
  });

  describe('getDb', () => {
    it('should return the same database instance', () => {
      const db1 = getDb();
      const db2 = getDb();
      expect(db1).toBe(db2);
    });
  });

  describe('run and query', () => {
    it('should execute INSERT and SELECT', () => {
      const testId = `test-${Date.now()}-${Math.random()}`;
      run(
        `INSERT INTO sessions (id, workspace_path, provider, task, status)
         VALUES (?, ?, ?, ?, ?)`,
        [testId, '/test/path', 'claude-code', 'test task', 'pending']
      );

      const result = query<{ id: string }>('SELECT id FROM sessions WHERE id = ?', [testId]);
      expect(result.length).toBe(1);
      expect(result[0].id).toBe(testId);

      // Cleanup
      run('DELETE FROM sessions WHERE id = ?', [testId]);
    });

    it('should execute UPDATE', () => {
      const testId = `test-${Date.now()}-${Math.random()}`;
      // Insert first
      run(
        `INSERT INTO sessions (id, workspace_path, provider, task, status)
         VALUES (?, ?, ?, ?, ?)`,
        [testId, '/test/path', 'claude-code', 'test task', 'pending']
      );

      // Update
      run('UPDATE sessions SET status = ? WHERE id = ?', ['running', testId]);

      const result = query<{ status: string }>('SELECT status FROM sessions WHERE id = ?', [testId]);
      expect(result[0].status).toBe('running');

      // Cleanup
      run('DELETE FROM sessions WHERE id = ?', [testId]);
    });

    it('should return empty array for no results', () => {
      const result = query<{ id: string }>('SELECT id FROM sessions WHERE id = ?', ['non-existent-xyz']);
      expect(result).toEqual([]);
    });
  });

  describe('get', () => {
    it('should return single row', () => {
      const testId = `test-${Date.now()}-${Math.random()}`;
      run(
        `INSERT INTO sessions (id, workspace_path, provider, task, status)
         VALUES (?, ?, ?, ?, ?)`,
        [testId, '/test/path', 'claude-code', 'test task', 'pending']
      );

      const result = get<{ task: string }>('SELECT task FROM sessions WHERE id = ?', [testId]);
      expect(result).toBeDefined();
      expect(result!.task).toBe('test task');

      // Cleanup
      run('DELETE FROM sessions WHERE id = ?', [testId]);
    });

    it('should return undefined for no results', () => {
      const result = get<{ id: string }>('SELECT id FROM sessions WHERE id = ?', ['non-existent-xyz']);
      expect(result).toBeUndefined();
    });
  });
});
