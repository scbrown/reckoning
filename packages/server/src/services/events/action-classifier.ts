/**
 * ActionClassifier Service
 *
 * Classifies narrative content into standardized actions from the action vocabulary.
 * Uses rule-based pattern matching for speed, with AI fallback for unclear content.
 */

import {
  type Action,
  getActionCategory,
  ALL_ACTIONS,
} from '@reckoning/shared';
import { ClaudeCodeCLI } from '../ai/claude-cli.js';
import type {
  ClassificationResult,
  ActionClassifierConfig,
  PatternMatch,
} from './types.js';

// =============================================================================
// Pattern Definitions
// =============================================================================

/**
 * Pattern definition: regex pattern mapped to action and base confidence
 */
interface PatternDef {
  pattern: RegExp;
  action: Action;
  confidence: number;
}

/**
 * Mercy action patterns
 * Note: (\w+\s+)* allows for adjectives between words
 */
const MERCY_PATTERNS: PatternDef[] = [
  // spare_enemy
  { pattern: /\b(spare[sd]?|sparing)\s+(the\s+)?(\w+\s+)*(enemy|foe|opponent|guard|soldier|bandit|creature)/i, action: 'spare_enemy', confidence: 0.9 },
  { pattern: /\b(let|lets|letting)\s+(him|her|them|it)\s+(go|live|escape)/i, action: 'spare_enemy', confidence: 0.85 },
  { pattern: /\blower(s|ed|ing)?\s+(your|the|my)\s+(sword|weapon|blade|axe)/i, action: 'spare_enemy', confidence: 0.8 },
  { pattern: /\brefuse[sd]?\s+to\s+(kill|strike|finish)/i, action: 'spare_enemy', confidence: 0.85 },
  { pattern: /\b(stay(s|ed)?|stayed)\s+(your|my|the|her|his)\s+hand/i, action: 'spare_enemy', confidence: 0.85 },

  // show_mercy
  { pattern: /\b(show(s|ed|ing)?|display(s|ed|ing)?)\s+(\w+\s+)*(mercy|compassion|kindness)/i, action: 'show_mercy', confidence: 0.9 },
  { pattern: /\b(merciful|mercifully)\b/i, action: 'show_mercy', confidence: 0.75 },
  { pattern: /\btake[sn]?\s+pity\b/i, action: 'show_mercy', confidence: 0.85 },
  { pattern: /\btook\s+pity\b/i, action: 'show_mercy', confidence: 0.85 },

  // forgive
  { pattern: /\b(forgive[sn]?|forgiving|forgave)\b/i, action: 'forgive', confidence: 0.9 },
  { pattern: /\bpardon(s|ed|ing)?\b/i, action: 'forgive', confidence: 0.85 },
  { pattern: /\blet\s+(it\s+)?go\b/i, action: 'forgive', confidence: 0.6 },

  // heal_enemy
  { pattern: /\b(heal(s|ed|ing)?|tend(s|ed|ing)?|bandage[sd]?)\s+(to\s+)?(the\s+)?(\w+\s+)*(enemy|foe|wounded|fallen)/i, action: 'heal_enemy', confidence: 0.9 },
  { pattern: /\bhelp(s|ed|ing)?\s+(the\s+)?(enemy|foe)\s+(to\s+)?(his|her|their|its)\s+feet/i, action: 'heal_enemy', confidence: 0.85 },

  // release_prisoner
  { pattern: /\b(release[sd]?|releasing|free[sd]?|freeing)\s+(the\s+)?(\w+\s+)*(prisoner|captive|hostage)/i, action: 'release_prisoner', confidence: 0.9 },
  { pattern: /\bunlock(s|ed|ing)?\s+(the\s+)?(cell|cage|chains|shackles)/i, action: 'release_prisoner', confidence: 0.8 },
  { pattern: /\bset(s|ting)?\s+(the\s+)?(\w+\s+)*(prisoner|captive|hostage)\s+free/i, action: 'release_prisoner', confidence: 0.9 },
];

