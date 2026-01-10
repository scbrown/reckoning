/**
 * Game Service Types
 *
 * Local types for the game API service.
 */

/**
 * A saved game slot
 */
export interface SaveSlot {
  /** Unique identifier for this save slot */
  id: string;
  /** ID of the game this save belongs to */
  gameId: string;
  /** Display name for the save */
  name: string;
  /** When the save was created */
  createdAt: string;
  /** Turn number when saved */
  turn: number;
  /** Current location name when saved */
  location: string;
}
