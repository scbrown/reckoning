/**
 * Pixelsrc Visual Validator
 *
 * AI-powered visual validation service for pixelsrc rendered output.
 * Renders source at higher scale and uses Claude to evaluate the quality
 * and appropriateness of the generated pixel art.
 */

import { writeFile, unlink, mkdir } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { randomBytes } from 'crypto';
import type { Result } from '@reckoning/shared';
import { ClaudeCodeCLI, type ClaudeCLIConfig } from '../ai/claude-cli.js';
import { PixelsrcRenderer, type RenderOptions } from './renderer.js';

// =============================================================================
// Visual Validation Types
// =============================================================================

/**
 * Context for visual validation - describes what the pixel art should depict
 */
export interface VisualValidationContext {
  /** What the pixel art is supposed to represent */
  expectedContent: string;
  /** Type of pixel art (portrait, scene, sprite, etc.) */
  contentType: 'portrait' | 'scene' | 'sprite' | 'palette' | 'other';
  /** Optional style requirements */
  styleRequirements?: string[];
  /** Optional color requirements */
  colorRequirements?: string[];
  /** Strictness of validation (lenient accepts more variations) */
  strictness?: 'lenient' | 'normal' | 'strict';
}

/**
 * Result of visual validation
 */
export interface VisualValidationResult {
  /** Whether the rendered output is approved */
  approved: boolean;
  /** AI feedback about the rendered output */
  feedback: string;
  /** Confidence score (0-1) if available */
  confidence?: number;
  /** Specific issues found, if any */
  issues?: string[];
  /** Suggestions for improvement */
  suggestions?: string[];
  /** Duration of validation in milliseconds */
  durationMs: number;
}

/**
 * Error from visual validation
 */
export interface VisualValidationError {
  /** Error code */
  code: 'RENDER_FAILED' | 'AI_UNAVAILABLE' | 'AI_ERROR' | 'PARSE_ERROR' | 'TIMEOUT';
  /** Error message */
  message: string;
  /** Whether the error is retryable */
  retryable: boolean;
}

/**
 * Configuration for PixelsrcVisualValidator
 */
export interface PixelsrcVisualValidatorConfig {
  /** Timeout for AI calls in milliseconds (default: 60000) */
  timeout?: number;
  /** Model to use for validation (default: 'haiku') */
  model?: string;
  /** Scale factor for rendering (default: 4) */
  renderScale?: number;
  /** Temporary directory for rendered images (default: os.tmpdir()) */
  tempDir?: string;
}

// =============================================================================
// Visual Validation Prompt Template
// =============================================================================

const VISUAL_VALIDATION_PROMPT = `You are a pixel art quality evaluator. Your task is to analyze a rendered pixel art image and determine if it meets the expected requirements.

## Validation Criteria

1. **Content Match**: Does the image depict what was expected?
2. **Style Quality**: Is the pixel art well-crafted with appropriate detail level?
3. **Color Harmony**: Are the colors appropriate and harmonious?
4. **Technical Quality**: Are there rendering artifacts, missing elements, or obvious errors?

## Response Format

You MUST respond with valid JSON matching this exact structure:
{
  "approved": boolean,
  "confidence": number between 0 and 1,
  "feedback": "brief overall assessment",
  "issues": ["list of specific problems, if any"],
  "suggestions": ["list of improvement suggestions, if any"]
}

## Important Notes

- Be practical: pixel art is inherently low-resolution and abstract
- Focus on whether the art serves its purpose, not perfection
- Consider the content type when evaluating (portraits need facial features, scenes need atmosphere, etc.)
- A "lenient" strictness means accept reasonable interpretations
- A "strict" strictness means require close adherence to requirements`;

// =============================================================================
// PixelsrcVisualValidator Implementation
// =============================================================================

/**
 * AI-powered visual validator for pixelsrc rendered output.
 *
 * Renders source at 4x scale and uses Claude to evaluate whether the
 * generated pixel art meets quality and content requirements.
 *
 * @example
 * ```typescript
 * const validator = new PixelsrcVisualValidator();
 * await validator.init();
 *
 * const result = await validator.validate(pxlSource, {
 *   expectedContent: 'A brave warrior with golden hair',
 *   contentType: 'portrait',
 *   strictness: 'normal',
 * });
 *
 * if (result.ok && result.value.approved) {
 *   console.log('Pixel art approved:', result.value.feedback);
 * }
 * ```
 */
export class PixelsrcVisualValidator {
  private cli: ClaudeCodeCLI;
  private renderer: PixelsrcRenderer;
  private config: Required<PixelsrcVisualValidatorConfig>;
  private tempDirCreated = false;

  constructor(config?: PixelsrcVisualValidatorConfig) {
    const cliConfig: ClaudeCLIConfig = {
      timeout: config?.timeout ?? 60000,
      model: config?.model ?? 'haiku',
    };

    this.cli = new ClaudeCodeCLI(cliConfig);
    this.renderer = new PixelsrcRenderer();
    this.config = {
      timeout: config?.timeout ?? 60000,
      model: config?.model ?? 'haiku',
      renderScale: config?.renderScale ?? 4,
      tempDir: config?.tempDir ?? join(tmpdir(), 'pixelsrc-validation'),
    };
  }

  /**
   * Initialize the validator (loads WASM renderer).
   * Must be called before validate().
   */
  async init(): Promise<void> {
    await this.renderer.init();

    // Ensure temp directory exists
    if (!this.tempDirCreated) {
      try {
        await mkdir(this.config.tempDir, { recursive: true });
        this.tempDirCreated = true;
      } catch {
        // Directory may already exist
        this.tempDirCreated = true;
      }
    }
  }

