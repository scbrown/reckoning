import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PixelsrcValidator } from '../pixelsrc/validator.js';

// Mock @pixelsrc/wasm module
vi.mock('@pixelsrc/wasm', () => ({
  validate: vi.fn(),
}));

// Get the mocked validate function
import { validate as wasmValidate } from '@pixelsrc/wasm';
const mockValidate = vi.mocked(wasmValidate);

describe('PixelsrcValidator', () => {
  let validator: PixelsrcValidator;

  beforeEach(() => {
    vi.clearAllMocks();
    validator = new PixelsrcValidator();
  });

  describe('validate', () => {
    it('should return valid=true for valid source with no diagnostics', () => {
      mockValidate.mockReturnValue([]);

      const result = validator.validate('{"type": "palette", "name": "test"}');

      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
      expect(result.warnings).toEqual([]);
      expect(mockValidate).toHaveBeenCalledWith('{"type": "palette", "name": "test"}');
    });

    it('should return valid=false when there are errors', () => {
      mockValidate.mockReturnValue([
        {
          severity: 'error',
          message: 'Invalid palette: missing colors field',
          line: 1,
          column: 15,
          code: 'E001',
        },
      ]);

      const result = validator.validate('{"type": "palette"}');

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toEqual({
        message: 'Invalid palette: missing colors field',
        line: 1,
        column: 15,
        code: 'E001',
      });
      expect(result.warnings).toEqual([]);
    });

    it('should return valid=true with warnings only', () => {
      mockValidate.mockReturnValue([
        {
          severity: 'warning',
          message: 'Unused color: --accent',
          line: 2,
        },
      ]);

      const result = validator.validate('{"type": "palette", "name": "test", "colors": {}}');

      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]).toEqual({
        message: 'Unused color: --accent',
        line: 2,
      });
    });

    it('should separate errors and warnings correctly', () => {
      mockValidate.mockReturnValue([
        { severity: 'error', message: 'Error 1', line: 1 },
        { severity: 'warning', message: 'Warning 1', line: 2 },
        { severity: 'error', message: 'Error 2', line: 3 },
        { severity: 'warning', message: 'Warning 2', line: 4 },
      ]);

      const result = validator.validate('some source');

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(2);
      expect(result.warnings).toHaveLength(2);
      expect(result.errors[0].message).toBe('Error 1');
      expect(result.errors[1].message).toBe('Error 2');
      expect(result.warnings[0].message).toBe('Warning 1');
      expect(result.warnings[1].message).toBe('Warning 2');
    });

    it('should handle empty string source', () => {
      const result = validator.validate('');

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].message).toBe('Source must be a non-empty string');
      expect(mockValidate).not.toHaveBeenCalled();
    });

    it('should handle WASM module errors', () => {
      mockValidate.mockImplementation(() => {
        throw new Error('WASM module not initialized');
      });

      const result = validator.validate('{"type": "palette"}');

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].message).toBe('Validation failed: WASM module not initialized');
      expect(result.errors[0].code).toBe('WASM_ERROR');
    });

    it('should handle non-Error exceptions', () => {
      mockValidate.mockImplementation(() => {
        throw 'String error';
      });

      const result = validator.validate('{"type": "palette"}');

      expect(result.valid).toBe(false);
      expect(result.errors[0].message).toBe('Validation failed: Unknown validation error');
    });

    it('should preserve all diagnostic fields', () => {
      mockValidate.mockReturnValue([
        {
          severity: 'error',
          message: 'Invalid token',
          line: 5,
          column: 12,
          source: '{x}',
          code: 'E002',
        },
      ]);

      const result = validator.validate('source');

      expect(result.errors[0]).toEqual({
        message: 'Invalid token',
        line: 5,
        column: 12,
        source: '{x}',
        code: 'E002',
      });
    });
  });

  describe('validateOrThrow', () => {
    it('should not throw for valid source', () => {
      mockValidate.mockReturnValue([]);

      expect(() => validator.validateOrThrow('valid source')).not.toThrow();
    });

    it('should throw for invalid source with error details', () => {
      mockValidate.mockReturnValue([
        { severity: 'error', message: 'Missing name', line: 1 },
        { severity: 'error', message: 'Invalid type', line: 2 },
      ]);

      expect(() => validator.validateOrThrow('invalid')).toThrow(
        'Pixelsrc validation failed:\nLine 1: Missing name\nLine 2: Invalid type'
      );
    });

    it('should include errors without line numbers', () => {
      mockValidate.mockReturnValue([
        { severity: 'error', message: 'General error' },
      ]);

      expect(() => validator.validateOrThrow('invalid')).toThrow(
        'Pixelsrc validation failed:\nGeneral error'
      );
    });

    it('should not throw for warnings only', () => {
      mockValidate.mockReturnValue([
        { severity: 'warning', message: 'Unused variable' },
      ]);

      expect(() => validator.validateOrThrow('source')).not.toThrow();
    });
  });
});