/**
 * Violence action patterns
 */
const VIOLENCE_PATTERNS: PatternDef[] = [
  // kill
  { pattern: /\b(kill(s|ed|ing)?|slay(s|ed)?|slaying|slew|slain)\b/i, action: 'kill', confidence: 0.9 },
  { pattern: /\b(strike[sd]?\s+down|struck\s+down|cut[s]?\s+down)\b/i, action: 'kill', confidence: 0.85 },
  { pattern: /\b(end(s|ed)?|ending)\s+(his|her|their|its)\s+life/i, action: 'kill', confidence: 0.9 },
  { pattern: /\bdead\s+before\s+(hitting|reaching)\s+the\s+(ground|floor)/i, action: 'kill', confidence: 0.85 },

  // execute
  { pattern: /\b(execute[sd]?|executing|execution)\b/i, action: 'execute', confidence: 0.9 },
  { pattern: /\b(behead(s|ed|ing)?|beheading)\b/i, action: 'execute', confidence: 0.9 },
  { pattern: /\bfinish(es|ed)?\s+(him|her|them|it)\s+off\b/i, action: 'execute', confidence: 0.85 },

  // attack_first
  { pattern: /\b(attack(s|ed|ing)?|strike[sd]?|struck)\s+(first|before)/i, action: 'attack_first', confidence: 0.9 },
  { pattern: /\b(initiate[sd]?|initiating)\s+(the\s+)?(attack|combat|fight)/i, action: 'attack_first', confidence: 0.9 },
  { pattern: /\bcharge[sd]?\s+(at|toward|into)/i, action: 'attack_first', confidence: 0.8 },
  { pattern: /\bwithout\s+warning/i, action: 'attack_first', confidence: 0.75 },

  // threaten
  { pattern: /\b(threaten(s|ed|ing)?|intimidate[sd]?|intimidating)\b/i, action: 'threaten', confidence: 0.9 },
  { pattern: /\b(point(s|ed|ing)?|level(s|ed|ing)?|raise[sd]?)\s+(\w+\s+)*(sword|blade|weapon|knife|dagger)\s+(at|toward)/i, action: 'threaten', confidence: 0.85 },
  { pattern: /\bdemand(s|ed|ing)?\s+(with|through)\s+(violence|force)/i, action: 'threaten', confidence: 0.85 },

  // torture
  { pattern: /\b(torture[sd]?|torturing|torment(s|ed|ing)?)\b/i, action: 'torture', confidence: 0.9 },
  { pattern: /\b(inflict(s|ed|ing)?)\s+(pain|suffering|agony)/i, action: 'torture', confidence: 0.85 },
  { pattern: /\b(make[sd]?|made)\s+(him|her|them|it)\s+suffer/i, action: 'torture', confidence: 0.85 },
];

/**
 * Honesty action patterns
 */
