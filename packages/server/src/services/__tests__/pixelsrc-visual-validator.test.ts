import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  PixelsrcVisualValidator,
  type VisualValidationContext,
} from '../pixelsrc/visual-validator.js';
import { ClaudeCodeCLI } from '../ai/claude-cli.js';
import { PixelsrcRenderer } from '../pixelsrc/renderer.js';
import { Ok, Err } from '@reckoning/shared';
import { writeFile, unlink, mkdir } from 'fs/promises';

// Mock dependencies
vi.mock('../ai/claude-cli.js', () => ({
  ClaudeCodeCLI: vi.fn().mockImplementation(() => ({
    execute: vi.fn(),
    isAvailable: vi.fn(),
  })),
}));

vi.mock('../pixelsrc/renderer.js', () => ({
  PixelsrcRenderer: vi.fn().mockImplementation(() => ({
    init: vi.fn(),
    renderToPng: vi.fn(),
    isInitialized: vi.fn(),
  })),
}));

vi.mock('fs/promises', () => ({
  writeFile: vi.fn(),
  unlink: vi.fn(),
  mkdir: vi.fn(),
}));

describe('PixelsrcVisualValidator', () => {
  let validator: PixelsrcVisualValidator;
  let mockExecute: ReturnType<typeof vi.fn>;
  let mockRenderToPng: ReturnType<typeof vi.fn>;
  let mockIsInitialized: ReturnType<typeof vi.fn>;
  let mockIsAvailable: ReturnType<typeof vi.fn>;

  const mockPngData = new Uint8Array([0x89, 0x50, 0x4e, 0x47]); // PNG magic bytes

  const mockValidationContext: VisualValidationContext = {
    expectedContent: 'A brave warrior with golden hair',
    contentType: 'portrait',
    strictness: 'normal',
  };

  beforeEach(() => {
    vi.clearAllMocks();

    // Set up mocks
    mockExecute = vi.fn();
    mockIsAvailable = vi.fn().mockResolvedValue(true);
    mockRenderToPng = vi.fn().mockReturnValue(mockPngData);
    mockIsInitialized = vi.fn().mockReturnValue(true);

    (ClaudeCodeCLI as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => ({
      execute: mockExecute,
      isAvailable: mockIsAvailable,
    }));

    (PixelsrcRenderer as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => ({
      init: vi.fn().mockResolvedValue(undefined),
      renderToPng: mockRenderToPng,
      isInitialized: mockIsInitialized,
    }));

    (writeFile as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
    (unlink as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
    (mkdir as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

    validator = new PixelsrcVisualValidator();
  });

  describe('constructor', () => {
    it('should create with default config', () => {
      new PixelsrcVisualValidator();

      expect(ClaudeCodeCLI).toHaveBeenCalledWith({
        timeout: 60000,
        model: 'haiku',
      });
      expect(PixelsrcRenderer).toHaveBeenCalled();
    });

    it('should create with custom config', () => {
      new PixelsrcVisualValidator({
        timeout: 30000,
        model: 'sonnet',
        renderScale: 2,
      });

      expect(ClaudeCodeCLI).toHaveBeenCalledWith({
        timeout: 30000,
        model: 'sonnet',
      });
    });
  });

  describe('init', () => {
    it('should initialize renderer and create temp directory', async () => {
      await validator.init();

      const renderer = (PixelsrcRenderer as unknown as ReturnType<typeof vi.fn>).mock.results[0]
        .value;
      expect(renderer.init).toHaveBeenCalled();
      expect(mkdir).toHaveBeenCalled();
    });

    it('should handle mkdir failure gracefully', async () => {
      (mkdir as unknown as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Already exists'));

      // Should not throw
      await validator.init();
    });
  });

  describe('isAvailable', () => {
    it('should return true when renderer and CLI are available', async () => {
      mockIsInitialized.mockReturnValue(true);
      mockIsAvailable.mockResolvedValue(true);

      const result = await validator.isAvailable();

      expect(result).toBe(true);
    });

    it('should return false when renderer is not initialized', async () => {
      mockIsInitialized.mockReturnValue(false);
      mockIsAvailable.mockResolvedValue(true);

      const result = await validator.isAvailable();

      expect(result).toBe(false);
    });

    it('should return false when CLI is not available', async () => {
      mockIsInitialized.mockReturnValue(true);
      mockIsAvailable.mockResolvedValue(false);

      const result = await validator.isAvailable();

      expect(result).toBe(false);
    });
  });

  describe('validate', () => {
    const mockSource = `{"type":"palette","name":"test","colors":{}}
{"type":"sprite","name":"hero","palette":"test","grid":[]}`;

    const mockApprovedResponse = JSON.stringify({
      approved: true,
      confidence: 0.9,
      feedback: 'The pixel art matches the expected warrior portrait.',
      issues: [],
      suggestions: ['Consider adding more detail to the hair'],
    });

    const mockRejectedResponse = JSON.stringify({
      approved: false,
      confidence: 0.7,
      feedback: 'The portrait lacks key features.',
      issues: ['Missing facial features', 'Colors are too dark'],
      suggestions: ['Add eyes', 'Lighten the skin tone'],
    });

    it('should validate and approve good pixel art', async () => {
      mockExecute.mockResolvedValue(Ok({ content: mockApprovedResponse, durationMs: 1500 }));

      const result = await validator.validate(mockSource, mockValidationContext);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.approved).toBe(true);
        expect(result.value.feedback).toContain('warrior portrait');
        expect(result.value.confidence).toBe(0.9);
        expect(result.value.suggestions).toContain('Consider adding more detail to the hair');
        expect(result.value.durationMs).toBeGreaterThanOrEqual(0);
      }
    });

    it('should validate and reject poor pixel art', async () => {
      mockExecute.mockResolvedValue(Ok({ content: mockRejectedResponse, durationMs: 1200 }));

      const result = await validator.validate(mockSource, mockValidationContext);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.approved).toBe(false);
        expect(result.value.feedback).toContain('lacks key features');
        expect(result.value.issues).toContain('Missing facial features');
      }
    });

    it('should render at 4x scale by default', async () => {
      mockExecute.mockResolvedValue(Ok({ content: mockApprovedResponse, durationMs: 1000 }));

      await validator.validate(mockSource, mockValidationContext);

      expect(mockRenderToPng).toHaveBeenCalledWith(
        mockSource,
        undefined,
        expect.objectContaining({ scale: 4 })
      );
    });

    it('should render specific sprite if name provided', async () => {
      mockExecute.mockResolvedValue(Ok({ content: mockApprovedResponse, durationMs: 1000 }));

      await validator.validate(mockSource, mockValidationContext, 'hero');

      expect(mockRenderToPng).toHaveBeenCalledWith(
        mockSource,
        'hero',
        expect.objectContaining({ scale: 4 })
      );
    });

    it('should include context in validation prompt', async () => {
      mockExecute.mockResolvedValue(Ok({ content: mockApprovedResponse, durationMs: 1000 }));

      const context: VisualValidationContext = {
        expectedContent: 'A mystical wizard',
        contentType: 'portrait',
        styleRequirements: ['fantasy style', 'detailed robes'],
        colorRequirements: ['purple tones', 'gold accents'],
        strictness: 'strict',
      };

      await validator.validate(mockSource, context);

      const promptArg = mockExecute.mock.calls[0][0].prompt;
      expect(promptArg).toContain('mystical wizard');
      expect(promptArg).toContain('portrait');
      expect(promptArg).toContain('fantasy style');
      expect(promptArg).toContain('purple tones');
      expect(promptArg).toContain('strict');
    });

    it('should extract JSON from markdown code blocks', async () => {
      const wrappedResponse = `Here's my assessment:\n\`\`\`json\n${mockApprovedResponse}\n\`\`\`\n\nHope this helps!`;
      mockExecute.mockResolvedValue(Ok({ content: wrappedResponse, durationMs: 1000 }));

      const result = await validator.validate(mockSource, mockValidationContext);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.approved).toBe(true);
      }
    });

    it('should clean up temp file after validation', async () => {
      mockExecute.mockResolvedValue(Ok({ content: mockApprovedResponse, durationMs: 1000 }));

      await validator.validate(mockSource, mockValidationContext);

      expect(unlink).toHaveBeenCalled();
    });

    it('should return RENDER_FAILED error when rendering fails', async () => {
      mockRenderToPng.mockImplementation(() => {
        throw new Error('WASM render failed');
      });

      const result = await validator.validate(mockSource, mockValidationContext);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('RENDER_FAILED');
        expect(result.error.message).toContain('WASM render failed');
        expect(result.error.retryable).toBe(false);
      }
    });

    it('should return AI_ERROR when CLI fails', async () => {
      mockExecute.mockResolvedValue(
        Err({ code: 'EXECUTION_ERROR', message: 'CLI crashed', retryable: true })
      );

      const result = await validator.validate(mockSource, mockValidationContext);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('AI_ERROR');
        expect(result.error.message).toBe('CLI crashed');
        expect(result.error.retryable).toBe(true);
      }
    });

    it('should return TIMEOUT error when CLI times out', async () => {
      mockExecute.mockResolvedValue(
        Err({ code: 'TIMEOUT', message: 'Request timed out', retryable: true })
      );

      const result = await validator.validate(mockSource, mockValidationContext);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('TIMEOUT');
        expect(result.error.retryable).toBe(true);
      }
    });

    it('should return AI_UNAVAILABLE when CLI is unavailable', async () => {
      mockExecute.mockResolvedValue(
        Err({ code: 'UNAVAILABLE', message: 'CLI not found', retryable: false })
      );

      const result = await validator.validate(mockSource, mockValidationContext);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('AI_UNAVAILABLE');
        expect(result.error.retryable).toBe(false);
      }
    });

    it('should return PARSE_ERROR when response is invalid JSON', async () => {
      mockExecute.mockResolvedValue(Ok({ content: 'Not valid JSON', durationMs: 1000 }));

      const result = await validator.validate(mockSource, mockValidationContext);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('PARSE_ERROR');
        expect(result.error.retryable).toBe(true);
      }
    });

    it('should return PARSE_ERROR when response is missing required fields', async () => {
      mockExecute.mockResolvedValue(
        Ok({ content: JSON.stringify({ confidence: 0.5 }), durationMs: 1000 })
      );

      const result = await validator.validate(mockSource, mockValidationContext);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('PARSE_ERROR');
        expect(result.error.message).toContain('approved');
      }
    });

    it('should handle file write failure gracefully', async () => {
      (writeFile as unknown as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('Disk full')
      );

      const result = await validator.validate(mockSource, mockValidationContext);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('RENDER_FAILED');
        expect(result.error.message).toContain('save rendered image');
        expect(result.error.retryable).toBe(true);
      }
    });

    it('should handle unlink failure silently', async () => {
      mockExecute.mockResolvedValue(Ok({ content: mockApprovedResponse, durationMs: 1000 }));
      (unlink as unknown as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('File in use'));

      // Should not throw
      const result = await validator.validate(mockSource, mockValidationContext);

      expect(result.ok).toBe(true);
    });
  });

  describe('validation prompt', () => {
    const mockSource = '{"type":"sprite","name":"test","palette":"p","grid":[]}';
    const mockResponse = JSON.stringify({ approved: true, feedback: 'Good' });

    it('should include validation criteria in prompt', async () => {
      mockExecute.mockResolvedValue(Ok({ content: mockResponse, durationMs: 1000 }));

      await validator.validate(mockSource, mockValidationContext);

      const prompt = mockExecute.mock.calls[0][0].prompt;
      expect(prompt).toContain('Content Match');
      expect(prompt).toContain('Style Quality');
      expect(prompt).toContain('Color Harmony');
      expect(prompt).toContain('Technical Quality');
    });

    it('should request JSON output schema', async () => {
      mockExecute.mockResolvedValue(Ok({ content: mockResponse, durationMs: 1000 }));

      await validator.validate(mockSource, mockValidationContext);

      const request = mockExecute.mock.calls[0][0];
      expect(request.outputSchema).toBeDefined();
      expect(request.outputSchema.name).toBe('visual_validation_result');
      expect(request.outputSchema.schema.properties.approved).toBeDefined();
      expect(request.outputSchema.schema.properties.feedback).toBeDefined();
    });

    it('should include all content types', async () => {
      mockExecute.mockResolvedValue(Ok({ content: mockResponse, durationMs: 1000 }));

      const contentTypes: VisualValidationContext['contentType'][] = [
        'portrait',
        'scene',
        'sprite',
        'palette',
        'other',
      ];

      for (const contentType of contentTypes) {
        await validator.validate(mockSource, { ...mockValidationContext, contentType });

        const prompt = mockExecute.mock.calls.at(-1)?.[0].prompt;
        expect(prompt).toContain(`Content Type: ${contentType}`);
      }
    });
  });
});
