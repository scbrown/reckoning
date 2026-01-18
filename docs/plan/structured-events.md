# Phase B: Structured Events

## Goal

Enhance the events system to support queryable patterns, enabling the Pattern Engine and emergence detection.

## Why This Phase?

Structured events enable:
- Query player behavior patterns (mercy ratio, violence tendency)
- Detect emergence opportunities (NPC becoming villain)
- Richer AI context (what has the player actually done, not just narrative)
- Foundation for Phase C scene boundaries

## Prerequisites

- Phase A (Entity Evolution) should be complete
- Existing events table works, we're extending it

## Database Schema

### Events Table Extension

```sql
-- Add columns to existing events table
ALTER TABLE events ADD COLUMN event_type TEXT;
ALTER TABLE events ADD COLUMN action TEXT;
ALTER TABLE events ADD COLUMN actor_type TEXT;
ALTER TABLE events ADD COLUMN actor_id TEXT;
ALTER TABLE events ADD COLUMN target_type TEXT;
ALTER TABLE events ADD COLUMN target_id TEXT;
ALTER TABLE events ADD COLUMN witnesses TEXT;  -- JSON array
ALTER TABLE events ADD COLUMN tags TEXT;       -- JSON array

-- Indexes for query patterns
CREATE INDEX idx_events_action ON events(game_id, action);
CREATE INDEX idx_events_actor ON events(game_id, actor_type, actor_id);
CREATE INDEX idx_events_type ON events(game_id, event_type);
```

### Event Types

```typescript
enum EventType {
  // Player-initiated
  PlayerChoice = 'player_choice',      // Explicit choice from options
  PlayerAction = 'player_action',      // Free-form player action
  PlayerDialogue = 'player_dialogue',  // Player speaks

  // NPC-initiated
  NPCAction = 'npc_action',
  NPCDialogue = 'npc_dialogue',

  // World events
  WorldEvent = 'world_event',          // Environment changes
  Discovery = 'discovery',             // Player learns something
  Arrival = 'arrival',                 // Enter new area
  Departure = 'departure',             // Leave area

  // Conflict
  CombatStart = 'combat_start',
  CombatAction = 'combat_action',
  CombatEnd = 'combat_end',

  // System
  Narration = 'narration',             // Pure narrative, no action
  SceneTransition = 'scene_transition', // Phase C integration
}
```

### Action Vocabulary

Standardized action strings for queryability:

```typescript
// Mercy-related
'spare_enemy' | 'show_mercy' | 'forgive' | 'heal_enemy' | 'release_prisoner'

// Violence-related
'kill' | 'execute' | 'attack_first' | 'threaten' | 'torture'

// Honesty-related
'tell_truth' | 'confess' | 'reveal_secret' | 'keep_promise'
'lie' | 'deceive' | 'break_promise' | 'withhold_info'

// Social
'help' | 'betray' | 'befriend' | 'insult' | 'intimidate' | 'persuade' | 'bribe'

// Exploration
'enter_location' | 'examine' | 'search' | 'steal' | 'unlock' | 'destroy'

// Character
'level_up' | 'acquire_item' | 'use_ability' | 'rest' | 'pray' | 'meditate'
```

## Services

### EventBuilder

Constructs structured events from AI output:

