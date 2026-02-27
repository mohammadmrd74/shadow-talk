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
    chrome.tabs.sendMessage(tab.id, { action: 'toggle' }, (response) => {
      if (chrome.runtime.lastError) {
        content.innerHTML = `
          <div class="not-youtube">
            Could not connect. Try refreshing the YouTube page.
          </div>
        `;
        return;
      }
      // Close popup after toggling
      window.close();
    });
  });
});
