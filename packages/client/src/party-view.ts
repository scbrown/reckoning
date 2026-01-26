/**
 * Party View Entry Point
 *
 * Display-only cinematic view for showing narration, avatars, and scene.
 * Designed for TV/projector display during tabletop sessions.
 *
 * URL: /game/:id/view/party
 */

import { NarrationDisplay, SpeechBubble } from './components/shared/index.js';
import { SSEService } from './services/sse/index.js';
import { TTSService } from './services/tts/index.js';
import type { PartyViewState } from './services/view/types.js';

// =============================================================================
// Types
// =============================================================================

interface NarrativeEntry {
  id: string;
  type: 'narration' | 'party_dialogue' | 'npc_dialogue' | 'dm_note';
  content: string;
  speaker?: string;
  timestamp: Date;
  isTTSPlaying?: boolean;
}

// =============================================================================
// DOM Elements
// =============================================================================

const loadingState = document.getElementById('loading-state');
const errorState = document.getElementById('error-state');
const errorMessage = document.getElementById('error-message');
const mainView = document.getElementById('main-view');
const areaNameEl = document.getElementById('area-name');
const sceneNameEl = document.getElementById('scene-name');
const sceneMoodEl = document.getElementById('scene-mood');
const avatarStageEl = document.getElementById('avatar-stage');
const narrationDisplayEl = document.getElementById('narration-display');
const connectionDot = document.getElementById('connection-dot');
const connectionText = document.getElementById('connection-text');

// =============================================================================
// Services
// =============================================================================

const sseService = new SSEService();
const ttsService = new TTSService({ autoPlay: true });

// =============================================================================
// Components
// =============================================================================

let narrationDisplay: NarrationDisplay | null = null;
let speechBubble: SpeechBubble | null = null;

// =============================================================================
// State
// =============================================================================

let gameId: string | null = null;
let narrativeHistory: NarrativeEntry[] = [];

// =============================================================================
// UI Helpers
// =============================================================================

function showLoading(): void {
  loadingState?.classList.remove('hidden');
  errorState?.classList.add('hidden');
  mainView?.classList.add('hidden');
}

function showError(message: string): void {
  loadingState?.classList.add('hidden');
  errorState?.classList.remove('hidden');
  mainView?.classList.add('hidden');
  if (errorMessage) {
    errorMessage.textContent = message;
  }
}

function showMainView(): void {
  loadingState?.classList.add('hidden');
  errorState?.classList.add('hidden');
  mainView?.classList.remove('hidden');
}

function updateConnectionStatus(state: 'connected' | 'disconnected' | 'connecting'): void {
  if (connectionDot) {
    connectionDot.className = `connection-dot ${state}`;
  }
  if (connectionText) {
    connectionText.textContent = state.charAt(0).toUpperCase() + state.slice(1);
  }
}

// =============================================================================
// URL Parsing
// =============================================================================

function getGameIdFromUrl(): string | null {
  // Expected URL format: /game/:id/view/party or ?gameId=xxx
  const urlParams = new URLSearchParams(window.location.search);
  const queryGameId = urlParams.get('gameId');
  if (queryGameId) return queryGameId;

  // Try to parse from path
  const pathMatch = window.location.pathname.match(/\/game\/([^/]+)\/view\/party/);
  if (pathMatch) return pathMatch[1];

  return null;
}

// =============================================================================
// API
// =============================================================================

async function fetchPartyViewState(gameId: string): Promise<PartyViewState> {
  const response = await fetch(`/api/view/${gameId}/party`);
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: { message: 'Unknown error' } }));
    throw new Error(error.error?.message || `HTTP ${response.status}`);
  }
  return response.json();
}

// =============================================================================
// Rendering
// =============================================================================

function updateAreaName(state: PartyViewState): void {
  if (areaNameEl && state.area) {
    areaNameEl.textContent = state.area.name;
  }
}

function updateSceneInfo(state: PartyViewState): void {
  if (sceneNameEl) {
    sceneNameEl.textContent = state.scene?.name || '';
  }
  if (sceneMoodEl) {
    sceneMoodEl.textContent = state.scene?.mood || '';
  }
}

function updateNarration(state: PartyViewState): void {
  // Convert string narration to NarrativeEntry format
  const newEntries: NarrativeEntry[] = state.narration.map((text, index) => {
    // Check if text has speaker prefix (e.g., "Character: dialogue")
    const speakerMatch = text.match(/^([^:]+):\s*(.+)$/);
    const hasSpeaker = speakerMatch && speakerMatch[1].length < 30; // Reasonable name length

    return {
      id: `narr-${index}-${Date.now()}`,
      type: hasSpeaker ? 'party_dialogue' : 'narration',
      content: hasSpeaker ? speakerMatch![2] : text,
      speaker: hasSpeaker ? speakerMatch![1] : undefined,
      timestamp: new Date(),
      isTTSPlaying: false,
    };
  });

  narrativeHistory = newEntries;
  narrationDisplay?.update(narrativeHistory);
}

