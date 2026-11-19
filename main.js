/* ENY Motors – main.js
   Hero v22: proportional wheel sync. Every input adds frames in proportion to
   how far the wheel/finger actually moved (one mouse detent ≈ 12 frames ≈ 0.5 s
   of the film). The visible picture follows that target with a short 80 ms
   exponential glide and a hard lead limit, so the film moves only while the
   visitor scrolls and settles ≲0.3 s after the last input. The video element is
   a permanently paused decoder: single-flight seeks (newest wins) are painted
   onto a full-resolution canvas; frame 0 at rest shows the sharper poster.
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
   The <video> never plays. A chase loop moves a fractional display frame
   toward the input target; the seek coalescer (one seek in flight, newest
   request wins) decodes it and each settled frame is painted onto the canvas.
   Forward and reverse use exactly the same path. */
const HeroCore = window.ENYHeroCore;
// Seeking exactly onto a media timestamp can make Chromium resolve to the next
// decoded frame. A 1 ms pre-boundary guard keeps every requested frame exact.
const HERO_SEEK_BOUNDARY_GUARD_SECONDS = 0.001;
const hero = $('#hero');
const heroSticky = $('.hero__sticky', hero);
const heroPoster = $('#heroPoster');
let heroVideo = $('#heroVideo');
const heroCanvas = $('#heroCanvas');
const heroCanvasContext = heroCanvas && heroCanvas.getContext('2d', { alpha: false });
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
let heroSeekCoalescer = null;
let frameCommitRaf = 0;
let heroMotionRaf = 0;
let heroMotionActive = false;
let heroMotionDirection = 0;
let heroPendingDirection = 0;
let heroMotionMode = 'idle';
let heroMotionLastInputAt = 0;
let heroMotionStartedAt = 0;
let heroMotionStoppedAt = 0;
let heroMotionActiveMs = 0;
let heroMotionInputSerial = 0;
let heroChaseLastAt = 0;
let heroChaseProfile = null;
let heroDisplayVelocity = 0;
let heroDroppedLeadFrames = 0;
let heroBoundaryDirection = 0;
let heroBoundaryLastInputAt = 0;
// Fractional frame positions: the input target and the smoothly displayed
// position that chases it. Integer frames are derived only for decoding.
let heroTargetExact = 0;
let heroDisplayExact = 0;

/* Proportional sync tuning (overridable per manifest and, for feel tests,
   via ?fpn= / ?w= / ?speed= / ?lead= query parameters).
   - One physical mouse-wheel detent = framesPerNotch frames (10 ≈ 0.42 s).
     Trackpads, high-resolution wheels and touch move proportionally less/more.
   - The picture follows the target like a critically damped spring (natural
     frequency ω): it eases in and eases out instead of jumping to speed.
   - Its speed is capped at maxSpeed × real time (1.75× = 42 film frames per
     second), so the decoder can present every single film frame in order —
     no skipped frames, no time-lapse. Measured on Matteo's real flicks
     (4–6 detents in 100–250 ms) the uncapped v22 peaked at 9.9× real time
     with 4-frame jumps.
   - The target may lead the picture by at most leadNotches detents. A faster
     spin drops the excess instead of queuing it, so the film stops ≲0.5 s
     after the last input; nothing ever moves without input. */
const HERO_DEFAULT_FRAMES_PER_NOTCH = 10;
const HERO_DEFAULT_FOLLOW_OMEGA = 14;       // 1/s, single detent settles ≈ 0.42 s
const HERO_DEFAULT_MAX_SPEED = 1.75;        // × real-time film speed
const HERO_TOUCH_FOLLOW_OMEGA = 24;         // a dragged finger is followed tighter
const HERO_TOUCH_MAX_SPEED = 4;
// A finger may run further ahead of the picture than a wheel (a fast swipe
// must not lose most of its distance); back-pressure still keeps it in order.
const HERO_TOUCH_LEAD_FRAMES = 280;   // a swipe is never cut short
const HERO_DEFAULT_LEAD_NOTCHES = 1.5;
const HERO_MAX_NOTCHES_PER_EVENT = 4;
const HERO_PIXELS_PER_NOTCH = 100;
const HERO_LINES_PER_NOTCH = 3;
const HERO_SETTLE_FRAMES = 0.3;
const HERO_SETTLE_SPEED = 12;               // film frames per second
// Touch: a finger travel of this many viewport heights plays the whole story.
const HERO_TOUCH_VIEWPORTS_PER_STORY = 1.5;
// Only prevents the tail of the roll that reached an endpoint from instantly
// throwing the page out of the sticky hero; a fresh outward input exits.
const HERO_BOUNDARY_EXIT_GAP_MS = 350;   // counted from reaching the end
let heroFramesPerNotch = HERO_DEFAULT_FRAMES_PER_NOTCH;
let heroFollowOmega = HERO_DEFAULT_FOLLOW_OMEGA;
let heroMaxSpeed = HERO_DEFAULT_MAX_SPEED;
let heroLeadNotches = HERO_DEFAULT_LEAD_NOTCHES;

function heroWheelProfile() {
  return { omega: heroFollowOmega, maxSpeed: heroMaxSpeed };
}
function heroTouchProfile() {
  return {
    omega: HERO_TOUCH_FOLLOW_OMEGA,
    maxSpeed: Math.max(heroMaxSpeed, HERO_TOUCH_MAX_SPEED),
    leadFrames: HERO_TOUCH_LEAD_FRAMES
  };
}
// Keys (PageDown/Space = 3 detents) always deliver their full distance.
function heroKeyProfile(frames) {
  return { ...heroWheelProfile(), leadFrames: Math.abs(frames) };
}
let lastHeroWheelDiagnostics = null;
const heroWheelLog = [];

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
  if (startBar) startBar.style.width = Math.round(clamp(progress) * 100) + '%';
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
  // A phone held sideways still gets the (lighter) portrait film.
  if (HERO_TOUCH_UI && Math.min(screen.width, screen.height) <= 760) return 'mobile';
  return heroMediaQuery && heroMediaQuery.matches ? 'mobile' : 'desktop';
}

function applyHeroFrame(frame) {
  if (!heroVideo || !activeVariant) return;
  const nextFrame = Math.max(0, Math.min(activeVariant.frameCount - 1, Math.round(frame)));
  lastRequestedFrame = nextFrame;
  heroVideo.pause();
  const targetTime = HeroCore.frameToTime(nextFrame, activeVariant.fps, activeVariant.frameCount);
  if (Math.abs((Number(heroVideo.currentTime) || 0) - targetTime) <= 0.4 / activeVariant.fps) return;
  try {
    heroVideo.currentTime = Math.max(0, targetTime - HERO_SEEK_BOUNDARY_GUARD_SECONDS);
  } catch (error) {
    console.warn('Hero frame seek failed:', error);
  }
}

/* ---------- frame cache + sub-frame blending ----------
   The film has 24 frames per second; a 60 Hz screen would otherwise show each
   film frame for an uneven 1–3 refreshes (judder). The last few decoded frames
   are kept in small offscreen canvases; every refresh the visible canvas shows
   the two neighbours of the fractional display position, cross-faded by its
   fraction. Motion is then continuous at the screen's refresh rate.
   ?blend=0 disables blending (nearest frame only) for comparison. */
const HERO_FRAME_CACHE_SIZE = 8;
const HERO_DECODE_LOOKAHEAD = 2;
const heroBlendEnabled = params.get('blend') !== '0';
const heroFrameCache = new Map();
const heroSpareCanvases = [];
let heroCompositeRaf = 0;
let heroLastComposite = null;
let heroLastDrawnPosition = null;
let heroLastDrawAt = 0;
// Back-pressure gives up if the decoder delivers nothing for this long
// (decoder error): the motion then finishes instead of hanging.
const HERO_BACKPRESSURE_TIMEOUT_MS = 900;

function clearHeroFrameCache() {
  for (const canvas of heroFrameCache.values()) heroSpareCanvases.push(canvas);
  heroFrameCache.clear();
  heroLastComposite = null;
  heroLastDrawnPosition = null;
}

function cacheHeroFrame(video, variant, frame) {
  // `video` is the <video> element (seek path) or a WebCodecs VideoFrame.
  if (!video || !variant || (typeof video.readyState === 'number' && video.readyState < 2)) return false;
  let canvas = heroFrameCache.get(frame);
  if (canvas) {
    heroFrameCache.delete(frame);
  } else if (heroFrameCache.size >= HERO_FRAME_CACHE_SIZE) {
    const oldest = heroFrameCache.keys().next().value;
    canvas = heroFrameCache.get(oldest);
    heroFrameCache.delete(oldest);
  } else {
    canvas = heroSpareCanvases.pop() || document.createElement('canvas');
  }
  if (canvas.width !== variant.width) canvas.width = variant.width;
  if (canvas.height !== variant.height) canvas.height = variant.height;
  const context = canvas.getContext('2d', { alpha: false });
  context.drawImage(video, 0, 0, variant.width, variant.height);
  heroFrameCache.set(frame, canvas);
  heroLastComposite = null;
  return true;
}

