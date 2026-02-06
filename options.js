// Skynet Extension Options - Settings Management

const DEFAULT_SETTINGS = {
  enableRemoteCommands: true,
  enableContentExtraction: true,
  contentExtractionLimit: 5000,
  allowedDomains: '*',
  enableAuditLog: true,
  autoConnect: true,
  requireConfirmation: false
};

const SETTING_IDS = [
  'enableRemoteCommands',
  'enableContentExtraction',
  'contentExtractionLimit',
  'allowedDomains',
  'enableAuditLog',
  'autoConnect',
  'requireConfirmation'
];

let currentSettings = { ...DEFAULT_SETTINGS };
let showingFullToken = false;

// ============================================
// Settings Load/Save
// ============================================

async function loadSettings() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(DEFAULT_SETTINGS, (settings) => {
      currentSettings = settings;
      resolve(settings);
    });
  });
}

async function saveSetting(key, value) {
  currentSettings[key] = value;
  
  showSaveStatus('saving');
  
  return new Promise((resolve) => {
    chrome.storage.sync.set({ [key]: value }, () => {
      showSaveStatus('saved');
      
      // Notify background script of settings change
      chrome.runtime.sendMessage({ 
        type: 'settingsChanged', 
        key, 
        value,
        allSettings: currentSettings 
      }).catch(() => {});
      
      resolve();
    });
  });
}

async function resetToDefaults() {
  if (!confirm('Reset all settings to defaults? This cannot be undone.')) {
    return;
  }
  
  return new Promise((resolve) => {
    chrome.storage.sync.set(DEFAULT_SETTINGS, () => {
      currentSettings = { ...DEFAULT_SETTINGS };
      populateForm();
      showSaveStatus('saved');
      
      chrome.runtime.sendMessage({ 
        type: 'settingsChanged', 
        allSettings: currentSettings 
      }).catch(() => {});
      
      resolve();
    });
  });
}

// ============================================
// UI Population
// ============================================

function populateForm() {
  for (const id of SETTING_IDS) {
    const element = document.getElementById(id);
    if (!element) continue;
    
    const value = currentSettings[id];
    
    if (element.type === 'checkbox') {
      element.checked = value;
    } else {
      element.value = value;
    }
  }
}

function showSaveStatus(status) {
  const statusEl = document.getElementById('saveStatus');
  if (status === 'saving') {
    statusEl.textContent = 'Saving...';
    statusEl.className = 'save-status saving';
  } else {
    statusEl.textContent = 'Settings auto-saved';
    statusEl.className = 'save-status';
  }
}

// ============================================
// Token Management
// ============================================

async function loadToken() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(['skynetAuthToken'], (result) => {
      resolve(result.skynetAuthToken || null);
    });
  });
}

async function displayToken() {
  const token = await loadToken();
  const previewEl = document.getElementById('tokenPreview');
  const showBtn = document.getElementById('showFullToken');
  
  if (!token) {
    previewEl.textContent = 'No token generated yet';
    return;
  }
  
  if (showingFullToken) {
    previewEl.textContent = token;
    showBtn.textContent = 'Hide';
  } else {
    previewEl.textContent = token.substring(0, 8) + '...' + token.substring(token.length - 8);
    showBtn.textContent = 'Show';
  }
}

async function regenerateToken() {
  if (!confirm('Regenerate authentication token?\n\nThis will disconnect the extension and require the server to re-authenticate.')) {
    return;
  }
  
  chrome.runtime.sendMessage({ type: 'regenerateToken' }, (response) => {
    if (response?.ok) {
      displayToken();
      alert('Token regenerated. Extension will reconnect with new token.');
    }
  });
}

// ============================================
// Audit Log
// ============================================

async function loadAuditLog() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['auditLog'], (result) => {
      resolve(result.auditLog || []);
    });
  });
}

async function displayAuditLog() {
  const logs = await loadAuditLog();
  const container = document.getElementById('auditLog');
  const countEl = document.getElementById('logCount');
  
  countEl.textContent = `${logs.length} entries`;
  
  if (logs.length === 0) {
    container.innerHTML = '<div class="log-entry placeholder">No log entries yet</div>';
    return;
  }
  
  // Show most recent first, limit to 100
  const recentLogs = logs.slice(-100).reverse();
  
  container.innerHTML = recentLogs.map(entry => {
    const ts = new Date(entry.ts).toLocaleString();
    const resultClass = entry.result === 'ok' ? 'result-ok' : 
                        entry.result === 'error' ? 'result-error' : '';
    
    return `<div class="log-entry">
      <span class="timestamp">${ts}</span> 
      <span class="event">${entry.event}</span>
      ${entry.action ? `<span class="action">${entry.action}</span>` : ''}
      ${entry.result ? `<span class="${resultClass}">[${entry.result}]</span>` : ''}
      ${entry.url ? `<span class="url">${entry.url}</span>` : ''}
    </div>`;
  }).join('');
}

async function clearAuditLog() {
  if (!confirm('Clear all audit log entries? This cannot be undone.')) {
    return;
  }
  
  return new Promise((resolve) => {
    chrome.storage.local.set({ auditLog: [] }, () => {
      displayAuditLog();
      resolve();
    });
  });
}

// ============================================
// Event Listeners
// ============================================

function setupEventListeners() {
  // Setting changes - auto-save
  for (const id of SETTING_IDS) {
    const element = document.getElementById(id);
    if (!element) continue;
    
    const eventType = element.type === 'checkbox' ? 'change' : 'input';
    
    element.addEventListener(eventType, async (e) => {
      const value = element.type === 'checkbox' ? element.checked : 
                    element.type === 'number' ? parseInt(element.value, 10) :
                    element.value;
      await saveSetting(id, value);
    });
  }
  
  // Token controls
  document.getElementById('showFullToken').addEventListener('click', () => {
    showingFullToken = !showingFullToken;
    displayToken();
  });
  
  document.getElementById('regenerateToken').addEventListener('click', regenerateToken);
  
  // Audit log controls
  document.getElementById('refreshLog').addEventListener('click', displayAuditLog);
  document.getElementById('clearLog').addEventListener('click', clearAuditLog);
  
  // Reset defaults
  document.getElementById('resetDefaults').addEventListener('click', resetToDefaults);
}

// ============================================
// Initialization
// ============================================

async function init() {
  await loadSettings();
  populateForm();
  displayToken();
  displayAuditLog();
  setupEventListeners();
}

document.addEventListener('DOMContentLoaded', init);