const HONESTY_PATTERNS: PatternDef[] = [
  // tell_truth
  { pattern: /\b(tell(s|ing)?|told)\s+(the\s+)?truth/i, action: 'tell_truth', confidence: 0.9 },
  { pattern: /\b(honest(ly)?|truthful(ly)?)\s+(admit|answer|respond|reply)/i, action: 'tell_truth', confidence: 0.85 },
  { pattern: /\bspeak(s|ing)?\s+(honestly|truthfully)/i, action: 'tell_truth', confidence: 0.85 },

  // confess
  { pattern: /\b(confess(es|ed|ing)?|confession)\b/i, action: 'confess', confidence: 0.9 },
  { pattern: /\badmit(s|ted|ting)?\s+(to|the|your|my)\b/i, action: 'confess', confidence: 0.85 },
  { pattern: /\b(come[s]?|came)\s+clean\b/i, action: 'confess', confidence: 0.85 },

  // reveal_secret
  { pattern: /\b(reveal(s|ed|ing)?|disclose[sd]?|divulge[sd]?)\s+(the\s+)?secret/i, action: 'reveal_secret', confidence: 0.9 },
  { pattern: /\btell(s|ing)?\s+(the\s+)?secret/i, action: 'reveal_secret', confidence: 0.85 },
  { pattern: /\bshare[sd]?\s+(the\s+)?(hidden|secret|private)\s+(knowledge|information)/i, action: 'reveal_secret', confidence: 0.85 },

  // keep_promise
  { pattern: /\b(keep(s|ing)?|kept)\s+(the\s+|your\s+|my\s+)?promise/i, action: 'keep_promise', confidence: 0.9 },
  { pattern: /\bhonor(s|ed|ing)?\s+(the\s+|your\s+|my\s+|his\s+|her\s+|their\s+)?(promise|word|oath|vow)/i, action: 'keep_promise', confidence: 0.9 },
  { pattern: /\btrue\s+to\s+(your|my|his|her|their)\s+word/i, action: 'keep_promise', confidence: 0.85 },

  // lie
  { pattern: /\b(lie[sd]?|lying|lied)\s+(to|about)\b/i, action: 'lie', confidence: 0.9 },
  { pattern: /\btell(s|ing)?\s+(a\s+)?lie/i, action: 'lie', confidence: 0.9 },
  { pattern: /\bspeak(s|ing)?\s+false(ly|hood)?/i, action: 'lie', confidence: 0.85 },

  // deceive
  { pattern: /\b(deceive[sd]?|deceiving|deception)\b/i, action: 'deceive', confidence: 0.9 },
  { pattern: /\b(trick(s|ed|ing)?|fool(s|ed|ing)?|dupe[sd]?)\b/i, action: 'deceive', confidence: 0.85 },
  { pattern: /\b(mislead(s|ing)?|misled)\b/i, action: 'deceive', confidence: 0.85 },

  // break_promise
  { pattern: /\b(break(s|ing)?|broke|broken)\s+(the\s+|your\s+|my\s+)?promise/i, action: 'break_promise', confidence: 0.9 },
  { pattern: /\b(betray(s|ed|ing)?)\s+(the\s+|your\s+|my\s+|his\s+|her\s+|their\s+)?(trust|oath|vow)/i, action: 'break_promise', confidence: 0.85 },
  { pattern: /\bgo(es|ing)?\s+back\s+on\s+(your|my|his|her|their)\s+word/i, action: 'break_promise', confidence: 0.85 },
  { pattern: /\bwent\s+back\s+on\s+(your|my|his|her|their)\s+word/i, action: 'break_promise', confidence: 0.85 },

  // withhold_info
  { pattern: /\b(withhold(s|ing)?|withheld)\s+(the\s+)?(information|truth|secret)/i, action: 'withhold_info', confidence: 0.9 },
  { pattern: /\b(hide(s|ing)?|hid|hidden)\s+(the\s+)?truth/i, action: 'withhold_info', confidence: 0.85 },
  { pattern: /\bkeep(s|ing)?\s+(it|this)\s+(a\s+)?secret/i, action: 'withhold_info', confidence: 0.8 },
  { pattern: /\bsay(s|ing)?\s+nothing\b/i, action: 'withhold_info', confidence: 0.7 },
];

/**
 * Social action patterns
 */
