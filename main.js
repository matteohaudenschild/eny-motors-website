/* ENY Motors – main.js
   Hero: the fully preloaded HD master remains the visible layer and runs at
   its real 1× speed only while wheel/touch/key input stays active. It pauses
   in place after roughly 80–100 ms of inactivity, with no catch-up or layer
   handoff. Desktop and mobile use separate manifest compositions.
*/
(() => {
'use strict';
const $ = (s, r = document) => r.querySelector(s);
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const easeOut = t => 1 - Math.pow(1 - t, 3);
const params = new URLSearchParams(location.search);

/* ===================================================== SOUND (WebAudio synth, no files) */
const Sound = {
  ctx: null, on: false, master: null, noiseBuf: null,
  init() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain(); this.master.gain.value = .7; this.master.connect(this.ctx.destination);
    const len = this.ctx.sampleRate * 3, b = this.ctx.createBuffer(1, len, this.ctx.sampleRate), d = b.getChannelData(0);
    let last = 0; for (let i = 0; i < len; i++) { const w = Math.random() * 2 - 1; d[i] = w; }
    this.noiseBuf = b;
    this.brownBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const bd = this.brownBuf.getChannelData(0);
    for (let i = 0; i < len; i++) { last = (last + .02 * (Math.random() * 2 - 1)) / 1.02; bd[i] = last * 3.5; }
  },
  set(v) { this.on = v; if (v) { this.init(); this.ctx && this.ctx.resume(); } $('#soundBtn').setAttribute('aria-pressed', v); },
  _noise(buf, dur, filterType, freq, gainPeak, attack = .05, q = .7) {
    const c = this.ctx, t = c.currentTime, s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    s.buffer = buf; s.loop = true; f.type = filterType; f.frequency.value = freq; f.Q.value = q;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gainPeak, t + attack);
    g.gain.setValueAtTime(gainPeak, t + dur * .7); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
    s.connect(f).connect(g).connect(this.master); s.start(t); s.stop(t + dur + .05);
    return { f, g, t };
  },
  rumble() { // roll-up door: low rumble + chain rattle
    if (!this.on || !this.ctx) return;
    const c = this.ctx, t = c.currentTime, dur = 1.7;
    this._noise(this.brownBuf, dur, 'lowpass', 260, .9, .08);
    const r = this._noise(this.noiseBuf, dur, 'bandpass', 1800, .12, .05, 3);
    const lfo = c.createOscillator(), lg = c.createGain(); lfo.frequency.value = 22; lg.gain.value = .1;
    lfo.connect(lg).connect(r.g.gain); lfo.start(t); lfo.stop(t + dur);
    const clunk = c.createOscillator(), cg = c.createGain(); clunk.type = 'sine';
    clunk.frequency.setValueAtTime(90, t + dur - .05); clunk.frequency.exponentialRampToValueAtTime(40, t + dur + .25);
    cg.gain.setValueAtTime(0, t + dur - .05); cg.gain.linearRampToValueAtTime(.6, t + dur); cg.gain.exponentialRampToValueAtTime(.001, t + dur + .3);
    clunk.connect(cg).connect(this.master); clunk.start(t + dur - .05); clunk.stop(t + dur + .35);
  },
  engine(out = false) {
    if (!this.on || !this.ctx) return;
    const c = this.ctx, t = c.currentTime, dur = out ? 2.2 : 1.8;
    const o = c.createOscillator(), o2 = c.createOscillator(), f = c.createBiquadFilter(), g = c.createGain();
    o.type = 'sawtooth'; o2.type = 'square';
    o.frequency.setValueAtTime(out ? 48 : 55, t); o.frequency.linearRampToValueAtTime(out ? 110 : 38, t + dur);
    o2.frequency.setValueAtTime(out ? 24 : 27, t); o2.frequency.linearRampToValueAtTime(out ? 55 : 19, t + dur);
    f.type = 'lowpass'; f.frequency.value = 380;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(out ? .32 : .22, t + .3); g.gain.exponentialRampToValueAtTime(.001, t + dur);
    o.connect(f); o2.connect(f); f.connect(g).connect(this.master);
    o.start(t); o2.start(t); o.stop(t + dur); o2.stop(t + dur);
  },
  hiss(dur = 2.6, vol = .35) { if (this.on && this.ctx) this._noise(this.noiseBuf, dur, 'highpass', 3200, vol, .15); },
  whoosh() {
    if (!this.on || !this.ctx) return;
    const n = this._noise(this.noiseBuf, 1, 'bandpass', 400, .5, .3, 1.2);
    n.f.frequency.setValueAtTime(300, n.t); n.f.frequency.exponentialRampToValueAtTime(3000, n.t + .9);
  },
  ding() {
    if (!this.on || !this.ctx) return;
    const c = this.ctx, t = c.currentTime;
    [[1318.5, .35], [1975.5, .18], [2637, .08]].forEach(([fr, v], i) => {
      const o = c.createOscillator(), g = c.createGain(); o.type = 'sine'; o.frequency.value = fr;
      g.gain.setValueAtTime(0, t + i * .004); g.gain.linearRampToValueAtTime(v, t + .01); g.gain.exponentialRampToValueAtTime(.0001, t + 1.8);
      o.connect(g).connect(this.master); o.start(t); o.stop(t + 1.9);
    });
  },
  squeak() { if (this.on && this.ctx) this._noise(this.noiseBuf, .18, 'bandpass', 2400 + Math.random() * 1600, .05, .02, 8); }
};
$('#soundBtn').addEventListener('click', () => Sound.set(!Sound.on));

/* ===================================================== HERO VIDEO
   Forward motion is the visible native video at playbackRate 1. Reverse uses
   wall-clock currentTime steps on the GOP-2 master. Both stop on wheel idle. */
const HeroCore = window.ENYHeroCore;
// Seeking exactly onto a media timestamp can make Chromium resolve to the next
// decoded frame. A 1 ms pre-boundary guard keeps every requested frame exact.
const HERO_SEEK_BOUNDARY_GUARD_SECONDS = 0.001;
const hero = $('#hero');
const heroSticky = $('.hero__sticky', hero);
const heroPoster = $('#heroPoster');
let heroVideo = $('#heroVideo');
const heroCanvas = $('#heroCanvas');
const beats = [...document.querySelectorAll('.beat')];
const progEl = $('#heroProgress');
const cue = $('#scrollCue');
const startBar = $('#startBar');
const startSound = $('#startSound');
const startMute = $('#startMute');
const startHint = $('.start__hint');

let heroManifest = null;
let heroMediaQuery = null;
let heroGeometry = null;
let activeVariant = null;
let activeVariantKey = null;
let activeObjectUrl = null;
let variantAbort = null;
let variantSerial = 0;
let renderRaf = 0;
let measureRaf = 0;
let currentProgress = 0;
let lastProgress = 0;
let lastRequestedFrame = -1;
let presentedFrame = -1;
let canvasPresentedFrame = -1;
const canvasFrameHistory = [];
const canvasPresentationHistory = [];
let targetFrame = -1;
let heroReady = false;
let heroCues = [];
let lenis = null;
let removeLenisScrollListener = null;
let heroDriveActive = false;
let heroInputFrame = 0;
let heroExpectedScrollY = null;
let heroExpectedScrollRaf = 0;
let heroTouchY = null;
let heroMotionRaf = 0;
let heroMotionActive = false;
let heroMotionDirection = 0;
let heroMotionMode = 'idle';
let heroMotionLastInputAt = 0;
let heroMotionStartedAt = 0;
let heroMotionStoppedAt = 0;
let heroMotionActiveMs = 0;
let heroMotionInputSerial = 0;
let heroIdleTimer = 0;
let heroReverseOriginAt = 0;
let heroReverseOriginTime = 0;
let heroVideoFrameCallbackId = 0;
let heroTimeUpdateVideo = null;
let heroTimeUpdateHandler = null;
let heroWheelPacketLastAt = -Infinity;
let heroWheelPacketDirection = 0;
let heroBoundaryDirection = 0;
let heroBoundaryLastInputAt = 0;
// Wheel packets are considered active until 160 ms after their latest event.
// The larger gate absorbs real mouse/remote event-delivery gaps without
// changing the media rate; it is still a short stop, not autoplay momentum.
// During that window the master advances at exactly one source second per
// wall-clock second. No wheel input means no media motion.
const HERO_INPUT_IDLE_MS = 160;
const HERO_DISCRETE_WHEEL_PIXELS = 120;
let lastHeroWheelDiagnostics = null;

