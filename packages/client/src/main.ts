/**
 * Reckoning Client Entry Point
 *
 * Main integration point that brings all client components together.
 */

import type { PlaybackMode } from '@reckoning/shared';

// Services
import { SSEService } from './services/sse/index.js';
import { GameService } from './services/game/index.js';
import { TTSService } from './services/tts/index.js';
import { AvatarManager } from './services/avatar-manager/index.js';

// State Management
import { createGameStateManager, type GameStateManager } from './state/index.js';

// UI Components
import { DMEditor } from './components/dm-editor.js';
import { Controls } from './components/controls.js';
import { NarratorOutput } from './components/narrator-output.js';
import { PlaybackControls } from './components/playback-controls.js';
import { SaveLoadModal, createSaveLoadModal } from './components/save-load-modal.js';
import { PartyPanel } from './components/party-panel.js';
import { AreaPanel } from './components/area-panel.js';
import { StatusBar } from './components/status-bar.js';
import { BeatEditor } from './components/beat-editor.js';
import { SpeechBubble } from './components/speech-bubble.js';
import { EvolutionApprovalPanel, type PendingEvolution } from './components/evolution-approval-panel.js';

// =============================================================================
// Services
// =============================================================================

const sseService = new SSEService();
const gameService = new GameService();
const ttsService = new TTSService({ autoPlay: true });
const avatarManager = new AvatarManager();

// =============================================================================
// State
// =============================================================================

let stateManager: GameStateManager | null = null;

// =============================================================================
// UI Components
// =============================================================================

let dmEditor: DMEditor | null = null;
let controls: Controls | null = null;
let narratorOutput: NarratorOutput | null = null;
let playbackControls: PlaybackControls | null = null;
let saveLoadModal: SaveLoadModal | null = null;
let partyPanel: PartyPanel | null = null;
let areaPanel: AreaPanel | null = null;
let statusBar: StatusBar | null = null;
let beatEditor: BeatEditor | null = null;
let speechBubble: SpeechBubble | null = null;
let evolutionPanel: EvolutionApprovalPanel | null = null;

// =============================================================================
// DOM Elements
// =============================================================================

const welcomeScreen = document.getElementById('welcome-screen');
const gameUI = document.getElementById('game-ui');
const loadingOverlay = document.getElementById('loading-overlay');
const errorToast = document.getElementById('error-toast');
const connectionStatus = document.getElementById('connection-status');

// Welcome screen buttons
const newGameBtn = document.getElementById('new-game-btn');
const loadGameBtn = document.getElementById('load-game-btn');

// Header buttons
const saveBtn = document.getElementById('save-btn');
const loadBtn = document.getElementById('load-btn');
const menuBtn = document.getElementById('menu-btn');

// =============================================================================
// UI Helpers
// =============================================================================

function showLoading(show: boolean, main?: string, detail?: string): void {
  if (loadingOverlay) {
    loadingOverlay.classList.toggle('active', show);

    const mainEl = document.getElementById('loading-status-main');
    const detailEl = document.getElementById('loading-status-detail');

    if (mainEl) {
      mainEl.textContent = main || 'Loading...';
    }
    if (detailEl) {
      detailEl.textContent = detail || '';
    }
  }
}

function updateLoadingStatus(main: string, detail?: string): void {
  const mainEl = document.getElementById('loading-status-main');
  const detailEl = document.getElementById('loading-status-detail');

  if (mainEl) {
    mainEl.textContent = main;
  }
  if (detailEl) {
    detailEl.textContent = detail || '';
  }
}

function showError(message: string): void {
  if (errorToast) {
    errorToast.textContent = message;
    errorToast.classList.add('active');
    setTimeout(() => {
      errorToast.classList.remove('active');
    }, 5000);
  }
}

function updateConnectionStatus(state: 'connected' | 'disconnected' | 'connecting'): void {
  if (connectionStatus) {
    connectionStatus.className = `connection-status ${state}`;
    connectionStatus.textContent = state.charAt(0).toUpperCase() + state.slice(1);
  }
}

