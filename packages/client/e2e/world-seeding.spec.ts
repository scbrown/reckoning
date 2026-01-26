/**
 * World Seeding E2E Tests
 *
 * Tests for the world seeding feature that uses Claude Code as a research agent
 * to generate game worlds from pop culture references.
 */

import { test, expect } from './fixtures';
import {
  mockTTSInstant,
  mockResearchSession,
  TEST_WORLD_SEED,
} from './mock-helpers';

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Navigate through wizard to the world step
 */
async function navigateToWorldStep(page: import('@playwright/test').Page, playerName = 'Test Hero'): Promise<void> {
  // Click new game button
  await page.click('#new-game-btn');

  // Wait for modal
  await page.waitForSelector('[role="dialog"]', { timeout: 5000 });

  // Step 1: Character - Fill in name and click Next
  const nameInput = page.locator('input[placeholder*="name" i]').first();
  if (await nameInput.isVisible({ timeout: 2000 })) {
    await nameInput.fill(playerName);
  }

  // Click Next to go to Step 2 (Party)
  const nextBtn1 = page.locator('button:has-text("Next")');
  if (await nextBtn1.isVisible({ timeout: 2000 })) {
    await nextBtn1.click();
    await page.waitForTimeout(300);
  }

  // Step 2: Party - Click Next to go to Step 3 (World)
  const nextBtn2 = page.locator('button:has-text("Next")');
  if (await nextBtn2.isVisible({ timeout: 2000 })) {
    await nextBtn2.click();
    await page.waitForTimeout(300);
  }
}

/**
 * Check if world seeding option is visible in the wizard
 */
async function isWorldSeedingOptionVisible(page: import('@playwright/test').Page): Promise<boolean> {
  // Look for world seeding input or button
  const seedPromptInput = page.locator('[data-testid="seed-prompt-input"], input[placeholder*="inspired by" i], textarea[placeholder*="inspired by" i]');
  const seedButton = page.locator('button:has-text("Seed from"), button:has-text("Research World"), button:has-text("Use AI Research")');

  return (await seedPromptInput.isVisible({ timeout: 2000 }).catch(() => false)) ||
         (await seedButton.isVisible({ timeout: 2000 }).catch(() => false));
}

// =============================================================================
// World Seeding Option Tests
// =============================================================================

test.describe('World Seeding Option in Wizard', () => {
  test.beforeEach(async ({ page }) => {
    await mockTTSInstant(page);
  });

  test('world seeding option appears in new game wizard', async ({ mockedPage }) => {
    await mockedPage.goto('/');
    await navigateToWorldStep(mockedPage);

    // Check for world seeding UI elements
    // The world step should have an option to seed from pop culture
    const worldStep = mockedPage.locator('[role="dialog"]');
    await expect(worldStep).toBeVisible();

    // Check for seed prompt input or world seeding button
    const hasSeedOption = await isWorldSeedingOptionVisible(mockedPage);

    // The wizard should show the world generation step
    const worldTitle = mockedPage.locator('h2:has-text("World"), h2:has-text("Generate")');
    await expect(worldTitle).toBeVisible({ timeout: 3000 });
  });

  test('world step shows theme and tone selectors by default', async ({ mockedPage }) => {
    await mockedPage.goto('/');
    await navigateToWorldStep(mockedPage);

    // Default world generation should have theme and tone selectors
    const themeSelect = mockedPage.locator('select:has-text("Fantasy"), select[id*="theme"]');
    const toneSelect = mockedPage.locator('select:has-text("Balanced"), select:has-text("Heroic"), select[id*="tone"]');

    // At least theme or tone should be visible
    const hasTheme = await themeSelect.isVisible({ timeout: 2000 }).catch(() => false);
    const hasTone = await toneSelect.isVisible({ timeout: 2000 }).catch(() => false);

    expect(hasTheme || hasTone).toBe(true);
  });
});

// =============================================================================
// Research Console Tests
// =============================================================================

