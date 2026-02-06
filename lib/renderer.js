/**
 * Panel Renderer — Render panel types to DOM elements
 * Each panel type has its own render function producing LCARS-styled HTML
 */

const ICON_MAP = {
  monitor: '🖥️',
  cart: '🛒',
  chart: '📊',
  camera: '📷',
  car: '🚗',
  server: '⚙️',
  database: '💾',
  network: '🌐',
  alert: '🔔',
  shield: '🛡️',
  clock: '⏰',
  user: '👤',
  home: '🏠',
  tools: '🔧',
  eye: '👁️',
  zap: '⚡'
};

const COLOR_MAP = {
  orange: 'var(--lcars-orange)',
  amber: 'var(--lcars-amber)',
  blue: 'var(--lcars-blue)',
  purple: 'var(--lcars-purple)',
  red: 'var(--lcars-danger)',
  green: 'var(--lcars-success)',
  peach: 'var(--lcars-peach)',
  lavender: 'var(--lcars-lavender)',
  tan: 'var(--lcars-tan)',
  success: 'var(--lcars-success)',
  warning: 'var(--lcars-warning)',
  danger: 'var(--lcars-danger)'
};

class PanelRenderer {
  constructor(registry) {
    this.registry = registry;
    this.activePollers = new Map(); // panelId -> intervalId
    this.activeStreams = new Map(); // panelId -> WebSocket
  }

  /**
   * Get icon emoji for app
   */
  getIcon(iconName) {
    return ICON_MAP[iconName] || '📦';
  }

  /**
   * Create the app section with all its panels
   */
  renderAppSection(app, healthStatus) {
    const section = document.createElement('div');
    section.className = 'app-section';
    section.dataset.appId = app.app;

    const status = healthStatus || 'unknown';
    const statusClass = status === 'online' ? 'online' : status === 'offline' ? 'offline' : '';

    section.innerHTML = `
      <div class="app-header" data-app="${app.app}">
        <div class="app-status-dot ${statusClass}"></div>
        <span class="app-icon">${this.getIcon(app.icon)}</span>
        <span class="app-name">${this.escapeHtml(app.name)}</span>
        <span class="app-version">${app.version || ''}</span>
        <span class="app-expand-icon">▶</span>
      </div>
      <div class="app-panels"></div>
    `;

    const header = section.querySelector('.app-header');
    const panels = section.querySelector('.app-panels');

    header.addEventListener('click', () => {
      const isExpanded = section.classList.contains('expanded');
      section.classList.toggle('expanded');
      header.classList.toggle('expanded');

      if (!isExpanded && panels.children.length === 0) {
        this.renderPanels(app, panels);
      }
    });

    return section;
  }

  /**
   * Render all panels for an app
   */
  renderPanels(app, container) {
    if (!app.panels || app.panels.length === 0) {
      container.innerHTML = '<div class="lcars-empty">NO PANELS CONFIGURED</div>';
      return;
    }

    for (const panel of app.panels) {
      const el = this.renderPanel(app, panel);
      if (el) container.appendChild(el);
    }
  }

  /**
   * Dispatch panel rendering to the appropriate type handler
   */
  renderPanel(app, panel) {
    const wrapper = document.createElement('div');
    wrapper.className = 'panel';
    wrapper.dataset.panelId = `${app.app}-${panel.id}`;

    wrapper.innerHTML = `<div class="panel-title">${this.escapeHtml(panel.title)}</div>`;

    const body = document.createElement('div');
    body.className = 'panel-body';

    switch (panel.type) {
      case 'status':
        this.renderStatusPanel(app, panel, body);
        break;
      case 'controls':
        this.renderControlsPanel(app, panel, body);
        break;
      case 'stats':
        this.renderStatsPanel(app, panel, body);
        break;
      case 'iframe':
        this.renderIframePanel(app, panel, body);
        break;
      case 'stream':
        this.renderStreamPanel(app, panel, body);
        break;
      case 'camera':
        this.renderCameraPanel(app, panel, body);
        break;
      default:
        body.innerHTML = `<div class="lcars-empty">UNKNOWN PANEL TYPE: ${panel.type}</div>`;
    }

    wrapper.appendChild(body);
    return wrapper;
  }

