import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  createWorkspaceFromPath,
  getCurrentWorkspace,
  setCurrentWorkspace,
  getGitDiffStats,
  listWorktrees,
} from '../../src/core/Workspace.js';

describe('Workspace', () => {
  let testDir: string;
  let gitDir: string;

  beforeEach(() => {
    // Create a temporary test directory
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'climux-workspace-test-'));

    // Create a git directory
    gitDir = path.join(testDir, 'git-repo');
    fs.mkdirSync(gitDir);
  });

  afterEach(() => {
    // Clean up test directories
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  describe('createWorkspaceFromPath', () => {
    it('should create workspace object from valid path', () => {
      const workspace = createWorkspaceFromPath(testDir);

      expect(workspace).toBeDefined();
      expect(workspace.path).toBe(testDir);
      expect(workspace.name).toBe(path.basename(testDir));
      // Note: worktrees might be non-empty if temp dir is under a git repo
      expect(Array.isArray(workspace.worktrees)).toBe(true);
    });

    it('should throw error for non-existent path', () => {
      expect(() => createWorkspaceFromPath('/non/existent/path'))
        .toThrow('does not exist');
    });

    it('should throw error for file path', () => {
      const filePath = path.join(testDir, 'file.txt');
      fs.writeFileSync(filePath, 'test');

      expect(() => createWorkspaceFromPath(filePath))
        .toThrow('not a directory');
    });

    it('should detect git root when in a git repository', async () => {
      // Initialize git repo
      const { execa } = await import('execa');
      await execa('git', ['init'], { cwd: gitDir });

      const workspace = createWorkspaceFromPath(gitDir);

      expect(workspace.gitRoot).toBeDefined();
      // Normalize paths for comparison
      const normalizedGitRoot = workspace.gitRoot!.toLowerCase().replace(/\\/g, '/');
      const normalizedGitDir = gitDir.toLowerCase().replace(/\\/g, '/');
      expect(normalizedGitRoot).toBe(normalizedGitDir);
    });

    it('should handle gitRoot consistently (may inherit from parent)', () => {
      const workspace = createWorkspaceFromPath(testDir);
      // gitRoot could be undefined or could be parent git repo - both are valid
      // The key is that the implementation handles it consistently
      if (workspace.gitRoot) {
        expect(typeof workspace.gitRoot).toBe('string');
        expect(workspace.gitRoot.length).toBeGreaterThan(0);
      } else {
        expect(workspace.gitRoot).toBeUndefined();
      }
    });
  });

  describe('getCurrentWorkspace', () => {
    it('should return workspace for current directory', () => {
      const workspace = getCurrentWorkspace();

      expect(workspace).toBeDefined();
      expect(workspace.path).toBe(process.cwd());
    });
  });

  describe('setCurrentWorkspace', () => {
    it('should set and return workspace for given path', () => {
      const workspace = setCurrentWorkspace(testDir);

      expect(workspace.path).toBe(testDir);

      // Verify getCurrentWorkspace returns the same
      const current = getCurrentWorkspace();
      expect(current.path).toBe(testDir);
    });
  });

  describe('listWorktrees', () => {
    it('should return array for workspace', () => {
      const workspace = createWorkspaceFromPath(testDir);
      const worktrees = listWorktrees(workspace);

      // Returns array (may be empty or contain parent worktrees)
      expect(Array.isArray(worktrees)).toBe(true);
    });

    it('should list worktrees for git repository', async () => {
      // Initialize git repo
      const { execa } = await import('execa');
      await execa('git', ['init'], { cwd: gitDir });

      const workspace = createWorkspaceFromPath(gitDir);
      const worktrees = listWorktrees(workspace);

      // Main worktree should be listed
      expect(worktrees.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('getGitDiffStats', () => {
    it('should return stats object', async () => {
      const workspace = createWorkspaceFromPath(testDir);
      const stats = await getGitDiffStats(workspace);

      // Should return an object with the expected shape
      expect(stats).toBeDefined();
      expect(typeof stats.filesChanged).toBe('number');
      expect(typeof stats.linesAdded).toBe('number');
      expect(typeof stats.linesRemoved).toBe('number');
    });

    it('should return zero stats for clean repo', async () => {
      // Initialize git repo
      const { execa } = await import('execa');
      await execa('git', ['init'], { cwd: gitDir });
      await execa('git', ['config', 'user.email', 'test@test.com'], { cwd: gitDir });
      await execa('git', ['config', 'user.name', 'Test User'], { cwd: gitDir });

      // Initial commit
      fs.writeFileSync(path.join(gitDir, 'test.txt'), 'test');
      await execa('git', ['add', '.'], { cwd: gitDir });
      await execa('git', ['commit', '-m', 'initial'], { cwd: gitDir });

      const workspace = createWorkspaceFromPath(gitDir);
      const stats = await getGitDiffStats(workspace);

      expect(stats.filesChanged).toBe(0);
      expect(stats.linesAdded).toBe(0);
      expect(stats.linesRemoved).toBe(0);
    });

    it('should return stats for modified files', async () => {
      // Initialize git repo
      const { execa } = await import('execa');
      await execa('git', ['init'], { cwd: gitDir });
      await execa('git', ['config', 'user.email', 'test@test.com'], { cwd: gitDir });
      await execa('git', ['config', 'user.name', 'Test User'], { cwd: gitDir });

      // Initial commit
      fs.writeFileSync(path.join(gitDir, 'test.txt'), 'line1\nline2\n');
      await execa('git', ['add', '.'], { cwd: gitDir });
      await execa('git', ['commit', '-m', 'initial'], { cwd: gitDir });

      // Modify file
      fs.writeFileSync(path.join(gitDir, 'test.txt'), 'line1\nmodified line2\nnew line3\n');

      const workspace = createWorkspaceFromPath(gitDir);
      const stats = await getGitDiffStats(workspace);

      expect(stats.filesChanged).toBeGreaterThan(0);
    });
  });
});