function abortError() {
  try {
    return new DOMException('Aborted', 'AbortError');
  } catch (error) {
    const fallback = new Error('Aborted');
    fallback.name = 'AbortError';
    return fallback;
  }
}

function isAbortError(error) {
  return error && error.name === 'AbortError';
}

function setLoadProgress(progress) {
  startBar.style.width = Math.round(clamp(progress) * 100) + '%';
}

function validateVariant(name, value) {
  if (!value || typeof value !== 'object') throw new Error('Missing hero variant: ' + name);
  if (typeof value.src !== 'string' || typeof value.poster !== 'string') {
    throw new Error('Invalid media paths for hero variant: ' + name);
  }
  const fps = Number(value.fps);
  const frameCount = Number(value.frameCount);
  if (!Number.isFinite(fps) || fps <= 0 || !Number.isInteger(frameCount) || frameCount < 2) {
    throw new Error('Invalid timing for hero variant: ' + name);
  }
  return { ...value, fps, frameCount };
}

async function fetchEntireVideo(src, onProgress, signal) {
  const response = await fetch(src, { cache: 'force-cache', signal });
  if (!response.ok) throw new Error('Hero video request failed (' + response.status + '): ' + src);

  const contentType = response.headers.get('content-type') || 'video/mp4';
  const total = Number(response.headers.get('content-length')) || 0;
  if (!response.body || typeof response.body.getReader !== 'function') {
    const blob = await response.blob();
    onProgress(1, blob.size, blob.size);
    return blob;
  }

  const reader = response.body.getReader();
  const chunks = [];
  let loaded = 0;
  while (true) {
    if (signal.aborted) throw abortError();
    const part = await reader.read();
    if (part.done) break;
    chunks.push(part.value);
    loaded += part.value.byteLength;
    onProgress(total ? loaded / total : 0, loaded, total);
  }

  onProgress(1, loaded, total || loaded);
  return new Blob(chunks, { type: contentType });
}

function waitForMediaState(video, eventName, minimumReadyState, signal) {
  if (signal.aborted) return Promise.reject(abortError());
  if (video.readyState >= minimumReadyState) return Promise.resolve();

  return new Promise((resolve, reject) => {
    const cleanup = () => {
      video.removeEventListener(eventName, ready);
      video.removeEventListener('error', failed);
      signal.removeEventListener('abort', aborted);
    };
    const ready = () => {
      cleanup();
      resolve();
    };
    const failed = () => {
      cleanup();
      reject(new Error('The hero video could not be decoded.'));
    };
    const aborted = () => {
      cleanup();
      reject(abortError());
    };

    video.addEventListener(eventName, ready, { once: true });
    video.addEventListener('error', failed, { once: true });
    signal.addEventListener('abort', aborted, { once: true });
  });
}

async function waitForVideoReady(video, signal) {
  await waitForMediaState(video, 'loadedmetadata', 1, signal);
  await waitForMediaState(video, 'loadeddata', 2, signal);
  video.pause();
}

function seekPreparedVideo(video, time, fps, signal) {
  if (signal.aborted) return Promise.reject(abortError());
  video.pause();
  // Chromium can report readyState=4 at currentTime 0 before the first decoded
  // frame is actually drawable. Force a tiny in-frame seek on initial load so
  // the canvas never covers the real poster with an undecoded black frame.
  const forceInitialDecode = time <= 0 && (Number(video.currentTime) || 0) <= 0;
  if (!forceInitialDecode && Math.abs((Number(video.currentTime) || 0) - time) <= 0.45 / fps) {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    const cleanup = () => {
      video.removeEventListener('seeked', settled);
      video.removeEventListener('error', failed);
      signal.removeEventListener('abort', aborted);
    };
    const settled = () => {
      cleanup();
      video.pause();
      resolve();
    };
    const failed = () => {
      cleanup();
      reject(new Error('The hero video could not seek to its scroll frame.'));
    };
    const aborted = () => {
      cleanup();
      reject(abortError());
    };

    video.addEventListener('seeked', settled, { once: true });
    video.addEventListener('error', failed, { once: true });
    signal.addEventListener('abort', aborted, { once: true });
    try {
      video.currentTime = forceInitialDecode ? Math.min(0.25 / fps, video.duration || 0.25 / fps) : time;
    } catch (error) {
      cleanup();
      reject(error);
    }
  });
}

function createHeroVideo() {
  const video = document.createElement('video');
  video.className = 'hero__video';
  video.muted = true;
  video.defaultMuted = true;
  video.playsInline = true;
  video.preload = 'auto';
  video.tabIndex = -1;
  video.disablePictureInPicture = true;
  video.setAttribute('muted', '');
  video.setAttribute('playsinline', '');
  video.setAttribute('aria-label', 'A dirty Rolls-Royce Cullinan enters the ENY hand wash and exits clean');
  return video;
}

function afterPaint() {
  return new Promise(resolve => {
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      resolve();
    };
    requestAnimationFrame(() => requestAnimationFrame(finish));
    setTimeout(finish, 120);
  });
}

function selectedVariantKey() {
  return heroMediaQuery && heroMediaQuery.matches ? 'mobile' : 'desktop';
}

function cancelHeroFrameRunner() {
  if (heroVideoFrameCallbackId && heroVideo && typeof heroVideo.cancelVideoFrameCallback === 'function') {
    heroVideo.cancelVideoFrameCallback(heroVideoFrameCallbackId);
  }
  if (heroTimeUpdateVideo && heroTimeUpdateHandler) {
    heroTimeUpdateVideo.removeEventListener('timeupdate', heroTimeUpdateHandler);
    heroTimeUpdateVideo.removeEventListener('seeked', heroTimeUpdateHandler);
  }
  heroVideoFrameCallbackId = 0;
  heroTimeUpdateVideo = null;
  heroTimeUpdateHandler = null;
}

function heroProgressForFrame(frame) {
  if (!activeVariant || activeVariant.frameCount < 2) return 0;
  return HeroCore.clamp01(frame / (activeVariant.frameCount - 1));
}

function syncHeroScrollToPresentedFrame() {
  if (!heroDriveActive || !heroGeometry || !activeVariant || presentedFrame < 0) return;
  const y = heroGeometry.start + heroProgressForFrame(presentedFrame) * heroGeometry.range;
  heroExpectedScrollY = y;
  if (Math.abs(window.scrollY - y) > 0.5) window.scrollTo(0, y);
  if (heroExpectedScrollRaf) cancelAnimationFrame(heroExpectedScrollRaf);
  heroExpectedScrollRaf = requestAnimationFrame(() => {
    heroExpectedScrollRaf = requestAnimationFrame(() => {
      heroExpectedScrollRaf = 0;
      heroExpectedScrollY = null;
    });
  });
}

