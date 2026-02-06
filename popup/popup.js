/**
 * Skynet Command — Popup Controller
 * Initializes registry, renders apps, manages lifecycle.
 */

(async function () {
  const REGISTRY_URL = 'http://localhost:3210';

  const registry = new SkynetRegistry(REGISTRY_URL);
  const renderer = new PanelRenderer(registry);

  const loadingEl = document.getElementById('loading');
  const appsContainer = document.getElementById('apps-container');
  const emptyState = document.getElementById('empty-state');
  const statusText = document.getElementById('status-text');
  const appCount = document.getElementById('app-count');

  // Track health per app
  const healthMap = new Map();

  async function refresh() {
    const apps = await registry.fetch();

    if (apps.length === 0) {
      loadingEl.style.display = 'none';
      appsContainer.style.display = 'none';
      emptyState.style.display = 'block';
      statusText.textContent = 'NO APPS FOUND';
      appCount.textContent = '0 APPS';
      return;
    }

    // Check health in parallel
    const healthResults = await registry.checkAllHealth();
    for (const r of healthResults) {
      healthMap.set(r.app, r.status);
    }

    // Clear and re-render
    appsContainer.innerHTML = '';

    for (const app of apps) {
      const section = renderer.renderAppSection(app, healthMap.get(app.app));
      appsContainer.appendChild(section);
    }

    loadingEl.style.display = 'none';
    appsContainer.style.display = 'block';
    emptyState.style.display = 'none';

    const onlineCount = healthResults.filter(r => r.status === 'online').length;
    statusText.textContent = `${onlineCount}/${apps.length} ONLINE`;
    appCount.textContent = `${apps.length} APP${apps.length === 1 ? '' : 'S'}`;
  }

  // Initial load
  await refresh();

  // Poll for changes every 15s
  setInterval(async () => {
    try {
      const apps = await registry.fetch();

      // Update health dots without full re-render
      const healthResults = await registry.checkAllHealth();
      for (const r of healthResults) {
        healthMap.set(r.app, r.status);
        const dot = document.querySelector(`.app-section[data-app-id="${r.app}"] .app-status-dot`);
        if (dot) {
          dot.className = `app-status-dot ${r.status === 'online' ? 'online' : r.status === 'offline' ? 'offline' : ''}`;
        }
      }

      const onlineCount = healthResults.filter(r => r.status === 'online').length;
      statusText.textContent = `${onlineCount}/${apps.length} ONLINE`;
      appCount.textContent = `${apps.length} APP${apps.length === 1 ? '' : 'S'}`;

      // Check if app list changed (new apps added or removed)
      const currentApps = new Set(Array.from(document.querySelectorAll('.app-section')).map(el => el.dataset.appId));
      const registryApps = new Set(apps.map(a => a.app));

      const hasChanges = currentApps.size !== registryApps.size ||
        [...registryApps].some(a => !currentApps.has(a));

      if (hasChanges) {
        renderer.destroy();
        appsContainer.innerHTML = '';
        for (const app of apps) {
          const section = renderer.renderAppSection(app, healthMap.get(app.app));
          appsContainer.appendChild(section);
        }
      }
    } catch (err) {
      statusText.textContent = 'REGISTRY OFFLINE';
    }
  }, 15000);

  // Connect WebSocket for live updates
  const ws = new SkynetWebSocket('ws://localhost:3210/ws/panels');
  ws.onMessage((msg) => {
    if (msg.type === 'panel.update' || msg.type === 'panel.register') {
      refresh(); // Full refresh on registry changes
    }
    if (msg.type === 'connection') {
      const dot = document.querySelector('.lcars-footer-cap-right');
      if (dot) {
        dot.style.background = msg.status === 'connected'
          ? 'var(--lcars-success)'
          : 'var(--lcars-lavender)';
      }
    }
  });
  ws.connect();

  // Cleanup on popup close
  window.addEventListener('unload', () => {
    renderer.destroy();
    ws.disconnect();
  });
})();
