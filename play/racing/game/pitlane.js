// The pit lane: a strip beside the road on the layout's pit side, from an entry point before the start line to
// an exit point after it, with one pit box per car. Cars in the lane are driven by an autopilot at the pit
// speed limit; the player only answers the crew's questions (game/pitstop.js).
(function () {
  "use strict";
  const { clamp, wrap } = BDR.math;
  const smooth = (t) => t * t * (3 - 2 * t);

  /** Lane geometry for a track, or null when the layout has no pit lane. Cached on the track. */
  function of(track) {
    if (track.pitLane !== undefined) return track.pitLane;
    const pit = track.layout.pit;
    if (!track.closed || !pit) return (track.pitLane = null);
    const cfg = BDR.data.pit.lane;
    const side = track.layout.pitSide === "left" ? -1 : 1;
    const entryS = wrap(track.startS + pit.entry, track.length);
    const length = pit.exit - pit.entry;
    const boxD = pit.box - pit.entry;

    /** Lateral offset of the lane centre (signed, like car.offset) at distance d into the lane. */
    function offsetAt(d) {
      const p = track.sampleAt(entryS + d);
      const edge = p.w / 2;
      const t = smooth(clamp(Math.min(d, length - d) / cfg.taper, 0, 1));
      // Starts and ends inside the road's pit-side lane, then runs parallel outside the edge.
      return side * (edge - 2 + t * (cfg.out + 2));
    }
    /** A point in the lane at distance d, `lateral` metres from its centre (positive = away from the track). */
    function at(d, lateral) {
      const s = wrap(entryS + d, track.length);
      const offset = offsetAt(d) + side * (lateral || 0);
      const w = track.worldAt(s, offset);
      const y = track.groundAt ? Math.max(w.y, track.groundAt(w.x, w.z)) : w.y;
      return { s, offset, x: w.x, y: y + 0.06, z: w.z };
    }
    /** Distance into the lane of car slot `slot` (0 = player). Boxes are centred on pit.box. */
    function boxAt(slot) {
      return boxD + (slot - 2.5) * cfg.boxSpacing;
    }
    /** Whether a car on the road is in the entry window, on the pit side, heading for the lane. */
    function wantsIn(car) {
      const into = track.ahead(entryS - cfg.entryWindow, car.s);
      if (into > cfg.entryWindow + 10) return false;
      const edge = track.sampleAt(car.s).w / 2;
      return side * car.offset > edge * 0.3;
    }
    /** Distance into the lane beside road distance s on the given side (+1 right, -1 left), or null. */
    function along(s, onSide) {
      if (onSide !== side) return null;
      const d = track.ahead(entryS, s);
      return d <= length ? d : null;
    }
    const points = [];
    for (let d = 0; d <= length; d += 6) points.push(at(d));
    return (track.pitLane = { side, entryS, length, boxD, taper: cfg.taper, offsetAt, at, boxAt, wantsIn, along, points });
  }

  /**
   * Drive one car through the lane. phase: "in" (to its box), "stopped" (until release()), "out" (to the exit),
   * "done". step() sets the car's pose directly; physics is not run for a car in the lane.
   */
  function createRun(track, car, slot) {
    const lane = of(track);
    const cfg = BDR.data.pit.lane;
    const box = lane.boxAt(slot);
    const run = { phase: "in", d: 0, speed: Math.min(car.speed, cfg.speed * 1.6), slot, box };
    // Join the lane at the car's current distance from the entry point.
    run.d = clamp(track.ahead(lane.entryS, car.s) > lane.length ? 0 : track.ahead(lane.entryS, car.s), 0, box - 1);
    car.inPit = true;

    /** Cars drive down the fast lane and pull across into their box, so they never pass through a stopped car. */
    function lateral(d) {
      const t = clamp(1 - Math.abs(d - run.box) / cfg.turnIn, 0, 1);
      const edgeIn = clamp(Math.min(d, lane.length - d) / cfg.taper, 0, 1); // the tapers are one lane wide
      return (cfg.driveLine + (cfg.boxLine - cfg.driveLine) * t * t * (3 - 2 * t)) * edgeIn;
    }
    function pose() {
      const p = lane.at(run.d, lateral(run.d)), ahead = lane.at(run.d + 1.5, lateral(run.d + 1.5));
      Object.assign(car, { x: p.x, y: p.y, z: p.z, s: p.s, offset: p.offset, speed: run.speed });
      car.heading = Math.atan2(ahead.x - p.x, -(ahead.z - p.z));
      const fx = Math.sin(car.heading), fz = -Math.cos(car.heading);
      car.vx = fx * run.speed;
      car.vz = fz * run.speed;
      car.steer = 0;
      car.roll = 0;
      car.pitch = 0;
      car.slip = 0;
      car.yawRate = 0;
      car.impactSpeed = 0;
    }

    run.step = function (dt) {
      if (run.phase === "in") {
        const left = run.box - run.d;
        const target = Math.min(cfg.speed, Math.sqrt(2 * cfg.decel * Math.max(left, 0)));
        run.speed = target < run.speed ? Math.max(target, run.speed - cfg.decel * 1.6 * dt) : Math.min(target, run.speed + cfg.accel * dt);
        run.d += run.speed * dt;
        if (left < 0.05 || (left < 0.6 && run.speed < 0.3)) {
          run.d = run.box;
          run.speed = 0;
          run.phase = "stopped";
        }
      } else if (run.phase === "out") {
        run.speed = Math.min(cfg.speed, run.speed + cfg.accel * dt);
        run.d += run.speed * dt;
        if (run.d >= lane.length) {
          run.d = lane.length;
          run.phase = "done";
        }
      }
      car.distance = (car.distance || 0) + run.speed * dt;
      pose();
      if (run.phase === "done") {
        // Back on the road at the lane's end, moving at the pit speed.
        BDR.physics.place(car, track, wrap(lane.entryS + lane.length, track.length), lane.offsetAt(lane.length), run.speed);
        car.inPit = false;
      }
      return run.phase;
    };
    run.release = function () {
      if (run.phase === "stopped") run.phase = "out";
    };
    pose();
    return run;
  }

  /** The lane surface, a white line along its road edge, and a painted outline for every box. */
  function mesh(THREE, track, heightAt, slots) {
    const lane = of(track);
    if (!lane) return null;
    const cfg = BDR.data.pit.lane;
    const group = new THREE.Group();
    group.name = "pitLane";
    const surface = (inner, outer, lift, step) => {
      const pos = [], idx = [];
      for (let d = 0, k = 0; d <= lane.length + 1e-6; d += step, k++) {
        const c = lane.offsetAt(d), s = lane.entryS + d;
        for (const o of [c + lane.side * inner, c + lane.side * outer]) {
          const w = track.worldAt(s, o);
          const y = Math.max(w.y, heightAt ? heightAt(w.x, w.z) : w.y) + lift;
          pos.push(w.x, y, w.z);
        }
        if (k) idx.push(2 * k - 2, 2 * k - 1, 2 * k, 2 * k - 1, 2 * k + 1, 2 * k);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
      g.setIndex(idx);
      g.computeVertexNormals();
      return g;
    };
    const asphalt = new THREE.MeshLambertMaterial({ color: 0x4a4d52, side: THREE.DoubleSide });
    group.add(new THREE.Mesh(surface(-cfg.halfWidth, cfg.halfWidth, 0.06, 2), asphalt));
    const paint = new THREE.MeshLambertMaterial({ color: 0xf2f2ee, side: THREE.DoubleSide });
    group.add(new THREE.Mesh(surface(-cfg.halfWidth - 0.05, -cfg.halfWidth + 0.25, 0.08, 2), paint));
    // Each box is a painted outline: yellow for the player's, white for the rest.
    const line = (w, l) => new THREE.PlaneGeometry(w, l);
    const yellow = new THREE.MeshLambertMaterial({ color: 0xffc94a }), white = new THREE.MeshLambertMaterial({ color: 0xf2f2ee });
    const W = 3.0, L = 5.6, T = 0.18;
    for (let slot = 0; slot < slots; slot++) {
      const d = lane.boxAt(slot), p = lane.at(d, cfg.boxLine), ahead = lane.at(d + 1, cfg.boxLine);
      const box = new THREE.Group();
      for (const [w, l, x, z] of [[W, T, 0, -L / 2], [W, T, 0, L / 2], [T, L, -W / 2, 0], [T, L, W / 2, 0]]) {
        const m = new THREE.Mesh(line(w, l), slot === 0 ? yellow : white);
        m.rotation.x = -Math.PI / 2;
        m.position.set(x, 0, z);
        box.add(m);
      }
      box.rotation.y = -Math.atan2(ahead.x - p.x, -(ahead.z - p.z));
      box.position.set(p.x, p.y + 0.03, p.z);
      group.add(box);
    }
    return group;
  }

  BDR.pitLane = { of, createRun, mesh };
})();