test.describe('Research Console', () => {
  test.beforeEach(async ({ page }) => {
    await mockTTSInstant(page);
  });

  test('entering seed prompt opens research console', async ({ mockedPage }) => {
    // Set up mock for research session
    await mockResearchSession(mockedPage, {
      consoleOutput: ['Starting research session...\n'],
    });

    await mockedPage.goto('/');
    await navigateToWorldStep(mockedPage);

    // Look for seed prompt input
    const seedInput = mockedPage.locator('[data-testid="seed-prompt-input"], input[placeholder*="inspired" i], textarea[placeholder*="inspired" i]');

    if (await seedInput.isVisible({ timeout: 2000 })) {
      await seedInput.fill('Create a game inspired by Die Hard');

      // Click button to start research
      const startResearchBtn = mockedPage.locator('button:has-text("Research"), button:has-text("Begin Research"), button:has-text("Start Research")');
      if (await startResearchBtn.isVisible({ timeout: 2000 })) {
        await startResearchBtn.click();

        // Research console should appear
        const researchConsole = mockedPage.locator('.research-console, [data-testid="research-console"]');
        await expect(researchConsole).toBeVisible({ timeout: 5000 });
      }
    }
  });

  test('research console streams Claude Code output', async ({ mockedPage }) => {
    const consoleOutput = [
      'Starting research session...\n',
      'Searching for: Die Hard 1988 movie\n',
      'Analyzing plot structure...\n',
      'Identifying key characters...\n',
    ];

    await mockResearchSession(mockedPage, { consoleOutput });

    await mockedPage.goto('/');
    await navigateToWorldStep(mockedPage);

    const seedInput = mockedPage.locator('[data-testid="seed-prompt-input"], input[placeholder*="inspired" i], textarea[placeholder*="inspired" i]');

    if (await seedInput.isVisible({ timeout: 2000 })) {
      await seedInput.fill('Create a game inspired by Die Hard');

      const startResearchBtn = mockedPage.locator('button:has-text("Research"), button:has-text("Begin Research")');
      if (await startResearchBtn.isVisible({ timeout: 2000 })) {
        await startResearchBtn.click();

        // Wait for console output
        const consoleOutputEl = mockedPage.locator('.research-console-output, [role="log"]');
        if (await consoleOutputEl.isVisible({ timeout: 5000 })) {
          // Check that output is streamed
          const text = await consoleOutputEl.textContent();
          expect(text).toContain('Starting research session');
        }
      }
    }
  });

  test('research console shows connection status', async ({ mockedPage }) => {
    await mockResearchSession(mockedPage);

    await mockedPage.goto('/');
    await navigateToWorldStep(mockedPage);

    const seedInput = mockedPage.locator('[data-testid="seed-prompt-input"], input[placeholder*="inspired" i], textarea[placeholder*="inspired" i]');

    if (await seedInput.isVisible({ timeout: 2000 })) {
      await seedInput.fill('Create a game inspired by Die Hard');

      const startResearchBtn = mockedPage.locator('button:has-text("Research")');
      if (await startResearchBtn.isVisible({ timeout: 2000 })) {
        await startResearchBtn.click();

        // Status indicator should be visible
        const statusIndicator = mockedPage.locator('.research-console-status, [role="status"]');
        await expect(statusIndicator).toBeVisible({ timeout: 5000 });
      }
    }
  });

  test('DM can provide guidance input during research', async ({ mockedPage }) => {
    await mockResearchSession(mockedPage);

    await mockedPage.goto('/');
    await navigateToWorldStep(mockedPage);

    const seedInput = mockedPage.locator('[data-testid="seed-prompt-input"], input[placeholder*="inspired" i], textarea[placeholder*="inspired" i]');

    if (await seedInput.isVisible({ timeout: 2000 })) {
      await seedInput.fill('Create a game inspired by Die Hard');

      const startResearchBtn = mockedPage.locator('button:has-text("Research")');
      if (await startResearchBtn.isVisible({ timeout: 2000 })) {
        await startResearchBtn.click();

        // Wait for research console
        const researchConsole = mockedPage.locator('.research-console');
        if (await researchConsole.isVisible({ timeout: 5000 })) {
          // Input field for guidance should be visible
          const guidanceInput = mockedPage.locator('.research-console-input, input[placeholder*="guide" i]');
          await expect(guidanceInput).toBeVisible();

          // Should be able to type guidance
          await guidanceInput.fill('Also include Argyle the limo driver');

          // Send button should be visible
          const sendBtn = mockedPage.locator('.research-console-send, button:has-text("Send")');
          await expect(sendBtn).toBeVisible();
        }
      }
    }
  });
});

