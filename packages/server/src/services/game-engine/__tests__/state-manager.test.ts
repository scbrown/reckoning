import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Database } from 'better-sqlite3';
import type { BroadcastManager } from '../../sse/index.js';
import { StateManager } from '../state-manager.js';

// Mock the repositories
vi.mock('../../../db/repositories/index.js', () => ({
  GameRepository: vi.fn().mockImplementation(() => ({
    findById: vi.fn(),
    incrementTurn: vi.fn(),
  })),
  EventRepository: vi.fn().mockImplementation(() => ({
    create: vi.fn(),
  })),
  EditorStateRepository: vi.fn().mockImplementation(() => ({
    get: vi.fn(),
    set: vi.fn(),
    clear: vi.fn(),
  })),
}));

describe('StateManager', () => {
  let stateManager: StateManager;
  let mockDb: Database;
  let mockBroadcaster: BroadcastManager;
  let mockGameRepo: {
    findById: ReturnType<typeof vi.fn>;
    incrementTurn: ReturnType<typeof vi.fn>;
  };
  let mockEventRepo: {
    create: ReturnType<typeof vi.fn>;
  };
  let mockEditorRepo: {
    get: ReturnType<typeof vi.fn>;
    set: ReturnType<typeof vi.fn>;
    clear: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    // Reset all mocks
    vi.clearAllMocks();

    // Get mocked constructors
    const { GameRepository, EventRepository, EditorStateRepository } = await import(
      '../../../db/repositories/index.js'
    );

    // Create mock instances
    mockGameRepo = {
      findById: vi.fn(),
      incrementTurn: vi.fn(),
    };
    mockEventRepo = {
      create: vi.fn(),
    };
    mockEditorRepo = {
      get: vi.fn(),
      set: vi.fn(),
      clear: vi.fn(),
    };

    // Configure constructors to return our mocks
    (GameRepository as ReturnType<typeof vi.fn>).mockImplementation(() => mockGameRepo);
    (EventRepository as ReturnType<typeof vi.fn>).mockImplementation(() => mockEventRepo);
    (EditorStateRepository as ReturnType<typeof vi.fn>).mockImplementation(() => mockEditorRepo);

    mockDb = {} as Database;
    mockBroadcaster = {
      broadcast: vi.fn(),
    } as unknown as BroadcastManager;

    stateManager = new StateManager(mockDb, mockBroadcaster);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('commitEvent', () => {
    it('should create event and broadcast state change', () => {
      const eventData = {
        gameId: 'game-123',
        turn: 1,
        eventType: 'narration' as const,
        content: 'A mysterious fog descends.',
        locationId: 'area-1',
        witnesses: [],
      };

      const createdEvent = {
        id: 'event-456',
        timestamp: '2026-01-10T12:00:00Z',
        ...eventData,
      };

      mockEventRepo.create.mockReturnValue(createdEvent);
      mockGameRepo.findById.mockReturnValue({
        id: 'game-123',
        playerId: 'player-1',
        currentAreaId: 'area-1',
        turn: 1,
      });

      const result = stateManager.commitEvent('game-123', eventData);

      expect(mockEventRepo.create).toHaveBeenCalledWith(eventData);
      expect(result).toEqual(createdEvent);
      expect(mockBroadcaster.broadcast).toHaveBeenCalledWith(
        'game-123',
        expect.objectContaining({
          type: 'state_changed',
          state: expect.objectContaining({
            id: 'game-123',
          }),
        })
      );
    });

    it('should not broadcast if game not found', () => {
      const eventData = {
        gameId: 'game-123',
        turn: 1,
        eventType: 'narration' as const,
        content: 'Test',
        locationId: 'area-1',
        witnesses: [],
      };

      mockEventRepo.create.mockReturnValue({
        id: 'event-1',
        timestamp: '2026-01-10T12:00:00Z',
        ...eventData,
      });
      mockGameRepo.findById.mockReturnValue(null);

      stateManager.commitEvent('game-123', eventData);

      expect(mockBroadcaster.broadcast).not.toHaveBeenCalled();
    });
  });

  describe('updateEditorState', () => {
    it('should save state and broadcast', () => {
      const state = {
        pending: 'Some content',
        editedContent: null,
        status: 'editing' as const,
      };

      stateManager.updateEditorState('game-123', state);

      expect(mockEditorRepo.set).toHaveBeenCalledWith('game-123', state);
      expect(mockBroadcaster.broadcast).toHaveBeenCalledWith(
        'game-123',
        expect.objectContaining({
          type: 'editor_state',
          editorState: expect.objectContaining({
            pending: true,
            status: 'editing',
          }),
        })
      );
    });

    it('should convert generating status to regenerating for SSE', () => {
      const state = {
        pending: null,
        editedContent: null,
        status: 'generating' as const,
      };

      stateManager.updateEditorState('game-123', state);

      expect(mockBroadcaster.broadcast).toHaveBeenCalledWith(
        'game-123',
        expect.objectContaining({
          type: 'editor_state',
          editorState: expect.objectContaining({
            status: 'regenerating',
          }),
        })
      );
    });
  });

  describe('getEditorState', () => {
    it('should return editor state from repository', () => {
      const state = {
        pending: 'Content',
        editedContent: null,
        status: 'editing' as const,
      };
      mockEditorRepo.get.mockReturnValue(state);

      const result = stateManager.getEditorState('game-123');

      expect(result).toEqual(state);
    });

    it('should return default state if none exists', () => {
      mockEditorRepo.get.mockReturnValue(null);

      const result = stateManager.getEditorState('game-123');

      expect(result).toEqual({
        pending: null,
        editedContent: null,
        status: 'idle',
      });
    });
  });

  describe('clearEditorState', () => {
    it('should clear state and broadcast idle state', () => {
      stateManager.clearEditorState('game-123');

      expect(mockEditorRepo.clear).toHaveBeenCalledWith('game-123');
      expect(mockBroadcaster.broadcast).toHaveBeenCalledWith(
        'game-123',
        expect.objectContaining({
          type: 'editor_state',
          editorState: {
            pending: false,
            editedContent: null,
            status: 'idle',
          },
        })
      );
    });
  });

  describe('incrementTurn', () => {
    it('should increment turn and broadcast', () => {
      mockGameRepo.incrementTurn.mockReturnValue(2);
      mockGameRepo.findById.mockReturnValue({
        id: 'game-123',
        playerId: 'player-1',
        currentAreaId: 'area-1',
        turn: 2,
      });

      const result = stateManager.incrementTurn('game-123');

      expect(result).toBe(2);
      expect(mockBroadcaster.broadcast).toHaveBeenCalledWith(
        'game-123',
        expect.objectContaining({
          type: 'state_changed',
          state: expect.objectContaining({
            turn: 2,
          }),
        })
      );
    });
  });

  describe('getGameState', () => {
    it('should return game state from repository', () => {
      const gameState = {
        id: 'game-123',
        playerId: 'player-1',
        currentAreaId: 'area-1',
        turn: 5,
        createdAt: '2026-01-10T12:00:00Z',
        updatedAt: '2026-01-10T13:00:00Z',
      };
      mockGameRepo.findById.mockReturnValue(gameState);

      const result = stateManager.getGameState('game-123');

      expect(result).toEqual(gameState);
    });

    it('should return null if game not found', () => {
      mockGameRepo.findById.mockReturnValue(null);

      const result = stateManager.getGameState('game-123');

      expect(result).toBeNull();
    });
  });

  describe('broadcastStateChange', () => {
    it('should broadcast state change event', () => {
      const gameState = {
        id: 'game-123',
        playerId: 'player-1',
        currentAreaId: 'area-1',
        turn: 3,
        createdAt: '2026-01-10T12:00:00Z',
        updatedAt: '2026-01-10T13:00:00Z',
      };

      stateManager.broadcastStateChange('game-123', gameState);

      expect(mockBroadcaster.broadcast).toHaveBeenCalledWith(
        'game-123',
        expect.objectContaining({
          type: 'state_changed',
          state: {
            id: 'game-123',
            playerId: 'player-1',
            currentAreaId: 'area-1',
            turn: 3,
          },
        })
      );
    });
  });
});
