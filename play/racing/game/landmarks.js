// Region landmarks seen beyond the circuit: lighthouse, balloons, vineyards, ice, red rocks, a volcano.
(function () {
  "use strict";
  const TAU = Math.PI * 2;
  const lam = (THREE, color) => new THREE.MeshLambertMaterial({ color, flatShading: true });

  /** Spots outside the circuit, spread around it, at least `clear` metres from any road. */
  function spots(track, field, rng, count, near, far, clear) {
    const xs = track.samples.map((p) => p.x), zs = track.samples.map((p) => p.z);
    const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cz = (Math.min(...zs) + Math.max(...zs)) / 2;
    const radius = Math.max(Math.max(...xs) - cx, Math.max(...zs) - cz);
    const out = [];
    for (let tries = 0; out.length < count && tries < count * 30; tries++) {
      const a = rng() * TAU, d = radius + rng.range(near, far);
      const x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d;
      if (field.roadDistance(x, z) < clear) continue;
      if (out.some((o) => Math.hypot(o.x - x, o.z - z) < clear)) continue;
      out.push({ x, z, y: field.heightAt(x, z), a: rng() * TAU });
    }
    return out;
  }

  const BUILDERS = {
    cottages(THREE, group, track, field, rng) {
      const white = lam(THREE, "#eee7d6"), brick = lam(THREE, "#b5543a");
      for (const s of spots(track, field, rng, 10, 30, 220, 40)) {
        const size = rng.range(6, 10);
        const house = new THREE.Group();
        const body = new THREE.Mesh(new THREE.BoxGeometry(size * 1.35, size * 0.72, size), white);
        body.position.y = size * 0.36;
        house.add(body);
        for (const side of [-1, 1]) {
          const roof = new THREE.Mesh(new THREE.BoxGeometry(size * 0.8, size * 0.12, size * 1.19), brick);
          roof.position.set(side * size * 0.36, size * 0.85, 0);
          roof.rotation.z = -side * 0.34;
          house.add(roof);
        }
        house.position.set(s.x, s.y, s.z);
        house.rotation.y = s.a;
        group.add(house);
      }
    },
    lighthouse(THREE, group, track, field, rng) {
      const [s] = spots(track, field, rng, 1, 60, 160, 60);
      if (!s) return;
      const tower = new THREE.Group();
      for (let i = 0; i < 6; i++) {
        const ring = new THREE.Mesh(new THREE.CylinderGeometry(3.4 - i * 0.25, 3.6 - i * 0.25, 5, 12), lam(THREE, i % 2 ? "#c23b2c" : "#f3efe6"));
        ring.position.y = 2.5 + i * 5;
        tower.add(ring);
      }
      const lamp = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.2, 3, 10), lam(THREE, "#fff1b8"));
      lamp.position.y = 31.5;
      const cap = new THREE.Mesh(new THREE.ConeGeometry(2.8, 3, 10), lam(THREE, "#2b3a44"));
      cap.position.y = 34.5;
      tower.add(lamp, cap);
      tower.position.set(s.x, s.y, s.z);
      group.add(tower);
    },
    balloons(THREE, group, track, field, rng) {
      const colors = ["#e4572e", "#f3a712", "#29335c", "#a8c686", "#669bbc", "#db2b39"];
      for (const s of spots(track, field, rng, 8, -100, 500, 30)) {
        const b = new THREE.Group();
        const envelope = new THREE.Mesh(new THREE.SphereGeometry(9, 12, 10), lam(THREE, rng.pick(colors)));
        envelope.scale.y = 1.2;
        const basket = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.8, 2.4), lam(THREE, "#7a5a3a"));
        basket.position.y = -14;
        b.add(envelope, basket);
        b.position.set(s.x, s.y + rng.range(55, 160), s.z);
        group.add(b);
      }
    },
    vineyards(THREE, group, track, field, rng) {
      const rows = [];
      for (const s of spots(track, field, rng, 7, 20, 260, 70)) {
        for (let r = -5; r <= 5; r++) rows.push({ x: s.x + Math.cos(s.a) * r * 4, z: s.z + Math.sin(s.a) * r * 4, a: s.a });
      }
      BDR.props.instances(THREE, group, new THREE.BoxGeometry(1.2, 1.4, 40), rows, (p, d) => {
        d.position.set(p.x, field.heightAt(p.x, p.z) + 0.6, p.z);
        d.rotation.y = -p.a;
        return "#5d7a3c";
      });
    },
    ice(THREE, group, track, field, rng) {
      const peaks = spots(track, field, rng, 6, 450, 900, 200);
      BDR.props.instances(THREE, group, new THREE.ConeGeometry(1, 1, 7), peaks, (p, d) => {
        const h = 260 + (p.a / TAU) * 220;
        d.position.set(p.x, p.y + h / 2 - 20, p.z);
        d.scale.set(h * 0.75, h, h * 0.75);
        return "#e9f1f4";
      });
      const bergs = spots(track, field, rng, 10, 160, 420, 60);
      BDR.props.instances(THREE, group, new THREE.IcosahedronGeometry(1, 0), bergs, (p, d) => {
        const s = 6 + (p.a / TAU) * 10;
        d.position.set(p.x, (field.sea !== undefined ? field.sea : p.y) + s * 0.25, p.z);
        d.scale.set(s * 1.4, s * 0.8, s);
        d.rotation.y = p.a;
        return "#f4fbff";
      });
    },
    buttes(THREE, group, track, field, rng) {
      const rocks = spots(track, field, rng, 9, 160, 700, 120);
      BDR.props.instances(THREE, group, new THREE.CylinderGeometry(0.8, 1, 1, 7), rocks, (p, d) => {
        const h = 60 + (p.a / TAU) * 110, w = 25 + (p.a / TAU) * 30;
        d.position.set(p.x, p.y + h / 2 - 4, p.z);
        d.scale.set(w, h, w * 0.7);
        d.rotation.y = p.a;
        return p.a > 3 ? "#b4563e" : "#c8704d";
      });
    },
    volcano(THREE, group, track, field, rng) {
      const [s] = spots(track, field, rng, 1, 500, 700, 300);
      if (!s) return;
      const cone = new THREE.Mesh(new THREE.CylinderGeometry(110, 520, 380, 16, 1, true), lam(THREE, "#4f4548"));
      cone.position.set(s.x, s.y + 170, s.z);
      const rim = new THREE.Mesh(new THREE.CylinderGeometry(90, 110, 14, 16), lam(THREE, "#3a3236"));
      rim.position.set(s.x, s.y + 357, s.z);
      group.add(cone, rim);
    },
    mesas(THREE, group, track, field, rng) {
      const walls = spots(track, field, rng, 14, 120, 600, 110);
      BDR.props.instances(THREE, group, new THREE.BoxGeometry(1, 1, 1), walls, (p, d) => {
        const h = 90 + (p.a / TAU) * 120;
        d.position.set(p.x, p.y + h / 2 - 6, p.z);
        d.scale.set(120 + (p.a / TAU) * 140, h, 70);
        d.rotation.y = p.a;
        return p.a > 3 ? "#b98068" : "#a8705c";
      });
    },
  };

  function build(THREE, group, kind, track, field, rng) {
    const make = BUILDERS[kind];
    if (make) make(THREE, group, track, field, rng);
  }

  BDR.landmarks = { build, spots, BUILDERS };
})();
