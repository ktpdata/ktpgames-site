// Ghost laps: record the player's lap, play the best one back translucent, and measure the gap to it.
(function () {
  "use strict";
  const { lerp, wrapAngle } = BDR.math;
  const INTERVAL = 1 / 20;     // seconds between samples
  const MAX_SAMPLES = 36000;   // 30 minutes

  /** Records [t, x, y, z, heading, distance] from the start of each lap. */
  function createRecorder() {
    let samples = [], last = -Infinity;
    return {
      begin() {
        samples = [];
        last = -Infinity;
      },
      sample(lapTime, car, distance) {
        if (lapTime - last < INTERVAL - 1e-9 || samples.length >= MAX_SAMPLES) return;
        last = lapTime;
        samples.push([round(lapTime, 3), round(car.x, 2), round(car.y, 2), round(car.z, 2), round(car.heading, 4), round(distance, 2)]);
      },
      finish(ms, carId) {
        return { time: ms, car: carId, samples: samples.slice() };
      },
      get count() {
        return samples.length;
      },
    };
  }
  const round = (v, places) => Math.round(v * 10 ** places) / 10 ** places;

  /** Mirror of the native GhostArchive checks, so a bad run is never sent. */
  function isValid(run) {
    if (!run || typeof run.time !== "number" || !Array.isArray(run.samples)) return false;
    if (run.time < 5000 || run.time > 1800000) return false;
    if (run.samples.length < 2 || run.samples.length > MAX_SAMPLES) return false;
    let prev = -Infinity;
    for (const s of run.samples) {
      if (!Array.isArray(s) || s.length !== 6 || !s.every((v) => typeof v === "number" && isFinite(v))) return false;
      if (s[0] <= prev) return false;
      prev = s[0];
    }
    return true;
  }

  /** Plays a recorded run back by lap time, and answers "when did the ghost reach distance d?". */
  function createPlayback(run) {
    const s = run.samples;
    let cursor = 0;
    function poseAt(t) {
      if (t <= s[0][0]) cursor = 0;
      while (cursor < s.length - 2 && s[cursor + 1][0] < t) cursor++;
      while (cursor > 0 && s[cursor][0] > t) cursor--;
      const a = s[cursor], b = s[Math.min(cursor + 1, s.length - 1)];
      const k = b[0] > a[0] ? Math.min(Math.max((t - a[0]) / (b[0] - a[0]), 0), 1) : 0;
      return { x: lerp(a[1], b[1], k), y: lerp(a[2], b[2], k), z: lerp(a[3], b[3], k),
        heading: a[4] + wrapAngle(b[4] - a[4]) * k, distance: lerp(a[5], b[5], k), done: t >= s[s.length - 1][0] };
    }
    /** Ghost's lap time, in seconds, when it had covered `distance` metres. */
    function timeAt(distance) {
      let lo = 0, hi = s.length - 1;
      if (distance <= s[0][5]) return s[0][0];
      if (distance >= s[hi][5]) return s[hi][0];
      while (hi - lo > 1) {
        const mid = (lo + hi) >> 1;
        if (s[mid][5] < distance) lo = mid;
        else hi = mid;
      }
      const a = s[lo], b = s[hi];
      const k = b[5] > a[5] ? (distance - a[5]) / (b[5] - a[5]) : 0;
      return lerp(a[0], b[0], k);
    }
    return { run, poseAt, timeAt };
  }

  /** Gap in ms between the player and the ghost at the player's current distance (negative = ahead). */
  function gap(playback, lapTime, distance) {
    if (!playback || distance < 20) return null;
    return Math.round((lapTime - playback.timeAt(distance)) * 1000);
  }

  // Native ghost files, one per track/layout. Outside the app they live in memory.
  const memory = new Map();
  const handler = () => window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.ghost;
  async function load(key, car) {
    const h = handler();
    if (!h) return memory.get(key + "/" + car) || null;
    try {
      const reply = await h.postMessage({ op: "load", layout: key, car });
      return isValid(reply) ? reply : null;
    } catch (e) {
      return null;
    }
  }
  async function save(key, car, run) {
    if (!isValid(run)) return false;
    const h = handler();
    if (!h) {
      const prior = memory.get(key + "/" + car);
      if (prior && prior.time <= run.time) return false;
      memory.set(key + "/" + car, run);
      return true;
    }
    try {
      return (await h.postMessage({ op: "save", layout: key, car, run })) === true;
    } catch (e) {
      return false;
    }
  }

  BDR.ghost = { createRecorder, createPlayback, gap, isValid, load, save, INTERVAL, MAX_SAMPLES };
})();