function commitPresentedHeroFrame(frame) {
  if (!activeVariant) return;
  presentedFrame = Math.max(0, Math.min(activeVariant.frameCount - 1, Math.round(frame)));
  if (!heroDriveActive) return;
  renderHeroPresentation(heroProgressForFrame(presentedFrame));
  syncHeroScrollToPresentedFrame();
}

function heroFrameForMediaTime(mediaTime) {
  if (!activeVariant) return 0;
  return Math.max(0, Math.min(
    activeVariant.frameCount - 1,
    Math.round((Number(mediaTime) || 0) * activeVariant.fps)
  ));
}

function rememberLiveHeroFrame(frame, now = performance.now(), mediaTime = null) {
  if (canvasFrameHistory.at(-1) !== frame) {
    canvasFrameHistory.push(frame);
    canvasPresentationHistory.push({
      frame,
      now,
      mediaTime: Number.isFinite(Number(mediaTime)) ? Number(mediaTime) : null,
      mode: heroMotionMode
    });
    if (canvasFrameHistory.length > 1200) canvasFrameHistory.splice(0, 600);
    if (canvasPresentationHistory.length > 1200) canvasPresentationHistory.splice(0, 600);
  }
}

function showHeroVideo() {
  if (!heroVideo || !heroCanvas) return;
  heroVideo.classList.add('is-ready', 'is-scrub-visible');
  heroCanvas.classList.remove('is-ready');
  heroCanvas.classList.add('is-scrub-hidden');
}

function clearHeroBoundaryLock() {
  heroBoundaryDirection = 0;
  heroBoundaryLastInputAt = 0;
}

function resetHeroGesturePacket() {
  heroWheelPacketLastAt = -Infinity;
  heroWheelPacketDirection = 0;
}

function settleHeroBoundary(frame) {
  if (!activeVariant) return;
  const lastFrame = activeVariant.frameCount - 1;
  if (frame <= 0) heroBoundaryDirection = -1;
  else if (frame >= lastFrame) heroBoundaryDirection = 1;
  else return;
  heroBoundaryLastInputAt = heroMotionLastInputAt || performance.now();
}

function stopHeroMotion(options = {}) {
  const wasActive = heroMotionActive;
  if (heroIdleTimer) clearTimeout(heroIdleTimer);
  heroIdleTimer = 0;
  heroMotionActive = false;
  if (heroMotionRaf) cancelAnimationFrame(heroMotionRaf);
  heroMotionRaf = 0;
  heroMotionDirection = 0;
  heroMotionMode = 'idle';
  heroMotionStoppedAt = performance.now();
  if (wasActive && heroMotionStartedAt > 0) {
    heroMotionActiveMs += Math.max(0, heroMotionStoppedAt - heroMotionStartedAt);
  }
  if (heroVideo) heroVideo.pause();

  if (options.clearBoundary) clearHeroBoundaryLock();
  if (options.resetGesture) resetHeroGesturePacket();
  if (heroVideo && activeVariant) {
    const frame = heroFrameForMediaTime(heroVideo.currentTime);
    targetFrame = frame;
    heroInputFrame = frame;
    if (frame !== presentedFrame) {
      rememberLiveHeroFrame(frame, heroMotionStoppedAt, heroVideo.currentTime);
      commitPresentedHeroFrame(frame);
    }
    settleHeroBoundary(frame);
  }
  return wasActive;
}

function armHeroIdleStop() {
  if (heroIdleTimer) clearTimeout(heroIdleTimer);
  heroIdleTimer = setTimeout(() => stopHeroMotion({ reason: 'input-idle' }), HERO_INPUT_IDLE_MS);
}

function heroReverseLoop(now) {
  heroMotionRaf = 0;
  if (!heroMotionActive || heroMotionMode !== 'reverse' || !heroVideo || !activeVariant) return;
  const elapsed = Math.max(0, (now - heroReverseOriginAt) / 1000);
  const targetTime = Math.max(0, heroReverseOriginTime - elapsed);
  if (targetTime <= 0) {
    heroVideo.currentTime = 0;
    stopHeroMotion({ reason: 'start-boundary' });
    return;
  }
  heroVideo.currentTime = targetTime;
  heroMotionRaf = requestAnimationFrame(heroReverseLoop);
}

function startHeroForward() {
  if (!heroVideo || !activeVariant) return false;
  const wasActive = heroMotionActive;
  if (heroMotionRaf) cancelAnimationFrame(heroMotionRaf);
  heroMotionRaf = 0;
  const lastFrame = activeVariant.frameCount - 1;
  if (heroFrameForMediaTime(heroVideo.currentTime) >= lastFrame) {
    stopHeroMotion({ reason: 'end-boundary' });
    return false;
  }
  showHeroVideo();
  heroMotionActive = true;
  if (!wasActive) heroMotionStartedAt = performance.now();
  heroMotionDirection = 1;
  heroMotionMode = 'forward';
  heroVideo.playbackRate = 1;
  const started = heroVideo.play();
  if (started && typeof started.catch === 'function') {
    started.catch(error => {
      if (error && error.name === 'AbortError') return;
      console.warn('Hero natural-speed playback failed:', error);
      stopHeroMotion({ reason: 'play-error' });
    });
  }
  return true;
}

function startHeroReverse() {
  if (!heroVideo || !activeVariant) return false;
  const wasActive = heroMotionActive;
  heroVideo.pause();
  if (heroVideo.currentTime <= 0) {
    stopHeroMotion({ reason: 'start-boundary' });
    return false;
  }
  showHeroVideo();
  heroMotionActive = true;
  if (!wasActive) heroMotionStartedAt = performance.now();
  heroMotionDirection = -1;
  heroMotionMode = 'reverse';
  heroReverseOriginAt = performance.now();
  heroReverseOriginTime = heroVideo.currentTime;
  if (!heroMotionRaf) heroMotionRaf = requestAnimationFrame(heroReverseLoop);
  return true;
}

function startOrExtendHeroMotion(direction, inputAt = performance.now()) {
  if (!activeVariant || !direction) return false;
  const isNewGesture = direction !== heroWheelPacketDirection ||
    inputAt - heroWheelPacketLastAt > HERO_INPUT_IDLE_MS;

  heroWheelPacketLastAt = inputAt;
  heroWheelPacketDirection = direction;
  heroMotionLastInputAt = inputAt;
  if (isNewGesture) heroMotionInputSerial += 1;
  clearHeroBoundaryLock();
  armHeroIdleStop();
  if (direction > 0) {
    if (heroMotionMode !== 'forward' || heroVideo.paused) return startHeroForward();
    return true;
  }
  if (heroMotionMode !== 'reverse') return startHeroReverse();
  return true;
}
function installHeroFrameTracker(video, variant) {
  cancelHeroFrameRunner();
  const commitMediaTime = (now, mediaTime) => {
    if (video !== heroVideo || variant !== activeVariant) return;
    const frame = heroFrameForMediaTime(mediaTime);
    targetFrame = frame;
    heroInputFrame = frame;
    lastRequestedFrame = frame;
    rememberLiveHeroFrame(frame, now, mediaTime);
    commitPresentedHeroFrame(frame);
    const lastFrame = variant.frameCount - 1;
    if (heroMotionActive && heroMotionDirection > 0 && frame >= lastFrame) {
      stopHeroMotion({ reason: 'end-boundary' });
    } else if (heroMotionActive && heroMotionDirection < 0 && frame <= 0) {
      stopHeroMotion({ reason: 'start-boundary' });
    }
  };

  if (typeof video.requestVideoFrameCallback === 'function') {
    const collect = (now, metadata) => {
      if (video !== heroVideo || variant !== activeVariant) return;
      commitMediaTime(now, metadata.mediaTime);
      heroVideoFrameCallbackId = video.requestVideoFrameCallback(collect);
    };
    heroVideoFrameCallbackId = video.requestVideoFrameCallback(collect);
    return;
  }

  heroTimeUpdateVideo = video;
  heroTimeUpdateHandler = () => commitMediaTime(performance.now(), video.currentTime);
  video.addEventListener('timeupdate', heroTimeUpdateHandler);
  video.addEventListener('seeked', heroTimeUpdateHandler);
}