  /**
   * STATUS — Polling data table
   */
  renderStatusPanel(app, panel, container) {
    const tableId = `status-${app.app}-${panel.id}`;
    container.innerHTML = `
      <table class="status-table" id="${tableId}">
        <thead><tr>${panel.fields.map(f => `<th>${this.escapeHtml(f.label)}</th>`).join('')}</tr></thead>
        <tbody><tr><td colspan="${panel.fields.length}" class="lcars-empty">LOADING...</td></tr></tbody>
      </table>
    `;

    const fetchData = async () => {
      try {
        let data = await this.registry.fetchPanelData(app, panel);
        if (!Array.isArray(data)) {
          data = data?.data || data?.items || data?.results || [];
        }
        if (!Array.isArray(data)) data = [data];

        const tbody = container.querySelector(`#${tableId} tbody`);
        if (!tbody) return;

        if (data.length === 0) {
          tbody.innerHTML = `<tr><td colspan="${panel.fields.length}" class="lcars-empty">NO DATA</td></tr>`;
          return;
        }

        tbody.innerHTML = data.map(row => `
          <tr>${panel.fields.map(f => {
            const val = this.getNestedValue(row, f.key);
            const colorClass = f.color ? this.getStatusColorClass(val, f.color) : '';
            return `<td class="${colorClass}">${this.escapeHtml(String(val ?? '—'))}</td>`;
          }).join('')}</tr>
        `).join('');
      } catch (err) {
        console.warn(`Status fetch error [${app.app}/${panel.id}]:`, err.message);
      }
    };

    fetchData();

    if (panel.refreshMs) {
      const pollerId = `${app.app}-${panel.id}`;
      this.stopPoller(pollerId);
      const intervalId = setInterval(fetchData, panel.refreshMs);
      this.activePollers.set(pollerId, intervalId);
    }
  }

  /**
   * CONTROLS — Action buttons
   */
  renderControlsPanel(app, panel, container) {
    const grid = document.createElement('div');
    grid.className = 'controls-grid';

    for (const action of (panel.actions || [])) {
      const btn = document.createElement('button');
      const colorClass = `lcars-btn-${action.color || 'orange'}`;
      btn.className = `lcars-btn ${colorClass}`;
      btn.textContent = action.label;

      btn.addEventListener('click', async () => {
        if (action.confirm) {
          const ok = await this.showConfirm(action.confirmText || `Execute ${action.label}?`);
          if (!ok) return;
        }

        btn.classList.add('loading');
        btn.textContent = 'SENDING...';

        try {
          await this.registry.executeAction(app, action);
          btn.textContent = '✓ DONE';
          setTimeout(() => {
            btn.textContent = action.label;
            btn.classList.remove('loading');
          }, 1500);
          this.showToast(`${action.label} — EXECUTED`);
        } catch (err) {
          btn.textContent = '✗ FAILED';
          btn.classList.remove('loading');
          setTimeout(() => { btn.textContent = action.label; }, 2000);
          this.showToast(`${action.label} FAILED: ${err.message}`, true);
        }
      });

      grid.appendChild(btn);
    }

    container.appendChild(grid);
  }

  /**
   * STATS — Metric counters
   */
  renderStatsPanel(app, panel, container) {
    const gridId = `stats-${app.app}-${panel.id}`;
    container.innerHTML = `<div class="stats-grid" id="${gridId}"></div>`;

    const fetchData = async () => {
      try {
        const data = await this.registry.fetchPanelData(app, panel);
        const grid = container.querySelector(`#${gridId}`);
        if (!grid) return;

        grid.innerHTML = (panel.metrics || []).map(m => {
          let val = this.getNestedValue(data, m.key);
          if (val === undefined || val === null) val = '—';
          const prefix = m.prefix || '';
          const suffix = m.suffix || '';
          const colorClass = m.color ? `color-${m.color}` : '';
          return `
            <div class="stat-card">
              <div class="stat-value ${colorClass}">${prefix}${val}${suffix}</div>
              <div class="stat-label">${this.escapeHtml(m.label)}</div>
            </div>
          `;
        }).join('');
      } catch (err) {
        console.warn(`Stats fetch error [${app.app}/${panel.id}]:`, err.message);
      }
    };

    fetchData();

    if (panel.refreshMs) {
      const pollerId = `${app.app}-${panel.id}`;
      this.stopPoller(pollerId);
      const intervalId = setInterval(fetchData, panel.refreshMs);
      this.activePollers.set(pollerId, intervalId);
    }
  }

  /**
   * IFRAME — Embedded view
   */
  renderIframePanel(app, panel, container) {
    const url = panel.url.startsWith('http') ? panel.url : `${app.baseUrl}${panel.url}`;
    const sizeClass = `size-${panel.size || 'medium'}`;

    container.innerHTML = `
      <div class="iframe-container ${sizeClass}">
        <iframe src="${this.escapeHtml(url)}" loading="lazy" sandbox="allow-scripts allow-same-origin allow-forms"></iframe>
      </div>
    `;
  }

