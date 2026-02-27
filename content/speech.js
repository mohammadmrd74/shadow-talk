/**
 * speech.js — Web Speech API wrapper for listening to user speech.
 *
 * Uses continuous mode so the user can speak multiple sentences
 * without being cut off. Finalizes after a silence gap.
 */

const ShadowSpeech = (() => {
  let recognition = null;
  let isListening = false;

  /**
   * Check if Web Speech API is available.
   */
  function isSupported() {
    return !!(window.SpeechRecognition || window.webkitSpeechRecognition);
  }

  /**
   * Start listening for speech.
   *
   * Uses continuous mode — keeps listening until:
   * - User stops speaking for `silenceTimeout` ms (default 2s)
   * - Overall `timeout` is reached (default 20s)
   * - stop() or abort() is called externally
   *
   * `onInterim(text)` callback is called with live partial results
   * so the UI can show what's being recognized in real-time.
   *
   * Returns a Promise that resolves with { transcript, confidence }.
   */
  function listen(lang = 'en-US', timeout = 20000, silenceTimeout = 2000, onInterim = null) {
    return new Promise((resolve, reject) => {
      if (!isSupported()) {
        reject(new Error('Speech recognition is not supported in this browser.'));
        return;
      }

      if (isListening) {
        reject(new Error('Already listening.'));
        return;
      }

      const SpeechRecognition =
        window.SpeechRecognition || window.webkitSpeechRecognition;
      recognition = new SpeechRecognition();
      recognition.lang = lang;
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.maxAlternatives = 1;

      let settled = false;
      let overallTimeoutId = null;
      let silenceTimeoutId = null;
      let finalParts = '';   // confirmed final results
      let latestInterim = ''; // latest interim (not yet final)

      const settle = (fn, value) => {
        if (settled) return;
        settled = true;
        isListening = false;
        if (overallTimeoutId) clearTimeout(overallTimeoutId);
        if (silenceTimeoutId) clearTimeout(silenceTimeoutId);
        try { recognition.stop(); } catch (e) {}
        fn(value);
      };

      /** Get the best transcript we have (final + interim) */
      const getBestTranscript = () => {
        return (finalParts + latestInterim).trim();
      };

      const finalize = () => {
        const text = getBestTranscript();
        settle(resolve, {
          transcript: text,
          confidence: text ? 0.8 : 0,
        });
      };

      /**
       * Reset the silence timer — called every time new speech is detected.
       */
      const resetSilenceTimer = () => {
        if (silenceTimeoutId) clearTimeout(silenceTimeoutId);
        silenceTimeoutId = setTimeout(() => {
          if (isListening && getBestTranscript()) {
            finalize();
          }
        }, silenceTimeout);
      };

      recognition.onresult = (event) => {
        let interim = '';
        let final = '';

        for (let i = 0; i < event.results.length; i++) {
          const result = event.results[i];
          if (result.isFinal) {
            final += result[0].transcript;
          } else {
            interim += result[0].transcript;
          }
        }

        finalParts = final;
        latestInterim = interim;

        // Show live preview
        const liveText = getBestTranscript();
        if (onInterim && liveText) {
          onInterim(liveText);
        }

        // Reset silence timer on any speech activity
        resetSilenceTimer();
      };

      recognition.onerror = (event) => {
        if (event.error === 'no-speech') {
          settle(resolve, { transcript: '', confidence: 0 });
        } else if (event.error === 'aborted') {
          settle(resolve, { transcript: getBestTranscript(), confidence: 0 });
        } else {
          settle(reject, new Error(`Speech recognition error: ${event.error}`));
        }
      };

      recognition.onend = () => {
        if (!settled) {
          const text = getBestTranscript();
          settle(resolve, {
            transcript: text,
            confidence: text ? 0.8 : 0,
          });
        }
      };

      isListening = true;
      recognition.start();

      // Start silence timer (will finalize if user never speaks)
      resetSilenceTimer();

      // Overall timeout safety net
      overallTimeoutId = setTimeout(() => {
        if (isListening) {
          finalize();
        }
      }, timeout);
    });
  }

  /**
   * Stop listening gracefully (keeps results).
   */
  function stop() {
    if (recognition) {
      try { recognition.stop(); } catch (e) {}
    }
    isListening = false;
  }

  /**
   * Abort listening immediately (discard results).
   */
  function abort() {
    if (recognition) {
      try { recognition.abort(); } catch (e) {}
    }
    isListening = false;
  }

  function getIsListening() {
    return isListening;
  }

  function mapLanguage(ytLangCode) {
    const map = {
      en: 'en-US', 'en-US': 'en-US', 'en-GB': 'en-GB',
      es: 'es-ES', fr: 'fr-FR', de: 'de-DE', it: 'it-IT',
      pt: 'pt-BR', ja: 'ja-JP', ko: 'ko-KR', zh: 'zh-CN',
      'zh-Hans': 'zh-CN', 'zh-Hant': 'zh-TW', ru: 'ru-RU',
      ar: 'ar-SA', hi: 'hi-IN', tr: 'tr-TR', pl: 'pl-PL',
      nl: 'nl-NL', sv: 'sv-SE',
    };
    return map[ytLangCode] || ytLangCode;
  }

  return { isSupported, listen, stop, abort, getIsListening, mapLanguage };
})();
