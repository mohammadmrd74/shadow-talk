/**
 * ui.js — Overlay panel rendering for Shadow Talk.
 */

const ShadowUI = (() => {
  let overlay = null;
  // Dragged position, kept for the session so it survives re-renders and
  // SPA re-inits. Null until the user first drags the panel.
  let savedPos = null;
  let dragState = null;

  /**
   * Create the overlay element and inject it into the page.
   */
  function create() {
    if (overlay && document.contains(overlay)) return overlay;

    overlay = document.createElement('div');
    overlay.id = 'shadow-talk-overlay';
    overlay.classList.add('st-hidden');
    document.body.appendChild(overlay);
    _initDrag();
    _applySavedPos();
    return overlay;
  }

  /**
   * Make the panel draggable by its header. Uses event delegation on the
   * overlay so it keeps working after each innerHTML re-render.
   */
  function _initDrag() {
    overlay.addEventListener('mousedown', (e) => {
      const header = e.target.closest('.st-header');
      if (!header || !overlay.contains(header)) return;
      if (e.target.closest('button')) return; // let close/stop buttons work

      e.preventDefault();
      const rect = overlay.getBoundingClientRect();
      dragState = { dx: e.clientX - rect.left, dy: e.clientY - rect.top };

      // Switch from bottom/right anchoring to left/top so we can move freely.
      overlay.style.left = rect.left + 'px';
      overlay.style.top = rect.top + 'px';
      overlay.style.right = 'auto';
      overlay.style.bottom = 'auto';

      document.addEventListener('mousemove', _onDragMove);
      document.addEventListener('mouseup', _onDragEnd);
    });
  }

  function _onDragMove(e) {
    if (!dragState) return;
    const w = overlay.offsetWidth;
    const h = overlay.offsetHeight;
    let left = Math.max(0, Math.min(e.clientX - dragState.dx, window.innerWidth - w));
    let top = Math.max(0, Math.min(e.clientY - dragState.dy, window.innerHeight - h));
    overlay.style.left = left + 'px';
    overlay.style.top = top + 'px';
    savedPos = { left, top };
  }

  function _onDragEnd() {
    dragState = null;
    document.removeEventListener('mousemove', _onDragMove);
    document.removeEventListener('mouseup', _onDragEnd);
  }

  function _applySavedPos() {
    if (!savedPos || !overlay) return;
    overlay.style.left = savedPos.left + 'px';
    overlay.style.top = savedPos.top + 'px';
    overlay.style.right = 'auto';
    overlay.style.bottom = 'auto';
  }

  /**
   * Show the overlay.
   */
  function show() {
    if (!overlay) create();
    overlay.classList.remove('st-hidden');
  }

  /**
   * Hide the overlay.
   */
  function hide() {
    if (overlay) overlay.classList.add('st-hidden');
  }

  /**
   * Remove the overlay from the DOM entirely.
   */
  function destroy() {
    if (overlay && overlay.parentNode) {
      overlay.parentNode.removeChild(overlay);
    }
    overlay = null;
  }

  /**
   * Render the start screen (before shadowing begins).
   */
  function renderStart(onStart) {
    show();
    overlay.innerHTML = `
      <div class="st-header">
        <span class="st-header-title">Shadow Talk</span>
        <button class="st-close-btn" data-action="close">&times;</button>
      </div>
      <div class="st-body">
        <div class="st-start">
          <div class="st-start-text">
            Practice speaking by shadowing this video sentence by sentence.
          </div>
          <div style="margin-bottom: 12px;">
            <label class="st-sentence-label" for="st-lang-select">Language</label>
            <select id="st-lang-select" class="st-select">
              <option value="en-US">English (US)</option>
              <option value="en-GB">English (UK)</option>
              <option value="es-ES">Spanish</option>
              <option value="fr-FR">French</option>
              <option value="de-DE">German</option>
              <option value="it-IT">Italian</option>
              <option value="pt-BR">Portuguese (BR)</option>
              <option value="pt-PT">Portuguese (PT)</option>
              <option value="nl-NL">Dutch</option>
              <option value="ru-RU">Russian</option>
              <option value="ja-JP">Japanese</option>
              <option value="ko-KR">Korean</option>
              <option value="zh-CN">Chinese (Simplified)</option>
              <option value="zh-TW">Chinese (Traditional)</option>
              <option value="ar-SA">Arabic</option>
              <option value="hi-IN">Hindi</option>
              <option value="tr-TR">Turkish</option>
              <option value="pl-PL">Polish</option>
              <option value="sv-SE">Swedish</option>
              <option value="fa-IR">Persian (Farsi)</option>
            </select>
          </div>
          <button class="st-btn st-btn-primary" data-action="start" style="width: 100%;">
            Start Shadowing
          </button>
        </div>
      </div>
    `;

    overlay.querySelector('[data-action="start"]').onclick = () => {
      const lang = overlay.querySelector('#st-lang-select').value;
      onStart(lang);
    };
    overlay.querySelector('[data-action="close"]').onclick = () => hide();
  }

  /**
   * Render loading state.
   */
  function renderLoading() {
    show();
    overlay.innerHTML = `
      <div class="st-header">
        <span class="st-header-title">Shadow Talk</span>
        <button class="st-close-btn" data-action="close">&times;</button>
      </div>
      <div class="st-body">
        <div class="st-status">
          <span class="st-status-dot st-playing"></span>
          Loading transcript...
        </div>
      </div>
    `;
    overlay.querySelector('[data-action="close"]').onclick = () => hide();
  }

  /**
   * Render error state.
   */
  function renderError(message, onRetry) {
    show();
    overlay.innerHTML = `
      <div class="st-header">
        <span class="st-header-title">Shadow Talk</span>
        <button class="st-close-btn" data-action="close">&times;</button>
      </div>
      <div class="st-body">
        <div class="st-error">${_escapeHtml(message)}</div>
        <div class="st-buttons">
          <button class="st-btn st-btn-secondary" data-action="close-panel">Close</button>
          ${onRetry ? '<button class="st-btn st-btn-primary" data-action="retry">Retry</button>' : ''}
        </div>
      </div>
    `;

    overlay.querySelector('[data-action="close"]').onclick = () => hide();
    overlay.querySelector('[data-action="close-panel"]').onclick = () => hide();
    if (onRetry) {
      overlay.querySelector('[data-action="retry"]').onclick = onRetry;
    }
  }

  /**
   * Render the "playing" state — video is playing, waiting for sentence end.
   */
  function renderPlaying(sentence, sentenceIndex, totalSentences, onStop) {
    show();
    overlay.innerHTML = `
      <div class="st-header">
        <span class="st-header-title">Shadow Talk</span>
        <span class="st-header-info">${sentenceIndex + 1} / ${totalSentences}</span>
        <button class="st-close-btn" data-action="stop">&times;</button>
      </div>
      <div class="st-body">
        ${_renderProgress(sentenceIndex, totalSentences)}
        <div class="st-status">
          <span class="st-status-dot st-playing"></span>
          Listening to sentence...
        </div>
        <div class="st-sentence">
          <div class="st-sentence-label">Upcoming</div>
          <div class="st-sentence-text">${_escapeHtml(sentence.text)}</div>
        </div>
      </div>
    `;

    overlay.querySelector('[data-action="stop"]').onclick = onStop;
  }

  /**
   * Render the "your turn" state — video paused, waiting for user to speak.
   */
  function renderListening(sentence, sentenceIndex, totalSentences, callbacks) {
    show();
    overlay.innerHTML = `
      <div class="st-header">
        <span class="st-header-title">Shadow Talk</span>
        <span class="st-header-info">${sentenceIndex + 1} / ${totalSentences}</span>
        <button class="st-close-btn" data-action="stop">&times;</button>
      </div>
      <div class="st-body">
        ${_renderProgress(sentenceIndex, totalSentences)}
        <div class="st-sentence">
          <div class="st-sentence-label">Repeat this sentence</div>
          <div class="st-sentence-text">${_escapeHtml(sentence.text)}</div>
        </div>
        <div class="st-mic">
          <span class="st-mic-icon">&#127908;</span>
          Listening... Speak now!
        </div>
        <div class="st-sentence">
          <div class="st-sentence-label">You're saying</div>
          <div class="st-sentence-text st-live-text" style="color: #888; font-style: italic;">...</div>
        </div>
        <div class="st-buttons">
          <button class="st-btn st-btn-primary" data-action="done">Done</button>
          <button class="st-btn st-btn-secondary" data-action="replay">Replay</button>
          <button class="st-btn st-btn-secondary" data-action="skip">Skip</button>
        </div>
      </div>
    `;

    overlay.querySelector('[data-action="stop"]').onclick = callbacks.onStop;
    overlay.querySelector('[data-action="done"]').onclick = callbacks.onDone;
    overlay.querySelector('[data-action="replay"]').onclick = callbacks.onReplay;
    overlay.querySelector('[data-action="skip"]').onclick = callbacks.onSkip;
  }

  /**
   * Auto-advance delay (ms), scaled to the score: a good rep moves on quickly,
   * a poor rep gives the learner time to read the word-diff.
   */
  function _autoAdvanceDelay(score) {
    if (score >= 80) return 2000;
    if (score >= 50) return 3000;
    return 4500;
  }

  /**
   * Render the score result after user speaks.
   *
   * When `autoAdvance` is enabled, a visible countdown bar drains over a
   * score-scaled delay and then fires `onContinue`. Replay/Retry, toggling
   * auto-advance off, or hovering the panel cancels the countdown so the
   * learner can study at their own pace. `Continue` always advances now.
   */
  function renderScore(result, sentence, sentenceIndex, totalSentences, callbacks, autoAdvance) {
    const scoreClass =
      result.score >= 80 ? 'st-score-great' :
      result.score >= 50 ? 'st-score-good' : 'st-score-poor';

    const scoreLabel =
      result.score >= 80 ? 'Great job!' :
      result.score >= 50 ? 'Good effort!' : 'Try again!';

    show();
    overlay.innerHTML = `
      <div class="st-header">
        <span class="st-header-title">Shadow Talk</span>
        <span class="st-header-info">${sentenceIndex + 1} / ${totalSentences}</span>
        <button class="st-close-btn" data-action="stop">&times;</button>
      </div>
      <div class="st-body">
        ${_renderProgress(sentenceIndex + 1, totalSentences)}
        <div class="st-score">
          <div class="st-score-number ${scoreClass}">${result.score}%</div>
          <div class="st-score-label">${scoreLabel} (${result.matchedCount}/${result.totalCount} words)</div>
        </div>
        <div class="st-sentence">
          <div class="st-sentence-label">Original</div>
          <div class="st-sentence-text">${_renderWordDiff(result.words)}</div>
        </div>
        <div class="st-sentence">
          <div class="st-sentence-label">You said</div>
          <div class="st-sentence-text">${_renderUserWords(result.userWords)}</div>
        </div>
        <div class="st-countdown ${autoAdvance ? '' : 'st-hidden'}">
          <div class="st-countdown-fill"></div>
        </div>
        <div class="st-buttons">
          <button class="st-btn st-btn-secondary" data-action="replay">Replay</button>
          <button class="st-btn st-btn-secondary" data-action="retry">Retry</button>
          <button class="st-btn st-btn-primary" data-action="continue">Continue</button>
        </div>
        <label class="st-auto-toggle">
          <input type="checkbox" data-action="toggle-auto" ${autoAdvance ? 'checked' : ''}>
          <span>Auto-continue</span>
        </label>
      </div>
    `;

    // --- Countdown / auto-advance wiring ---
    let timerId = null;
    let cancelled = false;

    const cancelAuto = () => {
      if (timerId) {
        clearTimeout(timerId);
        timerId = null;
      }
      cancelled = true;
      const fill = overlay.querySelector('.st-countdown-fill');
      if (fill) {
        // Freeze the bar where it is.
        const w = getComputedStyle(fill).width;
        fill.style.transition = 'none';
        fill.style.width = w;
      }
      const bar = overlay.querySelector('.st-countdown');
      if (bar) bar.classList.add('st-hidden');
    };

    const startAuto = () => {
      cancelled = false;
      const delay = _autoAdvanceDelay(result.score);
      const bar = overlay.querySelector('.st-countdown');
      const fill = overlay.querySelector('.st-countdown-fill');
      if (bar) bar.classList.remove('st-hidden');
      if (fill) {
        fill.style.transition = 'none';
        fill.style.width = '100%';
        // Next frame: animate to 0 over the delay.
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            fill.style.transition = `width ${delay}ms linear`;
            fill.style.width = '0%';
          });
        });
      }
      timerId = setTimeout(() => {
        if (!cancelled) callbacks.onContinue();
      }, delay);
    };

    overlay.querySelector('[data-action="stop"]').onclick = () => {
      cancelAuto();
      callbacks.onStop();
    };
    overlay.querySelector('[data-action="replay"]').onclick = () => {
      cancelAuto();
      callbacks.onReplay();
    };
    overlay.querySelector('[data-action="retry"]').onclick = () => {
      cancelAuto();
      callbacks.onRetry();
    };
    overlay.querySelector('[data-action="continue"]').onclick = () => {
      cancelAuto();
      callbacks.onContinue();
    };

    const toggle = overlay.querySelector('[data-action="toggle-auto"]');
    toggle.onchange = () => {
      if (callbacks.onToggleAuto) callbacks.onToggleAuto(toggle.checked);
      if (toggle.checked) {
        startAuto();
      } else {
        cancelAuto();
      }
    };

    // Hovering the panel means the learner wants to study — pause the countdown.
    overlay.addEventListener('mouseenter', cancelAuto, { once: true });

    if (autoAdvance) startAuto();
  }

  /**
   * Render completion screen.
   */
  function renderComplete(stats, onRestart, onClose) {
    show();
    overlay.innerHTML = `
      <div class="st-header">
        <span class="st-header-title">Shadow Talk</span>
        <button class="st-close-btn" data-action="close">&times;</button>
      </div>
      <div class="st-body">
        <div class="st-score">
          <div class="st-score-number st-score-great">${stats.averageScore}%</div>
          <div class="st-score-label">Average Score — ${stats.totalSentences} sentences completed</div>
        </div>
        <div class="st-buttons">
          <button class="st-btn st-btn-secondary" data-action="close-panel">Close</button>
          <button class="st-btn st-btn-primary" data-action="restart">Restart</button>
        </div>
      </div>
    `;

    overlay.querySelector('[data-action="close"]').onclick = onClose || (() => hide());
    overlay.querySelector('[data-action="close-panel"]').onclick = onClose || (() => hide());
    overlay.querySelector('[data-action="restart"]').onclick = onRestart;
  }

  // ---- Private helpers ----

  function _renderProgress(current, total) {
    const pct = total > 0 ? Math.round((current / total) * 100) : 0;
    return `
      <div class="st-progress">
        <div class="st-progress-bar">
          <div class="st-progress-fill" style="width: ${pct}%"></div>
        </div>
        <span class="st-progress-text">${pct}%</span>
      </div>
    `;
  }

  function _renderWordDiff(words) {
    return words
      .map((w) => `<span class="st-word-${w.status}">${_escapeHtml(w.word)}</span>`)
      .join(' ');
  }

  function _renderUserWords(words) {
    if (!words || words.length === 0) return '<span class="st-word-missed">(no speech detected)</span>';
    return words
      .map((w) => `<span class="st-word-${w.status}">${_escapeHtml(w.word)}</span>`)
      .join(' ');
  }

  function _escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  return {
    create,
    show,
    hide,
    destroy,
    renderStart,
    renderLoading,
    renderError,
    renderPlaying,
    renderListening,
    renderScore,
    renderComplete,
  };
})();
