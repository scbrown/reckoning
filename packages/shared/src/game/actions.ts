/**
 * Action Vocabulary
 *
 * Standardized action constants and types for the structured events system.
 * These enable queryable player behavior patterns and emergence detection.
 */

// =============================================================================
// Action Categories
// =============================================================================

/**
 * Categories of actions for behavior pattern analysis
 */
export type ActionCategory =
  | 'mercy'
  | 'violence'
  | 'honesty'
  | 'social'
  | 'exploration'
  | 'character';

/**
 * All action categories as an array (useful for iteration)
 */
export const ACTION_CATEGORIES: readonly ActionCategory[] = [
  'mercy',
  'violence',
  'honesty',
  'social',
  'exploration',
  'character',
] as const;

// =============================================================================
// Action Types by Category
// =============================================================================

/**
 * Actions showing mercy or compassion
 */
export type MercyAction =
  | 'spare_enemy'
  | 'show_mercy'
  | 'forgive'
  | 'heal_enemy'
  | 'release_prisoner';

/**
 * Actions involving violence or aggression
 */
export type ViolenceAction =
  | 'kill'
  | 'execute'
  | 'attack_first'
  | 'threaten'
  | 'torture';

/**
 * Actions related to honesty and deception
 */
export type HonestyAction =
  | 'tell_truth'
  | 'confess'
  | 'reveal_secret'
  | 'keep_promise'
  | 'lie'
  | 'deceive'
  | 'break_promise'
  | 'withhold_info';

/**
 * Actions involving social interaction
 */
export type SocialAction =
  | 'help'
  | 'betray'
  | 'befriend'
  | 'insult'
  | 'intimidate'
  | 'persuade'
  | 'bribe';

/**
 * Actions related to exploration and interaction with the world
 */
export type ExplorationAction =
  | 'enter_location'
  | 'examine'
  | 'search'
  | 'steal'
  | 'unlock'
  | 'destroy';

/**
 * Actions related to character development
 */
export type CharacterAction =
  | 'level_up'
  | 'acquire_item'
  | 'use_ability'
  | 'rest'
  | 'pray'
  | 'meditate';

/**
 * Union of all standardized actions
 */
export type Action =
  | MercyAction
  | ViolenceAction
  | HonestyAction
  | SocialAction
  | ExplorationAction
  | CharacterAction;

// =============================================================================
// Action Constants by Category
// =============================================================================

/**
 * All mercy-related actions
 */
export const MERCY_ACTIONS: readonly MercyAction[] = [
  'spare_enemy',
  'show_mercy',
  'forgive',
  'heal_enemy',
  'release_prisoner',
] as const;

/**
 * All violence-related actions
 */
export const VIOLENCE_ACTIONS: readonly ViolenceAction[] = [
  'kill',
  'execute',
  'attack_first',
  'threaten',
  'torture',
] as const;

/**
 * All honesty-related actions (both honest and deceptive)
 */
export const HONESTY_ACTIONS: readonly HonestyAction[] = [
  'tell_truth',
  'confess',
  'reveal_secret',
  'keep_promise',
  'lie',
  'deceive',
  'break_promise',
  'withhold_info',
] as const;

/**
 * All social interaction actions
 */
export const SOCIAL_ACTIONS: readonly SocialAction[] = [
  'help',
  'betray',
  'befriend',
  'insult',
  'intimidate',
  'persuade',
  'bribe',
] as const;

/**
 * All exploration-related actions
 */
export const EXPLORATION_ACTIONS: readonly ExplorationAction[] = [
  'enter_location',
  'examine',
  'search',
  'steal',
  'unlock',
  'destroy',
] as const;

/**
 * All character development actions
 */
export const CHARACTER_ACTIONS: readonly CharacterAction[] = [
  'level_up',
  'acquire_item',
  'use_ability',
  'rest',
  'pray',
  'meditate',
] as const;

/**
 * All standardized actions across all categories
 */
export const ALL_ACTIONS: readonly Action[] = [
  ...MERCY_ACTIONS,
  ...VIOLENCE_ACTIONS,
  ...HONESTY_ACTIONS,
  ...SOCIAL_ACTIONS,
  ...EXPLORATION_ACTIONS,
  ...CHARACTER_ACTIONS,
] as const;

// =============================================================================
// Action-to-Category Mapping
// =============================================================================

/**
 * Map of actions to their categories
 */
export const ACTION_TO_CATEGORY: Readonly<Record<Action, ActionCategory>> = {
  // Mercy
  spare_enemy: 'mercy',
  show_mercy: 'mercy',
  forgive: 'mercy',
  heal_enemy: 'mercy',
  release_prisoner: 'mercy',
  // Violence
  kill: 'violence',
  execute: 'violence',
  attack_first: 'violence',
  threaten: 'violence',
  torture: 'violence',
  // Honesty
  tell_truth: 'honesty',
  confess: 'honesty',
  reveal_secret: 'honesty',
  keep_promise: 'honesty',
  lie: 'honesty',
  deceive: 'honesty',
  break_promise: 'honesty',
  withhold_info: 'honesty',
  // Social
  help: 'social',
  betray: 'social',
  befriend: 'social',
  insult: 'social',
  intimidate: 'social',
  persuade: 'social',
  bribe: 'social',
  // Exploration
  enter_location: 'exploration',
  examine: 'exploration',
  search: 'exploration',
  steal: 'exploration',
  unlock: 'exploration',
  destroy: 'exploration',
  // Character
  level_up: 'character',
  acquire_item: 'character',
  use_ability: 'character',
  rest: 'character',
  pray: 'character',
  meditate: 'character',
} as const;

/**
 * Map of categories to their actions
 */
export const CATEGORY_TO_ACTIONS: Readonly<Record<ActionCategory, readonly Action[]>> = {
  mercy: MERCY_ACTIONS,
  violence: VIOLENCE_ACTIONS,
  honesty: HONESTY_ACTIONS,
  social: SOCIAL_ACTIONS,
  exploration: EXPLORATION_ACTIONS,
  character: CHARACTER_ACTIONS,
} as const;

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Check if an action belongs to a specific category
 * @param action - The action to check
 * @param category - The category to check against
 * @returns true if the action belongs to the category
 */
export function isActionInCategory(action: string, category: ActionCategory): boolean {
  const categoryActions = CATEGORY_TO_ACTIONS[category];
  return categoryActions.includes(action as Action);
}

/**
 * Get the category of an action
 * @param action - The action to get the category for
 * @returns The category of the action, or undefined if the action is not recognized
 */
export function getActionCategory(action: string): ActionCategory | undefined {
  return ACTION_TO_CATEGORY[action as Action];
}

/**
 * Check if a string is a valid standardized action
 * @param action - The string to check
 * @returns true if the string is a valid action
 */
export function isValidAction(action: string): action is Action {
  return (ALL_ACTIONS as readonly string[]).includes(action);
}

/**
 * Check if a string is a valid action category
 * @param category - The string to check
 * @returns true if the string is a valid category
 */
export function isValidActionCategory(category: string): category is ActionCategory {
  return (ACTION_CATEGORIES as readonly string[]).includes(category);
}