function renderHeroPresentation(progress) {
  const p = HeroCore.clamp01(progress);
  currentProgress = p;

  if (p > lastProgress) {
    for (const cuePoint of heroCues) {
      if (lastProgress < cuePoint.at && p >= cuePoint.at) cuePoint.play();
    }
  }
  lastProgress = p;

  for (const beat of beats) {
    beat.classList.toggle('is-on', p >= Number(beat.dataset.in) && p < Number(beat.dataset.out));
  }
  progEl.style.transform = 'scaleX(' + p + ')';
  cue.style.opacity = p > 0.02 ? 0 : 1;
}

function renderHero(progress) {
  const p = HeroCore.clamp01(progress);
  renderHeroPresentation(p);

  if (heroVideo && activeVariant) {
    const frame = HeroCore.progressToFrame(p, activeVariant.frameCount);
    heroInputFrame = frame;
    targetFrame = frame;
    lastRequestedFrame = frame;
    if (!heroDriveActive) {
      heroVideo.pause();
      showHeroVideo();
      const targetTime = HeroCore.frameToTime(frame, activeVariant.fps, activeVariant.frameCount);
      if (Math.abs((Number(heroVideo.currentTime) || 0) - targetTime) > 0.4 / activeVariant.fps) {
        try {
          heroVideo.currentTime = frame <= 0
            ? 0
            : Math.max(0, targetTime - HERO_SEEK_BOUNDARY_GUARD_SECONDS);
        } catch (error) {
          console.warn('Hero scroll-position seek failed:', error);
        }
      }
    }
  }
}

function readHeroProgress() {
  if (!heroGeometry) return 0;
  return HeroCore.progressFromScroll(window.scrollY, heroGeometry);
}

function flushHeroRender() {
  renderRaf = 0;
  if (heroDriveActive) return;
  renderHero(readHeroProgress());
}

function queueHeroRender() {
  if (!renderRaf) renderRaf = requestAnimationFrame(flushHeroRender);
}

function syncHeroToSmoothScroll() {
  // Lenis is already inside its animation frame here. Rendering immediately
  // avoids adding another RAF (and another visible frame of input latency).
  if (heroDriveActive) return;
  if (renderRaf) cancelAnimationFrame(renderRaf);
  renderRaf = 0;
  renderHero(readHeroProgress());
}

function measureHero() {
  measureRaf = 0;
  heroGeometry = HeroCore.measureScrollGeometry(hero, heroSticky, window.scrollY);
  if (heroDriveActive) syncHeroScrollToPresentedFrame();
  else queueHeroRender();
}

function queueHeroMeasure() {
  if (measureRaf) return;
  measureRaf = requestAnimationFrame(measureHero);
}

function normalizeHeroInputPixels(delta, deltaMode = 0) {
  const value = Number(delta) || 0;
  if (deltaMode === 1) return value * 16;
  if (deltaMode === 2) return value * Math.max(1, window.innerHeight);
  return value;
}

function normalizeHeroWheelPixels(event) {
  const deltaY = Number(event && event.deltaY) || 0;
  const legacyDelta = Number(event && (event.wheelDeltaY || event.wheelDelta)) || 0;
  const direction = Math.sign(deltaY || -legacyDelta);
  if (!direction) return 0;

  const deltaMode = Number(event && event.deltaMode) || 0;
  const rawPixels = Math.abs(normalizeHeroInputPixels(deltaY, deltaMode));
  const legacyNotches = Math.abs(legacyDelta) / 120;
  const pageInput = deltaMode === 2;
  const lineInput = deltaMode === 1;
  // Real Windows mouse wheels commonly report 40 or 53 px per notch. Chrome
  // also exposes the legacy ±120 wheelDelta for discrete wheels. Either signal
  // is enough to promote the event to one device-independent impulse.
  const looksDiscrete = lineInput || pageInput || legacyNotches >= 0.75 || rawPixels >= 24;

  let effectivePixels;
  let kind;
  if (pageInput) {
    effectivePixels = Math.max(HERO_DISCRETE_WHEEL_PIXELS, window.innerHeight);
    kind = 'page';
  } else if (looksDiscrete) {
    const notchCount = legacyNotches >= 0.75
      ? Math.max(1, Math.min(2, legacyNotches))
      : 1;
    effectivePixels = HERO_DISCRETE_WHEEL_PIXELS * notchCount;
    kind = 'wheel-notch';
  } else {
    effectivePixels = rawPixels;
    kind = 'trackpad';
  }

  lastHeroWheelDiagnostics = {
    rawDeltaY: deltaY,
    deltaMode,
    legacyDelta,
    rawPixels,
    effectivePixels: direction * effectivePixels,
    kind,
    playbackRate: 1,
    idleMs: HERO_INPUT_IDLE_MS
  };
  return direction * effectivePixels;
}

function isInsideHeroDriveRange() {
  if (!heroGeometry) return false;
  const tolerance = 4;
  return window.scrollY >= heroGeometry.start - tolerance &&
    window.scrollY <= heroGeometry.end + tolerance;
}

function activateHeroDrive() {
  if (heroDriveActive || !activeVariant) return;
  heroDriveActive = true;
  const fallbackFrame = HeroCore.progressToFrame(readHeroProgress(), activeVariant.frameCount);
  const baseFrame = targetFrame >= 0
    ? targetFrame
    : (presentedFrame >= 0 ? presentedFrame : fallbackFrame);
  heroInputFrame = Math.max(0, Math.min(activeVariant.frameCount - 1, baseFrame));
  if (lenis) lenis.stop();
  syncHeroScrollToPresentedFrame();
}

function releaseHeroDrive() {
  if (!heroDriveActive) return;
  stopHeroMotion({ clearBoundary: true, resetGesture: true });
  heroDriveActive = false;
  heroExpectedScrollY = null;
  if (heroExpectedScrollRaf) {
    cancelAnimationFrame(heroExpectedScrollRaf);
    heroExpectedScrollRaf = 0;
  }
  if (lenis) {
    lenis.start();
    lenis.scrollTo(window.scrollY, { immediate: true, force: true });
  }
  queueHeroRender();
}

function releaseHeroDriveAndScroll(pixels) {
  releaseHeroDrive();
  const maxScroll = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
  const destination = Math.max(0, Math.min(maxScroll, window.scrollY + pixels));
  if (lenis) lenis.scrollTo(destination, { immediate: true, force: true });
  else window.scrollTo(0, destination);
}

function shouldCaptureHeroDirection(direction) {
  if (!direction || !activeVariant || !isInsideHeroDriveRange()) return false;
  const lastFrame = activeVariant.frameCount - 1;
  const desired = targetFrame >= 0 ? targetFrame : HeroCore.progressToFrame(currentProgress, activeVariant.frameCount);
  const shown = presentedFrame >= 0 ? presentedFrame : desired;
  if (direction > 0) return desired < lastFrame || shown < lastFrame;
  return desired > 0 || shown > 0;
}

function preventHeroInput(event) {
  if (!event) return;
  event.preventDefault();
  event.stopImmediatePropagation();
}

