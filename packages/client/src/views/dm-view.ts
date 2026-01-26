/**
 * DM View Component
 *
 * The complete DM interface at /game/:id/view/dm
 *
 * Contains all existing functionality:
 * - Beat editor
 * - Evolution approval panel
 * - Emergence notifications
 * - Scene controls
 * - All entity traits (including hidden)
 * - Full game controls
 * - Party View preview pane
 */

import type { GameStateManager } from '../state/index.js';
import type { SSEService } from '../services/sse/index.js';
import type { GameService, CreateSceneDTO } from '../services/game/index.js';
import type { TTSService } from '../services/tts/index.js';
import type { AvatarManager } from '../services/avatar-manager/index.js';

// UI Components
import { DMEditor } from '../components/dm-editor.js';
import { Controls } from '../components/controls.js';
import { NarratorOutput } from '../components/narrator-output.js';
import { PlaybackControls } from '../components/playback-controls.js';
import { PartyPanel } from '../components/party-panel.js';
import { AreaPanel } from '../components/area-panel.js';
import { StatusBar } from '../components/status-bar.js';
import { BeatEditor } from '../components/beat-editor.js';
import { SpeechBubble } from '../components/shared/index.js';
import { EvolutionApprovalPanel, type PendingEvolution } from '../components/evolution-approval-panel.js';
import { ScenePanel } from '../components/scene-panel.js';
import { PartyViewPreview } from './party-view-preview.js';

import type { PlaybackMode } from '@reckoning/shared';

/**
 * Configuration for DM View
 */
export interface DMViewConfig {
  containerId: string;
}

/**
 * Services required by DM View
 */
export interface DMViewServices {
  stateManager: GameStateManager;
  sseService: SSEService;
  gameService: GameService;
  ttsService: TTSService;
  avatarManager: AvatarManager;
}

/**
 * Callbacks for DM View actions
 */
export interface DMViewCallbacks {
  onShowLoading: (show: boolean, main?: string, detail?: string) => void;
  onUpdateLoadingStatus: (main: string, detail?: string) => void;
  onShowError: (message: string) => void;
  onNavigateToMenu: () => void;
}

/**
 * DM View - The complete DM interface
 */
export class DMView {
  private container: HTMLElement | null;
  private services: DMViewServices;
  private callbacks: DMViewCallbacks;

  // UI Components
  private dmEditor: DMEditor | null = null;
  private controls: Controls | null = null;
  private narratorOutput: NarratorOutput | null = null;
  private playbackControls: PlaybackControls | null = null;
  private partyPanel: PartyPanel | null = null;
  private areaPanel: AreaPanel | null = null;
  private statusBar: StatusBar | null = null;
  private beatEditor: BeatEditor | null = null;
  private speechBubble: SpeechBubble | null = null;
  private evolutionPanel: EvolutionApprovalPanel | null = null;
  private scenePanel: ScenePanel | null = null;
  private partyViewPreview: PartyViewPreview | null = null;

  private unsubscribers: (() => void)[] = [];
  private intervalIds: number[] = [];

  constructor(
    config: DMViewConfig,
    services: DMViewServices,
    callbacks: DMViewCallbacks
  ) {
    this.container = document.getElementById(config.containerId);
    this.services = services;
    this.callbacks = callbacks;
    this.injectStyles();
  }

  // ===========================================================================
  // Public API
  // ===========================================================================

  /**
   * Mount the view and initialize all components
   */
  mount(): void {
    if (!this.container) return;

    // Render the view structure
    this.render();

    // Initialize all UI components
    this.initializeComponents();

    // Set up event handlers
    this.setupEventHandlers();

    // Subscribe to state changes
    this.setupStateSubscriptions();
  }

