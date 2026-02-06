/**
 * Registry Client — Fetch and cache panel manifests from Skynet registry
 */

const DEFAULT_REGISTRY = 'http://localhost:3210';
const CACHE_KEY = 'skynet_panels_cache';
const CACHE_TTL = 60000; // 1 minute

class Registry {
  constructor(baseUrl) {
    this.baseUrl = baseUrl || DEFAULT_REGISTRY;
    this.apps = [];
    this.lastFetch = 0;
    this.listeners = [];
    this.polling = false;
    this.pollTimer = null;
  }

  /**
   * Fetch all registered panels from the registry
   */
  async fetch() {
    try {
      const resp = await fetch(`${this.baseUrl}/api/panels`, {
        headers: { 'Accept': 'application/json' }
      });

      if (!resp.ok) throw new Error(`Registry returned ${resp.status}`);

      const data = await resp.json();
      this.apps = (data.apps || []).map(app => {
        // Rewrite localhost URLs to match the registry host when accessing remotely
        if (app.baseUrl && app.baseUrl.includes('localhost') && !this.baseUrl.includes('localhost')) {
          const registryHost = new URL(this.baseUrl).hostname;
          app.baseUrl = app.baseUrl.replace('localhost', registryHost);
          // Also rewrite panel wsUrls
          if (app.panels) {
            app.panels.forEach(p => {
              if (p.wsUrl && p.wsUrl.includes('localhost')) {
                p.wsUrl = p.wsUrl.replace('localhost', registryHost);
              }
            });
          }
        }
        return app;
      });
      this.lastFetch = Date.now();

      // Cache to storage
      try {
        chrome.storage?.local?.set({ [CACHE_KEY]: { apps: this.apps, ts: this.lastFetch } });
      } catch (e) { /* not in extension context */ }

      // Notify listeners
      this.listeners.forEach(fn => fn(this.apps));

      return this.apps;
    } catch (err) {
      console.warn('Registry fetch failed:', err.message);

      // Try cached data
      if (this.apps.length === 0) {
        await this.loadCache();
      }

      return this.apps;
    }
  }

  /**
   * Load cached panels from storage
   */
  async loadCache() {
    return new Promise((resolve) => {
      try {
        chrome.storage?.local?.get([CACHE_KEY], (data) => {
          const cached = data?.[CACHE_KEY];
          if (cached && cached.apps) {
            this.apps = cached.apps;
            this.lastFetch = cached.ts || 0;
          }
          resolve(this.apps);
        });
      } catch (e) {
        resolve(this.apps);
      }
    });
  }

  /**
   * Check if a specific app is reachable
   */
  async checkHealth(app) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3000);
      // Try /_panel first, fall back to base URL
      let resp = await fetch(`${app.baseUrl}/_panel`, { signal: controller.signal }).catch(() => null);
      if (!resp || !resp.ok) {
        const controller2 = new AbortController();
        const timeout2 = setTimeout(() => controller2.abort(), 3000);
        resp = await fetch(app.baseUrl, { signal: controller2.signal }).catch(() => null);
        clearTimeout(timeout2);
      }
      clearTimeout(timeout);
      return resp && (resp.ok || resp.status < 500) ? 'online' : 'error';
    } catch {
      return 'offline';
    }
  }

  /**
   * Check health of all registered apps
   */
  async checkAllHealth() {
    const results = await Promise.all(
      this.apps.map(async (app) => ({
        app: app.app,
        status: await this.checkHealth(app)
      }))
    );
    return results;
  }

  /**
   * Start polling the registry
   */
  startPolling(intervalMs = 15000) {
    if (this.polling) return;
    this.polling = true;

    const poll = async () => {
      await this.fetch();
      if (this.polling) {
        this.pollTimer = setTimeout(poll, intervalMs);
      }
    };

    poll();
  }

  /**
   * Stop polling
   */
  stopPolling() {
    this.polling = false;
    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }
  }

  /**
   * Subscribe to registry updates
   */
  onChange(fn) {
    this.listeners.push(fn);
    return () => {
      this.listeners = this.listeners.filter(l => l !== fn);
    };
  }

  /**
   * Execute an action against an app
   */
  async executeAction(app, action) {
    const url = `${app.baseUrl}${action.endpoint}`;
    const opts = {
      method: action.method || 'POST',
      headers: { 'Content-Type': 'application/json' }
    };

    if (action.body && (action.method === 'POST' || action.method === 'PUT')) {
      opts.body = JSON.stringify(action.body);
    }

    const resp = await fetch(url, opts);
    if (!resp.ok) throw new Error(`Action failed: ${resp.status}`);
    return resp.json();
  }

  /**
   * Fetch data from a status/stats endpoint
   */
  async fetchPanelData(app, panel) {
    const url = `${app.baseUrl}${panel.endpoint}`;
    const resp = await fetch(url, { headers: { 'Accept': 'application/json' } });
    if (!resp.ok) throw new Error(`Panel data fetch failed: ${resp.status}`);

    let data = await resp.json();

    // Extract data using dataPath if specified
    if (panel.dataPath) {
      const parts = panel.dataPath.split('.');
      for (const part of parts) {
        data = data?.[part];
      }
    }

    return data;
  }
}

// Export singleton or class
if (typeof window !== 'undefined') {
  window.SkynetRegistry = Registry;
}
