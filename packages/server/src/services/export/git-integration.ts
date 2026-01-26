/**
 * Git Integration Service
 *
 * Provides Git version control integration for game exports.
 * Supports initializing repos, committing changes, and pushing to remotes.
 *
 * @see docs/export-format-specification.md
 */

import { execSync, type ExecSyncOptions } from 'child_process';
import { existsSync, writeFileSync } from 'fs';
import { join } from 'path';
import type {
  GitIntegrationOptions,
  GitIntegrationResult,
  GitRemoteConfig,
} from './types.js';

/**
 * Configuration for GitIntegrationService
 */
export interface GitIntegrationConfig {
  /** Default author name for commits */
  defaultAuthorName?: string;
  /** Default author email for commits */
  defaultAuthorEmail?: string;
}

/**
 * Git Integration Service
 *
 * Provides optional Git version control for exports:
 * - Initialize git repo for new export directories
 * - Commit changes with customizable messages
 * - Push to remote repositories (GitHub, GitLab, or custom)
 * - OAuth-based authentication for remotes
 */
export class GitIntegrationService {
  private defaultAuthorName: string;
  private defaultAuthorEmail: string;

  constructor(config: GitIntegrationConfig = {}) {
    this.defaultAuthorName = config.defaultAuthorName || 'Reckoning Export';
    this.defaultAuthorEmail = config.defaultAuthorEmail || 'export@reckoning.local';
  }

  /**
   * Execute a git command in the specified directory
   */
  private execGit(command: string, cwd: string, env?: Record<string, string>): string {
    const options: ExecSyncOptions = {
      cwd,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, ...env },
    };

