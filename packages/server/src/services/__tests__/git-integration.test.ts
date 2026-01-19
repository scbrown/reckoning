import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, writeFileSync, existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';
import { tmpdir } from 'os';
import { randomUUID } from 'crypto';

import { GitIntegrationService } from '../export/git-integration.js';
import type { GitIntegrationOptions } from '../export/types.js';

/**
 * Create a unique temporary directory for each test
 */
function createTempDir(): string {
  const tempDir = join(tmpdir(), `git-integration-test-${randomUUID()}`);
  mkdirSync(tempDir, { recursive: true });
  return tempDir;
}

/**
 * Clean up a temporary directory
 */
function cleanupTempDir(path: string): void {
  if (existsSync(path)) {
    rmSync(path, { recursive: true, force: true });
  }
}

/**
 * Check if git is available in the environment
 */
function isGitAvailable(): boolean {
  try {
    execSync('git --version', { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

describe('GitIntegrationService', () => {
  let service: GitIntegrationService;
  let tempDir: string;

  beforeEach(() => {
    service = new GitIntegrationService({
      defaultAuthorName: 'Test Author',
      defaultAuthorEmail: 'test@example.com',
    });
    tempDir = createTempDir();
  });

  afterEach(() => {
    cleanupTempDir(tempDir);
  });

  // Skip all tests if git is not available
  const describeWithGit = isGitAvailable() ? describe : describe.skip;

  describeWithGit('integrate', () => {
    it('should initialize a new git repository', async () => {
      // Create a file in the temp directory
      writeFileSync(join(tempDir, 'test.txt'), 'Hello, World!');

      const result = await service.integrate({
        exportPath: tempDir,
        commit: true,
        commitMessage: 'Initial commit',
      });

      expect(result.success).toBe(true);
      expect(result.initialized).toBe(true);
      expect(result.repoPath).toBe(tempDir);
      expect(result.commitHash).toBeDefined();
      expect(result.commitMessage).toBe('Initial commit');

      // Verify .git directory exists
      expect(existsSync(join(tempDir, '.git'))).toBe(true);
    });

    it('should not reinitialize an existing repository', async () => {
      // First, initialize the repo
      execSync('git init', { cwd: tempDir, stdio: 'pipe' });
      writeFileSync(join(tempDir, 'test.txt'), 'Hello, World!');

      const result = await service.integrate({
        exportPath: tempDir,
        commit: true,
        commitMessage: 'Test commit',
      });

      expect(result.success).toBe(true);
      expect(result.initialized).toBe(false);
    });

    it('should create a commit with the specified message', async () => {
      writeFileSync(join(tempDir, 'game.toml'), '[game]\nname = "Test"');

      const result = await service.integrate({
        exportPath: tempDir,
        commit: true,
        commitMessage: 'Export game state',
      });

      expect(result.success).toBe(true);
      expect(result.commitMessage).toBe('Export game state');

      // Verify the commit message in git log
      const logOutput = execSync('git log -1 --format=%s', { cwd: tempDir, encoding: 'utf-8' });
      expect(logOutput.trim()).toBe('Export game state');
    });

    it('should use custom author name and email', async () => {
      writeFileSync(join(tempDir, 'test.txt'), 'Test content');

      await service.integrate({
        exportPath: tempDir,
        commit: true,
        commitMessage: 'Test commit',
        authorName: 'Custom Author',
        authorEmail: 'custom@example.com',
      });

      // Verify the author in git log
      const authorOutput = execSync('git log -1 --format=%an', { cwd: tempDir, encoding: 'utf-8' });
      expect(authorOutput.trim()).toBe('Custom Author');

      const emailOutput = execSync('git log -1 --format=%ae', { cwd: tempDir, encoding: 'utf-8' });
      expect(emailOutput.trim()).toBe('custom@example.com');
    });

    it('should skip commit when commit option is false', async () => {
      writeFileSync(join(tempDir, 'test.txt'), 'Test content');

      const result = await service.integrate({
        exportPath: tempDir,
        commit: false,
      });

      expect(result.success).toBe(true);
      expect(result.initialized).toBe(true);
      expect(result.commitHash).toBeUndefined();
    });

    it('should handle non-existent export path', async () => {
      const nonExistentPath = join(tempDir, 'non-existent');

      const result = await service.integrate({
        exportPath: nonExistentPath,
        commit: true,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('does not exist');
    });

    it('should generate a default commit message for initial export', async () => {
      writeFileSync(join(tempDir, 'test.txt'), 'Test content');

      const result = await service.integrate({
        exportPath: tempDir,
        commit: true,
      });

      expect(result.success).toBe(true);
      expect(result.commitMessage).toContain('Initial export');
    });

    it('should generate a default commit message for subsequent exports', async () => {
      // Initialize and make first commit
      execSync('git init', { cwd: tempDir, stdio: 'pipe' });
      writeFileSync(join(tempDir, 'test.txt'), 'Initial content');
      execSync('git add -A', { cwd: tempDir, stdio: 'pipe' });
      execSync('git commit -m "Initial commit"', { cwd: tempDir, stdio: 'pipe', env: { ...process.env, GIT_AUTHOR_NAME: 'Test', GIT_AUTHOR_EMAIL: 'test@test.com', GIT_COMMITTER_NAME: 'Test', GIT_COMMITTER_EMAIL: 'test@test.com' } });

      // Make a change
      writeFileSync(join(tempDir, 'test.txt'), 'Updated content');

      const result = await service.integrate({
        exportPath: tempDir,
        commit: true,
      });

      expect(result.success).toBe(true);
      expect(result.commitMessage).toContain('Export update');
    });

    it('should create .gitignore when initializing', async () => {
      writeFileSync(join(tempDir, 'test.txt'), 'Test content');

      await service.integrate({
        exportPath: tempDir,
        commit: true,
      });

      const gitignorePath = join(tempDir, '.gitignore');
      expect(existsSync(gitignorePath)).toBe(true);

      const content = readFileSync(gitignorePath, 'utf-8');
      expect(content).toContain('.DS_Store');
      expect(content).toContain('Thumbs.db');
    });

    it('should not overwrite existing .gitignore', async () => {
      const customGitignore = '*.custom\n';
      writeFileSync(join(tempDir, '.gitignore'), customGitignore);
      writeFileSync(join(tempDir, 'test.txt'), 'Test content');

      await service.integrate({
        exportPath: tempDir,
        commit: true,
      });

      const content = readFileSync(join(tempDir, '.gitignore'), 'utf-8');
      expect(content).toBe(customGitignore);
    });

    it('should track number of files changed', async () => {
      writeFileSync(join(tempDir, 'file1.txt'), 'Content 1');
      writeFileSync(join(tempDir, 'file2.txt'), 'Content 2');
      writeFileSync(join(tempDir, 'file3.txt'), 'Content 3');

      const result = await service.integrate({
        exportPath: tempDir,
        commit: true,
        commitMessage: 'Add three files',
      });

      expect(result.success).toBe(true);
      // Files changed includes the .gitignore that gets created
      expect(result.filesChanged).toBeGreaterThanOrEqual(3);
    });
  });

  describeWithGit('getStatus', () => {
    it('should return isRepo: false for non-git directory', async () => {
      const status = await service.getStatus(tempDir);

      expect(status.isRepo).toBe(false);
      expect(status.hasChanges).toBe(false);
      expect(status.branch).toBeNull();
      expect(status.lastCommit).toBeNull();
    });

    it('should return correct status for git repo with no changes', async () => {
      // Initialize and commit
      execSync('git init', { cwd: tempDir, stdio: 'pipe' });
      writeFileSync(join(tempDir, 'test.txt'), 'Content');
      execSync('git add -A', { cwd: tempDir, stdio: 'pipe' });
      execSync('git commit -m "Initial"', { cwd: tempDir, stdio: 'pipe', env: { ...process.env, GIT_AUTHOR_NAME: 'Test', GIT_AUTHOR_EMAIL: 'test@test.com', GIT_COMMITTER_NAME: 'Test', GIT_COMMITTER_EMAIL: 'test@test.com' } });

      const status = await service.getStatus(tempDir);

      expect(status.isRepo).toBe(true);
      expect(status.hasChanges).toBe(false);
      expect(status.branch).toBeDefined();
      expect(status.lastCommit).toBeDefined();
    });

    it('should detect uncommitted changes', async () => {
      // Initialize and commit
      execSync('git init', { cwd: tempDir, stdio: 'pipe' });
      writeFileSync(join(tempDir, 'test.txt'), 'Content');
      execSync('git add -A', { cwd: tempDir, stdio: 'pipe' });
      execSync('git commit -m "Initial"', { cwd: tempDir, stdio: 'pipe', env: { ...process.env, GIT_AUTHOR_NAME: 'Test', GIT_AUTHOR_EMAIL: 'test@test.com', GIT_COMMITTER_NAME: 'Test', GIT_COMMITTER_EMAIL: 'test@test.com' } });

      // Make an uncommitted change
      writeFileSync(join(tempDir, 'test.txt'), 'Modified content');

      const status = await service.getStatus(tempDir);

      expect(status.hasChanges).toBe(true);
    });

    it('should return empty status for non-existent path', async () => {
      const status = await service.getStatus(join(tempDir, 'non-existent'));

      expect(status.isRepo).toBe(false);
    });
  });

  describe('validateOAuthConfig', () => {
    it('should validate github provider', () => {
      const result = service.validateOAuthConfig('github', 'client-id');
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should validate gitlab provider', () => {
      const result = service.validateOAuthConfig('gitlab', 'client-id');
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should validate custom provider', () => {
      const result = service.validateOAuthConfig('custom');
      expect(result.valid).toBe(true);
    });

    it('should reject unknown provider', () => {
      const result = service.validateOAuthConfig('unknown');
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Unknown OAuth provider: unknown');
    });

    it('should require client ID for github', () => {
      const result = service.validateOAuthConfig('github');
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Client ID is required for github OAuth');
    });

    it('should require client ID for gitlab', () => {
      const result = service.validateOAuthConfig('gitlab');
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Client ID is required for gitlab OAuth');
    });
  });

  describe('getOAuthAuthorizeUrl', () => {
    it('should generate GitHub OAuth URL', () => {
      const url = service.getOAuthAuthorizeUrl(
        'github',
        'my-client-id',
        'https://example.com/callback'
      );

      expect(url).toContain('https://github.com/login/oauth/authorize');
      expect(url).toContain('client_id=my-client-id');
      expect(url).toContain('redirect_uri=');
      expect(url).toContain('scope=repo');
    });

    it('should generate GitLab OAuth URL', () => {
      const url = service.getOAuthAuthorizeUrl(
        'gitlab',
        'my-client-id',
        'https://example.com/callback'
      );

      expect(url).toContain('https://gitlab.com/oauth/authorize');
      expect(url).toContain('client_id=my-client-id');
      expect(url).toContain('response_type=code');
      expect(url).toContain('scope=write_repository');
    });

    it('should use custom scopes when provided', () => {
      const url = service.getOAuthAuthorizeUrl(
        'github',
        'my-client-id',
        'https://example.com/callback',
        ['repo', 'user']
      );

      expect(url).toContain('scope=repo+user');
    });
  });

  describeWithGit('remote configuration', () => {
    it('should configure a new remote', async () => {
      // Initialize repo
      execSync('git init', { cwd: tempDir, stdio: 'pipe' });
      writeFileSync(join(tempDir, 'test.txt'), 'Content');
      execSync('git add -A', { cwd: tempDir, stdio: 'pipe' });
      execSync('git commit -m "Initial"', { cwd: tempDir, stdio: 'pipe', env: { ...process.env, GIT_AUTHOR_NAME: 'Test', GIT_AUTHOR_EMAIL: 'test@test.com', GIT_COMMITTER_NAME: 'Test', GIT_COMMITTER_EMAIL: 'test@test.com' } });

      // We can't actually push without a real remote, but we can test configuration
      const result = await service.integrate({
        exportPath: tempDir,
        commit: false,
        push: false,
        remote: {
          url: 'https://github.com/test/repo.git',
        },
      });

      expect(result.success).toBe(true);

      // Verify remote was configured
      const remoteOutput = execSync('git remote -v', { cwd: tempDir, encoding: 'utf-8' });
      expect(remoteOutput).toContain('https://github.com/test/repo.git');
    });

    it('should update an existing remote URL', async () => {
      // Initialize repo with a remote
      execSync('git init', { cwd: tempDir, stdio: 'pipe' });
      execSync('git remote add origin https://github.com/old/repo.git', { cwd: tempDir, stdio: 'pipe' });

      writeFileSync(join(tempDir, 'test.txt'), 'Content');

      await service.integrate({
        exportPath: tempDir,
        commit: true,
        commitMessage: 'Test',
        push: false,
        remote: {
          url: 'https://github.com/new/repo.git',
        },
      });

      // Verify remote was updated
      const remoteOutput = execSync('git remote get-url origin', { cwd: tempDir, encoding: 'utf-8' });
      expect(remoteOutput.trim()).toBe('https://github.com/new/repo.git');
    });
  });

  describeWithGit('edge cases', () => {
    it('should handle empty directory (only .gitignore created)', async () => {
      const result = await service.integrate({
        exportPath: tempDir,
        commit: true,
        commitMessage: 'Empty export',
      });

      expect(result.success).toBe(true);
      expect(result.initialized).toBe(true);
      // Should still commit because .gitignore was created
      expect(result.commitHash).toBeDefined();
    });

    it('should handle commit message with special characters', async () => {
      writeFileSync(join(tempDir, 'test.txt'), 'Content');

      const result = await service.integrate({
        exportPath: tempDir,
        commit: true,
        commitMessage: 'Test with "quotes" and \'apostrophes\'',
      });

      expect(result.success).toBe(true);
    });

    it('should handle multiple integrations on same directory', async () => {
      writeFileSync(join(tempDir, 'file1.txt'), 'Content 1');

      const result1 = await service.integrate({
        exportPath: tempDir,
        commit: true,
        commitMessage: 'First commit',
      });

      expect(result1.success).toBe(true);
      expect(result1.initialized).toBe(true);

      // Add another file
      writeFileSync(join(tempDir, 'file2.txt'), 'Content 2');

      const result2 = await service.integrate({
        exportPath: tempDir,
        commit: true,
        commitMessage: 'Second commit',
      });

      expect(result2.success).toBe(true);
      expect(result2.initialized).toBe(false);

      // Verify we have two commits
      const logOutput = execSync('git log --oneline', { cwd: tempDir, encoding: 'utf-8' });
      const commits = logOutput.trim().split('\n');
      expect(commits.length).toBe(2);
    });
  });
});
