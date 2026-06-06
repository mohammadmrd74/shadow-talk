/**
 * popup.js — Extension popup logic.
 */

const content = document.getElementById('content');

// Check if we're on a YouTube video page
chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
  const tab = tabs[0];

  if (!tab || !tab.url || !tab.url.includes('youtube.com/watch')) {
    content.innerHTML = `
      <div class="not-youtube">
        Open a YouTube video to start shadowing.
      </div>
    `;
    return;
  }

  content.innerHTML = `
    <button class="btn btn-primary" id="toggle-btn">Start Shadow Talk</button>
    <div class="message">
      Click to toggle the Shadow Talk panel on the video page.
    </div>
  `;

  document.getElementById('toggle-btn').addEventListener('click', () => {
    toggleWithInjection(tab.id);
  });
});

/**
 * Content script files in the order they must be injected.
 * The page-bridge runs in the MAIN world; the rest run in the default
 * (ISOLATED) world. `content.js` must come last — it depends on the others.
 */
const ISOLATED_SCRIPTS = [
  'content/transcript.js',
  'content/player.js',
  'content/speech.js',
  'content/scoring.js',
  'content/ui.js',
  'content/content.js',
];
const MAIN_SCRIPTS = ['content/page-bridge.js'];
const STYLES = ['styles/overlay.css'];

/**
 * Send the toggle message. If the content script isn't present (e.g. the
 * page reached /watch via YouTube's SPA router with no document load, or
 * scripts haven't finished loading), inject it on demand and retry once.
 */
function toggleWithInjection(tabId) {
  chrome.tabs.sendMessage(tabId, { action: 'toggle' }, () => {
    if (!chrome.runtime.lastError) {
      window.close();
      return;
    }

    // No listener in the tab — inject the content scripts, then retry.
    injectContentScripts(tabId)
      .then(() => {
        chrome.tabs.sendMessage(tabId, { action: 'toggle' }, () => {
          if (chrome.runtime.lastError) {
            showConnectError();
          } else {
            window.close();
          }
        });
      })
      .catch(() => showConnectError());
  });
}

function injectContentScripts(tabId) {
  return Promise.all([
    chrome.scripting.executeScript({
      target: { tabId },
      world: 'MAIN',
      files: MAIN_SCRIPTS,
    }),
    chrome.scripting.executeScript({
      target: { tabId },
      files: ISOLATED_SCRIPTS,
    }),
    chrome.scripting.insertCSS({
      target: { tabId },
      files: STYLES,
    }),
  ]);
}

function showConnectError() {
  content.innerHTML = `
    <div class="not-youtube">
      Could not connect. Try refreshing the YouTube page.
    </div>
  `;
}