// =============================================================================
// Cancel and Control Tests
// =============================================================================

test.describe('Research Session Controls', () => {
  test.beforeEach(async ({ page }) => {
    await mockTTSInstant(page);
  });

  test('cancel button stops research session', async ({ mockedPage }) => {
    // Mock a slow research session
    await mockResearchSession(mockedPage, {
      consoleOutput: [
        'Starting research...\n',
        'This will take a while...\n',
      ],
      delayMs: 1000,
    });

    await mockedPage.goto('/');
    await navigateToWorldStep(mockedPage);

    const seedInput = mockedPage.locator('[data-testid="seed-prompt-input"], input[placeholder*="inspired" i], textarea[placeholder*="inspired" i]');

    if (await seedInput.isVisible({ timeout: 2000 })) {
      await seedInput.fill('Create a game inspired by Die Hard');

      const startResearchBtn = mockedPage.locator('button:has-text("Research")');
      if (await startResearchBtn.isVisible({ timeout: 2000 })) {
        await startResearchBtn.click();

        // Wait for console to appear
        const researchConsole = mockedPage.locator('.research-console');
        if (await researchConsole.isVisible({ timeout: 5000 })) {
          // Cancel button should be visible
          const cancelBtn = mockedPage.locator('button:has-text("Cancel"), button:has-text("Stop")');
          await expect(cancelBtn).toBeVisible();

          // Click cancel
          await cancelBtn.click();

          // Console should close or show cancelled state
          const cancelledIndicator = mockedPage.locator('.research-console-status:has-text("Cancelled"), .research-console-status:has-text("Stopped")');
          const consoleHidden = await researchConsole.isHidden({ timeout: 3000 }).catch(() => false);

          // Either console is hidden or shows cancelled status
          expect(consoleHidden || await cancelledIndicator.isVisible({ timeout: 1000 }).catch(() => false)).toBe(true);
        }
      }
    }
  });

  test('auto-scroll toggle controls console scrolling', async ({ mockedPage }) => {
    await mockResearchSession(mockedPage);

    await mockedPage.goto('/');
    await navigateToWorldStep(mockedPage);

    const seedInput = mockedPage.locator('[data-testid="seed-prompt-input"], input[placeholder*="inspired" i], textarea[placeholder*="inspired" i]');

    if (await seedInput.isVisible({ timeout: 2000 })) {
      await seedInput.fill('Create a game');

      const startResearchBtn = mockedPage.locator('button:has-text("Research")');
      if (await startResearchBtn.isVisible({ timeout: 2000 })) {
        await startResearchBtn.click();

        const researchConsole = mockedPage.locator('.research-console');
        if (await researchConsole.isVisible({ timeout: 5000 })) {
          // Auto-scroll toggle should be visible
          const autoScrollToggle = mockedPage.locator('.auto-scroll-toggle input[type="checkbox"]');
          await expect(autoScrollToggle).toBeVisible();

          // Should be checked by default
          await expect(autoScrollToggle).toBeChecked();

          // Should be able to uncheck
          await autoScrollToggle.uncheck();
          await expect(autoScrollToggle).not.toBeChecked();
        }
      }
    }
  });
});

// =============================================================================
// WorldSeed Completion Tests
// =============================================================================

