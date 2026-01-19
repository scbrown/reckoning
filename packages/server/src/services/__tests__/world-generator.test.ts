import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { Ok, Err } from '@reckoning/shared';
import { WorldGenerator } from '../ai/world-generator.js';
import type { AIProvider, AIResponse, AIError } from '../ai/types.js';
import type { AreaRepository } from '../../db/repositories/area-repository.js';
import type { Party, Area, AreaExit, AreaObject, NPC } from '@reckoning/shared/game';

// Mock all pixelsrc modules
vi.mock('../pixelsrc/index.js', () => ({
  PixelsrcGenerator: vi.fn().mockImplementation(() => ({
    generateSceneRef: vi.fn().mockReturnValue({
      path: 'scenes/test.pxl',
      spriteName: 'scene_test',
      animation: { states: { idle: { keyframes: {}, duration: 1000 } }, defaultState: 'idle' },
    }),
    generatePrompt: vi.fn().mockReturnValue({
      prompt: 'test prompt',
      archetype: 'tavern',
      paletteHints: [],
      spriteName: 'scene_test',
      animationHints: [],
    }),
  })),
  PixelsrcAIGenerator: vi.fn().mockImplementation(() => ({
    generateScene: vi.fn(),
  })),
  PixelsrcValidator: vi.fn().mockImplementation(() => ({
    init: vi.fn().mockResolvedValue(undefined),
    validate: vi.fn(),
  })),
  PixelsrcRepairer: vi.fn().mockImplementation(() => ({
    setValidator: vi.fn(),
    repair: vi.fn(),
  })),
  PixelsrcVisualValidator: vi.fn().mockImplementation(() => ({
    init: vi.fn().mockResolvedValue(undefined),
    validate: vi.fn(),
  })),
  PixelsrcProjectManager: vi.fn().mockImplementation(() => ({
    initialize: vi.fn().mockResolvedValue(undefined),
    writeFile: vi.fn().mockResolvedValue(undefined),
  })),
}));

// Get mocked constructors
import {
  PixelsrcGenerator,
  PixelsrcAIGenerator,
  PixelsrcValidator,
  PixelsrcRepairer,
  PixelsrcVisualValidator,
  PixelsrcProjectManager,
} from '../pixelsrc/index.js';

// Sample world generation response
const MOCK_WORLD_OUTPUT = {
  worldName: 'Test World',
  worldDescription: 'A test world',
  startingAreaId: 'area-1',
  areas: [
    {
      id: 'area-1',
      name: 'Test Area',
      description: 'A test area',
      tags: ['test', 'tavern'],
      exits: [{ direction: 'north', targetAreaId: 'area-2', description: 'A door' }],
      objects: [{ id: 'obj-1', name: 'Table', description: 'A wooden table', interactable: true, tags: ['furniture'] }],
      npcs: [{ id: 'npc-1', name: 'Barkeep', description: 'A friendly barkeep', currentAreaId: 'area-1', disposition: 'friendly', tags: ['merchant'] }],
    },
    {
      id: 'area-2',
      name: 'Second Area',
      description: 'Another area',
      tags: ['outdoor'],
      exits: [{ direction: 'south', targetAreaId: 'area-1', description: 'A door' }],
      objects: [],
      npcs: [],
    },
  ],
  storyHooks: ['A mysterious stranger arrives'],
};

// Mock AI provider
function createMockAIProvider(): AIProvider {
  return {
    name: 'mock-ai',
    async execute() {
      return Ok<AIResponse, AIError>({
        content: JSON.stringify(MOCK_WORLD_OUTPUT),
        durationMs: 100,
      });
    },
    async isAvailable() {
      return true;
    },
  };
}

// Mock area repository
function createMockAreaRepo(): AreaRepository {
  return {
    create: vi.fn().mockImplementation((data) => ({
      id: data.id,
      name: data.name,
      description: data.description,
      tags: data.tags,
      exits: [],
      objects: [],
      npcs: [],
    } as Area)),
    createExit: vi.fn().mockImplementation((data) => ({
      direction: data.direction,
      targetAreaId: data.targetAreaId,
      description: data.description,
      locked: data.locked,
    } as AreaExit)),
    createObject: vi.fn().mockImplementation((data) => ({
      id: data.id,
      name: data.name,
      description: data.description,
      interactable: data.interactable,
      tags: data.tags,
    } as AreaObject)),
    createNPC: vi.fn().mockImplementation((data) => ({
      id: data.id,
      name: data.name,
      description: data.description,
      currentAreaId: data.currentAreaId,
      disposition: data.disposition,
      tags: data.tags,
    } as NPC)),
    findById: vi.fn(),
    findAll: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  } as unknown as AreaRepository;
}