function showGameUI(): void {
  if (welcomeScreen) {
    welcomeScreen.classList.add('hidden');
  }
  if (gameUI) {
    gameUI.classList.add('active');
  }
}

function showWelcomeScreen(): void {
  if (gameUI) {
    gameUI.classList.remove('active');
  }
  if (welcomeScreen) {
    welcomeScreen.classList.remove('hidden');
  }
}

// =============================================================================
// Initialize UI Components
// =============================================================================

function initializeUIComponents(): void {
  if (!stateManager) {
    throw new Error('State manager not initialized');
  }

  // DM Editor
  dmEditor = new DMEditor(
    { containerId: 'dm-editor' },
    stateManager
  );
  dmEditor.render();

  // Narrator Output
  narratorOutput = new NarratorOutput(
    { containerId: 'narrator-output' },
    stateManager
  );
  narratorOutput.render();

  // Controls
  controls = new Controls(
    { containerId: 'controls' },
    {
      onAccept: handleAccept,
      onEdit: handleEdit,
      onRegenerate: handleRegenerate,
      onInject: handleInject,
    }
  );
  controls.render();

  // Playback Controls
  playbackControls = new PlaybackControls(
    { containerId: 'playback-controls' },
    handlePlaybackModeChange
  );
  playbackControls.render();

  // Save/Load Modal
  saveLoadModal = createSaveLoadModal({
    onSave: (slot) => {
      console.log('[Main] Game saved:', slot.name);
    },
    onLoad: (slot) => {
      console.log('[Main] Game loaded:', slot.name);
      handleGameLoaded();
    },
    onNewGame: async (playerName, description) => {
      console.log('[Main] Starting new game for:', playerName);
      showLoading(true, 'Creating your world...', 'Setting up game session');
      try {
        await stateManager?.startNewGame(playerName, description);
        updateLoadingStatus('Connecting...', 'Establishing real-time connection');
        handleGameStarted();
      } catch (error) {
        showLoading(false);
        throw error;
      }
    },
    onClose: () => {
      console.log('[Main] Modal closed');
    },
    onDelete: (slotId) => {
      console.log('[Main] Save deleted:', slotId);
    },
  });

  // Party Panel - with state manager for reactive updates
  partyPanel = new PartyPanel({ containerId: 'party-panel' }, stateManager);

  // Connect avatar manager to party panel if WASM is available
  if (avatarManager.isWasmAvailable()) {
    partyPanel.setAvatarManager(avatarManager);
  }

  partyPanel.render();

  // Area Panel
  areaPanel = new AreaPanel({ containerId: 'area-panel' });
  areaPanel.render();

  // Status Bar
  statusBar = new StatusBar({ containerId: 'status-bar' });
  statusBar.render();

  // Beat Editor
  beatEditor = new BeatEditor({ containerId: 'beat-editor' }, stateManager);
  beatEditor.render();

  // Speech Bubble (no container needed - creates bubbles dynamically)
  speechBubble = new SpeechBubble();

  // Evolution Approval Panel
  evolutionPanel = new EvolutionApprovalPanel(
    { containerId: 'evolution-panel' },
    {
      onApprove: handleEvolutionApprove,
      onEdit: handleEvolutionEdit,
      onRefuse: handleEvolutionRefuse,
    }
  );
  evolutionPanel.render();
}

function destroyUIComponents(): void {
  dmEditor?.destroy();
  controls?.destroy();
  narratorOutput?.destroy();
  playbackControls?.destroy();
  saveLoadModal?.unmount();
  partyPanel?.destroy();
  areaPanel?.destroy();
  statusBar?.destroy();
  beatEditor?.destroy();
  speechBubble?.destroy();
  evolutionPanel?.destroy();

  // Clear all avatar instances (but don't destroy the manager itself)
  avatarManager.clearAll();

  dmEditor = null;
  controls = null;
  narratorOutput = null;
  playbackControls = null;
  saveLoadModal = null;
  partyPanel = null;
  areaPanel = null;
  statusBar = null;
  beatEditor = null;
  speechBubble = null;
  evolutionPanel = null;
}

