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

console.log('⚡ Skynet Command service worker loaded');