function driveHeroWhileInputIsActive(pixelDelta, event) {
  if (!heroReady || !activeVariant || document.body.classList.contains('is-loading')) return false;
  const pixels = Math.max(-360, Math.min(360, Number(pixelDelta) || 0));
  const direction = Math.sign(pixels);
  if (!direction) return false;
  const now = performance.now();
  // Event timestamps preserve the hardware packet spacing even if a decode or
  // paint briefly delays JavaScript delivery on the main thread.
  const stampedAt = Number(event && event.timeStamp);
  const inputAt = Number.isFinite(stampedAt) && Math.abs(stampedAt - now) < 60_000
    ? stampedAt
    : now;

  if (!shouldCaptureHeroDirection(direction)) {
    if (!heroDriveActive) return false;

    // Events belonging to the roll that just reached frame 0/last frame are
    // swallowed. Only a genuinely new gesture after an idle gap may leave the
    // hero, so the section never auto-exits while the wheel is still spinning.
    if (heroBoundaryDirection === direction &&
        inputAt - heroBoundaryLastInputAt <= HERO_INPUT_IDLE_MS) {
      preventHeroInput(event);
      heroBoundaryLastInputAt = inputAt;
      return true;
    }

    preventHeroInput(event);
    releaseHeroDriveAndScroll(pixels);
    return true;
  }

  activateHeroDrive();
  preventHeroInput(event);
  startOrExtendHeroMotion(direction, inputAt);
  return true;
}

function driveHeroByPixels(pixelDelta, event) {
  return driveHeroWhileInputIsActive(pixelDelta, event);
}

function handleHeroWheel(event) {
  if (event.ctrlKey) return;
  driveHeroWhileInputIsActive(normalizeHeroWheelPixels(event), event);
}

function handleHeroTouchStart(event) {
  heroTouchY = event.touches.length === 1 ? event.touches[0].clientY : null;
}

function handleHeroTouchMove(event) {
  if (heroTouchY === null || event.touches.length !== 1) return;
  const nextY = event.touches[0].clientY;
  const delta = heroTouchY - nextY;
  heroTouchY = nextY;
  driveHeroByPixels(delta, event);
}

function handleHeroKeyInput(event) {
  if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return;
  const target = event.target;
  if (target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test(target.tagName))) return;

  let pixels = 0;
  if (event.key === 'ArrowDown') pixels = 120;
  else if (event.key === 'ArrowUp') pixels = -120;
  else if (event.key === 'PageDown' || (event.key === ' ' && !event.shiftKey)) pixels = 300;
  else if (event.key === 'PageUp' || (event.key === ' ' && event.shiftKey)) pixels = -300;
  if (pixels) driveHeroByPixels(pixels, event);
}

function handleHeroDocumentScroll() {
  if (heroDriveActive && heroGeometry && activeVariant && presentedFrame >= 0) {
    const expected = heroGeometry.start + heroProgressForFrame(presentedFrame) * heroGeometry.range;
    const isExpected = Math.abs(window.scrollY - expected) <= 2 ||
      (heroExpectedScrollY !== null && Math.abs(window.scrollY - heroExpectedScrollY) <= 2);
    if (isExpected) return;
    releaseHeroDrive();
  }
  queueHeroRender();
}

function heroDebugState() {
  return {
    active: heroDriveActive,
    motionActive: heroMotionActive,
    motionDirection: heroMotionDirection,
    motionMode: heroMotionMode,
    idleMs: HERO_INPUT_IDLE_MS,
    inputSerial: heroMotionInputSerial,
    decoderMode: 'visible-native-1x-forward-gop2-reverse',
    videoPaused: heroVideo && heroVideo.paused,
    videoTime: heroVideo && heroVideo.currentTime,
    playbackRate: heroVideo && heroVideo.playbackRate,
    videoSeeking: heroVideo && heroVideo.seeking,
    lastInputAt: heroMotionLastInputAt,
    motionStartedAt: heroMotionStartedAt,
    motionStoppedAt: heroMotionStoppedAt,
    activeMotionMs: heroMotionActiveMs + (heroMotionActive
      ? Math.max(0, performance.now() - heroMotionStartedAt)
      : 0),
    targetFrame,
    presentedFrame,
    canvasPresentedFrame,
    requestedFrame: lastRequestedFrame,
    inputFrame: heroInputFrame,
    progress: currentProgress,
    scrollY: window.scrollY,
    heroStart: heroGeometry && heroGeometry.start,
    heroEnd: heroGeometry && heroGeometry.end,
    frameCount: activeVariant && activeVariant.frameCount,
    boundaryDirection: heroBoundaryDirection,
    lastWheel: lastHeroWheelDiagnostics
  };
}

async function installVariant(key, options = {}) {
  const initial = Boolean(options.initial);
  const variant = heroManifest[key];
  const serial = ++variantSerial;
  if (variantAbort) variantAbort.abort();
  const controller = new AbortController();
  variantAbort = controller;
  const signal = controller.signal;

  let objectUrl = null;
  let candidate = null;
  let inserted = false;

  try {
    const blob = await fetchEntireVideo(variant.src, options.onProgress || (() => {}), signal);
    if (signal.aborted || serial !== variantSerial) throw abortError();

    objectUrl = URL.createObjectURL(blob);
    candidate = initial ? heroVideo : createHeroVideo();
    if (!candidate) throw new Error('Missing #heroVideo element.');

    if (!initial) {
      const overlay = $('.hero__vignette', heroSticky);
      heroSticky.insertBefore(candidate, overlay);
      inserted = true;
    }

    candidate.src = objectUrl;
    candidate.load();
    await waitForVideoReady(candidate, signal);

    let installationFrame = HeroCore.progressToFrame(currentProgress, variant.frameCount);
    await seekPreparedVideo(candidate, Math.max(0,
      HeroCore.frameToTime(installationFrame, variant.fps, variant.frameCount) - HERO_SEEK_BOUNDARY_GUARD_SECONDS
    ), variant.fps, signal);
    const latestFrame = HeroCore.progressToFrame(currentProgress, variant.frameCount);
    if (latestFrame !== installationFrame) {
      installationFrame = latestFrame;
      await seekPreparedVideo(candidate, Math.max(0,
        HeroCore.frameToTime(installationFrame, variant.fps, variant.frameCount) - HERO_SEEK_BOUNDARY_GUARD_SECONDS
      ), variant.fps, signal);
    }

    if (signal.aborted || serial !== variantSerial) throw abortError();
    candidate.classList.add('is-ready');
    await afterPaint();
    if (signal.aborted || serial !== variantSerial) throw abortError();

    const previousVideo = heroVideo;
    const previousObjectUrl = activeObjectUrl;

    if (!initial) {
      previousVideo.removeAttribute('id');
      candidate.id = 'heroVideo';
    }

    stopHeroMotion({ clearBoundary: true });
    cancelHeroFrameRunner();
    heroVideo = candidate;
    activeObjectUrl = objectUrl;
    objectUrl = null;
    activeVariant = variant;
    activeVariantKey = key;
    lastRequestedFrame = installationFrame;
    presentedFrame = installationFrame;
    canvasPresentedFrame = -1;
    targetFrame = installationFrame;
    heroInputFrame = installationFrame;

    candidate.playbackRate = 1;
    candidate.classList.add('is-ready', 'is-scrub-visible');
    heroCanvas.classList.remove('is-ready');
    heroCanvas.classList.add('is-scrub-hidden');
    if (heroCanvas.width !== variant.width) heroCanvas.width = variant.width;
    if (heroCanvas.height !== variant.height) heroCanvas.height = variant.height;
    installHeroFrameTracker(heroVideo, activeVariant);
    candidate.onended = () => stopHeroMotion({ reason: 'ended' });

    if (!initial) {
      previousVideo.remove();
      if (previousObjectUrl) URL.revokeObjectURL(previousObjectUrl);
    }

    queueHeroRender({ snap: true });
    return true;
  } catch (error) {
    if (inserted && candidate) candidate.remove();
    if (initial && candidate) {
      candidate.classList.remove('is-ready');
      candidate.removeAttribute('src');
      candidate.load();
    }
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    if (isAbortError(error)) return false;
    throw error;
  }
}