```typescript
// packages/server/src/services/events/event-builder.ts

export class EventBuilder {
  constructor(private actionClassifier: ActionClassifier) {}

  // Parse AI-generated content into structured event
  async buildFromGeneration(params: {
    gameId: string;
    turn: number;
    content: string;
    generationType: string;
    metadata?: GenerationMetadata;
  }): Promise<StructuredEvent> {
    const { content, metadata } = params;

    // Extract action from content or metadata
    const action = metadata?.action ||
      await this.actionClassifier.classify(content);

    // Determine actor
    const actor = this.determineActor(params.generationType, metadata);

    // Extract targets from content or metadata
    const targets = metadata?.targets ||
      await this.extractTargets(content);

    // Extract witnesses (NPCs present who aren't actor/target)
    const witnesses = metadata?.witnesses ||
      await this.extractWitnesses(content, actor, targets);

    // Generate tags for flexible querying
    const tags = this.generateTags(action, content);

    return {
      id: generateId(),
      game_id: params.gameId,
      turn: params.turn,
      event_type: this.classifyEventType(params.generationType, action),
      action,
      actor_type: actor.type,
      actor_id: actor.id,
      target_type: targets[0]?.type,
      target_id: targets[0]?.id,
      witnesses: JSON.stringify(witnesses),
      tags: JSON.stringify(tags),
      content,
      timestamp: new Date().toISOString(),
    };
  }

  private generateTags(action: string, content: string): string[] {
    const tags: string[] = [];

    // Action category tags
    if (['spare_enemy', 'show_mercy', 'forgive'].includes(action)) {
      tags.push('mercy', 'moral_choice');
    }
    if (['kill', 'execute', 'attack_first'].includes(action)) {
      tags.push('violence', 'lethal');
    }
    if (['lie', 'deceive', 'betray'].includes(action)) {
      tags.push('deception', 'moral_choice');
    }

    // Content-based tags (simple keyword detection)
    if (content.toLowerCase().includes('innocent')) tags.push('involves_innocent');
    if (content.toLowerCase().includes('child')) tags.push('involves_child');

    return tags;
  }
}
```

### ActionClassifier

Classifies narrative content into standardized actions:

```typescript
// packages/server/src/services/events/action-classifier.ts

export class ActionClassifier {
  // Rule-based classification with AI fallback
  async classify(content: string): Promise<string> {
    const lower = content.toLowerCase();

    // Rule-based matching
    if (this.matchesMercyPatterns(lower)) return 'show_mercy';
    if (this.matchesKillPatterns(lower)) return 'kill';
    if (this.matchesDeceptionPatterns(lower)) return 'deceive';
    // ... more patterns

    // Fallback: ask AI to classify
    return this.aiClassify(content);
  }

  private matchesMercyPatterns(content: string): boolean {
    const patterns = [
      /spare[sd]?\s+(the\s+)?/,
      /let\s+(them|him|her|it)\s+(go|live)/,
      /show(ed|s|ing)?\s+mercy/,
      /forgave|forgive/,
    ];
    return patterns.some(p => p.test(content));
  }

  private async aiClassify(content: string): Promise<string> {
    // Call AI with action vocabulary, get classification
    // Cache results for similar content
  }
}
```

### Enhanced EventRepository

```typescript
// packages/server/src/db/repositories/event-repository.ts

export class EventRepository {
  // ... existing methods ...

  // NEW: Query by action
  async findByActions(
    gameId: string,
    actions: string[]
  ): Promise<StructuredEvent[]> {
    return this.db.prepare(`
      SELECT * FROM events
      WHERE game_id = ? AND action IN (${actions.map(() => '?').join(',')})
      ORDER BY turn ASC
    `).all(gameId, ...actions);
  }

  // NEW: Count actions
  async countByActions(gameId: string, actions: string[]): Promise<number> {
    const result = this.db.prepare(`
      SELECT COUNT(*) as count FROM events
      WHERE game_id = ? AND action IN (${actions.map(() => '?').join(',')})
    `).get(gameId, ...actions);
    return result.count;
  }

  // NEW: Query by actor
  async findByActor(
    gameId: string,
    actorType: EntityType,
    actorId: string
  ): Promise<StructuredEvent[]> {
    return this.db.prepare(`
      SELECT * FROM events
      WHERE game_id = ? AND actor_type = ? AND actor_id = ?
      ORDER BY turn ASC
    `).all(gameId, actorType, actorId);
  }

  // NEW: Query by target
  async findByTarget(
    gameId: string,
    targetType: EntityType,
    targetId: string
  ): Promise<StructuredEvent[]> {
    return this.db.prepare(`
      SELECT * FROM events
      WHERE game_id = ? AND target_type = ? AND target_id = ?
      ORDER BY turn ASC
    `).all(gameId, targetType, targetId);
  }

  // NEW: Find witnesses
  async findWitnessedBy(
    gameId: string,
    witnessType: EntityType,
    witnessId: string
  ): Promise<StructuredEvent[]> {
    // JSON search in witnesses array
    const witnessRef = JSON.stringify({ type: witnessType, id: witnessId });
    return this.db.prepare(`
      SELECT * FROM events
      WHERE game_id = ? AND witnesses LIKE ?
      ORDER BY turn ASC
    `).all(gameId, `%${witnessRef}%`);
  }

  // NEW: Query by tag
  async findByTag(gameId: string, tag: string): Promise<StructuredEvent[]> {
    return this.db.prepare(`
      SELECT * FROM events
      WHERE game_id = ? AND tags LIKE ?
      ORDER BY turn ASC
    `).all(gameId, `%"${tag}"%`);
  }

  // NEW: Get action summary for entity
  async getActionSummary(
    gameId: string,
    actorType: EntityType,
    actorId: string
  ): Promise<Record<string, number>> {
    const results = this.db.prepare(`
      SELECT action, COUNT(*) as count FROM events
      WHERE game_id = ? AND actor_type = ? AND actor_id = ?
      GROUP BY action
    `).all(gameId, actorType, actorId);

    return Object.fromEntries(results.map(r => [r.action, r.count]));
  }
}
```

