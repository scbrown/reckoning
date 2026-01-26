/**
 * World Seeding Module
 *
 * Provides functionality for world generation seeded from pop culture references.
 * Uses Claude Code as a research agent to gather and synthesize source material
 * into structured WorldSeed JSON.
 */

export {
  buildResearchPrompt,
  RESEARCH_SYSTEM_PROMPT,
  WORLD_SEEDING_RESEARCH_PROMPT,
} from './research-prompt.js';
