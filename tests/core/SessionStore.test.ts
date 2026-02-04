import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { initDb, closeDb } from '../../src/utils/db.js';
import * as SessionStore from '../../src/core/SessionStore.js';

describe('SessionStore', () => {
  // Track created sessions for cleanup
  const createdSessionIds: string[] = [];

  beforeAll(async () => {
    await initDb();
  });

  afterAll(() => {
    closeDb();
  });

  afterEach(() => {
    // Clean up created sessions
    for (const id of createdSessionIds) {
      try {
        SessionStore.deleteSession(id);
      } catch {
        // Ignore cleanup errors
      }
    }
    createdSessionIds.length = 0;
  });

  describe('createSession', () => {
    it('should create a new session with correct fields', () => {
      const session = SessionStore.createSession('/test/path', 'claude-code', 'write tests');
      createdSessionIds.push(session.id);

      expect(session).toBeDefined();
      expect(session.id).toBeDefined();
      expect(session.workspacePath).toBe('/test/path');
      expect(session.provider).toBe('claude-code');
      expect(session.task).toBe('write tests');
      expect(session.status).toBe('pending');
      expect(session.createdAt).toBeInstanceOf(Date);
      expect(session.updatedAt).toBeInstanceOf(Date);
    });

    it('should generate unique session IDs', () => {
      const session1 = SessionStore.createSession('/test', 'claude-code', 'task1');
      const session2 = SessionStore.createSession('/test', 'claude-code', 'task2');
      createdSessionIds.push(session1.id, session2.id);

      expect(session1.id).not.toBe(session2.id);
    });

    it('should handle null task', () => {
      const session = SessionStore.createSession('/test', 'claude-code');
      createdSessionIds.push(session.id);

      expect(session.task).toBeNull();
    });
  });

  describe('getSession', () => {
    it('should retrieve an existing session', () => {
      const created = SessionStore.createSession('/test', 'codex', 'debug code');
      createdSessionIds.push(created.id);
      const retrieved = SessionStore.getSession(created.id);

      expect(retrieved).toBeDefined();
      expect(retrieved!.id).toBe(created.id);
      expect(retrieved!.provider).toBe('codex');
      expect(retrieved!.task).toBe('debug code');
    });

    it('should return undefined for non-existent session', () => {
      const result = SessionStore.getSession('non-existent-id');
      expect(result).toBeUndefined();
    });
  });

  describe('updateSessionStatus', () => {
    it('should update session status', () => {
      const session = SessionStore.createSession('/test', 'claude-code', 'task');
      createdSessionIds.push(session.id);
      SessionStore.updateSessionStatus(session.id, 'running');

      const updated = SessionStore.getSession(session.id);
      expect(updated!.status).toBe('running');
    });

    it('should update to completed status', () => {
      const session = SessionStore.createSession('/test', 'claude-code', 'task');
      createdSessionIds.push(session.id);
      SessionStore.updateSessionStatus(session.id, 'completed');

      const updated = SessionStore.getSession(session.id);
      expect(updated!.status).toBe('completed');
    });
  });

  describe('updateSessionPid', () => {
    it('should update session PID', () => {
      const session = SessionStore.createSession('/test', 'claude-code', 'task');
      createdSessionIds.push(session.id);
      SessionStore.updateSessionPid(session.id, 12345);

      const updated = SessionStore.getSession(session.id);
      expect(updated!.pid).toBe(12345);
    });

    it('should clear session PID when passed null', () => {
      const session = SessionStore.createSession('/test', 'claude-code', 'task');
      createdSessionIds.push(session.id);
      SessionStore.updateSessionPid(session.id, 12345);
      SessionStore.updateSessionPid(session.id, null);

      const updated = SessionStore.getSession(session.id);
      expect(updated!.pid).toBeNull();
    });
  });

  describe('updateNativeSessionId', () => {
    it('should update native session ID', () => {
      const session = SessionStore.createSession('/test', 'claude-code', 'task');
      createdSessionIds.push(session.id);
      SessionStore.updateNativeSessionId(session.id, 'native-123');

      const updated = SessionStore.getSession(session.id);
      expect(updated!.nativeSessionId).toBe('native-123');
    });
  });

  describe('listSessions', () => {
    it('should filter by workspacePath', () => {
      const s1 = SessionStore.createSession('/workspace-a-test', 'claude-code', 'task1');
      const s2 = SessionStore.createSession('/workspace-b-test', 'codex', 'task2');
      const s3 = SessionStore.createSession('/workspace-a-test', 'gemini-cli', 'task3');
      createdSessionIds.push(s1.id, s2.id, s3.id);

      const sessions = SessionStore.listSessions({ workspacePath: '/workspace-a-test' });
      expect(sessions.length).toBe(2);
      sessions.forEach(s => expect(s.workspacePath).toBe('/workspace-a-test'));
    });

    it('should filter by status', () => {
      const s1 = SessionStore.createSession('/test-status', 'claude-code', 'task1');
      const s2 = SessionStore.createSession('/test-status', 'codex', 'task2');
      const s3 = SessionStore.createSession('/test-status', 'gemini-cli', 'task3');
      createdSessionIds.push(s1.id, s2.id, s3.id);

      SessionStore.updateSessionStatus(s1.id, 'running');
      SessionStore.updateSessionStatus(s2.id, 'running');

      const sessions = SessionStore.listSessions({ status: 'running', workspacePath: '/test-status' });
      expect(sessions.length).toBe(2);
      sessions.forEach(s => expect(s.status).toBe('running'));
    });

    it('should filter by provider', () => {
      const s1 = SessionStore.createSession('/test-provider', 'claude-code', 'task1');
      const s2 = SessionStore.createSession('/test-provider', 'codex', 'task2');
      const s3 = SessionStore.createSession('/test-provider', 'claude-code', 'task3');
      createdSessionIds.push(s1.id, s2.id, s3.id);

      const sessions = SessionStore.listSessions({ provider: 'claude-code', workspacePath: '/test-provider' });
      expect(sessions.length).toBe(2);
      sessions.forEach(s => expect(s.provider).toBe('claude-code'));
    });
  });

  describe('deleteSession', () => {
    it('should delete a session', () => {
      const session = SessionStore.createSession('/test', 'claude-code', 'task');
      SessionStore.deleteSession(session.id);

      expect(SessionStore.getSession(session.id)).toBeUndefined();
    });
  });

  describe('Session Logs', () => {
    it('should add and retrieve session logs', () => {
      const session = SessionStore.createSession('/test', 'claude-code', 'task');
      createdSessionIds.push(session.id);

      SessionStore.addSessionLog(session.id, 'user', 'Hello');
      SessionStore.addSessionLog(session.id, 'assistant', 'Hi there!');
      SessionStore.addSessionLog(session.id, 'system', 'Processing...');

      const logs = SessionStore.getSessionLogs(session.id);
      expect(logs.length).toBe(3);
      expect(logs[0].role).toBe('user');
      expect(logs[0].content).toBe('Hello');
      expect(logs[1].role).toBe('assistant');
      expect(logs[2].role).toBe('system');
    });
  });

  describe('Session Stats', () => {
    it('should initialize stats when creating session', () => {
      const session = SessionStore.createSession('/test', 'claude-code', 'task');
      createdSessionIds.push(session.id);
      const stats = SessionStore.getSessionStats(session.id);

      expect(stats).toBeDefined();
      expect(stats!.tokensIn).toBe(0);
      expect(stats!.tokensOut).toBe(0);
      expect(stats!.costEstimate).toBe(0);
    });

    it('should update session stats incrementally', () => {
      const session = SessionStore.createSession('/test', 'claude-code', 'task');
      createdSessionIds.push(session.id);

      SessionStore.updateSessionStats(session.id, {
        tokensIn: 1000,
        tokensOut: 500,
        costEstimate: 0.05,
      });

      const stats = SessionStore.getSessionStats(session.id);
      expect(stats!.tokensIn).toBe(1000);
      expect(stats!.tokensOut).toBe(500);
      expect(stats!.costEstimate).toBe(0.05);
    });

    it('should add tokens incrementally', () => {
      const session = SessionStore.createSession('/test', 'claude-code', 'task');
      createdSessionIds.push(session.id);

      SessionStore.updateSessionStats(session.id, { tokensIn: 100 });
      SessionStore.updateSessionStats(session.id, { tokensIn: 50 });

      const stats = SessionStore.getSessionStats(session.id);
      // Tokens are added incrementally
      expect(stats!.tokensIn).toBe(150);
    });

    it('should update filesChanged', () => {
      const session = SessionStore.createSession('/test', 'claude-code', 'task');
      createdSessionIds.push(session.id);

      SessionStore.updateSessionStats(session.id, { filesChanged: 3 });

      const stats = SessionStore.getSessionStats(session.id);
      expect(stats!.filesChanged).toBe(3);
    });
  });
});