### PatternObserver

Analyzes player behavior patterns:

```typescript
// packages/server/src/services/observers/pattern-observer.ts

export interface PlayerPatterns {
  mercyRatio: number;        // 0-1, mercy actions / (mercy + lethal)
  honestyRatio: number;      // 0-1, honest actions / (honest + deceptive)
  violenceInitiation: number; // 0-1, how often player attacks first
  explorationTendency: number; // 0-1, examine/search vs direct action
  socialApproach: 'aggressive' | 'diplomatic' | 'mixed';
  dominantTraits: string[];  // Most consistent behavior patterns
}

export class PatternObserver {
  constructor(private eventRepo: EventRepository) {}

  async getPlayerPatterns(gameId: string, playerId: string): Promise<PlayerPatterns> {
    const summary = await this.eventRepo.getActionSummary(gameId, 'player', playerId);

    const mercyActions = (summary['spare_enemy'] || 0) +
                         (summary['show_mercy'] || 0) +
                         (summary['forgive'] || 0);
    const lethalActions = (summary['kill'] || 0) +
                          (summary['execute'] || 0);

    const honestActions = (summary['tell_truth'] || 0) +
                          (summary['confess'] || 0) +
                          (summary['keep_promise'] || 0);
    const deceptiveActions = (summary['lie'] || 0) +
                             (summary['deceive'] || 0) +
                             (summary['break_promise'] || 0);

    return {
      mercyRatio: this.ratio(mercyActions, mercyActions + lethalActions),
      honestyRatio: this.ratio(honestActions, honestActions + deceptiveActions),
      violenceInitiation: await this.calculateViolenceInitiation(gameId, playerId),
      explorationTendency: await this.calculateExplorationTendency(gameId, playerId),
      socialApproach: this.classifySocialApproach(summary),
      dominantTraits: this.inferDominantTraits(summary),
    };
  }

  private ratio(a: number, total: number): number {
    return total === 0 ? 0.5 : a / total;
  }

  private inferDominantTraits(summary: Record<string, number>): string[] {
    const traits: string[] = [];

    const mercyCount = (summary['spare_enemy'] || 0) + (summary['show_mercy'] || 0);
    const lethalCount = (summary['kill'] || 0) + (summary['execute'] || 0);

    if (mercyCount >= 3 && mercyCount > lethalCount * 2) {
      traits.push('merciful');
    }
    if (lethalCount >= 3 && lethalCount > mercyCount * 2) {
      traits.push('ruthless');
    }

    // ... more trait inference

    return traits;
  }
}
```

### EmergenceObserver

Detects narrative emergence opportunities:

