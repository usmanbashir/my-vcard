// app.js — boot, card switching (swipe), persistence, battery management, tilt, SW.

(function () {
  'use strict';

  var CARDS = [
    {
      key: 'grid', label: 'Synthwave Grid', brand: 'wavecraft', center: true,
      texture: window.WAVECRAFT_LOGO || null,
      palette: { name: 'Magenta / Cyan', a: '#ff2bd6', b: '#1a0033', c: '#ff6ec7', d: '#2de2ff' },
    },
    {
      key: 'aurora', label: 'Aurora Nebula', brand: 'personal',
      palette: { name: 'Aurora Teal', a: '#0a1230', b: '#123a5a', c: '#1d6b8c', d: '#5fffd0' },
    },
    {
      key: 'prism', label: 'Prism Spectrum', brand: 'prismcx',
      iconAccents: ['#ff6ec7', '#5fb6ff', '#ffcf5f', '#5fe0a8'],
      palette: { name: 'Full Spectrum', a: '#ffffff', b: '#ffffff', c: '#ffffff', d: '#ffffff' },
    },
  ];

  var STORE_KEY = 'vcards.active';
  var HINT_KEY = 'vcards.hintShown';

  var app = document.getElementById('app');
  var stage = document.getElementById('stage');
  var canvas = document.getElementById('gl');
  var overlay = document.getElementById('overlay');
  var hintEl = document.getElementById('hint');

  var engine = new ShaderEngine(canvas);
  engine.params.speed = 0.5;
  engine.params.intensity = 1.0;
  engine.params.grain = 0.05;
  engine.params.glow = 1.0;

  var idx = 1; // default: Aurora Nebula
  try {
    var saved = localStorage.getItem(STORE_KEY);
    for (var i = 0; i < CARDS.length; i++) if (CARDS[i].key === saved) idx = i;
  } catch (e) { /* storage unavailable */ }

  var scanOpen = false;
  var transitioning = false;

  function onScanOpen() { scanOpen = true; syncRunning(); }
  function onScanClose() { scanOpen = false; syncRunning(); }

  function mountCard(i) {
    var c = CARDS[i];
    engine.params.palette = c.palette;
    engine.use(c.key, c.texture || null);
    var card = VCard.renderCard({
      brand: c.brand,
      accent: c.palette.d,
      iconAccents: c.iconAccents || null,
      center: !!c.center,
      onScanOpen: onScanOpen,
      onScanClose: onScanClose,
    });
    overlay.replaceChildren(card);
    try { localStorage.setItem(STORE_KEY, c.key); } catch (e) { /* noop */ }
  }

  // ── switching with a slide transition (single canvas — swap program mid-flight) ──
  function commitSwitch(dir, targetIdx) {
    if (transitioning) return;
    idx = targetIdx != null ? targetIdx : (idx + dir + CARDS.length) % CARDS.length;
    // page hidden (or reduced motion): switch instantly, no stalled animations
    if (document.visibilityState !== 'visible') {
      mountCard(idx);
      return;
    }
    transitioning = true;
    var W = window.innerWidth;
    var from = getComputedStyle(stage).transform;
    var out = stage.animate(
      [
        { transform: from === 'none' ? 'translateX(0px)' : from, opacity: stage.style.opacity || 1 },
        { transform: 'translateX(' + (-dir * W * 0.45) + 'px)', opacity: 0 },
      ],
      { duration: 170, easing: 'cubic-bezier(0.4, 0, 0.8, 1)' }
    );
    out.onfinish = function () {
      stage.style.transform = '';
      stage.style.opacity = '';
      mountCard(idx);
      var inA = stage.animate(
        [
          { transform: 'translateX(' + (dir * W * 0.45) + 'px)', opacity: 0 },
          { transform: 'translateX(0px)', opacity: 1 },
        ],
        { duration: 240, easing: 'cubic-bezier(0.16, 0.84, 0.3, 1)' }
      );
      inA.onfinish = function () { transitioning = false; };
    };
  }

  function snapBack() {
    var from = stage.style.transform || 'translateX(0px)';
    stage.style.transform = '';
    stage.style.opacity = '';
    stage.animate(
      [{ transform: from, opacity: 0.85 }, { transform: 'translateX(0px)', opacity: 1 }],
      { duration: 200, easing: 'cubic-bezier(0.16, 0.84, 0.3, 1)' }
    );
  }

  // ── swipe gesture (lives on the stage; shader drag still works for vertical/short moves) ──
  var g = { id: null, x0: 0, y0: 0, t0: 0, swiping: false, suppressed: false };

  stage.addEventListener('pointerdown', function (e) {
    if (transitioning) return;
    g.id = e.pointerId;
    g.x0 = e.clientX; g.y0 = e.clientY; g.t0 = performance.now();
    g.swiping = false;
  });

  stage.addEventListener('pointermove', function (e) {
    if (g.id !== e.pointerId || transitioning) return;
    var dx = e.clientX - g.x0, dy = e.clientY - g.y0;
    if (!g.swiping && Math.abs(dx) > 26 && Math.abs(dx) > 1.5 * Math.abs(dy)) {
      g.swiping = true;
      engine.cancelPress();
    }
    if (g.swiping) {
      var w = window.innerWidth;
      stage.style.transform = 'translateX(' + dx * 0.55 + 'px)';
      stage.style.opacity = String(1 - Math.min(0.3, Math.abs(dx) / w * 0.45));
    }
  });

  function endGesture(e) {
    if (g.id !== e.pointerId) return;
    g.id = null;
    if (!g.swiping) return;
    g.suppressed = true; // swallow the click this gesture would produce
    var dx = e.clientX - g.x0;
    var dt = Math.max(1, performance.now() - g.t0);
    var velocity = Math.abs(dx) / dt; // px per ms
    var commit = Math.abs(dx) > Math.min(96, window.innerWidth * 0.22) || velocity > 0.55;
    g.swiping = false;
    if (commit) {
      commitSwitch(dx < 0 ? 1 : -1);
    } else {
      snapBack();
    }
  }
  stage.addEventListener('pointerup', endGesture);
  stage.addEventListener('pointercancel', function (e) {
    if (g.id === e.pointerId) { g.id = null; if (g.swiping) { g.swiping = false; snapBack(); } }
  });

  // suppress link clicks that were really swipes
  stage.addEventListener('click', function (e) {
    if (g.suppressed) {
      e.preventDefault();
      e.stopPropagation();
      g.suppressed = false;
    }
  }, true);

  // keyboard (desktop convenience)
  window.addEventListener('keydown', function (e) {
    if (e.key === 'ArrowRight') commitSwitch(1);
    if (e.key === 'ArrowLeft') commitSwitch(-1);
  });

  // ── battery: render only when the app is actually visible (and no scan overlay) ──
  function syncRunning() {
    var ok = document.visibilityState === 'visible' && !scanOpen;
    if (ok) engine.start(); else engine.stop();
  }
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible') tiltBaseline = null; // re-center tilt on return
    syncRunning();
  });
  window.addEventListener('pagehide', function () { engine.stop(); });
  window.addEventListener('pageshow', syncRunning);
  document.addEventListener('freeze', function () { engine.stop(); });
  document.addEventListener('resume', syncRunning);

  // ── tilt parallax (no permission prompt needed on Android) ──
  var tiltBaseline = null;
  window.addEventListener('deviceorientation', function (e) {
    if (e.gamma == null && e.beta == null) return;
    if (!tiltBaseline) tiltBaseline = { beta: e.beta || 0, gamma: e.gamma || 0 };
    var clamp = function (v) { return Math.max(-1.3, Math.min(1.3, v)); };
    var gx = clamp(((e.gamma || 0) - tiltBaseline.gamma) / 28);
    var gy = clamp(((e.beta || 0) - tiltBaseline.beta) / 28);
    engine.tilt.x += (gx - engine.tilt.x) * 0.22;
    engine.tilt.y += (gy - engine.tilt.y) * 0.22;
  }, true);

  // ── first-run hint ──
  (function () {
    var shown = 0;
    try { shown = parseInt(localStorage.getItem(HINT_KEY) || '0', 10); } catch (e) { /* noop */ }
    if (shown < 3) {
      hintEl.classList.add('visible');
      try { localStorage.setItem(HINT_KEY, String(shown + 1)); } catch (e) { /* noop */ }
      setTimeout(function () { hintEl.classList.remove('visible'); }, 4500);
    }
  })();

  // ── boot ──
  mountCard(idx);
  syncRunning();

  // ── service worker (only top-level + secure context, so previews stay clean) ──
  if ('serviceWorker' in navigator && window.self === window.top &&
      (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('./sw.js').catch(function (err) {
        console.warn('SW registration failed', err);
      });
    });
  }
})();