const SOCIAL_PATTERNS: PatternDef[] = [
  // help
  { pattern: /\b(help(s|ed|ing)?|assist(s|ed|ing)?|aid(s|ed|ing)?)\b/i, action: 'help', confidence: 0.8 },
  { pattern: /\b(lend(s|ing)?|lent)\s+(a\s+)?hand/i, action: 'help', confidence: 0.85 },
  { pattern: /\bcome[s]?\s+to\s+(the\s+)?(aid|rescue|assistance)/i, action: 'help', confidence: 0.85 },

  // betray
  { pattern: /\b(betray(s|ed|ing)?|betrayal)\b/i, action: 'betray', confidence: 0.9 },
  { pattern: /\b(stab(s|bed|bing)?)\s+(\w+\s+)*(in\s+the\s+)?back/i, action: 'betray', confidence: 0.9 },
  { pattern: /\bturn(s|ed|ing)?\s+(on|against)\s+(your|my|his|her|their)\s+(ally|friend|companion)/i, action: 'betray', confidence: 0.9 },

  // befriend
  { pattern: /\b(befriend(s|ed|ing)?|friendship)\b/i, action: 'befriend', confidence: 0.9 },
  { pattern: /\b(make|become|became)\s+(friends|allies)/i, action: 'befriend', confidence: 0.85 },
  { pattern: /\bextend(s|ed|ing)?\s+(the\s+)?hand\s+of\s+friendship/i, action: 'befriend', confidence: 0.9 },

  // insult
  { pattern: /\b(insult(s|ed|ing)?|mock(s|ed|ing)?|ridicule[sd]?)\b/i, action: 'insult', confidence: 0.9 },
  { pattern: /\b(hurl(s|ed|ing)?|spit(s|ting)?)\s+(an?\s+)?(insult|curse|profanity)/i, action: 'insult', confidence: 0.85 },
  { pattern: /\bcall(s|ed|ing)?\s+(him|her|them|it)\s+(a\s+)?(fool|coward|idiot)/i, action: 'insult', confidence: 0.8 },

  // intimidate
  { pattern: /\b(intimidate[sd]?|intimidating|intimidation)\b/i, action: 'intimidate', confidence: 0.9 },
  { pattern: /\b(loom(s|ed|ing)?|tower(s|ed|ing)?)\s+(over|above)/i, action: 'intimidate', confidence: 0.75 },
  { pattern: /\bglar(e[sd]?|ing)\s+(menacingly|threateningly)/i, action: 'intimidate', confidence: 0.8 },

  // persuade
  { pattern: /\b(persuade[sd]?|persuading|persuasion)\b/i, action: 'persuade', confidence: 0.9 },
  { pattern: /\b(convince[sd]?|convincing)\b/i, action: 'persuade', confidence: 0.85 },
  { pattern: /\b(talk(s|ed|ing)?)\s+(\w+\s+)*(into|out\s+of)/i, action: 'persuade', confidence: 0.85 },

  // bribe
  { pattern: /\b(bribe[sd]?|bribing|bribery)\b/i, action: 'bribe', confidence: 0.9 },
  { pattern: /\boffer(s|ed|ing)?\s+(gold|coin|money|payment)\s+(for|to)/i, action: 'bribe', confidence: 0.85 },
  { pattern: /\bgrease(s|d)?\s+(the\s+)?palm/i, action: 'bribe', confidence: 0.9 },
];

/**
 * Exploration action patterns
 */