// Mock party
const MOCK_PARTY: Party = {
  id: 'party-1',
  gameId: 'game-1',
  members: [
    {
      id: 'char-1',
      name: 'Hero',
      description: 'A brave adventurer',
      class: 'warrior',
      stats: { health: 100, maxHealth: 100 },
    },
  ],
};

describe('WorldGenerator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('generate', () => {
    it('should generate a world without pixel art by default', async () => {
      const aiProvider = createMockAIProvider();
      const areaRepo = createMockAreaRepo();
      const generator = new WorldGenerator(aiProvider, areaRepo);

      const result = await generator.generate(MOCK_PARTY);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.worldName).toBe('Test World');
        expect(result.value.areas).toHaveLength(2);
        expect(result.value.npcs).toHaveLength(1);
        // Pixel art generation should not be triggered
        const aiGen = (PixelsrcAIGenerator as Mock).mock.results[0].value;
        expect(aiGen.generateScene).not.toHaveBeenCalled();
      }
    });

    it('should set basic pixelArtRef from PixelsrcGenerator', async () => {
      const aiProvider = createMockAIProvider();
      const areaRepo = createMockAreaRepo();
      const generator = new WorldGenerator(aiProvider, areaRepo);

      const result = await generator.generate(MOCK_PARTY);

      expect(result.ok).toBe(true);
      if (result.ok) {
        // Every area should have a pixelArtRef set by PixelsrcGenerator
        for (const area of result.value.areas) {
          expect(area.pixelArtRef).toBeDefined();
          expect(area.pixelArtRef?.path).toContain('scenes/');
        }
      }
    });

    it('should generate pixel art when enablePixelArtGeneration is true', async () => {
      const aiProvider = createMockAIProvider();
      const areaRepo = createMockAreaRepo();
      const generator = new WorldGenerator(aiProvider, areaRepo);

      // Mock pixelsrc services for successful generation
      const mockAIGen = (PixelsrcAIGenerator as Mock).mock.results[0].value;
      mockAIGen.generateScene.mockResolvedValue(Ok({
        source: '{"type":"palette","name":"test"}',
        durationMs: 100,
      }));

      const mockValidator = (PixelsrcValidator as Mock).mock.results[0].value;
      mockValidator.validate.mockReturnValue({
        valid: true,
        errors: [],
        warnings: [],
      });

      const mockVisualValidator = (PixelsrcVisualValidator as Mock).mock.results[0].value;
      mockVisualValidator.validate.mockResolvedValue(Ok({
        approved: true,
        feedback: 'Looks good',
        durationMs: 100,
      }));

      const result = await generator.generate(MOCK_PARTY, {
        gameId: 'game-1',
        enablePixelArtGeneration: true,
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        // Pixel art should be generated for each area
        expect(mockAIGen.generateScene).toHaveBeenCalledTimes(2);

        // Project should be initialized
        const mockProject = (PixelsrcProjectManager as Mock).mock.results[0].value;
        expect(mockProject.initialize).toHaveBeenCalledWith('game-1');

        // Files should be written
        expect(mockProject.writeFile).toHaveBeenCalledTimes(2);
      }
    });

    it('should continue with world generation when pixel art generation fails', async () => {
      const aiProvider = createMockAIProvider();
      const areaRepo = createMockAreaRepo();
      const generator = new WorldGenerator(aiProvider, areaRepo);

      // Mock pixelsrc AI generator to fail
      const mockAIGen = (PixelsrcAIGenerator as Mock).mock.results[0].value;
      mockAIGen.generateScene.mockResolvedValue(Err({
        code: 'AI_ERROR',
        message: 'AI generation failed',
        retryable: false,
      }));

      const result = await generator.generate(MOCK_PARTY, {
        gameId: 'game-1',
        enablePixelArtGeneration: true,
      });

      // World generation should still succeed
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.worldName).toBe('Test World');
        expect(result.value.areas).toHaveLength(2);
        // Areas still have basic pixelArtRef from PixelsrcGenerator
        for (const area of result.value.areas) {
          expect(area.pixelArtRef).toBeDefined();
        }
      }
    });

    it('should attempt repair when validation fails', async () => {
      const aiProvider = createMockAIProvider();
      const areaRepo = createMockAreaRepo();
      const generator = new WorldGenerator(aiProvider, areaRepo);

      // Mock generation success but validation failure
      const mockAIGen = (PixelsrcAIGenerator as Mock).mock.results[0].value;
      mockAIGen.generateScene.mockResolvedValue(Ok({
        source: '{"type":"invalid"}',
        durationMs: 100,
      }));

      const mockValidator = (PixelsrcValidator as Mock).mock.results[0].value;
      mockValidator.validate.mockReturnValue({
        valid: false,
        errors: [{ message: 'Invalid source' }],
        warnings: [],
      });

      // Mock repairer success
      const mockRepairer = (PixelsrcRepairer as Mock).mock.results[0].value;
      mockRepairer.repair.mockResolvedValue(Ok({
        success: true,
        source: '{"type":"palette","name":"repaired"}',
        attempts: 1,
        remainingErrors: [],
      }));

      const mockVisualValidator = (PixelsrcVisualValidator as Mock).mock.results[0].value;
      mockVisualValidator.validate.mockResolvedValue(Ok({
        approved: true,
        feedback: 'Looks good',
        durationMs: 100,
      }));

      const result = await generator.generate(MOCK_PARTY, {
        gameId: 'game-1',
        enablePixelArtGeneration: true,
      });

      expect(result.ok).toBe(true);
      // Repairer should have been called for each area
      expect(mockRepairer.repair).toHaveBeenCalled();
    });

    it('should skip visual validation when skipVisualValidation is true', async () => {
      const aiProvider = createMockAIProvider();
      const areaRepo = createMockAreaRepo();
      const generator = new WorldGenerator(aiProvider, areaRepo);

      // Mock successful generation and validation
      const mockAIGen = (PixelsrcAIGenerator as Mock).mock.results[0].value;
      mockAIGen.generateScene.mockResolvedValue(Ok({
        source: '{"type":"palette","name":"test"}',
        durationMs: 100,
      }));

      const mockValidator = (PixelsrcValidator as Mock).mock.results[0].value;
      mockValidator.validate.mockReturnValue({
        valid: true,
        errors: [],
        warnings: [],
      });

      const mockVisualValidator = (PixelsrcVisualValidator as Mock).mock.results[0].value;

      const result = await generator.generate(MOCK_PARTY, {
        gameId: 'game-1',
        enablePixelArtGeneration: true,
        skipVisualValidation: true,
      });

      expect(result.ok).toBe(true);
      // Visual validator should not be called
      expect(mockVisualValidator.validate).not.toHaveBeenCalled();
    });

    it('should not generate pixel art without gameId', async () => {
      const aiProvider = createMockAIProvider();
      const areaRepo = createMockAreaRepo();
      const generator = new WorldGenerator(aiProvider, areaRepo);

      const mockAIGen = (PixelsrcAIGenerator as Mock).mock.results[0].value;

      const result = await generator.generate(MOCK_PARTY, {
        enablePixelArtGeneration: true,
        // gameId is missing
      });

      expect(result.ok).toBe(true);
      // Pixel art generation should not be triggered without gameId
      expect(mockAIGen.generateScene).not.toHaveBeenCalled();
    });

    it('should continue when file write fails', async () => {
      const aiProvider = createMockAIProvider();
      const areaRepo = createMockAreaRepo();
      const generator = new WorldGenerator(aiProvider, areaRepo);

      // Mock successful generation and validation
      const mockAIGen = (PixelsrcAIGenerator as Mock).mock.results[0].value;
      mockAIGen.generateScene.mockResolvedValue(Ok({
        source: '{"type":"palette","name":"test"}',
        durationMs: 100,
      }));

      const mockValidator = (PixelsrcValidator as Mock).mock.results[0].value;
      mockValidator.validate.mockReturnValue({
        valid: true,
        errors: [],
        warnings: [],
      });

      const mockVisualValidator = (PixelsrcVisualValidator as Mock).mock.results[0].value;
      mockVisualValidator.validate.mockResolvedValue(Ok({
        approved: true,
        feedback: 'Good',
        durationMs: 100,
      }));

      // Mock file write failure
      const mockProject = (PixelsrcProjectManager as Mock).mock.results[0].value;
      mockProject.writeFile.mockRejectedValue(new Error('Disk full'));

      const result = await generator.generate(MOCK_PARTY, {
        gameId: 'game-1',
        enablePixelArtGeneration: true,
      });

      // World generation should still succeed
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.worldName).toBe('Test World');
      }
    });

    it('should continue when repair fails', async () => {
      const aiProvider = createMockAIProvider();
      const areaRepo = createMockAreaRepo();
      const generator = new WorldGenerator(aiProvider, areaRepo);

      // Mock generation success but validation failure
      const mockAIGen = (PixelsrcAIGenerator as Mock).mock.results[0].value;
      mockAIGen.generateScene.mockResolvedValue(Ok({
        source: '{"type":"invalid"}',
        durationMs: 100,
      }));

      const mockValidator = (PixelsrcValidator as Mock).mock.results[0].value;
      mockValidator.validate.mockReturnValue({
        valid: false,
        errors: [{ message: 'Invalid source' }],
        warnings: [],
      });

      // Mock repairer failure
      const mockRepairer = (PixelsrcRepairer as Mock).mock.results[0].value;
      mockRepairer.repair.mockResolvedValue(Err({
        code: 'AI_ERROR',
        message: 'Repair failed',
      }));

      const result = await generator.generate(MOCK_PARTY, {
        gameId: 'game-1',
        enablePixelArtGeneration: true,
      });

      // World generation should still succeed
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.worldName).toBe('Test World');
        // Areas still have basic pixelArtRef
        for (const area of result.value.areas) {
          expect(area.pixelArtRef).toBeDefined();
        }
      }
    });

    it('should continue when visual validation fails', async () => {
      const aiProvider = createMockAIProvider();
      const areaRepo = createMockAreaRepo();
      const generator = new WorldGenerator(aiProvider, areaRepo);

      // Mock successful generation and validation
      const mockAIGen = (PixelsrcAIGenerator as Mock).mock.results[0].value;
      mockAIGen.generateScene.mockResolvedValue(Ok({
        source: '{"type":"palette","name":"test"}',
        durationMs: 100,
      }));

      const mockValidator = (PixelsrcValidator as Mock).mock.results[0].value;
      mockValidator.validate.mockReturnValue({
        valid: true,
        errors: [],
        warnings: [],
      });

      // Mock visual validation failure
      const mockVisualValidator = (PixelsrcVisualValidator as Mock).mock.results[0].value;
      mockVisualValidator.validate.mockResolvedValue(Err({
        code: 'AI_ERROR',
        message: 'Visual validation failed',
        retryable: false,
      }));

      const result = await generator.generate(MOCK_PARTY, {
        gameId: 'game-1',
        enablePixelArtGeneration: true,
      });

      // World generation should still succeed
      expect(result.ok).toBe(true);
      if (result.ok) {
        // Files should still be written despite visual validation failure
        const mockProject = (PixelsrcProjectManager as Mock).mock.results[0].value;
        expect(mockProject.writeFile).toHaveBeenCalled();
      }
    });

    it('should continue when visual validation not approved', async () => {
      const aiProvider = createMockAIProvider();
      const areaRepo = createMockAreaRepo();
      const generator = new WorldGenerator(aiProvider, areaRepo);

      // Mock successful generation and validation
      const mockAIGen = (PixelsrcAIGenerator as Mock).mock.results[0].value;
      mockAIGen.generateScene.mockResolvedValue(Ok({
        source: '{"type":"palette","name":"test"}',
        durationMs: 100,
      }));

      const mockValidator = (PixelsrcValidator as Mock).mock.results[0].value;
      mockValidator.validate.mockReturnValue({
        valid: true,
        errors: [],
        warnings: [],
      });

      // Mock visual validation not approved
      const mockVisualValidator = (PixelsrcVisualValidator as Mock).mock.results[0].value;
      mockVisualValidator.validate.mockResolvedValue(Ok({
        approved: false,
        feedback: 'Does not match expected content',
        durationMs: 100,
      }));

      const result = await generator.generate(MOCK_PARTY, {
        gameId: 'game-1',
        enablePixelArtGeneration: true,
      });

      // World generation should still succeed
      expect(result.ok).toBe(true);
      if (result.ok) {
        // Files should still be written despite visual validation not approved
        const mockProject = (PixelsrcProjectManager as Mock).mock.results[0].value;
        expect(mockProject.writeFile).toHaveBeenCalled();
      }
    });
  });
});
