import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Ok, Err } from '@reckoning/shared';
import { PixelsrcRepairer } from '../pixelsrc/repairer.js';
import type { AIProvider, AIResponse, AIError } from '../ai/types.js';
import type { ValidationResult } from '../pixelsrc/validator.js';

// Mock AI provider
function createMockAIProvider(
  responses: Array<{ ok: true; content: string } | { ok: false; error: AIError }>
): AIProvider {
  let callIndex = 0;
  return {
    name: 'mock-ai',
    async execute() {
      const response = responses[callIndex] || responses[responses.length - 1];
      callIndex++;
      if (response.ok) {
        return Ok<AIResponse, AIError>({
          content: response.content,
          durationMs: 100,
        });
      }
      return Err<AIResponse, AIError>(response.error);
    },
    async isAvailable() {
      return true;
    },
  };
}

// Mock validator
function createMockValidator(
  results: ValidationResult[]
): { validate: (source: string) => ValidationResult } {
  let callIndex = 0;
  return {
    validate() {
      const result = results[callIndex] || results[results.length - 1];
      callIndex++;
      return result;
    },
  };
}

describe('PixelsrcRepairer', () => {
  describe('repair', () => {
    it('should repair source on first attempt when AI fixes the issue', async () => {
      const aiProvider = createMockAIProvider([
        { ok: true, content: '{"type": "palette", "name": "test", "colors": {}}' },
      ]);
      const validator = createMockValidator([
        { valid: true, errors: [], warnings: [] },
      ]);

      const repairer = new PixelsrcRepairer(aiProvider);
      repairer.setValidator(validator);

      const invalidSource = '{"type": "palette"}';
      const validationResult: ValidationResult = {
        valid: false,
        errors: [{ message: 'Missing name field', line: 1 }],
        warnings: [],
      };

      const result = await repairer.repair(invalidSource, validationResult);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.success).toBe(true);
        expect(result.value.attempts).toBe(1);
        expect(result.value.source).toBe('{"type": "palette", "name": "test", "colors": {}}');
        expect(result.value.remainingErrors).toEqual([]);
      }
    });

    it('should retry up to 3 times when validation keeps failing', async () => {
      const aiProvider = createMockAIProvider([
        { ok: true, content: '{"type": "palette", "name": "test"}' },
        { ok: true, content: '{"type": "palette", "name": "test", "colors": []}' },
        { ok: true, content: '{"type": "palette", "name": "test", "colors": {}}' },
      ]);
      const validator = createMockValidator([
        { valid: false, errors: [{ message: 'Missing colors' }], warnings: [] },
        { valid: false, errors: [{ message: 'Colors must be object' }], warnings: [] },
        { valid: true, errors: [], warnings: [] },
      ]);

      const repairer = new PixelsrcRepairer(aiProvider);
      repairer.setValidator(validator);

      const validationResult: ValidationResult = {
        valid: false,
        errors: [{ message: 'Missing name' }],
        warnings: [],
      };

      const result = await repairer.repair('invalid', validationResult);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.success).toBe(true);
        expect(result.value.attempts).toBe(3);
      }
    });

    it('should return success=false after max retries with remaining errors', async () => {
      const aiProvider = createMockAIProvider([
        { ok: true, content: 'still invalid' },
        { ok: true, content: 'still invalid' },
        { ok: true, content: 'still invalid' },
      ]);
      const validator = createMockValidator([
        { valid: false, errors: [{ message: 'Error 1' }], warnings: [] },
        { valid: false, errors: [{ message: 'Error 2' }], warnings: [] },
        { valid: false, errors: [{ message: 'Error 3' }], warnings: [] },
      ]);

      const repairer = new PixelsrcRepairer(aiProvider);
      repairer.setValidator(validator);

      const validationResult: ValidationResult = {
        valid: false,
        errors: [{ message: 'Initial error' }],
        warnings: [],
      };

      const result = await repairer.repair('invalid', validationResult);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.success).toBe(false);
        expect(result.value.attempts).toBe(3);
        expect(result.value.remainingErrors).toHaveLength(1);
        expect(result.value.remainingErrors[0].message).toBe('Error 3');
      }
    });

    it('should return AI_UNAVAILABLE error when provider is not available', async () => {
      const aiProvider: AIProvider = {
        name: 'unavailable-ai',
        async execute() {
          return Err({ code: 'UNAVAILABLE', message: 'Not available', retryable: false });
        },
        async isAvailable() {
          return false;
        },
      };

      const repairer = new PixelsrcRepairer(aiProvider);

      const validationResult: ValidationResult = {
        valid: false,
        errors: [{ message: 'Error' }],
        warnings: [],
      };

      const result = await repairer.repair('invalid', validationResult);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('AI_UNAVAILABLE');
      }
    });

    it('should return AI_ERROR when AI execution fails', async () => {
      const aiProvider = createMockAIProvider([
        { ok: false, error: { code: 'EXECUTION_ERROR', message: 'AI failed', retryable: false } },
      ]);

      const repairer = new PixelsrcRepairer(aiProvider);

      const validationResult: ValidationResult = {
        valid: false,
        errors: [{ message: 'Error' }],
        warnings: [],
      };

      const result = await repairer.repair('invalid', validationResult);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('AI_ERROR');
        expect(result.error.message).toContain('AI failed');
      }
    });

    it('should extract source from code blocks in AI response', async () => {
      const aiProvider = createMockAIProvider([
        {
          ok: true,
          content: `Here's the fixed source:

\`\`\`jsonl
{"type": "palette", "name": "fixed"}
{"type": "sprite", "name": "main"}
\`\`\`

The errors have been fixed.`,
        },
      ]);
      const validator = createMockValidator([
        { valid: true, errors: [], warnings: [] },
      ]);

      const repairer = new PixelsrcRepairer(aiProvider);
      repairer.setValidator(validator);

      const validationResult: ValidationResult = {
        valid: false,
        errors: [{ message: 'Error' }],
        warnings: [],
      };

      const result = await repairer.repair('invalid', validationResult);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.source).toBe('{"type": "palette", "name": "fixed"}\n{"type": "sprite", "name": "main"}');
      }
    });

    it('should extract JSON lines from mixed AI response', async () => {
      const aiProvider = createMockAIProvider([
        {
          ok: true,
          content: `Fixed the errors:
{"type": "palette", "name": "test"}
{"type": "sprite", "name": "main"}
Done!`,
        },
      ]);
      const validator = createMockValidator([
        { valid: true, errors: [], warnings: [] },
      ]);

      const repairer = new PixelsrcRepairer(aiProvider);
      repairer.setValidator(validator);

      const validationResult: ValidationResult = {
        valid: false,
        errors: [{ message: 'Error' }],
        warnings: [],
      };

      const result = await repairer.repair('invalid', validationResult);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.source).toBe('{"type": "palette", "name": "test"}\n{"type": "sprite", "name": "main"}');
      }
    });

    it('should return success after first attempt without validator', async () => {
      const aiProvider = createMockAIProvider([
        { ok: true, content: '{"type": "palette", "name": "test"}' },
      ]);

      const repairer = new PixelsrcRepairer(aiProvider);
      // Note: not setting validator

      const validationResult: ValidationResult = {
        valid: false,
        errors: [{ message: 'Error' }],
        warnings: [],
      };

      const result = await repairer.repair('invalid', validationResult);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.success).toBe(true);
        expect(result.value.attempts).toBe(1);
      }
    });

    it('should use context in repair prompt', async () => {
      let capturedPrompt = '';
      const aiProvider: AIProvider = {
        name: 'capture-ai',
        async execute(request) {
          capturedPrompt = request.prompt;
          return Ok<AIResponse, AIError>({
            content: '{"type": "palette", "name": "test"}',
            durationMs: 100,
          });
        },
        async isAvailable() {
          return true;
        },
      };
      const validator = createMockValidator([
        { valid: true, errors: [], warnings: [] },
      ]);

      const repairer = new PixelsrcRepairer(aiProvider);
      repairer.setValidator(validator);

      const validationResult: ValidationResult = {
        valid: false,
        errors: [{ message: 'Missing field', line: 1, code: 'E001' }],
        warnings: [],
      };

      await repairer.repair('invalid', validationResult, {
        description: 'A cozy tavern',
        archetype: 'tavern',
        originalPrompt: 'Generate a tavern scene',
      });

      expect(capturedPrompt).toContain('A cozy tavern');
      expect(capturedPrompt).toContain('tavern');
      expect(capturedPrompt).toContain('Generate a tavern scene');
      expect(capturedPrompt).toContain('Missing field');
      expect(capturedPrompt).toContain('E001');
    });

    it('should respect custom maxAttempts configuration', async () => {
      const aiProvider = createMockAIProvider([
        { ok: true, content: 'attempt 1' },
        { ok: true, content: 'attempt 2' },
      ]);
      const validator = createMockValidator([
        { valid: false, errors: [{ message: 'Error' }], warnings: [] },
        { valid: false, errors: [{ message: 'Error' }], warnings: [] },
      ]);

      const repairer = new PixelsrcRepairer(aiProvider, { maxAttempts: 2 });
      repairer.setValidator(validator);

      const validationResult: ValidationResult = {
        valid: false,
        errors: [{ message: 'Error' }],
        warnings: [],
      };

      const result = await repairer.repair('invalid', validationResult);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.success).toBe(false);
        expect(result.value.attempts).toBe(2);
      }
    });
  });
});
