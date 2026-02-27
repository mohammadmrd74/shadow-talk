/**
 * player.js — YouTube video player control (pause, play, seek, time tracking).
 */

const ShadowPlayer = (() => {
  let videoElement = null;
  let onTimeCallback = null;
  let checkInterval = null;
  let targetPauseTime = null;

  /**
   * Get the YouTube video element.
   */
  function getVideo() {
    if (videoElement && document.contains(videoElement)) return videoElement;
    videoElement = document.querySelector('video.html5-main-video') ||
                   document.querySelector('video');
    return videoElement;
  }

  /**
   * Pause the video.
   */
  function pause() {
    const video = getVideo();
    if (video && !video.paused) {
      video.pause();
    }
  }

  /**
   * Play the video.
   */
  function play() {
    const video = getVideo();
    if (video && video.paused) {
      video.play();
    }
  }

  /**
   * Seek to a specific time in seconds.
   */
  function seekTo(time) {
    const video = getVideo();
    if (video) {
      video.currentTime = time;
    }
  }

  /**
   * Get current playback time in seconds.
   */
  function getCurrentTime() {
    const video = getVideo();
    return video ? video.currentTime : 0;
  }

  /**
   * Check if the video is currently paused.
   */
  function isPaused() {
    const video = getVideo();
    return video ? video.paused : true;
  }

  /**
   * Get video duration in seconds.
   */
  function getDuration() {
    const video = getVideo();
    return video ? video.duration : 0;
  }

  /**
   * Set playback rate (0.5 = half speed, 1 = normal, 1.5, 2, etc.)
   */
  function setPlaybackRate(rate) {
    const video = getVideo();
    if (video) {
      video.playbackRate = rate;
    }
  }

  /**
   * Get current playback rate.
   */
  function getPlaybackRate() {
    const video = getVideo();
    return video ? video.playbackRate : 1;
  }

  /**
   * Start monitoring video time. Calls callback when currentTime >= targetTime.
   * Used to pause at sentence boundaries.
   */
  function watchForTime(targetTime, callback) {
    stopWatching();
    targetPauseTime = targetTime;
    onTimeCallback = callback;

    const video = getVideo();
    if (!video) return;

    // Use timeupdate event for efficiency
    video.addEventListener('timeupdate', _onTimeUpdate);
  }

  function _onTimeUpdate() {
    const video = getVideo();
    if (!video || targetPauseTime === null) return;

    if (video.currentTime >= targetPauseTime) {
      video.pause();
      video.removeEventListener('timeupdate', _onTimeUpdate);
      const cb = onTimeCallback;
      onTimeCallback = null;
      targetPauseTime = null;
      if (cb) cb();
    }
  }

  /**
   * Stop watching for time.
   */
  function stopWatching() {
    const video = getVideo();
    if (video) {
      video.removeEventListener('timeupdate', _onTimeUpdate);
    }
    if (checkInterval) {
      clearInterval(checkInterval);
      checkInterval = null;
    }
    onTimeCallback = null;
    targetPauseTime = null;
  }

  /**
   * Clean up all listeners.
   */
  function destroy() {
    stopWatching();
    videoElement = null;
  }

  return {
    getVideo,
    pause,
    play,
    seekTo,
    getCurrentTime,
    isPaused,
    getDuration,
    setPlaybackRate,
    getPlaybackRate,
    watchForTime,
    stopWatching,
    destroy,
  };
})();