const EXPLORATION_PATTERNS: PatternDef[] = [
  // enter_location
  { pattern: /\b(enter(s|ed|ing)?)\s+(the\s+)?(\w+\s+)*(cave|dungeon|room|tavern|inn|castle|town|village|forest|temple|chamber|hall)/i, action: 'enter_location', confidence: 0.85 },
  { pattern: /\b(arrive[sd]?)\s+(at|in)\s+(the\s+)?(\w+\s+)*(cave|dungeon|room|tavern|inn|castle|town|village|forest|temple)/i, action: 'enter_location', confidence: 0.85 },
  { pattern: /\b(step(s|ped|ping)?|walk(s|ed|ing)?)\s+(into|inside|through\s+the\s+door)/i, action: 'enter_location', confidence: 0.8 },
  { pattern: /\bcross(es|ed|ing)?\s+the\s+threshold/i, action: 'enter_location', confidence: 0.85 },

  // examine
  { pattern: /\b(examine[sd]?|examining|inspect(s|ed|ing)?|study|studies|studied|studying)\b/i, action: 'examine', confidence: 0.85 },
  { pattern: /\b(look(s|ed|ing)?|peer(s|ed|ing)?)\s+(closely|carefully)\s+(at|upon)/i, action: 'examine', confidence: 0.8 },
  { pattern: /\binvestigate[sd]?\b/i, action: 'examine', confidence: 0.85 },

  // search
  { pattern: /\b(search(es|ed|ing)?|rummage[sd]?|scour(s|ed|ing)?)\b/i, action: 'search', confidence: 0.85 },
  { pattern: /\b(look(s|ed|ing)?)\s+(around|through|for)/i, action: 'search', confidence: 0.75 },
  { pattern: /\brifle[sd]?\s+through/i, action: 'search', confidence: 0.85 },

  // steal
  { pattern: /\b(steal(s|ing)?|stole|stolen|theft)\b/i, action: 'steal', confidence: 0.9 },
  { pattern: /\b(pick(s|ed|ing)?)\s+(\w+\s+)*pocket/i, action: 'steal', confidence: 0.9 },
  { pattern: /\b(take(s|ing)?|took)\s+(\w+\s+)*without\s+(permission|asking)/i, action: 'steal', confidence: 0.85 },
  { pattern: /\b(pilfer(s|ed|ing)?|purloin(s|ed|ing)?|filch(es|ed|ing)?)\b/i, action: 'steal', confidence: 0.9 },

  // unlock
  { pattern: /\b(unlock(s|ed|ing)?)\s+(the\s+)?(\w+\s+)*(door|chest|gate|box|container)/i, action: 'unlock', confidence: 0.9 },
  { pattern: /\b(pick(s|ed|ing)?)\s+(the\s+)?lock/i, action: 'unlock', confidence: 0.9 },
  { pattern: /\bopen(s|ed|ing)?\s+(the\s+)?(locked|sealed)\s+(door|chest|gate)/i, action: 'unlock', confidence: 0.85 },
  { pattern: /\buse[sd]?\s+(the\s+)?key/i, action: 'unlock', confidence: 0.8 },

  // destroy
  { pattern: /\b(destroy(s|ed|ing)?|destruction|smash(es|ed|ing)?|shatter(s|ed|ing)?)\b/i, action: 'destroy', confidence: 0.9 },
  { pattern: /\b(break(s|ing)?|broke|broken)\s+(down|apart|through|open)/i, action: 'destroy', confidence: 0.85 },
  { pattern: /\bdemolish(es|ed|ing)?\b/i, action: 'destroy', confidence: 0.9 },
];

/**
 * Character action patterns
 */
