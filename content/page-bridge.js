/**
 * page-bridge.js — Runs in the MAIN world (page context).
 * Gets transcript by opening YouTube's transcript panel and reading the DOM.
 * No API calls needed — YouTube handles auth internally.
 */

(() => {
  window.addEventListener('shadowtalk-request', async (e) => {
    const { requestId, action, args } = e.detail;

    try {
      let result;
      if (action === 'getTranscript') {
        result = await _getTranscript();
      } else {
        throw new Error('Unknown action: ' + action);
      }

      window.dispatchEvent(new CustomEvent('shadowtalk-response', {
        detail: { requestId, result },
      }));
    } catch (err) {
      window.dispatchEvent(new CustomEvent('shadowtalk-response', {
        detail: { requestId, error: err.message },
      }));
    }
  });

  /**
   * Main: open transcript panel, scrape segments, close panel.
   */
  async function _getTranscript() {
    console.log('[ShadowTalk Bridge] Getting transcript via DOM scraping...');

    // Step 1: Check if transcript panel is already open
    let segments = _scrapeTranscriptPanel();
    if (segments.length > 0) {
      console.log('[ShadowTalk Bridge] Transcript panel already open, got', segments.length, 'segments');
      return { segments, language: 'en', trackName: 'Transcript', allTracks: [] };
    }

    // Step 2: Open the transcript panel
    const opened = await _openTranscriptPanel();
    if (!opened) {
      throw new Error('Could not open transcript panel. This video may not have captions.');
    }

    // Step 3: Wait for segments to load
    segments = await _waitForSegments(8000);
    if (segments.length === 0) {
      throw new Error('Transcript panel opened but no segments found.');
    }

    console.log('[ShadowTalk Bridge] Scraped', segments.length, 'segments from DOM');

    // Step 4: Close the transcript panel (optional — keep it clean)
    _closeTranscriptPanel();

    return { segments, language: 'en', trackName: 'Transcript', allTracks: [] };
  }

  /**
   * Try multiple ways to open the transcript panel.
   */
  async function _openTranscriptPanel() {
    // Method 1: Click "Show transcript" button in description area
    const descButton = document.querySelector(
      'ytd-video-description-transcript-section-renderer button'
    );
    if (descButton) {
      console.log('[ShadowTalk Bridge] Found transcript button in description');
      descButton.click();
      return true;
    }

    // Method 2: Click "Show transcript" in the "..." menu below the video
    const moreButton = document.querySelector(
      'ytd-menu-renderer.ytd-watch-metadata yt-button-shape button,' +
      '#top-level-buttons-computed + ytd-menu-renderer button,' +
      'ytd-watch-metadata ytd-menu-renderer yt-button-shape button'
    );

    if (moreButton) {
      console.log('[ShadowTalk Bridge] Clicking "..." menu');
      moreButton.click();
      await _sleep(500);

      // Look for "Show transcript" menu item
      const menuItems = document.querySelectorAll(
        'ytd-menu-service-item-renderer, tp-yt-paper-item'
      );
      for (const item of menuItems) {
        const text = item.textContent?.trim().toLowerCase();
        if (text && (text.includes('transcript') || text.includes('show transcript'))) {
          console.log('[ShadowTalk Bridge] Found "Show transcript" menu item');
          item.click();
          return true;
        }
      }

      // Close the menu if transcript not found
      document.body.click();
    }

    // Method 3: Try the engagement panel toggle directly
    const panels = document.querySelectorAll('ytd-engagement-panel-section-list-renderer');
    for (const panel of panels) {
      const title = panel.querySelector('#title')?.textContent?.trim().toLowerCase();
      if (title && title.includes('transcript')) {
        console.log('[ShadowTalk Bridge] Found transcript engagement panel, making it visible');
        panel.setAttribute('visibility', 'ENGAGEMENT_PANEL_VISIBILITY_EXPANDED');
        panel.style.display = '';
        return true;
      }
    }

    // Method 4: Click the "Transcript" button directly if it exists
    const allButtons = document.querySelectorAll('button, yt-button-shape button');
    for (const btn of allButtons) {
      const label = btn.textContent?.trim().toLowerCase() ||
                    btn.getAttribute('aria-label')?.toLowerCase() || '';
      if (label.includes('show transcript')) {
        console.log('[ShadowTalk Bridge] Found direct transcript button');
        btn.click();
        return true;
      }
    }

    console.warn('[ShadowTalk Bridge] Could not find any way to open transcript panel');
    return false;
  }

  /**
   * Scrape transcript segments from the DOM.
   */
  function _scrapeTranscriptPanel() {
    const segments = [];

    // Try selector 1: ytd-transcript-segment-renderer (modern)
    const segmentElements = document.querySelectorAll(
      'ytd-transcript-segment-renderer'
    );

    if (segmentElements.length > 0) {
      for (const el of segmentElements) {
        const timestampEl = el.querySelector('.segment-timestamp, .segment-start-offset');
        const textEl = el.querySelector('.segment-text, yt-formatted-string.segment-text');

        if (!textEl) continue;

        const text = textEl.textContent?.trim();
        if (!text) continue;

        const timestamp = timestampEl?.textContent?.trim() || '0:00';
        const startSec = _parseTimestamp(timestamp);

        segments.push({ text, start: startSec, duration: 0 });
      }

      // Compute durations from gaps between segments
      for (let i = 0; i < segments.length; i++) {
        if (i < segments.length - 1) {
          segments[i].duration = segments[i + 1].start - segments[i].start;
        } else {
          segments[i].duration = 5; // default 5s for last segment
        }
      }
    }

    // Try selector 2: ytd-transcript-segment-list-renderer items
    if (segments.length === 0) {
      const items = document.querySelectorAll(
        'ytd-transcript-segment-list-renderer ytd-transcript-segment-renderer,' +
        '[target-id="engagement-panel-searchable-transcript"] ytd-transcript-segment-renderer'
      );

      for (const el of items) {
        const text = el.querySelector('yt-formatted-string')?.textContent?.trim();
        const timestamp = el.querySelector('[class*="timestamp"]')?.textContent?.trim() || '0:00';

        if (!text) continue;
        segments.push({ text, start: _parseTimestamp(timestamp), duration: 0 });
      }

      for (let i = 0; i < segments.length; i++) {
        segments[i].duration = i < segments.length - 1
          ? segments[i + 1].start - segments[i].start
          : 5;
      }
    }

    return segments;
  }

  /**
   * Wait for transcript segments to appear in the DOM.
   */
  function _waitForSegments(timeout) {
    return new Promise((resolve) => {
      const startTime = Date.now();

      const check = () => {
        const segments = _scrapeTranscriptPanel();
        if (segments.length > 0) {
          resolve(segments);
          return;
        }

        if (Date.now() - startTime > timeout) {
          resolve([]);
          return;
        }

        setTimeout(check, 300);
      };

      check();
    });
  }

  /**
   * Close the transcript panel.
   */
  function _closeTranscriptPanel() {
    // Find and click the close button on the transcript panel
    const panels = document.querySelectorAll('ytd-engagement-panel-section-list-renderer');
    for (const panel of panels) {
      const title = panel.querySelector('#title')?.textContent?.trim().toLowerCase();
      if (title && title.includes('transcript')) {
        const closeBtn = panel.querySelector('#close-button button, button[aria-label="Close"]');
        if (closeBtn) {
          closeBtn.click();
          console.log('[ShadowTalk Bridge] Closed transcript panel');
        }
        break;
      }
    }
  }

  /**
   * Parse "0:00" or "1:23:45" timestamp to seconds.
   */
  function _parseTimestamp(timestamp) {
    const parts = timestamp.replace(/\s/g, '').split(':').map(Number);
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    if (parts.length === 2) return parts[0] * 60 + parts[1];
    return parts[0] || 0;
  }

  function _sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  window.dispatchEvent(new CustomEvent('shadowtalk-bridge-ready'));
})();
