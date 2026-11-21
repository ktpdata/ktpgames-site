// Road surface, edge lines, kerbs on the inside of corners and the start line, built from a track's lookup table.
(function () {
  "use strict";
  /** Kerbs appear where the road turns tighter than this radius (metres). */
  const KERB_RADIUS = 140;
  const KERB_WIDTH = 1.1;
  const LIFT = 0.04;

  /**
   * A strip between two lateral offsets along samples [from, to]. Offsets may be functions of the sample.
   * colorAt(sample, index) returns [r, g, b] (0..1) for that cross-section.
   */
  function ribbon(THREE, track, from, to, inner, outer, lift, colorAt) {
    const { samples, closed } = track;
    const n = samples.length;
    const positions = [], colors = [], indices = [];
    let rows = 0;
    for (let k = from; k <= to; k++) {
      const i = closed ? ((k % n) + n) % n : Math.min(k, n - 1);
      const p = samples[i];
      const a = typeof inner === "function" ? inner(p) : inner;
      const b = typeof outer === "function" ? outer(p) : outer;
      for (const off of [a, b]) {
        positions.push(p.x + p.rx * off, p.y + Math.sin(p.bank) * off + lift, p.z + p.rz * off);
        const c = colorAt ? colorAt(p, k) : [1, 1, 1];
        colors.push(c[0], c[1], c[2]);
      }
      if (rows > 0) {
        const r = (rows - 1) * 2;
        indices.push(r, r + 2, r + 1, r + 1, r + 2, r + 3);
      }
      rows++;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    return geometry;
  }

  /** Runs of samples where the road bends tighter than KERB_RADIUS, with the side of the inside of the bend. */
  function kerbRuns(track) {
    const runs = [];
    const limit = 1 / KERB_RADIUS;
    let current = null;
    track.samples.forEach((p, i) => {
      const side = p.curve > limit ? 1 : p.curve < -limit ? -1 : 0;
      if (current && current.side === side) current.to = i;
      else {
        if (current && current.side !== 0) runs.push(current);
        current = { side, from: i, to: i };
      }
    });
    if (current && current.side !== 0) runs.push(current);
    // Pad each run a few metres either side so the kerb leads into and out of the corner.
    return runs.map((r) => ({ side: r.side, from: r.from - 4, to: r.to + 4 }));
  }

  /** Consecutive samples sharing the same verge on one side. */
  function vergeSpans(track, side) {
    const spans = [];
    let current = null;
    track.samples.forEach((p, i) => {
      const v = BDR.surfaces.verge(track, p.s, side);
      if (current && current.name === v.name) current.to = i;
      else {
        if (current) spans.push(current);
        current = Object.assign({ from: i, to: i }, v);
      }
    });
    if (current) spans.push(current);
    // Close the loop so the last span reaches the first sample.
    if (track.closed && spans.length) spans[spans.length - 1].to += 1;
    return spans;
  }

  /** A vertical strip standing at a lateral offset: walls, barriers and water edges. */
  function wall(THREE, track, from, to, offsetAt, height, color) {
    const { samples, closed } = track;
    const n = samples.length;
    const positions = [], indices = [];
    let rows = 0;
    for (let k = from; k <= to; k++) {
      const p = samples[closed ? ((k % n) + n) % n : Math.min(k, n - 1)];
      const off = offsetAt(p);
      const base = p.y + Math.sin(p.bank) * Math.sign(off) * (p.w / 2);
      const x = p.x + p.rx * off, z = p.z + p.rz * off;
      positions.push(x, base - 0.2, z, x, base + height, z);
      if (rows > 0) {
        const r = (rows - 1) * 2;
        indices.push(r, r + 2, r + 1, r + 1, r + 2, r + 3);
      }
      rows++;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    return new THREE.Mesh(geometry, new THREE.MeshLambertMaterial({ color, side: THREE.DoubleSide }));
  }

  const VERGE_LOOK = {
    gravel: { ground: [0.78, 0.7, 0.55] },
    wall: { wall: 0xd9d6cf },
    pitwall: { wall: 0xe8e5de },
    barrier: { wall: 0x3f4650, ground: null },
    water: { wall: 0x8a8a84, water: [0.24, 0.45, 0.6] },
  };

  function verges(THREE, track, group, mat) {
    for (const side of ["left", "right"]) {
      const sign = side === "right" ? 1 : -1;
      for (const span of vergeSpans(track, side)) {
        const look = VERGE_LOOK[span.name];
        if (!look) continue;
        const from = span.from, to = span.to;
        if (look.ground) {
          const edge = (p) => sign * (p.w / 2), outer = (p) => sign * (p.w / 2 + BDR.surfaces.RUNOFF);
          const a = sign > 0 ? edge : outer, b = sign > 0 ? outer : edge;
          group.add(new THREE.Mesh(ribbon(THREE, track, from, to, a, b, 0.015, () => look.ground), mat));
        }
        if (look.water) {
          const edge = (p) => sign * (p.w / 2 + span.barrier), outer = (p) => sign * (p.w / 2 + span.barrier + 40);
          const a = sign > 0 ? edge : outer, b = sign > 0 ? outer : edge;
          group.add(new THREE.Mesh(ribbon(THREE, track, from, to, a, b, -0.8, () => look.water), mat));
        }
        if (look.wall) {
          const mesh = wall(THREE, track, from, to, (p) => sign * (p.w / 2 + span.barrier), span.height, look.wall);
          mesh.name = "barrier";
          group.add(mesh);
        }
      }
    }
  }

  function build(THREE, track, look) {
    const colors = Object.assign({ asphalt: [0.27, 0.28, 0.3], line: [0.93, 0.93, 0.9], kerbA: [0.78, 0.16, 0.14], kerbB: [0.95, 0.95, 0.93] }, look || {});
    const group = new THREE.Group();
    group.name = "road";
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
    const last = track.closed ? track.samples.length : track.samples.length - 1;
    const shade = (base) => (p, k) => {
      const v = 0.97 + 0.03 * ((k * 7919) % 5) / 4;
      return [base[0] * v, base[1] * v, base[2] * v];
    };

    group.add(new THREE.Mesh(ribbon(THREE, track, 0, last, (p) => -p.w / 2, (p) => p.w / 2, LIFT, shade(colors.asphalt)), mat));
    verges(THREE, track, group, mat);
    const line = () => colors.line;
    group.add(new THREE.Mesh(ribbon(THREE, track, 0, last, (p) => -p.w / 2 + 0.35, (p) => -p.w / 2 + 0.6, LIFT + 0.01, line), mat));
    group.add(new THREE.Mesh(ribbon(THREE, track, 0, last, (p) => p.w / 2 - 0.6, (p) => p.w / 2 - 0.35, LIFT + 0.01, line), mat));

    // Kerbs in two-sample blocks (4 m) of alternating colour on the inside of each bend.
    for (const run of kerbRuns(track)) {
      const stripe = (p, k) => (Math.floor(k / 2) % 2 ? colors.kerbA : colors.kerbB);
      const inner = run.side > 0 ? (p) => p.w / 2 - 0.05 : (p) => -p.w / 2 - KERB_WIDTH + 0.05;
      const outer = run.side > 0 ? (p) => p.w / 2 + KERB_WIDTH - 0.05 : (p) => -p.w / 2 + 0.05;
      const from = track.closed ? run.from : Math.max(0, run.from);
      const to = track.closed ? run.to : Math.min(track.samples.length - 1, run.to);
      group.add(new THREE.Mesh(ribbon(THREE, track, from, to, inner, outer, LIFT + 0.02, stripe), mat));
    }

    // Start line: a chequered band across the road.
    const start = track.sampleAt(track.startS);
    const checker = new THREE.Group();
    const cells = 12, depth = 2, size = start.w / cells;
    const black = new THREE.MeshBasicMaterial({ color: 0x1c1c1c }), white = new THREE.MeshBasicMaterial({ color: 0xf2f2f2 });
    const cell = new THREE.PlaneGeometry(size, depth / 2);
    for (let r = 0; r < 2; r++) {
      for (let c = 0; c < cells; c++) {
        const m = new THREE.Mesh(cell, (r + c) % 2 ? black : white);
        m.rotation.x = -Math.PI / 2;
        m.position.set(-start.w / 2 + size * (c + 0.5), 0, -depth / 4 + r * (depth / 2));
        checker.add(m);
      }
    }
    checker.position.set(start.x, start.y + LIFT + 0.03, start.z);
    checker.rotation.y = -start.heading;
    checker.name = "startLine";
    group.add(checker);
    return group;
  }

  BDR.roadMesh = { build, ribbon, kerbRuns, vergeSpans, KERB_RADIUS };
})();
