/**
 * Prompt Templates
 *
 * Main entry point for AI prompt generation. Provides buildPrompt() which
 * routes to the appropriate template based on context type.
 */

import type { GenerationContext } from '@reckoning/shared';

import { DM_SYSTEM_PROMPT } from './system.js';
import { buildScenePrompt, type SceneContext } from './scene.js';
import { buildPartyPrompt, type PartyContext } from './party.js';
import { buildNPCPrompt, type NPCContext } from './npc.js';
import {
  buildEnvironmentPrompt,
  type EnvironmentContext,
  type EnvironmentTrigger,
} from './environment.js';
import { formatRecentEvents } from './utils.js';

// Re-export all prompt builders and types
export { DM_SYSTEM_PROMPT } from './system.js';
export { buildScenePrompt, type SceneContext } from './scene.js';
export { buildPartyPrompt, type PartyContext } from './party.js';
export { buildNPCPrompt, type NPCContext } from './npc.js';
export {
  buildEnvironmentPrompt,
  type EnvironmentContext,
  type EnvironmentTrigger,
} from './environment.js';
export { formatRecentEvents } from './utils.js';

/**
 * Extended context for prompt building that includes type-specific data.
 *
 * This extends GenerationContext with additional fields needed by specific
 * prompt templates.
 */
export interface PromptBuildContext extends GenerationContext {
  /** Scene-specific context (for narration type) */
  sceneContext?: SceneContext;
  /** Party-specific context (for dm_continuation type) */
  partyContext?: PartyContext;
  /** NPC-specific context (for npc_response type) */
  npcContext?: NPCContext;
  /** Environment-specific context (for environment_reaction type) */
  environmentContext?: EnvironmentContext;
}

/**
 * Result of building a prompt, containing both system and user prompts.
 */
export interface BuiltPrompt {
  /** The system prompt establishing the AI's role */
  systemPrompt: string;
  /** The user prompt with specific instructions */
  userPrompt: string;
  /** Combined prompt (system + separator + user) */
  combined: string;
}

/**
 * Build a complete prompt for AI content generation.
 *
 * Routes to the appropriate template based on the context type:
 * - 'narration': Uses buildScenePrompt for scene descriptions
 * - 'npc_response': Uses buildNPCPrompt for NPC reactions
 * - 'environment_reaction': Uses buildEnvironmentPrompt for ambient events
 * - 'dm_continuation': Uses buildPartyPrompt for party suggestions
 *
 * @param context - The generation context including type and game state
 * @returns The built prompt with system and user components
 */
export function buildPrompt(context: PromptBuildContext): BuiltPrompt {
  const systemPrompt = DM_SYSTEM_PROMPT;
  let userPrompt: string;

  switch (context.type) {
    case 'narration':
      if (!context.sceneContext) {
        throw new Error('Scene context required for narration generation');
      }
      userPrompt = buildScenePrompt(context.sceneContext);
      break;

    case 'npc_response':
      if (!context.npcContext) {
        throw new Error('NPC context required for npc_response generation');
      }
      userPrompt = buildNPCPrompt(context.npcContext);
      break;

    case 'environment_reaction':
      if (!context.environmentContext) {
        throw new Error(
          'Environment context required for environment_reaction generation'
        );
      }
      userPrompt = buildEnvironmentPrompt(context.environmentContext);
      break;

    case 'dm_continuation':
      if (!context.partyContext) {
        throw new Error('Party context required for dm_continuation generation');
      }
      userPrompt = buildPartyPrompt(context.partyContext);
      break;

    default:
      throw new Error(`Unknown generation type: ${context.type}`);
  }

  const combined = `${systemPrompt}\n\n---\n\n${userPrompt}`;

  return {
    systemPrompt,
    userPrompt,
    combined,
  };
}
