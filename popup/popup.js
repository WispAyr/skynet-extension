/**
 * Skynet Command — Popup (Launcher Mode)
 * Clean app grid with pop-out and inline quick actions.
 */

const ICON_MAP = {
  monitor: '🖥️', cart: '🛒', chart: '📊', camera: '📷', car: '🚗',
  server: '⚙️', database: '💾', network: '🌐', globe: '🌐', alert: '🔔',
  shield: '🛡️', clock: '⏰', user: '👤', home: '🏠', tools: '🔧',
  eye: '👁️', zap: '⚡', command: '🎯', clipboard: '📋'
};

(async function () {
  // Determine registry URL
  let REGISTRY_URL = 'http://localhost:3210';
  const stored = await new Promise(r => chrome.storage?.local?.get(['registryUrl'], d => r(d?.registryUrl)));
  if (stored) {
    REGISTRY_URL = stored;
  } else {
    // Test if localhost works, otherwise use VPN IP
    try {
      const test = await fetch('http://localhost:3210/api/panels', { signal: AbortSignal.timeout(2000) });
      if (!test.ok) throw new Error();
    } catch {
      REGISTRY_URL = 'http://192.168.195.33:3210';
    }
  }

  const registry = new SkynetRegistry(REGISTRY_URL);
  const loadingEl = document.getElementById('loading');
  const appsGrid = document.getElementById('apps-grid');
  const quickActions = document.getElementById('quick-actions');
  const quickActionsGrid = document.getElementById('quick-actions-grid');
  const emptyState = document.getElementById('empty-state');
  const statusText = document.getElementById('status-text');
  const appCountEl = document.getElementById('app-count');

  /**
   * Rewrite localhost URLs to registry host for remote access
   */
  function rewriteUrl(url) {
    if (!url) return url;
    if (url.includes('localhost') && !REGISTRY_URL.includes('localhost')) {
      const host = new URL(REGISTRY_URL).hostname;
      return url.replace(/localhost/g, host);
    }
    return url;
  }

  /**
   * Open an app in a new Chrome window (pop-out)
   */
  function popOutApp(app, panel) {
    let url;
    if (panel && panel.type === 'iframe') {
      url = panel.url.startsWith('http') ? panel.url : `${app.baseUrl}${panel.url}`;
    } else {
      url = app.baseUrl;
    }
    url = rewriteUrl(url);
    chrome.windows.create({
      url: url,
      type: 'popup',
      width: 1200,
      height: 800,
      focused: true
    });
  }

  /**
   * Open app in a new tab
   */
  function openAppTab(app, panel) {
    let url;
    if (panel && panel.type === 'iframe') {
      url = panel.url.startsWith('http') ? panel.url : `${app.baseUrl}${panel.url}`;
    } else {
      url = app.baseUrl;
    }
    url = rewriteUrl(url);
    chrome.tabs.create({ url, active: true });
  }

  /**
   * Execute a control action against an app
   */
  async function executeAction(app, action) {
    const url = rewriteUrl(`${app.baseUrl}${action.endpoint}`);
    const resp = await fetch(url, {
      method: action.method || 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: action.body ? JSON.stringify(action.body) : undefined
    });
    if (!resp.ok) throw new Error(`${resp.status}`);
    return resp.json();
  }

  /**
   * Render the app grid
   */
  async function refresh() {
    const apps = await registry.fetch();

    if (apps.length === 0) {
      loadingEl.style.display = 'none';
      emptyState.style.display = 'block';
      statusText.textContent = 'NO APPS FOUND';
      return;
    }

    const healthResults = await registry.checkAllHealth();
    const healthMap = new Map(healthResults.map(r => [r.app, r.status]));

    appsGrid.innerHTML = '';
    const allActions = [];

    for (const app of apps) {
      const status = healthMap.get(app.app) || 'unknown';
      const icon = ICON_MAP[app.icon] || '📦';
      const panelCount = (app.panels || []).length;
      
      // Find the iframe panel (main dashboard) for pop-out
      const dashPanel = (app.panels || []).find(p => p.type === 'iframe');
      
      const card = document.createElement('div');
      card.className = `app-card ${status}`;
      card.innerHTML = `
        <div class="app-card-top">
          <span class="app-card-icon">${icon}</span>
          <span class="app-card-name">${escapeHtml(app.name)}</span>
          <div class="app-card-status ${status}"></div>
        </div>
        <div class="app-card-meta">
          <span class="app-card-panels">${panelCount} panel${panelCount !== 1 ? 's' : ''}</span>
          <div class="app-card-actions">
            <button class="app-btn" data-action="tab" title="Open in tab">↗ TAB</button>
            <button class="app-btn primary" data-action="popout" title="Pop out window">⧉ POP</button>
          </div>
        </div>
      `;

      // Click card = open in side panel
      card.addEventListener('click', (e) => {
        if (e.target.closest('.app-btn')) return;
        // Open side panel with this app focused
        chrome.runtime.sendMessage({ type: 'openSidePanel', app: app.app });
        // Fallback: open in tab
        openAppTab(app, dashPanel);
      });

      card.querySelector('[data-action="tab"]').addEventListener('click', (e) => {
        e.stopPropagation();
        openAppTab(app, dashPanel);
      });

      card.querySelector('[data-action="popout"]').addEventListener('click', (e) => {
        e.stopPropagation();
        popOutApp(app, dashPanel);
      });

      appsGrid.appendChild(card);

      // Collect control actions for quick actions bar
      for (const panel of (app.panels || [])) {
        if (panel.type === 'controls') {
          for (const action of (panel.actions || [])) {
            allActions.push({ app, action });
          }
        }
      }
    }

    // Render quick actions
    if (allActions.length > 0) {
      quickActionsGrid.innerHTML = '';
      for (const { app, action } of allActions) {
        const btn = document.createElement('button');
        const colorClass = action.color === 'red' ? 'armed' : 
                          action.color === 'green' ? 'disarm' :
                          action.color === 'blue' ? 'audio' : '';
        btn.className = `qa-btn ${colorClass}`;
        btn.textContent = action.label;
        btn.title = `${app.name} → ${action.label}`;

        btn.addEventListener('click', async () => {
          if (action.confirm) {
            if (!confirm(action.confirmText || `Execute ${action.label}?`)) return;
          }
          btn.textContent = '...';
          try {
            await executeAction(app, action);
            btn.textContent = '✓';
            showToast(`${action.label} — DONE`);
            setTimeout(() => { btn.textContent = action.label; }, 1500);
          } catch (err) {
            btn.textContent = '✗';
            showToast(`FAILED: ${err.message}`, true);
            setTimeout(() => { btn.textContent = action.label; }, 2000);
          }
        });

        quickActionsGrid.appendChild(btn);
      }
      quickActions.style.display = 'block';
    }

    loadingEl.style.display = 'none';
    appsGrid.style.display = 'grid';

    const onlineCount = healthResults.filter(r => r.status === 'online').length;
    statusText.textContent = `${onlineCount}/${apps.length} ONLINE`;
    appCountEl.textContent = `${apps.length} APP${apps.length === 1 ? '' : 'S'}`;
  }

  // ─── Alerts ────────────────────────────────────────

  const alertsBanner = document.getElementById('alerts-banner');
  const alertsList = document.getElementById('alerts-list');
  const alertBadge = document.getElementById('alert-badge');
  const alertsToggle = document.getElementById('alerts-toggle');
  const clearBtn = document.getElementById('clear-alerts');

  function renderAlerts(alerts, count) {
    if (!alerts || alerts.length === 0) {
      alertsBanner.style.display = 'none';
      return;
    }
    alertsBanner.style.display = 'block';
    alertBadge.textContent = count || alerts.length;

    alertsList.innerHTML = alerts.slice(0, 8).map(a => {
      const time = new Date(a.timestamp).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
      const levelClass = a.level >= 2 ? 'alert-critical' : a.level >= 1 ? 'alert-warning' : 'alert-info';
      return `<div class="alert-item ${levelClass}">
        <span class="alert-time">${time}</span>
        <span class="alert-camera">${a.camera}</span>
        <span class="alert-msg">${a.type}</span>
      </div>`;
    }).join('');
  }

  // Toggle alert list expand/collapse
  alertsToggle?.addEventListener('click', () => {
    alertsList.classList.toggle('expanded');
  });

  clearBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    chrome.runtime.sendMessage({ type: 'clearAlerts' }, () => {
      alertsBanner.style.display = 'none';
    });
  });

  // Load existing alerts
  chrome.runtime.sendMessage({ type: 'getAlerts' }, (resp) => {
    if (resp) renderAlerts(resp.alerts, resp.count);
  });

  // Live alert updates
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === 'sentryflow_event') {
      chrome.runtime.sendMessage({ type: 'getAlerts' }, (resp) => {
        if (resp) renderAlerts(resp.alerts, resp.count);
      });
    }
  });

  // ─── Side Panel Button ────────────────────────────

  document.getElementById('open-sidepanel')?.addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'openSidePanel' });
  });

  // ─── Init ─────────────────────────────────────────

  await refresh();

  // Light refresh every 30s (just health dots, no full re-render)
  setInterval(async () => {
    try {
      const healthResults = await registry.checkAllHealth();
      for (const r of healthResults) {
        const card = appsGrid.querySelector(`.app-card[class*="${r.app}"]`);
        // Update status dots
        const dots = appsGrid.querySelectorAll('.app-card-status');
        const cards = appsGrid.querySelectorAll('.app-card');
        cards.forEach((c, i) => {
          // Match by order since we don't have data attrs yet
        });
      }
      const apps = await registry.fetch();
      const onlineCount = healthResults.filter(r => r.status === 'online').length;
      statusText.textContent = `${onlineCount}/${apps.length} ONLINE`;
    } catch { 
      statusText.textContent = 'REGISTRY OFFLINE';
    }
  }, 30000);

  // ─── WebSocket for live registry updates ──────────
  const wsHost = REGISTRY_URL.replace('http://', 'ws://').replace('https://', 'wss://');
  const ws = new SkynetWebSocket(`${wsHost}/ws/panels`);
  ws.onMessage((msg) => {
    if (msg.type === 'panel.update' || msg.type === 'panel.register') {
      refresh();
    }
  });
  ws.connect();

  window.addEventListener('unload', () => ws.disconnect());

  // ─── Helpers ──────────────────────────────────────

  function escapeHtml(str) {
    const el = document.createElement('span');
    el.textContent = str;
    return el.innerHTML;
  }

  function showToast(message, isError = false) {
    let toast = document.querySelector('.lcars-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.className = 'lcars-toast';
      document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.classList.toggle('error', isError);
    toast.classList.add('visible');
    setTimeout(() => toast.classList.remove('visible'), 3000);
  }
})();
