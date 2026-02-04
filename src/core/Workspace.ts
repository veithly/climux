/**
 * Workspace Manager
 * Handles workspace detection, switching, and git worktree integration
 */

import { existsSync, statSync } from 'fs';
import { resolve, basename, dirname } from 'path';
import { execa, execaSync } from 'execa';
import type { Workspace, WorkspaceAlias } from '../types/index.js';
import { query, run, get } from '../utils/db.js';

/**
 * Current workspace (defaults to cwd)
 */
let currentWorkspace: Workspace | null = null;

/**
 * Get the current working directory as workspace
 */
export function getCurrentWorkspace(): Workspace {
  if (currentWorkspace) {
    return currentWorkspace;
  }

  const cwd = process.cwd();
  return createWorkspaceFromPath(cwd);
}

/**
 * Create a Workspace object from a path
 */
export function createWorkspaceFromPath(path: string): Workspace {
  const absolutePath = resolve(path);

  if (!existsSync(absolutePath)) {
    throw new Error(`Workspace path does not exist: ${absolutePath}`);
  }

  const stats = statSync(absolutePath);
  if (!stats.isDirectory()) {
    throw new Error(`Workspace path is not a directory: ${absolutePath}`);
  }

  const workspace: Workspace = {
    path: absolutePath,
    name: basename(absolutePath),
    worktrees: [],
  };

  // Try to detect git root
  try {
    const gitRoot = getGitRoot(absolutePath);
    if (gitRoot) {
      workspace.gitRoot = gitRoot;
      workspace.worktrees = getGitWorktrees(gitRoot);
    }
  } catch {
    // Not a git repository, that's fine
  }

  return workspace;
}

/**
 * Set the current workspace
 */
export function setCurrentWorkspace(path: string): Workspace {
  currentWorkspace = createWorkspaceFromPath(path);
  return currentWorkspace;
}

/**
 * Get git repository root
 */
function getGitRoot(path: string): string | null {
  try {
    const result = execaSync('git', ['rev-parse', '--show-toplevel'], {
      cwd: path,
      reject: false,
    });
    if (result.exitCode === 0) {
      return result.stdout.trim();
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Get list of git worktrees
 */
function getGitWorktrees(gitRoot: string): string[] {
  try {
    const result = execaSync('git', ['worktree', 'list', '--porcelain'], {
      cwd: gitRoot,
      reject: false,
    });
    if (result.exitCode !== 0) {
      return [];
    }

    const worktrees: string[] = [];
    const lines = result.stdout.split('\n');
    for (const line of lines) {
      if (line.startsWith('worktree ')) {
        worktrees.push(line.substring(9));
      }
    }
    return worktrees;
  } catch {
    return [];
  }
}

/**
 * Create a new git worktree
 */
export async function createWorktree(
  name: string,
  branch?: string,
  workspace?: Workspace
): Promise<string> {
  const ws = workspace || getCurrentWorkspace();

  if (!ws.gitRoot) {
    throw new Error('Current workspace is not a git repository');
  }

  const worktreePath = resolve(dirname(ws.gitRoot), name);
  const targetBranch = branch || name;

  // Check if worktree already exists
  if (existsSync(worktreePath)) {
    throw new Error(`Worktree path already exists: ${worktreePath}`);
  }

  // Create branch if it doesn't exist
  try {
    await execa('git', ['branch', targetBranch], { cwd: ws.gitRoot });
  } catch {
    // Branch might already exist, that's fine
  }

  // Create worktree
  await execa('git', ['worktree', 'add', worktreePath, targetBranch], {
    cwd: ws.gitRoot,
  });

  return worktreePath;
}

/**
 * Remove a git worktree
 */
export async function removeWorktree(
  name: string,
  workspace?: Workspace
): Promise<void> {
  const ws = workspace || getCurrentWorkspace();

  if (!ws.gitRoot) {
    throw new Error('Current workspace is not a git repository');
  }

  const worktreePath = resolve(dirname(ws.gitRoot), name);

  // Remove worktree
  await execa('git', ['worktree', 'remove', worktreePath], {
    cwd: ws.gitRoot,
  });
}

/**
 * List all worktrees
 */
export function listWorktrees(workspace?: Workspace): string[] {
  const ws = workspace || getCurrentWorkspace();

  if (!ws.gitRoot) {
    return [];
  }

  return getGitWorktrees(ws.gitRoot);
}

/**
 * Save workspace alias
 */
export function saveAlias(name: string, path: string): void {
  const absolutePath = resolve(path);

  if (!existsSync(absolutePath)) {
    throw new Error(`Path does not exist: ${absolutePath}`);
  }

  run(
    `INSERT OR REPLACE INTO workspace_aliases (name, path) VALUES (?, ?)`,
    [name, absolutePath]
  );
}

/**
 * Get workspace alias
 */
export function getAlias(name: string): string | undefined {
  const result = get<{ path: string }>(
    `SELECT path FROM workspace_aliases WHERE name = ?`,
    [name]
  );
  return result?.path;
}

/**
 * List all aliases
 */
export function listAliases(): WorkspaceAlias[] {
  return query<WorkspaceAlias>(
    `SELECT name, path FROM workspace_aliases ORDER BY name`
  );
}

/**
 * Remove workspace alias
 */
export function removeAlias(name: string): void {
  run(`DELETE FROM workspace_aliases WHERE name = ?`, [name]);
}

/**
 * Resolve workspace path (handles aliases with @ prefix)
 */
export function resolveWorkspacePath(pathOrAlias: string): string {
  if (pathOrAlias.startsWith('@')) {
    const aliasName = pathOrAlias.substring(1);
    const aliasPath = getAlias(aliasName);
    if (!aliasPath) {
      throw new Error(`Unknown workspace alias: ${aliasName}`);
    }
    return aliasPath;
  }
  return resolve(pathOrAlias);
}

/**
 * Get git diff stats for the workspace
 */
export async function getGitDiffStats(workspace?: Workspace): Promise<{
  filesChanged: number;
  linesAdded: number;
  linesRemoved: number;
}> {
  const ws = workspace || getCurrentWorkspace();

  if (!ws.gitRoot) {
    return { filesChanged: 0, linesAdded: 0, linesRemoved: 0 };
  }

  try {
    const result = await execa('git', ['diff', '--stat'], {
      cwd: ws.path,
    });

    const output = result.stdout;
    const stats = { filesChanged: 0, linesAdded: 0, linesRemoved: 0 };

    // Parse git diff --stat output
    // Example: " 3 files changed, 10 insertions(+), 5 deletions(-)"
    const summaryMatch = output.match(
      /(\d+)\s+files?\s+changed(?:,\s+(\d+)\s+insertions?\(\+\))?(?:,\s+(\d+)\s+deletions?\(-\))?/
    );

    if (summaryMatch) {
      stats.filesChanged = parseInt(summaryMatch[1], 10) || 0;
      stats.linesAdded = parseInt(summaryMatch[2], 10) || 0;
      stats.linesRemoved = parseInt(summaryMatch[3], 10) || 0;
    }

    return stats;
  } catch {
    return { filesChanged: 0, linesAdded: 0, linesRemoved: 0 };
  }
}