function initSmoothScroll() {
  if (lenis || typeof window.Lenis !== 'function') return;

  lenis = new window.Lenis({
    autoRaf: true,
    lerp: 0.24,
    smoothWheel: true,
    syncTouch: false,
    anchors: true,
    autoToggle: true,
    respectReducedMotion: true,
    stopInertiaOnNavigate: true
  });
  removeLenisScrollListener = lenis.on('scroll', syncHeroToSmoothScroll);
}

function configureManifest(manifest) {
  heroManifest = {
    ...manifest,
    desktop: validateVariant('desktop', manifest.desktop),
    mobile: validateVariant('mobile', manifest.mobile)
  };

  const posterSource = $('source', heroPoster);
  const posterImage = $('img', heroPoster);
  if (posterSource) {
    posterSource.media = heroManifest.breakpoint || '(max-width: 760px)';
    posterSource.srcset = heroManifest.mobile.poster;
  }
  if (posterImage) posterImage.src = heroManifest.desktop.poster;

  if (Array.isArray(manifest.beats)) {
    manifest.beats.forEach((range, index) => {
      if (!beats[index] || !Array.isArray(range) || range.length < 2) return;
      beats[index].dataset.in = Number(range[0]);
      beats[index].dataset.out = Number(range[1]);
    });
  }

  heroCues = Array.isArray(manifest.cues)
    ? manifest.cues
      .filter(item => item && Number.isFinite(Number(item.at)) && typeof Sound[item.sound] === 'function')
      .map(item => ({
        at: HeroCore.clamp01(Number(item.at)),
        play: () => Sound[item.sound].apply(Sound, Array.isArray(item.args) ? item.args : [])
      }))
      .sort((a, b) => a.at - b.at)
    : [];
}

function leaveStart(withSound) {
  if (!heroReady) return;
  if (withSound) Sound.set(true);
  $('#start').classList.add('is-gone');
  document.body.classList.remove('is-loading');
  initSmoothScroll();
  if (lenis) lenis.resize();
  queueHeroMeasure();
  queueHeroRender({ snap: true });
}

function enableStart() {
  heroReady = true;
  setLoadProgress(1);
  startSound.disabled = false;
  startMute.disabled = false;
  startSound.textContent = 'Enter with sound';
  startSound.onclick = () => leaveStart(true);
  startMute.onclick = () => leaveStart(false);
  if (params.has('skip')) leaveStart(false);
}

function showBootError(error) {
  console.error('Hero video boot failed:', error);
  heroReady = false;
  setLoadProgress(0);
  startHint.textContent = 'Hero video could not load';
  startSound.disabled = false;
  startMute.disabled = true;
  startSound.textContent = 'Retry video';
  startSound.onclick = () => location.reload();
}

function handleVariantChange() {
  const key = selectedVariantKey();
  if (key === activeVariantKey) {
    variantSerial += 1;
    if (variantAbort) variantAbort.abort();
    return;
  }
  installVariant(key).catch(error => {
    if (!isAbortError(error)) console.error('Hero variant switch failed:', error);
  });
}

async function boot() {
  try {
    if (!HeroCore) throw new Error('The deterministic hero scroll core is missing.');
    if (!hero || !heroSticky || !heroPoster || !heroVideo) throw new Error('The hero video markup is incomplete.');

    setLoadProgress(0.02);
    const response = await fetch('assets/hero/(C)-hero-video-manifest.json', { cache: 'no-cache' });
    if (!response.ok) throw new Error('Hero manifest request failed (' + response.status + ').');
    configureManifest(await response.json());

    heroMediaQuery = matchMedia(heroManifest.breakpoint || '(max-width: 760px)');
    measureHero();
    const key = selectedVariantKey();
    const loaded = await installVariant(key, {
      initial: true,
      onProgress: fraction => setLoadProgress(0.05 + clamp(fraction) * 0.95)
    });
    if (!loaded) throw abortError();

    if (typeof heroMediaQuery.addEventListener === 'function') {
      heroMediaQuery.addEventListener('change', handleVariantChange);
    } else {
      heroMediaQuery.addListener(handleVariantChange);
    }

    enableStart();
    if (selectedVariantKey() !== activeVariantKey) handleVariantChange();
  } catch (error) {
    if (!isAbortError(error)) showBootError(error);
  }
}

addEventListener('wheel', handleHeroWheel, { capture: true, passive: false });
addEventListener('touchstart', handleHeroTouchStart, { capture: true, passive: true });
addEventListener('touchmove', handleHeroTouchMove, { capture: true, passive: false });
addEventListener('touchend', () => { heroTouchY = null; stopHeroMotion(); }, { capture: true, passive: true });
addEventListener('touchcancel', () => { heroTouchY = null; stopHeroMotion(); }, { capture: true, passive: true });
addEventListener('keydown', handleHeroKeyInput, { capture: true });
addEventListener('scroll', handleHeroDocumentScroll, { passive: true });
addEventListener('resize', queueHeroMeasure, { passive: true });
if ('ResizeObserver' in window) {
  const heroResizeObserver = new ResizeObserver(queueHeroMeasure);
  heroResizeObserver.observe(hero);
  heroResizeObserver.observe(heroSticky);
}
if (document.fonts && document.fonts.ready) document.fonts.ready.then(queueHeroMeasure);
addEventListener('keydown', event => {
  if (event.key === 'Enter' && document.body.classList.contains('is-loading') && heroReady) {
    leaveStart(true);
  }
});
document.addEventListener('click', event => {
  if (event.target.closest && event.target.closest('a[href^="#"]')) releaseHeroDrive();
}, { capture: true });
addEventListener('pageshow', event => {
  if (!event.persisted) return;
  releaseHeroDrive();
  heroVideo.pause();
  queueHeroMeasure();
  queueHeroRender({ snap: true });
});
addEventListener('pagehide', event => {
  // A BFCache page remains alive and must retain its in-memory Blob URL.
  if (event.persisted) return;
  variantSerial += 1;
  if (variantAbort) variantAbort.abort();
  stopHeroMotion({ clearBoundary: true });
  cancelHeroFrameRunner();
  if (removeLenisScrollListener) removeLenisScrollListener();
  if (lenis) lenis.destroy();
  if (activeObjectUrl) URL.revokeObjectURL(activeObjectUrl);
});

if (params.has('debug')) {
  window.__ENY_HERO_DEBUG__ = Object.freeze({
    getState: heroDebugState,
    getCanvasHistory: () => canvasFrameHistory.slice(),
    getPresentations: () => canvasPresentationHistory.map(item => ({ ...item })),
    resetCanvasHistory: () => {
      canvasFrameHistory.length = 0;
      canvasPresentationHistory.length = 0;
    },
    driveByPixels: pixels => driveHeroByPixels(pixels),
    driveWhileActive: pixels => driveHeroWhileInputIsActive(pixels),
    stopMotion: () => stopHeroMotion(),
    normalizeWheel: input => normalizeHeroWheelPixels(input)
  });
}

boot();