  /**
   * Unmount the view and cleanup all components
   */
  unmount(): void {
    // Cleanup subscriptions
    for (const unsub of this.unsubscribers) {
      unsub();
    }
    this.unsubscribers = [];

    // Clear intervals
    for (const id of this.intervalIds) {
      clearInterval(id);
    }
    this.intervalIds = [];

    // Destroy components
    this.dmEditor?.destroy();
    this.controls?.destroy();
    this.narratorOutput?.destroy();
    this.playbackControls?.destroy();
    this.partyPanel?.destroy();
    this.areaPanel?.destroy();
    this.statusBar?.destroy();
    this.beatEditor?.destroy();
    this.speechBubble?.destroy();
    this.evolutionPanel?.destroy();
    this.scenePanel?.destroy();
    this.partyViewPreview?.destroy();

    // Clear all avatar instances
    this.services.avatarManager.clearAll();

    // Clear component references
    this.dmEditor = null;
    this.controls = null;
    this.narratorOutput = null;
    this.playbackControls = null;
    this.partyPanel = null;
    this.areaPanel = null;
    this.statusBar = null;
    this.beatEditor = null;
    this.speechBubble = null;
    this.evolutionPanel = null;
    this.scenePanel = null;
    this.partyViewPreview = null;

    // Clear container
    if (this.container) {
      this.container.innerHTML = '';
    }
  }

  /**
   * Trigger initial content generation after game start
   */
  async startGame(): Promise<void> {
    try {
      this.callbacks.onUpdateLoadingStatus('Generating opening scene...', 'This may take a moment');
      const gameId = this.services.stateManager.getState().gameId;
      if (gameId) {
        console.log('[DMView] Triggering first generation for game:', gameId);
        await this.services.gameService.next(gameId);
        await Promise.all([
          this.refreshPendingEvolutions(),
          this.refreshScenes(),
        ]);
      }
    } catch (error) {
      console.error('[DMView] Failed to trigger first generation:', error);
      this.callbacks.onShowLoading(false);
      this.callbacks.onShowError(error instanceof Error ? error.message : 'Failed to start game');
    }
  }

  /**
   * Refresh data after loading a game
   */
  async loadGame(): Promise<void> {
    const gameId = this.services.stateManager.getState().gameId;
    if (gameId) {
      await Promise.all([
        this.refreshPendingEvolutions(),
        this.refreshScenes(),
      ]);
    }
  }

  /**
   * Get the DM editor for external access (e.g., for save modal)
   */
  getDMEditor(): DMEditor | null {
    return this.dmEditor;
  }

  // ===========================================================================
  // Private - Rendering
  // ===========================================================================

  private render(): void {
    if (!this.container) return;

    this.container.innerHTML = `
      <div class="dm-view">
        <!-- Status Bar -->
        <div id="dm-status-bar" class="dm-status-bar"></div>

        <!-- Main Content -->
        <div class="dm-view-main">
          <!-- Left Panel: Party -->
          <section class="dm-left-panel">
            <div id="dm-party-panel"></div>
          </section>

          <!-- Center Panel: Narrator Output & DM Editor -->
          <section class="dm-center-panel">
            <div id="dm-area-panel"></div>
            <div id="dm-narrator-output"></div>
            <div id="dm-editor-container"></div>
            <div id="dm-beat-editor"></div>
          </section>

          <!-- Right Panel: Controls & Management -->
          <section class="dm-right-panel">
            <div id="dm-playback-controls"></div>
            <div id="dm-controls"></div>
            <div id="dm-scene-panel"></div>
            <div id="dm-evolution-panel"></div>
          </section>
        </div>

        <!-- Party View Preview (bottom) -->
        <div class="dm-preview-section">
          <div id="dm-party-preview"></div>
        </div>
      </div>
    `;
  }