```typescript
// packages/server/src/services/observers/emergence-observer.ts

export class EmergenceObserver {
  constructor(
    private eventRepo: EventRepository,
    private relationshipRepo: RelationshipRepository,
    private traitRepo: TraitRepository,
    private aiService: AIService
  ) {}

  async onEventCommitted(event: StructuredEvent): Promise<EmergenceOpportunity[]> {
    const opportunities: EmergenceOpportunity[] = [];

    // Check for villain emergence
    if (event.target_type === 'npc') {
      const villainOpp = await this.checkVillainEmergence(
        event.game_id,
        event.target_type,
        event.target_id!
      );
      if (villainOpp) opportunities.push(villainOpp);
    }

    // Check for ally emergence (NPC who witnessed player's good deed)
    if (event.witnesses) {
      const witnesses = JSON.parse(event.witnesses);
      for (const witness of witnesses) {
        if (witness.type === 'npc') {
          const allyOpp = await this.checkAllyEmergence(
            event.game_id,
            event,
            witness
          );
          if (allyOpp) opportunities.push(allyOpp);
        }
      }
    }

    return opportunities;
  }

  private async checkVillainEmergence(
    gameId: string,
    entityType: EntityType,
    entityId: string
  ): Promise<EmergenceOpportunity | null> {
    // Get relationship with player
    const rel = await this.relationshipRepo.findBetween(
      gameId,
      { type: entityType, id: entityId },
      { type: 'player', id: 'player' }
    );

    if (!rel) return null;

    // Villain conditions: high resentment + either high fear or broken trust
    if (rel.resentment >= 0.6 && (rel.fear >= 0.5 || rel.trust <= 0.2)) {
      // Get context for AI evaluation
      const history = await this.eventRepo.findByTarget(gameId, entityType, entityId);
      const traits = await this.traitRepo.findByEntity(gameId, entityType, entityId);

      return {
        type: 'villain_emergence',
        entityType,
        entityId,
        confidence: this.calculateConfidence(rel, history.length),
        context: {
          relationship: rel,
          recentEvents: history.slice(-5),
          traits: traits.map(t => t.trait),
        },
      };
    }

    return null;
  }
}
```

## Integration Points

### ContentPipeline Changes

```typescript
// In content-pipeline.ts

async generateContent(gameId: string, type: GenerationType): Promise<GeneratedContent> {
  const content = await this.aiService.generate(prompt);

  // NEW: Build structured event
  const structuredEvent = await this.eventBuilder.buildFromGeneration({
    gameId,
    turn: game.turn,
    content: content.text,
    generationType: type,
    metadata: content.metadata,
  });

  // Commit with structured fields
  await this.stateManager.commitEvent(structuredEvent);

  // NEW: Check for emergence opportunities
  const opportunities = await this.emergenceObserver.onEventCommitted(structuredEvent);
  if (opportunities.length > 0) {
    await this.queueEmergenceOpportunities(gameId, opportunities);
  }

  return content;
}
```

### AI Prompt Changes

Request structured metadata from AI:

```
## Output Format

Return JSON with both narrative and structured metadata:

{
  "narrative": "The guard captain watches as you lower your sword...",
  "metadata": {
    "action": "spare_enemy",
    "actor": { "type": "player", "id": "player" },
    "targets": [{ "type": "npc", "id": "guard_captain" }],
    "witnesses": [{ "type": "npc", "id": "soldier_1" }],
    "tags": ["mercy", "moral_choice", "public"]
  }
}
```

## Tasks

### Database
- [ ] Create migration to add columns to events table
- [ ] Add indexes for query performance
- [ ] Backfill existing events with null structured fields

### Services
- [ ] Implement EventBuilder
- [ ] Implement ActionClassifier (rule-based + AI fallback)
- [ ] Implement PatternObserver
- [ ] Implement EmergenceObserver
- [ ] Add service tests

### Repository
- [ ] Add structured query methods to EventRepository
- [ ] Add tests for new query methods

### Integration
- [ ] Update ContentPipeline to use EventBuilder
- [ ] Update AI prompts to request structured metadata
- [ ] Wire EmergenceObserver to event commits
- [ ] Add emergence opportunities to DM notifications

### Context Building
- [ ] Add player patterns to generation context
- [ ] Add emergence opportunities to context
- [ ] Update ContextBuilder tests

## Acceptance Criteria

- [ ] Events have structured fields (action, actor, target, witnesses, tags)
- [ ] Actions classified from narrative content
- [ ] Can query events by action, actor, target, tag
- [ ] Player patterns computed from event history
- [ ] Emergence opportunities detected and queued for DM
- [ ] AI receives player patterns in generation context
- [ ] All existing event functionality unchanged