  /**
   * Check if the validator is ready (renderer and AI available).
   */
  async isAvailable(): Promise<boolean> {
    return this.renderer.isInitialized() && (await this.cli.isAvailable());
  }

  /**
   * Validate rendered pixelsrc output using AI vision.
   *
   * @param source - The .pxl source content (JSONL format)
   * @param context - Context describing what the pixel art should depict
   * @param spriteName - Optional specific sprite to validate
   * @returns Result with VisualValidationResult on success, VisualValidationError on failure
   */
  async validate(
    source: string,
    context: VisualValidationContext,
    spriteName?: string
  ): Promise<Result<VisualValidationResult, VisualValidationError>> {
    const startTime = Date.now();

    // Step 1: Render the source to PNG
    let pngData: Uint8Array;
    try {
      const renderOptions: RenderOptions = {
        scale: this.config.renderScale,
      };
      pngData = this.renderer.renderToPng(source, spriteName, renderOptions);
    } catch (error) {
      return {
        ok: false,
        error: {
          code: 'RENDER_FAILED',
          message: `Failed to render source: ${error instanceof Error ? error.message : String(error)}`,
          retryable: false,
        },
      };
    }

    // Step 2: Save PNG to temp file
    const tempFileName = `validation-${randomBytes(8).toString('hex')}.png`;
    const tempFilePath = join(this.config.tempDir, tempFileName);

    try {
      await writeFile(tempFilePath, pngData);
    } catch (error) {
      return {
        ok: false,
        error: {
          code: 'RENDER_FAILED',
          message: `Failed to save rendered image: ${error instanceof Error ? error.message : String(error)}`,
          retryable: true,
        },
      };
    }

    // Step 3: Build validation prompt with image reference
    const prompt = this.buildValidationPrompt(context, tempFilePath);

    // Step 4: Send to Claude for evaluation
    const aiResult = await this.cli.execute({
      prompt,
      outputSchema: {
        name: 'visual_validation_result',
        schema: {
          type: 'object',
          properties: {
            approved: { type: 'boolean' },
            confidence: { type: 'number', minimum: 0, maximum: 1 },
            feedback: { type: 'string' },
            issues: { type: 'array', items: { type: 'string' } },
            suggestions: { type: 'array', items: { type: 'string' } },
          },
          required: ['approved', 'feedback'],
        },
      },
    });

    // Clean up temp file
    try {
      await unlink(tempFilePath);
    } catch {
      // Ignore cleanup errors
    }

    const durationMs = Date.now() - startTime;

    if (!aiResult.ok) {
      const errorCode =
        aiResult.error.code === 'TIMEOUT'
          ? 'TIMEOUT'
          : aiResult.error.code === 'UNAVAILABLE'
            ? 'AI_UNAVAILABLE'
            : 'AI_ERROR';

      return {
        ok: false,
        error: {
          code: errorCode,
          message: aiResult.error.message,
          retryable: aiResult.error.retryable,
        },
      };
    }

    // Step 5: Parse AI response
    try {
      const parsed = this.parseValidationResponse(aiResult.value.content);
      return {
        ok: true,
        value: {
          ...parsed,
          durationMs,
        },
      };
    } catch (error) {
      return {
        ok: false,
        error: {
          code: 'PARSE_ERROR',
          message: `Failed to parse AI response: ${error instanceof Error ? error.message : String(error)}`,
          retryable: true,
        },
      };
    }
  }

  /**
   * Build the validation prompt with context and image reference.
   */
  private buildValidationPrompt(
    context: VisualValidationContext,
    imagePath: string
  ): string {
    const styleReqs = context.styleRequirements?.length
      ? `\nStyle Requirements: ${context.styleRequirements.join(', ')}`
      : '';

    const colorReqs = context.colorRequirements?.length
      ? `\nColor Requirements: ${context.colorRequirements.join(', ')}`
      : '';

    const strictness = context.strictness ?? 'normal';

    return `${VISUAL_VALIDATION_PROMPT}

## Image to Validate

[Image file: ${imagePath}]

## Validation Request

Content Type: ${context.contentType}
Expected Content: ${context.expectedContent}${styleReqs}${colorReqs}
Strictness: ${strictness}

Please evaluate the pixel art image and provide your assessment in the specified JSON format.`;
  }

  /**
   * Parse the AI response into a VisualValidationResult.
   */
  private parseValidationResponse(content: string): Omit<VisualValidationResult, 'durationMs'> {
    // Try to extract JSON from the response
    let jsonContent = content.trim();

    // Handle markdown code blocks
    const codeBlockMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeBlockMatch && codeBlockMatch[1] !== undefined) {
      jsonContent = codeBlockMatch[1].trim();
    }

    // Try to find JSON object
    const jsonMatch = jsonContent.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      jsonContent = jsonMatch[0];
    }

    const parsed = JSON.parse(jsonContent) as {
      approved?: boolean;
      confidence?: number;
      feedback?: string;
      issues?: string[];
      suggestions?: string[];
    };

    // Validate required fields
    if (typeof parsed.approved !== 'boolean') {
      throw new Error('Response missing required "approved" field');
    }
    if (typeof parsed.feedback !== 'string') {
      throw new Error('Response missing required "feedback" field');
    }

    const result: Omit<VisualValidationResult, 'durationMs'> = {
      approved: parsed.approved,
      feedback: parsed.feedback,
    };

    if (typeof parsed.confidence === 'number') {
      result.confidence = parsed.confidence;
    }
    if (Array.isArray(parsed.issues)) {
      result.issues = parsed.issues;
    }
    if (Array.isArray(parsed.suggestions)) {
      result.suggestions = parsed.suggestions;
    }

    return result;
  }
}