  private initializeComponents(): void {
    const { stateManager, avatarManager } = this.services;

    // DM Editor
    this.dmEditor = new DMEditor(
      { containerId: 'dm-editor-container' },
      stateManager
    );
    this.dmEditor.render();

    // Narrator Output
    this.narratorOutput = new NarratorOutput(
      { containerId: 'dm-narrator-output' },
      stateManager
    );
    this.narratorOutput.render();

    // Controls
    this.controls = new Controls(
      { containerId: 'dm-controls' },
      {
        onAccept: () => this.handleAccept(),
        onEdit: () => this.handleEdit(),
        onRegenerate: (feedback) => this.handleRegenerate(feedback),
        onInject: () => this.handleInject(),
      }
    );
    this.controls.render();

    // Playback Controls
    this.playbackControls = new PlaybackControls(
      { containerId: 'dm-playback-controls' },
      (mode) => this.handlePlaybackModeChange(mode)
    );
    this.playbackControls.render();

    // Party Panel
    this.partyPanel = new PartyPanel(
      { containerId: 'dm-party-panel' },
      stateManager
    );
    if (avatarManager.isWasmAvailable()) {
      this.partyPanel.setAvatarManager(avatarManager);
    }
    this.partyPanel.render();

    // Area Panel
    this.areaPanel = new AreaPanel({ containerId: 'dm-area-panel' });
    this.areaPanel.render();

    // Status Bar
    this.statusBar = new StatusBar({ containerId: 'dm-status-bar' });
    this.statusBar.render();

    // Beat Editor
    this.beatEditor = new BeatEditor(
      { containerId: 'dm-beat-editor' },
      stateManager
    );
    this.beatEditor.render();

    // Speech Bubble
    this.speechBubble = new SpeechBubble();

    // Evolution Approval Panel
    this.evolutionPanel = new EvolutionApprovalPanel(
      { containerId: 'dm-evolution-panel' },
      {
        onApprove: (id, notes) => this.handleEvolutionApprove(id, notes),
        onEdit: (id, changes, notes) => this.handleEvolutionEdit(id, changes, notes),
        onRefuse: (id, notes) => this.handleEvolutionRefuse(id, notes),
      }
    );
    this.evolutionPanel.render();

    // Scene Panel
    this.scenePanel = new ScenePanel(
      { containerId: 'dm-scene-panel' },
      {
        onSceneStart: (id, turn) => this.handleSceneStart(id, turn),
        onSceneComplete: (id, turn) => this.handleSceneComplete(id, turn),
        onSceneCreate: (data) => this.handleSceneCreate(data),
        onSceneSelect: (id) => this.handleSceneSelect(id),
      }
    );
    this.scenePanel.render();

    // Party View Preview
    this.partyViewPreview = new PartyViewPreview(
      { containerId: 'dm-party-preview' },
      stateManager
    );
    this.partyViewPreview.render();
  }

  private setupEventHandlers(): void {
    const { sseService } = this.services;

    // Listen for generation events
    sseService.on('generation_started', () => {
      console.log('[DMView] Generation started');
      this.callbacks.onShowLoading(true, 'Generating scene...', 'The AI is crafting your story');
    });

    sseService.on('generation_complete', () => {
      console.log('[DMView] Generation complete');
      this.callbacks.onShowLoading(false);
      this.refreshPendingEvolutions();
    });

    sseService.on('generation_error', (event) => {
      console.error('[DMView] Generation error:', event.error);
      this.callbacks.onShowLoading(false);
      this.callbacks.onShowError(event.error || 'Generation failed');
    });
  }

  private setupStateSubscriptions(): void {
    const { stateManager, sseService } = this.services;

    // Subscribe to state changes
    const unsub = stateManager.subscribe((state) => {
      // Update controls based on pending content
      if (this.controls) {
        const hasPending = !!state.pendingContent || !!state.editorState?.pending;
        this.controls.setAllEnabled(hasPending && !state.isLoading);
      }

      // Show errors
      if (state.error) {
        this.callbacks.onShowError(state.error);
      }
    });
    this.unsubscribers.push(unsub);

    // Update connection status periodically
    const intervalId = window.setInterval(() => {
      const state = sseService.getConnectionState();
      // Connection status is handled by parent
    }, 1000);
    this.intervalIds.push(intervalId);
  }

