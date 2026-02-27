/**
 * scoring.js — Compare user speech against original text.
 * Word-level diff, Levenshtein distance, percentage scoring.
 */

const ShadowScoring = (() => {
  /**
   * Common contractions/informal speech equivalences.
   */
  const EQUIVALENCES = {
    'gonna': 'going to',
    'wanna': 'want to',
    'gotta': 'got to',
    'kinda': 'kind of',
    'sorta': 'sort of',
    'dunno': "don't know",
    'lemme': 'let me',
    'gimme': 'give me',
    'coulda': 'could have',
    'shoulda': 'should have',
    'woulda': 'would have',
    "it's": 'it is',
    "that's": 'that is',
    "what's": 'what is',
    "there's": 'there is',
    "here's": 'here is',
    "he's": 'he is',
    "she's": 'she is',
    "i'm": 'i am',
    "you're": 'you are',
    "we're": 'we are',
    "they're": 'they are',
    "i've": 'i have',
    "you've": 'you have',
    "we've": 'we have',
    "they've": 'they have',
    "i'll": 'i will',
    "you'll": 'you will',
    "he'll": 'he will',
    "she'll": 'she will',
    "we'll": 'we will',
    "they'll": 'they will',
    "i'd": 'i would',
    "you'd": 'you would',
    "he'd": 'he would',
    "she'd": 'she would',
    "we'd": 'we would',
    "they'd": 'they would',
    "isn't": 'is not',
    "aren't": 'are not',
    "wasn't": 'was not',
    "weren't": 'were not',
    "don't": 'do not',
    "doesn't": 'does not',
    "didn't": 'did not',
    "can't": 'cannot',
    "couldn't": 'could not',
    "won't": 'will not',
    "wouldn't": 'would not',
    "shouldn't": 'should not',
    "haven't": 'have not',
    "hasn't": 'has not',
    "hadn't": 'had not',
  };

  /**
   * Normalize text for comparison:
   * - lowercase
   * - remove punctuation
   * - collapse whitespace
   */
  function normalize(text) {
    return text
      .toLowerCase()
      .replace(/[^\w\s']/g, '') // keep apostrophes for contractions
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Tokenize text into words.
   */
  function tokenize(text) {
    const normalized = normalize(text);
    return normalized ? normalized.split(' ') : [];
  }

  /**
   * Expand contractions in a word array.
   * "gonna" → ["going", "to"]
   */
  function expandContractions(words) {
    const expanded = [];
    for (const word of words) {
      const expansion = EQUIVALENCES[word];
      if (expansion) {
        expanded.push(...expansion.split(' '));
      } else {
        expanded.push(word);
      }
    }
    return expanded;
  }

  /**
   * Levenshtein distance between two strings (character level).
   */
  function levenshtein(a, b) {
    const m = a.length;
    const n = b.length;
    const dp = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));

    for (let i = 0; i <= m; i++) dp[i][0] = i;
    for (let j = 0; j <= n; j++) dp[0][j] = j;

    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        if (a[i - 1] === b[j - 1]) {
          dp[i][j] = dp[i - 1][j - 1];
        } else {
          dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
        }
      }
    }

    return dp[m][n];
  }

  /**
   * Check if two words are "close enough" (fuzzy match).
   * Allows small typos / speech recognition errors.
   */
  function isCloseMatch(word1, word2) {
    if (word1 === word2) return true;

    const dist = levenshtein(word1, word2);
    const maxLen = Math.max(word1.length, word2.length);

    // Allow ~30% character difference for short words, more lenient for longer
    if (maxLen <= 3) return dist <= 1;
    if (maxLen <= 6) return dist <= 2;
    return dist <= Math.floor(maxLen * 0.3);
  }

  /**
   * Word-level LCS (Longest Common Subsequence) to align words.
   * Returns indices of matched words.
   */
  function wordLCS(original, spoken) {
    const m = original.length;
    const n = spoken.length;
    const dp = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));

    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        if (original[i - 1] === spoken[j - 1] || isCloseMatch(original[i - 1], spoken[j - 1])) {
          dp[i][j] = dp[i - 1][j - 1] + 1;
        } else {
          dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
        }
      }
    }

    // Backtrack to find which original words were matched
    const matchedOriginal = new Set();
    const matchedSpoken = new Set();
    let i = m, j = n;
    while (i > 0 && j > 0) {
      if (original[i - 1] === spoken[j - 1] || isCloseMatch(original[i - 1], spoken[j - 1])) {
        matchedOriginal.add(i - 1);
        matchedSpoken.add(j - 1);
        i--;
        j--;
      } else if (dp[i - 1][j] > dp[i][j - 1]) {
        i--;
      } else {
        j--;
      }
    }

    return { matchedOriginal, matchedSpoken, lcsLength: dp[m][n] };
  }

  /**
   * Score user speech against original text.
   *
   * Returns {
   *   score: 0-100,
   *   words: [{ word, status: 'correct' | 'close' | 'missed' }],
   *   userWords: [{ word, status: 'correct' | 'close' | 'extra' }],
   *   matchedCount, totalCount
   * }
   */
  function score(originalText, userText) {
    if (!userText || !userText.trim()) {
      const words = tokenize(originalText).map((w) => ({ word: w, status: 'missed' }));
      return { score: 0, words, userWords: [], matchedCount: 0, totalCount: words.length };
    }

    let origWords = tokenize(originalText);
    let userWords = tokenize(userText);

    // Expand contractions on both sides for fair comparison
    origWords = expandContractions(origWords);
    userWords = expandContractions(userWords);

    const { matchedOriginal, matchedSpoken, lcsLength } = wordLCS(origWords, userWords);

    // Build result for original words
    const resultWords = origWords.map((word, idx) => {
      if (matchedOriginal.has(idx)) {
        // Check if it's exact or close
        // Find the corresponding spoken word
        const isExact = userWords.some(
          (uw, ui) => matchedSpoken.has(ui) && uw === word
        );
        return { word, status: isExact ? 'correct' : 'close' };
      }
      return { word, status: 'missed' };
    });

    // Build result for user words
    const resultUserWords = userWords.map((word, idx) => {
      if (matchedSpoken.has(idx)) {
        return { word, status: 'correct' };
      }
      return { word, status: 'extra' };
    });

    const totalCount = origWords.length;
    const matchedCount = lcsLength;
    const percentage = totalCount > 0 ? Math.round((matchedCount / totalCount) * 100) : 0;

    return {
      score: percentage,
      words: resultWords,
      userWords: resultUserWords,
      matchedCount,
      totalCount,
    };
  }

  return { score, normalize, tokenize, levenshtein, isCloseMatch };
})();
