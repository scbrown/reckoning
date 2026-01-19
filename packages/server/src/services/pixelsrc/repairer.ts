/**
 * Pixelsrc Repairer
 *
 * AI-powered repair service that fixes invalid pixelsrc source files.
 * Uses validation errors to guide the AI in making corrections.
 */

import { Result, Ok, Err } from '@reckoning/shared';
import type { AIProvider } from '../ai/types.js';
import type { ValidationResult, ValidationError } from './validator.js';

/**
 * Context for the repair operation.
 * Provides additional information to help the AI understand what the source should contain.
 */
export interface RepairContext {
  /** Description of what the pixelsrc file should represent */
  description?: string;
  /** Expected archetype (e.g., 'tavern', 'forest') */
  archetype?: string;
  /** Original prompt used to generate the source (if available) */
  originalPrompt?: string;
}

/**
 * Result of a repair attempt.
 */
export interface RepairResult {
  /** Whether the repair was successful (source is now valid) */
  success: boolean;
  /** The final source after repair attempts */
  source: string;
  /** Number of repair attempts made */
  attempts: number;
  /** Errors from the final validation (empty if successful) */
  remainingErrors: ValidationError[];
}

/**
 * Error from the repair operation.
 */
export interface RepairError {
  /** Error code for programmatic handling */
  code: 'AI_UNAVAILABLE' | 'AI_ERROR' | 'MAX_RETRIES_EXCEEDED';
  /** Human-readable error message */
  message: string;
}

/**
 * Configuration for the repairer.
 */
export interface RepairerConfig {
  /** Maximum number of repair attempts (default: 3) */
  maxAttempts?: number;
}

const DEFAULT_CONFIG: Required<RepairerConfig> = {
  maxAttempts: 3,
};

/**
 * Build the repair prompt for the AI.
 */
function buildRepairPrompt(
  source: string,
  validationResult: ValidationResult,
  context: RepairContext
): string {
  const errorList = validationResult.errors
    .map((e) => {
      const location = e.line ? `Line ${e.line}${e.column ? `:${e.column}` : ''}` : 'Unknown location';
      return `- ${location}: ${e.message}${e.code ? ` (${e.code})` : ''}`;
    })
    .join('\n');

  const contextInfo = [];
  if (context.description) {
    contextInfo.push(`Description: ${context.description}`);
  }
  if (context.archetype) {
    contextInfo.push(`Scene type: ${context.archetype}`);
  }
  if (context.originalPrompt) {
    contextInfo.push(`Original generation prompt:\n${context.originalPrompt}`);
  }

  const contextSection = contextInfo.length > 0
    ? `\nContext:\n${contextInfo.join('\n')}\n`
    : '';

  return `Fix the following pixelsrc source file that has validation errors.

Pixelsrc is a JSONL format for pixel art where each line is a JSON object.
Common object types:
- {"type": "palette", "name": "...", "colors": {"--name": "#hex", ...}}
- {"type": "sprite", "name": "...", "width": N, "height": N, "pixels": [...]}

Validation errors:
${errorList}
${contextSection}
Invalid source:
\`\`\`
${source}
\`\`\`

Instructions:
1. Fix ALL the validation errors listed above
2. Preserve the original intent of the pixel art
3. Output ONLY the corrected pixelsrc source (no explanations)
4. Each line must be valid JSON
5. Ensure all required fields are present for each object type

Output the fixed pixelsrc source:`;
}

/**
 * Pixelsrc Repairer service.
 *
 * Uses AI to repair invalid pixelsrc source files based on validation errors.
 * Implements a retry loop with up to 3 attempts (configurable).
 *
 * @example
 * ```typescript
 * const repairer = new PixelsrcRepairer(aiProvider);
 * const validator = new PixelsrcValidator();
 *
 * const validationResult = validator.validate(source);
 * if (!validationResult.valid) {
 *   const result = await repairer.repair(source, validationResult, {
 *     description: 'A cozy tavern interior',
 *     archetype: 'tavern',
 *   });
 *
 *   if (result.ok && result.value.success) {
 *     console.log('Repaired source:', result.value.source);
 *   }
 * }
 * ```
 */
export class PixelsrcRepairer {
  private aiProvider: AIProvider;
  private config: Required<RepairerConfig>;
  private validator: { validate: (source: string) => ValidationResult } | null = null;

  /**
   * Create a new PixelsrcRepairer.
   *
   * @param aiProvider - The AI provider to use for repair operations
   * @param config - Optional configuration
   */
  constructor(aiProvider: AIProvider, config?: RepairerConfig) {
    this.aiProvider = aiProvider;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Set the validator to use for re-validation after repair.
   * If not set, repair() will not re-validate the output.
   *
   * @param validator - Object with a validate method
   */
  setValidator(validator: { validate: (source: string) => ValidationResult }): void {
    this.validator = validator;
  }

  /**
   * Repair invalid pixelsrc source using AI.
   *
   * Makes up to maxAttempts (default 3) repair attempts, re-validating after each.
   * Returns as soon as the source becomes valid or max attempts are exhausted.
   *
   * @param source - The invalid pixelsrc source to repair
   * @param validationResult - The validation result containing errors
   * @param context - Optional context to help guide the repair
   * @returns Result with RepairResult on success, RepairError on failure
   */
  async repair(
    source: string,
    validationResult: ValidationResult,
    context: RepairContext = {}
  ): Promise<Result<RepairResult, RepairError>> {
    // Check AI availability
    const isAvailable = await this.aiProvider.isAvailable();
    if (!isAvailable) {
      return Err({
        code: 'AI_UNAVAILABLE',
        message: 'AI provider is not available for repair operations',
      });
    }

    let currentSource = source;
    let currentValidation = validationResult;
    let attempts = 0;

    while (attempts < this.config.maxAttempts) {
      attempts++;

      // Build repair prompt
      const prompt = buildRepairPrompt(currentSource, currentValidation, context);

      // Execute AI repair
      const aiResult = await this.aiProvider.execute({ prompt });

      if (!aiResult.ok) {
        return Err({
          code: 'AI_ERROR',
          message: `AI repair failed: ${aiResult.error.message}`,
        });
      }

      // Extract the repaired source from AI response
      const repairedSource = this.extractSource(aiResult.value.content);
      currentSource = repairedSource;

      // Re-validate if validator is set
      if (this.validator) {
        currentValidation = this.validator.validate(currentSource);

        if (currentValidation.valid) {
          return Ok({
            success: true,
            source: currentSource,
            attempts,
            remainingErrors: [],
          });
        }
      } else {
        // Without validator, return after first attempt
        return Ok({
          success: true,
          source: currentSource,
          attempts,
          remainingErrors: [],
        });
      }
    }

    // Max retries exceeded
    return Ok({
      success: false,
      source: currentSource,
      attempts,
      remainingErrors: currentValidation.errors,
    });
  }

  /**
   * Extract the pixelsrc source from AI response.
   * Handles responses wrapped in code blocks or with explanatory text.
   */
  private extractSource(aiResponse: string): string {
    // Try to extract from code block
    const codeBlockMatch = aiResponse.match(/```(?:jsonl?)?\n?([\s\S]*?)```/);
    if (codeBlockMatch && codeBlockMatch[1] !== undefined) {
      return codeBlockMatch[1].trim();
    }

    // Try to find JSON lines (each line starting with {)
    const lines = aiResponse.split('\n');
    const jsonLines = lines.filter((line) => line.trim().startsWith('{'));
    if (jsonLines.length > 0) {
      return jsonLines.join('\n');
    }

    // Return trimmed response as-is
    return aiResponse.trim();
  }
}