  /**
   * STREAM — WebSocket live feed
   */
  renderStreamPanel(app, panel, container) {
    const feedId = `stream-${app.app}-${panel.id}`;
    container.innerHTML = `<div class="stream-feed" id="${feedId}"></div>`;

    if (!panel.wsUrl) {
      container.innerHTML = '<div class="lcars-empty">NO WEBSOCKET URL</div>';
      return;
    }

    try {
      const ws = new WebSocket(panel.wsUrl);
      const feed = container.querySelector(`#${feedId}`);
      const maxItems = panel.maxItems || 20;

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          const item = document.createElement('div');
          item.className = 'stream-item';

          item.innerHTML = (panel.fields || []).map(f => {
            const val = this.getNestedValue(data, f.key);
            if (f.format === 'time' && val) {
              const d = new Date(val);
              return `<span class="stream-time">${d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>`;
            }
            const colorStyle = f.color ? `color: ${COLOR_MAP[f.color] || f.color}` : '';
            return `<span class="stream-data" style="${colorStyle}">${this.escapeHtml(String(val ?? ''))}</span>`;
          }).join('');

          feed.insertBefore(item, feed.firstChild);

          while (feed.children.length > maxItems) {
            feed.removeChild(feed.lastChild);
          }
        } catch (e) { /* ignore malformed messages */ }
      };

      ws.onerror = () => {
        feed.innerHTML = '<div class="lcars-empty">STREAM DISCONNECTED</div>';
      };

      this.activeStreams.set(`${app.app}-${panel.id}`, ws);
    } catch (err) {
      container.innerHTML = `<div class="lcars-empty">STREAM ERROR: ${err.message}</div>`;
    }
  }

  /**
   * CAMERA — Video stream
   */
  renderCameraPanel(app, panel, container) {
    const url = panel.streamUrl || '';
    const sizeClass = panel.size || 'medium';

    if (url.includes('.mp4') || url.includes('stream')) {
      container.innerHTML = `
        <div class="camera-embed size-${sizeClass}">
          <video src="${this.escapeHtml(url)}" autoplay muted playsinline></video>
        </div>
      `;
    } else {
      container.innerHTML = `
        <div class="camera-embed size-${sizeClass}">
          <img src="${this.escapeHtml(url)}" alt="Camera stream" />
        </div>
      `;
    }
  }

  // ─── Helpers ───────────────────────────────────────────────────────

  getNestedValue(obj, path) {
    return path.split('.').reduce((o, k) => o?.[k], obj);
  }

  getStatusColorClass(value, colorMap) {
    if (!colorMap || typeof colorMap !== 'object') return '';
    const v = String(value).toLowerCase();
    const color = colorMap[v];
    if (!color) return '';
    return `status-val-${color}`;
  }

  escapeHtml(str) {
    const el = document.createElement('span');
    el.textContent = str;
    return el.innerHTML;
  }

  stopPoller(id) {
    if (this.activePollers.has(id)) {
      clearInterval(this.activePollers.get(id));
      this.activePollers.delete(id);
    }
  }

  /**
   * Clean up all pollers and streams
   */
  destroy() {
    for (const [id, interval] of this.activePollers) {
      clearInterval(interval);
    }
    this.activePollers.clear();

    for (const [id, ws] of this.activeStreams) {
      ws.close();
    }
    this.activeStreams.clear();
  }

  /**
   * Show toast notification
   */
  showToast(message, isError = false) {
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

  /**
   * Show confirmation dialog
   */
  showConfirm(text) {
    return new Promise((resolve) => {
      const overlay = document.createElement('div');
      overlay.className = 'lcars-confirm-overlay';
      overlay.innerHTML = `
        <div class="lcars-confirm-box">
          <div class="lcars-confirm-text">${this.escapeHtml(text)}</div>
          <div class="lcars-confirm-buttons">
            <button class="lcars-btn lcars-btn-red" data-action="cancel">CANCEL</button>
            <button class="lcars-btn lcars-btn-green" data-action="confirm">CONFIRM</button>
          </div>
        </div>
      `;

      overlay.querySelector('[data-action="confirm"]').addEventListener('click', () => {
        overlay.remove();
        resolve(true);
      });

      overlay.querySelector('[data-action="cancel"]').addEventListener('click', () => {
        overlay.remove();
        resolve(false);
      });

      document.body.appendChild(overlay);
    });
  }
}

if (typeof window !== 'undefined') {
  window.PanelRenderer = PanelRenderer;
}