  // ===========================================================================
  // Private - Control Event Handlers
  // ===========================================================================

  private async handleAccept(): Promise<void> {
    const { stateManager, ttsService } = this.services;

    const content = this.dmEditor?.getContent() || stateManager.getState().pendingContent?.content;

    try {
      await stateManager.submitContent({ type: 'ACCEPT' });
      this.dmEditor?.resetEditingState();

      if (content) {
        console.log('[DMView] Speaking accepted content');
        ttsService.speak({ text: content, role: 'narrator' }).catch((error) => {
          console.error('[DMView] TTS failed:', error);
        });
      }
    } catch (error) {
      console.error('[DMView] Accept failed:', error);
      this.callbacks.onShowError(error instanceof Error ? error.message : 'Failed to accept content');
    }
  }

  private async handleEdit(): Promise<void> {
    const { stateManager, ttsService } = this.services;

    const content = this.dmEditor?.getContent();

    try {
      await stateManager.submitContent({ type: 'EDIT', content });
      this.dmEditor?.resetEditingState();

      if (content) {
        console.log('[DMView] Speaking edited content');
        ttsService.speak({ text: content, role: 'narrator' }).catch((error) => {
          console.error('[DMView] TTS failed:', error);
        });
      }
    } catch (error) {
      console.error('[DMView] Edit failed:', error);
      this.callbacks.onShowError(error instanceof Error ? error.message : 'Failed to submit edit');
    }
  }

  private async handleRegenerate(feedback?: string): Promise<void> {
    try {
      await this.services.stateManager.regenerateContent(feedback);
    } catch (error) {
      console.error('[DMView] Regenerate failed:', error);
      this.callbacks.onShowError(error instanceof Error ? error.message : 'Failed to regenerate');
    }
  }

  private async handleInject(): Promise<void> {
    const { stateManager, ttsService } = this.services;

    const content = this.dmEditor?.getContent();
    if (!content?.trim()) {
      this.callbacks.onShowError('Please enter content to inject');
      return;
    }

    try {
      await stateManager.injectContent(content, 'narration');
      this.dmEditor?.resetEditingState();

      console.log('[DMView] Speaking injected content');
      ttsService.speak({ text: content, role: 'narrator' }).catch((error) => {
        console.error('[DMView] TTS failed:', error);
      });
    } catch (error) {
      console.error('[DMView] Inject failed:', error);
      this.callbacks.onShowError(error instanceof Error ? error.message : 'Failed to inject content');
    }
  }

  private async handlePlaybackModeChange(mode: PlaybackMode): Promise<void> {
    try {
      await this.services.stateManager.setPlaybackMode(mode);
    } catch (error) {
      console.error('[DMView] Playback mode change failed:', error);
      this.callbacks.onShowError(error instanceof Error ? error.message : 'Failed to change playback mode');
    }
  }

  // ===========================================================================
  // Private - Evolution Event Handlers
  // ===========================================================================

  private async handleEvolutionApprove(evolutionId: string, dmNotes?: string): Promise<void> {
    const gameId = this.services.stateManager.getState().gameId;
    if (!gameId) return;

    try {
      await this.services.gameService.approveEvolution(gameId, evolutionId, dmNotes);
      console.log('[DMView] Evolution approved:', evolutionId);
      await this.refreshPendingEvolutions();
    } catch (error) {
      console.error('[DMView] Evolution approval failed:', error);
      this.callbacks.onShowError(error instanceof Error ? error.message : 'Failed to approve evolution');
    }
  }