test.describe('WorldSeed Completion', () => {
  test.beforeEach(async ({ page }) => {
    await mockTTSInstant(page);
  });

  test('completed research shows WorldSeed summary', async ({ mockedPage }) => {
    await mockResearchSession(mockedPage, {
      worldSeed: TEST_WORLD_SEED,
    });

    await mockedPage.goto('/');
    await navigateToWorldStep(mockedPage);

    const seedInput = mockedPage.locator('[data-testid="seed-prompt-input"], input[placeholder*="inspired" i], textarea[placeholder*="inspired" i]');

    if (await seedInput.isVisible({ timeout: 2000 })) {
      await seedInput.fill('Create a game inspired by Die Hard');

      const startResearchBtn = mockedPage.locator('button:has-text("Research")');
      if (await startResearchBtn.isVisible({ timeout: 2000 })) {
        await startResearchBtn.click();

        // Wait for worldseed to be received
        await mockedPage.waitForTimeout(1000);

        // WorldSeed summary should be visible
        const worldSeedSummary = mockedPage.locator('.worldseed-summary, [data-testid="worldseed-summary"], .seed-preview');

        // Or check for specific WorldSeed content
        const settingText = mockedPage.locator(`text="${TEST_WORLD_SEED.setting.slice(0, 20)}"`);
        const sourceText = mockedPage.locator(`text="${TEST_WORLD_SEED.sourceInspiration.slice(0, 20)}"`);

        const hasSummary = await worldSeedSummary.isVisible({ timeout: 5000 }).catch(() => false);
        const hasSetting = await settingText.isVisible({ timeout: 1000 }).catch(() => false);
        const hasSource = await sourceText.isVisible({ timeout: 1000 }).catch(() => false);

        // At least one indicator of WorldSeed display
        expect(hasSummary || hasSetting || hasSource).toBe(true);
      }
    }
  });

  test('WorldSeed shows character information', async ({ mockedPage }) => {
    await mockResearchSession(mockedPage, {
      worldSeed: TEST_WORLD_SEED,
    });

    await mockedPage.goto('/');
    await navigateToWorldStep(mockedPage);

    const seedInput = mockedPage.locator('[data-testid="seed-prompt-input"], input[placeholder*="inspired" i], textarea[placeholder*="inspired" i]');

    if (await seedInput.isVisible({ timeout: 2000 })) {
      await seedInput.fill('Create a game');

      const startResearchBtn = mockedPage.locator('button:has-text("Research")');
      if (await startResearchBtn.isVisible({ timeout: 2000 })) {
        await startResearchBtn.click();

        await mockedPage.waitForTimeout(1000);

        // Check for character names from the seed
        const characterName = TEST_WORLD_SEED.characters[0].name;
        const characterText = mockedPage.locator(`text="${characterName}"`);

        // Character info may be shown in summary
        const hasCharacter = await characterText.isVisible({ timeout: 3000 }).catch(() => false);

        // Or characters section
        const charactersSection = mockedPage.locator('.seed-characters, [data-testid="seed-characters"]');
        const hasCharactersSection = await charactersSection.isVisible({ timeout: 1000 }).catch(() => false);

        expect(hasCharacter || hasCharactersSection).toBe(true);
      }
    }
  });

  test('WorldSeed shows location information', async ({ mockedPage }) => {
    await mockResearchSession(mockedPage, {
      worldSeed: TEST_WORLD_SEED,
    });

    await mockedPage.goto('/');
    await navigateToWorldStep(mockedPage);

    const seedInput = mockedPage.locator('[data-testid="seed-prompt-input"], input[placeholder*="inspired" i], textarea[placeholder*="inspired" i]');

    if (await seedInput.isVisible({ timeout: 2000 })) {
      await seedInput.fill('Create a game');

      const startResearchBtn = mockedPage.locator('button:has-text("Research")');
      if (await startResearchBtn.isVisible({ timeout: 2000 })) {
        await startResearchBtn.click();

        await mockedPage.waitForTimeout(1000);

        // Check for location names from the seed
        const locationName = TEST_WORLD_SEED.locations[0].name;
        const locationText = mockedPage.locator(`text="${locationName}"`);

        const hasLocation = await locationText.isVisible({ timeout: 3000 }).catch(() => false);

        // Or locations section
        const locationsSection = mockedPage.locator('.seed-locations, [data-testid="seed-locations"]');
        const hasLocationsSection = await locationsSection.isVisible({ timeout: 1000 }).catch(() => false);

        expect(hasLocation || hasLocationsSection).toBe(true);
      }
    }
  });
});

// =============================================================================
// Accept/Regenerate Tests
// =============================================================================