// =============================================================================
// Game Lifecycle Handlers
// =============================================================================

async function handleNewGame(): Promise<void> {
  saveLoadModal?.openNewGame();
}

async function handleLoadGame(): Promise<void> {
  saveLoadModal?.openLoad();
}

async function handleGameStarted(): Promise<void> {
  showGameUI();

  // Update connection status based on SSE state
  setInterval(() => {
    const state = sseService.getConnectionState();
    updateConnectionStatus(state === 'connected' ? 'connected' : state === 'connecting' ? 'connecting' : 'disconnected');
  }, 1000);

  // Listen for generation events to update loading status
  sseService.on('generation_started', () => {
    console.log('[Main] Generation started');
    showLoading(true, 'Generating scene...', 'The AI is crafting your story');
  });

  sseService.on('generation_complete', () => {
    console.log('[Main] Generation complete');
    showLoading(false);
  });

  sseService.on('generation_error', (event) => {
    console.error('[Main] Generation error:', event.error);
    showLoading(false);
    showError(event.error || 'Generation failed');
  });

  // Refresh pending evolutions on generation complete
  // (evolutions are created during content generation)
  sseService.on('generation_complete', () => {
    refreshPendingEvolutions();
  });

  // Subscribe to state changes
  stateManager?.subscribe((state) => {
    // Update controls based on pending content
    if (controls) {
      const hasPending = !!state.pendingContent || !!state.editorState?.pending;
      controls.setAllEnabled(hasPending && !state.isLoading);
    }

    // Show errors
    if (state.error) {
      showError(state.error);
    }
  });

  // Trigger first generation
  try {
    updateLoadingStatus('Generating opening scene...', 'This may take a moment');
    const gameId = stateManager?.getState().gameId;
    if (gameId) {
      console.log('[Main] Triggering first generation for game:', gameId);
      await gameService.next(gameId);
      // Refresh pending evolutions after game start
      await refreshPendingEvolutions();
    }
  } catch (error) {
    console.error('[Main] Failed to trigger first generation:', error);
    showLoading(false);
    showError(error instanceof Error ? error.message : 'Failed to start game');
  }
}

async function handleGameLoaded(): Promise<void> {
  showGameUI();

  // Update save modal with new game ID
  const gameId = stateManager?.getState().gameId;
  if (gameId) {
    saveLoadModal?.setGameId(gameId);
    // Refresh pending evolutions after game load
    await refreshPendingEvolutions();
  }

  // Subscribe to state changes
  stateManager?.subscribe((state) => {
    if (controls) {
      const hasPending = !!state.pendingContent || !!state.editorState?.pending;
      controls.setAllEnabled(hasPending && !state.isLoading);
    }
    showLoading(state.isLoading);
    if (state.error) {
      showError(state.error);
    }
  });
}

// =============================================================================
// Control Event Handlers
// =============================================================================

async function handleAccept(): Promise<void> {
  if (!stateManager) return;

  // Get the content before submit (it will be cleared after)
  const content = dmEditor?.getContent() || stateManager.getState().pendingContent?.content;

  try {
    await stateManager.submitContent({
      type: 'ACCEPT',
    });
    dmEditor?.resetEditingState();

    // Trigger TTS for the accepted content
    if (content) {
      console.log('[Main] Speaking accepted content');
      ttsService.speak({ text: content, role: 'narrator' }).catch((error) => {
        console.error('[Main] TTS failed:', error);
      });
    }
  } catch (error) {
    console.error('[Main] Accept failed:', error);
    showError(error instanceof Error ? error.message : 'Failed to accept content');
  }
}

