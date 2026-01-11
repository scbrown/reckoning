import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GameService, GameServiceError } from '../index.js';
import type { GameSession, DMEditorState, CanonicalEvent } from '@reckoning/shared';

// Mock fetch
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// Helper to create mock responses
function mockResponse<T>(data: T, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: vi.fn().mockResolvedValue(data),
    headers: new Headers(),
    redirected: false,
    statusText: ok ? 'OK' : 'Error',
    type: 'basic',
    url: '',
    clone: vi.fn(),
    body: null,
    bodyUsed: false,
    arrayBuffer: vi.fn(),
    blob: vi.fn(),
    formData: vi.fn(),
    text: vi.fn(),
  } as unknown as Response;
}

// Mock data factories
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

describe('GameService', () => {
  let gameService: GameService;

  beforeEach(() => {
    mockFetch.mockReset();
    gameService = new GameService();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('should use default base URL', () => {
      const service = new GameService();
      expect(service).toBeDefined();
    });

    it('should accept custom base URL', () => {
      const service = new GameService('https://api.example.com');
      expect(service).toBeDefined();
    });
  });

  describe('getGameId', () => {
    it('should return null initially', () => {
      expect(gameService.getGameId()).toBeNull();
    });

    it('should return game ID after newGame', async () => {
      const mockSession = createMockSession();
      mockFetch.mockResolvedValueOnce(
        mockResponse({ gameId: 'game-123', session: mockSession })
      );

      await gameService.newGame('Test Player');

      expect(gameService.getGameId()).toBe('game-123');
    });
  });

  describe('newGame', () => {
    it('should create a new game session', async () => {
      const mockSession = createMockSession();
      mockFetch.mockResolvedValueOnce(
        mockResponse({ gameId: 'game-123', session: mockSession })
      );

      const result = await gameService.newGame('Test Player', 'A brave hero');

      expect(mockFetch).toHaveBeenCalledWith('/api/game/new', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          playerName: 'Test Player',
          playerDescription: 'A brave hero',
        }),
      });
      expect(result).toEqual(mockSession);
    });

    it('should store the game ID', async () => {
      const mockSession = createMockSession();
      mockFetch.mockResolvedValueOnce(
        mockResponse({ gameId: 'game-123', session: mockSession })
      );

      await gameService.newGame('Test Player');

      expect(gameService.getGameId()).toBe('game-123');
    });
  });

  describe('getSession', () => {
    it('should fetch game session and editor state', async () => {
      const mockSession = createMockSession();
      const mockEditor = createMockEditorState();
      mockFetch.mockResolvedValueOnce(
        mockResponse({ session: mockSession, editorState: mockEditor })
      );

      const result = await gameService.getSession('game-123');

      expect(mockFetch).toHaveBeenCalledWith('/api/game/game-123', {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });
      expect(result.session).toEqual(mockSession);
      expect(result.editorState).toEqual(mockEditor);
    });
  });

  describe('listSaves', () => {
    it('should return list of save slots', async () => {
      const mockSaves = [
        {
          id: 'save-1',
          gameId: 'game-123',
          name: 'Save 1',
          createdAt: new Date().toISOString(),
          turn: 5,
          location: 'Test Area',
        },
      ];
      mockFetch.mockResolvedValueOnce(mockResponse({ saves: mockSaves }));

      const result = await gameService.listSaves();

      expect(mockFetch).toHaveBeenCalledWith('/api/game/list', {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });
      expect(result).toEqual(mockSaves);
    });
  });

  describe('saveGame', () => {
    it('should save the game and return save slot', async () => {
      const mockSave = {
        id: 'save-1',
        gameId: 'game-123',
        name: 'My Save',
        createdAt: new Date().toISOString(),
        turn: 5,
        location: 'Test Area',
      };
      mockFetch.mockResolvedValueOnce(mockResponse(mockSave));

      const result = await gameService.saveGame('game-123', 'My Save');

      expect(mockFetch).toHaveBeenCalledWith('/api/game/game-123/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'My Save' }),
      });
      expect(result).toEqual(mockSave);
    });
  });

  describe('loadGame', () => {
    it('should load game from save slot', async () => {
      const mockSession = createMockSession();
      mockFetch.mockResolvedValueOnce(mockResponse(mockSession));

      const result = await gameService.loadGame('game-123', 'save-1');

      expect(mockFetch).toHaveBeenCalledWith('/api/game/game-123/load', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slotId: 'save-1' }),
      });
      expect(result).toEqual(mockSession);
    });

    it('should update current game ID', async () => {
      const mockSession = createMockSession();
      mockFetch.mockResolvedValueOnce(mockResponse(mockSession));

      await gameService.loadGame('game-123', 'save-1');

      expect(gameService.getGameId()).toBe('game-123');
    });
  });

  describe('getPending', () => {
    it('should fetch pending content and editor state', async () => {
      const mockPending = {
        id: 'gen-1',
        generationType: 'narration' as const,
        eventType: 'narration' as const,
        content: 'Generated content',
        metadata: {},
      };
      const mockEditor = createMockEditorState();
      mockFetch.mockResolvedValueOnce(
        mockResponse({ pending: mockPending, editorState: mockEditor })
      );

      const result = await gameService.getPending('game-123');

      expect(mockFetch).toHaveBeenCalledWith('/api/game/game-123/pending', {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });
      expect(result.pending).toEqual(mockPending);
      expect(result.editorState).toEqual(mockEditor);
    });

    it('should handle null pending content', async () => {
      const mockEditor = createMockEditorState();
      mockFetch.mockResolvedValueOnce(
        mockResponse({ pending: null, editorState: mockEditor })
      );

      const result = await gameService.getPending('game-123');

      expect(result.pending).toBeNull();
    });
  });

  describe('updateEditor', () => {
    it('should update editor state', async () => {
      const mockEditor: DMEditorState = {
        pending: 'Some content',
        editedContent: 'Edited content',
        status: 'editing',
      };
      mockFetch.mockResolvedValueOnce(mockResponse(mockEditor));

      const result = await gameService.updateEditor('game-123', {
        editedContent: 'Edited content',
        status: 'editing',
      });

      expect(mockFetch).toHaveBeenCalledWith('/api/game/game-123/editor', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          editedContent: 'Edited content',
          status: 'editing',
        }),
      });
      expect(result).toEqual(mockEditor);
    });
  });

  describe('submit', () => {
    it('should submit ACCEPT action', async () => {
      const mockEvent = createMockEvent();
      const mockSession = createMockSession();
      mockFetch.mockResolvedValueOnce(
        mockResponse({ event: mockEvent, session: mockSession })
      );

      const result = await gameService.submit('game-123', { type: 'ACCEPT' });

      expect(mockFetch).toHaveBeenCalledWith('/api/game/game-123/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: { type: 'ACCEPT' } }),
      });
      expect(result.event).toEqual(mockEvent);
      expect(result.session).toEqual(mockSession);
    });

    it('should submit EDIT action with content', async () => {
      const mockEvent = createMockEvent();
      const mockSession = createMockSession();
      mockFetch.mockResolvedValueOnce(
        mockResponse({ event: mockEvent, session: mockSession })
      );

      const result = await gameService.submit('game-123', {
        type: 'EDIT',
        content: 'Edited content',
      });

      expect(mockFetch).toHaveBeenCalledWith('/api/game/game-123/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: { type: 'EDIT', content: 'Edited content' } }),
      });
      expect(result.event).toEqual(mockEvent);
    });

    it('should submit REGENERATE action with guidance', async () => {
      const mockEvent = createMockEvent();
      const mockSession = createMockSession();
      mockFetch.mockResolvedValueOnce(
        mockResponse({ event: mockEvent, session: mockSession })
      );

      const result = await gameService.submit('game-123', {
        type: 'REGENERATE',
        guidance: 'Make it more dramatic',
      });

      expect(mockFetch).toHaveBeenCalledWith('/api/game/game-123/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: { type: 'REGENERATE', guidance: 'Make it more dramatic' },
        }),
      });
      expect(result.event).toEqual(mockEvent);
    });
  });

  describe('regenerate', () => {
    it('should request regeneration without feedback', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse(undefined));

      await gameService.regenerate('game-123');

      expect(mockFetch).toHaveBeenCalledWith('/api/game/game-123/regenerate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ feedback: undefined }),
      });
    });

    it('should request regeneration with feedback', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse(undefined));

      await gameService.regenerate('game-123', 'Too short');

      expect(mockFetch).toHaveBeenCalledWith('/api/game/game-123/regenerate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ feedback: 'Too short' }),
      });
    });
  });

  describe('inject', () => {
    it('should inject DM content', async () => {
      const mockEvent = createMockEvent();
      const mockSession = createMockSession();
      mockFetch.mockResolvedValueOnce(
        mockResponse({ event: mockEvent, session: mockSession })
      );

      const result = await gameService.inject(
        'game-123',
        'A dragon appears!',
        'narration'
      );

      expect(mockFetch).toHaveBeenCalledWith('/api/game/game-123/inject', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: 'A dragon appears!',
          eventType: 'narration',
          speaker: undefined,
        }),
      });
      expect(result.event).toEqual(mockEvent);
      expect(result.session).toEqual(mockSession);
    });

    it('should inject dialogue with speaker', async () => {
      const mockEvent = createMockEvent();
      const mockSession = createMockSession();
      mockFetch.mockResolvedValueOnce(
        mockResponse({ event: mockEvent, session: mockSession })
      );

      await gameService.inject(
        'game-123',
        'Hello there!',
        'npc_dialogue',
        'Guard'
      );

      expect(mockFetch).toHaveBeenCalledWith('/api/game/game-123/inject', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: 'Hello there!',
          eventType: 'npc_dialogue',
          speaker: 'Guard',
        }),
      });
    });
  });

  describe('next', () => {
    it('should trigger next generation without options', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse(undefined));

      await gameService.next('game-123');

      expect(mockFetch).toHaveBeenCalledWith('/api/game/game-123/next', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
    });

    it('should trigger next generation with options', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse(undefined));

      await gameService.next('game-123', {
        type: 'npc_response',
        dmGuidance: 'Have the NPC be suspicious',
      });

      expect(mockFetch).toHaveBeenCalledWith('/api/game/game-123/next', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'npc_response',
          dmGuidance: 'Have the NPC be suspicious',
        }),
      });
    });
  });

  describe('setPlaybackMode', () => {
    it('should set playback mode and return new mode', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({ mode: 'paused' }));

      const result = await gameService.setPlaybackMode('game-123', 'paused');

      expect(mockFetch).toHaveBeenCalledWith('/api/game/game-123/control', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'paused' }),
      });
      expect(result).toBe('paused');
    });
  });

  describe('getStatus', () => {
    it('should fetch system status and game observation', async () => {
      const mockStatus = {
        system: {
          ai: { status: 'ok' as const },
          tts: { status: 'ok' as const, queueLength: 0 },
          db: { status: 'ok' as const },
        },
        observation: {
          turn: 5,
          totalEvents: 20,
          eventsThisTurn: 3,
          currentLocation: 'Test Area',
          partySize: 1,
          npcsPresent: 2,
          sessionDuration: 30000,
        },
      };
      mockFetch.mockResolvedValueOnce(mockResponse(mockStatus));

      const result = await gameService.getStatus('game-123');

      expect(mockFetch).toHaveBeenCalledWith('/api/game/game-123/status', {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });
      expect(result).toEqual(mockStatus);
    });
  });

  describe('error handling', () => {
    it('should throw GameServiceError on non-ok response', async () => {
      mockFetch.mockResolvedValueOnce(
        mockResponse(
          { error: { code: 'NOT_FOUND', message: 'Game not found' } },
          false,
          404
        )
      );

      await expect(gameService.getSession('invalid-id')).rejects.toThrow(
        GameServiceError
      );
    });

    it('should include error code and status in GameServiceError', async () => {
      mockFetch.mockResolvedValueOnce(
        mockResponse(
          { error: { code: 'NOT_FOUND', message: 'Game not found' } },
          false,
          404
        )
      );

      try {
        await gameService.getSession('invalid-id');
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(GameServiceError);
        const gameError = error as GameServiceError;
        expect(gameError.code).toBe('NOT_FOUND');
        expect(gameError.message).toBe('Game not found');
        expect(gameError.statusCode).toBe(404);
      }
    });

    it('should handle malformed error responses', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({}, false, 500));

      try {
        await gameService.getSession('invalid-id');
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(GameServiceError);
        const gameError = error as GameServiceError;
        expect(gameError.code).toBe('UNKNOWN_ERROR');
        expect(gameError.message).toBe('Request failed');
        expect(gameError.statusCode).toBe(500);
      }
    });

    it('should handle JSON parse errors in error response', async () => {
      const badResponse = {
        ok: false,
        status: 500,
        json: vi.fn().mockRejectedValue(new Error('JSON parse error')),
      } as unknown as Response;
      mockFetch.mockResolvedValueOnce(badResponse);

      try {
        await gameService.getSession('invalid-id');
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(GameServiceError);
        const gameError = error as GameServiceError;
        expect(gameError.code).toBe('UNKNOWN_ERROR');
      }
    });
  });

  describe('GameServiceError', () => {
    it('should have correct name', () => {
      const error = new GameServiceError('TEST_ERROR', 'Test message', 400);
      expect(error.name).toBe('GameServiceError');
    });

    it('should have correct properties', () => {
      const error = new GameServiceError('TEST_ERROR', 'Test message', 400);
      expect(error.code).toBe('TEST_ERROR');
      expect(error.message).toBe('Test message');
      expect(error.statusCode).toBe(400);
    });

    it('should be instanceof Error', () => {
      const error = new GameServiceError('TEST_ERROR', 'Test message', 400);
      expect(error).toBeInstanceOf(Error);
    });
  });
});
