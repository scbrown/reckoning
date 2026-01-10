/**
 * Reckoning Client Entry Point
 */

import type { HealthStatus } from '@reckoning/shared';

const statusEl = document.getElementById('status');

async function checkServerHealth(): Promise<void> {
  try {
    const response = await fetch('/api/health');
    const health: HealthStatus = await response.json();

    if (statusEl) {
      if (health.status === 'healthy') {
        statusEl.textContent = `Server connected (uptime: ${Math.floor(health.uptime / 1000)}s)`;
        statusEl.className = 'status connected';
      } else {
        statusEl.textContent = `Server status: ${health.status}`;
        statusEl.className = 'status error';
      }
    }
  } catch (error) {
    if (statusEl) {
      statusEl.textContent = 'Server not available. Run: just dev-server';
      statusEl.className = 'status error';
    }
  }
}

// Check health on load
checkServerHealth();

// Periodically recheck
setInterval(checkServerHealth, 10000);

console.log('The Reckoning - Client initialized');
