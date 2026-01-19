/**
 * EmergenceNotificationService
 *
 * Orchestrates emergence detection and DM notification flow.
 * Integrates EmergenceObserver with persistence and SSE broadcast.
 */

import type { CanonicalEvent, EmergenceNotification, EmergenceOpportunity, EmergenceEntityType } from '@reckoning/shared';
import type { EmergenceObserver, EmergenceOpportunity as ObserverEmergenceOpportunity } from './emergence-observer.js';
import type { EmergenceNotificationRepository, ResolveNotificationInput } from '../../db/repositories/emergence-notification-repository.js';
import type { BroadcastManager } from '../sse/broadcast-manager.js';

/**
 * Configuration for EmergenceNotificationService
 */
export interface EmergenceNotificationServiceConfig {
  emergenceObserver: EmergenceObserver;
  notificationRepo: EmergenceNotificationRepository;
  broadcaster: BroadcastManager;
}

/**
 * Service for handling emergence notifications to the DM
 */
export class EmergenceNotificationService {
  private observer: EmergenceObserver;
  private repo: EmergenceNotificationRepository;
  private broadcaster: BroadcastManager;

  constructor(config: EmergenceNotificationServiceConfig) {
    this.observer = config.emergenceObserver;
    this.repo = config.notificationRepo;
    this.broadcaster = config.broadcaster;
  }

  /**
   * Process an event for emergence detection.
   * Called after an event is committed to the event history.
   *
   * @param event - The committed canonical event
   * @returns Array of created notifications
   */
  processEvent(event: CanonicalEvent): EmergenceNotification[] {
    // Run emergence detection
    const result = this.observer.onEventCommitted(event);

    if (result.opportunities.length === 0) {
      return [];
    }

    // Create notifications for each opportunity
    const notifications: EmergenceNotification[] = [];

    for (const observerOpportunity of result.opportunities) {
      // Check if we already have a pending notification for this entity+type
      // to avoid spamming the DM
      const alreadyExists = this.repo.existsSimilar(
        event.gameId,
        observerOpportunity.entity.id,
        observerOpportunity.type
      );

      if (alreadyExists) {
        continue;
      }

      // Convert observer opportunity to shared type
      const opportunity = this.convertOpportunity(observerOpportunity);

      // Create and persist the notification
      const notification = this.repo.create({
        gameId: event.gameId,
        opportunity,
      });

      notifications.push(notification);

      // Broadcast to DM via SSE
      this.broadcaster.broadcast(event.gameId, {
        type: 'emergence_detected',
        timestamp: new Date().toISOString(),
        opportunity: {
          type: opportunity.type,
          entity: opportunity.entity,
          confidence: opportunity.confidence,
          reason: opportunity.reason,
          triggeringEventId: opportunity.triggeringEventId,
          contributingFactors: opportunity.contributingFactors,
        },
        notificationId: notification.id,
      });
    }

    return notifications;
  }

  /**
   * Convert observer EmergenceOpportunity to shared package type
   */
  private convertOpportunity(observerOpportunity: ObserverEmergenceOpportunity): EmergenceOpportunity {
    return {
      type: observerOpportunity.type,
      entity: {
        type: observerOpportunity.entity.type as EmergenceEntityType,
        id: observerOpportunity.entity.id,
      },
      confidence: observerOpportunity.confidence,
      reason: observerOpportunity.reason,
      triggeringEventId: observerOpportunity.triggeringEventId,
      contributingFactors: observerOpportunity.contributingFactors,
    };
  }

  /**
   * Get pending notifications for a game
   */
  getPendingNotifications(gameId: string): EmergenceNotification[] {
    return this.repo.findPending(gameId);
  }

  /**
   * Get all notifications for a game (with optional limit)
   */
  getNotifications(gameId: string, limit?: number): EmergenceNotification[] {
    return this.repo.findByGame(gameId, limit);
  }

  /**
   * Get a specific notification by ID
   */
  getNotification(id: string): EmergenceNotification | null {
    return this.repo.findById(id);
  }

  /**
   * Acknowledge a notification
   */
  acknowledge(id: string, dmNotes?: string): EmergenceNotification | null {
    return this.repo.resolve(id, {
      status: 'acknowledged',
      dmNotes,
    });
  }

  /**
   * Dismiss a notification
   */
  dismiss(id: string, dmNotes?: string): EmergenceNotification | null {
    return this.repo.resolve(id, {
      status: 'dismissed',
      dmNotes,
    });
  }

  /**
   * Resolve a notification (generic)
   */
  resolve(id: string, input: ResolveNotificationInput): EmergenceNotification | null {
    return this.repo.resolve(id, input);
  }

  /**
   * Delete all notifications for a game
   */
  clearNotifications(gameId: string): void {
    this.repo.deleteByGame(gameId);
  }
}
