// Cars on screen: each car is a clone of its .glb model (game/models.js), with a low-detail version beyond
// LOD_DISTANCE, a soft blob shadow, and wheels that spin with distance and steer at the front.
// Models face +Z; the game drives towards -Z, so each model sits in a holder turned half a turn.
(function () {
  "use strict";
  const LOD_DISTANCE = 40;
  const WHEEL = /^wheel_(FL|FR|RL|RR)$/;
  const pending = [];
  let blob = null;

  /** A soft dark ellipse, generated (no image file), shared by every car. */
  function blobTexture(THREE) {
    if (blob) return blob;
    const size = 64, data = new Uint8Array(size * size * 4);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const dx = (x + 0.5) / size * 2 - 1, dy = (y + 0.5) / size * 2 - 1;
        const d = Math.sqrt(dx * dx + dy * dy);
        const t = Math.min(Math.max((d - 0.45) / 0.55, 0), 1);
        data[(y * size + x) * 4 + 3] = Math.round(255 * (1 - t * t * (3 - 2 * t)));
      }
    }
    blob = new THREE.DataTexture(data, size, size);
    blob.needsUpdate = true;
    return blob;
  }

  /** Materials for one car: paint recoloured, or everything made translucent for the ghost. */
  function restyle(THREE, root, opts, cache) {
    root.traverse((o) => {
      if (!o.isMesh) return;
      const m = o.material;
      if (!cache.has(m)) {
        let next = m;
        if (opts.ghost) {
          next = m.clone();
          Object.assign(next, { transparent: true, opacity: 0.35, depthWrite: false });
          if (m.name === "paint" && opts.colors && opts.colors.body !== undefined) next.color = new THREE.Color(opts.colors.body);
        } else if (m.name === "paint" && opts.colors && opts.colors.body !== undefined) {
          next = m.clone();
          next.color = new THREE.Color(opts.colors.body);
        }
        cache.set(m, next);
      }
      o.material = cache.get(m);
    });
  }

  /** One detail level: body parts in a group that rolls and pitches, wheels beside it. */
  function level(THREE, template, opts, cache, wheels, bodies) {
    const scene = template.clone(true);
    restyle(THREE, scene, opts, cache);
    const holder = new THREE.Group();
    holder.rotation.y = Math.PI;
    const body = new THREE.Group();
    holder.add(body);
    for (const child of scene.children.slice()) {
      const match = WHEEL.exec(child.name);
      if (match) {
        child.userData.front = match[1][0] === "F";
        child.userData.radius = child.position.y;
        holder.add(child);
        wheels.push(child);
      } else body.add(child);
    }
    bodies.push(body);
    return holder;
  }

  function fill(THREE, group, spec, opts) {
    const full = BDR.carModels.template(spec.model);
    if (!full) throw new Error("No car model " + spec.model + " for " + spec.id);
    const low = BDR.carModels.template(spec.model + "_lod");
    const cache = new Map(), wheels = [], bodies = [];
    const lod = new THREE.LOD();
    lod.addLevel(level(THREE, full, opts, cache, wheels, bodies), 0);
    if (low) lod.addLevel(level(THREE, low, opts, cache, wheels, bodies), LOD_DISTANCE);
    group.add(lod);
    if (!opts.ghost) {
      const size = new THREE.Box3().setFromObject(full).getSize(new THREE.Vector3());
      const shadow = new THREE.Mesh(new THREE.PlaneGeometry(size.x * 1.3, size.z * 1.15),
        new THREE.MeshBasicMaterial({ color: 0x000000, map: blobTexture(THREE), transparent: true, opacity: 0.5, depthWrite: false }));
      shadow.name = "shadow";
      shadow.rotation.x = -Math.PI / 2;
      shadow.position.y = 0.03;
      shadow.renderOrder = -1;
      group.add(shadow);
    }
    Object.assign(group.userData, { body: bodies, wheels, lod });
  }

  /**
   * A car for a spec from data/cars.js. options.colors.body recolours the paint; options.ghost makes it translucent.
   * Built before the models finish loading (only in tests), the car fills in when they arrive.
   */
  function build(THREE, spec, options) {
    const opts = options || {};
    const group = new THREE.Group();
    group.userData = { body: [], wheels: [], lod: null };
    if (BDR.carModels.template(spec.model)) fill(THREE, group, spec, opts);
    else {
      pending.push(() => fill(THREE, group, spec, opts));
      BDR.carModels.load(THREE).then(() => pending.splice(0).forEach((f) => f()));
    }
    return group;
  }

  /** Move a model to match a car's state. */
  function pose(model, car) {
    model.position.set(car.x, car.y, car.z);
    model.rotation.set(0, -car.heading, 0, "YXZ");
    // Follow the road's banking, plus a little lean.
    const { body, wheels } = model.userData;
    model.rotation.z = car.bank ? -car.bank : 0;
    body.forEach((b) => b.rotation.set(-(car.pitch || 0), 0, -(car.roll || 0)));
    const steerVisual = (car.steer || 0) * 0.45;
    const travelled = car.distance || 0;
    wheels.forEach((w) => {
      w.rotation.set(travelled / w.userData.radius, w.userData.front ? -steerVisual : 0, 0, "YXZ");
    });
  }

  /** A soft sky-and-ground reflection so glossy paint and glass have something to reflect. Null without WebGL. */
  function environment(THREE, renderer) {
    if (!renderer.capabilities || !THREE.PMREMGenerator) return null;
    const scene = new THREE.Scene();
    const geo = new THREE.SphereGeometry(10, 32, 16);
    const colors = [], pos = geo.attributes.position, sky = new THREE.Color(0xcfe3f5), ground = new THREE.Color(0x59604f), c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const t = Math.min(Math.max(pos.getY(i) / 10 * 2.5 + 0.5, 0), 1);
      c.copy(ground).lerp(sky, t);
      colors.push(c.r, c.g, c.b);
    }
    geo.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    scene.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide })));
    const pmrem = new THREE.PMREMGenerator(renderer);
    const texture = pmrem.fromScene(scene, 0.02).texture;
    pmrem.dispose();
    return texture;
  }

  BDR.carModel = { build, pose, environment, LOD_DISTANCE };
})();
