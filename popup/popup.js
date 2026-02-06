/**
 * Skynet Command — Popup Controller
 * Initializes registry, renders apps, manages lifecycle.
 */

(async function () {
  // Auto-detect registry: try localhost first, fall back to PU2 IPs
  let REGISTRY_URL = 'http://localhost:3210';
  
  // If not on PU2 itself, use its network IP
  const hostname = window.location.hostname;
  if (hostname !== 'localhost' && hostname !== '127.0.0.1' && hostname !== '10.10.10.123') {
    REGISTRY_URL = 'http://192.168.195.33:3210';
  }
  
  // Allow override from storage
  const stored = await new Promise(r => chrome.storage?.local?.get(['registryUrl'], d => r(d?.registryUrl)));
  if (stored) REGISTRY_URL = stored;

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

  // ============================================
  // SentryFlow Alerts in Popup
  // ============================================
  const alertsBanner = document.getElementById('alerts-banner');
  const alertsList = document.getElementById('alerts-list');
  const alertBadge = document.getElementById('alert-badge');
  const clearBtn = document.getElementById('clear-alerts');

  function renderAlerts(alerts, count) {
    if (!alerts || alerts.length === 0) {
      alertsBanner.style.display = 'none';
      return;
    }
    alertsBanner.style.display = 'block';
    alertBadge.textContent = count || alerts.length;
    
    alertsList.innerHTML = alerts.slice(0, 10).map(a => {
      const time = new Date(a.timestamp).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
      const levelClass = a.level >= 2 ? 'alert-critical' : a.level >= 1 ? 'alert-warning' : 'alert-info';
      return `<div class="alert-item ${levelClass}">
        <span class="alert-time">${time}</span>
        <span class="alert-camera">${a.camera}</span>
        <span class="alert-msg">${a.type}</span>
      </div>`;
    }).join('');
  }

  // Load existing alerts
  chrome.runtime.sendMessage({ type: 'getAlerts' }, (resp) => {
    if (resp) renderAlerts(resp.alerts, resp.count);
  });

  // Listen for new alerts
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === 'sentryflow_event') {
      chrome.runtime.sendMessage({ type: 'getAlerts' }, (resp) => {
        if (resp) renderAlerts(resp.alerts, resp.count);
      });
    }
  });

  // Clear button
  clearBtn?.addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'clearAlerts' }, () => {
      alertsBanner.style.display = 'none';
    });
  });

  // Cleanup on popup close
  window.addEventListener('unload', () => {
    renderer.destroy();
    ws.disconnect();
  });
})();