    try {
      return execSync(`git ${command}`, options).toString().trim();
    } catch (error) {
      const execError = error as { stderr?: Buffer | string; message?: string };
      const stderr = execError.stderr?.toString() || execError.message || 'Unknown git error';
      throw new Error(`Git command failed: ${stderr}`);
    }
  }

  /**
   * Check if a directory is a git repository
   */
  private isGitRepo(path: string): boolean {
    try {
      this.execGit('rev-parse --git-dir', path);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Initialize a git repository in the specified directory
   */
  private initRepo(path: string): void {
    this.execGit('init', path);

    // Create a .gitignore for common patterns
    const gitignorePath = join(path, '.gitignore');
    if (!existsSync(gitignorePath)) {
      const gitignoreContent = [
        '# OS files',
        '.DS_Store',
        'Thumbs.db',
        '',
        '# Editor files',
        '*.swp',
        '*.swo',
        '*~',
        '.idea/',
        '.vscode/',
        '',
        '# Temporary files',
        '*.tmp',
        '*.bak',
        '',
      ].join('\n');

      writeFileSync(gitignorePath, gitignoreContent);
    }
  }

  /**
   * Stage all changes in the repository
   */
  private stageAll(path: string): number {
    this.execGit('add -A', path);

    // Get the number of staged files
    try {
      const status = this.execGit('diff --cached --numstat', path);
      if (!status) return 0;
      return status.split('\n').filter(line => line.trim()).length;
    } catch {
      return 0;
    }
  }

  /**
   * Check if there are any changes to commit
   */
  private hasChanges(path: string): boolean {
    try {
      const status = this.execGit('status --porcelain', path);
      return status.length > 0;
    } catch {
      return false;
    }
  }

  /**
   * Create a commit with the specified message
   */
  private commit(
    path: string,
    message: string,
    authorName: string,
    authorEmail: string
  ): string {
    // Set author for this commit
    const env = {
      GIT_AUTHOR_NAME: authorName,
      GIT_AUTHOR_EMAIL: authorEmail,
      GIT_COMMITTER_NAME: authorName,
      GIT_COMMITTER_EMAIL: authorEmail,
    };

    // Create the commit
    this.execGit(`commit -m "${message.replace(/"/g, '\\"')}"`, path, env);

    // Get the commit hash
    return this.execGit('rev-parse HEAD', path);
  }

  /**
   * Configure a remote for the repository
   */
  private configureRemote(path: string, remote: GitRemoteConfig): void {
    const remoteName = remote.name || 'origin';

    // Check if remote already exists
    try {
      const existingUrl = this.execGit(`remote get-url ${remoteName}`, path);
      if (existingUrl !== remote.url) {
        // Update the remote URL
        this.execGit(`remote set-url ${remoteName} ${remote.url}`, path);
      }
    } catch {
      // Remote doesn't exist, add it
      this.execGit(`remote add ${remoteName} ${remote.url}`, path);
    }
  }

  /**
   * Build the remote URL with authentication if OAuth is configured
   */
  private buildAuthenticatedUrl(remote: GitRemoteConfig): string {
    if (!remote.oauth?.accessToken) {
      return remote.url;
    }

    // Parse the URL to inject the token
    const url = new URL(remote.url.replace(/\.git$/, '') + '.git');

    if (remote.oauth.provider === 'github') {
      // GitHub uses token as username with empty password
      url.username = remote.oauth.accessToken;
      url.password = '';
    } else if (remote.oauth.provider === 'gitlab') {
      // GitLab uses oauth2 as username with token as password
      url.username = 'oauth2';
      url.password = remote.oauth.accessToken;
    } else {
      // Custom provider - use token as password with 'git' username
      url.username = 'git';
      url.password = remote.oauth.accessToken;
    }

    return url.toString();
  }

  /**
   * Push to the configured remote
   */
  private push(path: string, remote: GitRemoteConfig): void {
    const remoteName = remote.name || 'origin';

    // Get the current branch name
    let branch: string;
    try {
      branch = this.execGit('rev-parse --abbrev-ref HEAD', path);
    } catch {
      branch = 'main';
    }

    // If OAuth is configured, use the authenticated URL for this push
    if (remote.oauth?.accessToken) {
      const authUrl = this.buildAuthenticatedUrl(remote);
      // Push directly to the authenticated URL
      this.execGit(`push ${authUrl} ${branch}`, path);
    } else {
      // Push to the named remote
      this.execGit(`push -u ${remoteName} ${branch}`, path);
    }
  }

  /**
   * Perform Git integration for an export directory
   *
   * @param options - Git integration options
   * @returns Result of the operation
   */
  async integrate(options: GitIntegrationOptions): Promise<GitIntegrationResult> {
    const {
      exportPath,
      commit = true,
      commitMessage,
      push = false,
      remote,
      authorName = this.defaultAuthorName,
      authorEmail = this.defaultAuthorEmail,
      initialCommit = true,
    } = options;

    const result: GitIntegrationResult = {
      success: false,
      repoPath: exportPath,
      initialized: false,
      pushed: false,
    };

    try {
      // Check if directory exists
      if (!existsSync(exportPath)) {
        throw new Error(`Export path does not exist: ${exportPath}`);
      }

      // Initialize repo if needed
      if (!this.isGitRepo(exportPath)) {
        this.initRepo(exportPath);
        result.initialized = true;
      }

      // Stage and commit if requested
      if (commit) {
        // Stage all changes
        const filesChanged = this.stageAll(exportPath);
        result.filesChanged = filesChanged;

        // Check if there are changes to commit
        if (this.hasChanges(exportPath) || (result.initialized && initialCommit)) {
          // Determine commit message
          const message = commitMessage || this.generateCommitMessage(result.initialized);

          // Create the commit
          const commitHash = this.commit(exportPath, message, authorName, authorEmail);
          result.commitHash = commitHash;
          result.commitMessage = message;
        }
      }

      // Configure remote if provided
      if (remote) {
        this.configureRemote(exportPath, remote);
        result.remoteUrl = remote.url;

        // Push to remote if requested
        if (push) {
          this.push(exportPath, remote);
          result.pushed = true;
        }
      }

      result.success = true;
    } catch (error) {
      result.success = false;
      result.error = error instanceof Error ? error.message : 'Unknown error';
    }

    return result;
  }

  /**
   * Generate a default commit message
   */
  private generateCommitMessage(isInitial: boolean): string {
    const timestamp = new Date().toISOString();

    if (isInitial) {
      return `Initial export - ${timestamp}`;
    }

    return `Export update - ${timestamp}`;
  }

  /**
   * Get the status of a git repository
   */
  async getStatus(exportPath: string): Promise<{
    isRepo: boolean;
    hasChanges: boolean;
    branch: string | null;
    lastCommit: string | null;
    remotes: Array<{ name: string; url: string }>;
  }> {
    const status = {
      isRepo: false,
      hasChanges: false,
      branch: null as string | null,
      lastCommit: null as string | null,
      remotes: [] as Array<{ name: string; url: string }>,
    };

    if (!existsSync(exportPath)) {
      return status;
    }

    if (!this.isGitRepo(exportPath)) {
      return status;
    }

    status.isRepo = true;
    status.hasChanges = this.hasChanges(exportPath);

    // Get current branch
    try {
      status.branch = this.execGit('rev-parse --abbrev-ref HEAD', exportPath);
    } catch {
      status.branch = null;
    }

    // Get last commit
    try {
      status.lastCommit = this.execGit('log -1 --format=%H', exportPath);
    } catch {
      status.lastCommit = null;
    }

    // Get remotes
    try {
      const remotesOutput = this.execGit('remote -v', exportPath);
      const remoteLines = remotesOutput.split('\n').filter(line => line.includes('(push)'));
      status.remotes = remoteLines.map(line => {
        const [name, url] = line.split('\t');
        return { name, url: url.replace(' (push)', '') };
      });
    } catch {
      status.remotes = [];
    }

    return status;
  }

  /**
   * Validate OAuth configuration for a provider
   */
  validateOAuthConfig(provider: string, clientId?: string): {
    valid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];

    if (!['github', 'gitlab', 'custom'].includes(provider)) {
      errors.push(`Unknown OAuth provider: ${provider}`);
    }

    if ((provider === 'github' || provider === 'gitlab') && !clientId) {
      errors.push(`Client ID is required for ${provider} OAuth`);
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Generate OAuth authorization URL for a provider
   * Note: This is a helper for the frontend - actual OAuth flow happens client-side
   */
  getOAuthAuthorizeUrl(
    provider: 'github' | 'gitlab',
    clientId: string,
    redirectUri: string,
    scopes: string[] = []
  ): string {
    const defaultScopes = {
      github: ['repo'],
      gitlab: ['write_repository'],
    };

    const finalScopes = scopes.length > 0 ? scopes : defaultScopes[provider];

    if (provider === 'github') {
      const params = new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        scope: finalScopes.join(' '),
      });
      return `https://github.com/login/oauth/authorize?${params}`;
    }

    if (provider === 'gitlab') {
      const params = new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        response_type: 'code',
        scope: finalScopes.join(' '),
      });
      return `https://gitlab.com/oauth/authorize?${params}`;
    }

    throw new Error(`Unknown provider: ${provider}`);
  }
}