async function handleEdit(): Promise<void> {
  if (!stateManager || !dmEditor) return;

  const content = dmEditor.getContent();

  try {
    await stateManager.submitContent({
      type: 'EDIT',
      content,
    });
    dmEditor.resetEditingState();

    // Trigger TTS for the edited content
    if (content) {
      console.log('[Main] Speaking edited content');
      ttsService.speak({ text: content, role: 'narrator' }).catch((error) => {
        console.error('[Main] TTS failed:', error);
      });
    }
  } catch (error) {
    console.error('[Main] Edit failed:', error);
    showError(error instanceof Error ? error.message : 'Failed to submit edit');
  }
}

async function handleRegenerate(feedback?: string): Promise<void> {
  if (!stateManager) return;

  try {
    await stateManager.regenerateContent(feedback);
  } catch (error) {
    console.error('[Main] Regenerate failed:', error);
    showError(error instanceof Error ? error.message : 'Failed to regenerate');
  }
}

async function handleInject(): Promise<void> {
  if (!stateManager || !dmEditor) return;

  const content = dmEditor.getContent();
  if (!content.trim()) {
    showError('Please enter content to inject');
    return;
  }

  try {
    await stateManager.injectContent(content, 'narration');
    dmEditor.resetEditingState();

    // Trigger TTS for the injected content
    console.log('[Main] Speaking injected content');
    ttsService.speak({ text: content, role: 'narrator' }).catch((error) => {
      console.error('[Main] TTS failed:', error);
    });
  } catch (error) {
    console.error('[Main] Inject failed:', error);
    showError(error instanceof Error ? error.message : 'Failed to inject content');
  }
}

async function handlePlaybackModeChange(mode: PlaybackMode): Promise<void> {
  if (!stateManager) return;

  try {
    await stateManager.setPlaybackMode(mode);
  } catch (error) {
    console.error('[Main] Playback mode change failed:', error);
    showError(error instanceof Error ? error.message : 'Failed to change playback mode');
  }
}

// =============================================================================
// Evolution Event Handlers
// =============================================================================

async function handleEvolutionApprove(evolutionId: string, dmNotes?: string): Promise<void> {
  const gameId = stateManager?.getState().gameId;
  if (!gameId) return;

  try {
    await gameService.approveEvolution(gameId, evolutionId, dmNotes);
    console.log('[Main] Evolution approved:', evolutionId);
    // Refresh pending evolutions
    await refreshPendingEvolutions();
  } catch (error) {
    console.error('[Main] Evolution approval failed:', error);
    showError(error instanceof Error ? error.message : 'Failed to approve evolution');
  }
}

async function handleEvolutionEdit(
  evolutionId: string,
  changes: Partial<PendingEvolution>,
  dmNotes?: string
): Promise<void> {
  const gameId = stateManager?.getState().gameId;
  if (!gameId) return;

  try {
    // Build changes object with only defined properties
    const editChanges: { trait?: string; newValue?: number; reason?: string } = {};
    if (changes.trait !== undefined) editChanges.trait = changes.trait;
    if (changes.newValue !== undefined) editChanges.newValue = changes.newValue;
    if (changes.reason !== undefined) editChanges.reason = changes.reason;

    await gameService.editEvolution(
      gameId,
      evolutionId,
      editChanges,
      dmNotes
    );
    console.log('[Main] Evolution edited:', evolutionId);
    // Refresh pending evolutions
    await refreshPendingEvolutions();
  } catch (error) {
    console.error('[Main] Evolution edit failed:', error);
    showError(error instanceof Error ? error.message : 'Failed to edit evolution');
  }
}

async function handleEvolutionRefuse(evolutionId: string, dmNotes?: string): Promise<void> {
  const gameId = stateManager?.getState().gameId;
  if (!gameId) return;

  try {
    await gameService.refuseEvolution(gameId, evolutionId, dmNotes);
    console.log('[Main] Evolution refused:', evolutionId);
    // Refresh pending evolutions
    await refreshPendingEvolutions();
  } catch (error) {
    console.error('[Main] Evolution refusal failed:', error);
    showError(error instanceof Error ? error.message : 'Failed to refuse evolution');
  }
}