/* ===================================================== SELECT YOUR WASH */
const PKGS = [
  { n: '#1', tier: 'Basic', name: 'Basic Wash', price: 80, c: '#5ef2d3', img: 'assets/photos/09-gle43-blue-front.jpg',
    items: ['Exterior hand wash', 'Rims & tires cleaned', 'Tire dressing', 'Interior vacuum', 'Interior wipe down', 'Door jambs', 'Floor mats', 'Trunk clean'] },
  { n: '#2', tier: 'Basic', name: 'Basic Interior Detail', price: 200, c: '#7fd8ff', img: 'assets/photos/11-maybach-gls-inside.jpg',
    items: ['Full interior vacuum', 'Dashboard, doors & center console', 'Light seat cleaning', 'Carpets & mats cleaned', 'Interior windows', 'Trunk vacuum', 'Tire dressing', 'Trunk clean'] },
  { n: '#3', tier: 'Luxury · Most popular', name: 'Luxury Wash', price: 100, c: '#ff8a2a', img: 'assets/photos/15-maybach-steam-inside.jpg',
    items: ['3-month paint sealant', 'Iron decontamination wash', 'Undercarriage wash', 'Steam-sanitized touch points', 'Engine steam clean*', 'Leather conditioner*', 'Door jambs', 'Floor mats', 'Trunk clean'],
    note: '* on request' },
  { n: '#4', tier: 'Luxury · Full restoration', name: 'Luxury Interior Detail', price: 400, c: '#ff4fa0', img: 'assets/photos/12-maybach-s-twotone-street.jpg',
    items: ['Seat removal', 'Deep shampoo & extraction', 'Carpet extraction', 'Stain removal treatment', 'Full clay bar treatment', '3-month paint sealant', 'Iron decontamination wash', 'Steam clean', 'Engine steam clean*'],
    note: 'Service time 3–5 hours · * on request' }
];
const list = $('#pkgList'), pImg = $('#pkgImg'), pPrice = $('#pkgPrice'), stage = $('.select');
let cur = -1, priceShown = 0, priceAnim = 0;
PKGS.forEach((k, i) => {
  const b = document.createElement('button');
  b.className = 'pkg'; b.setAttribute('role', 'tab'); b.style.setProperty('--c', k.c);
  b.innerHTML = `<span class="pkg__n">${k.n.slice(1)}</span><span class="pkg__t"><b>${k.name}</b><small>${k.tier}</small></span><span class="pkg__p">$${k.price}</span>`;
  b.onclick = () => pick(i, true);
  list.appendChild(b);
});
function pick(i, user) {
  if (i === cur) return; cur = i; const k = PKGS[i];
  [...list.children].forEach((b, j) => b.setAttribute('aria-selected', j === i));
  stage.style.setProperty('--c', k.c);
  $('#pkgTier').textContent = k.tier; $('#pkgName').textContent = k.name; $('#pkgNote').textContent = k.note || '';
  $('#pkgChips').innerHTML = k.items.map((t, j) => `<li style="animation-delay:${j * 45}ms">${t}</li>`).join('');
  pImg.classList.add('swap');
  setTimeout(() => { pImg.src = k.img; pImg.alt = k.name; pImg.onload = () => pImg.classList.remove('swap'); }, 180);
  const sh = $('.select__shine'); sh.classList.remove('go'); void sh.offsetWidth; sh.classList.add('go');
  const from = priceShown, to = k.price, t0 = performance.now(); cancelAnimationFrame(priceAnim);
  const run = t => { const q = easeOut(clamp((t - t0) / 700)); priceShown = Math.round(lerp(from, to, q)); pPrice.textContent = priceShown; if (q < 1) priceAnim = requestAnimationFrame(run); };
  priceAnim = requestAnimationFrame(run);
  if (user) { Sound.whoosh(); }
}
pick(2, false);
addEventListener('keydown', e => {
  const r = stage.getBoundingClientRect(); if (r.top > innerHeight * .6 || r.bottom < innerHeight * .4) return;
  if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); pick((cur + 1) % PKGS.length, true); }
  if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); pick((cur + PKGS.length - 1) % PKGS.length, true); }
});

/* ===================================================== WIPE IT CLEAN */
(() => {
  const box = $('#wipeBox'), cv = $('#wipeCanvas'), c = cv.getContext('2d');
  const meter = $('#wipeMeter'), pct = $('#wipePct'), done = $('#wipeDone'), hint = $('#wipeHint');
  const cursor = document.createElement('div'); cursor.className = 'wipe__cursor'; document.body.appendChild(cursor);
  let w, h, finished = false, last = null, lastCheck = 0;

  function dirty() {
    const r = box.getBoundingClientRect(); w = cv.width = Math.round(r.width); h = cv.height = Math.round(r.height);
    c.globalCompositeOperation = 'source-over';
    c.fillStyle = 'rgba(92,74,52,.82)'; c.fillRect(0, 0, w, h);
    const rnd = (a, b) => a + Math.random() * (b - a);
    for (let i = 0; i < 900; i++) { // grime blotches
      const x = rnd(0, w), y = rnd(0, h), r2 = rnd(4, 60), g = c.createRadialGradient(x, y, 0, x, y, r2);
      const col = Math.random() < .5 ? '60,45,30' : '130,110,80';
      g.addColorStop(0, `rgba(${col},${rnd(.15, .5)})`); g.addColorStop(1, `rgba(${col},0)`);
      c.fillStyle = g; c.beginPath(); c.arc(x, y, r2, 0, 7); c.fill();
    }
    for (let i = 0; i < 140; i++) { // mud splatter
      const x = rnd(0, w), y = rnd(h * .4, h); c.fillStyle = `rgba(48,34,20,${rnd(.4, .85)})`;
      c.beginPath(); c.arc(x, y, rnd(1, 7), 0, 7); c.fill();
    }
    for (let i = 0; i < 40; i++) { // rain streaks
      const x = rnd(0, w), y = rnd(0, h * .6); c.strokeStyle = `rgba(160,140,110,${rnd(.1, .3)})`; c.lineWidth = rnd(1, 3);
      c.beginPath(); c.moveTo(x, y); c.lineTo(x + rnd(-6, 6), y + rnd(40, 160)); c.stroke();
    }
    c.fillStyle = 'rgba(0,0,0,.25)'; c.font = `900 ${Math.round(w / 9)}px Inter, sans-serif`; c.textAlign = 'center';
    c.save(); c.translate(w / 2, h * .47); c.rotate(-.08); c.fillText('WASH ME', 0, 0); c.restore();
    finished = false; done.classList.remove('is-on'); hint.style.opacity = 1; cv.style.transition = ''; cv.style.opacity = 1; update(0);
  }
  function update(v) { meter.style.width = v + '%'; pct.textContent = v + '% clean'; }
  function stroke(x, y) {
    c.globalCompositeOperation = 'destination-out';
    const R = Math.max(34, w / 11);
    const seg2 = (ax, ay) => { const g = c.createRadialGradient(ax, ay, 0, ax, ay, R); g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(.6, 'rgba(0,0,0,.9)'); g.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = g; c.beginPath(); c.arc(ax, ay, R, 0, 7); c.fill(); };
    if (last) { const dx = x - last[0], dy = y - last[1], d = Math.hypot(dx, dy), n = Math.ceil(d / (R / 3)); for (let i = 1; i <= n; i++) seg2(last[0] + dx * i / n, last[1] + dy * i / n); }
    else seg2(x, y);
    last = [x, y];
    const now = performance.now();
    if (now - lastCheck > 160) { lastCheck = now; measure(); if (Math.random() < .5) Sound.squeak(); }
  }
  function measure() {
    const d = c.getImageData(0, 0, w, h).data; let clear = 0, tot = 0;
    for (let i = 3; i < d.length; i += 4 * 97) { tot++; if (d[i] < 60) clear++; }
    const v = Math.round(clear / tot * 100); update(v);
    if (v >= 70 && !finished) {
      finished = true; update(100); cv.style.transition = 'opacity .9s'; cv.style.opacity = 0;
      done.classList.add('is-on'); Sound.ding(); Sound.hiss(1, .15);
    }
  }
  const pos = e => { const r = cv.getBoundingClientRect(); return [(e.clientX - r.left) * w / r.width, (e.clientY - r.top) * h / r.height]; };
  let down = false;
  cv.addEventListener('pointerdown', e => { down = true; last = null; hint.style.opacity = 0; cv.setPointerCapture(e.pointerId); stroke(...pos(e)); });
  cv.addEventListener('pointermove', e => {
    cursor.style.left = e.clientX + 'px'; cursor.style.top = e.clientY + 'px';
    // mouse: wiping works on hover too (more fun); touch: while finger is down
    if (down || e.pointerType === 'mouse') { hint.style.opacity = 0; stroke(...pos(e)); }
  });
  ['pointerup', 'pointercancel'].forEach(t => cv.addEventListener(t, () => { down = false; last = null; }));
  cv.addEventListener('pointerleave', () => { last = null; cursor.style.opacity = 0; });
  cv.addEventListener('pointerenter', e => { if (e.pointerType === 'mouse') cursor.style.opacity = 1; });
  $('#wipeAgain').onclick = dirty;
  let rs; addEventListener('resize', () => { clearTimeout(rs); rs = setTimeout(() => { if (!finished) dirty(); }, 300); });
  dirty();
})();

