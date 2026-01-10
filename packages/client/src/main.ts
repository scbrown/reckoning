/**
 * Reckoning Client Entry Point
 */

import type {
  HealthStatus,
  AvailableVoice,
  VoiceMapping,
  VoiceRole,
  ListVoicesResponse,
  VoiceConfiguration,
  UpdateVoiceMappingResponse,
} from '@reckoning/shared';

// =============================================================================
// DOM Elements
// =============================================================================

const statusEl = document.getElementById('status');
const voiceTesterEl = document.getElementById('voice-tester');
const voiceSelectEl = document.getElementById('voice-select') as HTMLSelectElement;
const roleSelectEl = document.getElementById('role-select') as HTMLSelectElement;
const applyBtnEl = document.getElementById('apply-btn') as HTMLButtonElement;
const previewBtnEl = document.getElementById('preview-btn') as HTMLButtonElement;
const mappingsTableEl = document.getElementById('mappings-table') as HTMLTableSectionElement;

// =============================================================================
// State
// =============================================================================

let availableVoices: AvailableVoice[] = [];
let currentMappings: VoiceMapping[] = [];

// =============================================================================
// API Functions
// =============================================================================

async function checkServerHealth(): Promise<boolean> {
  try {
    const response = await fetch('/api/health');
    const health: HealthStatus = await response.json();

    if (statusEl) {
      if (health.status === 'healthy') {
        statusEl.textContent = `Server connected (uptime: ${Math.floor(health.uptime / 1000)}s)`;
        statusEl.className = 'status connected';
        return true;
      } else {
        statusEl.textContent = `Server status: ${health.status}`;
        statusEl.className = 'status error';
        return false;
      }
    }
    return health.status === 'healthy';
  } catch (error) {
    if (statusEl) {
      statusEl.textContent = 'Server not available. Run: just dev-server';
      statusEl.className = 'status error';
    }
    return false;
  }
}

async function fetchVoices(): Promise<AvailableVoice[]> {
  try {
    const response = await fetch('/api/tts/voices');
    const data: ListVoicesResponse = await response.json();
    return data.voices;
  } catch (error) {
    console.error('Failed to fetch voices:', error);
    return [];
  }
}

async function fetchConfiguration(): Promise<VoiceConfiguration | null> {
  try {
    const response = await fetch('/api/tts/config');
    return await response.json();
  } catch (error) {
    console.error('Failed to fetch configuration:', error);
    return null;
  }
}

async function updateVoiceMapping(
  role: VoiceRole,
  voiceId: string
): Promise<UpdateVoiceMappingResponse | null> {
  try {
    const response = await fetch('/api/tts/config/voice', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role, voiceId }),
    });
    return await response.json();
  } catch (error) {
    console.error('Failed to update voice mapping:', error);
    return null;
  }
}

// =============================================================================
// UI Functions
// =============================================================================

function populateVoiceDropdown(voices: AvailableVoice[]): void {
  if (!voiceSelectEl) return;

  voiceSelectEl.innerHTML = '';
  for (const voice of voices) {
    const option = document.createElement('option');
    option.value = voice.voiceId;
    option.textContent = `${voice.name} - ${voice.description || voice.category}`;
    voiceSelectEl.appendChild(option);
  }
}

function updateMappingsTable(mappings: VoiceMapping[]): void {
  if (!mappingsTableEl) return;

  mappingsTableEl.innerHTML = '';
  for (const mapping of mappings) {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td>${mapping.role}</td>
      <td>${mapping.voiceName}</td>
      <td>${mapping.defaultPreset}</td>
    `;
    mappingsTableEl.appendChild(row);
  }
}

function syncVoiceSelectWithRole(): void {
  if (!roleSelectEl || !voiceSelectEl) return;

  const role = roleSelectEl.value as VoiceRole;
  const mapping = currentMappings.find((m) => m.role === role);

  if (mapping) {
    voiceSelectEl.value = mapping.voiceId;
  }
}

async function handleApplyClick(): Promise<void> {
  if (!roleSelectEl || !voiceSelectEl || !applyBtnEl) return;

  const role = roleSelectEl.value as VoiceRole;
  const voiceId = voiceSelectEl.value;

  applyBtnEl.disabled = true;
  applyBtnEl.textContent = 'Applying...';

  const result = await updateVoiceMapping(role, voiceId);

  if (result?.success) {
    // Update local state
    const index = currentMappings.findIndex((m) => m.role === role);
    if (index >= 0) {
      currentMappings[index] = result.mapping;
    } else {
      currentMappings.push(result.mapping);
    }
    updateMappingsTable(currentMappings);
  }

  applyBtnEl.disabled = false;
  applyBtnEl.textContent = 'Apply';
}

async function handlePreviewClick(): Promise<void> {
  if (!voiceSelectEl || !previewBtnEl || !roleSelectEl) return;

  const voiceId = voiceSelectEl.value;
  const role = roleSelectEl.value as VoiceRole;
  const voice = availableVoices.find((v) => v.voiceId === voiceId);

  previewBtnEl.disabled = true;
  previewBtnEl.textContent = 'Loading...';

  try {
    // Generate a preview phrase based on the role
    const previewTexts: Record<VoiceRole, string> = {
      narrator: 'The tale unfolds before you, each choice a thread in the tapestry of fate.',
      judge: 'Your actions have consequences. The reckoning approaches.',
      npc: 'Greetings, traveler. What brings you to these lands?',
      inner_voice: 'Something feels wrong about this. Should I really trust them?',
    };
    const previewText = previewTexts[role] || previewTexts.narrator;

    // Call the TTS speak endpoint
    const response = await fetch('/api/tts/speak', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: previewText,
        voiceId,
        role,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to generate speech');
    }

    // Get audio blob and play it
    const audioBlob = await response.blob();
    const audioUrl = URL.createObjectURL(audioBlob);
    const audio = new Audio(audioUrl);

    audio.onended = () => {
      URL.revokeObjectURL(audioUrl);
    };

    await audio.play();
    console.log(`Playing preview for ${voice?.name || voiceId} as ${role}`);

  } catch (error) {
    console.error('Failed to play preview:', error);
    alert('Preview failed: ' + (error instanceof Error ? error.message : 'Unknown error'));
  } finally {
    previewBtnEl.disabled = false;
    previewBtnEl.textContent = 'Preview';
  }
}

// =============================================================================
// Initialization
// =============================================================================

async function initializeVoiceTester(): Promise<void> {
  // Fetch voices and configuration
  const [voices, config] = await Promise.all([fetchVoices(), fetchConfiguration()]);

  availableVoices = voices;
  if (config) {
    currentMappings = config.mappings;
  }

  // Populate UI
  populateVoiceDropdown(availableVoices);
  updateMappingsTable(currentMappings);
  syncVoiceSelectWithRole();

  // Show the voice tester
  if (voiceTesterEl) {
    voiceTesterEl.style.display = 'block';
  }

  // Set up event listeners
  if (roleSelectEl) {
    roleSelectEl.addEventListener('change', syncVoiceSelectWithRole);
  }
  if (applyBtnEl) {
    applyBtnEl.addEventListener('click', handleApplyClick);
  }
  if (previewBtnEl) {
    previewBtnEl.addEventListener('click', handlePreviewClick);
  }
}

async function initialize(): Promise<void> {
  const serverHealthy = await checkServerHealth();

  if (serverHealthy) {
    await initializeVoiceTester();
  }

  // Periodically recheck health
  setInterval(checkServerHealth, 10000);
}

// Start the application
initialize();

console.log('The Reckoning - Client initialized');
