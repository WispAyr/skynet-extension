/**
 * Skynet Command — Side Panel Controller
 * Split view: app list on left, selected app panels on right.
 */

(async function () {
  const REGISTRY_URL = 'http://localhost:3210';

  const registry = new SkynetRegistry(REGISTRY_URL);
  const renderer = new PanelRenderer(registry);

  const loadingEl = document.getElementById('loading');
  const navList = document.getElementById('nav-list');
  const navStatus = document.getElementById('nav-status');
  const panelContent = document.getElementById('panel-content');
  const welcomeState = document.getElementById('welcome-state');
  const statusText = document.getElementById('status-text');
  const timeDisplay = document.getElementById('time-display');
  const wsDot = document.getElementById('ws-dot');
  const wsLabel = document.getElementById('ws-label');

  const healthMap = new Map();
  let selectedApp = null;
  let currentApps = [];

  // ─── Clock ────────────────────────────────────────────────────────

  function updateClock() {
    const now = new Date();
    timeDisplay.textContent = now.toLocaleTimeString('en-GB', {
      hour: '2-digit', minute: '2-digit', second: '2-digit'
    });
  }
  updateClock();
  setInterval(updateClock, 1000);

  // ─── Icon helper ──────────────────────────────────────────────────

  function getIcon(name) {
    return renderer.getIcon(name);
  }

  // ─── Navigation ───────────────────────────────────────────────────

  function renderNav(apps) {
    navList.innerHTML = '';

    for (const app of apps) {
      const item = document.createElement('div');
      item.className = 'app-nav-item';
      if (selectedApp === app.app) item.classList.add('active');
      item.dataset.app = app.app;

      const health = healthMap.get(app.app) || 'unknown';
      const dotClass = health === 'online' ? 'online' : health === 'offline' ? 'offline' : '';

      item.innerHTML = `
        <div class="nav-app-dot ${dotClass}"></div>
        <span class="nav-app-icon">${getIcon(app.icon)}</span>
        <span class="nav-app-name">${app.name}</span>
      `;

      item.addEventListener('click', () => selectApp(app));
      navList.appendChild(item);
    }

    navStatus.textContent = `${apps.length} APP${apps.length === 1 ? '' : 'S'}`;
  }

  function selectApp(app) {
    selectedApp = app.app;

    // Update nav active state
    document.querySelectorAll('.app-nav-item').forEach(el => {
      el.classList.toggle('active', el.dataset.app === app.app);
    });

    // Render panels
    renderer.destroy();
    panelContent.innerHTML = '';
    welcomeState.style.display = 'none';
    panelContent.style.display = 'block';

    // App header
    const header = document.createElement('div');
    header.className = 'selected-app-header';
    header.innerHTML = `
      <span class="app-icon" style="font-size:18px">${getIcon(app.icon)}</span>
      <span style="font-size:16px;font-weight:700;letter-spacing:0.15em;color:var(--lcars-orange)">${app.name}</span>
      <span style="font-size:10px;color:var(--lcars-text-muted);margin-left:8px">v${app.version || '?'}</span>
    `;
    header.style.cssText = 'display:flex;align-items:center;gap:8px;margin-bottom:16px;padding-bottom:8px;border-bottom:2px solid var(--lcars-orange)';
    panelContent.appendChild(header);

    // Render each panel
    renderer.renderPanels(app, panelContent);
  }

  // ─── Main Refresh ─────────────────────────────────────────────────

  async function refresh() {
    const apps = await registry.fetch();
    currentApps = apps;

    if (apps.length === 0) {
      loadingEl.style.display = 'none';
      navList.innerHTML = '<div class="lcars-empty" style="padding:16px;font-size:10px">NO APPS</div>';
      statusText.textContent = 'NO APPS FOUND';
      return;
    }

    // Check health
    const healthResults = await registry.checkAllHealth();
    for (const r of healthResults) {
      healthMap.set(r.app, r.status);
    }

    renderNav(apps);

    loadingEl.style.display = 'none';

    if (!selectedApp) {
      welcomeState.style.display = 'flex';
      panelContent.style.display = 'none';
    }

    const onlineCount = healthResults.filter(r => r.status === 'online').length;
    statusText.textContent = `${onlineCount}/${apps.length} ONLINE`;
  }

  // Initial load
  await refresh();

  // Poll for changes every 15s
  setInterval(async () => {
    try {
      const apps = await registry.fetch();
      const healthResults = await registry.checkAllHealth();
      for (const r of healthResults) {
        healthMap.set(r.app, r.status);
      }

      // Update nav dots
      document.querySelectorAll('.app-nav-item').forEach(el => {
        const dot = el.querySelector('.nav-app-dot');
        const health = healthMap.get(el.dataset.app) || 'unknown';
        dot.className = `nav-app-dot ${health === 'online' ? 'online' : health === 'offline' ? 'offline' : ''}`;
      });

      // Check for app list changes
      const currentSet = new Set(currentApps.map(a => a.app));
      const newSet = new Set(apps.map(a => a.app));
      const hasChanges = currentSet.size !== newSet.size || [...newSet].some(a => !currentSet.has(a));

      if (hasChanges) {
        currentApps = apps;
        renderNav(apps);
      }

      const onlineCount = healthResults.filter(r => r.status === 'online').length;
      statusText.textContent = `${onlineCount}/${apps.length} ONLINE`;
    } catch (err) {
      statusText.textContent = 'REGISTRY OFFLINE';
    }
  }, 15000);

  // ─── WebSocket ────────────────────────────────────────────────────

  const ws = new SkynetWebSocket('ws://localhost:3210/ws/panels');

  ws.onMessage((msg) => {
    if (msg.type === 'panel.update' || msg.type === 'panel.register') {
      refresh();
    }
    if (msg.type === 'connection') {
      wsDot.className = `ws-dot ${msg.status === 'connected' ? 'connected' : ''}`;
      wsLabel.textContent = msg.status === 'connected' ? 'LIVE' : 'RECONNECTING';
    }
  });

  ws.connect();

  // Cleanup
  window.addEventListener('unload', () => {
    renderer.destroy();
    ws.disconnect();
  });
})();