const CHARACTER_PATTERNS: PatternDef[] = [
  // level_up
  { pattern: /\b(level(s|ed|ing)?\s+up|gain(s|ed|ing)?\s+(a\s+)?level)\b/i, action: 'level_up', confidence: 0.9 },
  { pattern: /\b(grow(s|n)?|grew)\s+(stronger|more\s+powerful)/i, action: 'level_up', confidence: 0.8 },
  { pattern: /\badvance(s|d|ing)?\s+in\s+(skill|power|ability)/i, action: 'level_up', confidence: 0.8 },

  // acquire_item
  { pattern: /\b(acquire[sd]?|acquiring|obtain(s|ed|ing)?|receive[sd]?)\s+(a\s+|the\s+)?(\w+\s+)*(item|weapon|armor|artifact|sword|staff|shield|ring|amulet)/i, action: 'acquire_item', confidence: 0.85 },
  { pattern: /\b(pick(s|ed|ing)?|take(s|ing)?|took)\s+up\s+(the\s+)?(\w+\s+)*(sword|weapon|item|artifact|staff)/i, action: 'acquire_item', confidence: 0.8 },
  { pattern: /\b(find(s|ing)?|found)\s+(a\s+|the\s+)?(\w+\s+)*(valuable|magical|enchanted)/i, action: 'acquire_item', confidence: 0.75 },
  { pattern: /\badd(s|ed|ing)?\s+(\w+\s+)*to\s+(your\s+|my\s+|his\s+|her\s+|the\s+)?(inventory|pack|bag)/i, action: 'acquire_item', confidence: 0.85 },

  // use_ability
  { pattern: /\b(use[sd]?|using|cast(s|ing)?|invoke[sd]?)\s+(a\s+|the\s+|your\s+|my\s+|his\s+|her\s+)?(\w+\s+)*(ability|spell|power|skill)/i, action: 'use_ability', confidence: 0.85 },
  { pattern: /\bactivate[sd]?\s+(the\s+)?(ability|power|skill)/i, action: 'use_ability', confidence: 0.85 },
  { pattern: /\bchannel(s|ed|ing)?\s+(your|my|his|her|their)\s+(power|energy|magic)/i, action: 'use_ability', confidence: 0.8 },

  // rest
  { pattern: /\b(rest(s|ed|ing)?|sleep(s|ing)?|slept)\b/i, action: 'rest', confidence: 0.85 },
  { pattern: /\b(take(s|ing)?|took)\s+(a\s+)?(short\s+|long\s+)?rest/i, action: 'rest', confidence: 0.9 },
  { pattern: /\b(make(s)?|made|making)\s+camp/i, action: 'rest', confidence: 0.85 },
  { pattern: /\bset(s|ting)?\s+up\s+camp/i, action: 'rest', confidence: 0.85 },

  // pray
  { pattern: /\b(pray(s|ed|ing)?|prayer)\b/i, action: 'pray', confidence: 0.9 },
  { pattern: /\bkneel(s|ed|ing)?\s+(in|at|before)\s+(prayer|the\s+altar|the\s+shrine)/i, action: 'pray', confidence: 0.9 },
  { pattern: /\boffer(s|ed|ing)?\s+(a\s+)?prayer/i, action: 'pray', confidence: 0.9 },

  // meditate
  { pattern: /\b(meditate[sd]?|meditating|meditation)\b/i, action: 'meditate', confidence: 0.9 },
  { pattern: /\benter(s|ed|ing)?\s+(a\s+)?(\w+\s+)?trance/i, action: 'meditate', confidence: 0.85 },
  { pattern: /\b(focus(es|ed|ing)?|center(s|ed|ing)?)\s+(your|my|his|her|their)\s+(mind|thoughts)/i, action: 'meditate', confidence: 0.8 },
];

// =============================================================================
// ActionClassifier Class
// =============================================================================

/**
 * Service for classifying narrative content into standardized actions
 *
 * @example
 * ```typescript
 * const classifier = new ActionClassifier();
 *
 * // Synchronous rule-based classification
 * const result = classifier.classify("The hero spared the fallen guard");
 * // { action: 'spare_enemy', category: 'mercy', confidence: 0.85, usedAiFallback: false }
 *
 * // With AI fallback for unclear content
 * const result2 = await classifier.classifyWithFallback("The protagonist did something unexpected");
 * ```
 */
export class ActionClassifier {
  private config: Required<ActionClassifierConfig>;
  private aiProvider: ClaudeCodeCLI | undefined;

  constructor(config?: ActionClassifierConfig) {
    this.config = {
      minRuleConfidence: config?.minRuleConfidence ?? 0.7,
      enableAiFallback: config?.enableAiFallback ?? true,
      aiFallbackTimeout: config?.aiFallbackTimeout ?? 10000,
    };
  }

