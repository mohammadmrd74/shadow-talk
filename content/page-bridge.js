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

  // Matches a transcript timestamp like "0:12", "1:23", or "1:02:03".
  const TIMESTAMP_RE = /^\d{1,2}:\d{2}(?::\d{2})?$/;

  // Matches a leading screen-reader duration label, e.g. "2 seconds",
  // "11 seconds", or "1 minute, 5 seconds" — even when glued to the next word
  // ("2 secondsThis…"). English only (the label follows the YouTube UI locale).
  const DURATION_LABEL_RE = /^\s*(\d+\s*(hours?|minutes?|seconds?)[\s,]*)+/i;

  /**
   * Scrape transcript segments from the DOM.
   *
   * Resilient to YouTube renaming classes: we find the segment rows, read the
   * timestamp by its "m:ss" text pattern (not a fixed class), and take the
   * line text as the row's text minus that timestamp.
   */
  function _scrapeTranscriptPanel() {
    // Find the rows. Try the known renderer first, then looser fallbacks.
    let rows = document.querySelectorAll('ytd-transcript-segment-renderer');

    if (rows.length === 0) {
      rows = document.querySelectorAll(
        'ytd-transcript-segment-list-renderer [role="button"],' +
        '[target-id*="transcript"] [role="button"]'
      );
    }

    let segments = [];
    for (const row of rows) {
      const seg = _extractSegment(row);
      if (seg) segments.push(seg);
    }

    // Fallback for panel layouts we don't recognize by element name (e.g. the
    // newer "In this video" combined panel): anchor on the visible timestamps.
    if (segments.length === 0) {
      segments = _scrapeByTimestamp();
    }

    // Compute durations from the gap to the next segment.
    for (let i = 0; i < segments.length; i++) {
      segments[i].duration = i < segments.length - 1
        ? Math.max(0, segments[i + 1].start - segments[i].start)
        : 5; // default 5s for the last segment
    }

    return segments;
  }

  /**
   * Name-independent scrape: find transcript rows by anchoring on the visible
   * timestamp leaves (e.g. "0:11") inside the open engagement panel, then read
   * each row's text. Works regardless of YouTube's element/class names.
   */
  function _scrapeByTimestamp() {
    // Scope to engagement panels so we don't pick up timestamps from elsewhere
    // (related-video durations, the scrubber, chapter markers, etc.).
    const containers = document.querySelectorAll(
      'ytd-engagement-panel-section-list-renderer,' +
      '[target-id*="transcript"], ytd-transcript-renderer'
    );

    for (const container of containers) {
      const segs = _extractTimestampRows(container);
      if (segs.length >= 3) return segs; // enough rows to look like a transcript
    }
    return [];
  }

  /** Find the visible timestamp leaf elements within a container. */
  function _timestampLeaves(container) {
    const leaves = [];
    for (const el of container.querySelectorAll('*')) {
      if (!TIMESTAMP_RE.test(el.textContent.trim())) continue;
      // A "leaf" has no child element that is itself a timestamp.
      const childIsTs = Array.from(el.children).some((c) =>
        TIMESTAMP_RE.test(c.textContent.trim())
      );
      if (childIsTs) continue;
      // Skip hidden content (e.g. the inactive "Chapters" tab).
      if (!el.offsetParent && el.offsetWidth === 0 && el.offsetHeight === 0) continue;
      leaves.push(el);
    }
    return leaves;
  }

  function _extractTimestampRows(container) {
    const leaves = _timestampLeaves(container);
    const segments = [];
    const seenRows = new Set();

    for (const leaf of leaves) {
      const timestamp = leaf.textContent.trim();

      // Climb to the largest ancestor that still contains exactly one timestamp
      // — that's the row holding this timestamp and its caption text.
      let row = leaf;
      while (
        row.parentElement &&
        row.parentElement !== container &&
        _timestampLeaves(row.parentElement).length === 1
      ) {
        row = row.parentElement;
      }
      if (seenRows.has(row)) continue;
      seenRows.add(row);

      // The timestamp's own wrapper may also hold a screen-reader label
      // ("11 seconds"); strip the whole short wrapper, not just the leaf.
      let tsWrap = leaf;
      let p = leaf.parentElement;
      while (p && p !== row && p.textContent.trim().length <= 35) {
        tsWrap = p;
        p = p.parentElement;
      }

      let full = row.textContent.replace(tsWrap.textContent, ' ');
      full = full.replace(DURATION_LABEL_RE, '');
      const text = full.replace(/\s+/g, ' ').trim();
      if (text) segments.push({ text, start: _parseTimestamp(timestamp), duration: 0 });
    }

    segments.sort((a, b) => a.start - b.start);
    return segments;
  }

  /**
   * Extract { text, start } from a single transcript row, without relying on
   * specific class names. Returns null if the row has no usable text.
   */
  function _extractSegment(row) {
    // 1) Find the timestamp ELEMENT (the visible "0:12"). We track the element,
    //    not just the string, so we can subtract its whole subtree — which also
    //    holds a screen-reader label like "12 seconds" — from the line text.
    let tsEl = row.querySelector(
      '.segment-timestamp, .segment-start-offset, [class*="timestamp"]'
    );
    let timestamp = null;

    if (tsEl) {
      // The element text may be "0:12" or "0:12 12 seconds" — take the time token.
      const tok = tsEl.textContent.trim().split(/\s+/)[0];
      if (TIMESTAMP_RE.test(tok)) timestamp = tok;
    }
    if (!timestamp) {
      // No class hint matched — scan for a leaf whose text is just a timestamp.
      for (const el of row.querySelectorAll('*')) {
        const t = el.textContent.trim();
        if (TIMESTAMP_RE.test(t)) { tsEl = el; timestamp = t; break; }
      }
    }

    // 2) Find the line text.
    //    (a) a dedicated text element, if the class still exists;
    //    (b) else the first <yt-formatted-string> that isn't the timestamp;
    //    (c) else the whole row text minus the timestamp element's subtree.
    let text = row.querySelector('.segment-text')?.textContent?.trim();

    if (!text) {
      for (const fs of row.querySelectorAll('yt-formatted-string')) {
        const t = fs.textContent.trim();
        if (t && !TIMESTAMP_RE.test(t)) { text = t; break; }
      }
    }

    if (!text) {
      // Strip the whole timestamp container, not just the "0:21" leaf — it also
      // holds a screen-reader label ("21 seconds") in a sibling node. Climb from
      // the time leaf while the ancestor stays "timestamp-sized" so we capture
      // that label without ever swallowing the sentence text.
      let tsStrip = tsEl;
      if (tsEl) {
        let p = tsEl.parentElement;
        while (p && p !== row && p.textContent.trim().length <= 35) {
          tsStrip = p;
          p = p.parentElement;
        }
      }
      let full = row.textContent;
      if (tsStrip) full = full.replace(tsStrip.textContent, ' ');
      text = full;
    }

    // Final cleanup — applies to EVERY path. The caption element can itself
    // contain the hidden screen-reader pieces ("0:02", "2 seconds"), so strip a
    // leading timestamp token and/or duration label regardless of how we got
    // here, then collapse whitespace.
    text = (text || '')
      .replace(/^\s*\d{1,2}:\d{2}(?::\d{2})?/, '')
      .replace(DURATION_LABEL_RE, '')
      .replace(/\s+/g, ' ')
      .trim();

    if (!text) return null;
    return { text, start: timestamp ? _parseTimestamp(timestamp) : 0, duration: 0 };
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