function updateAvatars(state: PartyViewState): void {
  if (!avatarStageEl) return;

  // Clear existing avatars
  avatarStageEl.innerHTML = '';

  // Create avatar for each party member
  for (const avatar of state.avatars) {
    const container = document.createElement('div');
    container.className = 'avatar-container';
    container.setAttribute('data-character-id', avatar.id);

    // Create avatar placeholder (canvas styled in CSS)
    const canvas = document.createElement('canvas');
    canvas.className = 'avatar-canvas';
    canvas.width = 64;
    canvas.height = 64;

    // Draw a simple placeholder circle with first letter
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#333';
      ctx.fillRect(0, 0, 64, 64);
      ctx.fillStyle = '#667eea';
      ctx.beginPath();
      ctx.arc(32, 32, 24, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 24px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(avatar.name.charAt(0).toUpperCase(), 32, 32);
    }
    container.appendChild(canvas);

    // Create name label
    const nameLabel = document.createElement('div');
    nameLabel.className = 'avatar-name';
    nameLabel.textContent = avatar.name;
    container.appendChild(nameLabel);

    avatarStageEl.appendChild(container);
  }
}

// =============================================================================
// SSE Event Handlers
// =============================================================================

function setupSSEHandlers(): void {
  // State updates
  sseService.on('state_changed', () => {
    // Refresh state on any state change
    if (gameId) {
      fetchPartyViewState(gameId)
        .then(state => {
          updateAreaName(state);
          updateSceneInfo(state);
          updateNarration(state);
          updateAvatars(state);
        })
        .catch(err => console.error('[PartyView] Failed to refresh state:', err));
    }
  });

  // New narration events
  sseService.on('content_accepted', (event) => {
    if (event.content) {
      const entry: NarrativeEntry = {
        id: `narr-${Date.now()}`,
        type: 'narration',
        content: event.content,
        timestamp: new Date(),
      };
      narrativeHistory.push(entry);
      narrationDisplay?.addEntry(entry);

      // Trigger TTS for new narration
      ttsService.speak({ text: event.content, role: 'narrator' }).catch(console.error);
    }
  });

  // Connection state changes
  setInterval(() => {
    const state = sseService.getConnectionState();
    updateConnectionStatus(state === 'connected' ? 'connected' : state === 'connecting' ? 'connecting' : 'disconnected');
  }, 1000);
}

// =============================================================================
// TTS Integration
// =============================================================================

function setupTTSHandlers(): void {
  ttsService.setCallbacks({
    onStart: (item) => {
      console.log('[PartyView] TTS started:', item.id);
      const speaker = item.request.speaker;
      if (speaker) {
        speechBubble?.show(speaker, item.request.text);
      }
    },
    onEnd: (item) => {
      console.log('[PartyView] TTS ended:', item.id);
      const speaker = item.request.speaker;
      if (speaker) {
        speechBubble?.scheduleFade(speaker);
      }
    },
    onError: (item, error) => {
      console.error('[PartyView] TTS error:', item.id, error);
      const speaker = item.request.speaker;
      if (speaker) {
        speechBubble?.hide(speaker);
      }
    },
  });
}

// =============================================================================
// Initialization
// =============================================================================

async function initialize(): Promise<void> {
  console.log('[PartyView] Initializing...');

  showLoading();

  // Get game ID from URL
  gameId = getGameIdFromUrl();
  if (!gameId) {
    showError('No game ID provided. Use ?gameId=xxx or /game/:id/view/party');
    return;
  }

  console.log('[PartyView] Game ID:', gameId);

  try {
    // Fetch initial state
    const state = await fetchPartyViewState(gameId);
    console.log('[PartyView] Got initial state:', state);

    // Initialize components
    if (narrationDisplayEl) {
      narrationDisplay = new NarrationDisplay(narrationDisplayEl, {
        title: '',
        showAutoScrollToggle: false,
      });
      narrationDisplay.render();
    }

    speechBubble = new SpeechBubble();

    // Set up SSE connection
    setupSSEHandlers();
    sseService.connect(gameId);

    // Set up TTS handlers
    setupTTSHandlers();

    // Render initial state
    showMainView();
    updateAreaName(state);
    updateSceneInfo(state);
    updateNarration(state);
    updateAvatars(state);

    console.log('[PartyView] Initialization complete');
  } catch (error) {
    console.error('[PartyView] Initialization failed:', error);
    showError(error instanceof Error ? error.message : 'Failed to load game state');
  }
}

// Start the application
initialize().catch(console.error);
