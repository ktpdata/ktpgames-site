// Lap timing: start line, ten checkpoints crossed in order, and the corner-cut rule.
(function () {
  "use strict";
  const CHECKPOINTS = 10;

  /**
   * options.limitMargin: metres past the road edge allowed before all four wheels count as off.
   */
  function createLapTimer(track, options) {
    const opts = Object.assign({ limitMargin: 1.2 }, options || {});
    const L = track.length;
    const t = {
      started: false, startTime: 0, lap: 0, laps: [], best: null, current: 0,
      next: 1, cut: false, awaitLine: false, finished: false, splits: [], lastSplit: null, prev: null, backward: false,
    };

    /** Distance travelled from the start line, 0..L. */
    const progress = (s) => (track.closed ? BDR.math.wrap(s - track.startS, L) : s - track.startS);

    function beginLap(time) {
      t.started = true;
      t.startTime = time;
      t.lap += 1;
      t.next = 1;
      t.cut = false;
      t.splits = [];
      if (!opts.quiet) BDR.emit("lapStart", t);
    }

    function finishLap(time) {
      const ms = Math.round((time - t.startTime) * 1000);
      const valid = t.next === CHECKPOINTS && !t.cut;
      const record = { lap: t.lap, ms, valid, missed: t.next !== CHECKPOINTS, cut: t.cut, splits: t.splits.slice() };
      t.laps.push(record);
      if (valid && (t.best === null || ms < t.best)) t.best = ms;
      if (!opts.quiet) BDR.emit("lap", record, t);
      return record;
    }

    /** The car is off when all four wheels are past the road edge by more than the allowed margin. */
    function isOff(car) {
      const p = car.trackSample || track.sampleAt(car.s);
      if (car.inPit) return false; // the pit lane is not a corner cut
      return Math.abs(car.offset) - car.spec.size.width / 2 > p.w / 2 + opts.limitMargin;
    }

    return {
      state: t,
      CHECKPOINTS,
      /** Start the clock now (standing starts, rally stages). A car on a grid behind the line must cross it first. */
      go(time, car) {
        beginLap(time);
        t.awaitLine = !!(car && track.closed && progress(car.s) > L / 2);
        if (car) t.prev = progress(car.s);
      },
      update(car, time) {
        const d = progress(car.s);
        t.current = t.started ? time - t.startTime : 0;
        if (t.prev === null) {
          t.prev = d;
          return null;
        }
        const prev = t.prev;
        t.prev = d;
        if (t.finished) return null;
        let event = null;
        if (t.started && isOff(car) && !t.cut) {
          t.cut = true;
          if (!opts.quiet) BDR.emit("cut", t);
        }
        const jump = d - prev;
        if (track.closed && Math.abs(jump) > L / 2) {
          if (jump < 0) {
            // Forward across the line.
            if (t.backward) t.backward = false;
            else if (!t.started) beginLap(time);
            else if (t.awaitLine) t.awaitLine = false; // standing start from a grid behind the line
            else {
              event = finishLap(time);
              beginLap(time);
            }
          } else {
            t.backward = true; // reversed back over the line; nothing counts until it is recrossed
          }
          return event;
        }
        if (!t.started || t.backward) return null;
        // A jump along the track (a respawn or reset) never earns a checkpoint.
        if (Math.abs(jump) > 25) return null;
        // Checkpoints: each at a tenth of the lap, crossed going forward, strictly in order.
        const cp = (t.next * L) / CHECKPOINTS;
        if (t.next < CHECKPOINTS && prev < cp && d >= cp) {
          const split = Math.round((time - t.startTime) * 1000);
          t.splits.push(split);
          t.lastSplit = { index: t.next, ms: split };
          if (!opts.quiet) BDR.emit("checkpoint", t.next, split, t);
          t.next += 1;
        }
        if (!track.closed && d >= L - 0.5) {
          event = finishLap(time);
          t.finished = true;
        }
        return event;
      },
    };
  }

  BDR.createLapTimer = createLapTimer;
  BDR.laps = { CHECKPOINTS };
})();