function touchHeroFrame(frame) {
  const canvas = heroFrameCache.get(frame);
  if (!canvas) return null;
  heroFrameCache.delete(frame);
  heroFrameCache.set(frame, canvas);
  return canvas;
}

/* Draws the fractional position `exact` onto the visible canvas. */
function compositeHero(exact) {
  if (!heroCanvas || !heroCanvasContext || !activeVariant) return false;
  const variant = activeVariant;
  const lastFrame = variant.frameCount - 1;
  const x = Math.max(0, Math.min(lastFrame, Number(exact) || 0));
  const lo = Math.min(lastFrame, Math.floor(x + 1e-6));
  const hi = Math.min(lastFrame, lo + 1);
  const fraction = x - lo;

  let base = null;
  let overlay = null;
  let alpha = 0;
  let shown = lo;
  if (heroBlendEnabled) {
    const a = touchHeroFrame(lo);
    const b = hi !== lo ? touchHeroFrame(hi) : null;
    if (a && b && fraction > 0.002) {
      base = a; overlay = b; alpha = fraction; shown = fraction < 0.5 ? lo : hi;
    } else if (a && (fraction < 0.5 || !b)) {
      base = a; shown = lo;
    } else if (b) {
      base = b; shown = hi;
    }
  } else {
    const nearest = Math.round(x);
    const other = nearest === lo ? hi : lo;
    base = touchHeroFrame(nearest);
    shown = nearest;
    if (!base) { base = touchHeroFrame(other); shown = other; }
  }
  if (!base) {
    // Neither neighbour is decoded yet (slow decoder, fast scrollbar/anchor
    // scroll): show the closest frame that is decoded instead of freezing.
    // While moving only frames on the trailing side qualify, so the picture
    // never runs ahead of the position.
    const direction = heroPendingDirection;
    let best = -1;
    for (const frame of heroFrameCache.keys()) {
      if (direction > 0 && frame > x + 1e-6) continue;
      if (direction < 0 && frame < x - 1e-6) continue;
      if (best < 0 || Math.abs(frame - x) < Math.abs(best - x)) best = frame;
    }
    if (best >= 0) {
      base = touchHeroFrame(best);
      overlay = null;
      alpha = 0;
      shown = best;
    }
  }
  if (!base) return false;

  // If a neighbour is still decoding, the fallback frame could sit behind the
  // picture already shown. Keep the last picture for that one refresh instead
  // of flickering backwards; never hold when the fallback moves forward.
  const drawnPosition = overlay ? lo + alpha : shown;
  if (heroLastDrawnPosition !== null && heroPendingDirection &&
      (drawnPosition - heroLastDrawnPosition) * heroPendingDirection < -0.01) {
    return false;
  }

  const signature = lo + '|' + hi + '|' + shown + '|' + (overlay ? Math.round(alpha * 255) : -1);
  if (heroLastComposite !== signature) {
    heroLastComposite = signature;
    if (heroCanvas.width !== variant.width) heroCanvas.width = variant.width;
    if (heroCanvas.height !== variant.height) heroCanvas.height = variant.height;
    heroCanvasContext.globalAlpha = 1;
    heroCanvasContext.drawImage(base, 0, 0);
    if (overlay) {
      heroCanvasContext.globalAlpha = alpha;
      heroCanvasContext.drawImage(overlay, 0, 0);
      heroCanvasContext.globalAlpha = 1;
    }
    heroLastDrawnPosition = drawnPosition;
    const now = performance.now();
    heroLastDrawAt = now;
    canvasPresentationHistory.push({ frame: shown, exact: Math.round(x * 1000) / 1000, alpha: Math.round(alpha * 1000) / 1000, now, mode: heroMotionMode });
    if (canvasPresentationHistory.length > 2400) canvasPresentationHistory.splice(0, 1200);
  }

  canvasPresentedFrame = shown;
  if (canvasFrameHistory.at(-1) !== shown) {
    canvasFrameHistory.push(shown);
    if (canvasFrameHistory.length > 1200) canvasFrameHistory.splice(0, 600);
  }
  // Before the first input frame 0 shows the poster (it is there before the
  // video has loaded). Once the visitor drives the hero the canvas stays up,
  // also at frame 0: the sharpened film frame matches the poster's sharpness,
  // and swapping texture on every return to frame 0 read as a flicker.
  heroCanvas.classList.toggle('is-ready', x > 0.001 || shown > 0 || heroMotionInputSerial > 0);
  commitPresentedHeroFrame(shown);

  if (!heroMotionActive && x === Math.round(x) && shown === targetFrame && Math.round(x) === targetFrame) {
    heroPendingDirection = 0;
    settleHeroBoundary(shown);
  }
  return true;
}

function queueHeroComposite() {
  if (heroCompositeRaf || heroMotionActive) return;
  heroCompositeRaf = requestAnimationFrame(() => {
    heroCompositeRaf = 0;
    compositeHero(heroDisplayExact);
  });
}

function decodeHeroFrame(frame) {
  if (!activeVariant) return;
  const requestedFrame = Math.max(0, Math.min(activeVariant.frameCount - 1, Math.round(frame)));
  lastRequestedFrame = requestedFrame;
  if (!heroSeekCoalescer) {
    applyHeroFrame(requestedFrame);
    return;
  }
  heroSeekCoalescer.setFrame(requestedFrame);
}

/* Makes sure the frames needed for `exact` are decoded: the frame being moved
   into first, then its neighbour, then one frame of look-ahead. */
function ensureHeroFrames(exact, direction = 0) {
  if (!activeVariant) return;
  const lastFrame = activeVariant.frameCount - 1;
  const x = Math.max(0, Math.min(lastFrame, Number(exact) || 0));
  const lo = Math.min(lastFrame, Math.floor(x + 1e-6));
  const hi = Math.min(lastFrame, lo + 1);
  const fraction = x - lo;
  const needed = [];
  if (heroBlendEnabled) {
    if (fraction > 0.002 && hi !== lo) needed.push(...(direction < 0 ? [lo, hi] : [hi, lo]));
    else needed.push(lo);
  } else {
    needed.push(Math.round(x));
  }
  // The neighbour the picture moves into next comes before any look-ahead
  // (on a whole frame the old order skipped it and jumped two frames).
  if (direction > 0) {
    const next = Math.min(lastFrame, Math.floor(x + 1e-6) + 1);
    if (!needed.includes(next)) needed.push(next);
  } else if (direction < 0) {
    const prev = Math.max(0, Math.ceil(x - 1e-6) - 1);
    if (!needed.includes(prev)) needed.push(prev);
  }
  for (const frame of needed) {
    if (!heroFrameCache.has(frame)) {
      decodeHeroFrame(frame);
      return;
    }
  }
  if (!heroMotionActive && !direction && heroCodec) {
    // At rest (cheap with WebCodecs): have both neighbours ready, so the first
    // step in either direction needs no decode while the decoder is idle.
    for (const near of [hi, lo - 1]) {
      if (near >= 0 && near <= lastFrame && !heroFrameCache.has(near)) {
        decodeHeroFrame(near);
        return;
      }
    }
  }
  if (heroMotionActive && direction) {
    // Look-ahead in the direction of motion keeps the decoder ahead of the
    // picture (decoding ≈60 fps vs. at most 42 film fps of motion).
    for (let step = 1; step <= HERO_DECODE_LOOKAHEAD; step++) {
      const ahead = direction > 0 ? hi + step : lo - step;
      if (ahead < 0 || ahead > lastFrame) break;
      if (!heroFrameCache.has(ahead)) {
        decodeHeroFrame(ahead);
        return;
      }
    }
  }
}

