// Skynet Browser Extension - Popup Script
// Version 2.2.1

document.addEventListener('DOMContentLoaded', () => {
  // ==================== Status Update ====================
  
  function updateStatus() {
    chrome.runtime.sendMessage({ type: 'getState' }, (response) => {
      if (chrome.runtime.lastError) {
        setStatus('error', 'Error');
        return;
      }
      
      const states = {
        connected: { color: '#00ff88', text: 'Connected' },
        connecting: { color: '#ffaa00', text: 'Connecting...' },
        disconnected: { color: '#888888', text: 'Disconnected' },
        error: { color: '#ff4444', text: 'Error' }
      };
      
      const state = states[response?.state] || states.disconnected;
      setStatus(response?.state, state.text);
      
      // Update settings from response
      if (response?.settings) {
        updateSettingsDisplay(response.settings);
      }
    });
  }
  
  function setStatus(state, text) {
    const dot = document.getElementById('status-dot');
    const textEl = document.getElementById('status-text');
    
    const colors = {
      connected: '#00ff88',
      connecting: '#ffaa00',
      disconnected: '#888888',
      error: '#ff4444'
    };
    
    dot.style.backgroundColor = colors[state] || '#888888';
    textEl.textContent = text;
  }
  
  // ==================== Update Check ====================
  
  function checkForUpdates() {
    chrome.runtime.sendMessage({ type: 'checkUpdate' }, (response) => {
      if (chrome.runtime.lastError) return;
      
      if (response?.updateAvailable) {
        const banner = document.getElementById('update-banner');
        const versionEl = document.getElementById('update-version');
        const linkEl = document.getElementById('update-link');
        
        if (banner && versionEl && linkEl) {
          versionEl.textContent = 'v' + response.updateAvailable.version;
          linkEl.href = response.updateAvailable.downloadUrl;
          banner.style.display = 'flex';
        }
      }
    });
  }
  
  // ==================== Button Handlers ====================
  
  // Investigate
  document.getElementById('btn-investigate').addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'investigate' });
    showFeedback('btn-investigate', '✓ Sent!');
  });
  
  // Toggle Visor
  document.getElementById('btn-visor').addEventListener('click', () => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, { type: 'toggleVisor' }).catch(() => {
          // Inject content script if not present
          chrome.scripting.executeScript({
            target: { tabId: tabs[0].id },
            files: ['content.js']
          }).then(() => {
            chrome.tabs.sendMessage(tabs[0].id, { type: 'toggleVisor' });
          }).catch(err => console.log('Cannot inject into this page'));
        });
      }
    });
    showFeedback('btn-visor', '✓ Toggled');
  });
  
  // Archive Bookmarks
  document.getElementById('btn-archive').addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'archiveBookmarks' });
    showFeedback('btn-archive', '✓ Archived!');
  });
  
  // Reconnect
  document.getElementById('btn-reconnect').addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'reconnect' });
    showFeedback('btn-reconnect', '✓ Reconnecting');
    setTimeout(updateStatus, 1000);
  });
  
  // Disconnect
  document.getElementById('btn-disconnect').addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'disconnect' });
    showFeedback('btn-disconnect', '✓ Disconnected');
    setTimeout(updateStatus, 500);
  });
  
  // ==================== Feedback ====================
  
  function showFeedback(buttonId, text, isError = false) {
    const btn = document.getElementById(buttonId);
    const label = btn.querySelector('.btn-label');
    const originalText = label.textContent;
    
    label.textContent = text;
    btn.classList.add(isError ? 'error' : 'success');
    
    setTimeout(() => {
      label.textContent = originalText;
      btn.classList.remove('success', 'error');
    }, 1500);
  }
  
  // ==================== Settings Summary ====================
  
  function loadSettingsSummary() {
    chrome.runtime.sendMessage({ type: 'getSettings' }, (response) => {
      if (chrome.runtime.lastError || !response?.settings) return;
      updateSettingsDisplay(response.settings);
    });
  }
  
  function updateSettingsDisplay(settings) {
    updateSettingBadge('setting-remote', settings.enableRemoteCommands);
    updateSettingBadge('setting-extract', settings.enableContentExtraction);
    updateSettingBadge('setting-confirm', settings.requireConfirmation);
    updateSettingBadge('setting-audit', settings.enableAuditLog);
  }
  
  function updateSettingBadge(id, enabled) {
    const badge = document.getElementById(id);
    if (badge) {
      badge.classList.remove('on', 'off');
      badge.classList.add(enabled ? 'on' : 'off');
    }
  }
  
  // Open settings page
  document.getElementById('open-settings').addEventListener('click', (e) => {
    e.preventDefault();
    chrome.runtime.openOptionsPage();
  });
  
  // ==================== Initialize ====================
  
  updateStatus();
  loadSettingsSummary();
  checkForUpdates();
  
  // Refresh status periodically while popup is open
  setInterval(updateStatus, 3000);
});
