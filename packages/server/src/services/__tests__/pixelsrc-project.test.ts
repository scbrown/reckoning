import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, rm, stat } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { PixelsrcProjectManager } from '../pixelsrc/project.js';

describe('PixelsrcProjectManager', () => {
  let manager: PixelsrcProjectManager;
  let testDataDir: string;

  beforeEach(async () => {
    // Create a unique temp directory for each test
    testDataDir = join(tmpdir(), `pixelsrc-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await mkdir(testDataDir, { recursive: true });
    manager = new PixelsrcProjectManager({ dataDir: testDataDir });
  });

  afterEach(async () => {
    // Clean up temp directory
    await rm(testDataDir, { recursive: true, force: true });
  });

  describe('getProjectPath', () => {
    it('should return the correct project path for a game', () => {
      const gameId = 'game-123';
      const path = manager.getProjectPath(gameId);

      expect(path).toBe(join(testDataDir, 'games', gameId));
    });

    it('should throw for invalid gameId with path traversal', () => {
      expect(() => manager.getProjectPath('../escape')).toThrow('Invalid gameId');
      expect(() => manager.getProjectPath('../../etc/passwd')).toThrow('Invalid gameId');
    });

    it('should throw for empty gameId', () => {
      expect(() => manager.getProjectPath('')).toThrow('Invalid gameId');
    });

    it('should throw for gameId with null bytes', () => {
      expect(() => manager.getProjectPath('game\x00id')).toThrow('Invalid gameId');
    });
  });

  describe('initialize', () => {
    it('should create all required subdirectories', async () => {
      const gameId = 'test-game';
      await manager.initialize(gameId);

      const projectPath = manager.getProjectPath(gameId);
      const expectedDirs = [
        'src/palettes',
        'src/characters',
        'src/npcs',
        'src/scenes',
        'src/effects',
        'src/evolved',
      ];

      for (const dir of expectedDirs) {
        const dirPath = join(projectPath, dir);
        const stats = await stat(dirPath);
        expect(stats.isDirectory()).toBe(true);
      }
    });

    it('should be idempotent - calling initialize twice should work', async () => {
      const gameId = 'test-game';

      await manager.initialize(gameId);
      await manager.initialize(gameId);

      const projectPath = manager.getProjectPath(gameId);
      const stats = await stat(join(projectPath, 'src/characters'));
      expect(stats.isDirectory()).toBe(true);
    });
  });

  describe('writeFile and readFile', () => {
    const gameId = 'test-game';

    beforeEach(async () => {
      await manager.initialize(gameId);
    });

    it('should write and read a file correctly', async () => {
      const content = 'sprite hero {\n  size: 32x32;\n}';
      const relativePath = 'src/characters/hero.pxl';

      await manager.writeFile(gameId, relativePath, content);
      const result = await manager.readFile(gameId, relativePath);

      expect(result).toBe(content);
    });

    it('should create parent directories if they do not exist', async () => {
      const content = 'palette seasonal { colors: [...]; }';
      const relativePath = 'src/palettes/seasons/autumn.pxl';

      await manager.writeFile(gameId, relativePath, content);
      const result = await manager.readFile(gameId, relativePath);

      expect(result).toBe(content);
    });

    it('should overwrite existing files', async () => {
      const relativePath = 'src/characters/hero.pxl';

      await manager.writeFile(gameId, relativePath, 'version 1');
      await manager.writeFile(gameId, relativePath, 'version 2');
      const result = await manager.readFile(gameId, relativePath);

      expect(result).toBe('version 2');
    });

    it('should throw when reading non-existent file', async () => {
      await expect(
        manager.readFile(gameId, 'src/characters/nonexistent.pxl')
      ).rejects.toThrow();
    });

    it('should throw for path traversal attempts in relativePath', async () => {
      await expect(
        manager.writeFile(gameId, '../escape.pxl', 'malicious')
      ).rejects.toThrow('path traversal not allowed');

      await expect(
        manager.writeFile(gameId, 'src/../../../escape.pxl', 'malicious')
      ).rejects.toThrow('path traversal not allowed');
    });

    it('should throw for absolute paths in relativePath', async () => {
      await expect(
        manager.writeFile(gameId, '/etc/passwd', 'malicious')
      ).rejects.toThrow('path traversal not allowed');
    });

    it('should throw for empty relativePath', async () => {
      await expect(
        manager.writeFile(gameId, '', 'content')
      ).rejects.toThrow('Relative path cannot be empty');
    });
  });

  describe('fileExists', () => {
    const gameId = 'test-game';

    beforeEach(async () => {
      await manager.initialize(gameId);
    });

    it('should return true for existing file', async () => {
      const relativePath = 'src/characters/hero.pxl';
      await manager.writeFile(gameId, relativePath, 'content');

      const exists = await manager.fileExists(gameId, relativePath);
      expect(exists).toBe(true);
    });

    it('should return false for non-existent file', async () => {
      const exists = await manager.fileExists(gameId, 'src/characters/missing.pxl');
      expect(exists).toBe(false);
    });

    it('should return false for directories', async () => {
      const exists = await manager.fileExists(gameId, 'src/characters');
      expect(exists).toBe(false);
    });
  });

  describe('deleteProject', () => {
    it('should delete entire project directory', async () => {
      const gameId = 'test-game';
      await manager.initialize(gameId);
      await manager.writeFile(gameId, 'src/characters/hero.pxl', 'content');

      await manager.deleteProject(gameId);

      const exists = await manager.projectExists(gameId);
      expect(exists).toBe(false);
    });

    it('should not throw when deleting non-existent project', async () => {
      await expect(
        manager.deleteProject('nonexistent-game')
      ).resolves.not.toThrow();
    });
  });

  describe('projectExists', () => {
    it('should return true for initialized project', async () => {
      const gameId = 'test-game';
      await manager.initialize(gameId);

      const exists = await manager.projectExists(gameId);
      expect(exists).toBe(true);
    });

    it('should return false for non-existent project', async () => {
      const exists = await manager.projectExists('nonexistent-game');
      expect(exists).toBe(false);
    });
  });

  describe('configuration', () => {
    it('should use custom dataDir from config', () => {
      const customManager = new PixelsrcProjectManager({ dataDir: '/custom/path' });
      const path = customManager.getProjectPath('game-1');

      expect(path).toBe('/custom/path/games/game-1');
    });

    it('should default to ./data when no config provided', () => {
      // Clear env var if set
      const originalEnv = process.env.PIXELSRC_DATA_DIR;
      delete process.env.PIXELSRC_DATA_DIR;

      try {
        const defaultManager = new PixelsrcProjectManager();
        const path = defaultManager.getProjectPath('game-1');

        expect(path).toBe('data/games/game-1');
      } finally {
        if (originalEnv) {
          process.env.PIXELSRC_DATA_DIR = originalEnv;
        }
      }
    });

    it('should respect PIXELSRC_DATA_DIR environment variable', () => {
      const originalEnv = process.env.PIXELSRC_DATA_DIR;
      process.env.PIXELSRC_DATA_DIR = '/env/data/path';

      try {
        const envManager = new PixelsrcProjectManager();
        const path = envManager.getProjectPath('game-1');

        expect(path).toBe('/env/data/path/games/game-1');
      } finally {
        if (originalEnv) {
          process.env.PIXELSRC_DATA_DIR = originalEnv;
        } else {
          delete process.env.PIXELSRC_DATA_DIR;
        }
      }
    });
  });
});
