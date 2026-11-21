// Turns a layout's centre-line control points into a smooth road, a 2 m lookup table and the
// one function everything uses to ask "where am I on the track?".
(function () {
  "use strict";
  const { clamp, lerp, wrap } = BDR.math;
  const SPACING = 2;
  const SUBDIVISIONS = 24;
  const DEG = Math.PI / 180;

  /** Control points are compact arrays: [x, z, height, width, bankDegrees]. */
  function point(p) {
    return { x: p[0], z: p[1], y: p[2] || 0, w: p[3] || 12, bank: (p[4] || 0) * DEG };
  }

  /** Centripetal Catmull-Rom between p1 and p2, applied to every numeric channel. */
  function catmull(p0, p1, p2, p3, t) {
    const knot = (a, b) => Math.pow(Math.hypot(b.x - a.x, b.z - a.z) || 1e-3, 0.5);
    const t1 = knot(p0, p1), t2 = t1 + knot(p1, p2), t3 = t2 + knot(p2, p3);
    const u = lerp(t1, t2, t);
    const out = {};
    for (const key of ["x", "z", "y", "w", "bank"]) {
      const a1 = ((t1 - u) * p0[key] + u * p1[key]) / t1;
      const a2 = ((t2 - u) * p1[key] + (u - t1) * p2[key]) / (t2 - t1);
      const a3 = ((t3 - u) * p2[key] + (u - t2) * p3[key]) / (t3 - t2);
      const b1 = ((t2 - u) * a1 + u * a2) / t2;
      const b2 = ((t3 - u) * a2 + (u - t1) * a3) / (t3 - t1);
      out[key] = ((t2 - u) * b1 + (u - t1) * b2) / (t2 - t1);
    }
    // Width and banking are blended linearly so they never overshoot.
    out.w = lerp(p1.w, p2.w, M_smooth(t));
    out.bank = lerp(p1.bank, p2.bank, M_smooth(t));
    return out;
  }
  const M_smooth = (t) => t * t * (3 - 2 * t);

  /** Dense polyline through the control points. */
  function densify(points, closed) {
    const n = points.length;
    const at = (i) => {
      if (closed) return points[wrap(i, n)];
      if (i < 0) return mirror(points[0], points[1]);
      if (i >= n) return mirror(points[n - 1], points[n - 2]);
      return points[i];
    };
    const segments = closed ? n : n - 1;
    const dense = [];
    for (let i = 0; i < segments; i++) {
      for (let k = 0; k < SUBDIVISIONS; k++) dense.push(catmull(at(i - 1), at(i), at(i + 1), at(i + 2), k / SUBDIVISIONS));
    }
    if (!closed) dense.push(Object.assign({}, points[n - 1]));
    return dense;
  }
  const mirror = (a, b) => ({ x: 2 * a.x - b.x, z: 2 * a.z - b.z, y: a.y, w: a.w, bank: a.bank });

  /** Resample the dense polyline at even arc-length spacing. */
  function resample(dense, closed) {
    const cumulative = [0];
    const count = closed ? dense.length : dense.length - 1;
    for (let i = 0; i < count; i++) {
      const a = dense[i], b = dense[(i + 1) % dense.length];
      cumulative.push(cumulative[i] + Math.hypot(b.x - a.x, b.z - a.z));
    }
    const length = cumulative[cumulative.length - 1];
    const n = Math.max(8, Math.round(length / SPACING));
    const step = length / n;
    const samples = [];
    let j = 0;
    const total = closed ? n : n + 1;
    for (let i = 0; i < total; i++) {
      const s = Math.min(i * step, length);
      while (j < count - 1 && cumulative[j + 1] < s) j++;
      const a = dense[j], b = dense[(j + 1) % dense.length];
      const span = cumulative[j + 1] - cumulative[j] || 1;
      const t = clamp((s - cumulative[j]) / span, 0, 1);
      samples.push({ s, x: lerp(a.x, b.x, t), z: lerp(a.z, b.z, t), y: lerp(a.y, b.y, t), w: lerp(a.w, b.w, t), bank: lerp(a.bank, b.bank, t) });
    }
    return { samples, length, step };
  }

  /** Direction, right-hand normal and signed curvature (positive turns right) for every sample. */
  function orient(samples, closed) {
    const n = samples.length;
    const get = (i) => (closed ? samples[wrap(i, n)] : samples[clamp(i, 0, n - 1)]);
    for (let i = 0; i < n; i++) {
      const a = get(i - 1), b = get(i + 1);
      const len = Math.hypot(b.x - a.x, b.z - a.z) || 1;
      const p = samples[i];
      p.dx = (b.x - a.x) / len;
      p.dz = (b.z - a.z) / len;
      p.rx = -p.dz; // right-hand normal seen from above, in a y-up world
      p.rz = p.dx;
      p.heading = Math.atan2(p.dx, -p.dz);
    }
    for (let i = 0; i < n; i++) {
      const a = get(i - 1), b = get(i + 1);
      const turn = BDR.math.wrapAngle(b.heading - a.heading);
      const span = closed || (i > 0 && i < n - 1) ? 2 * (samples[1].s - samples[0].s) : samples[1].s - samples[0].s;
      samples[i].curve = turn / span;
    }
    // Light smoothing so the curvature used by kerbs and the racing line is not noisy.
    const raw = samples.map((p) => p.curve);
    for (let i = 0; i < n; i++) {
      let sum = 0, weight = 0;
      for (let k = -4; k <= 4; k++) {
        const idx = closed ? wrap(i + k, n) : clamp(i + k, 0, n - 1);
        const w = 5 - Math.abs(k);
        sum += raw[idx] * w;
        weight += w;
      }
      samples[i].curve = sum / weight;
    }
  }

  /**
   * Build a track from a layout. Returns the lookup table plus:
   *  locate(x, z, hint) -> { s, offset, index, sample }   (offset > 0 is right of the centre line)
   *  sampleAt(s) -> interpolated sample
   *  worldAt(s, offset) -> { x, y, z } on the road surface
   */
  function build(layout) {
    const closed = layout.closed !== false;
    const points = layout.points.map(point);
    const dense = densify(points, closed);
    const { samples, length, step } = resample(dense, closed);
    orient(samples, closed);
    const n = samples.length;
    const startS = wrap((layout.start || 0) * length, length + (closed ? 0 : 1e-9));

    function project(i, x, z) {
      const a = samples[i];
      const last = !closed && i === n - 1;
      const b = last ? null : samples[(i + 1) % n];
      const segLen = closed && i === n - 1 ? length - a.s : b ? b.s - a.s : step;
      const along = (x - a.x) * a.dx + (z - a.z) * a.dz;
      const t = last ? clamp(along / step, -1, 0) : clamp(along / segLen, 0, 1);
      const px = a.x + a.dx * along, pz = a.z + a.dz * along;
      const offset = (x - a.x) * a.rx + (z - a.z) * a.rz;
      return { s: closed ? wrap(a.s + t * segLen, length) : clamp(a.s + t * segLen, 0, length), offset, d2: (x - px) ** 2 + (z - pz) ** 2 + (along - t * segLen) ** 2 };
    }

    function nearest(x, z, from, to) {
      let best = -1, bestD = Infinity;
      for (let k = from; k <= to; k++) {
        const i = closed ? wrap(k, n) : k;
        if (i < 0 || i >= n) continue;
        const p = samples[i];
        const d = (p.x - x) ** 2 + (p.z - z) ** 2;
        if (d < bestD) { bestD = d; best = i; }
      }
      return { index: best, d2: bestD };
    }

    function locate(x, z, hint) {
      let found = null;
      if (hint !== undefined && hint !== null && hint >= 0) {
        found = nearest(x, z, hint - 30, hint + 30);
        const w = samples[found.index].w;
        // A local search is trusted only if it lands comfortably inside the window and near the road.
        if (found.d2 > (w * 3) ** 2) found = null;
      }
      if (!found) found = nearest(x, z, 0, n - 1);
      let i = found.index;
      // The point may lie between i-1 and i rather than i and i+1.
      const prev = closed ? wrap(i - 1, n) : i - 1;
      let r = project(i, x, z);
      if (prev >= 0) {
        const r2 = project(prev, x, z);
        if (r2.d2 < r.d2) { r = r2; i = prev; }
      }
      return { s: r.s, offset: r.offset, index: i, sample: samples[i] };
    }

    function sampleAt(s) {
      const d = closed ? wrap(s, length) : clamp(s, 0, length);
      const i = Math.min(Math.floor(d / step), n - 1);
      const a = samples[i];
      const b = closed ? samples[(i + 1) % n] : samples[Math.min(i + 1, n - 1)];
      const t = clamp((d - a.s) / step, 0, 1);
      const dx = lerp(a.dx, b.dx, t), dz = lerp(a.dz, b.dz, t);
      const len = Math.hypot(dx, dz) || 1;
      return {
        s: d, index: i, x: lerp(a.x, b.x, t), z: lerp(a.z, b.z, t), y: lerp(a.y, b.y, t), w: lerp(a.w, b.w, t),
        bank: lerp(a.bank, b.bank, t), curve: lerp(a.curve, b.curve, t),
        dx: dx / len, dz: dz / len, rx: -dz / len, rz: dx / len, heading: Math.atan2(dx / len, -dz / len),
      };
    }

    /** Road surface height including banking at a distance and lateral offset. */
    function worldAt(s, offset) {
      const p = sampleAt(s);
      return { x: p.x + p.rx * offset, z: p.z + p.rz * offset, y: p.y + Math.sin(p.bank) * offset };
    }

    /** Forward distance from a to b along the lap (always 0..length on a circuit). */
    function ahead(a, b) {
      return closed ? wrap(b - a, length) : b - a;
    }

    return { layout, closed, samples, length, step, startS, locate, sampleAt, worldAt, ahead };
  }

  /** Every playable layout of a track: the authored ones plus an automatic reverse of each circuit. */
  function layoutsOf(track) {
    const out = [];
    for (const layout of track.layouts) {
      out.push(layout);
      if (layout.closed !== false && layout.reversible !== false) out.push(reverse(layout));
    }
    return out;
  }

  const SWAP = { left: "right", right: "left" };
  /** Drive the same road the other way: reversed points, mirrored banking and verges. */
  function reverse(layout) {
    // [p0, pn-1, ..., p1] keeps distance zero at p0, so a distance s becomes length - s.
    const flipped = [layout.points[0]].concat(layout.points.slice(1).reverse());
    const points = flipped.map((p) => [p[0], p[1], p[2] || 0, p[3] || 12, -(p[4] || 0)]);
    // Keep the start line in the same physical place.
    const n = layout.points.length;
    const start = wrap(1 - (layout.start || 0), 1);
    const verges = layout.verges ? { left: layout.verges.right, right: layout.verges.left } : undefined;
    const runs = (layout.vergeRuns || []).map((r) => ({
      from: wrap(1 - r.to, 1), to: wrap(1 - r.from, 1) || 1, side: SWAP[r.side] || r.side, surface: r.surface,
    }));
    return Object.assign({}, layout, {
      id: layout.id + "-rev",
      name: layout.name,
      reversed: true,
      reverseOf: layout.id,
      points,
      start,
      pitSide: SWAP[layout.pitSide] || layout.pitSide,
      pit: layout.pit ? { entry: -layout.pit.exit, box: -layout.pit.box, exit: -layout.pit.entry } : undefined,
      verges,
      vergeRuns: runs,
      medals: layout.reverseMedals || layout.medals,
      board: layout.reverseBoard || null,
      controlCount: n,
    });
  }

  BDR.track = { build, layoutsOf, reverse, SPACING };
})();
