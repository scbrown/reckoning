/**
 * Pixelsrc Validator
 *
 * WASM-based validation service for pixelsrc source files.
 * Validates .pxl source and returns structured errors and warnings.
 */

/**
 * Severity level for validation diagnostics.
 */
export type ValidationSeverity = 'error' | 'warning';

/**
 * A validation error from the pixelsrc validator.
 * Errors indicate invalid source that cannot be rendered.
 */
export interface ValidationError {
  /** Error message describing the issue */
  message: string;
  /** Line number where the error occurred (1-indexed), if available */
  line?: number;
  /** Column number where the error occurred (1-indexed), if available */
  column?: number;
  /** The problematic source text, if available */
  source?: string;
  /** Error code for programmatic handling */
  code?: string;
}

/**
 * A validation warning from the pixelsrc validator.
 * Warnings indicate potential issues but the source can still be rendered.
 */
export interface ValidationWarning {
  /** Warning message describing the issue */
  message: string;
  /** Line number where the warning occurred (1-indexed), if available */
  line?: number;
  /** Column number where the warning occurred (1-indexed), if available */
  column?: number;
  /** The problematic source text, if available */
  source?: string;
  /** Warning code for programmatic handling */
  code?: string;
}

/**
 * Result of validating pixelsrc source.
 */
export interface ValidationResult {
  /** Whether the source is valid (no errors) */
  valid: boolean;
  /** Errors that prevent rendering */
  errors: ValidationError[];
  /** Warnings that don't prevent rendering */
  warnings: ValidationWarning[];
}

/**
 * Raw diagnostic from the WASM validator.
 * This interface represents the expected output from @pixelsrc/wasm validate().
 */
interface WasmDiagnostic {
  severity: 'error' | 'warning';
  message: string;
  line?: number;
  column?: number;
  source?: string;
  code?: string;
}

// Type for the WASM validate function
type WasmValidateFn = (source: string) => WasmDiagnostic[];

// Lazy-loaded WASM module reference
let wasmValidate: WasmValidateFn | null = null;
let wasmLoadError: Error | null = null;
let wasmLoadAttempted = false;

/**
 * Reset module state for testing.
 * @internal
 */
export function _resetModuleState(): void {
  wasmValidate = null;
  wasmLoadError = null;
  wasmLoadAttempted = false;
}

/**
 * Attempt to load the @pixelsrc/wasm module.
 * Returns the validate function or null if not available.
 */
async function loadWasmModule(): Promise<WasmValidateFn | null> {
  if (wasmLoadAttempted) {
    return wasmValidate;
  }
  wasmLoadAttempted = true;

  try {
    // Dynamic import to allow graceful failure when package not installed
    const wasm = await import('@stiwi/pixelsrc-wasm');
    wasmValidate = wasm.validate;
    return wasmValidate;
  } catch (error) {
    wasmLoadError = error instanceof Error ? error : new Error(String(error));
    return null;
  }
}

/**
 * Validates pixelsrc source files using the WASM module.
 *
 * The WASM module is loaded lazily on first use. If the @pixelsrc/wasm
 * package is not installed, validation will return an error indicating
 * the module is not available.
 *
 * @example
 * ```typescript
 * const validator = new PixelsrcValidator();
 *
 * // Initialize the WASM module (optional, happens automatically on first validate)
 * await validator.init();
 *
 * const result = validator.validate(pxlSource);
 * if (!result.valid) {
 *   console.error('Validation failed:', result.errors);
 * }
 * ```
 */
export class PixelsrcValidator {
  private initPromise: Promise<void> | null = null;

  /**
   * Initialize the WASM module.
   * This is called automatically on first validate() call, but can be
   * called explicitly for eager initialization.
   *
   * @returns Promise that resolves when initialization is complete
   */
  async init(): Promise<void> {
    if (!this.initPromise) {
      this.initPromise = loadWasmModule().then(() => {});
    }
    return this.initPromise;
  }

  /**
   * Check if the WASM module is available.
   *
   * @returns true if the module is loaded and ready
   */
  isAvailable(): boolean {
    return wasmValidate !== null;
  }

  /**
   * Validate pixelsrc source.
   *
   * If the WASM module hasn't been loaded yet, this will attempt to load it.
   * If the module is not available, returns an error result.
   *
   * @param source - The .pxl source content (JSONL format)
   * @returns Validation result with errors and warnings
   */
  validate(source: string): ValidationResult {
    if (!source || typeof source !== 'string') {
      return {
        valid: false,
        errors: [{ message: 'Source must be a non-empty string' }],
        warnings: [],
      };
    }

    // Check if WASM module is available
    if (!wasmValidate) {
      // If we haven't tried loading, the caller should use init() first
      // or use validateAsync() for automatic loading
      const errorMsg = wasmLoadError
        ? `WASM module failed to load: ${wasmLoadError.message}`
        : '@pixelsrc/wasm module not loaded. Call init() first or use validateAsync().';
      return {
        valid: false,
        errors: [{ message: errorMsg, code: 'WASM_NOT_LOADED' }],
        warnings: [],
      };
    }

    try {
      // Call the WASM validate function
      const diagnostics: WasmDiagnostic[] = wasmValidate(source);

      // Separate errors from warnings
      const errors: ValidationError[] = [];
      const warnings: ValidationWarning[] = [];

      for (const diag of diagnostics) {
        const diagnostic = {
          message: diag.message,
          line: diag.line,
          column: diag.column,
          source: diag.source,
          code: diag.code,
        };

        if (diag.severity === 'error') {
          errors.push(diagnostic);
        } else {
          warnings.push(diagnostic);
        }
      }

      return {
        valid: errors.length === 0,
        errors,
        warnings,
      };
    } catch (error) {
      // Handle WASM runtime errors
      const message = error instanceof Error ? error.message : 'Unknown validation error';
      return {
        valid: false,
        errors: [{ message: `Validation failed: ${message}`, code: 'WASM_ERROR' }],
        warnings: [],
      };
    }
  }

  /**
   * Validate pixelsrc source with automatic WASM initialization.
   *
   * Ensures the WASM module is loaded before validating.
   *
   * @param source - The .pxl source content (JSONL format)
   * @returns Promise resolving to validation result
   */
  async validateAsync(source: string): Promise<ValidationResult> {
    await this.init();
    return this.validate(source);
  }

  /**
   * Validate source and throw if invalid.
   * Convenience method for cases where validation failure should be an exception.
   *
   * @param source - The .pxl source content
   * @throws Error with details if validation fails
   */
  validateOrThrow(source: string): void {
    const result = this.validate(source);
    if (!result.valid) {
      const errorMessages = result.errors.map(e => {
        if (e.line !== undefined) {
          return `Line ${e.line}: ${e.message}`;
        }
        return e.message;
      });
      throw new Error(`Pixelsrc validation failed:\n${errorMessages.join('\n')}`);
    }
  }

  /**
   * Validate source asynchronously and throw if invalid.
   *
   * @param source - The .pxl source content
   * @throws Error with details if validation fails
   */
  async validateOrThrowAsync(source: string): Promise<void> {
    await this.init();
    this.validateOrThrow(source);
  }
}
