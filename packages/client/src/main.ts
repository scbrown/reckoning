/**
 * Reckoning Client Entry Point
 *
 * Main integration point that brings all client components together.
 * Uses router-based navigation to switch between views.
 *
 * Routes:
 * - /                    - Welcome screen
 * - /game/:id/view/dm    - DM View (full control)
 * - /game/:id/view/party - Party View (future)
 */

// Services
import { SSEService } from './services/sse/index.js';
import { GameService } from './services/game/index.js';
import { TTSService } from './services/tts/index.js';
import { AvatarManager } from './services/avatar-manager/index.js';

// State Management
import { createGameStateManager, type GameStateManager } from './state/index.js';

// Router
import { getRouter, type Route } from './router/index.js';

// Views
import { DMView, PlayerView } from './views/index.js';

// UI Components (modals only at app level)
import { SaveLoadModal, createSaveLoadModal } from './components/save-load-modal.js';
import { ExportImportModal, createExportImportModal } from './components/export-import-modal.js';
import { SpeechBubble } from './components/shared/index.js';

// =============================================================================
// Services
// =============================================================================

const sseService = new SSEService();
const gameService = new GameService();
const ttsService = new TTSService({ autoPlay: true });
const avatarManager = new AvatarManager();

// =============================================================================
// Router
// =============================================================================

const router = getRouter();

// =============================================================================
// State
// =============================================================================

let stateManager: GameStateManager | null = null;

// =============================================================================
// Views & App-Level Components
// =============================================================================

let dmView: DMView | null = null;
let playerView: PlayerView | null = null;
let saveLoadModal: SaveLoadModal | null = null;
let exportImportModal: ExportImportModal | null = null;
let speechBubble: SpeechBubble | null = null;

// Connection status interval
let connectionStatusInterval: number | null = null;

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
const exportBtn = document.getElementById('export-btn');
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

