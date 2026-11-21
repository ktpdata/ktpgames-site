// Brain Drain Racing namespace, seeded random, events and math helpers.
// No game file may call Math.random or read the clock; randomness comes from BDR.rng and dates are injected.
(function () {
  "use strict";
  const BDR = (window.BDR = window.BDR || {});

  /** Mulberry32: small, fast, deterministic. Returns a function giving values in [0, 1). */
  BDR.rng = function (seed) {
    let a = seed >>> 0;
    const next = function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    next.range = (lo, hi) => lo + (hi - lo) * next();
    next.int = (lo, hi) => lo + Math.floor(next() * (hi - lo + 1));
    next.pick = (list) => list[Math.floor(next() * list.length)];
    next.shuffle = (list) => {
      const out = list.slice();
      for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [out[i], out[j]] = [out[j], out[i]];
      }
      return out;
    };
    return next;
  };

  /** FNV-1a string hash, for turning ids and day keys into seeds. */
  BDR.hash = function (text) {
    let h = 0x811c9dc5;
    for (let i = 0; i < text.length; i++) {
      h ^= text.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    return h >>> 0;
  };

  /**
   * The one place that decides which "day" a date belongs to. Daily lap and saved daily bests use only this.
   * Rollover rule: local midnight (pending Arthur's decision; change it here only).
   */
  BDR.dayKey = function (date) {
    const pad = (n) => String(n).padStart(2, "0");
    return date.getFullYear() + "-" + pad(date.getMonth() + 1) + "-" + pad(date.getDate());
  };
  BDR.isDayKey = (key) => typeof key === "string" && /^\d{4}-\d{2}-\d{2}$/.test(key);

  // Simple event hub so modules stay decoupled.
  const listeners = new Map();
  BDR.on = function (name, fn) {
    if (!listeners.has(name)) listeners.set(name, []);
    listeners.get(name).push(fn);
  };
  BDR.emit = function (name, ...args) {
    (listeners.get(name) || []).forEach((fn) => fn(...args));
  };

  const M = (BDR.math = {});
  M.clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
  M.lerp = (a, b, t) => a + (b - a) * t;
  M.smooth = (t) => t * t * (3 - 2 * t);
  M.wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));
  M.approach = (v, target, step) => (v < target ? Math.min(target, v + step) : Math.max(target, v - step));
  M.sign = (v) => (v < 0 ? -1 : 1);
  /** Wrap a distance into [0, length). */
  M.wrap = (s, length) => ((s % length) + length) % length;
  M.mph = (metresPerSecond) => metresPerSecond * 2.236936;
  /** Format milliseconds as m:ss.mmm. */
  M.formatTime = function (ms) {
    if (!(ms >= 0) || !isFinite(ms)) return "–:––.–––";
    const total = Math.round(ms);
    const m = Math.floor(total / 60000);
    const s = Math.floor((total % 60000) / 1000);
    const f = total % 1000;
    return m + ":" + String(s).padStart(2, "0") + "." + String(f).padStart(3, "0");
  };
  /** Signed gap in seconds, e.g. +0.42 or -1.08. */
  M.formatGap = function (ms) {
    const sign = ms < 0 ? "−" : "+";
    return sign + (Math.abs(ms) / 1000).toFixed(2);
  };
})();
