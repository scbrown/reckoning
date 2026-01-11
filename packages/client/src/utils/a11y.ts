/**
 * Accessibility Helper Utilities
 *
 * Provides functions for improving accessibility of DOM elements,
 * including ARIA attributes, focus management, and screen reader announcements.
 */

// =============================================================================
// ARIA Attribute Helpers
// =============================================================================

/**
 * Set the aria-label attribute on an element
 *
 * @param element - The DOM element to modify
 * @param label - The accessible label text
 *
 * @example
 * ```typescript
 * const button = document.querySelector('button');
 * setAriaLabel(button, 'Close dialog');
 * ```
 */
export function setAriaLabel(element: HTMLElement, label: string): void {
  element.setAttribute('aria-label', label);
}

/**
 * Set the role attribute on an element
 *
 * @param element - The DOM element to modify
 * @param role - The ARIA role (e.g., 'button', 'dialog', 'alert')
 *
 * @example
 * ```typescript
 * const div = document.querySelector('.custom-button');
 * setRole(div, 'button');
 * ```
 */
export function setRole(element: HTMLElement, role: string): void {
  element.setAttribute('role', role);
}

// =============================================================================
// Focus Management
// =============================================================================

/**
 * Make an element focusable via keyboard navigation
 *
 * @param element - The DOM element to make focusable
 * @param tabIndex - The tab index value (default: 0 for natural tab order)
 *
 * @example
 * ```typescript
 * const card = document.querySelector('.card');
 * makeFocusable(card);
 * ```
 */
export function makeFocusable(element: HTMLElement, tabIndex = 0): void {
  element.setAttribute('tabindex', String(tabIndex));
}

// =============================================================================
// Screen Reader Announcements
// =============================================================================

/**
 * Announce a message to screen readers using a live region
 *
 * Creates a temporary visually-hidden element with aria-live to announce
 * messages to assistive technology users.
 *
 * @param message - The message to announce
 * @param priority - 'polite' waits for idle, 'assertive' interrupts (default: 'polite')
 *
 * @example
 * ```typescript
 * // Announce a status update
 * announceToScreenReader('Form submitted successfully');
 *
 * // Announce an urgent error
 * announceToScreenReader('Connection lost', 'assertive');
 * ```
 */
export function announceToScreenReader(
  message: string,
  priority: 'polite' | 'assertive' = 'polite'
): void {
  const announcement = document.createElement('div');

  // Visually hidden but accessible to screen readers
  announcement.style.cssText = `
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  `;

  announcement.setAttribute('aria-live', priority);
  announcement.setAttribute('aria-atomic', 'true');
  announcement.setAttribute('role', 'status');

  document.body.appendChild(announcement);

  // Delay setting text content to ensure screen readers detect the change
  requestAnimationFrame(() => {
    announcement.textContent = message;

    // Remove after announcement is read (3 seconds should be sufficient)
    setTimeout(() => {
      announcement.remove();
    }, 3000);
  });
}
