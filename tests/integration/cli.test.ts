import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execa } from 'execa';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('CLI Integration', () => {
  const projectRoot = path.resolve(__dirname, '../..');
  const cliPath = path.join(projectRoot, 'dist', 'cli', 'index.js');
  let testDir: string;

  beforeAll(() => {
    // Ensure built
    expect(fs.existsSync(cliPath)).toBe(true);

    // Create test workspace
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'climux-cli-test-'));
  });

  afterAll(() => {
    // Clean up (ignore errors on Windows due to file locking)
    try {
      fs.rmSync(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors - temp dir will be cleaned by OS
    }
  });

  describe('--help', () => {
    it('should display help message', async () => {
      // Commander.js may exit with code 1 for --help, so use reject: false
      const result = await execa('node', [cliPath, '--help'], { reject: false });

      // Help output may be in stdout or stderr depending on commander version
      const output = result.stdout + result.stderr;
      expect(output).toContain('climux');
      expect(output).toContain('run');
      expect(output).toContain('session');
      expect(output).toContain('workspace');
      expect(output).toContain('config');
    });
  });

  describe('--version', () => {
    it('should display version', async () => {
      // Commander.js may exit with code 1 for --version, so use reject: false
      const result = await execa('node', [cliPath, '--version'], { reject: false });

      const output = result.stdout + result.stderr;
      expect(output).toMatch(/\d+\.\d+\.\d+/);
    });
  });

  describe('config command', () => {
    it('should show current config', async () => {
      const result = await execa('node', [cliPath, 'config', 'show'], {
        cwd: testDir,
        reject: false,
      });

      // Check for expected config output sections
      expect(result.stdout).toContain('Configuration');
      expect(result.stdout).toContain('Default Provider');
    });

    it('should show available providers', async () => {
      const result = await execa('node', [cliPath, 'config', 'show', '--providers'], {
        cwd: testDir,
        reject: false,
        timeout: 30000,
      });

      // Check that the provider status table is shown
      const output = result.stdout.toLowerCase();
      expect(output).toContain('provider');
      expect(output).toContain('command');
      expect(output).toContain('status');
      expect(output).toContain('capabilities');
    }, 35000);
  });

  describe('workspace command', () => {
    it('should show current workspace info', async () => {
      const result = await execa('node', [cliPath, 'workspace', 'info'], {
        cwd: testDir,
      });

      expect(result.stdout).toContain('Workspace');
      expect(result.stdout).toContain(path.basename(testDir));
    });
  });

  describe('session command', () => {
    it('should list sessions (empty initially)', async () => {
      const result = await execa('node', [cliPath, 'session', 'list'], {
        cwd: testDir,
        reject: false,
      });

      // Should either show empty list or no sessions message
      expect(result.exitCode).toBe(0);
    });
  });

  describe('status command', () => {
    it('should show status without errors', async () => {
      const result = await execa('node', [cliPath, 'status'], {
        cwd: testDir,
        reject: false,
      });

      expect(result.exitCode).toBe(0);
    });
  });

  describe('stats command', () => {
    it('should show stats without errors', async () => {
      const result = await execa('node', [cliPath, 'stats'], {
        cwd: testDir,
        reject: false,
      });

      expect(result.exitCode).toBe(0);
    });
  });
});
