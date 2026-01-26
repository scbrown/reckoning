/**
 * Shared Display Components
 *
 * View-agnostic components that can be used by DM, Player, and Party views.
 * These components receive filtered state from the view layer rather than
 * subscribing to global state directly.
 */

// Avatar rendering
export {
  AvatarStage,
  AnimatedAvatar, // backwards compatibility
  type AvatarStageConfig,
  type AnimatedAvatarConfig, // backwards compatibility
  type AvatarAnimationState,
} from './avatar-stage.js';

// Scene background rendering
export {
  SceneBackground,
  type SceneBackgroundConfig,
  type SceneAnimationState,
} from './scene-background.js';

// Narrative history display
export {
  NarrationDisplay,
  type NarrationDisplayConfig,
} from './narration-display.js';

// Speech bubble overlay
export {
  SpeechBubble,
  type SpeechBubbleConfig,
  type SpeechBubbleCallbacks,
} from './speech-bubble.js';