  private async handleEvolutionEdit(
    evolutionId: string,
    changes: Partial<PendingEvolution>,
    dmNotes?: string
  ): Promise<void> {
    const gameId = this.services.stateManager.getState().gameId;
    if (!gameId) return;

    try {
      const editChanges: { trait?: string; newValue?: number; reason?: string } = {};
      if (changes.trait !== undefined) editChanges.trait = changes.trait;
      if (changes.newValue !== undefined) editChanges.newValue = changes.newValue;
      if (changes.reason !== undefined) editChanges.reason = changes.reason;

      await this.services.gameService.editEvolution(gameId, evolutionId, editChanges, dmNotes);
      console.log('[DMView] Evolution edited:', evolutionId);
      await this.refreshPendingEvolutions();
    } catch (error) {
      console.error('[DMView] Evolution edit failed:', error);
      this.callbacks.onShowError(error instanceof Error ? error.message : 'Failed to edit evolution');
    }
  }

  private async handleEvolutionRefuse(evolutionId: string, dmNotes?: string): Promise<void> {
    const gameId = this.services.stateManager.getState().gameId;
    if (!gameId) return;

    try {
      await this.services.gameService.refuseEvolution(gameId, evolutionId, dmNotes);
      console.log('[DMView] Evolution refused:', evolutionId);
      await this.refreshPendingEvolutions();
    } catch (error) {
      console.error('[DMView] Evolution refusal failed:', error);
      this.callbacks.onShowError(error instanceof Error ? error.message : 'Failed to refuse evolution');
    }
  }

  private async refreshPendingEvolutions(): Promise<void> {
    const gameId = this.services.stateManager.getState().gameId;
    if (!gameId || !this.evolutionPanel) return;

    try {
      const result = await this.services.gameService.getPendingEvolutions(gameId);
      this.evolutionPanel.setPendingEvolutions(result.evolutions as PendingEvolution[]);
    } catch (error) {
      console.warn('[DMView] Failed to fetch pending evolutions:', error);
    }
  }

  // ===========================================================================
  // Private - Scene Event Handlers
  // ===========================================================================

  private async handleSceneStart(sceneId: string, turn: number): Promise<void> {
    const gameId = this.services.stateManager.getState().gameId;
    if (!gameId) return;

    try {
      await this.services.gameService.startScene(gameId, sceneId, turn);
      console.log('[DMView] Scene started:', sceneId);
      await this.refreshScenes();
    } catch (error) {
      console.error('[DMView] Scene start failed:', error);
      this.callbacks.onShowError(error instanceof Error ? error.message : 'Failed to start scene');
    }
  }

  private async handleSceneComplete(sceneId: string, turn: number): Promise<void> {
    const gameId = this.services.stateManager.getState().gameId;
    if (!gameId) return;

    try {
      await this.services.gameService.completeScene(gameId, sceneId, turn);
      console.log('[DMView] Scene completed:', sceneId);
      await this.refreshScenes();
    } catch (error) {
      console.error('[DMView] Scene complete failed:', error);
      this.callbacks.onShowError(error instanceof Error ? error.message : 'Failed to complete scene');
    }
  }

  private async handleSceneCreate(sceneData: CreateSceneDTO): Promise<void> {
    const gameId = this.services.stateManager.getState().gameId;
    if (!gameId) return;

    try {
      const result = await this.services.gameService.createScene(gameId, sceneData);
      console.log('[DMView] Scene created:', result.scene.id);
      await this.refreshScenes();
    } catch (error) {
      console.error('[DMView] Scene create failed:', error);
      this.callbacks.onShowError(error instanceof Error ? error.message : 'Failed to create scene');
    }
  }

  private async handleSceneSelect(sceneId: string): Promise<void> {
    const gameId = this.services.stateManager.getState().gameId;
    if (!gameId || !this.scenePanel) return;

    try {
      const details = await this.services.gameService.getSceneDetails(gameId, sceneId);
      this.scenePanel.setSelectedSceneDetails(details);
    } catch (error) {
      console.error('[DMView] Failed to get scene details:', error);
      this.scenePanel.setSelectedSceneDetails(null);
    }
  }