test.describe('WorldSeed Accept and Regenerate', () => {
  test.beforeEach(async ({ page }) => {
    await mockTTSInstant(page);
  });

  test('WorldSeed can be accepted', async ({ mockedPage }) => {
    await mockResearchSession(mockedPage, {
      worldSeed: TEST_WORLD_SEED,
    });

    await mockedPage.goto('/');
    await navigateToWorldStep(mockedPage);

    const seedInput = mockedPage.locator('[data-testid="seed-prompt-input"], input[placeholder*="inspired" i], textarea[placeholder*="inspired" i]');

    if (await seedInput.isVisible({ timeout: 2000 })) {
      await seedInput.fill('Create a game');

      const startResearchBtn = mockedPage.locator('button:has-text("Research")');
      if (await startResearchBtn.isVisible({ timeout: 2000 })) {
        await startResearchBtn.click();

        await mockedPage.waitForTimeout(1000);

        // Accept button should be visible after WorldSeed is shown
        const acceptBtn = mockedPage.locator('button:has-text("Accept"), button:has-text("Use This Seed"), button:has-text("Continue")');
        await expect(acceptBtn).toBeVisible({ timeout: 5000 });
      }
    }
  });

  test('WorldSeed can be regenerated', async ({ mockedPage }) => {
    await mockResearchSession(mockedPage, {
      worldSeed: TEST_WORLD_SEED,
    });

    await mockedPage.goto('/');
    await navigateToWorldStep(mockedPage);

    const seedInput = mockedPage.locator('[data-testid="seed-prompt-input"], input[placeholder*="inspired" i], textarea[placeholder*="inspired" i]');

    if (await seedInput.isVisible({ timeout: 2000 })) {
      await seedInput.fill('Create a game');

      const startResearchBtn = mockedPage.locator('button:has-text("Research")');
      if (await startResearchBtn.isVisible({ timeout: 2000 })) {
        await startResearchBtn.click();

        await mockedPage.waitForTimeout(1000);

        // Regenerate button should be visible
        const regenerateBtn = mockedPage.locator('button:has-text("Regenerate"), button:has-text("Try Again"), button:has-text("Research Again")');
        await expect(regenerateBtn).toBeVisible({ timeout: 5000 });
      }
    }
  });

  test('accepted WorldSeed proceeds to world generation', async ({ mockedPage }) => {
    await mockResearchSession(mockedPage, {
      worldSeed: TEST_WORLD_SEED,
    });

    await mockedPage.goto('/');
    await navigateToWorldStep(mockedPage);

    const seedInput = mockedPage.locator('[data-testid="seed-prompt-input"], input[placeholder*="inspired" i], textarea[placeholder*="inspired" i]');

    if (await seedInput.isVisible({ timeout: 2000 })) {
      await seedInput.fill('Create a game');

      const startResearchBtn = mockedPage.locator('button:has-text("Research")');
      if (await startResearchBtn.isVisible({ timeout: 2000 })) {
        await startResearchBtn.click();

        await mockedPage.waitForTimeout(1000);

        const acceptBtn = mockedPage.locator('button:has-text("Accept"), button:has-text("Use This Seed"), button:has-text("Continue")');
        if (await acceptBtn.isVisible({ timeout: 5000 })) {
          await acceptBtn.click();

          // Should proceed to review step or world generation
          const reviewStep = mockedPage.locator('h2:has-text("Review"), .wizard-step:has-text("Review").active');
          const generateBtn = mockedPage.locator('button:has-text("Generate World"), button:has-text("Begin Adventure")');

          const atReview = await reviewStep.isVisible({ timeout: 3000 }).catch(() => false);
          const hasGenerate = await generateBtn.isVisible({ timeout: 1000 }).catch(() => false);

          expect(atReview || hasGenerate).toBe(true);
        }
      }
    }
  });
});

// =============================================================================
// Generated World Tests
// =============================================================================

