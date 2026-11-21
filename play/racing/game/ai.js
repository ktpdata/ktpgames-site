// Computer drivers: a racing line from the track's curvature, a target speed for every point with braking
// planned ahead of each corner, a skill value with small seeded errors, and moving aside to pass.
// Cars are circles that push apart on contact. No spins from contact, and no catch-up help.
(function () {
  "use strict";
  const { clamp, wrap, wrapAngle, lerp } = BDR.math;
  const G = 9.81;
  const EDGE = 1.6;              // metres the line keeps from the road edge
  const ALONGSIDE = 2.6;         // centre-to-centre gap kept from a car running beside this one
  const BUMP = 0.5;              // m/s closing speed below which contact is a slide, not a bump

  /**
   * The racing line as a lateral offset per lookup sample: an elastic band pulled tight between the road
   * edges, which approximates the minimum-curvature line. Also returns the line's curvature per sample.
   */
  function racingLine(track) {
    const { samples, closed } = track;
    const n = samples.length;
    const idx = (i) => (closed ? wrap(i, n) : clamp(i, 0, n - 1));
    const off = new Float64Array(n);
    const px = (i) => samples[i].x + samples[i].rx * off[i];
    const pz = (i) => samples[i].z + samples[i].rz * off[i];
    // Each pass moves a point to where the path's second difference would vary least (a discrete
    // fourth-difference step), at coarse then finer spacing. Stationary paths minimise total curvature.
    for (const [k, passes] of [[8, 160], [4, 160], [2, 120]]) {
      for (let pass = 0; pass < passes; pass++) {
        for (let i = 0; i < n; i++) {
          if (!closed && (i < 2 * k || i >= n - 2 * k)) continue;
          const a = idx(i - 2 * k), b = idx(i - k), c = idx(i + k), d = idx(i + 2 * k);
          const mx = (-px(a) + 4 * px(b) + 4 * px(c) - px(d)) / 6, mz = (-pz(a) + 4 * pz(b) + 4 * pz(c) - pz(d)) / 6;
          const p = samples[i];
          const target = (mx - p.x) * p.rx + (mz - p.z) * p.rz;
          const limit = p.w / 2 - EDGE;
          off[i] = clamp(lerp(off[i], target, 0.5), -limit, limit);
        }
      }
    }
    const curve = curvatureOf(track, off);
    return { offset: off, curve };
  }

  /** Curvature of a path given as a lateral offset per sample, from the turn between nearby points. */
  function curvatureOf(track, off) {
    const { samples, closed } = track;
    const n = samples.length;
    const idx = (i) => (closed ? wrap(i, n) : clamp(i, 0, n - 1));
    const px = (i) => samples[i].x + samples[i].rx * off[i];
    const pz = (i) => samples[i].z + samples[i].rz * off[i];
    const curve = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      const a = idx(i - 3), b = idx(i), c = idx(i + 3);
      const h1 = Math.atan2(px(b) - px(a), -(pz(b) - pz(a))), h2 = Math.atan2(px(c) - px(b), -(pz(c) - pz(b)));
      const len = Math.hypot(px(c) - px(a), pz(c) - pz(a)) || 1;
      curve[i] = wrapAngle(h2 - h1) / (len / 2);
    }
    return curve;
  }

  /** Target speed at every sample for a car and a grip margin, with braking planned backwards from corners. */
  function speedPlan(track, line, spec, margin) {
    const n = track.samples.length, step = track.step;
    const v = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      const c = Math.max(Math.abs(line.curve[i]), 1e-4);
      v[i] = Math.min(spec.topSpeed, Math.sqrt((spec.grip * G * margin) / c));
    }
    const brake = spec.brake * 0.72;
    const passes = track.closed ? 2 : 1;
    for (let pass = 0; pass < passes; pass++) {
      for (let i = n - 1; i >= 0; i--) {
        const next = track.closed ? (i + 1) % n : Math.min(i + 1, n - 1);
        v[i] = Math.min(v[i], Math.sqrt(v[next] * v[next] + 2 * brake * step));
      }
    }
    return v;
  }

  /** Per-track work shared by every driver: computed once per layout. */
  function prepare(track) {
    if (!track.aiLine) track.aiLine = racingLine(track);
    return track.aiLine;
  }

  /**
   * A computer driver. skill 0..1 scales corner speed; errors are small, seeded and smooth.
   * opts: { seed, skill, name, color }.
   */
  function createDriver(car, track, opts) {
    const line = prepare(track);
    const rng = BDR.rng(opts.seed || 1);
    const skill = clamp(opts.skill === undefined ? 0.8 : opts.skill, 0, 1);
    const margin = 0.6 + 0.38 * skill;
    const plan = speedPlan(track, line, car.spec, margin);
    // Smooth error: a slow wander off the line and a braking-point bias that drifts lap to lap.
    const wobble = { phase: rng() * 6.28, speed: rng.range(0.15, 0.35), size: (1 - skill) * 1.4 + 0.15 };
    const brakeBias = { value: 0, target: 0, timer: 0 };
    const driver = { car, skill, plan, name: opts.name, avoid: 0, time: 0 };

    driver.drive = function (others, dt) {
      driver.time += dt;
      const L = track.length, n = track.samples.length;
      brakeBias.timer -= dt;
      if (brakeBias.timer <= 0) {
        brakeBias.timer = rng.range(4, 9);
        brakeBias.target = rng.range(-1, 1) * (1 - skill) * 0.08;
      }
      brakeBias.value = lerp(brakeBias.value, brakeBias.target, dt * 0.5);
      const speed = Math.max(0, car.speed);
      const lookAhead = clamp(6 + speed * 0.55, 8, 32);
      const s = car.s + lookAhead;
      const i = Math.floor(wrap(s, track.closed ? L : L + 1) / track.step) % n;
      const p = track.sampleAt(s);
      const errorOffset = Math.sin(driver.time * wobble.speed + wobble.phase) * wobble.size;
      const hold = avoid(others, dt);
      const half = p.w / 2 - 1.2;
      let lo = -half, hi = half;
      // Never steer into a car that is already alongside: keep a car's width of daylight between them.
      for (const o of others) {
        if (o === car || o.inPit) continue;
        const g = track.ahead(car.s, o.s), gap = g > L / 2 ? g - L : g;
        if (Math.abs(gap) > (car.spec.size.length + o.spec.size.length) / 2 + 1) continue;
        const lateral = o.offset - car.offset;
        if (Math.abs(lateral) > 4) continue;
        if (lateral > 0) hi = Math.min(hi, o.offset - ALONGSIDE);
        else lo = Math.max(lo, o.offset + ALONGSIDE);
      }
      // headFor: an offset to hold instead of the racing line (lining up for the pit entry).
      const aim = driver.headFor !== null && driver.headFor !== undefined ? driver.headFor : line.offset[i] + errorOffset + driver.avoid;
      const targetOffset = lo <= hi ? clamp(aim, lo, hi) : clamp(car.offset, -half, half);
      const tx = p.x + p.rx * targetOffset, tz = p.z + p.rz * targetOffset;
      const want = Math.atan2(tx - car.x, -(tz - car.z));
      const err = wrapAngle(want - car.heading);
      const steer = clamp(err * 2.6, -1, 1);
      // Speed: the plan a little way ahead, so braking starts before the corner.
      let target = Infinity;
      for (let d = 0; d <= 20; d += 4) {
        const k = Math.floor(wrap(car.s + d + speed * 0.25, track.closed ? L : L + 1) / track.step) % n;
        target = Math.min(target, plan[k]);
      }
      target = Math.min(target * (1 + brakeBias.value), hold);
      const brake = speed > target + 0.6 ? 1 : 0;
      return { steer, brake, throttle: brake ? 0 : speed < target ? 1 : 0 };
    };

    /**
     * Move aside for a car close ahead: pass on the side with more room, then drift back to the line.
     * Returns the speed to hold if there is no room to get by, so followers queue instead of bumping.
     */
    function avoid(others, dt) {
      let hold = Infinity, nearest = null, nearestGap = Infinity;
      const L = track.length;
      for (const o of others) {
        if (o === car || o.inPit) continue;
        const gap = track.ahead(car.s, o.s);
        if (gap <= 0 || gap > 40) continue;
        const lateral = o.offset - car.offset;
        if (Math.abs(lateral) < 3 && gap < nearestGap && !(car.speed < o.speed - 0.5 && gap > 8)) {
          nearest = o;
          nearestGap = gap;
        }
        // Right behind a car: hold station instead of bumping it.
        if (gap < 9 && Math.abs(lateral) < 1.7) hold = Math.min(hold, o.speed - (gap < 5 ? 1.5 : 0));
      }
      let want = 0;
      if (nearest) {
        const p = track.sampleAt(nearest.s);
        const roomLeft = nearest.offset + p.w / 2, roomRight = p.w / 2 - nearest.offset;
        // Commit to one side for the whole pass so the car does not weave.
        if (!driver.passSide || driver.passing !== nearest) {
          driver.passSide = roomRight > roomLeft ? 1 : -1;
          driver.passing = nearest;
        }
        const room = driver.passSide > 0 ? roomRight : roomLeft;
        const lineHere = line.offset[Math.floor(wrap(nearest.s, L) / track.step) % track.samples.length] || 0;
        if (room > 3.6) want = nearest.offset + driver.passSide * 3.2 - lineHere;
      } else {
        driver.passing = null;
        driver.passSide = 0;
      }
      driver.avoid = lerp(driver.avoid, want, clamp(dt * 2, 0, 1));
      return hold;
    }
    return driver;
  }

  /**
   * Cars are circles that push apart on contact: two per car, front and rear, so a long car is not treated
   * as a wide one. Each takes half the overlap; the closing speed along the contact line is shared out,
   * so neither car spins and nobody is shoved off the road.
   */
  function circles(car) {
    const r = car.spec.size.width * 0.55, d = car.spec.size.length / 2 - r;
    const fx = Math.sin(car.heading), fz = -Math.cos(car.heading);
    return [{ x: car.x + fx * d, z: car.z + fz * d, r }, { x: car.x - fx * d, z: car.z - fz * d, r }];
  }

  function collide(cars) {
    let contacts = 0;
    for (let a = 0; a < cars.length; a++) {
      for (let b = a + 1; b < cars.length; b++) {
        const A = cars[a], B = cars[b];
        if (A.inPit || B.inPit) continue; // the pit lane is behind the pit wall
        if (Math.hypot(B.x - A.x, B.z - A.z) > A.spec.size.length + B.spec.size.length) continue;
        let touched = false;
        for (let pass = 0; pass < 3; pass++) {
        // The deepest overlap between any of A's circles and any of B's.
        let best = null;
        for (const ca of circles(A)) for (const cb of circles(B)) {
          const dx = cb.x - ca.x, dz = cb.z - ca.z, d = Math.hypot(dx, dz);
          const overlap = ca.r + cb.r - d;
          if (overlap > 1e-9 && d > 0 && (!best || overlap > best.overlap)) best = { nx: dx / d, nz: dz / d, overlap };
        }
        if (!best) break;
        touched = true;
        const { nx, nz } = best, push = best.overlap / 2;
        A.x -= nx * push; A.z -= nz * push;
        B.x += nx * push; B.z += nz * push;
        // Only a real bump shares out speed. Cars merely leaning on each other slide apart without friction;
        // sharing speed at every resting contact drains both cars until they grind to a halt side by side.
        const closing = (A.vx - B.vx) * nx + (A.vz - B.vz) * nz;
        if (closing > BUMP) {
          const share = closing / 2;
          A.vx -= nx * share; A.vz -= nz * share;
          B.vx += nx * share; B.vz += nz * share;
          // Keep each car pointing where it was; only its speed along its own nose changes.
          for (const C of [A, B]) {
            const fx = Math.sin(C.heading), fz = -Math.cos(C.heading);
            C.speed = C.vx * fx + C.vz * fz;
          }
        }
        }
        if (touched) contacts++;
      }
    }
    return contacts;
  }

  /** Base skill per difficulty. Each driver varies a little around it. Difficulty changes nothing else. */
  const SKILL = { easy: 0.45, normal: 0.68, hard: 0.85, expert: 0.97 };

  BDR.ai = { racingLine, curvatureOf, speedPlan, prepare, createDriver, collide, circles, SKILL };
})();
