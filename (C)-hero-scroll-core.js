/*
 * ENY Motors deterministic hero-video scroll core.
 *
 * The module is intentionally dependency-free and exposes the same API as
 * `window.ENYHeroCore` in a browser and `module.exports` in Node. It performs
 * never plays the supplied video. A scroll position therefore always maps to
 * one exact source frame. Callers can optionally limit each completed seek to
 * a small frame step so fast wheel input is presented as a continuous chase
 * instead of a sequence of large temporal jumps.
 */
(function universalModuleDefinition(root, factory) {
  const api = factory(root);

  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }

  if (root && typeof root === 'object') {
    root.ENYHeroCore = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function createCore(root) {
  'use strict';

  function finiteNumber(value, name) {
    const number = Number(value);
    if (!Number.isFinite(number)) {
      throw new TypeError(`${name} must be a finite number`);
    }
    return number;
  }

  function positiveInteger(value, name) {
    const number = finiteNumber(value, name);
    if (!Number.isInteger(number) || number < 1) {
      throw new RangeError(`${name} must be a positive integer`);
    }
    return number;
  }

  function positiveNumber(value, name) {
    const number = finiteNumber(value, name);
    if (number <= 0) {
      throw new RangeError(`${name} must be greater than zero`);
    }
    return number;
  }

  function clamp(value, minimum, maximum) {
    const min = minimum === undefined ? 0 : finiteNumber(minimum, 'minimum');
    const max = maximum === undefined ? 1 : finiteNumber(maximum, 'maximum');
    if (min > max) {
      throw new RangeError('minimum must not exceed maximum');
    }

    const number = Number(value);
    if (Number.isNaN(number)) return min;
    if (number === Infinity) return max;
    if (number === -Infinity) return min;
    if (!Number.isFinite(number)) return min;
    return Math.min(max, Math.max(min, number));
  }

  function clamp01(value) {
    return clamp(value, 0, 1);
  }

  function progressToFrame(progress, frameCount) {
    const count = positiveInteger(frameCount, 'frameCount');
    return Math.round(clamp01(progress) * (count - 1));
  }

  function clampFrame(frame, frameCount) {
    const count = positiveInteger(frameCount, 'frameCount');
    return Math.round(clamp(frame, 0, count - 1));
  }

  function frameToTime(frame, fps, frameCount) {
    const rate = positiveNumber(fps, 'fps');
    const resolvedFrame = frameCount === undefined
      ? Math.max(0, Math.round(finiteNumber(frame, 'frame')))
      : clampFrame(frame, frameCount);
    return resolvedFrame / rate;
  }

  function progressToTime(progress, fps, frameCount) {
    return frameToTime(progressToFrame(progress, frameCount), fps, frameCount);
  }

  function createScrollGeometry(values) {
    if (!values || typeof values !== 'object') {
      throw new TypeError('geometry values are required');
    }

    const start = finiteNumber(values.heroStart, 'heroStart');
    const heroHeight = Math.max(0, finiteNumber(values.heroHeight, 'heroHeight'));
    const stickyHeight = Math.max(0, finiteNumber(values.stickyHeight, 'stickyHeight'));
    const range = Math.max(0, heroHeight - stickyHeight);

    return Object.freeze({
      start,
      end: start + range,
      range,
      heroHeight,
      stickyHeight
    });
  }

  function progressFromScroll(scrollY, geometry) {
    const scroll = finiteNumber(scrollY, 'scrollY');
    if (!geometry || typeof geometry !== 'object') {
      throw new TypeError('geometry is required');
    }

    const start = finiteNumber(geometry.start, 'geometry.start');
    const range = Math.max(0, finiteNumber(geometry.range, 'geometry.range'));
    if (range === 0) return 0;
    return clamp01((scroll - start) / range);
  }

  function measureScrollGeometry(heroElement, stickyElement, scrollY) {
    if (!heroElement || typeof heroElement.getBoundingClientRect !== 'function') {
      throw new TypeError('heroElement must provide getBoundingClientRect()');
    }
    if (!stickyElement || typeof stickyElement.getBoundingClientRect !== 'function') {
      throw new TypeError('stickyElement must provide getBoundingClientRect()');
    }

    const scroll = scrollY === undefined
      ? finiteNumber(root && root.scrollY !== undefined ? root.scrollY : 0, 'scrollY')
      : finiteNumber(scrollY, 'scrollY');
    const heroRect = heroElement.getBoundingClientRect();
    const stickyRect = stickyElement.getBoundingClientRect();
    const heroHeight = Number(heroElement.offsetHeight) || finiteNumber(heroRect.height, 'heroRect.height');
    const stickyHeight = Number(stickyElement.clientHeight) || finiteNumber(stickyRect.height, 'stickyRect.height');

    return createScrollGeometry({
      heroStart: finiteNumber(heroRect.top, 'heroRect.top') + scroll,
      heroHeight,
      stickyHeight
    });
  }

  function defaultSchedule(callback) {
    if (root && typeof root.requestAnimationFrame === 'function') {
      return { type: 'raf', id: root.requestAnimationFrame(callback) };
    }
    return { type: 'timeout', id: setTimeout(callback, 0) };
  }

  function defaultCancel(handle) {
    if (!handle) return;
    if (handle.type === 'raf' && root && typeof root.cancelAnimationFrame === 'function') {
      root.cancelAnimationFrame(handle.id);
      return;
    }
    if (handle.type === 'timeout') clearTimeout(handle.id);
  }

  function createSeekCoalescer(video, options) {
    if (!video || typeof video.addEventListener !== 'function') {
      throw new TypeError('video must provide addEventListener()');
    }

    const settings = options || {};
    const fps = positiveNumber(settings.fps, 'fps');
    const frameCount = positiveInteger(settings.frameCount, 'frameCount');
    const toleranceFrames = settings.toleranceFrames === undefined
      ? 0.45
      : clamp(settings.toleranceFrames, 0, 0.5);
    const toleranceSeconds = toleranceFrames / fps;
    // Chrome can resolve a seek made exactly on a frame timestamp to the next
    // decoded frame. Aim one millisecond before the boundary while staying
    // well inside the accepted frame tolerance. This prevents a repeating
    // display pattern of "skip one frame, then repeat one frame" during scrub.
    const seekBoundaryGuardSeconds = settings.seekBoundaryGuardSeconds === undefined
      ? Math.min(0.001, 0.1 / fps)
      : clamp(settings.seekBoundaryGuardSeconds, 0, toleranceSeconds);
    const schedule = typeof settings.schedule === 'function' ? settings.schedule : defaultSchedule;
    const cancel = typeof settings.cancel === 'function' ? settings.cancel : defaultCancel;
    const onSeekStart = typeof settings.onSeekStart === 'function' ? settings.onSeekStart : null;
    const onSettled = typeof settings.onSettled === 'function' ? settings.onSettled : null;
    const maxStepFrames = settings.maxStepFrames === undefined
      ? Infinity
      : Math.min(frameCount - 1, positiveInteger(settings.maxStepFrames, 'maxStepFrames'));

    let desiredFrame = clampFrame(Math.round((Number(video.currentTime) || 0) * fps), frameCount);
    let activeFrame = null;
    let presentedFrame = desiredFrame;
    let seekInFlight = false;
    let scheduledHandle = null;
    let destroyed = false;

    function pauseVideo() {
      if (!video.paused && typeof video.pause === 'function') video.pause();
    }

    function isAtFrame(frame) {
      const currentTime = Number(video.currentTime);
      return Number.isFinite(currentTime)
        && Math.abs(currentTime - frameToTime(frame, fps, frameCount)) <= toleranceSeconds;
    }

    function requestFlush() {
      if (destroyed || seekInFlight || scheduledHandle !== null) return;
      scheduledHandle = schedule(flush);
    }

    function nextFrameTowardTarget() {
      if (!Number.isFinite(maxStepFrames)) return desiredFrame;
      const distance = desiredFrame - presentedFrame;
      if (Math.abs(distance) <= maxStepFrames) return desiredFrame;
      return presentedFrame + Math.sign(distance) * maxStepFrames;
    }

    function flush() {
      scheduledHandle = null;
      if (destroyed || seekInFlight) return;

      pauseVideo();
      const frame = nextFrameTowardTarget();
      if (isAtFrame(frame)) {
        presentedFrame = frame;
        if (onSettled) onSettled(frame, frameToTime(frame, fps, frameCount));
        return;
      }

      activeFrame = frame;
      seekInFlight = true;
      const targetTime = frameToTime(frame, fps, frameCount);
      if (onSeekStart) onSeekStart(frame, targetTime);
      video.currentTime = Math.max(0, targetTime - seekBoundaryGuardSeconds);
    }

    function handleSeeked() {
      if (destroyed) return;
      pauseVideo();

      if (seekInFlight) {
        presentedFrame = activeFrame;
        seekInFlight = false;
        activeFrame = null;
        if (onSettled) {
          onSettled(presentedFrame, frameToTime(presentedFrame, fps, frameCount));
        }
      }

      if (!isAtFrame(desiredFrame)) requestFlush();
      else presentedFrame = desiredFrame;
    }

    function handlePlay() {
      pauseVideo();
    }

    function setFrame(frame) {
      if (destroyed) return desiredFrame;
      desiredFrame = clampFrame(frame, frameCount);
      pauseVideo();
      requestFlush();
      return desiredFrame;
    }

    function setProgress(progress) {
      return setFrame(progressToFrame(progress, frameCount));
    }

    function getState() {
      return Object.freeze({
        desiredFrame,
        activeFrame,
        presentedFrame,
        seekInFlight,
        flushScheduled: scheduledHandle !== null,
        maxStepFrames,
        seekBoundaryGuardSeconds,
        targetTime: frameToTime(desiredFrame, fps, frameCount),
        destroyed
      });
    }

    function destroy() {
      if (destroyed) return;
      destroyed = true;
      if (scheduledHandle !== null) {
        cancel(scheduledHandle);
        scheduledHandle = null;
      }
      if (typeof video.removeEventListener === 'function') {
        video.removeEventListener('seeked', handleSeeked);
        video.removeEventListener('play', handlePlay);
      }
    }

    video.addEventListener('seeked', handleSeeked);
    video.addEventListener('play', handlePlay);
    pauseVideo();

    return Object.freeze({
      setFrame,
      setProgress,
      flush,
      getState,
      destroy
    });
  }

  return Object.freeze({
    clamp,
    clamp01,
    clampFrame,
    progressToFrame,
    frameToTime,
    progressToTime,
    createScrollGeometry,
    progressFromScroll,
    measureScrollGeometry,
    createSeekCoalescer
  });
});
