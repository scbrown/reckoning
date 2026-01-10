import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GameStateManager } from '../game-state.js';
import { createInitialState } from '../types.js';
import type { ClientGameState } from '../types.js';
import type { SSEService } from '../../services/sse/index.js';
import type { GameService } from '../../services/game/index.js';
import type {
  GameSession,
  DMEditorState,
  CanonicalEvent,
} from '@reckoning/shared';

// =============================================================================
// Mock Factories
// =============================================================================

function createMockSession(): GameSession {
  return {
    state: {
      id: 'game-123',
      playerId: 'player-1',
      currentAreaId: 'area-1',
      turn: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    player: {
      id: 'char-1',
      name: 'Test Player',
      description: 'A test character',
      class: 'warrior',
      stats: { health: 100, maxHealth: 100 },
    },
    currentArea: {
      id: 'area-1',
      name: 'Test Area',
      description: 'A test area',
      exits: [],
      objects: [],
      npcs: [],
      tags: [],
    },
    recentEvents: [],
  };
}

function createMockEditorState(): DMEditorState {
  return {
    pending: null,
    editedContent: null,
    status: 'idle',
  };
}

function createMockEvent(): CanonicalEvent {
  return {
    id: 'event-1',
    gameId: 'game-123',
    turn: 1,
    timestamp: new Date().toISOString(),
    eventType: 'narration',
    content: 'Something happened.',
    locationId: 'area-1',
    witnesses: [],
  };
}

type SSEHandler = (event: unknown) => void;

function createMockSSEService(): SSEService {
  const handlers: Map<string, Set<SSEHandler>> = new Map();

  return {
    connect: vi.fn(),
    disconnect: vi.fn(),
    isConnected: vi.fn().mockReturnValue(true),
    getGameId: vi.fn().mockReturnValue('game-123'),
    getConnectionState: vi.fn().mockReturnValue('connected'),
    on: vi.fn((eventType: string, handler: SSEHandler) => {
      if (!handlers.has(eventType)) {
        handlers.set(eventType, new Set());
      }
      handlers.get(eventType)!.add(handler);
      return () => {
        handlers.get(eventType)?.delete(handler);
      };
    }),
    off: vi.fn(),
    offAll: vi.fn(),
    // Helper for tests to emit events
    _emit: (eventType: string, event: unknown) => {
      const eventHandlers = handlers.get(eventType);
      if (eventHandlers) {
        eventHandlers.forEach((handler) => handler(event));
      }
    },
  } as unknown as SSEService & { _emit: (type: string, event: unknown) => void };
}

function createMockGameService(): GameService {
  return {
    getGameId: vi.fn().mockReturnValue('game-123'),
    newGame: vi.fn().mockResolvedValue(createMockSession()),
    getSession: vi.fn().mockResolvedValue({
      session: createMockSession(),
      editorState: createMockEditorState(),
    }),
    listSaves: vi.fn().mockResolvedValue([]),
    saveGame: vi.fn().mockResolvedValue({
      id: 'save-1',
      gameId: 'game-123',
      name: 'Save 1',
      createdAt: new Date().toISOString(),
      turn: 1,
      location: 'Test Area',
    }),
    loadGame: vi.fn().mockResolvedValue(createMockSession()),
    getPending: vi.fn().mockResolvedValue({
      pending: null,
      editorState: createMockEditorState(),
    }),
    updateEditor: vi.fn().mockResolvedValue(createMockEditorState()),
    submit: vi.fn().mockResolvedValue({
      event: createMockEvent(),
      session: createMockSession(),
    }),
    regenerate: vi.fn().mockResolvedValue(undefined),
    inject: vi.fn().mockResolvedValue({
      event: createMockEvent(),
      session: createMockSession(),
    }),
    next: vi.fn().mockResolvedValue(undefined),
    setPlaybackMode: vi.fn().mockResolvedValue('paused'),
    getStatus: vi.fn().mockResolvedValue({
      system: {
        ai: { status: 'ok' },
        tts: { status: 'ok', queueLength: 0 },
        db: { status: 'ok' },
      },
      observation: {
        turn: 1,
        totalEvents: 0,
        eventsThisTurn: 0,
        currentLocation: 'Test Area',
        partySize: 1,
        npcsPresent: 0,
        sessionDuration: 0,
      },
    }),
  } as unknown as GameService;
}

// =============================================================================
// Tests
// =============================================================================

describe('GameStateManager', () => {
  let sseService: SSEService & { _emit: (type: string, event: unknown) => void };
  let gameService: GameService;
  let manager: GameStateManager;

  beforeEach(() => {
    sseService = createMockSSEService() as SSEService & {
      _emit: (type: string, event: unknown) => void;
    };
    gameService = createMockGameService();
    manager = new GameStateManager(sseService, gameService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('initial state', () => {
    it('should start with initial state', () => {
      const state = manager.getState();
      expect(state.connected).toBe(false);
      expect(state.gameId).toBeNull();
      expect(state.session).toBeNull();
      expect(state.isLoading).toBe(false);
      expect(state.error).toBeNull();
      expect(state.narrativeHistory).toEqual([]);
    });
  });

  describe('subscribe', () => {
    it('should notify listeners on state change', async () => {
      const listener = vi.fn();
      manager.subscribe(listener);

      await manager.startNewGame('Test Player');

      expect(listener).toHaveBeenCalled();
      const lastCall = listener.mock.calls[listener.mock.calls.length - 1][0];
      expect(lastCall.gameId).toBe('game-123');
    });

    it('should return unsubscribe function', async () => {
      const listener = vi.fn();
      const unsubscribe = manager.subscribe(listener);

      unsubscribe();
      await manager.startNewGame('Test Player');

      // Listener should not be called after unsubscribe
      // (it may have been called before unsubscribe during setup)
      const callsAfterUnsubscribe = listener.mock.calls.filter(
        (call: [ClientGameState]) => call[0].gameId === 'game-123'
      );
      expect(callsAfterUnsubscribe.length).toBe(0);
    });

    it('should handle listener errors gracefully', async () => {
      const errorListener = vi.fn().mockImplementation(() => {
        throw new Error('Listener error');
      });
      const normalListener = vi.fn();

      manager.subscribe(errorListener);
      manager.subscribe(normalListener);

      // Should not throw
      await expect(manager.startNewGame('Test Player')).resolves.not.toThrow();

      // Normal listener should still be called
      expect(normalListener).toHaveBeenCalled();
    });
  });

  describe('startNewGame', () => {
    it('should create a new game and update state', async () => {
      await manager.startNewGame('Test Player', 'A brave hero');

      expect(gameService.newGame).toHaveBeenCalledWith(
        'Test Player',
        'A brave hero'
      );

      const state = manager.getState();
      expect(state.gameId).toBe('game-123');
      expect(state.session).not.toBeNull();
      expect(state.connected).toBe(true);
      expect(state.isLoading).toBe(false);
    });

    it('should connect to SSE stream', async () => {
      await manager.startNewGame('Test Player');

      expect(sseService.connect).toHaveBeenCalledWith('game-123');
    });

    it('should set loading state during operation', async () => {
      const states: boolean[] = [];
      manager.subscribe((state) => states.push(state.isLoading));

      await manager.startNewGame('Test Player');

      // Should have been true at some point
      expect(states).toContain(true);
      // Should end with false
      expect(states[states.length - 1]).toBe(false);
    });

    it('should handle errors', async () => {
      vi.mocked(gameService.newGame).mockRejectedValueOnce(
        new Error('Network error')
      );

      await expect(manager.startNewGame('Test Player')).rejects.toThrow(
        'Network error'
      );

      const state = manager.getState();
      expect(state.error).toBe('Network error');
      expect(state.isLoading).toBe(false);
    });
  });

  describe('initGame', () => {
    it('should load existing game and update state', async () => {
      await manager.initGame('game-123');

      expect(gameService.getSession).toHaveBeenCalledWith('game-123');
      expect(gameService.getPending).toHaveBeenCalledWith('game-123');
      expect(gameService.getStatus).toHaveBeenCalledWith('game-123');

      const state = manager.getState();
      expect(state.gameId).toBe('game-123');
      expect(state.session).not.toBeNull();
      expect(state.connected).toBe(true);
    });

    it('should connect to SSE stream', async () => {
      await manager.initGame('game-123');

      expect(sseService.connect).toHaveBeenCalledWith('game-123');
    });
  });

  describe('loadSavedGame', () => {
    it('should throw if no game ID is set', async () => {
      await expect(manager.loadSavedGame('save-1')).rejects.toThrow(
        'No game ID available'
      );
    });

    it('should load saved game when game ID is set', async () => {
      // First start a game
      await manager.startNewGame('Test Player');

      // Then load a save
      await manager.loadSavedGame('save-1');

      expect(gameService.loadGame).toHaveBeenCalledWith('game-123', 'save-1');

      const state = manager.getState();
      expect(state.narrativeHistory).toEqual([]);
    });
  });

  describe('clearGame', () => {
    it('should reset state and disconnect', async () => {
      await manager.startNewGame('Test Player');

      manager.clearGame();

      expect(sseService.disconnect).toHaveBeenCalled();

      const state = manager.getState();
      expect(state.connected).toBe(false);
      expect(state.gameId).toBeNull();
      expect(state.session).toBeNull();
    });
  });

  describe('submitContent', () => {
    it('should submit action and update state', async () => {
      await manager.startNewGame('Test Player');
      await manager.submitContent({ type: 'ACCEPT' });

      expect(gameService.submit).toHaveBeenCalledWith('game-123', {
        type: 'ACCEPT',
      });

      const state = manager.getState();
      expect(state.pendingContent).toBeNull();
      expect(state.narrativeHistory).toHaveLength(1);
    });

    it('should throw if no game ID is set', async () => {
      await expect(manager.submitContent({ type: 'ACCEPT' })).rejects.toThrow(
        'No game ID available'
      );
    });
  });

  describe('regenerateContent', () => {
    it('should request regeneration', async () => {
      await manager.startNewGame('Test Player');
      await manager.regenerateContent('Make it more dramatic');

      expect(gameService.regenerate).toHaveBeenCalledWith(
        'game-123',
        'Make it more dramatic'
      );
    });

    it('should set editor status to generating', async () => {
      await manager.startNewGame('Test Player');

      const states: string[] = [];
      manager.subscribe((state) => {
        if (state.editorState?.status) {
          states.push(state.editorState.status);
        }
      });

      await manager.regenerateContent();

      expect(states).toContain('generating');
    });
  });

  describe('injectContent', () => {
    it('should inject content and add to narrative history', async () => {
      await manager.startNewGame('Test Player');
      await manager.injectContent('A dragon appears!', 'narration');

      expect(gameService.inject).toHaveBeenCalledWith(
        'game-123',
        'A dragon appears!',
        'narration',
        undefined
      );

      const state = manager.getState();
      expect(state.narrativeHistory).toHaveLength(1);
    });

    it('should pass speaker for dialogue', async () => {
      await manager.startNewGame('Test Player');
      await manager.injectContent('Hello!', 'npc_dialogue', 'Guard');

      expect(gameService.inject).toHaveBeenCalledWith(
        'game-123',
        'Hello!',
        'npc_dialogue',
        'Guard'
      );
    });
  });

  describe('triggerNext', () => {
    it('should trigger next generation', async () => {
      await manager.startNewGame('Test Player');
      await manager.triggerNext({ type: 'narration' });

      expect(gameService.next).toHaveBeenCalledWith('game-123', {
        type: 'narration',
      });
    });
  });

  describe('setPlaybackMode', () => {
    it('should set playback mode', async () => {
      await manager.startNewGame('Test Player');
      await manager.setPlaybackMode('paused');

      expect(gameService.setPlaybackMode).toHaveBeenCalledWith(
        'game-123',
        'paused'
      );
    });
  });

  describe('saveGame', () => {
    it('should save the game', async () => {
      await manager.startNewGame('Test Player');
      await manager.saveGame('My Save');

      expect(gameService.saveGame).toHaveBeenCalledWith('game-123', 'My Save');
    });
  });

  describe('updateEditorContent', () => {
    it('should update editor content locally and on server', async () => {
      await manager.startNewGame('Test Player');
      await manager.updateEditorContent('New content');

      expect(gameService.updateEditor).toHaveBeenCalledWith('game-123', {
        editedContent: 'New content',
        status: 'editing',
      });
    });

    it('should update local state immediately', async () => {
      await manager.startNewGame('Test Player');

      // Make updateEditor hang to check local state is updated first
      let resolveUpdate: () => void;
      vi.mocked(gameService.updateEditor).mockImplementation(
        () =>
          new Promise((resolve) => {
            resolveUpdate = () => resolve(createMockEditorState());
          })
      );

      const updatePromise = manager.updateEditorContent('New content');

      // Check state before server responds
      const state = manager.getState();
      expect(state.editorState?.editedContent).toBe('New content');

      // Resolve the server call
      resolveUpdate!();
      await updatePromise;
    });
  });

  describe('SSE event handling', () => {
    beforeEach(async () => {
      await manager.startNewGame('Test Player');
    });

    describe('generation_started', () => {
      it('should set loading state', () => {
        sseService._emit('generation_started', {
          type: 'generation_started',
          generationId: 'gen-1',
          timestamp: new Date().toISOString(),
        });

        const state = manager.getState();
        expect(state.isLoading).toBe(true);
      });
    });

    describe('generation_complete', () => {
      it('should update pending content and editor state', () => {
        sseService._emit('generation_complete', {
          type: 'generation_complete',
          generationId: 'gen-1',
          content: 'Generated content',
          timestamp: new Date().toISOString(),
        });

        const state = manager.getState();
        expect(state.isLoading).toBe(false);
        expect(state.pendingContent).not.toBeNull();
        expect(state.pendingContent?.content).toBe('Generated content');
        expect(state.editorState?.status).toBe('editing');
        expect(state.editorState?.pending).toBe('Generated content');
      });
    });

    describe('generation_error', () => {
      it('should set error state', () => {
        sseService._emit('generation_error', {
          type: 'generation_error',
          generationId: 'gen-1',
          error: 'Generation failed',
          retryable: true,
          timestamp: new Date().toISOString(),
        });

        const state = manager.getState();
        expect(state.isLoading).toBe(false);
        expect(state.error).toBe('Generation failed');
      });

      it('should update AI status to error', () => {
        // First set up system status
        manager['updateState']({
          systemStatus: {
            ai: { status: 'ok' },
            tts: { status: 'ok', queueLength: 0 },
            db: { status: 'ok' },
          },
        });

        sseService._emit('generation_error', {
          type: 'generation_error',
          generationId: 'gen-1',
          error: 'Generation failed',
          retryable: true,
          timestamp: new Date().toISOString(),
        });

        const state = manager.getState();
        expect(state.systemStatus?.ai.status).toBe('error');
        expect(state.systemStatus?.ai.errorMessage).toBe('Generation failed');
      });
    });

    describe('state_changed', () => {
      it('should update session state', () => {
        sseService._emit('state_changed', {
          type: 'state_changed',
          previousState: 'idle',
          newState: 'generating',
          timestamp: new Date().toISOString(),
        });

        // Session should still exist after state change
        const state = manager.getState();
        expect(state.session).not.toBeNull();
      });
    });

    describe('editor_state', () => {
      it('should update editor state', () => {
        sseService._emit('editor_state', {
          type: 'editor_state',
          content: 'New editor content',
          timestamp: new Date().toISOString(),
        });

        const state = manager.getState();
        expect(state.editorState?.pending).toBe('New editor content');
        expect(state.editorState?.editedContent).toBe('New editor content');
      });
    });

    describe('tts_started', () => {
      it('should mark narrative entry as playing', () => {
        // Add a narrative entry first
        const event = createMockEvent();
        manager.addToNarrativeHistory(event);

        sseService._emit('tts_started', {
          type: 'tts_started',
          requestId: event.id,
          timestamp: new Date().toISOString(),
        });

        const state = manager.getState();
        const entry = state.narrativeHistory.find((e) => e.id === event.id);
        expect(entry?.isTTSPlaying).toBe(true);
      });
    });

    describe('tts_complete', () => {
      it('should mark narrative entry as not playing', () => {
        // Add a narrative entry and start TTS
        const event = createMockEvent();
        manager.addToNarrativeHistory(event);

        sseService._emit('tts_started', {
          type: 'tts_started',
          requestId: event.id,
          timestamp: new Date().toISOString(),
        });

        sseService._emit('tts_complete', {
          type: 'tts_complete',
          requestId: event.id,
          durationMs: 1000,
          timestamp: new Date().toISOString(),
        });

        const state = manager.getState();
        const entry = state.narrativeHistory.find((e) => e.id === event.id);
        expect(entry?.isTTSPlaying).toBe(false);
      });
    });
  });

  describe('addToNarrativeHistory', () => {
    it('should add event to narrative history', async () => {
      await manager.startNewGame('Test Player');

      const event = createMockEvent();
      manager.addToNarrativeHistory(event);

      const state = manager.getState();
      expect(state.narrativeHistory).toHaveLength(1);
      const entry = state.narrativeHistory[0]!;
      expect(entry.id).toBe(event.id);
      expect(entry.content).toBe(event.content);
      expect(entry.type).toBe(event.eventType);
    });

    it('should preserve speaker for dialogue events', async () => {
      await manager.startNewGame('Test Player');

      const event: CanonicalEvent = {
        ...createMockEvent(),
        eventType: 'npc_dialogue',
        speaker: 'Guard',
      };
      manager.addToNarrativeHistory(event);

      const state = manager.getState();
      const entry = state.narrativeHistory[0]!;
      expect(entry.speaker).toBe('Guard');
    });

    it('should convert timestamp to Date', async () => {
      await manager.startNewGame('Test Player');

      const event = createMockEvent();
      manager.addToNarrativeHistory(event);

      const state = manager.getState();
      const entry = state.narrativeHistory[0]!;
      expect(entry.timestamp).toBeInstanceOf(Date);
    });
  });
});

describe('createInitialState', () => {
  it('should return initial state object', () => {
    const state = createInitialState();

    expect(state.connected).toBe(false);
    expect(state.gameId).toBeNull();
    expect(state.session).toBeNull();
    expect(state.editorState).toBeNull();
    expect(state.pendingContent).toBeNull();
    expect(state.systemStatus).toBeNull();
    expect(state.observation).toBeNull();
    expect(state.isLoading).toBe(false);
    expect(state.error).toBeNull();
    expect(state.narrativeHistory).toEqual([]);
  });
});
