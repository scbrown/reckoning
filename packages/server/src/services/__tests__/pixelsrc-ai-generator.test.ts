import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  PixelsrcAIGenerator,
  type PortraitGenerationContext,
  type AISceneGenerationContext,
  type PaletteGenerationContext,
} from '../pixelsrc/generator.js';
import { ClaudeCodeCLI } from '../ai/claude-cli.js';
import { Ok, Err } from '@reckoning/shared';

// Mock ClaudeCodeCLI
vi.mock('../ai/claude-cli.js', () => ({
  ClaudeCodeCLI: vi.fn().mockImplementation(() => ({
    execute: vi.fn(),
  })),
}));

describe('PixelsrcAIGenerator', () => {
  let generator: PixelsrcAIGenerator;
  let mockExecute: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();

    // Get reference to the mock execute function
    mockExecute = vi.fn();
    (ClaudeCodeCLI as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => ({
      execute: mockExecute,
    }));

    generator = new PixelsrcAIGenerator();
  });

  describe('constructor', () => {
    it('should create CLI with default config', () => {
      new PixelsrcAIGenerator();

      expect(ClaudeCodeCLI).toHaveBeenCalledWith({
        timeout: 60000,
        model: 'haiku',
      });
    });

    it('should create CLI with custom config', () => {
      new PixelsrcAIGenerator({ timeout: 30000, model: 'sonnet' });

      expect(ClaudeCodeCLI).toHaveBeenCalledWith({
        timeout: 30000,
        model: 'sonnet',
      });
    });
  });

  describe('generatePortrait', () => {
    const mockPortraitContext: PortraitGenerationContext = {
      name: 'Hero',
      description: 'A brave warrior with golden hair',
      characterClass: 'warrior',
      features: ['scar on cheek', 'blue eyes'],
      mood: 'determined',
    };

    const mockPxlResponse = `{"type":"palette","name":"hero_palette","colors":{".":"transparent","#":"#1a1a2e","s":"#e6b89c","h":"#d4a84b","e":"#4a7bb5"}}
{"type":"sprite","name":"portrait_hero","palette":"hero_palette","grid":["....####....","...#hhhh#...","..#hhhhhh#..",".#ssssssss#.",".#s#ss#ss#s.",".#ssssssss#."]}`;

    it('should generate portrait successfully', async () => {
      mockExecute.mockResolvedValue(
        Ok({ content: mockPxlResponse, durationMs: 1500 })
      );

      const result = await generator.generatePortrait(mockPortraitContext);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.source).toBe(mockPxlResponse);
        expect(result.value.durationMs).toBe(1500);
      }
    });

    it('should include character details in prompt', async () => {
      mockExecute.mockResolvedValue(
        Ok({ content: mockPxlResponse, durationMs: 1000 })
      );

      await generator.generatePortrait(mockPortraitContext);

      const call = mockExecute.mock.calls[0][0];
      expect(call.prompt).toContain('Hero');
      expect(call.prompt).toContain('brave warrior with golden hair');
      expect(call.prompt).toContain('warrior');
      expect(call.prompt).toContain('scar on cheek');
      expect(call.prompt).toContain('determined');
    });

    it('should handle minimal context', async () => {
      mockExecute.mockResolvedValue(
        Ok({ content: mockPxlResponse, durationMs: 1000 })
      );

      const minimalContext: PortraitGenerationContext = {
        name: 'NPC',
        description: 'A mysterious figure',
      };

      const result = await generator.generatePortrait(minimalContext);

      expect(result.ok).toBe(true);
      const call = mockExecute.mock.calls[0][0];
      expect(call.prompt).toContain('NPC');
      expect(call.prompt).toContain('mysterious figure');
    });

    it('should extract JSONL from code blocks', async () => {
      const wrappedResponse = `Here's the portrait:\n\`\`\`json\n${mockPxlResponse}\n\`\`\`\n\nThis creates a simple portrait.`;

      mockExecute.mockResolvedValue(
        Ok({ content: wrappedResponse, durationMs: 1000 })
      );

      const result = await generator.generatePortrait(mockPortraitContext);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.source).toBe(mockPxlResponse);
      }
    });

    it('should extract JSONL lines from mixed content', async () => {
      const mixedResponse = `Here's your portrait:\n{"type":"palette","name":"test","colors":{}}\nSome explanation\n{"type":"sprite","name":"test","palette":"test","grid":[]}\nMore text`;

      mockExecute.mockResolvedValue(
        Ok({ content: mixedResponse, durationMs: 1000 })
      );

      const result = await generator.generatePortrait(mockPortraitContext);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.source).toContain('"type":"palette"');
        expect(result.value.source).toContain('"type":"sprite"');
        expect(result.value.source).not.toContain('explanation');
      }
    });

    it('should return error on CLI failure', async () => {
      mockExecute.mockResolvedValue(
        Err({ code: 'TIMEOUT', message: 'Request timed out', retryable: true })
      );

      const result = await generator.generatePortrait(mockPortraitContext);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('TIMEOUT');
        expect(result.error.message).toBe('Request timed out');
        expect(result.error.retryable).toBe(true);
      }
    });
  });

  describe('generateScene', () => {
    const mockSceneContext: AISceneGenerationContext = {
      name: 'Dark Forest',
      description: 'A mysterious forest with towering ancient trees',
      archetype: 'forest',
      timeOfDay: 'dusk',
      weather: 'fog',
      elements: ['ancient tree', 'mushrooms', 'fog'],
    };

    const mockPxlResponse = `{"type":"palette","name":"forest_palette","colors":{".":"transparent","#":"#0a1a0a","g":"#2d4a2d","t":"#1a2e1a","f":"#3a4a3a"}}
{"type":"sprite","name":"scene_dark_forest","palette":"forest_palette","grid":["################","#tttttttttttttt#"]}`;

    it('should generate scene successfully', async () => {
      mockExecute.mockResolvedValue(
        Ok({ content: mockPxlResponse, durationMs: 2000 })
      );

      const result = await generator.generateScene(mockSceneContext);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.source).toBe(mockPxlResponse);
        expect(result.value.durationMs).toBe(2000);
      }
    });

    it('should include scene details in prompt', async () => {
      mockExecute.mockResolvedValue(
        Ok({ content: mockPxlResponse, durationMs: 1000 })
      );

      await generator.generateScene(mockSceneContext);

      const call = mockExecute.mock.calls[0][0];
      expect(call.prompt).toContain('Dark Forest');
      expect(call.prompt).toContain('mysterious forest');
      expect(call.prompt).toContain('forest');
      expect(call.prompt).toContain('dusk');
      expect(call.prompt).toContain('fog');
      expect(call.prompt).toContain('ancient tree');
    });

    it('should handle minimal scene context', async () => {
      mockExecute.mockResolvedValue(
        Ok({ content: mockPxlResponse, durationMs: 1000 })
      );

      const minimalContext: AISceneGenerationContext = {
        name: 'Room',
        description: 'A simple room',
      };

      const result = await generator.generateScene(minimalContext);

      expect(result.ok).toBe(true);
    });
  });

  describe('generatePalette', () => {
    const mockPaletteContext: PaletteGenerationContext = {
      name: 'sunset',
      theme: 'warm evening colors',
      colorCount: 6,
      baseColors: ['#FF6B35', '#F7C59F'],
      style: 'warm',
    };

    const mockPxlResponse = `{"type":"palette","name":"sunset_palette","colors":{".":"transparent","1":"#FF6B35","2":"#F7C59F","3":"#2E2E2E","4":"#FF8C42","5":"#FFD166","6":"#FFFCF9"}}`;

    it('should generate palette successfully', async () => {
      mockExecute.mockResolvedValue(
        Ok({ content: mockPxlResponse, durationMs: 800 })
      );

      const result = await generator.generatePalette(mockPaletteContext);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.source).toBe(mockPxlResponse);
        expect(result.value.durationMs).toBe(800);
      }
    });

    it('should include palette details in prompt', async () => {
      mockExecute.mockResolvedValue(
        Ok({ content: mockPxlResponse, durationMs: 1000 })
      );

      await generator.generatePalette(mockPaletteContext);

      const call = mockExecute.mock.calls[0][0];
      expect(call.prompt).toContain('sunset');
      expect(call.prompt).toContain('warm evening colors');
      expect(call.prompt).toContain('6');
      expect(call.prompt).toContain('#FF6B35');
      expect(call.prompt).toContain('warm');
    });

    it('should use default color count', async () => {
      mockExecute.mockResolvedValue(
        Ok({ content: mockPxlResponse, durationMs: 1000 })
      );

      const minimalContext: PaletteGenerationContext = {
        name: 'basic',
        theme: 'simple colors',
      };

      await generator.generatePalette(minimalContext);

      const call = mockExecute.mock.calls[0][0];
      expect(call.prompt).toContain('8'); // Default color count
    });
  });

  describe('name sanitization', () => {
    it('should sanitize names with special characters', async () => {
      mockExecute.mockResolvedValue(
        Ok({ content: '{"type":"palette","name":"test","colors":{}}', durationMs: 1000 })
      );

      await generator.generatePortrait({
        name: 'Sir John-Doe III',
        description: 'A noble knight',
      });

      const call = mockExecute.mock.calls[0][0];
      expect(call.prompt).toContain('portrait_sir_john_doe_iii');
    });

    it('should handle names with multiple spaces and symbols', async () => {
      mockExecute.mockResolvedValue(
        Ok({ content: '{"type":"palette","name":"test","colors":{}}', durationMs: 1000 })
      );

      await generator.generateScene({
        name: 'The Dark---Forest!!!',
        description: 'A spooky forest',
      });

      const call = mockExecute.mock.calls[0][0];
      expect(call.prompt).toContain('scene_the_dark_forest');
    });
  });

  describe('primer inclusion', () => {
    it('should include portrait primer in portrait prompts', async () => {
      mockExecute.mockResolvedValue(
        Ok({ content: '{}', durationMs: 1000 })
      );

      await generator.generatePortrait({
        name: 'Test',
        description: 'Test character',
      });

      const call = mockExecute.mock.calls[0][0];
      expect(call.prompt).toContain('Portrait Specifications');
      expect(call.prompt).toContain('12x16 pixels');
    });

    it('should include scene primer in scene prompts', async () => {
      mockExecute.mockResolvedValue(
        Ok({ content: '{}', durationMs: 1000 })
      );

      await generator.generateScene({
        name: 'Test',
        description: 'Test scene',
      });

      const call = mockExecute.mock.calls[0][0];
      expect(call.prompt).toContain('Scene Specifications');
      expect(call.prompt).toContain('128x96 pixels');
    });

    it('should include palette primer in palette prompts', async () => {
      mockExecute.mockResolvedValue(
        Ok({ content: '{}', durationMs: 1000 })
      );

      await generator.generatePalette({
        name: 'Test',
        theme: 'Test theme',
      });

      const call = mockExecute.mock.calls[0][0];
      expect(call.prompt).toContain('Palette Specifications');
      expect(call.prompt).toContain('8-16 colors');
    });

    it('should include base format primer in all prompts', async () => {
      mockExecute.mockResolvedValue(
        Ok({ content: '{}', durationMs: 1000 })
      );

      await generator.generatePortrait({
        name: 'Test',
        description: 'Test',
      });

      const call = mockExecute.mock.calls[0][0];
      expect(call.prompt).toContain('Pixelsrc Format Specification');
      expect(call.prompt).toContain('JSONL');
      expect(call.prompt).toContain('"type":"palette"');
      expect(call.prompt).toContain('"type":"sprite"');
    });
  });
});
