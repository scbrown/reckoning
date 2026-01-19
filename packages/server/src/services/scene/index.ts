/**
 * Scene Service
 *
 * Coordinates scene lifecycle and availability tracking.
 */

export { SceneManager, type SceneManagerConfig } from './scene-manager.js';
export type {
  SceneEvent,
  SceneEventEmitter,
  SceneSummary,
  CreateSceneManagedInput,
  StartSceneInput,
  CompleteSceneInput,
  RequirementContext,
} from './types.js';
