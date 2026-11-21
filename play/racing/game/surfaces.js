// What lies beyond each edge of the road, and the barriers that stop a car leaving it.
(function () {
  "use strict";
  const { wrap, clamp } = BDR.math;

  /**
   * Verge kinds. ground: the surface the wheels meet off the road.
   * barrier: metres from the road edge to a wall or barrier, or null for open run-off.
   */
  const VERGES = {
    grass: { ground: "grass", barrier: null },
    gravel: { ground: "gravel", barrier: null },
    wall: { ground: "grass", barrier: 1.5, kind: "wall", scrub: 0.85, height: 1.1 },
    barrier: { ground: "grass", barrier: 3.5, kind: "barrier", scrub: 0.9, height: 0.9 },
    water: { ground: "grass", barrier: 5, kind: "water", scrub: 0.88, height: 0.6 },
    // Between the track and the pit lane (see pitlane.js). Open grass where the lane leaves and rejoins the road.
    pitwall: { ground: "grass", barrier: 1.2, kind: "wall", scrub: 0.85, height: 0.9 },
  };
  /** Gravel traps and the like are this wide before the default verge resumes. */
  const RUNOFF = 9;

  /** The verge on one side ("left" or "right") at distance s. Later runs override earlier ones. */
  function verge(track, s, side) {
    const layout = track.layout;
    let kind = (layout.verges && layout.verges[side]) || "grass";
    const f = wrap(s / track.length, 1);
    for (const run of layout.vergeRuns || []) {
      if (run.side !== side && run.side !== "both") continue;
      const inside = run.from <= run.to ? f >= run.from && f <= run.to : f >= run.from || f <= run.to;
      if (inside) kind = run.surface;
    }
    // Beside the pit lane the pit wall replaces whatever verge the layout has; the lane's tapers are open.
    const lane = BDR.pitLane && BDR.pitLane.of(track);
    if (lane) {
      const d = lane.along(s, side === "right" ? 1 : -1);
      if (d !== null) kind = d < lane.taper || d > lane.length - lane.taper ? "grass" : "pitwall";
    }
    return Object.assign({ name: kind }, VERGES[kind] || VERGES.grass);
  }

  /** Ground type at a lateral offset beyond the road edge. */
  function at(track, s, offset) {
    const v = verge(track, s, offset >= 0 ? "right" : "left");
    const beyond = Math.abs(offset) - track.sampleAt(s).w / 2;
    if (v.ground === "gravel" && beyond > RUNOFF) {
      const base = (track.layout.verges && track.layout.verges[offset >= 0 ? "right" : "left"]) || "grass";
      return (VERGES[base] || VERGES.grass).ground === "gravel" ? "gravel" : "grass";
    }
    return v.ground;
  }

  /**
   * Keep a car inside any wall or barrier: push it back, remove the sideways travel into the barrier and
   * scrub some speed. No damage and no spin.
   */
  function resolve(car, track) {
    const side = car.offset >= 0 ? "right" : "left";
    const v = verge(track, car.s, side);
    if (v.barrier === null) return false;
    const p = car.trackSample || track.sampleAt(car.s);
    const half = car.spec.size.width / 2;
    const limit = p.w / 2 + v.barrier - half;
    if (Math.abs(car.offset) <= limit) return false;
    const sign = car.offset >= 0 ? 1 : -1;
    const push = Math.abs(car.offset) - limit;
    car.x -= p.rx * sign * push;
    car.z -= p.rz * sign * push;
    car.offset = sign * limit;
    // Remove the velocity component pointing into the barrier.
    const nx = p.rx * sign, nz = p.rz * sign;
    const into = car.vx * nx + car.vz * nz;
    if (into > 0) {
      // How hard the car met the barrier, for the crash rule.
      car.impactSpeed = Math.max(car.impactSpeed || 0, into);
      car.impactKind = v.kind;
      car.vx -= nx * into;
      car.vz -= nz * into;
      const along = Math.hypot(car.vx, car.vz);
      const severity = clamp(into / Math.max(1, Math.abs(car.speed)), 0, 1);
      const scrub = 1 - (1 - v.scrub) * (0.3 + severity);
      const forward = car.speed >= 0 ? 1 : -1;
      car.speed = forward * along * scrub;
      car.vx *= scrub;
      car.vz *= scrub;
      if (along > 0.3) {
        const h = Math.atan2(car.vx, -car.vz);
        car.heading = forward > 0 ? h : BDR.math.wrapAngle(h + Math.PI);
        car.travel = car.heading;
      }
    }
    car.touching = v.kind;
    return true;
  }

  BDR.surfaces = { verge, at, VERGES, RUNOFF };
  BDR.barriers = { resolve };
})();