  private async refreshScenes(): Promise<void> {
    const gameId = this.services.stateManager.getState().gameId;
    if (!gameId || !this.scenePanel) return;

    try {
      const [currentResult, availableResult, allResult] = await Promise.all([
        this.services.gameService.getCurrentScene(gameId),
        this.services.gameService.getAvailableScenes(gameId),
        this.services.gameService.getScenes(gameId),
      ]);

      this.scenePanel.setCurrentScene(currentResult.scene);
      this.scenePanel.setAvailableScenes(availableResult.scenes);
      this.scenePanel.setAllScenes(allResult.scenes);

      const state = this.services.stateManager.getState();
      if (state?.session?.state.turn !== undefined) {
        this.scenePanel.setCurrentTurn(state.session.state.turn);
      }
    } catch (error) {
      console.warn('[DMView] Failed to fetch scenes:', error);
    }
  }

  // ===========================================================================
  // Private - Styles
  // ===========================================================================

  private injectStyles(): void {
    if (document.getElementById('dm-view-styles')) return;

    const styles = document.createElement('style');
    styles.id = 'dm-view-styles';
    styles.textContent = `
      .dm-view {
        display: flex;
        flex-direction: column;
        height: 100%;
        overflow: hidden;
      }

      .dm-status-bar {
        flex-shrink: 0;
        border-bottom: 1px solid #333;
      }

      .dm-view-main {
        display: flex;
        flex: 1;
        overflow: hidden;
      }

      /* Left Panel */
      .dm-left-panel {
        width: 280px;
        min-width: 240px;
        max-width: 320px;
        display: flex;
        flex-direction: column;
        padding: 1rem;
        border-right: 1px solid #333;
        gap: 1rem;
        flex-shrink: 0;
      }

      #dm-party-panel {
        flex: 1;
        overflow: hidden;
      }

      /* Center Panel */
      .dm-center-panel {
        flex: 1;
        display: flex;
        flex-direction: column;
        padding: 1rem;
        min-width: 400px;
        gap: 1rem;
      }

      #dm-area-panel {
        flex-shrink: 0;
        max-height: 200px;
        overflow: hidden;
      }

      #dm-narrator-output {
        flex: 1;
        overflow: hidden;
        min-height: 200px;
      }

      #dm-editor-container {
        flex-shrink: 0;
        max-height: 300px;
        overflow: hidden;
      }

      #dm-beat-editor {
        flex-shrink: 0;
        max-height: 200px;
        overflow: hidden;
      }

      /* Right Panel */
      .dm-right-panel {
        width: 260px;
        min-width: 220px;
        max-width: 300px;
        display: flex;
        flex-direction: column;
        padding: 1rem;
        border-left: 1px solid #333;
        gap: 1rem;
        flex-shrink: 0;
      }

      #dm-playback-controls {
        flex-shrink: 0;
      }

      #dm-controls {
        flex-shrink: 0;
      }

      #dm-scene-panel {
        flex: 0 0 auto;
        max-height: 350px;
        overflow: hidden;
      }

      #dm-evolution-panel {
        flex: 1;
        min-height: 200px;
        overflow: hidden;
      }

      /* Preview Section */
      .dm-preview-section {
        flex-shrink: 0;
        border-top: 1px solid #333;
        background: #0a0a0a;
      }

      #dm-party-preview {
        height: 180px;
      }

      /* Responsive */
      @media (max-width: 1024px) {
        .dm-view-main {
          flex-direction: column;
        }

        .dm-left-panel,
        .dm-right-panel {
          width: 100%;
          max-width: none;
          min-width: auto;
          border: none;
          border-bottom: 1px solid #333;
        }

        .dm-left-panel {
          max-height: 250px;
        }

        .dm-center-panel {
          min-width: auto;
        }

        .dm-right-panel {
          border-bottom: none;
          border-top: 1px solid #333;
        }
      }
    `;
    document.head.appendChild(styles);
  }
}

export default DMView;