async function refreshPendingEvolutions(): Promise<void> {
  const gameId = stateManager?.getState().gameId;
  if (!gameId || !evolutionPanel) return;

  try {
    const result = await gameService.getPendingEvolutions(gameId);
    // Map DTO to component type (they're compatible)
    evolutionPanel.setPendingEvolutions(result.evolutions as PendingEvolution[]);
  } catch (error) {
    // Log but don't show error toast - evolution API might not be available yet
    console.warn('[Main] Failed to fetch pending evolutions:', error);
  }
}

// =============================================================================
// Header Button Handlers
// =============================================================================

function handleSaveClick(): void {
  const gameId = stateManager?.getState().gameId;
  if (!gameId) {
    showError('No active game to save');
    return;
  }
  saveLoadModal?.setGameId(gameId);
  saveLoadModal?.openSave();
}

function handleLoadClick(): void {
  saveLoadModal?.openLoad();
}

function handleMenuClick(): void {
  // Return to welcome screen
  stateManager?.clearGame();
  destroyUIComponents();
  showWelcomeScreen();
  updateConnectionStatus('disconnected');
}

// =============================================================================
// TTS Integration
// =============================================================================

function setupTTSIntegration(): void {
  ttsService.setCallbacks({
    onStart: (item) => {
      console.log('[TTS] Started playing:', item.id);
      // Show speech bubble if speaker is specified
      const speaker = item.request.speaker;
      if (speaker) {
        if (speechBubble) {
          speechBubble.show(speaker, item.request.text);
        }
        // Start avatar speaking animation
        avatarManager.startSpeaking(speaker);
      }
    },
    onEnd: (item) => {
      console.log('[TTS] Finished playing:', item.id);
      // Schedule speech bubble fade if speaker is specified
      const speaker = item.request.speaker;
      if (speaker) {
        if (speechBubble) {
          speechBubble.scheduleFade(speaker);
        }
        // Stop avatar speaking animation
        avatarManager.stopSpeaking(speaker);
      }
    },
    onError: (item, error) => {
      console.error('[TTS] Error:', item.id, error);
      // Hide speech bubble on error if speaker is specified
      const speaker = item.request.speaker;
      if (speaker) {
        if (speechBubble) {
          speechBubble.hide(speaker);
        }
        // Stop avatar speaking animation on error
        avatarManager.stopSpeaking(speaker);
      }
    },
    onQueueChange: (status) => {
      console.log('[TTS] Queue status:', status.playbackState, 'items:', status.totalItems);
    },
  });

  // Listen for TTS events from SSE
  sseService.on('tts_started', (event) => {
    console.log('[SSE] TTS started:', event.requestId);
  });

  sseService.on('tts_complete', (event) => {
    console.log('[SSE] TTS complete:', event.requestId);
  });
}

// =============================================================================
// Initialization
// =============================================================================

async function initialize(): Promise<void> {
  console.log('[Main] Initializing The Reckoning client...');

  // Initialize avatar manager (WASM) - non-blocking, graceful degradation if fails
  avatarManager.init().then((success) => {
    if (success) {
      console.log('[Main] Avatar manager initialized');
      // Connect to party panel if already created
      if (partyPanel) {
        partyPanel.setAvatarManager(avatarManager);
      }
    } else {
      console.warn('[Main] Avatar manager failed to initialize, using fallback placeholders');
    }
  });

  // Create state manager
  stateManager = createGameStateManager(sseService, gameService);

  // Set up TTS integration
  setupTTSIntegration();

  // Initialize UI components
  initializeUIComponents();

  // Set up welcome screen event listeners
  newGameBtn?.addEventListener('click', handleNewGame);
  loadGameBtn?.addEventListener('click', handleLoadGame);

  // Set up header button event listeners
  saveBtn?.addEventListener('click', handleSaveClick);
  loadBtn?.addEventListener('click', handleLoadClick);
  menuBtn?.addEventListener('click', handleMenuClick);

  console.log('[Main] Initialization complete');
}

// Start the application
initialize().catch((error) => {
  console.error('[Main] Initialization failed:', error);
  showError('Failed to initialize application');
});
