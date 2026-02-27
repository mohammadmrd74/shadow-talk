/**
 * transcript.js — Get YouTube transcripts via the page-bridge.
 *
 * The page-bridge.js runs in MAIN world (page context) and has access to
 * YouTube's JS objects + session cookies. This content script communicates
 * with it via CustomEvents.
 */

const ShadowTranscript = (() => {

  /**
   * Send a request to the page-bridge and wait for response.
   */
  function bridgeRequest(action, args = {}) {
    return new Promise((resolve, reject) => {
      const requestId = 'req_' + Math.random().toString(36).slice(2);

      const handler = (e) => {
        if (e.detail.requestId !== requestId) return;
        window.removeEventListener('shadowtalk-response', handler);

        if (e.detail.error) {
          reject(new Error(e.detail.error));
        } else {
          resolve(e.detail.result);
        }
      };

      window.addEventListener('shadowtalk-response', handler);

      window.dispatchEvent(new CustomEvent('shadowtalk-request', {
        detail: { requestId, action, args },
      }));

      // Timeout after 15s
      setTimeout(() => {
        window.removeEventListener('shadowtalk-response', handler);
        reject(new Error('Bridge request timed out.'));
      }, 15000);
    });
  }

  /**
   * Main entry: get transcript for the current video.
   */
  async function getTranscript(preferredLang) {
    console.log('[ShadowTalk] Requesting transcript via page bridge...');

    const data = await bridgeRequest('getTranscript', { preferredLang });

    console.log('[ShadowTalk] Bridge returned:', JSON.stringify(data).substring(0, 300));

    let segments;

    // If bridge returned pre-parsed segments (InnerTube API path)
    if (data.segments && data.segments.length > 0) {
      segments = data.segments;
      console.log(`[ShadowTalk] Got ${segments.length} pre-parsed segments from InnerTube`);
    }
    // If bridge returned raw text (timedtext fallback path)
    else if (data.rawText && data.rawText.trim().length > 0) {
      if (data.fmt === 'json3') {
        segments = _parseJson3(data.rawText);
      } else {
        segments = _parseXml(data.rawText);
      }
      console.log(`[ShadowTalk] Parsed ${segments.length} segments from rawText (fmt=${data.fmt})`);
    }
    else {
      throw new Error('Transcript response was empty.');
    }

    const sentences = mergeIntoSentences(segments);
    console.log(`[ShadowTalk] Merged into ${sentences.length} sentences`);

    if (sentences.length === 0) {
      throw new Error('Transcript is empty — no sentences found.');
    }

    return {
      sentences,
      language: data.language,
      trackName: data.trackName,
      availableTracks: data.allTracks,
    };
  }

  /** Parse json3 format */
  function _parseJson3(rawText) {
    const data = JSON.parse(rawText);
    const events = data.events || [];
    const segments = [];
    for (const event of events) {
      if (!event.segs) continue;
      const text = event.segs.map((s) => s.utf8 || '').join('').trim();
      if (!text || text === '\n') continue;
      segments.push({
        text,
        start: (event.tStartMs || 0) / 1000,
        duration: (event.dDurationMs || 0) / 1000,
      });
    }
    return segments;
  }

  /** Parse XML-based formats (srv3/srv1) */
  function _parseXml(rawText) {
    const segments = [];

    // Try <p t="ms" d="ms"> (srv3)
    let regex = /<p\s[^>]*?t="(\d+)"[^>]*?d="(\d+)"[^>]*?>([\s\S]*?)<\/p>/g;
    let match;
    while ((match = regex.exec(rawText)) !== null) {
      const text = _decode(match[3].replace(/<[^>]+>/g, '')).trim();
      if (!text) continue;
      segments.push({
        text,
        start: parseInt(match[1], 10) / 1000,
        duration: parseInt(match[2], 10) / 1000,
      });
    }

    // Fallback: <text start="" dur=""> (srv1)
    if (segments.length === 0) {
      regex = /<text\s+start="([^"]*)"(?:\s+dur="([^"]*)")?[^>]*>([\s\S]*?)<\/text>/g;
      while ((match = regex.exec(rawText)) !== null) {
        const text = _decode(match[3].replace(/<[^>]+>/g, '')).trim();
        if (!text) continue;
        segments.push({
          text,
          start: parseFloat(match[1] || '0'),
          duration: parseFloat(match[2] || '0'),
        });
      }
    }

    return segments;
  }

  function _decode(str) {
    return str
      .replace(/&#39;/g, "'")
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)));
  }

  /** Merge segments into sentences */
  function mergeIntoSentences(segments) {
    if (segments.length === 0) return [];

    const sentences = [];
    let currentText = '';
    let currentStart = segments[0].start;

    const sentenceEnders = /[.!?]$/;
    const GAP_THRESHOLD = 0.8;
    const hasPunctuation = segments.some((s) => sentenceEnders.test(s.text.trim()));

    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      const segEnd = seg.start + seg.duration;
      const trimmedText = seg.text.trim();

      if (currentText) {
        currentText += ' ' + trimmedText;
      } else {
        currentText = trimmedText;
        currentStart = seg.start;
      }

      let shouldBreak = false;

      if (hasPunctuation) {
        shouldBreak = sentenceEnders.test(trimmedText);
      } else {
        const nextSeg = segments[i + 1];
        if (nextSeg) {
          const gap = nextSeg.start - segEnd;
          shouldBreak = gap >= GAP_THRESHOLD;
        }
        if (currentText.split(/\s+/).length >= 15) shouldBreak = true;
      }

      if (i === segments.length - 1) shouldBreak = true;

      if (shouldBreak && currentText.trim()) {
        sentences.push({
          text: currentText.trim(),
          startTime: currentStart,
          endTime: segEnd,
        });
        currentText = '';
        currentStart = segments[i + 1]?.start || segEnd;
      }
    }

    return sentences;
  }

  return { getTranscript, mergeIntoSentences };
})();
