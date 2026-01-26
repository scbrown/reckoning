/**
 * View Types
 *
 * Types for filtered game state returned by view routes.
 */

/**
 * Avatar information for party view
 */
export interface PartyAvatar {
  id: string;
  name: string;
  pixelArtRef?: {
    path: string;
    spriteName: string;
  };
}

/**
 * Scene display info (public fields only)
 */
export interface SceneDisplay {
  id: string;
  name: string | null;
  sceneType: string | null;
  mood?: string;
}

/**
 * Area display info for party view
 */
export interface AreaDisplay {
  id: string;
  name: string;
  description: string;
}

/**
 * Filtered game state for party view
 * Display-only - no controls, no hidden data
 */
export interface PartyViewState {
  /** Narration text */
  narration: string[];
  /** Character avatars (display info only) */
  avatars: PartyAvatar[];
  /** Current scene info (public fields only) */
  scene: SceneDisplay | null;
  /** Current area display info */
  area: AreaDisplay | null;
}