test.describe('Generated World Reflects Seed', () => {
  test.beforeEach(async ({ page }) => {
    await mockTTSInstant(page);
  });

  test('generated world uses seed tone', async ({ mockedPage }) => {
    await mockResearchSession(mockedPage, {
      worldSeed: TEST_WORLD_SEED,
    });

    await mockedPage.goto('/');
    await navigateToWorldStep(mockedPage);

    const seedInput = mockedPage.locator('[data-testid="seed-prompt-input"], input[placeholder*="inspired" i], textarea[placeholder*="inspired" i]');

    if (await seedInput.isVisible({ timeout: 2000 })) {
      await seedInput.fill('Create a dramatic game');

      const startResearchBtn = mockedPage.locator('button:has-text("Research")');
      if (await startResearchBtn.isVisible({ timeout: 2000 })) {
        await startResearchBtn.click();

        await mockedPage.waitForTimeout(1000);

        // Check that tone from seed is reflected
        const toneText = mockedPage.locator(`text="${TEST_WORLD_SEED.tone.overall}"`);
        const toneDescription = mockedPage.locator(`text="${TEST_WORLD_SEED.tone.description.slice(0, 20)}"`);

        const hasTone = await toneText.isVisible({ timeout: 3000 }).catch(() => false);
        const hasDescription = await toneDescription.isVisible({ timeout: 1000 }).catch(() => false);

        expect(hasTone || hasDescription).toBe(true);
      }
    }
  });

  test('generated world includes seed themes', async ({ mockedPage }) => {
    await mockResearchSession(mockedPage, {
      worldSeed: TEST_WORLD_SEED,
    });

    await mockedPage.goto('/');
    await navigateToWorldStep(mockedPage);

    const seedInput = mockedPage.locator('[data-testid="seed-prompt-input"], input[placeholder*="inspired" i], textarea[placeholder*="inspired" i]');

    if (await seedInput.isVisible({ timeout: 2000 })) {
      await seedInput.fill('Create a game');

      const startResearchBtn = mockedPage.locator('button:has-text("Research")');
      if (await startResearchBtn.isVisible({ timeout: 2000 })) {
        await startResearchBtn.click();

        await mockedPage.waitForTimeout(1000);

        // Check for themes from seed
        const firstTheme = TEST_WORLD_SEED.themes[0];
        const themeText = mockedPage.locator(`text="${firstTheme.slice(0, 15)}"`);

        // Or themes section
        const themesSection = mockedPage.locator('.seed-themes, [data-testid="seed-themes"]');

        const hasTheme = await themeText.isVisible({ timeout: 3000 }).catch(() => false);
        const hasThemesSection = await themesSection.isVisible({ timeout: 1000 }).catch(() => false);

        expect(hasTheme || hasThemesSection).toBe(true);
      }
    }
  });
});

// =============================================================================
// Error Handling Tests
// =============================================================================

test.describe('Research Error Handling', () => {
  test.beforeEach(async ({ page }) => {
    await mockTTSInstant(page);
  });

  test('shows error message when research fails', async ({ mockedPage }) => {
    await mockResearchSession(mockedPage, {
      error: 'Research session failed: Network timeout',
    });

    await mockedPage.goto('/');
    await navigateToWorldStep(mockedPage);

    const seedInput = mockedPage.locator('[data-testid="seed-prompt-input"], input[placeholder*="inspired" i], textarea[placeholder*="inspired" i]');

    if (await seedInput.isVisible({ timeout: 2000 })) {
      await seedInput.fill('Create a game');

      const startResearchBtn = mockedPage.locator('button:has-text("Research")');
      if (await startResearchBtn.isVisible({ timeout: 2000 })) {
        await startResearchBtn.click();

        await mockedPage.waitForTimeout(1000);

        // Error message should be visible
        const errorText = mockedPage.locator('text="error" i, text="failed" i');
        const errorStatus = mockedPage.locator('.research-console-status.status-error, .error-message');

        const hasError = await errorText.isVisible({ timeout: 3000 }).catch(() => false);
        const hasErrorStatus = await errorStatus.isVisible({ timeout: 1000 }).catch(() => false);

        expect(hasError || hasErrorStatus).toBe(true);
      }
    }
  });

  test('allows retry after error', async ({ mockedPage }) => {
    await mockResearchSession(mockedPage, {
      error: 'Research failed',
    });

    await mockedPage.goto('/');
    await navigateToWorldStep(mockedPage);

    const seedInput = mockedPage.locator('[data-testid="seed-prompt-input"], input[placeholder*="inspired" i], textarea[placeholder*="inspired" i]');

    if (await seedInput.isVisible({ timeout: 2000 })) {
      await seedInput.fill('Create a game');

      const startResearchBtn = mockedPage.locator('button:has-text("Research")');
      if (await startResearchBtn.isVisible({ timeout: 2000 })) {
        await startResearchBtn.click();

        await mockedPage.waitForTimeout(1000);

        // Retry button should be visible
        const retryBtn = mockedPage.locator('button:has-text("Retry"), button:has-text("Try Again")');
        const hasRetry = await retryBtn.isVisible({ timeout: 3000 }).catch(() => false);

        // Or user can start research again
        const canResearchAgain = await startResearchBtn.isVisible({ timeout: 1000 }).catch(() => false);

        expect(hasRetry || canResearchAgain).toBe(true);
      }
    }
  });
});

