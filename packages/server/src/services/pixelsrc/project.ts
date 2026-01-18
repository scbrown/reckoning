import { mkdir, readFile, writeFile, rm, stat } from 'fs/promises';
import { join, normalize, dirname } from 'path';

/**
 * Subdirectories created for each pixelsrc project.
 * These follow pixelsrc conventions for organizing different asset types.
 */
const PROJECT_SUBDIRS = [
  'src/palettes',
  'src/characters',
  'src/npcs',
  'src/scenes',
  'src/effects',
  'src/evolved',
] as const;

/**
 * Validates a path component to prevent directory traversal attacks.
 * Rejects paths containing '..' or absolute path indicators.
 */
function isPathComponentSafe(component: string): boolean {
  if (!component || component.includes('..')) {
    return false;
  }
  if (component.startsWith('/') || component.startsWith('\\')) {
    return false;
  }
  // Reject control characters and null bytes
  if (/[\x00-\x1f]/.test(component)) {
    return false;
  }
  return true;
}

/**
 * Validates a relative path for safety.
 * Normalizes the path and ensures it doesn't escape the project directory.
 */
function validateRelativePath(relativePath: string): string {
  if (!relativePath) {
    throw new Error('Relative path cannot be empty');
  }

  const normalized = normalize(relativePath);

  // Check that normalized path doesn't start with '..' or '/'
  if (normalized.startsWith('..') || normalized.startsWith('/') || normalized.startsWith('\\')) {
    throw new Error(`Invalid path: ${relativePath} - path traversal not allowed`);
  }

  // Split and validate each component
  const parts = normalized.split(/[/\\]/);
  for (const part of parts) {
    if (part && !isPathComponentSafe(part)) {
      throw new Error(`Invalid path component: ${part}`);
    }
  }

  return normalized;
}

export interface PixelsrcProjectManagerConfig {
  /** Base data directory. Defaults to './data' */
  dataDir?: string;
}

/**
 * Manages pixelsrc project directories for game instances.
 *
 * Each game has its own pixelsrc project directory containing:
 * - src/palettes/: Color palette definitions
 * - src/characters/: Player character sprites
 * - src/npcs/: NPC sprites
 * - src/scenes/: Scene backgrounds
 * - src/effects/: Visual effects
 * - src/evolved/: Art history/evolution archives
 *
 * @example
 * ```typescript
 * const manager = new PixelsrcProjectManager();
 *
 * // Initialize project for a new game
 * await manager.initialize('game-123');
 *
 * // Write a character sprite
 * await manager.writeFile('game-123', 'src/characters/hero.pxl', spriteSource);
 *
 * // Read it back
 * const source = await manager.readFile('game-123', 'src/characters/hero.pxl');
 * ```
 */
export class PixelsrcProjectManager {
  private dataDir: string;

  constructor(config: PixelsrcProjectManagerConfig = {}) {
    this.dataDir = config.dataDir || process.env.PIXELSRC_DATA_DIR || './data';
  }

  /**
   * Get the root path for a game's pixelsrc project.
   *
   * @param gameId - The game identifier
   * @returns Absolute path to the game's pixelsrc project directory
   * @throws If gameId is invalid
   */
  getProjectPath(gameId: string): string {
    if (!isPathComponentSafe(gameId)) {
      throw new Error(`Invalid gameId: ${gameId}`);
    }
    return join(this.dataDir, 'games', gameId);
  }

  /**
   * Initialize the pixelsrc project directory structure for a game.
   * Creates all required subdirectories.
   *
   * @param gameId - The game identifier
   * @throws If gameId is invalid or directory creation fails
   */
  async initialize(gameId: string): Promise<void> {
    const projectPath = this.getProjectPath(gameId);

    // Create all subdirectories
    await Promise.all(
      PROJECT_SUBDIRS.map(subdir =>
        mkdir(join(projectPath, subdir), { recursive: true })
      )
    );
  }

  /**
   * Write a file to the game's pixelsrc project.
   * Creates parent directories if they don't exist.
   *
   * @param gameId - The game identifier
   * @param relativePath - Path relative to project root (e.g., 'src/characters/hero.pxl')
   * @param content - File content to write
   * @throws If gameId or relativePath is invalid
   */
  async writeFile(gameId: string, relativePath: string, content: string): Promise<void> {
    const projectPath = this.getProjectPath(gameId);
    const safePath = validateRelativePath(relativePath);
    const fullPath = join(projectPath, safePath);

    // Ensure parent directory exists
    await mkdir(dirname(fullPath), { recursive: true });

    await writeFile(fullPath, content, 'utf-8');
  }

  /**
   * Read a file from the game's pixelsrc project.
   *
   * @param gameId - The game identifier
   * @param relativePath - Path relative to project root (e.g., 'src/characters/hero.pxl')
   * @returns File content as string
   * @throws If gameId or relativePath is invalid, or file doesn't exist
   */
  async readFile(gameId: string, relativePath: string): Promise<string> {
    const projectPath = this.getProjectPath(gameId);
    const safePath = validateRelativePath(relativePath);
    const fullPath = join(projectPath, safePath);

    return await readFile(fullPath, 'utf-8');
  }

  /**
   * Check if a file exists in the game's pixelsrc project.
   *
   * @param gameId - The game identifier
   * @param relativePath - Path relative to project root
   * @returns true if file exists, false otherwise
   */
  async fileExists(gameId: string, relativePath: string): Promise<boolean> {
    try {
      const projectPath = this.getProjectPath(gameId);
      const safePath = validateRelativePath(relativePath);
      const fullPath = join(projectPath, safePath);

      const stats = await stat(fullPath);
      return stats.isFile();
    } catch {
      return false;
    }
  }

  /**
   * Delete a game's entire pixelsrc project directory.
   * Use with caution - this removes all pixelsrc assets for the game.
   *
   * @param gameId - The game identifier
   * @throws If gameId is invalid
   */
  async deleteProject(gameId: string): Promise<void> {
    const projectPath = this.getProjectPath(gameId);

    await rm(projectPath, { recursive: true, force: true });
  }

  /**
   * Check if a project exists for a game.
   *
   * @param gameId - The game identifier
   * @returns true if project directory exists
   */
  async projectExists(gameId: string): Promise<boolean> {
    try {
      const projectPath = this.getProjectPath(gameId);
      const stats = await stat(projectPath);
      return stats.isDirectory();
    } catch {
      return false;
    }
  }
}
