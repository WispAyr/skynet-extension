/**
 * Skynet Command — Service Worker
 * Handles side panel registration and background tasks
 */

// Open side panel on action click (if user prefers side panel)
chrome.sidePanel?.setOptions?.({
  enabled: true
});

// Allow opening side panel from context menu or action
chrome.action.onClicked.addListener((tab) => {
  // Default: popup opens. Side panel can be opened via right-click or programmatically.
});

// Listen for messages from popup/sidepanel
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'openSidePanel') {
    chrome.sidePanel?.open?.({ windowId: sender.tab?.windowId });
    sendResponse({ ok: true });
  }
  if (msg.type === 'getSettings') {
    chrome.storage.local.get(['registryUrl', 'refreshInterval'], (data) => {
      sendResponse({
        registryUrl: data.registryUrl || 'http://localhost:3210',
        refreshInterval: data.refreshInterval || 15000
      });
    });
    return true; // async response
  }
  if (msg.type === 'saveSettings') {
    chrome.storage.local.set(msg.settings, () => {
      sendResponse({ ok: true });
    });
    return true;
  }
});

// ============================================
// SentryFlow Alert System
// ============================================
let alertWs = null;
let alertReconnectTimer = null;
const SENTRYFLOW_WS_URLS = [
  'ws://localhost:3890/ws',
  'ws://10.10.10.123:3890/ws',
  'ws://192.168.195.33:3890/ws'
];
let currentWsIndex = 0;
let alertCount = 0;
let recentAlerts = [];

function connectSentryFlow() {
  if (alertWs && alertWs.readyState === WebSocket.OPEN) return;
  
  const url = SENTRYFLOW_WS_URLS[currentWsIndex];
  console.log(`🔌 Connecting to SentryFlow: ${url}`);
  
  try {
    alertWs = new WebSocket(url);
    
    alertWs.onopen = () => {
      console.log('✅ SentryFlow WebSocket connected');
      alertCount = 0;
      updateBadge();
      // Reset to first URL on success
      currentWsIndex = 0;
    };
    
    alertWs.onmessage = (evt) => {
      try {
        const msg = JSON.parse(evt.data);
        
        // Handle different message types
        if (msg.type === 'event' || msg.type === 'rule_triggered') {
          handleAlert(msg);
        } else if (msg.type === 'escalation') {
          handleEscalation(msg);
        }
        
        // Forward to popup/sidepanel
        chrome.runtime.sendMessage({ type: 'sentryflow_event', data: msg }).catch(() => {});
      } catch (e) {
        // Not JSON or parse error - ignore
      }
    };
    
    alertWs.onclose = () => {
      console.log('🔌 SentryFlow WebSocket closed, reconnecting...');
      scheduleReconnect();
    };
    
    alertWs.onerror = (err) => {
      console.warn('SentryFlow WS error, trying next URL');
      alertWs?.close();
    };
  } catch (e) {
    console.warn('Failed to create WebSocket:', e);
    scheduleReconnect();
  }
}

function scheduleReconnect() {
  if (alertReconnectTimer) return;
  // Try next URL
  currentWsIndex = (currentWsIndex + 1) % SENTRYFLOW_WS_URLS.length;
  alertReconnectTimer = setTimeout(() => {
    alertReconnectTimer = null;
    connectSentryFlow();
  }, 5000);
}

function handleAlert(msg) {
  const event = msg.event || msg.data || msg;
  const ruleName = msg.ruleName || msg.rule || '';
  const cameraName = event.cameraName || event.camera || 'Unknown';
  const eventType = event.type || 'alert';
  const level = msg.escalationLevel || 0;
  
  // Store recent alert
  recentAlerts.unshift({
    id: event.id || Date.now().toString(),
    timestamp: new Date().toISOString(),
    camera: cameraName,
    type: eventType,
    rule: ruleName,
    level: level,
    message: msg.message || `${eventType} at ${cameraName}`
  });
  
  // Keep last 50
  if (recentAlerts.length > 50) recentAlerts = recentAlerts.slice(0, 50);
  
  // Update badge
  alertCount++;
  updateBadge();
  
  // Chrome notification for important alerts (level >= 1 or specific types)
  const importantTypes = ['person', 'audio_loud', 'audio_spike', 'loiter'];
  if (level >= 1 || importantTypes.includes(eventType)) {
    chrome.notifications.create(`sentryflow-${Date.now()}`, {
      type: 'basic',
      iconUrl: 'icons/icon128.png',
      title: `🛡️ ${ruleName || 'SentryFlow Alert'}`,
      message: `${eventType.toUpperCase()} detected at ${cameraName}`,
      priority: level >= 2 ? 2 : 1,
      requireInteraction: level >= 2
    });
  }
  
  // Save to storage for sidepanel/popup
  chrome.storage.local.set({ recentAlerts, alertCount });
}

function handleEscalation(msg) {
  const level = msg.level || msg.escalationLevel || 0;
  const ruleName = msg.ruleName || msg.rule || 'Unknown Rule';
  
  if (level >= 2) {
    chrome.notifications.create(`escalation-${Date.now()}`, {
      type: 'basic',
      iconUrl: 'icons/icon128.png',
      title: `🚨 ESCALATION Level ${level}`,
      message: `${ruleName} — activity is escalating!`,
      priority: 2,
      requireInteraction: true
    });
  }
  
  handleAlert(msg);
}

function updateBadge() {
  if (alertCount > 0) {
    chrome.action.setBadgeText({ text: alertCount > 99 ? '99+' : String(alertCount) });
    chrome.action.setBadgeBackgroundColor({ color: alertCount > 5 ? '#CC4444' : '#FF9900' });
  } else {
    chrome.action.setBadgeText({ text: '' });
  }
}

// Handle messages from popup/sidepanel
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'getAlerts') {
    sendResponse({ alerts: recentAlerts, count: alertCount });
    return;
  }
  if (msg.type === 'clearAlerts') {
    alertCount = 0;
    updateBadge();
    chrome.storage.local.set({ alertCount: 0 });
    sendResponse({ ok: true });
    return;
  }
  // ... existing handlers below
});

// Connect on startup
connectSentryFlow();

// Reconnect periodically via alarm
chrome.alarms.create('sentryflow-keepalive', { periodInMinutes: 1 });
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'sentryflow-keepalive') {
    if (!alertWs || alertWs.readyState !== WebSocket.OPEN) {
      connectSentryFlow();
    }
  }
});

console.log('⚡ Skynet Command service worker loaded');
