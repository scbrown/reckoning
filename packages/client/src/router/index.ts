/**
 * Simple Router for Game Views
 *
 * Handles URL patterns like:
 * - /game/:id/view/dm - DM View
 * - /game/:id/view/party - Party View (future)
 *
 * Uses hash-based routing for simplicity (#/game/123/view/dm)
 */

export type ViewType = 'dm' | 'party';

export interface RouteParams {
  gameId: string;
  view: ViewType;
}

export interface Route {
  path: 'welcome' | 'game';
  params?: RouteParams;
}

type RouteChangeCallback = (route: Route) => void;

/**
 * Simple hash-based router for game views
 */
export class Router {
  private callbacks: RouteChangeCallback[] = [];
  private currentRoute: Route = { path: 'welcome' };

  constructor() {
    // Listen for hash changes
    window.addEventListener('hashchange', () => this.handleHashChange());

    // Handle initial route
    this.handleHashChange();
  }

  /**
   * Get current route
   */
  getRoute(): Route {
    return this.currentRoute;
  }

  /**
   * Navigate to a route
   */
  navigate(route: Route): void {
    const hash = this.routeToHash(route);
    if (window.location.hash !== hash) {
      window.location.hash = hash;
    } else {
      // If hash is same, still notify callbacks
      this.notifyCallbacks(route);
    }
  }

  /**
   * Navigate to welcome screen
   */
  navigateToWelcome(): void {
    this.navigate({ path: 'welcome' });
  }

  /**
   * Navigate to game view
   */
  navigateToGame(gameId: string, view: ViewType = 'dm'): void {
    this.navigate({
      path: 'game',
      params: { gameId, view },
    });
  }

  /**
   * Subscribe to route changes
   */
  onRouteChange(callback: RouteChangeCallback): () => void {
    this.callbacks.push(callback);
    // Immediately call with current route
    callback(this.currentRoute);

    // Return unsubscribe function
    return () => {
      const index = this.callbacks.indexOf(callback);
      if (index > -1) {
        this.callbacks.splice(index, 1);
      }
    };
  }

  /**
   * Parse hash to route
   */
  private parseHash(hash: string): Route {
    // Remove leading #
    const path = hash.replace(/^#\/?/, '');

    if (!path || path === '/') {
      return { path: 'welcome' };
    }

    // Match /game/:id/view/:viewType
    const gameMatch = path.match(/^game\/([^/]+)\/view\/(dm|party)$/);
    if (gameMatch) {
      return {
        path: 'game',
        params: {
          gameId: gameMatch[1],
          view: gameMatch[2] as ViewType,
        },
      };
    }

    // Match /game/:id (default to DM view)
    const gameIdMatch = path.match(/^game\/([^/]+)$/);
    if (gameIdMatch) {
      return {
        path: 'game',
        params: {
          gameId: gameIdMatch[1],
          view: 'dm',
        },
      };
    }

    // Unknown route, default to welcome
    return { path: 'welcome' };
  }

  /**
   * Convert route to hash
   */
  private routeToHash(route: Route): string {
    if (route.path === 'welcome') {
      return '#/';
    }

    if (route.path === 'game' && route.params) {
      return `#/game/${route.params.gameId}/view/${route.params.view}`;
    }

    return '#/';
  }

  /**
   * Handle hash change event
   */
  private handleHashChange(): void {
    const route = this.parseHash(window.location.hash);
    this.currentRoute = route;
    this.notifyCallbacks(route);
  }

  /**
   * Notify all callbacks of route change
   */
  private notifyCallbacks(route: Route): void {
    for (const callback of this.callbacks) {
      callback(route);
    }
  }
}

// Singleton instance
let routerInstance: Router | null = null;

/**
 * Get or create the router instance
 */
export function getRouter(): Router {
  if (!routerInstance) {
    routerInstance = new Router();
  }
  return routerInstance;
}

export default Router;
