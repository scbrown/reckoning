#!/usr/bin/env node
/**
 * reckoning-seed CLI
 *
 * A CLI tool for Claude Code to communicate with the Reckoning server
 * during world seeding research sessions.
 *
 * Commands:
 *   submit  - Submit a completed WorldSeed JSON
 *   event   - Send a progress event during research
 *
 * Usage:
 *   reckoning-seed submit --session <id> --file <path>
 *   reckoning-seed event --session <id> --type <type> [--data <json>]
 */

import { readFileSync, existsSync } from 'fs';
import { resolve, dirname, join } from 'path';
import { fileURLToPath } from 'url';

// =============================================================================
// Types
// =============================================================================

interface SubmitOptions {
  session: string;
  file: string;
}

interface EventOptions {
  session: string;
  type: EventType;
  data?: string;
}

type EventType =
  | 'research-started'
  | 'source-found'
  | 'adapting'
  | 'synthesizing';

const VALID_EVENT_TYPES: EventType[] = [
  'research-started',
  'source-found',
  'adapting',
  'synthesizing',
];

interface CommandResult {
  success: boolean;
  message?: string;
  error?: string;
}

// =============================================================================
// Configuration
// =============================================================================

function getServerUrl(): string {
  // Check environment variable first
  if (process.env.RECKONING_SERVER_URL) {
    return process.env.RECKONING_SERVER_URL;
  }

  // Try to read from .server-port file
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const projectRoot = resolve(__dirname, '../../../..');
  const portFile = join(projectRoot, '.server-port');

  if (existsSync(portFile)) {
    try {
      const port = readFileSync(portFile, 'utf-8').trim();
      return `http://localhost:${port}`;
    } catch {
      // Fall through to default
    }
  }

  // Default
  return 'http://localhost:3001';
}

// =============================================================================
// Argument Parsing
// =============================================================================

interface ParsedArgs {
  command: 'submit' | 'event' | 'help';
  options: Record<string, string>;
}

function parseArgs(args: string[]): ParsedArgs {
  const command = args[0] as ParsedArgs['command'] || 'help';
  const options: Record<string, string> = {};

  for (let i = 1; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const value = args[i + 1];
      if (value && !value.startsWith('--')) {
        options[key] = value;
        i++;
      } else {
        options[key] = 'true';
      }
    }
  }

  return { command, options };
}

// =============================================================================
// Commands
// =============================================================================

async function submitWorldSeed(options: SubmitOptions): Promise<CommandResult> {
  const { session, file } = options;

  if (!session) {
    return { success: false, error: 'Missing required --session argument' };
  }

  if (!file) {
    return { success: false, error: 'Missing required --file argument' };
  }

  // Read the JSON file
  const filePath = resolve(process.cwd(), file);
  if (!existsSync(filePath)) {
    return { success: false, error: `File not found: ${filePath}` };
  }

  let seedData: unknown;
  try {
    const content = readFileSync(filePath, 'utf-8');
    seedData = JSON.parse(content);
  } catch (e) {
    return {
      success: false,
      error: `Failed to parse JSON file: ${e instanceof Error ? e.message : 'Unknown error'}`,
    };
  }

  // Submit to server
  const serverUrl = getServerUrl();
  const url = `${serverUrl}/api/seed/submit`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: session,
        seed: seedData,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return {
        success: false,
        error: `Server error (${response.status}): ${errorText}`,
      };
    }

    const result = await response.json() as { success: boolean; message?: string };
    return {
      success: true,
      message: result.message || 'WorldSeed submitted successfully',
    };
  } catch (e) {
    return {
      success: false,
      error: `Network error: ${e instanceof Error ? e.message : 'Unknown error'}`,
    };
  }
}

async function sendEvent(options: EventOptions): Promise<CommandResult> {
  const { session, type, data } = options;

  if (!session) {
    return { success: false, error: 'Missing required --session argument' };
  }

  if (!type) {
    return { success: false, error: 'Missing required --type argument' };
  }

  if (!VALID_EVENT_TYPES.includes(type)) {
    return {
      success: false,
      error: `Invalid event type: ${type}. Valid types: ${VALID_EVENT_TYPES.join(', ')}`,
    };
  }

  // Parse optional data
  let eventData: unknown = undefined;
  if (data) {
    try {
      eventData = JSON.parse(data);
    } catch (e) {
      return {
        success: false,
        error: `Failed to parse --data JSON: ${e instanceof Error ? e.message : 'Unknown error'}`,
      };
    }
  }

  // Send to server
  const serverUrl = getServerUrl();
  const url = `${serverUrl}/api/seed/event`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: session,
        type,
        data: eventData,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return {
        success: false,
        error: `Server error (${response.status}): ${errorText}`,
      };
    }

    return {
      success: true,
      message: `Event '${type}' sent successfully`,
    };
  } catch (e) {
    return {
      success: false,
      error: `Network error: ${e instanceof Error ? e.message : 'Unknown error'}`,
    };
  }
}

function showHelp(): void {
  console.log(`
reckoning-seed - CLI tool for Reckoning world seeding

USAGE:
  reckoning-seed <command> [options]

COMMANDS:
  submit    Submit a completed WorldSeed JSON file
  event     Send a progress event during research
  help      Show this help message

SUBMIT COMMAND:
  reckoning-seed submit --session <id> --file <path>

  Options:
    --session   Session ID for the research session (required)
    --file      Path to WorldSeed JSON file (required)

EVENT COMMAND:
  reckoning-seed event --session <id> --type <type> [--data <json>]

  Options:
    --session   Session ID for the research session (required)
    --type      Event type (required). One of:
                  research-started  - Beginning research on topic
                  source-found      - Found relevant source material
                  adapting          - Transforming to DM requirements
                  synthesizing      - Building final WorldSeed
    --data      Optional JSON data for the event

ENVIRONMENT:
  RECKONING_SERVER_URL   Override the server URL (default: http://localhost:3001)

EXAMPLES:
  # Submit a WorldSeed
  reckoning-seed submit --session abc123 --file ./worldseed.json

  # Send progress events
  reckoning-seed event --session abc123 --type research-started
  reckoning-seed event --session abc123 --type source-found --data '{"source": "Wikipedia"}'
  reckoning-seed event --session abc123 --type synthesizing
`);
}

// =============================================================================
// Main
// =============================================================================

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const { command, options } = parseArgs(args);

  let result: CommandResult;

  switch (command) {
    case 'submit':
      result = await submitWorldSeed({
        session: options.session,
        file: options.file,
      });
      break;

    case 'event':
      result = await sendEvent({
        session: options.session,
        type: options.type as EventType,
        data: options.data,
      });
      break;

    case 'help':
    default:
      showHelp();
      process.exit(0);
  }

  if (result.success) {
    console.log(`[reckoning-seed] ${result.message}`);
    process.exit(0);
  } else {
    console.error(`[reckoning-seed] Error: ${result.error}`);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(`[reckoning-seed] Fatal error: ${e.message}`);
  process.exit(1);
});
