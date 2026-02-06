// Skynet Browser Extension - Content Script (Visor)
// Version 2.2.1 - Added settings integration

(function() {
  'use strict';
  
  // Don't inject on extension pages
  if (window.location.protocol === 'chrome-extension:' || 
      window.location.protocol === 'chrome:') {
    return;
  }
  
  // Check if already injected
  if (document.getElementById('skynet-visor')) {
    return;
  }
  
  const VISOR_STORAGE_KEY = 'skynet-visor-visible';
  let cachedSettings = null;
  
  // ==================== Create Visor ====================
  
  const visor = document.createElement('div');
  visor.id = 'skynet-visor';
  visor.innerHTML = `
    <div class="visor-left-cap"></div>
    <div class="visor-content">
      <a href="http://10.10.10.123:3210/skynet" target="_blank" class="visor-service" title="Skynet Dashboard">
        <span class="visor-icon">🤖</span>
        <span class="visor-label">Dashboard</span>
      </a>
      <a href="http://10.10.10.123:5180" target="_blank" class="visor-service" title="LCARS Interface">
        <span class="visor-icon">🖖</span>
        <span class="visor-label">LCARS</span>
      </a>
      <a href="http://10.10.10.123:3000" target="_blank" class="visor-service" title="POS System">
        <span class="visor-icon">💳</span>
        <span class="visor-label">POS</span>
      </a>
      <a href="http://10.10.10.123:3400" target="_blank" class="visor-service" title="Signage Control">
        <span class="visor-icon">📺</span>
        <span class="visor-label">Signage</span>
      </a>
      <a href="http://10.10.10.123:3210/files" target="_blank" class="visor-service" title="File Manager">
        <span class="visor-icon">📁</span>
        <span class="visor-label">Files</span>
      </a>
      <a href="http://10.10.10.123:1984" target="_blank" class="visor-service" title="Camera Feeds">
        <span class="visor-icon">📹</span>
        <span class="visor-label">Cameras</span>
      </a>
      <div class="visor-divider"></div>
      <button id="visor-investigate" class="visor-btn" title="Send page to AI for analysis">
        <span class="visor-icon">🔍</span>
        <span class="visor-label">Investigate</span>
      </button>
      <button id="visor-screenshot" class="visor-btn" title="Capture screenshot (Alt+P)">
        <span class="visor-icon">📸</span>
        <span class="visor-label">Screenshot</span>
      </button>
      <button id="visor-archive" class="visor-btn" title="Archive all bookmarks">
        <span class="visor-icon">📦</span>
        <span class="visor-label">Archive</span>
      </button>
      <div class="visor-divider"></div>
      <div id="visor-ce-metrics" class="visor-metrics">
        <span class="ce-metric" id="ce-status" title="CyberEther Status">⚡ --</span>
        <span class="ce-metric" id="ce-anpr" title="ANPR events/min">📸 --</span>
        <span class="ce-metric" id="ce-occupancy" title="Occupancy">🅿️ --</span>
        <span class="ce-metric" id="ce-cameras" title="Active cameras">📹 --</span>
        <span class="ce-metric" id="ce-weather" title="Weather">🌡️ --</span>
      </div>
      <div class="visor-status">
        <span id="visor-status-dot" class="status-dot"></span>
      </div>
    </div>
    <div class="visor-right-cap"></div>
    <div id="visor-notification" class="visor-notification"></div>
    <div id="visor-screenshot-flash" class="screenshot-flash"></div>
  `;
  
  // ==================== Inject Visor ====================
  
  document.body.appendChild(visor);
  
  // ==================== State Management ====================
  
  function isVisorVisible() {
    return localStorage.getItem(VISOR_STORAGE_KEY) !== 'false';
  }
  
  function setVisorVisible(visible) {
    localStorage.setItem(VISOR_STORAGE_KEY, visible);
    visor.style.display = visible ? 'flex' : 'none';
  }
  
  // Initialize visibility - check settings for visorAutoShow
  async function initializeVisor() {
    // Get settings from background
    chrome.runtime.sendMessage({ type: 'getSettings' }, (settings) => {
      if (chrome.runtime.lastError) {
        // Fallback to localStorage
        setVisorVisible(isVisorVisible());
        return;
      }
      
      cachedSettings = settings;
      
      if (settings.visorAutoShow) {
        // Always show on load if visorAutoShow is enabled
        setVisorVisible(true);
      } else {
        // Use localStorage preference
        setVisorVisible(isVisorVisible());
      }
    });
  }
  
  initializeVisor();
  
  // ==================== Notifications ====================
  
  function showNotification(message, duration = 3000) {
    const notification = document.getElementById('visor-notification');
    notification.textContent = message;
    notification.classList.add('show');
    
    setTimeout(() => {
      notification.classList.remove('show');
    }, duration);
  }
  
  // ==================== Screenshot Flash Effect ====================
  
  function showScreenshotFlash() {
    const flash = document.getElementById('visor-screenshot-flash');
    flash.classList.add('active');
    setTimeout(() => flash.classList.remove('active'), 200);
  }
  
  // ==================== Button Handlers ====================
  
  document.getElementById('visor-investigate').addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'investigate' });
    showNotification('🔍 Investigating page...');
  });
  
  document.getElementById('visor-screenshot').addEventListener('click', () => {
    showScreenshotFlash();
    chrome.runtime.sendMessage({ type: 'captureScreenshot' }, (response) => {
      if (response?.success) {
        showNotification('📸 Screenshot captured & sent!');
      } else if (response?.error) {
        showNotification('❌ Screenshot failed: ' + response.error);
      }
    });
  });
  
  document.getElementById('visor-archive').addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'archiveBookmarks' });
    showNotification('📦 Archiving bookmarks...');
  });
  
  // ==================== Status Updates ====================
  
  function updateStatus() {
    chrome.runtime.sendMessage({ type: 'getConnectionState' }, (response) => {
      if (chrome.runtime.lastError) return;
      
      const dot = document.getElementById('visor-status-dot');
      if (dot) {
        const colors = {
          connected: '#00ff88',
          connecting: '#ffaa00',
          disconnected: '#888888',
          error: '#ff4444'
        };
        dot.style.backgroundColor = colors[response?.state] || '#888888';
        dot.title = `Status: ${response?.state || 'unknown'}`;
      }
    });
  }
  
  // Update status periodically
  updateStatus();
  setInterval(updateStatus, 5000);
  
  // ==================== Confirmation Dialog ====================
  
  function showConfirmDialog(action, data) {
    return new Promise((resolve) => {
      // Create dialog
      const overlay = document.createElement('div');
      overlay.id = 'skynet-confirm-overlay';
      overlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.85);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 2147483647;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      `;
      
      const dialog = document.createElement('div');
      dialog.style.cssText = `
        background: #1a1a24;
        border: 2px solid #ff9500;
        border-radius: 12px;
        padding: 24px;
        max-width: 400px;
        text-align: center;
        color: #e0e0e0;
        box-shadow: 0 0 30px rgba(255, 149, 0, 0.3);
      `;
      
      const dataStr = data ? JSON.stringify(data, null, 2).substring(0, 200) : '';
      
      dialog.innerHTML = `
        <div style="font-size: 32px; margin-bottom: 12px;">⚠️</div>
        <h2 style="color: #ff9500; margin-bottom: 12px; font-size: 18px;">Remote Command Request</h2>
        <p style="color: #888; margin-bottom: 16px; font-size: 14px;">
          Skynet wants to execute: <strong style="color: #00d4ff;">${action}</strong>
        </p>
        ${dataStr ? `<pre style="background: #0a0a0f; padding: 10px; border-radius: 6px; font-size: 11px; text-align: left; overflow: auto; max-height: 100px; color: #888;">${dataStr}</pre>` : ''}
        <div style="display: flex; gap: 12px; margin-top: 20px; justify-content: center;">
          <button id="skynet-confirm-deny" style="
            padding: 10px 24px;
            background: #ff4466;
            border: none;
            border-radius: 6px;
            color: white;
            font-weight: 600;
            cursor: pointer;
            font-size: 14px;
          ">DENY</button>
          <button id="skynet-confirm-allow" style="
            padding: 10px 24px;
            background: #00ff88;
            border: none;
            border-radius: 6px;
            color: #000;
            font-weight: 600;
            cursor: pointer;
            font-size: 14px;
          ">ALLOW</button>
        </div>
        <p style="color: #555; font-size: 10px; margin-top: 16px;">
          This dialog appears because "Require Confirmation" is enabled in settings.
        </p>
      `;
      
      overlay.appendChild(dialog);
      document.body.appendChild(overlay);
      
      document.getElementById('skynet-confirm-allow').addEventListener('click', () => {
        overlay.remove();
        resolve(true);
      });
      
      document.getElementById('skynet-confirm-deny').addEventListener('click', () => {
        overlay.remove();
        resolve(false);
      });
      
      // Auto-deny after 30 seconds
      setTimeout(() => {
        if (document.getElementById('skynet-confirm-overlay')) {
          overlay.remove();
          resolve(false);
        }
      }, 30000);
    });
  }
  
  // ==================== Listen for Messages ====================
  
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    switch (msg.type) {
      case 'toggleVisor':
        setVisorVisible(!isVisorVisible());
        break;
        
      case 'investigate.ack':
        showNotification('✅ Investigation sent to agents');
        break;
        
      case 'screenshot.feedback':
        showScreenshotFlash();
        showNotification('📸 Screenshot captured via Alt+P!');
        break;
        
      case 'screenshot.captured':
        showNotification('📸 Screenshot sent!');
        break;
        
      case 'confirmCommand':
        // Show confirmation dialog for remote commands
        showConfirmDialog(msg.action, msg.data).then(confirmed => {
          sendResponse({ confirmed });
        });
        return true; // Keep channel open for async response
        
      case 'ce.state':
        updateCEMetrics(msg.metrics);
        break;
        
      case 'ce.status':
        updateCEStatus(msg.online);
        break;
    }
  });
  
  // ==================== CyberEther Metrics ====================
  
  function updateCEMetrics(metrics) {
    if (!metrics) return;
    
    const status = document.getElementById('ce-status');
    const anpr = document.getElementById('ce-anpr');
    const occupancy = document.getElementById('ce-occupancy');
    const cameras = document.getElementById('ce-cameras');
    const weather = document.getElementById('ce-weather');
    
    if (status) {
      status.textContent = metrics.online ? '⚡ ON' : '⚡ OFF';
      status.style.color = metrics.online ? '#00ff88' : '#ff4444';
      status.title = metrics.flowgraphName || 'CyberEther Status';
    }
    
    if (anpr) {
      anpr.textContent = `📸 ${metrics.anprRate}/m`;
      anpr.title = `ANPR: ${metrics.anprRate} events/min`;
    }
    
    if (occupancy && metrics.occupancy) {
      const pct = metrics.occupancy.percent;
      occupancy.textContent = `🅿️ ${metrics.occupancy.current}/${metrics.occupancy.capacity}`;
      occupancy.title = `Occupancy: ${pct}%`;
      occupancy.style.color = pct > 90 ? '#ff4444' : pct > 70 ? '#ffaa00' : '#00ff88';
    }
    
    if (cameras && metrics.cameras) {
      cameras.textContent = `📹 ${metrics.cameras.active}/${metrics.cameras.total}`;
      cameras.title = `Cameras: ${metrics.cameras.active} active of ${metrics.cameras.total}`;
    }
    
    if (weather && metrics.weather) {
      weather.textContent = `🌡️ ${metrics.weather.temp}°C`;
      weather.title = metrics.weather.condition || 'Weather';
    }
  }
  
  function updateCEStatus(online) {
    const status = document.getElementById('ce-status');
    if (status) {
      status.textContent = online ? '⚡ ON' : '⚡ OFF';
      status.style.color = online ? '#00ff88' : '#888888';
    }
  }
  
  console.log('[Skynet] Visor injected v2.2.1 with CyberEther');
})();