  /**
   * Classify content using only rule-based pattern matching
   *
   * This is synchronous and fast (< 1ms typically).
   *
   * @param content - The narrative content to classify
   * @returns Classification result with action and confidence
   */
  classify(content: string): ClassificationResult {
    const match = this.findBestMatch(content);

    if (match && match.confidence >= this.config.minRuleConfidence) {
      return {
        action: match.action,
        category: getActionCategory(match.action),
        confidence: match.confidence,
        usedAiFallback: false,
        matchedPattern: match.pattern,
      };
    }

    // No confident match
    return {
      action: undefined,
      category: undefined,
      confidence: match?.confidence ?? 0,
      usedAiFallback: false,
      matchedPattern: match?.pattern,
    };
  }

  /**
   * Classify content with AI fallback for unclear cases
   *
   * First tries rule-based classification. If that doesn't produce a
   * confident match, falls back to AI classification.
   *
   * @param content - The narrative content to classify
   * @returns Classification result with action and confidence
   */
  async classifyWithFallback(content: string): Promise<ClassificationResult> {
    // Try rule-based first
    const ruleResult = this.classify(content);

    if (ruleResult.action) {
      return ruleResult;
    }

    // Fall back to AI if enabled
    if (!this.config.enableAiFallback) {
      return ruleResult;
    }

    return this.aiClassify(content);
  }

  /**
   * Classify using AI
   *
   * Uses Claude CLI to analyze the content and determine the action.
   *
   * @param content - The narrative content to classify
   * @returns Classification result from AI
   */
  async aiClassify(content: string): Promise<ClassificationResult> {
    if (!this.aiProvider) {
      this.aiProvider = new ClaudeCodeCLI({
        timeout: this.config.aiFallbackTimeout,
        model: 'haiku',
      });
    }

    const prompt = this.buildAiPrompt(content);

    const result = await this.aiProvider.execute({
      prompt,
      outputSchema: {
        name: 'action_classification',
        schema: {
          type: 'object',
          properties: {
            action: {
              type: 'string',
              enum: [...ALL_ACTIONS],
              description: 'The standardized action that best describes the content',
            },
            confidence: {
              type: 'number',
              minimum: 0,
              maximum: 1,
              description: 'Confidence score from 0 to 1',
            },
            reasoning: {
              type: 'string',
              description: 'Brief explanation of why this action was chosen',
            },
          },
          required: ['action', 'confidence'],
        },
      },
    });

    if (!result.ok) {
      console.error('[ActionClassifier] AI classification failed:', result.error);
      return {
        action: undefined,
        category: undefined,
        confidence: 0,
        usedAiFallback: true,
      };
    }

    try {
      const parsed = JSON.parse(result.value.content) as {
        action?: string;
        confidence?: number;
      };

      if (parsed.action && ALL_ACTIONS.includes(parsed.action as Action)) {
        return {
          action: parsed.action as Action,
          category: getActionCategory(parsed.action),
          confidence: parsed.confidence ?? 0.7,
          usedAiFallback: true,
        };
      }
    } catch {
      console.error('[ActionClassifier] Failed to parse AI response:', result.value.content);
    }

    return {
      action: undefined,
      category: undefined,
      confidence: 0,
      usedAiFallback: true,
    };
  }

  // ===========================================================================
  // Pattern Matching Methods
  // ===========================================================================

  /**
   * Check if content matches any mercy patterns
   */
  matchesMercyPatterns(content: string): PatternMatch | undefined {
    return this.matchCategory(content, MERCY_PATTERNS);
  }

  /**
   * Check if content matches any violence patterns
   */
  matchesViolencePatterns(content: string): PatternMatch | undefined {
    return this.matchCategory(content, VIOLENCE_PATTERNS);
  }

  /**
   * Check if content matches any honesty patterns
   */
  matchesHonestyPatterns(content: string): PatternMatch | undefined {
    return this.matchCategory(content, HONESTY_PATTERNS);
  }

  /**
   * Check if content matches any social patterns
   */
  matchesSocialPatterns(content: string): PatternMatch | undefined {
    return this.matchCategory(content, SOCIAL_PATTERNS);
  }

