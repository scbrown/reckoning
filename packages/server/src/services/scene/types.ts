import type { Scene } from '../../db/repositories/scene-repository.js';

/**
 * Scene event types for event emission
 */
export type SceneEvent =
  | { type: 'scene:created'; scene: Scene }
  | { type: 'scene:started'; scene: Scene; gameId: string }
  | { type: 'scene:completed'; scene: Scene; gameId: string }
  | { type: 'scene:abandoned'; scene: Scene; gameId: string };

/**
 * Optional event emitter interface for scene events
 */
export interface SceneEventEmitter {
  emit(event: SceneEvent): void;
}

/**
 * Summary of a scene with event counts and metadata
 */
export interface SceneSummary {
  scene: Scene;
  eventCount: number;
  isCurrentScene: boolean;
  isUnlocked: boolean;
  unlockedTurn: number | null;
}

/**
 * Input for creating a scene via SceneManager
 */
export interface CreateSceneManagedInput {
  gameId: string;
  turn: number;
  name?: string;
  description?: string;
  sceneType?: string;
  locationId?: string;
  mood?: string;
  stakes?: string;
  autoUnlock?: boolean;
  unlockedBy?: string;
}

/**
 * Input for starting a scene
 */
export interface StartSceneInput {
  gameId: string;
  sceneId: string;
  turn: number;
}

/**
 * Input for completing a scene
 */
export interface CompleteSceneInput {
  gameId: string;
  sceneId: string;
  turn: number;
}