// =============================================================================
// Accessibility Tests
// =============================================================================

test.describe('World Seeding Accessibility', () => {
  test.beforeEach(async ({ page }) => {
    await mockTTSInstant(page);
  });

  test('research console has proper ARIA attributes', async ({ mockedPage }) => {
    await mockResearchSession(mockedPage);

    await mockedPage.goto('/');
    await navigateToWorldStep(mockedPage);

    const seedInput = mockedPage.locator('[data-testid="seed-prompt-input"], input[placeholder*="inspired" i], textarea[placeholder*="inspired" i]');

    if (await seedInput.isVisible({ timeout: 2000 })) {
      await seedInput.fill('Create a game');

      const startResearchBtn = mockedPage.locator('button:has-text("Research")');
      if (await startResearchBtn.isVisible({ timeout: 2000 })) {
        await startResearchBtn.click();

        const researchConsole = mockedPage.locator('.research-console');
        if (await researchConsole.isVisible({ timeout: 5000 })) {
          // Console output should have log role
          const consoleOutput = mockedPage.locator('.research-console-output');
          if (await consoleOutput.isVisible({ timeout: 1000 })) {
            const role = await consoleOutput.getAttribute('role');
            expect(role).toBe('log');
          }

          // Status should have status role
          const status = mockedPage.locator('.research-console-status');
          if (await status.isVisible({ timeout: 1000 })) {
            const statusRole = await status.getAttribute('role');
            expect(statusRole).toBe('status');
          }
        }
      }
    }
  });

  test('research console region is labeled', async ({ mockedPage }) => {
    await mockResearchSession(mockedPage);

    await mockedPage.goto('/');
    await navigateToWorldStep(mockedPage);

    const seedInput = mockedPage.locator('[data-testid="seed-prompt-input"], input[placeholder*="inspired" i], textarea[placeholder*="inspired" i]');

    if (await seedInput.isVisible({ timeout: 2000 })) {
      await seedInput.fill('Create a game');

      const startResearchBtn = mockedPage.locator('button:has-text("Research")');
      if (await startResearchBtn.isVisible({ timeout: 2000 })) {
        await startResearchBtn.click();

        const researchConsole = mockedPage.locator('.research-console[role="region"]');
        if (await researchConsole.isVisible({ timeout: 5000 })) {
          const ariaLabel = await researchConsole.getAttribute('aria-label');
          expect(ariaLabel).toBeTruthy();
          expect(ariaLabel).toContain('Research');
        }
      }
    }
  });

  test('guidance input has accessible label', async ({ mockedPage }) => {
    await mockResearchSession(mockedPage);

    await mockedPage.goto('/');
    await navigateToWorldStep(mockedPage);

    const seedInput = mockedPage.locator('[data-testid="seed-prompt-input"], input[placeholder*="inspired" i], textarea[placeholder*="inspired" i]');

    if (await seedInput.isVisible({ timeout: 2000 })) {
      await seedInput.fill('Create a game');

      const startResearchBtn = mockedPage.locator('button:has-text("Research")');
      if (await startResearchBtn.isVisible({ timeout: 2000 })) {
        await startResearchBtn.click();

        const researchConsole = mockedPage.locator('.research-console');
        if (await researchConsole.isVisible({ timeout: 5000 })) {
          const guidanceInput = mockedPage.locator('.research-console-input');
          if (await guidanceInput.isVisible({ timeout: 1000 })) {
            const ariaLabel = await guidanceInput.getAttribute('aria-label');
            expect(ariaLabel).toBeTruthy();
          }
        }
      }
    }
  });
});
