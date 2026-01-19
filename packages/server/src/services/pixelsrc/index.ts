/**
 * Pixelsrc Service
 *
 * WASM-based services for pixelsrc pixel art rendering, validation,
 * and project management.
 */

export {
  PixelsrcRenderer,
  PixelsrcRenderError,
  type RenderOptions,
  type RenderResult,
} from './renderer.js';

export {
  PixelsrcGenerator,
  PixelsrcAIGenerator,
  type SceneGenerationContext,
  type SceneGenerationPrompt,
  type SceneArchetype,
  type PortraitGenerationContext,
  type AISceneGenerationContext,
  type PaletteGenerationContext,
  type AIGenerationResult,
  type AIGenerationError,
  type PixelsrcAIGeneratorConfig,
} from './generator.js';

export {
  PIXELSRC_FORMAT_PRIMER,
  PORTRAIT_GENERATION_PRIMER,
  SCENE_GENERATION_PRIMER,
  PALETTE_GENERATION_PRIMER,
  getPrimer,
} from './primer.js';

export {
  PixelsrcValidator,
  type ValidationResult,
  type ValidationError,
  type ValidationWarning,
  type ValidationSeverity,
} from './validator.js';

export {
  PixelsrcRepairer,
  type RepairContext,
  type RepairResult,
  type RepairError,
  type RepairerConfig,
} from './repairer.js';

export {
  PixelsrcVisualValidator,
  type VisualValidationContext,
  type VisualValidationResult,
  type VisualValidationError,
  type PixelsrcVisualValidatorConfig,
} from './visual-validator.js';