function updateConnectionStatusDisplay(state: 'connected' | 'disconnected' | 'connecting'): void {
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
// View Management
// =============================================================================

/**
 * Mount the DM View
 */
function mountDMView(): void {
  if (!stateManager) {
    throw new Error('State manager not initialized');
  }

  // Create DMView if not exists
  if (!dmView) {
    dmView = new DMView(
      { containerId: 'view-container' },
      {
        stateManager,
        sseService,
        gameService,
        ttsService,
        avatarManager,
      },
      {
        onShowLoading: showLoading,
        onUpdateLoadingStatus: updateLoadingStatus,
        onShowError: showError,
        onNavigateToMenu: handleMenuClick,
      }
    );
  }

  dmView.mount();

  // Start connection status polling
  if (connectionStatusInterval) {
    clearInterval(connectionStatusInterval);
  }
  connectionStatusInterval = window.setInterval(() => {
    const state = sseService.getConnectionState();
    updateConnectionStatusDisplay(
      state === 'connected' ? 'connected' :
      state === 'connecting' ? 'connecting' : 'disconnected'
    );
  }, 1000);
}

/**
 * Mount the Player View
 */
function mountPlayerView(gameId: string, characterId: string): void {
  // Create PlayerView if not exists or if character changed
  if (!playerView) {
    playerView = new PlayerView(
      { containerId: 'view-container', gameId, characterId },
      {
        onShowError: showError,
      }
    );
  }

  playerView.mount();
}

/**
 * Unmount the current view
 */
function unmountCurrentView(): void {
  if (dmView) {
    dmView.unmount();
    dmView = null;
  }

  if (playerView) {
    playerView.unmount();
    playerView = null;
  }

  if (connectionStatusInterval) {
    clearInterval(connectionStatusInterval);
    connectionStatusInterval = null;
  }

  // Clear avatar instances
  avatarManager.clearAll();
}

// =============================================================================
// Route Handler
// =============================================================================

function handleRouteChange(route: Route): void {
  console.log('[Main] Route changed:', route);

  if (route.path === 'welcome') {
    unmountCurrentView();
    showWelcomeScreen();
    updateConnectionStatusDisplay('disconnected');
  } else if (route.path === 'game' && route.params) {
    const { gameId, view, characterId } = route.params;

    // Ensure we have the game loaded
    if (stateManager?.getState().gameId !== gameId) {
      console.warn('[Main] Game ID mismatch, need to load game:', gameId);
      // TODO: Load game from ID if not already loaded
    }

    showGameUI();

    // Unmount previous view before mounting new one
    unmountCurrentView();

    if (view === 'dm') {
      mountDMView();
    } else if (view === 'party') {
      // TODO: Mount Party View when implemented
      console.log('[Main] Party view not yet implemented');
      mountDMView(); // Fallback to DM view for now
    } else if (view === 'player' && characterId) {
      mountPlayerView(gameId, characterId);
    }
  }
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
  const gameId = stateManager?.getState().gameId;
  if (gameId) {
    // Navigate to DM view
    router.navigateToGame(gameId, 'dm');

    // Trigger first generation
    try {
      await dmView?.startGame();
    } catch (error) {
      console.error('[Main] Failed to start game:', error);
      showError(error instanceof Error ? error.message : 'Failed to start game');
    }
  }
}

async function handleGameLoaded(): Promise<void> {
  const gameId = stateManager?.getState().gameId;
  if (gameId) {
    // Navigate to DM view
    router.navigateToGame(gameId, 'dm');

    // Update save modal with game ID
    saveLoadModal?.setGameId(gameId);

    // Load game data
    try {
      await dmView?.loadGame();
    } catch (error) {
      console.error('[Main] Failed to load game data:', error);
    }
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
  // Return to welcome screen via router
  stateManager?.clearGame();
  unmountCurrentView();
  router.navigateToWelcome();
}

function handleExportClick(): void {
  const gameId = stateManager?.getState().gameId;
  if (!gameId) {
    showError('No active game to export');
    return;
  }
  exportImportModal?.setGameId(gameId);
  exportImportModal?.openExport();
}

// =============================================================================
// TTS Integration
// =============================================================================

function setupTTSIntegration(): void {
  ttsService.setCallbacks({
    onStart: (item) => {
      console.log('[TTS] Started playing:', item.id);
      const speaker = item.request.speaker;
      if (speaker) {
        speechBubble?.show(speaker, item.request.text);
        avatarManager.startSpeaking(speaker);
      }
    },
    onEnd: (item) => {
      console.log('[TTS] Finished playing:', item.id);
      const speaker = item.request.speaker;
      if (speaker) {
        speechBubble?.scheduleFade(speaker);
        avatarManager.stopSpeaking(speaker);
      }
    },
    onError: (item, error) => {
      console.error('[TTS] Error:', item.id, error);
      const speaker = item.request.speaker;
      if (speaker) {
        speechBubble?.hide(speaker);
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
// Initialize App-Level Components
// =============================================================================

function initializeAppComponents(): void {
  if (!stateManager) {
    throw new Error('State manager not initialized');
  }

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

  // Export/Import Modal
  exportImportModal = createExportImportModal({
    onExport: async (options) => {
      console.log('[Main] Game exported with options:', options);
    },
    onImport: async (file) => {
      console.log('[Main] Importing game from file:', file.name);
      throw new Error('Import functionality not yet implemented');
    },
    onClose: () => {
      console.log('[Main] Export modal closed');
    },
  });

  // Speech Bubble (app-level for TTS integration)
  speechBubble = new SpeechBubble();
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
    } else {
      console.warn('[Main] Avatar manager failed to initialize, using fallback placeholders');
    }
  });

  // Create state manager
  stateManager = createGameStateManager(sseService, gameService);

  // Set up TTS integration
  setupTTSIntegration();

  // Initialize app-level components (modals, speech bubble)
  initializeAppComponents();

  // Set up welcome screen event listeners
  newGameBtn?.addEventListener('click', handleNewGame);
  loadGameBtn?.addEventListener('click', handleLoadGame);

  // Set up header button event listeners
  saveBtn?.addEventListener('click', handleSaveClick);
  loadBtn?.addEventListener('click', handleLoadClick);
  exportBtn?.addEventListener('click', handleExportClick);
  menuBtn?.addEventListener('click', handleMenuClick);

  // Set up route change listener
  router.onRouteChange(handleRouteChange);

  console.log('[Main] Initialization complete');
}

// Start the application
initialize().catch((error) => {
  console.error('[Main] Initialization failed:', error);
  showError('Failed to initialize application');
});
