// Scenery: sky, fog and light from the region look; terrain blended to the road; roadside objects placed
// along the road from the track's lookup table.
(function () {
  "use strict";
  const { clamp, lerp, smooth } = BDR.math;
  const MAX_VERTICES = 46000;
  const MARGIN = 420;          // terrain beyond the track's outline, metres
  const BLEND = 45;            // metres over which terrain rises from road height to the landscape
  const SHOULDER = 3;          // flat strip beside the road before the blend begins
  const REACH = 90;            // how far from the road distances are measured

  /** Smooth value noise from a seed. */
  function noise2(seed) {
    const cell = (i, j) => (BDR.hash(seed + ":" + i + ":" + j) % 10000) / 10000;
    return function (x, z) {
      const i = Math.floor(x), j = Math.floor(z), fx = smooth(x - i), fz = smooth(z - j);
      return lerp(lerp(cell(i, j), cell(i + 1, j), fx), lerp(cell(i, j + 1), cell(i + 1, j + 1), fx), fz);
    };
  }
  function fractal(n, x, z) {
    return n(x, z) * 0.6 + n(x * 2.1 + 17, z * 2.1 - 9) * 0.28 + n(x * 4.3 - 31, z * 4.3 + 5) * 0.12;
  }

  /**
   * A height field covering the track. For each grid point it records the nearest road sample within REACH,
   * so terrain can meet the road edge exactly and objects can keep clear of every part of the road.
   */
  function buildField(track, look, seed) {
    const xs = track.samples.map((p) => p.x), zs = track.samples.map((p) => p.z);
    const minX = Math.min(...xs) - MARGIN, maxX = Math.max(...xs) + MARGIN;
    const minZ = Math.min(...zs) - MARGIN, maxZ = Math.max(...zs) + MARGIN;
    const step = Math.max(6, Math.sqrt(((maxX - minX) * (maxZ - minZ)) / MAX_VERTICES));
    const nx = Math.ceil((maxX - minX) / step) + 1, nz = Math.ceil((maxZ - minZ) / step) + 1;
    const dist = new Float32Array(nx * nz).fill(Infinity);
    const nearest = new Int32Array(nx * nz).fill(-1);
    const r = Math.ceil(REACH / step);
    track.samples.forEach((p, k) => {
      const ci = Math.round((p.x - minX) / step), cj = Math.round((p.z - minZ) / step);
      for (let j = Math.max(0, cj - r); j <= Math.min(nz - 1, cj + r); j++) {
        for (let i = Math.max(0, ci - r); i <= Math.min(nx - 1, ci + r); i++) {
          const d = Math.hypot(minX + i * step - p.x, minZ + j * step - p.z);
          const idx = j * nx + i;
          if (d < dist[idx]) { dist[idx] = d; nearest[idx] = k; }
        }
      }
    });
    // Beyond REACH, a two-pass chamfer transform gives an approximate distance for coasts and placement.
    const far = Float32Array.from(dist);
    const diag = step * Math.SQRT2;
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
      const k = j * nx + i;
      if (i > 0) far[k] = Math.min(far[k], far[k - 1] + step);
      if (j > 0) far[k] = Math.min(far[k], far[k - nx] + step, i > 0 ? far[k - nx - 1] + diag : Infinity, i < nx - 1 ? far[k - nx + 1] + diag : Infinity);
    }
    for (let j = nz - 1; j >= 0; j--) for (let i = nx - 1; i >= 0; i--) {
      const k = j * nx + i;
      if (i < nx - 1) far[k] = Math.min(far[k], far[k + 1] + step);
      if (j < nz - 1) far[k] = Math.min(far[k], far[k + nx] + step, i < nx - 1 ? far[k + nx + 1] + diag : Infinity, i > 0 ? far[k + nx - 1] + diag : Infinity);
    }
    const base = track.samples.reduce((sum, p) => sum + p.y, 0) / track.samples.length;
    // The sea always sits below the lowest point of the road.
    const lowest = track.samples.reduce((m, p) => Math.min(m, p.y - Math.abs(Math.sin(p.bank)) * p.w / 2), Infinity);
    const n = noise2(seed);
    const amplitude = look.relief !== undefined ? look.relief : 14;
    const heights = new Float32Array(nx * nz);
    for (let j = 0; j < nz; j++) {
      for (let i = 0; i < nx; i++) {
        const idx = j * nx + i, x = minX + i * step, z = minZ + j * step;
        let land = base - 1 + (fractal(n, x / 190, z / 190) - 0.35) * amplitude;
        // Coasts fall away to the sea beyond the circuit's surroundings.
        if (look.sea) land -= smooth(clamp((far[idx] - 140) / 260, 0, 1)) * (amplitude + 14);
        const k = nearest[idx];
        if (k < 0) { heights[idx] = land; continue; }
        const p = track.samples[k];
        const offset = (x - p.x) * p.rx + (z - p.z) * p.rz;
        const edgeY = p.y + Math.sin(p.bank) * clamp(offset, -p.w / 2, p.w / 2);
        const beyond = dist[idx] - p.w / 2 - SHOULDER;
        const t = smooth(clamp(beyond / BLEND, 0, 1));
        let h = lerp(edgeY - 0.3, Math.max(land, edgeY - 6), t);
        const verge = BDR.surfaces.verge(track, p.s, offset >= 0 ? "right" : "left");
        if (verge.name === "water" && Math.abs(offset) > p.w / 2 + verge.barrier) h = Math.min(h, edgeY - 3);
        heights[idx] = h;
      }
    }
    function heightAt(x, z) {
      const fi = clamp((x - minX) / step, 0, nx - 1.001), fj = clamp((z - minZ) / step, 0, nz - 1.001);
      const i = Math.floor(fi), j = Math.floor(fj), u = fi - i, v = fj - j;
      const h = (a, b) => heights[b * nx + a];
      // Match the mesh's own triangles (split from (i, j+1) to (i+1, j)) so cars sit exactly on the ground drawn.
      if (u + v <= 1) return h(i, j) + u * (h(i + 1, j) - h(i, j)) + v * (h(i, j + 1) - h(i, j));
      return h(i + 1, j + 1) + (1 - u) * (h(i, j + 1) - h(i + 1, j + 1)) + (1 - v) * (h(i + 1, j) - h(i + 1, j + 1));
    }
    /** Distance to the nearest road centre line (approximate beyond REACH). */
    function roadDistance(x, z) {
      const i = Math.round((x - minX) / step), j = Math.round((z - minZ) / step);
      if (i < 0 || j < 0 || i >= nx || j >= nz) return Infinity;
      return far[j * nx + i];
    }
    return { minX, minZ, step, nx, nz, heights, heightAt, roadDistance, base, nearest, sea: look.sea ? Math.min(base - 4, lowest - 3) : undefined };
  }

  function terrainMesh(THREE, field, look, seed) {
    const { nx, nz, step, minX, minZ, heights } = field;
    const geometry = new THREE.PlaneGeometry((nx - 1) * step, (nz - 1) * step, nx - 1, nz - 1);
    geometry.rotateX(-Math.PI / 2);
    const pos = geometry.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    const palette = look.ground.map((c) => new THREE.Color(c));
    const n = noise2(seed + 7);
    for (let idx = 0; idx < pos.count; idx++) {
      const i = idx % nx, j = Math.floor(idx / nx);
      const x = minX + i * step, z = minZ + j * step;
      pos.setXYZ(idx, x, heights[j * nx + i], z);
      const v = n(x / 60, z / 60);
      const c = v < 0.3 ? palette[0] : v < 0.55 ? palette[1] : v < 0.8 ? palette[3] : palette[2];
      colors[idx * 3] = c.r; colors[idx * 3 + 1] = c.g; colors[idx * 3 + 2] = c.b;
    }
    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    geometry.computeVertexNormals();
    const mesh = new THREE.Mesh(geometry, new THREE.MeshLambertMaterial({ vertexColors: true }));
    mesh.name = "terrain";
    return mesh;
  }

  function skyMesh(THREE, look) {
    const geometry = new THREE.SphereGeometry(2600, 24, 12);
    const horizon = new THREE.Color(look.sky[0]), zenith = new THREE.Color(look.sky[1]);
    const pos = geometry.attributes.position, colors = new Float32Array(pos.count * 3), c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      c.copy(horizon).lerp(zenith, clamp(pos.getY(i) / 2600, 0, 1) ** 0.6);
      colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
    }
    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    const sky = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }));
    sky.name = "sky";
    sky.renderOrder = -10;
    sky.frustumCulled = false;
    return sky;
  }

  /** Where roadside objects go, from the lookup table. Deterministic for a track. */
  function placements(track, field, look, rng) {
    const out = { trees: [], posts: [], fences: [], stands: [], boards: [] };
    const samples = track.samples, n = samples.length;
    const clearOfRoad = (x, z, need) => field.roadDistance(x, z) > need;
    const ground = (x, z) => field.heightAt(x, z);
    const angle = (p) => -p.heading;
    const lane = BDR.pitLane.of(track); // nothing stands in the pit lane
    // Marker posts every 24 m on any side without a wall, barrier or pit lane.
    for (let k = 0; k < n; k += 12) {
      const p = samples[k];
      for (const side of [-1, 1]) {
        const v = BDR.surfaces.verge(track, p.s, side > 0 ? "right" : "left");
        if (v.barrier !== null || (lane && lane.along(p.s, side) !== null)) continue;
        const off = side * (p.w / 2 + 2.6);
        const x = p.x + p.rx * off, z = p.z + p.rz * off;
        if (!clearOfRoad(x, z, p.w / 2 + 1.5)) continue;
        out.posts.push({ x, z, y: ground(x, z), a: angle(p), side });
      }
    }
    // Braking boards 150, 100 and 50 m before each corner entry, on the outside of the corner.
    const entry = 1 / 70;
    for (let k = 0; k < n; k++) {
      const p = samples[k], prev = samples[(k - 1 + n) % n];
      if (!(Math.abs(p.curve) > entry && Math.abs(prev.curve) <= entry)) continue;
      if (!track.closed && k < 40) continue;
      const outside = p.curve > 0 ? -1 : 1;
      [3, 2, 1].forEach((bars) => {
        const b = track.sampleAt(p.s - bars * 50);
        const off = outside * (b.w / 2 + 4);
        const x = b.x + b.rx * off, z = b.z + b.rz * off;
        if (lane && lane.along(b.s, outside) !== null) return;
        if (clearOfRoad(x, z, b.w / 2 + 2)) out.boards.push({ x, z, y: ground(x, z), a: angle(b), n: bars });
      });
    }
    // Grandstand and fences on the pit side of the start line.
    if (track.closed) {
      const side = track.layout.pitSide === "left" ? -1 : 1;
      const s0 = track.sampleAt(track.startS);
      const off = side * (s0.w / 2 + 14);
      const x = s0.x + s0.rx * off, z = s0.z + s0.rz * off;
      if (clearOfRoad(x, z, s0.w / 2 + 8)) out.stands.push({ x, z, y: ground(x, z), a: angle(s0) + (side > 0 ? 0 : Math.PI), len: 34 });
      for (let d = -120; d <= 120; d += 6) {
        if (Math.abs(d) < 22) continue;
        const p = track.sampleAt(track.startS + d);
        for (const fs of [-1, 1]) {
          const pitSide = lane && lane.along(p.s, fs) !== null;
          const fo = fs * (p.w / 2 + (pitSide ? BDR.data.pit.lane.out + BDR.data.pit.lane.halfWidth + 1.5 : 9));
          const fx = p.x + p.rx * fo, fz = p.z + p.rz * fo;
          if (clearOfRoad(fx, fz, p.w / 2 + 6)) out.fences.push({ x: fx, z: fz, y: ground(fx, fz), a: angle(p), len: 6 });
        }
      }
    }
    // Trees: dense near the road so speed reads well, thinning further out.
    const density = look.treeDensity !== undefined ? look.treeDensity : 0.3;
    if (look.vegetation !== "bare" && density > 0) {
      for (let k = 0; k < n; k += 1) {
        const p = samples[k];
        for (const side of [-1, 1]) {
          const v = BDR.surfaces.verge(track, p.s, side > 0 ? "right" : "left");
          if (v.name === "water") continue;
          const pitLane = lane && lane.along(p.s, side) !== null ? BDR.data.pit.lane.out + BDR.data.pit.lane.halfWidth + 5 : 0;
          const near = p.w / 2 + Math.max(10, (v.barrier || 0) + 6, pitLane);
          // One chance for a tree close to the road, one for the backdrop further out.
          const band = rng() < 0.55 ? [near, near + 25] : [near + 25, near + 150];
          if (rng() > density) continue;
          const off = side * rng.range(band[0], band[1]);
          const x = p.x + p.rx * off + rng.range(-3, 3), z = p.z + p.rz * off + rng.range(-3, 3);
          if (!clearOfRoad(x, z, p.w / 2 + 9)) continue;
          out.trees.push({ x, z, y: ground(x, z) - 0.2, h: rng.range(6, 15), a: rng.range(0, Math.PI * 2), shade: rng() });
        }
      }
    }
    return out;
  }

  /** Build every scenery object for a track. Returns { group, heightAt, look }. */
  function build(THREE, track, trackData) {
    const look = BDR.data.regions[trackData.region] || BDR.data.regions.proving;
    const seed = BDR.hash(trackData.id + "/" + track.layout.id);
    const rng = BDR.rng(seed);
    const group = new THREE.Group();
    group.name = "scenery";
    const field = buildField(track, look, seed);
    group.add(terrainMesh(THREE, field, look, seed));
    const far = new THREE.Mesh(new THREE.PlaneGeometry(9000, 9000), new THREE.MeshLambertMaterial({ color: look.ground[0] }));
    far.rotation.x = -Math.PI / 2;
    far.position.y = field.base - 12;
    group.add(far);
    group.add(skyMesh(THREE, look));
    if (look.sea) {
      const sea = new THREE.Mesh(new THREE.PlaneGeometry(9000, 9000), new THREE.MeshLambertMaterial({ color: look.sea }));
      sea.rotation.x = -Math.PI / 2;
      sea.position.y = field.sea;
      sea.name = "sea";
      group.add(sea);
    }
    const place = placements(track, field, look, rng);
    BDR.props.trees(THREE, group, look.vegetation, place.trees);
    BDR.props.posts(THREE, group, place.posts);
    BDR.props.fences(THREE, group, place.fences);
    BDR.props.grandstands(THREE, group, place.stands);
    BDR.props.boards(THREE, group, place.boards);
    if (BDR.landmarks && look.landmark) BDR.landmarks.build(THREE, group, look.landmark, track, field, rng);
    return { group, field, look, placements: place };
  }

  /** Fog, background and lights for a region. Lights are created once and recoloured. */
  function applyLook(THREE, scene, lights, look, weather) {
    const w = weather || { haze: 1, light: 1 };
    // Bad weather greys the horizon toward a neutral overcast tone.
    const horizon = new THREE.Color(look.sky[0]).lerp(new THREE.Color("#9aa3ab"), clamp((w.haze - 1) / 2, 0, 0.7));
    scene.background = horizon;
    scene.fog = new THREE.FogExp2(horizon, look.haze * 1.6 * w.haze);
    lights.hemi.color.set(look.light.sky);
    lights.hemi.groundColor.set(look.light.ground);
    lights.hemi.intensity = 1.1 * w.light;
    lights.sun.color.set(look.light.sun);
    lights.sun.intensity = (look.light.intensity || 1.9) * 0.75 * w.light;
  }

  /** A grid of tree trunks for quick "did the car hit a tree?" checks. */
  function treeIndex(trees, cell) {
    const size = cell || 12, grid = new Map();
    const key = (i, j) => i + "," + j;
    for (const t of trees) {
      const k = key(Math.floor(t.x / size), Math.floor(t.z / size));
      if (!grid.has(k)) grid.set(k, []);
      grid.get(k).push(t);
    }
    return {
      /** The first tree whose trunk is within `reach` metres of (x, z), or null. */
      near(x, z, reach) {
        const i = Math.floor(x / size), j = Math.floor(z / size);
        for (let a = i - 1; a <= i + 1; a++) for (let b = j - 1; b <= j + 1; b++) {
          for (const t of grid.get(key(a, b)) || []) if (Math.hypot(t.x - x, t.z - z) < reach) return t;
        }
        return null;
      },
    };
  }

  BDR.scenery = { build, applyLook, buildField, placements, treeIndex };
})();
