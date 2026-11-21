// Driving school: turns a lesson into a stretch of road, markers and a pass mark, and judges the drive.
(function () {
  "use strict";
  const { wrap, mph } = BDR.math;
  const CORNER_RADIUS = 120;

  /** Corners in lap order from the start line: { entry, apex, exit, dir (1 right, -1 left), radius }. */
  function corners(track) {
    const out = [], n = track.samples.length, limit = 1 / CORNER_RADIUS;
    const order = [];
    const first = Math.floor(track.startS / track.step);
    for (let k = 0; k < n; k++) order.push(track.closed ? (first + k) % n : k);
    let current = null;
    for (const i of order) {
      const p = track.samples[i];
      const dir = p.curve > limit ? 1 : p.curve < -limit ? -1 : 0;
      if (current && dir === current.dir) {
        current.exit = p.s;
        if (Math.abs(p.curve) > current.peak) { current.peak = Math.abs(p.curve); current.apex = p.s; }
      } else {
        if (current && current.dir) out.push(current);
        current = dir ? { dir, entry: p.s, apex: p.s, exit: p.s, peak: Math.abs(p.curve) } : null;
      }
    }
    if (current && current.dir) out.push(current);
    return out.map((c) => Object.assign(c, { radius: 1 / c.peak }));
  }

  /** The stretch of road, markers and limits for a lesson on a built track. */
  function plan(lesson, track, car) {
    const L = track.length;
    const out = { lesson, from: 0, to: L, markers: [], lap: false };
    if (lesson.goal.kind === "lap" || lesson.goal.kind === "timedLap") {
      out.lap = true;
      return out;
    }
    if (lesson.corner !== undefined) {
      const list = corners(track);
      let c = lesson.corner === "tightest" ? list.slice().sort((a, b) => b.peak - a.peak)[0] : list[lesson.corner % list.length];
      const last = lesson.corners ? list[(list.indexOf(c) + lesson.corners - 1) % list.length] : c;
      out.corner = c;
      out.from = c.entry - lesson.before;
      out.to = c.entry + track.ahead(c.entry, last.exit) + lesson.after;
      const safe = Math.sqrt((car.spec.grip * 9.81) / c.peak);
      if (lesson.goal.kind === "entrySpeed") out.maxSpeed = safe * lesson.goal.factor;
      out.markers.push({ s: c.entry, kind: "entry" }, { s: c.apex, kind: "apex" }, { s: c.exit, kind: "exit" });
    } else {
      out.from = track.startS + lesson.from * L;
      out.to = track.startS + lesson.to * L;
    }
    return out;
  }

  /**
   * Judge a lesson as it is driven. update() returns null while running, or { pass, reason } when decided.
   * progress: metres from the section start. Section time limits are set from `limitMs` when given.
   */
  function createJudge(p, track, options) {
    const goal = p.lesson.goal;
    const state = { offTime: 0, slid: false, done: null, prev: null, checked: {}, time: 0 };
    const limitMs = options && options.limitMs;
    const length = p.lap ? track.length : track.ahead(wrap(p.from, track.length), wrap(p.to, track.length));
    const progress = (car) => track.ahead(wrap(p.from, track.length), car.s);
    const decide = (pass, reason) => (state.done = { pass, reason });
    const outsideShare = (car, dir) => (-dir * car.offset) / (car.trackSample.w / 2);

    return {
      state,
      length,
      update(car, dt, lapRecord) {
        if (state.done) return state.done;
        state.time += dt;
        if (p.lap) {
          if (!lapRecord) return null;
          if (!lapRecord.valid) return decide(false, lapRecord.cut ? "schoolOffRoad" : "schoolMissed");
          if (goal.kind === "timedLap" && lapRecord.ms > options.medalMs) return decide(false, "schoolTooSlow");
          return decide(true, "schoolPassed");
        }
        const d = progress(car);
        const half = car.trackSample.w / 2;
        const off = Math.abs(car.offset) - car.spec.size.width / 2 > half + (options.limitMargin || 0);
        if (off) state.offTime += dt;
        if (state.offTime > (goal.offSeconds || 0) + 1e-9) return decide(false, "schoolOffRoad");
        if (Math.abs(car.slip || 0) > (goal.slip || Infinity)) state.slid = true;
        for (const m of p.markers) {
          if (state.checked[m.kind]) continue;
          const md = track.ahead(wrap(p.from, track.length), wrap(m.s, track.length));
          if (state.prev === null || state.prev >= md || d < md) continue;
          state.checked[m.kind] = true;
          const dir = p.corner.dir;
          if (goal.kind === "entrySpeed" && m.kind === "entry" && car.speed > p.maxSpeed) return decide(false, "schoolTooFast");
          if (goal.kind === "entryLine" && m.kind === "entry" && outsideShare(car, dir) < goal.share) return decide(false, "schoolNotOutside");
          if (goal.kind === "apexLine" && m.kind === "apex" && -outsideShare(car, dir) < goal.share) return decide(false, "schoolMissedApex");
          if (goal.kind === "exitLine" && m.kind === "exit" && outsideShare(car, dir) < goal.share) return decide(false, "schoolNarrowExit");
        }
        state.prev = d;
        if (d >= length && d < length + 50) {
          if (limitMs && state.time * 1000 > limitMs) return decide(false, "schoolTooSlow");
          if (goal.kind === "slide" && !state.slid) return decide(false, "schoolNoSlide");
          return decide(true, "schoolPassed");
        }
        return null;
      },
    };
  }

  /** Target in mph for the HUD's goal line. */
  function goalText(p) {
    const key = "lessonGoal." + p.lesson.id;
    return BDR.t(key, { mph: p.maxSpeed ? Math.floor(mph(p.maxSpeed) / 5) * 5 : "" });
  }

  BDR.school = { corners, plan, createJudge, goalText };
})();