/* ===================================================== SELF-SERVICE */
(() => {
  const r = $('#selfRange'), m = $('#selfMin'), u = $('#selfUsd');
  const set = () => { const v = +r.value; m.textContent = v; u.textContent = v; r.style.setProperty('--fill', ((v - 1) / 59 * 100) + '%'); };
  r.addEventListener('input', () => { set(); if (+r.value % 5 === 0) Sound.squeak(); }); set();
})();

/* ===================================================== THE LOT (horizontal on vertical scroll) */
(() => {
  const CARS = [
    { t: 'title' },
    { img: 'assets/photos/12-maybach-s-twotone-street.jpg', k: 'Mercedes-Maybach', n: 'S-Class Two-Tone' },
    { vid: 'bentley', k: 'Bentley', n: 'Continental GTC' },
    { img: 'assets/photos/06-cullinan-front.jpg', k: 'Rolls-Royce', n: 'Cullinan' },
    { vid: 'rolls-interior', k: 'Rolls-Royce', n: 'Interior detail' },
    { img: 'assets/photos/14-maybach-gls-night-front.jpg', k: 'Mercedes-Maybach', n: 'GLS 600' },
    { vid: 'g-wagon', k: 'Mercedes-AMG', n: 'G-Class' },
    { img: 'assets/photos/13-escalade-inside.jpg', k: 'Cadillac', n: 'Escalade' },
    { vid: 'apocalypse', k: 'Apocalypse', n: '6×6' },
    { img: 'assets/photos/20-bmw-e36-street.jpg', k: 'BMW', n: 'E36 Convertible' },
    { vid: 'foam-hall', k: 'Inside ENY', n: 'The wash hall' },
    { img: 'assets/photos/02-gle53-white-front.jpg', k: 'Mercedes-AMG', n: 'GLE' },
    { img: 'assets/photos/19-maybach-gls600-rear-night.jpg', k: 'Mercedes-Maybach', n: 'GLS 600' }
  ];
  const track = $('#lotTrack'), sec = $('#lot');
  CARS.forEach(x => {
    const d = document.createElement('div');
    if (x.t) { d.className = 'card card--title'; d.innerHTML = '<h2>Who pulled<br>in <span class="mint">lately.</span></h2>'; }
    else {
      d.className = 'card';
      d.innerHTML = (x.vid
        ? `<video src="assets/clips/${x.vid}.mp4" poster="assets/clips/${x.vid}.jpg" muted loop playsinline preload="none"></video>`
        : `<img src="${x.img}" alt="${x.k} ${x.n} at ENY Motors" loading="lazy">`) +
        `<div class="card__label"><small>${x.k}</small>${x.n}</div>`;
      d.addEventListener('pointermove', e => {
        const r = d.getBoundingClientRect(), dx = (e.clientX - r.left) / r.width - .5, dy = (e.clientY - r.top) / r.height - .5;
        d.style.transform = `perspective(900px) rotateY(${dx * 10}deg) rotateX(${-dy * 10}deg)`;
      });
      d.addEventListener('pointerleave', () => d.style.transform = '');
    }
    track.appendChild(d);
  });
  const vids = [...track.querySelectorAll('video')];
  const vo = new IntersectionObserver(es => es.forEach(e => e.isIntersecting ? e.target.play().catch(() => {}) : e.target.pause()), { threshold: .2 });
  vids.forEach(v => vo.observe(v));
  let tx = 0;
  const loop = () => {
    requestAnimationFrame(loop);
    const r = sec.getBoundingClientRect(); if (r.bottom < 0 || r.top > innerHeight) return;
    const p = clamp(-r.top / (r.height - innerHeight)), max = track.scrollWidth - innerWidth;
    tx += (-(p * max) - tx) * .12; track.style.transform = `translate3d(${tx}px,0,0)`;
  };
  loop();
})();

/* ===================================================== UPGRADES */
(() => {
  const T = [
    ['🕶️', 'Window Tint', 'Blocks 99%+ of harmful UV · 94% glare reduction', '#5ef2d3'],
    ['💎', 'Ceramic Tint', 'High optical clarity, minimal reflection', '#7fd8ff'],
    ['🛡️', 'Paint Protection Film', 'Self-healing · scratch & stain resistant', '#9b4dff'],
    ['🎨', 'Vehicle Wraps', 'Any color · 3M · Avery Dennison · XPEL', '#ff4fa0'],
    ['✨', 'Ceramic Coating', 'Deep gloss that stays', '#5ef2d3'],
    ['🔧', 'Powder Coating', 'Wheels in any finish', '#ff8a2a'],
    ['🔴', 'Calipers Painting', 'Color behind the spokes', '#ff3d3d'],
    ['🌌', 'Star Lights', 'A night sky in your headliner', '#9b4dff'],
    ['💡', 'Headlight Restoration', 'Clear lenses again', '#ffe14d'],
    ['🪞', 'Paint Correction', 'Polish out swirls & scratches', '#7fd8ff'],
    ['🚚', 'Commercial Wrap', 'Fleet wraps & printing', '#ff8a2a']
  ];
  const g = $('#moreGrid');
  T.forEach(([ic, b, s, col]) => {
    const t = document.createElement('div'); t.className = 'tile';
    t.style.setProperty('--tc', col + '55'); t.style.setProperty('--tcs', col);
    t.innerHTML = `<span class="tile__ic">${ic}</span><b>${b}</b><small>${s}</small>`;
    t.addEventListener('pointermove', e => { const r = t.getBoundingClientRect(); t.style.setProperty('--mx', (e.clientX - r.left) + 'px'); t.style.setProperty('--my', (e.clientY - r.top) + 'px'); });
    g.appendChild(t);
  });
})();

/* background clips: only play when visible */
(() => {
  const io = new IntersectionObserver(es => es.forEach(e => e.isIntersecting ? e.target.play().catch(() => {}) : e.target.pause()));
  document.querySelectorAll('.self__bg,.visit__bg').forEach(v => io.observe(v));
})();
})();
