/**
 * background.js — Service worker for Shadow Talk extension.
 * Handles extension icon click as a shortcut to toggle the panel.
 */

// When the extension icon is clicked and there's no popup (fallback)
chrome.action.onClicked.addListener((tab) => {
  if (tab.url && tab.url.includes('youtube.com/watch')) {
    chrome.tabs.sendMessage(tab.id, { action: 'toggle' });
  }
});
