import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import type { AIProvider } from '../../ai/types.js';
import type { BroadcastManager } from '../../sse/index.js';
import { GameEngine } from '../index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('GameEngine Integration', () => {
  let db: Database.Database;
  let mockAIProvider: AIProvider;
  let mockBroadcaster: BroadcastManager;
  let engine: GameEngine;

  beforeEach(() => {
    // Create in-memory database
    db = new Database(':memory:');

    // Run migrations
    const schemaPath = join(__dirname, '../../../db/schema.sql');
    const schema = readFileSync(schemaPath, 'utf-8');
    db.exec(schema);

    // Seed with test data - default-area is already in schema.sql, so use OR REPLACE
    db.exec(`
      INSERT OR REPLACE INTO areas (id, name, description, tags)
      VALUES ('default-area', 'Town Square', 'A bustling town square.', '["town", "start"]');

      INSERT OR REPLACE INTO areas (id, name, description, tags)
      VALUES ('area-1', 'Tavern', 'A cozy tavern.', '["town", "building"]');

      INSERT OR REPLACE INTO area_exits (area_id, direction, target_area_id, description)
      VALUES ('default-area', 'north', 'area-1', 'To the tavern');
    `);

    // Mock AI provider
    mockAIProvider = {
      name: 'test-provider',
      execute: vi.fn().mockResolvedValue({
        ok: true,
        value: {
          content: 'The adventurer steps into the town square.',
          durationMs: 100,
        },
      }),
      isAvailable: vi.fn().mockResolvedValue(true),
    };

    // Mock broadcaster
    mockBroadcaster = {
      broadcast: vi.fn(),
      subscribe: vi.fn(),
      unsubscribe: vi.fn(),
      send: vi.fn(),
      getClientCount: vi.fn().mockReturnValue(0),
      startHeartbeat: vi.fn(),
      stopHeartbeat: vi.fn(),
      cleanup: vi.fn(),
      cleanupAll: vi.fn(),
      getStats: vi.fn(),
    } as unknown as BroadcastManager;

    // Create engine
    engine = new GameEngine({
      db,
      aiProvider: mockAIProvider,
      broadcaster: mockBroadcaster,
    });
  });

  afterEach(() => {
    db.close();
    vi.clearAllMocks();
  });

  describe('full generate → submit flow', () => {
    it('should complete the full flow: start → generate → accept', async () => {
      // 1. Start a new game
      const game = await engine.startGame('Test Player');
      expect(game.id).toBeDefined();
      expect(game.turn).toBe(0);

      // 2. Generate content
      await engine.generateNext(game.id);

      // Verify generation_started was broadcast
      expect(mockBroadcaster.broadcast).toHaveBeenCalledWith(
        game.id,
        expect.objectContaining({ type: 'generation_started' })
      );

      // Verify generation_complete was broadcast
      expect(mockBroadcaster.broadcast).toHaveBeenCalledWith(
        game.id,
        expect.objectContaining({
          type: 'generation_complete',
          content: 'The adventurer steps into the town square.',
        })
      );

      // 3. Get pending content
      const pending = engine.getPendingContent(game.id);
      expect(pending).not.toBeNull();
      expect(pending?.content).toBe('The adventurer steps into the town square.');

      // 4. Accept the content
      const event = await engine.submit(game.id, { type: 'ACCEPT' });
      expect(event).not.toBeNull();
      expect(event?.content).toBe('The adventurer steps into the town square.');
      expect(event?.eventType).toBe('narration');

      // 5. Verify pending content is cleared
      const pendingAfter = engine.getPendingContent(game.id);
      expect(pendingAfter).toBeNull();

      // 6. Verify editor state is idle
      const editorState = engine.getEditorState(game.id);
      expect(editorState.status).toBe('idle');
    });

    it('should handle edit action', async () => {
      const game = await engine.startGame('Test Player');
      await engine.generateNext(game.id);

      const editedContent = 'The brave adventurer enters the square.';
      const event = await engine.submit(game.id, {
        type: 'EDIT',
        content: editedContent,
      });

      expect(event?.content).toBe(editedContent);
      expect(event?.originalGenerated).toBe('The adventurer steps into the town square.');
    });

    it('should handle regenerate action', async () => {
      const game = await engine.startGame('Test Player');
      await engine.generateNext(game.id);

      // Mock different response for regeneration
      (mockAIProvider.execute as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        value: {
          content: 'A new adventure begins in the town square.',
          durationMs: 100,
        },
      });

      await engine.submit(game.id, {
        type: 'REGENERATE',
        guidance: 'Make it more dramatic',
      });

      const pending = engine.getPendingContent(game.id);
      expect(pending?.content).toBe('A new adventure begins in the town square.');
    });

    it('should handle inject action', async () => {
      const game = await engine.startGame('Test Player');

      const event = await engine.submit(game.id, {
        type: 'INJECT',
        content: 'The DM narrates: A storm is approaching.',
        eventType: 'dm_injection',
      });

      expect(event?.content).toBe('The DM narrates: A storm is approaching.');
      expect(event?.eventType).toBe('dm_injection');
    });
  });

  describe('playback modes', () => {
    it('should auto-advance in auto mode', async () => {
      const game = await engine.startGame('Test Player');
      await engine.setPlaybackMode(game.id, 'auto');

      // Accept should trigger another generation
      await engine.generateNext(game.id);
      await engine.submit(game.id, { type: 'ACCEPT' });

      // Should have generated twice (initial + auto-advance)
      expect(mockAIProvider.execute).toHaveBeenCalledTimes(2);
    });

    it('should not auto-advance in paused mode', async () => {
      const game = await engine.startGame('Test Player');
      await engine.setPlaybackMode(game.id, 'paused');

      await engine.generateNext(game.id);
      await engine.submit(game.id, { type: 'ACCEPT' });

      // Should have generated only once
      expect(mockAIProvider.execute).toHaveBeenCalledTimes(1);
    });
  });

  describe('load game', () => {
    it('should load existing game', async () => {
      const game = await engine.startGame('Test Player');

      const loaded = await engine.loadGame(game.id);

      expect(loaded).not.toBeNull();
      expect(loaded?.id).toBe(game.id);
    });

    it('should return null for non-existent game', async () => {
      const loaded = await engine.loadGame('non-existent-id');

      expect(loaded).toBeNull();
    });
  });

  describe('error handling', () => {
    it('should handle AI generation errors gracefully', async () => {
      const game = await engine.startGame('Test Player');

      (mockAIProvider.execute as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: false,
        error: {
          code: 'TIMEOUT',
          message: 'Request timed out',
          retryable: true,
        },
      });

      await engine.generateNext(game.id);

      // Should broadcast error
      expect(mockBroadcaster.broadcast).toHaveBeenCalledWith(
        game.id,
        expect.objectContaining({
          type: 'generation_error',
          error: 'Request timed out',
        })
      );

      // Editor state should be idle
      const editorState = engine.getEditorState(game.id);
      expect(editorState.status).toBe('idle');
    });

    it('should throw on submit with no pending content', async () => {
      const game = await engine.startGame('Test Player');

      // Don't generate any content, just try to accept
      await expect(engine.submit(game.id, { type: 'ACCEPT' })).rejects.toThrow(
        'No content to accept'
      );
    });

    it('should throw on submit to non-existent game', async () => {
      await expect(
        engine.submit('non-existent', { type: 'ACCEPT' })
      ).rejects.toThrow('Game not found');
    });
  });
});