function cancelHeroFrameRunner() {
  if (heroSeekCoalescer) heroSeekCoalescer.destroy();
  if (frameCommitRaf) cancelAnimationFrame(frameCommitRaf);
  if (heroCompositeRaf) cancelAnimationFrame(heroCompositeRaf);
  heroSeekCoalescer = null;
  frameCommitRaf = 0;
  heroCompositeRaf = 0;
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

function showHeroCanvas() {
  if (!heroVideo || !heroCanvas) return;
  heroVideo.pause();
  heroVideo.classList.remove('is-scrub-visible');
  heroCanvas.classList.remove('is-scrub-hidden');
  if (heroDisplayExact > 0.001 || canvasPresentedFrame > 0) heroCanvas.classList.add('is-ready');
}

function clearHeroBoundaryLock() {
  heroBoundaryDirection = 0;
  heroBoundaryLastInputAt = 0;
}

function heroLastFrame() {
  return activeVariant ? activeVariant.frameCount - 1 : 0;
}

function clampHeroFrameExact(frame) {
  return Math.max(0, Math.min(heroLastFrame(), Number(frame) || 0));
}

function settleHeroBoundary(frame) {
  if (!activeVariant || heroMotionActive || frame !== targetFrame) return;
  const lastFrame = activeVariant.frameCount - 1;
  let direction = 0;
  if (frame <= 0) direction = -1;
  else if (frame >= lastFrame) direction = 1;
  else return;
  // Remember when this end was reached (once; repeated composites at rest
  // must not restart the window).
  if (heroBoundaryDirection !== direction || !heroBoundaryLastInputAt) {
    heroBoundaryLastInputAt = performance.now();
  }
  heroBoundaryDirection = direction;
}

/* Stops the chase where the picture currently is. Nothing keeps moving
   afterwards: target, display and decoder request are aligned. */
function stopHeroMotion(options = {}) {
  const wasActive = heroMotionActive;
  if (heroMotionRaf) cancelAnimationFrame(heroMotionRaf);
  heroMotionRaf = 0;
  heroMotionActive = false;
  heroMotionDirection = 0;
  heroMotionMode = 'idle';
  heroDisplayVelocity = 0;
  heroMotionStoppedAt = performance.now();
  if (wasActive && heroMotionStartedAt > 0) {
    heroMotionActiveMs += Math.max(0, heroMotionStoppedAt - heroMotionStartedAt);
  }
  if (heroVideo) heroVideo.pause();
  if (options.clearBoundary) {
    clearHeroBoundaryLock();
    heroPendingDirection = 0;
  }
  if (activeVariant && wasActive) {
    const restFrame = Math.round(clampHeroFrameExact(heroDisplayExact));
    heroTargetExact = restFrame;
    heroDisplayExact = restFrame;
    targetFrame = restFrame;
    heroInputFrame = restFrame;
    requestHeroFrame(restFrame);
  }
  return wasActive;
}

/* Advances the displayed position by `ms` milliseconds: critically damped
   spring toward the target (eases in and out), speed capped so every film
   frame can be decoded and shown in order, never overshooting the target. */
function stepHeroDisplay(ms) {
  const profile = heroChaseProfile || heroWheelProfile();
  const omega = Math.max(1, profile.omega);
  const maxVelocity = Math.max(1, profile.maxSpeed * (activeVariant ? activeVariant.fps : 24));
  let remaining = ms;
  while (remaining > 0) {
    const h = Math.min(8, remaining) / 1000;
    remaining -= 8;
    const gap = heroTargetExact - heroDisplayExact;
    if (Math.abs(gap) <= HERO_SETTLE_FRAMES && Math.abs(heroDisplayVelocity) <= HERO_SETTLE_SPEED) {
      heroDisplayExact = heroTargetExact;
      heroDisplayVelocity = 0;
      return;
    }
    const acceleration = omega * omega * gap - 2 * omega * heroDisplayVelocity;
    heroDisplayVelocity += acceleration * h;
    heroDisplayVelocity = Math.max(-maxVelocity, Math.min(maxVelocity, heroDisplayVelocity));
    const next = heroDisplayExact + heroDisplayVelocity * h;
    if ((gap > 0 && next >= heroTargetExact) || (gap < 0 && next <= heroTargetExact)) {
      heroDisplayExact = heroTargetExact;
      heroDisplayVelocity = 0;
      return;
    }
    heroDisplayExact = next;
  }
}

/* One rAF step of the follow. */
function heroChaseLoop(now) {
  heroMotionRaf = 0;
  if (!heroMotionActive || !activeVariant) return;

  const dt = Math.max(0, Math.min(64, now - heroChaseLastAt));
  heroChaseLastAt = now;
  stepHeroDisplay(dt);

  // Back-pressure: the position may run at most one film frame ahead of the
  // picture actually on screen. A slow decoder (busy PC, weak GPU) then slows
  // the motion down instead of every decode arriving too late (picture freezes)
  // and the picture jumping 20-100 frames once the motion settles.
  if (heroLastDrawnPosition !== null && heroMotionDirection &&
      now - heroLastDrawAt < HERO_BACKPRESSURE_TIMEOUT_MS) {
    const limit = heroLastDrawnPosition + heroMotionDirection;
    if ((heroDisplayExact - limit) * heroMotionDirection > 0) heroDisplayExact = limit;
  }

  if (heroDisplayExact === heroTargetExact && heroDisplayVelocity === 0) {
    // Settled: stop the loop and decode the exact target frame. Target and
    // display both rest on that whole frame (no drift at the next input).
    const finalFrame = Math.round(heroTargetExact);
    heroTargetExact = finalFrame;
    heroMotionActive = false;
    heroMotionDirection = 0;
    heroMotionMode = 'idle';
    heroMotionStoppedAt = now;
    heroMotionActiveMs += Math.max(0, now - heroMotionStartedAt);
    targetFrame = finalFrame;
    requestHeroFrame(finalFrame);
    if (presentedFrame === finalFrame) {
      heroPendingDirection = 0;
      settleHeroBoundary(finalFrame);
    }
    return;
  }

  ensureHeroFrames(heroDisplayExact, heroMotionDirection);
  compositeHero(heroDisplayExact);
  heroMotionRaf = requestAnimationFrame(heroChaseLoop);
}

/* Adds an input of `frameDelta` (signed, fractional) frames. The target moves
   exactly as far as the input moved; the picture follows it. */
function startOrExtendHeroMotion(frameDelta, inputAt = performance.now(), profile = heroWheelProfile()) {
  if (!activeVariant || !heroVideo || !frameDelta) return false;
  const direction = Math.sign(frameDelta);

  if (!heroMotionActive) {
    // At rest target and display coincide (set by the last settle, the drive
    // activation, the scroll-position path or the variant install).
    const rest = clampHeroFrameExact(heroTargetExact);
    heroDisplayExact = rest;
    heroTargetExact = rest;
    heroDisplayVelocity = 0;
    // The back-pressure limit counts from the picture on screen; if that is
    // unknown or stale (e.g. after a scrollbar jump) count from the rest frame.
    if (heroLastDrawnPosition === null || Math.abs(heroLastDrawnPosition - rest) > 1) {
      heroLastDrawnPosition = rest;
    }
    heroLastDrawAt = performance.now();
  } else if (heroPendingDirection && direction !== heroPendingDirection) {
    // Reversal: never finish the old direction first and never coast on.
    heroTargetExact = heroDisplayExact;
    heroDisplayVelocity = 0;
  }

  const lead = Math.max(1, heroLeadNotches * heroFramesPerNotch, Number(profile && profile.leadFrames) || 0);
  // Whole-frame inputs (wheel detents, keys) keep the target on whole frames,
  // so a glide never ends with a rounding snap; trackpad/touch stay fractional.
  const whole = Number.isInteger(frameDelta);
  const wanted = clampHeroFrameExact(whole
    ? Math.round(heroTargetExact + frameDelta)
    : heroTargetExact + frameDelta);
  const ahead = whole ? Math.floor(heroDisplayExact + lead + 1e-6) : heroDisplayExact + lead;
  const behind = whole ? Math.ceil(heroDisplayExact - lead - 1e-6) : heroDisplayExact - lead;
  const limited = Math.max(behind, Math.min(ahead, wanted));
  heroDroppedLeadFrames += Math.abs(wanted - limited);
  heroTargetExact = clampHeroFrameExact(limited);
  targetFrame = Math.round(heroTargetExact);
  heroInputFrame = targetFrame;
  heroPendingDirection = direction;
  heroMotionDirection = direction;
  heroMotionMode = direction > 0 ? 'forward' : 'reverse';
  heroMotionLastInputAt = inputAt;
  heroMotionInputSerial += 1;
  heroChaseProfile = profile;
  clearHeroBoundaryLock();
  showHeroCanvas();

  if (Math.abs(heroTargetExact - heroDisplayExact) < 1e-6) {
    // Already at the requested position (for example pressed against an end).
    if (!heroMotionActive) {
      heroMotionMode = 'idle';
      requestHeroFrame(targetFrame);
      if (presentedFrame === targetFrame) settleHeroBoundary(targetFrame);
    }
    return false;
  }

  if (!heroMotionActive) {
    heroMotionActive = true;
    heroMotionStartedAt = performance.now();
    heroChaseLastAt = heroMotionStartedAt;
  }
  if (!heroMotionRaf) heroMotionRaf = requestAnimationFrame(heroChaseLoop);
  return true;
}

/* ---------- WebCodecs frame source ----------
   The <video> element needs 3-80 ms per seek through its media pipeline (more
   on a real screen than in tests), which made fast scrubbing lag. The hero
   file is already in memory, so its H.264 samples are fed straight to a
   VideoDecoder instead: frame n = its key frame (every 2nd frame) + at most
   one delta, a few milliseconds, no seek. Browsers without WebCodecs keep the
   seek path. */
function parseHeroMp4(buffer) {
  const dv = new DataView(buffer);
  const u8 = new Uint8Array(buffer);
  const type = off => String.fromCharCode(u8[off + 4], u8[off + 5], u8[off + 6], u8[off + 7]);
  function boxes(start, end) {
    const list = [];
    let off = start;
    while (off + 8 <= end) {
      let size = dv.getUint32(off);
      let header = 8;
      if (size === 1) { size = Number(dv.getBigUint64(off + 8)); header = 16; }
      else if (size === 0) size = end - off;
      if (size < header || off + size > end) break;
      list.push({ type: type(off), start: off + header, end: off + size });
      off += size;
    }
    return list;
  }
  const child = (parent, name) => boxes(parent.start, parent.end).find(b => b.type === name);
  const root = { start: 0, end: buffer.byteLength };
  const moov = child(root, 'moov');
  if (!moov) throw new Error('mp4: no moov');
  const trak = boxes(moov.start, moov.end).filter(b => b.type === 'trak').find(t => {
    const hdlr = child(child(t, 'mdia'), 'hdlr');
    return hdlr && String.fromCharCode(...u8.subarray(hdlr.start + 8, hdlr.start + 12)) === 'vide';
  });
  if (!trak) throw new Error('mp4: no video track');
  const stbl = child(child(child(trak, 'mdia'), 'minf'), 'stbl');
  const stsd = child(stbl, 'stsd');
  const entry = boxes(stsd.start + 8, stsd.end)[0];
  if (!entry || entry.type !== 'avc1') throw new Error('mp4: not avc1');
  const width = dv.getUint16(entry.start + 24);
  const height = dv.getUint16(entry.start + 26);
  const avcC = boxes(entry.start + 78, entry.end).find(b => b.type === 'avcC');
  if (!avcC) throw new Error('mp4: no avcC');
  const description = u8.slice(avcC.start, avcC.end);
  const hex = v => v.toString(16).padStart(2, '0');
  const codec = 'avc1.' + hex(description[1]) + hex(description[2]) + hex(description[3]);

  const stsz = child(stbl, 'stsz');
  const fixedSize = dv.getUint32(stsz.start + 4);
  const count = dv.getUint32(stsz.start + 8);
  const sizes = new Array(count);
  for (let i = 0; i < count; i++) sizes[i] = fixedSize || dv.getUint32(stsz.start + 12 + i * 4);

  const stco = child(stbl, 'stco');
  const co64 = child(stbl, 'co64');
  const chunkOffsets = [];
  if (stco) {
    const n = dv.getUint32(stco.start + 4);
    for (let i = 0; i < n; i++) chunkOffsets.push(dv.getUint32(stco.start + 8 + i * 4));
  } else if (co64) {
    const n = dv.getUint32(co64.start + 4);
    for (let i = 0; i < n; i++) chunkOffsets.push(Number(dv.getBigUint64(co64.start + 8 + i * 8)));
  } else throw new Error('mp4: no chunk offsets');

  const stsc = child(stbl, 'stsc');
  const runs = [];
  for (let i = 0, n = dv.getUint32(stsc.start + 4); i < n; i++) {
    const o = stsc.start + 8 + i * 12;
    runs.push({ first: dv.getUint32(o), perChunk: dv.getUint32(o + 4) });
  }
  const offsets = new Array(count);
  let sample = 0;
  for (let c = 0; c < chunkOffsets.length && sample < count; c++) {
    let run = runs[0];
    for (const r of runs) if (r.first <= c + 1) run = r;
    let off = chunkOffsets[c];
    for (let s = 0; s < run.perChunk && sample < count; s++) {
      offsets[sample] = off;
      off += sizes[sample];
      sample += 1;
    }
  }

  const stss = child(stbl, 'stss');
  const keys = new Array(count).fill(!stss);
  if (stss) {
    for (let i = 0, n = dv.getUint32(stss.start + 4); i < n; i++) {
      const s = dv.getUint32(stss.start + 8 + i * 4) - 1;
      if (s >= 0 && s < count) keys[s] = true;
    }
  }
  // Frame order = sample order only without B-frames (no ctts box).
  if (child(stbl, 'ctts')) throw new Error('mp4: reordered frames not supported');
  return { codec, description, width, height, count, sizes, offsets, keys };
}

async function openHeroCodec(blob, options = { noFlush: true, flushAfterMs: 60 }) {
  if (typeof VideoDecoder !== 'function' || typeof EncodedVideoChunk !== 'function') return null;
  const buffer = await blob.arrayBuffer();
  const info = parseHeroMp4(buffer);
  const config = {
    codec: info.codec,
    description: info.description,
    codedWidth: info.width,
    codedHeight: info.height,
    optimizeForLatency: true
  };
  if (options.hardwareAcceleration) config.hardwareAcceleration = options.hardwareAcceleration;
  const support = await VideoDecoder.isConfigSupported(config);
  if (!support || !support.supported) return null;

  let wanted = -1;
  let lateCount = 0;
  let decodeCount = 0;
  let deliver = null;
  let failed = null;
  const decoder = new VideoDecoder({
    output(frame) {
      if (Math.round(frame.timestamp) === wanted && deliver) {
        const done = deliver;
        deliver = null;
        done(frame);
      } else {
        frame.close();
      }
    },
    error(error) { failed = error; }
  });
  decoder.configure(config);

  return {
    info,
    get late() { return lateCount; },
    get broken() { return Boolean(failed) || decoder.state === 'closed'; },
    /* Resolves with a VideoFrame for film frame n (caller must close it).
       One call at a time. */
    async decode(n) {
      if (failed) throw failed;
      let key = Math.max(0, Math.min(info.count - 1, n));
      const target = key;
      while (key > 0 && !info.keys[key]) key -= 1;
      wanted = target;
      const result = new Promise(resolve => { deliver = resolve; });
      for (let i = key; i <= target; i++) {
        decoder.decode(new EncodedVideoChunk({
          type: i === key ? 'key' : 'delta',
          timestamp: i,
          data: new Uint8Array(buffer, info.offsets[i], info.sizes[i])
        }));
      }
      decodeCount += 1;
      if (options.noFlush && decodeCount >= 12 && lateCount / decodeCount > 0.3) options.noFlush = false;
      if (options.noFlush) {
        // Most decoders emit the frame right away (no B-frames, low-latency
        // mode); flush only if it has not arrived shortly.
        const timer = new Promise(resolve => setTimeout(resolve, options.flushAfterMs || 60, 'late'));
        const first = await Promise.race([result, timer]);
        if (first !== 'late') return first;
        lateCount += 1;
      }
      await decoder.flush();
      if (deliver) { deliver = null; throw failed || new Error('frame ' + target + ' was not decoded'); }
      return result;
    },
    close() {
      try { if (decoder.state !== 'closed') decoder.close(); } catch (error) {}
    }
  };
}


let heroCodec = null;                          // WebCodecs source of the active film (null = seek path)
const heroUseCodec = params.get('codec') !== '0';  // ?codec=0 forces the old seek path for comparison

/* Same contract as HeroCore.createSeekCoalescer: one decode at a time, the
   newest requested frame wins, each decoded frame goes into the cache. */
function createCodecCoalescer(codec, variant) {
  let desired = -1;
  let inFlight = false;
  let destroyed = false;
  let lastSettled = -1;
  const recent = [];
  let decodes = 0;
  function pump() {
    if (destroyed || inFlight || desired < 0) return;
    const frame = desired;
    desired = -1;
    inFlight = true;
    lastRequestedFrame = frame;
    const started = performance.now();
    codec.decode(frame).then(videoFrame => {
      inFlight = false;
      if (destroyed || variant !== activeVariant) { videoFrame.close(); return; }
      lastSettled = frame;
      try {
        cacheHeroFrame(videoFrame, variant, frame);
      } catch (error) {
        videoFrame.close();
        console.warn('Drawing a WebCodecs frame failed; using video seeks instead:', error);
        fallBackToSeekDecoder();
        return;
      }
      videoFrame.close();
      const took = performance.now() - started;
      document.dispatchEvent(new CustomEvent('eny-decode', { detail: took }));
      // Give up on WebCodecs only if it is slow for a sustained stretch: the
      // warm-up decodes are ignored, single samples are capped (a long task
      // must not count as a slow decoder) and the median of the last 30 must
      // exceed 40 ms.
      decodes += 1;
      if (decodes > 3) {
        recent.push(Math.min(took, 80));
        if (recent.length > 30) recent.shift();
        if (recent.length === 30) {
          const median = recent.slice().sort((a, b) => a - b)[15];
          if (median > 40) {
            console.warn('WebCodecs decoding is slow here (' + Math.round(median) + ' ms); using video seeks instead.');
            fallBackToSeekDecoder();
            return;
          }
        }
      }
      if (!heroMotionActive) queueHeroComposite();
      ensureHeroFrames(heroDisplayExact, heroMotionActive ? heroMotionDirection : 0);
      pump();
    }, error => {
      inFlight = false;
      if (destroyed) return;
      console.warn('WebCodecs hero decode failed; using video seeks instead:', error);
      fallBackToSeekDecoder();
    });
  }
  return {
    setFrame(frame) {
      if (destroyed) return frame;
      desired = frame;
      pump();
      return frame;
    },
    getState() {
      return { mode: 'webcodecs', desiredFrame: desired, seekInFlight: inFlight, lastSettledFrame: lastSettled, lateFrames: codec.late, destroyed };
    },
    destroy() { destroyed = true; }
  };
}

function fallBackToSeekDecoder() {
  if (heroCodec) heroCodec.close();
  heroCodec = null;
  if (!heroVideo || !activeVariant) return;
  installHeroSeekCoalescer(heroVideo, activeVariant);
  ensureHeroFrames(heroDisplayExact, heroMotionActive ? heroMotionDirection : 0);
}

function installHeroSeekCoalescer(video, variant) {
  cancelHeroFrameRunner();
  if (heroCodec && !heroCodec.broken) {
    heroSeekCoalescer = createCodecCoalescer(heroCodec, variant);
    return;
  }
  heroSeekCoalescer = HeroCore.createSeekCoalescer(video, {
    fps: variant.fps,
    frameCount: variant.frameCount,
    seekBoundaryGuardSeconds: HERO_SEEK_BOUNDARY_GUARD_SECONDS,
    // Each decoded frame is copied into the cache inside the 'seeked' handler,
    // so the next seek may start immediately instead of waiting for the next
    // screen refresh (≈60 → ≈80 decodes per second).
    schedule: callback => ({ type: 'timeout', id: setTimeout(callback, 0) }),
    onSeekStart(frame) {
      if (video !== heroVideo || variant !== activeVariant) return;
      lastRequestedFrame = frame;
    },
    onSettled(frame) {
      if (video !== heroVideo || variant !== activeVariant) return;
      // Copy the decoded frame into the cache right away (the decoder may move
      // on), then let the display position decide what is shown.
      cacheHeroFrame(video, variant, frame);
      if (!heroMotionActive) queueHeroComposite();
      ensureHeroFrames(heroDisplayExact, heroMotionActive ? heroMotionDirection : 0);
    }
  });
}

/* Shows an integer frame at rest (scroll position path, settle, stop). */
function requestHeroFrame(frame) {
  if (!activeVariant) return;
  const requestedFrame = Math.max(0, Math.min(activeVariant.frameCount - 1, Math.round(frame)));
  if (!heroMotionActive) heroDisplayExact = requestedFrame;
  ensureHeroFrames(requestedFrame, 0);
  queueHeroComposite();
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

  // While the film is still loading only the opening title may show (the
  // later captions would sit over the static start poster).
  beats.forEach((beat, index) => {
    beat.classList.toggle('is-on', (heroReady || index === 0) &&
      p >= Number(beat.dataset.in) && p < Number(beat.dataset.out));
  });
  progEl.style.transform = 'scaleX(' + p + ')';
  cue.style.opacity = p > 0.02 ? 0 : 1;
}

function renderHero(progress) {
  const p = HeroCore.clamp01(progress);
  renderHeroPresentation(p);

  // Outside the captured drive (scrollbar, anchor jumps, Lenis outside the
  // hero) the frame simply follows the document position.
  if (heroVideo && activeVariant && !heroDriveActive && !heroMotionActive) {
    const frame = HeroCore.progressToFrame(p, activeVariant.frameCount);
    heroInputFrame = frame;
    heroTargetExact = frame;
    heroDisplayExact = frame;
    if (frame !== targetFrame) {
      targetFrame = frame;
      if (frame > 0) showHeroCanvas();
      requestHeroFrame(frame);
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

/* ---------- input normalization: how far did the wheel really move? ----------
   Chromium/Edge report the legacy wheelDeltaY as 120 per physical mouse detent
   divided by the device pixel ratio (120 at 100 % Windows scaling, 96 at 125 %,
   80 at 150 %), independent of the percent-based pixel deltaY. Safari and
   Firefox report an unscaled 120. A legacy value that is a whole number of
   detents (raw or DPR-corrected) therefore counts as exactly that many detents.
   High-resolution wheels and trackpads produce fractions and stay proportional
   to their pixel distance (100 px = one detent). If a remote/driver stack drops
   wheelDelta entirely, the known per-detent pixel families still count as one
   detent; everything else is proportional. Nothing is promoted beyond its
   real distance. */
// macOS/iOS browsers derive wheelDelta from the pixel delta (×3), so a small
// trackpad or Magic Mouse movement can look like a whole detent there. On
// Apple devices every wheel event is therefore treated as proportional.
const HERO_APPLE_INPUT = /Mac|iPhone|iPad|iPod/i.test(
  (navigator.userAgentData && navigator.userAgentData.platform) || navigator.platform || ''
) || /Mac OS X/.test(navigator.userAgent || '');

function heroDetentsFromLegacy(legacy) {
  const magnitude = Math.abs(legacy);
  if (!magnitude || HERO_APPLE_INPUT) return 0;
  const dpr = Math.max(0.5, Number(window.devicePixelRatio) || 1);
  for (const ticks of [magnitude / 120, magnitude * dpr / 120]) {
    const whole = Math.round(ticks);
    if (whole >= 1 && whole <= HERO_MAX_NOTCHES_PER_EVENT && Math.abs(ticks - whole) <= 0.04 * whole) {
      return whole;
    }
  }
  return 0;
}

function heroDetentsFromPixels(pixels) {
  if (HERO_APPLE_INPUT) return 0;
  for (const base of [120, 100, 53, 40]) {
    const count = Math.round(pixels / base);
    if (count < 1 || count > HERO_MAX_NOTCHES_PER_EVENT) continue;
    if (Math.abs(pixels - base * count) <= Math.max(3, base * 0.08) * count) return count;
  }
  return 0;
}

function heroLegacyWheelDelta(event) {
  if (!event) return 0;
  const y = Number(event.wheelDeltaY);
  if (Number.isFinite(y) && y !== 0) return y;
  const any = Number(event.wheelDelta);
  return Number.isFinite(any) ? any : 0;
}

function normalizeHeroWheel(event) {
  const deltaY = Number(event && event.deltaY) || 0;
  // Sideways gestures (Shift+wheel, horizontal trackpad swipe) are not meant
  // for the film and are left to the browser.
  if (Math.abs(Number(event && event.deltaX) || 0) > Math.abs(deltaY)) return null;
  const deltaMode = Number(event && event.deltaMode) || 0;
  const legacy = heroLegacyWheelDelta(event);
  const direction = Math.sign(deltaY || -legacy);
  if (!direction) return null;

  let notches;
  let kind;
  const legacyDetents = Math.sign(-legacy) === direction ? heroDetentsFromLegacy(legacy) : 0;
  const pixelDetents = !legacy && deltaMode === 0 ? heroDetentsFromPixels(Math.abs(deltaY)) : 0;
  if (legacyDetents) {
    notches = legacyDetents;
    kind = 'wheel-detent';
  } else if (pixelDetents) {
    notches = pixelDetents;
    kind = 'pixel-detent';
  } else if (deltaMode === 1) {
    notches = Math.abs(deltaY) / HERO_LINES_PER_NOTCH;
    kind = 'line';
  } else if (deltaMode === 2) {
    notches = Math.abs(deltaY) * HERO_LINES_PER_NOTCH;
    kind = 'page';
  } else {
    notches = Math.abs(deltaY) / HERO_PIXELS_PER_NOTCH;
    kind = 'pixels';
  }
  notches = Math.min(HERO_MAX_NOTCHES_PER_EVENT, notches);

  const result = {
    notches: direction * notches,
    frames: direction * notches * heroFramesPerNotch,
    pixels: direction * notches * HERO_PIXELS_PER_NOTCH,
    kind
  };
  lastHeroWheelDiagnostics = {
    rawDeltaY: deltaY,
    deltaMode,
    legacyDelta: legacy,
    kind,
    notches: result.notches,
    frames: result.frames,
    framesPerNotch: heroFramesPerNotch,
    secondsPerNotch: activeVariant ? heroFramesPerNotch / activeVariant.fps : null
  };
  heroWheelLog.push({
    t: Math.round(Number(event && event.timeStamp) || performance.now()),
    deltaY,
    deltaMode,
    legacy,
    kind,
    notches: Math.round(result.notches * 1000) / 1000
  });
  if (heroWheelLog.length > 80) heroWheelLog.splice(0, heroWheelLog.length - 80);
  return result;
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
  const baseFrame = presentedFrame >= 0
    ? presentedFrame
    : (targetFrame >= 0 ? targetFrame : fallbackFrame);
  if (!heroMotionActive) {
    heroTargetExact = baseFrame;
    heroDisplayExact = baseFrame;
    targetFrame = baseFrame;
    heroInputFrame = baseFrame;
  }
  if (lenis) lenis.stop();
  syncHeroScrollToPresentedFrame();
}

function releaseHeroDrive() {
  if (!heroDriveActive) return;
  stopHeroMotion({ clearBoundary: true });
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
  const desired = heroMotionActive
    ? Math.round(heroTargetExact)
    : (targetFrame >= 0 ? targetFrame : HeroCore.progressToFrame(currentProgress, activeVariant.frameCount));
  const shown = presentedFrame >= 0 ? presentedFrame : desired;
  if (direction > 0) return desired < lastFrame || shown < lastFrame;
  return desired > 0 || shown > 0;
}

function preventHeroInput(event) {
  if (!event) return;
  event.preventDefault();
  event.stopImmediatePropagation();
}

/* Applies one input. `frameDelta` is the signed (fractional) number of film
   frames this input is worth; `exitPixels` is how far the page scrolls if the
   input leaves the hero at one of its ends. */
function driveHeroByInput(frameDelta, exitPixels, event, profile = heroWheelProfile()) {
  if (!heroReady || !activeVariant || document.body.classList.contains('is-loading')) return false;
  const frames = Number(frameDelta) || 0;
  const direction = Math.sign(frames);
  if (!direction) return false;
  const now = performance.now();
  const stampedAt = Number(event && event.timeStamp);
  const inputAt = Number.isFinite(stampedAt) && Math.abs(stampedAt - now) < 60_000
    ? stampedAt
    : now;

  if (!shouldCaptureHeroDirection(direction)) {
    if (!heroDriveActive) return false;

    // Events belonging to the roll that just reached frame 0/last frame are
    // swallowed, and so is everything while the picture is still gliding into
    // that end. Only a genuinely new gesture after an idle gap may leave the
    // hero, so the section never auto-exits while the wheel is still spinning
    // (and never flips between hero and page while flicking back and forth).
    if (heroMotionActive) {
      // Still gliding into this end: swallow; the window starts once it lands.
      preventHeroInput(event);
      heroBoundaryDirection = direction;
      return true;
    }
    // The window counts from the moment the end was reached and is not
    // refreshed by further events, so a steadily spinning wheel or a long
    // trackpad momentum tail continues into the page after a short beat.
    const sameRoll = heroBoundaryDirection === direction &&
      inputAt - heroBoundaryLastInputAt <= HERO_BOUNDARY_EXIT_GAP_MS;
    if (sameRoll) {
      preventHeroInput(event);
      return true;
    }

    preventHeroInput(event);
    releaseHeroDriveAndScroll(exitPixels || direction * HERO_PIXELS_PER_NOTCH);
    return true;
  }

  activateHeroDrive();
  preventHeroInput(event);
  startOrExtendHeroMotion(frames, inputAt, profile);
  return true;
}

// Debug/QA helper: treat a pixel distance like trackpad pixels.
function driveHeroByPixels(pixelDelta, event) {
  const pixels = Number(pixelDelta) || 0;
  return driveHeroByInput(pixels / HERO_PIXELS_PER_NOTCH * heroFramesPerNotch, pixels, event);
}

function handleHeroWheel(event) {
  if (event.ctrlKey) return;
  const input = normalizeHeroWheel(event);
  if (!input) return;
  driveHeroByInput(input.frames, input.pixels, event);
  if (heroWheelOverlay) queueHeroWheelOverlay();
}

function handleHeroTouchStart(event) {
  heroTouchY = event.touches.length === 1 ? event.touches[0].clientY : null;
}

function handleHeroTouchMove(event) {
  if (heroTouchY === null || event.touches.length !== 1 || !activeVariant) return;
  const nextY = event.touches[0].clientY;
  const delta = heroTouchY - nextY;
  heroTouchY = nextY;
  // Native scrolling already owns this gesture; the next one drives the film.
  if (!event.cancelable) return;
  const storyPixels = Math.max(1, HERO_TOUCH_VIEWPORTS_PER_STORY * window.innerHeight);
  const frames = delta / storyPixels * heroLastFrame();
  driveHeroByInput(frames, delta, event, heroTouchProfile());
}

function handleHeroKeyInput(event) {
  if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return;
  const target = event.target;
  if (target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test(target.tagName))) return;

  let notches = 0;
  if (event.key === 'ArrowDown') notches = 1;
  else if (event.key === 'ArrowUp') notches = -1;
  else if (event.key === 'PageDown' || (event.key === ' ' && !event.shiftKey)) notches = 3;
  else if (event.key === 'PageUp' || (event.key === ' ' && event.shiftKey)) notches = -3;
  if (notches) {
    const frames = notches * heroFramesPerNotch;
    driveHeroByInput(frames, notches * HERO_PIXELS_PER_NOTCH, event, heroKeyProfile(frames));
  }
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
  const coalescer = heroSeekCoalescer ? heroSeekCoalescer.getState() : null;
  return {
    active: heroDriveActive,
    motionActive: heroMotionActive,
    motionDirection: heroMotionDirection,
    pendingDirection: heroPendingDirection,
    motionMode: heroMotionMode,
    boundaryExitGapMs: HERO_BOUNDARY_EXIT_GAP_MS,
    inputSerial: heroMotionInputSerial,
    decoderMode: heroCodec ? 'webcodecs-canvas-v23' : 'paused-seek-canvas-v22',
    ready: heroReady,
    videoPaused: heroVideo && heroVideo.paused,
    videoTime: heroVideo && heroVideo.currentTime,
    playbackRate: heroVideo && heroVideo.playbackRate,
    videoSeeking: heroVideo && heroVideo.seeking,
    seekInFlight: coalescer ? coalescer.seekInFlight : null,
    lastInputAt: heroMotionLastInputAt,
    motionStartedAt: heroMotionStartedAt,
    motionStoppedAt: heroMotionStoppedAt,
    activeMotionMs: heroMotionActiveMs + (heroMotionActive
      ? Math.max(0, performance.now() - heroMotionStartedAt)
      : 0),
    targetFrame,
    targetExact: heroTargetExact,
    displayExact: heroDisplayExact,
    displayVelocity: heroDisplayVelocity,
    droppedLeadFrames: heroDroppedLeadFrames,
    syncConfig: {
      framesPerNotch: heroFramesPerNotch,
      secondsPerNotch: activeVariant ? heroFramesPerNotch / activeVariant.fps : null,
      notchesPerStory: activeVariant ? heroLastFrame() / heroFramesPerNotch : null,
      followOmega: heroFollowOmega,
      maxSpeed: heroMaxSpeed,
      touchFollowOmega: HERO_TOUCH_FOLLOW_OMEGA,
      touchMaxSpeed: Math.max(heroMaxSpeed, HERO_TOUCH_MAX_SPEED),
      leadNotches: heroLeadNotches,
      pixelsPerNotch: HERO_PIXELS_PER_NOTCH,
      maxNotchesPerEvent: HERO_MAX_NOTCHES_PER_EVENT,
      fps: activeVariant && activeVariant.fps,
      frameCount: activeVariant && activeVariant.frameCount
    },
    presentedFrame,
    canvasPresentedFrame,
    canvasVisible: Boolean(heroCanvas && heroCanvas.classList.contains('is-ready') &&
      !heroCanvas.classList.contains('is-scrub-hidden')),
    videoVisible: Boolean(heroVideo && heroVideo.classList.contains('is-scrub-visible')),
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

/* ?debug=wheel shows the raw wheel events and how they were counted, so the
   mapping can be calibrated against a real mouse. */
let heroWheelOverlay = null;
let heroWheelOverlayRaf = 0;
function queueHeroWheelOverlay() {
  if (heroWheelOverlayRaf) return;
  heroWheelOverlayRaf = requestAnimationFrame(() => {
    heroWheelOverlayRaf = 0;
    if (!heroWheelOverlay) return;
    const rows = heroWheelLog.slice(-12).map((item, index, all) => {
      const gap = index ? item.t - all[index - 1].t : 0;
      return `+${String(gap).padStart(4)}ms  dY ${String(item.deltaY).padStart(6)}  mode ${item.deltaMode}  wd ${String(item.legacy).padStart(5)}  ${item.kind.padEnd(12)} ${item.notches} notch`;
    });
    heroWheelOverlay.textContent =
      `frame ${presentedFrame} → target ${targetFrame} (${heroFramesPerNotch} f/notch, ω ${heroFollowOmega}, max ${heroMaxSpeed}×)\n` +
      rows.join('\n');
  });
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
  let codec = null;

  try {
    const blob = await fetchEntireVideo(variant.src, options.onProgress || (() => {}), signal);
    if (signal.aborted || serial !== variantSerial) throw abortError();
    if (heroUseCodec) {
      try {
        codec = await openHeroCodec(blob);
      } catch (error) {
        console.warn('WebCodecs unavailable for the hero film; using video seeks:', error);
        codec = null;
      }
      if (signal.aborted || serial !== variantSerial) throw abortError();
    }

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
    if (heroCodec) heroCodec.close();
    heroCodec = codec;
    codec = null;
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
    heroTargetExact = installationFrame;
    heroDisplayExact = installationFrame;

    // The video is only a paused decoder. Frame 0 shows the sharp poster; any
    // other frame is painted onto the full-resolution canvas.
    candidate.pause();
    candidate.classList.remove('is-scrub-visible');
    heroCanvas.classList.remove('is-scrub-hidden');
    installHeroSeekCoalescer(heroVideo, activeVariant);
    clearHeroFrameCache();
    cacheHeroFrame(heroVideo, activeVariant, installationFrame);
    // The film takes over from the poster with a short crossfade.
    heroCanvas.classList.add('is-fading');
    setTimeout(() => heroCanvas.classList.remove('is-fading'), 450);
    compositeHero(installationFrame);
    // Warm the hardware decoder up now (its first frame takes ~0.3 s) by
    // decoding the next frame, so the visitor's first scroll is instant.
    // Replace it with the exact frame from the codec (a <video> seek lands one
    // frame early) - this also warms the hardware decoder up (~0.3 s cold),
    // so the visitor's first scroll is instant.
    if (heroCodec) heroSeekCoalescer.setFrame(installationFrame);

    if (!initial) {
      previousVideo.removeAttribute('src');
      previousVideo.load();
      previousVideo.remove();
      if (previousObjectUrl) URL.revokeObjectURL(previousObjectUrl);
    }

    queueHeroRender({ snap: true });
    return true;
  } catch (error) {
    if (inserted && candidate) {
      candidate.removeAttribute('src');
      candidate.load();
      candidate.remove();
    }
    if (initial && candidate) {
      candidate.classList.remove('is-ready');
      candidate.removeAttribute('src');
      candidate.load();
    }
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    if (codec) codec.close();
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

// Query parameter (for live feel tests) → manifest value → built-in default.
function heroTuningValue(queryKey, manifestValue, fallback, minimum, maximum) {
  const candidates = [params.get(queryKey), manifestValue];
  for (const candidate of candidates) {
    if (candidate === null || candidate === undefined || candidate === '') continue;
    const value = Number(candidate);
    if (Number.isFinite(value) && value >= minimum && value <= maximum) return value;
  }
  return fallback;
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

  const sync = manifest.sync && typeof manifest.sync === 'object' ? manifest.sync : {};
  heroFramesPerNotch = heroTuningValue('fpn', sync.framesPerNotch, HERO_DEFAULT_FRAMES_PER_NOTCH, 1, 140);
  heroFollowOmega = heroTuningValue('w', sync.followOmega, HERO_DEFAULT_FOLLOW_OMEGA, 2, 80);
  heroMaxSpeed = heroTuningValue('speed', sync.maxSpeed, HERO_DEFAULT_MAX_SPEED, 0.5, 12);
  heroLeadNotches = heroTuningValue('lead', sync.leadNotches, HERO_DEFAULT_LEAD_NOTCHES, 0.5, 40);

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

/* The start screen opens as soon as the poster is on screen; the film keeps
   loading in the background. Until it is ready the page scrolls normally over
   the poster (driveHeroByInput ignores input while !heroReady) and a small
   pill shows the progress. */
let startOpen = false;
let startLeft = false;
let filmFailed = false;
let heroLoadPill = null;
let heroPillTimer = 0;
let heroFilmProgress = 0;
const HERO_TOUCH_UI = typeof matchMedia === 'function' && matchMedia('(pointer:coarse)').matches;

function showHeroLoadPill(text) {
  if (!heroLoadPill && text && heroSticky) {
    heroLoadPill = document.createElement('div');
    heroLoadPill.className = 'hero__loading';
    heroLoadPill.setAttribute('aria-hidden', 'true');   // visual only
    heroSticky.appendChild(heroLoadPill);
  }
  if (!heroLoadPill) return;
  if (text) heroLoadPill.textContent = text;
  heroLoadPill.classList.toggle('is-on', Boolean(text));
  heroSticky.classList.toggle('is-film-loading', Boolean(text));
}

function reportFilmProgress(fraction) {
  setLoadProgress(0.05 + clamp(fraction) * 0.95);
  heroFilmProgress = clamp(fraction);
  if (heroLoadPill && heroLoadPill.classList.contains('is-on') && !heroReady && !filmFailed) {
    showHeroLoadPill('Loading film ' + Math.round(heroFilmProgress * 100) + '%');
  }
}

/* There is no start screen any more: the page is usable right away (sound
   stays off until the visitor turns it on in the header). */
function openStart() {
  if (startOpen) return;
  startOpen = true;
  leaveStart(false);
}

function leaveStart(withSound) {
  if (!startOpen || startLeft) return;
  startLeft = true;
  heroPillTimer = setTimeout(() => {
    if (!heroReady && !filmFailed) showHeroLoadPill('Loading film ' + Math.round(heroFilmProgress * 100) + '%');
  }, 800);
  if (withSound) Sound.set(true);
  const start = $('#start');
  if (start) start.classList.add('is-gone');
  document.body.classList.remove('is-loading');
  initSmoothScroll();
  if (lenis) lenis.resize();
  queueHeroMeasure();
  queueHeroRender({ snap: true });
}

function enableStart() {
  heroReady = true;
  setLoadProgress(1);
  clearTimeout(heroPillTimer);
  openStart();
  showHeroLoadPill('');
  document.documentElement.dataset.heroReady = '1';   // QA hook: the film drives now
  if (startLeft) {
    queueHeroMeasure();
    queueHeroRender({ snap: true });
  }
}

function showBootError(error) {
  console.error('Hero video boot failed:', error);
  heroReady = false;
  filmFailed = true;
  clearTimeout(heroPillTimer);
  showHeroLoadPill('');
  openStart();
  // The site stays usable over the static poster.
}

let heroVariantChangeTimer = 0;
function queueVariantChange() {
  clearTimeout(heroVariantChangeTimer);
  heroVariantChangeTimer = setTimeout(handleVariantChange, 250);
}

function handleVariantChange() {
  const key = selectedVariantKey();
  if (key === activeVariantKey) {
    variantSerial += 1;
    if (variantAbort) variantAbort.abort();
    return;
  }
  // A rotated phone keeps the film it already has (no second 40 MB download).
  if (HERO_TOUCH_UI && activeVariantKey && Math.min(screen.width, screen.height) <= 760) return;
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
    // Enter right away; the film keeps loading in the background.
    openStart();
    const key = selectedVariantKey();
    const loaded = await installVariant(key, {
      initial: true,
      onProgress: reportFilmProgress
    });
    if (!loaded) throw abortError();

    if (typeof heroMediaQuery.addEventListener === 'function') {
      heroMediaQuery.addEventListener('change', queueVariantChange);
    } else {
      heroMediaQuery.addListener(queueVariantChange);
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
addEventListener('touchend', () => { heroTouchY = null; }, { capture: true, passive: true });
addEventListener('touchcancel', () => { heroTouchY = null; }, { capture: true, passive: true });
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
  // A focused start button decides for itself (sound or silent).
  if (event.target && event.target.closest && event.target.closest('button')) return;
  if (event.key === 'Enter' && document.body.classList.contains('is-loading') && startOpen) {
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
  if (heroCodec) { heroCodec.close(); heroCodec = null; }
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
    getWheelLog: () => heroWheelLog.map(item => ({ ...item })),
    driveByPixels: pixels => driveHeroByPixels(pixels),
    driveByFrames: frames => driveHeroByInput(frames, frames / heroFramesPerNotch * HERO_PIXELS_PER_NOTCH),
    stopMotion: () => stopHeroMotion(),
    normalizeWheel: input => normalizeHeroWheel(input)
  });
}
if (params.get('debug') === 'wheel') {
  heroWheelOverlay = document.createElement('pre');
  heroWheelOverlay.style.cssText = 'position:fixed;z-index:9999;left:12px;bottom:12px;margin:0;padding:10px 12px;' +
    'max-width:calc(100vw - 24px);overflow:hidden;font:11px/1.45 ui-monospace,Consolas,monospace;' +
    'color:#5ef2d3;background:rgba(0,0,0,.78);border:1px solid rgba(94,242,211,.4);border-radius:8px;pointer-events:none;white-space:pre';
  heroWheelOverlay.textContent = 'wheel debug: scroll inside the hero';
  document.body.appendChild(heroWheelOverlay);
}

/* ?debug=perf: live smoothness meter for the real screen. While the hero is
   moving it counts, per part of the film, refreshes that came late (dropped
   frames), refreshes where the picture stood still although it should move,
   and how long the video decoder needs per frame. */
if (params.get('debug') === 'perf') {
  const zones = [['Anfang 0-70', 70], ['Mitte 70-200', 200], ['Ende 200-280', Infinity]];
  const stats = zones.map(([name]) => ({ name, refreshes: 0, late: 0, stallMs: 0, maxGap: 0, frozen: 0, seeks: [] }));
  const zoneOf = frame => stats[zones.findIndex(([, upTo]) => frame < upTo)];
  const box = document.createElement('pre');
  box.style.cssText = 'position:fixed;z-index:9999;left:12px;top:12px;margin:0;padding:10px 12px;' +
    'font:12px/1.5 ui-monospace,Consolas,monospace;color:#5ef2d3;background:rgba(0,0,0,.82);' +
    'border:1px solid rgba(94,242,211,.4);border-radius:8px;pointer-events:none;white-space:pre';
  document.body.appendChild(box);
  let gpu = 'n/a';
  try {
    const gl = document.createElement('canvas').getContext('webgl');
    const info = gl && gl.getExtension('WEBGL_debug_renderer_info');
    if (info) gpu = String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)).replace(/^ANGLE \(|\)$/g, '').slice(0, 60);
  } catch (error) {}
  let seekStart = 0;
  document.addEventListener('seeking', event => { if (event.target === heroVideo) seekStart = performance.now(); }, true);
  document.addEventListener('eny-decode', event => {
    const zone = zoneOf(presentedFrame < 0 ? 0 : presentedFrame);
    zone.seeks.push(event.detail);
    if (zone.seeks.length > 400) zone.seeks.shift();
  });
  document.addEventListener('seeked', event => {
    if (event.target !== heroVideo || !seekStart) return;
    const zone = zoneOf(presentedFrame < 0 ? 0 : presentedFrame);
    zone.seeks.push(performance.now() - seekStart);
    if (zone.seeks.length > 400) zone.seeks.shift();
    seekStart = 0;
  }, true);
  const pct = (list, q) => {
    if (!list.length) return '-';
    const sorted = list.slice().sort((a, b) => a - b);
    return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))].toFixed(0);
  };
  let last = 0;
  let lastComposite = 0;
  let paintAt = 0;
  const tick = now => {
    const gap = last ? now - last : 0;
    last = now;
    const latest = canvasPresentationHistory.at(-1);
    const drew = latest && latest.now !== lastComposite;
    if (latest) lastComposite = latest.now;
    if (heroMotionActive && gap) {
      const zone = zoneOf(presentedFrame < 0 ? 0 : presentedFrame);
      zone.refreshes += 1;
      if (gap > 25) zone.late += 1;
      if (gap > 50) zone.stallMs += gap;
      zone.maxGap = Math.max(zone.maxGap, gap);
      if (!drew && Math.abs(heroTargetExact - heroDisplayExact) > 1) zone.frozen += 1;
    }
    if (now - paintAt > 250) {
      paintAt = now;
      box.textContent =
        `ENY perf  ${innerWidth}x${innerHeight} @${devicePixelRatio}x  ${gpu}\n` +
        `frame ${presentedFrame}  ${heroMotionActive ? 'bewegt' : 'steht'}  decoder: ${heroCodec ? 'WebCodecs' : 'video seek'}\n\n` +
        'Teil           Refreshes  zu spät  Hänger-ms  max-ms  Bild-steht  Decode p50/p95 ms\n' +
        stats.map(s => `${s.name.padEnd(14)} ${String(s.refreshes).padStart(9)} ${String(s.late).padStart(8)} ` +
          `${String(Math.round(s.stallMs)).padStart(10)} ${String(Math.round(s.maxGap)).padStart(7)} ` +
          `${String(s.frozen).padStart(11)}  ${pct(s.seeks, 0.5)}/${pct(s.seeks, 0.95)}`).join('\n');
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
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
  // Phones show the packages as a sideways row: keep the selected one in view
  // (scrolls only the row, never the page).
  const sel = list.children[i];
  if (sel && list.scrollWidth > list.clientWidth + 1) {
    list.scrollTo({ left: sel.offsetLeft - list.offsetLeft - (list.clientWidth - sel.offsetWidth) / 2, behavior: user ? 'smooth' : 'auto' });
  }
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
  // On touch screens vertical swipes scroll the page (touch-action:pan-y);
  // sideways strokes wipe.
  if (matchMedia('(pointer:coarse)').matches) hint.textContent = 'Swipe sideways to wipe';
  let w, h, finished = false, last = null, lastCheck = 0;
  // Only the car gets dirty: a cut-out of the car (same framing as the photo)
  // clips the grime, and "% clean" counts car pixels only.
  const carMask = new Image();
  let carSamples = null;
  carMask.onload = () => { if (!finished) dirty(); };
  carMask.src = 'assets/photos/(C)-18-bentley-car-mask.png';
  function drawCover(ctx, image) {
    // same placement as the photo's object-fit: cover, centred
    const s = Math.max(w / image.naturalWidth, h / image.naturalHeight);
    const dw = image.naturalWidth * s, dh = image.naturalHeight * s;
    ctx.drawImage(image, (w - dw) / 2, (h - dh) / 2, dw, dh);
  }
  function clipToCar() {
    carSamples = null;
    if (!carMask.complete || !carMask.naturalWidth) return;
    c.globalCompositeOperation = 'destination-in';
    drawCover(c, carMask);
    c.globalCompositeOperation = 'source-over';
    const probe = document.createElement('canvas'); probe.width = w; probe.height = h;
    const pc = probe.getContext('2d', { willReadFrequently: true });
    drawCover(pc, carMask);
    const md = pc.getImageData(0, 0, w, h).data;
    carSamples = [];
    for (let i = 3; i < md.length; i += 4 * 97) if (md[i] > 128) carSamples.push(i);
  }

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
    clipToCar();
    finished = false; done.classList.remove('is-on'); hint.style.opacity = 1; cv.style.transition = ''; cv.style.opacity = 1; update(0);
  }
  function update(v) { meter.style.width = v + '%'; pct.textContent = v + '% clean'; }
  function stroke(x, y) {
    if (finished) return;   // the meter stays at 100 % once the car shines
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
    if (carSamples && carSamples.length) {
      for (const i of carSamples) { tot++; if (d[i] < 60) clear++; }
    } else {
      for (let i = 3; i < d.length; i += 4 * 97) { tot++; if (d[i] < 60) clear++; }
    }
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
  // Redraw only if the box itself changed size: phone toolbars collapsing on
  // scroll fire 'resize' too and must not wipe the visitor's progress.
  let rs; addEventListener('resize', () => {
    clearTimeout(rs);
    rs = setTimeout(() => {
      const r = box.getBoundingClientRect();
      if (!finished && (Math.round(r.width) !== w || Math.round(r.height) !== h)) dirty();
    }, 300);
  });
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
    { vid: 'lyriq-wash', k: 'Mercedes-Benz', n: 'GLE Coupé' },
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
    ['🕶️', 'Window Tint', 'Privacy and a cooler cabin', '#5ef2d3'],
    ['💎', 'Ceramic Tint', 'Premium ceramic film', '#7fd8ff'],
    ['🛡️', 'Paint Protection Film', 'Clear film against chips and scratches', '#9b4dff'],
    ['🎨', 'Vehicle Wraps', 'Any color · 3M · Avery Dennison · XPEL', '#ff4fa0'],
    ['✨', 'Ceramic Coating', 'Deep gloss that stays', '#5ef2d3'],
    ['🔧', 'Powder Coating', 'Wheels in any finish', '#ff8a2a'],
    ['🔴', 'Caliper Painting', 'Color behind the spokes', '#ff3d3d'],
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
  // 12th tile: a way to ask for anything else (also keeps the grid even).
  const ask = document.createElement('a');
  ask.className = 'tile tile--ask';
  ask.href = 'https://ig.me/m/enymotors'; ask.target = '_blank'; ask.rel = 'noopener';
  ask.style.setProperty('--tc', '#5ef2d355'); ask.style.setProperty('--tcs', '#5ef2d3');
  ask.innerHTML = '<span class="tile__ic">💬</span><b>Something else?</b><small>DM @enymotors on Instagram</small>';
  g.appendChild(ask);
})();

/* background clips: only play when visible */
(() => {
  const io = new IntersectionObserver(es => es.forEach(e => e.isIntersecting ? e.target.play().catch(() => {}) : e.target.pause()));
  document.querySelectorAll('.self__bg,.visit__bg').forEach(v => io.observe(v));
})();
})();