  /**
   * Check if content matches any exploration patterns
   */
  matchesExplorationPatterns(content: string): PatternMatch | undefined {
    return this.matchCategory(content, EXPLORATION_PATTERNS);
  }

  /**
   * Check if content matches any character patterns
   */
  matchesCharacterPatterns(content: string): PatternMatch | undefined {
    return this.matchCategory(content, CHARACTER_PATTERNS);
  }

  // ===========================================================================
  // Private Methods
  // ===========================================================================

  /**
   * Find the best matching action across all categories
   */
  private findBestMatch(content: string): PatternMatch | undefined {
    const matches: PatternMatch[] = [];

    // Check all categories
    const mercyMatch = this.matchesMercyPatterns(content);
    if (mercyMatch) matches.push(mercyMatch);

    const violenceMatch = this.matchesViolencePatterns(content);
    if (violenceMatch) matches.push(violenceMatch);

    const honestyMatch = this.matchesHonestyPatterns(content);
    if (honestyMatch) matches.push(honestyMatch);

    const socialMatch = this.matchesSocialPatterns(content);
    if (socialMatch) matches.push(socialMatch);

    const explorationMatch = this.matchesExplorationPatterns(content);
    if (explorationMatch) matches.push(explorationMatch);

    const characterMatch = this.matchesCharacterPatterns(content);
    if (characterMatch) matches.push(characterMatch);

    // Return highest confidence match
    if (matches.length === 0) {
      return undefined;
    }

    return matches.reduce((best, current) =>
      current.confidence > best.confidence ? current : best
    );
  }

  /**
   * Match content against a category's patterns
   */
  private matchCategory(content: string, patterns: PatternDef[]): PatternMatch | undefined {
    let bestMatch: PatternMatch | undefined;

    for (const { pattern, action, confidence } of patterns) {
      if (pattern.test(content)) {
        if (!bestMatch || confidence > bestMatch.confidence) {
          bestMatch = {
            action,
            confidence,
            pattern: pattern.source,
          };
        }
      }
    }

    return bestMatch;
  }

  /**
   * Build the AI classification prompt
   */
  private buildAiPrompt(content: string): string {
    return `Classify the following narrative content into one of these standardized actions.

Action categories and their actions:

MERCY (compassionate actions):
- spare_enemy: Choosing not to kill a defeated foe
- show_mercy: Displaying compassion or kindness
- forgive: Pardoning someone for wrongdoing
- heal_enemy: Tending to a wounded enemy
- release_prisoner: Freeing a captive

VIOLENCE (aggressive actions):
- kill: Taking a life
- execute: Performing a deliberate killing
- attack_first: Initiating combat
- threaten: Intimidating with violence
- torture: Inflicting pain deliberately

HONESTY (truth and deception):
- tell_truth: Being honest
- confess: Admitting wrongdoing
- reveal_secret: Sharing hidden information
- keep_promise: Honoring a commitment
- lie: Speaking falsehood
- deceive: Misleading someone
- break_promise: Failing to honor a commitment
- withhold_info: Hiding information

SOCIAL (interpersonal actions):
- help: Assisting someone
- betray: Turning against an ally
- befriend: Forming a friendship
- insult: Verbally attacking someone
- intimidate: Using presence to cow
- persuade: Convincing through argument
- bribe: Offering payment for favors

EXPLORATION (world interaction):
- enter_location: Going to a new place
- examine: Looking closely at something
- search: Looking for something
- steal: Taking without permission
- unlock: Opening something locked
- destroy: Breaking or demolishing

CHARACTER (development):
- level_up: Growing in power
- acquire_item: Getting new equipment
- use_ability: Employing a skill or power
- rest: Taking time to recover
- pray: Offering devotion
- meditate: Focusing the mind

Content to classify:
"""
${content}
"""

Respond with JSON containing the action that best describes the main action in this content.`;
  }
}
