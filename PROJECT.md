# Shadow Talk — YouTube Shadowing Chrome Extension

## What Is This?

A free, open-source Chrome extension that turns any YouTube video into a speaking practice tool. It pauses the video after each sentence, waits for the user to repeat it, scores their attempt, and moves on.

Built on the **shadowing technique** — a proven language learning method where learners mimic native speakers sentence by sentence to improve pronunciation, rhythm, and fluency.

---

## Core Flow

```
1. User opens any YouTube video with captions
2. Clicks "Start Shadowing" (extension button)
3. Extension fetches the timed transcript from YouTube
4. Merges transcript fragments into full sentences with timestamps
5. Video plays normally
6. At the end of each sentence → video pauses automatically
7. User speaks the sentence (Web Speech API listens)
8. Extension compares user speech vs original text
9. Shows score + word-level diff (green = matched, red = missed)
10. User clicks continue or auto-resumes after a delay
11. Repeat until video ends or user stops
```

---

## Technical Architecture

### Getting the Transcript
- Extract caption track URL from `ytInitialPlayerResponse` in the YouTube page
- Fetch the timed transcript (XML with text + start time + duration per segment)
- No API key needed — YouTube loads this data for its own subtitle rendering

### Sentence Merging
- Manual captions: split on punctuation (`.` `?` `!`)
- Auto-generated captions (no punctuation): use pause gaps between segments (gap > 0.5s = sentence break)
- Each merged sentence keeps its combined start and end timestamps

### Speech Recognition
- Browser's built-in **Web Speech API** (SpeechRecognition)
- Free, no API key, runs locally in the browser
- Set language to match the video's caption language

### Speech Evaluation (No LLM)
- **Word-level diff**: tokenize both strings, compare word by word
- **Levenshtein distance** at word level for fuzzy matching
- **Percentage score**: correct words / total words
- **Common contractions map**: "going to" ≈ "gonna", "want to" ≈ "wanna" (small manual list)
- Show visual diff: green for matched words, red for missed, yellow for close matches

### Video Control
- YouTube IFrame API or direct DOM manipulation of the video player
- Pause at sentence end timestamps
- Resume on user action or auto-resume

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Extension | Chrome Manifest V3 |
| Transcript | YouTube timedtext endpoint |
| Speech Input | Web Speech API (built-in) |
| Scoring | Levenshtein + word diff (pure JS) |
| UI | Injected overlay panel on YouTube page |
| Storage | chrome.storage.local for progress/settings |

No external APIs. No backend. No cost. Fully client-side.

---

## Market Analysis

### Competitors

| Tool | What It Does | Gap |
|------|-------------|-----|
| Language Reactor | Dual subtitles + dictionary on YouTube/Netflix | No speaking practice |
| Elsa Speak | AI pronunciation scoring | Own content only, not YouTube |
| Speechling | Speech coach with native feedback | Not on YouTube, limited content |
| Various shadowing apps | Pre-recorded shadowing exercises | Fixed content, not YouTube |

### Our Unique Position
- Shadowing directly on YouTube — practice with any video
- Free and open source — no subscription, no API costs
- No account required — install and go
- Works with real content users already watch

---

## What Makes Users Stay

1. **Accurate scoring** — the diff must feel fair, not frustrating
2. **Works on videos they already watch** — not forced content
3. **Low friction** — one click to start, no signup, no config
4. **Progress visibility** — sentences practiced, accuracy over time
5. **Replay button** — hear the sentence again before trying
6. **Skip button** — don't force users through sentences they know
7. **Speed control** — option to slow down playback for difficult sentences
8. **Visual transcript** — see the sentence while attempting it

---

## What Must NOT Happen

These are extension-killers. If any of these happen consistently, users uninstall:

### Scoring Failures
- Marking correct speech as wrong — instant frustration
- Being too strict — nobody speaks exactly like captions
- Being too lenient — defeats the purpose, no challenge

### Sentence Detection Failures
- Splitting mid-sentence — "Hello everyone welcome to" (pause) makes no sense
- Merging two sentences — too long to remember and repeat
- Missing sentences — skipping content without reason

### UX Failures
- Overlay blocking the video — user needs to see the speaker's mouth
- No way to skip — forced to repeat something they already know
- No way to exit cleanly — shadowing mode stuck
- Slow pause/resume — even 500ms lag feels broken
- Extension running when not activated — wasting resources on every YouTube page

### Technical Failures
- Breaking when YouTube updates their page structure
- Not handling videos without captions (should show clear message)
- Crashing on long videos — must handle 1hr+ videos gracefully
- Memory leaks from speech recognition staying open

---

## MVP Scope (v1.0)

### In Scope
- [ ] Chrome extension with Manifest V3
- [ ] Fetch transcript from YouTube video page
- [ ] Merge transcript into sentences with timestamps
- [ ] Pause video at sentence boundaries
- [ ] Listen for user speech via Web Speech API
- [ ] Score speech with word-level diff
- [ ] Show score + visual diff overlay
- [ ] Continue/replay/skip buttons
- [ ] Works on videos with manual or auto-generated captions
- [ ] Clean error message for videos without captions

### Out of Scope (Future)
- User accounts and cloud sync
- LLM-powered feedback (optional premium layer)
- Pronunciation analysis (phoneme level)
- Leaderboards or social features
- Mobile support
- Netflix/other platform support
- Sentence bookmarking for review
- Spaced repetition of difficult sentences

---

## File Structure (Planned)

```
speak-as-actor-ext/
├── manifest.json              # Extension manifest (V3)
├── background.js              # Service worker
├── content/
│   ├── content.js             # Main content script (injected into YouTube)
│   ├── transcript.js          # Fetch + parse + merge transcript
│   ├── player.js              # YouTube video control (pause/play/seek)
│   ├── speech.js              # Web Speech API wrapper
│   ├── scoring.js             # Text comparison + scoring
│   └── ui.js                  # Overlay panel rendering
├── popup/
│   ├── popup.html             # Extension popup
│   └── popup.js               # Popup logic
├── styles/
│   └── overlay.css            # Overlay panel styles
├── icons/
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
└── PROJECT.md                 # This file
```
