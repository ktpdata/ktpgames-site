// Driving physics on a 1/120 s step. Arcade model here; the simulator model plugs in through BDR.physics.models.
(function () {
  "use strict";
  const { clamp, approach, wrapAngle } = BDR.math;
  const G = 9.81;
  const REVERSE_SPEED = 6;
  /** Arcade handbrake drift: yaw boost, how far past grip the nose may swing, speed lost per second,
   *  and how quickly travel follows the nose while drifting and after letting go. */
  const DRIFT = { minSpeed: 6, yaw: 1.7, capScale: 2.2, scrub: 3, follow: 1.4, recover: 5 };

  function createCar(spec, track, s, offset) {
    const p = track.sampleAt(s);
    const car = {
      spec, x: p.x + p.rx * (offset || 0), z: p.z + p.rz * (offset || 0), y: p.y,
      heading: p.heading, speed: 0, vx: 0, vz: 0, yawRate: 0, steer: 0, slip: 0,
      lateralG: 0, longG: 0, roll: 0, pitch: 0,
      hint: p.index, s: p.s, offset: offset || 0, surface: "road", onRoad: true, wheelsOff: 0,
    };
    return car;
  }

  /** Place a car on the track at a distance and offset, standing still or rolling. */
  function place(car, track, s, offset, speed) {
    const p = track.sampleAt(s);
    car.x = p.x + p.rx * offset;
    car.z = p.z + p.rz * offset;
    car.heading = p.heading;
    car.speed = speed || 0;
    car.vx = Math.sin(car.heading) * car.speed;
    car.vz = -Math.cos(car.heading) * car.speed;
    car.yawRate = 0;
    car.steer = 0;
    car.slip = 0;
    car.travel = car.heading;
    car.hint = p.index;
    sense(car, track);
  }

  /** Where the car is on the track and what is under its wheels. */
  function sense(car, track) {
    const at = track.locate(car.x, car.z, car.hint);
    car.hint = at.index;
    car.s = at.s;
    car.offset = at.offset;
    const p = track.sampleAt(at.s);
    car.trackSample = p;
    const half = p.w / 2;
    const reach = car.spec.size.width / 2;
    // Count wheels past the road edge (two per side).
    const outer = Math.abs(at.offset) + reach, inner = Math.abs(at.offset) - reach;
    car.wheelsOff = outer <= half ? 0 : inner > half ? 4 : 2;
    car.onRoad = car.wheelsOff < 4;
    car.surface = car.wheelsOff === 0 ? "road" : BDR.surfaces.at(track, at.s, at.offset);
    const clampedOffset = clamp(at.offset, -half, half);
    const roadY = p.y + Math.sin(p.bank) * clampedOffset;
    // Off the road the wheels sit on what is drawn there: the terrain, or a gravel trap laid at road level.
    const offRoad = track.groundAt && Math.abs(at.offset) > half;
    let ground = offRoad ? track.groundAt(car.x, car.z) : roadY;
    if (offRoad && car.surface === "gravel" && Math.abs(at.offset) <= half + BDR.surfaces.RUNOFF) {
      ground = Math.max(ground, p.y + Math.sin(p.bank) * at.offset);
    }
    car.y = offRoad ? Math.max(ground, roadY - 8) : roadY;
    // Open water: the car stays at the surface and wades to a stop; it never sinks out of sight.
    if (offRoad && track.seaLevel !== undefined && ground < track.seaLevel + 0.2) {
      car.y = track.seaLevel - 0.15;
      car.surface = "water";
      car.wheelsOff = 4;
      car.onRoad = false;
    }
    car.bank = p.bank;
  }

  /** Grip and drag multipliers for the current surface. Half the wheels off blends the two. */
  /** Aero upgrades: extra grip that grows with the square of speed, full at top speed. Stock cars have none. */
  function aeroGrip(spec, v) {
    return 1 + (spec.aero || 0) * Math.min(1, (v / spec.topSpeed) ** 2);
  }

  function surfaceFactors(car) {
    const spec = car.spec;
    if (car.wheelsOff === 0) return { grip: 1, drag: 0 };
    const kind = car.surface;
    if (kind === "water") return { grip: 0.35, drag: 9 };
    const g = kind === "road" ? 1 : spec.surfaces[kind] !== undefined ? spec.surfaces[kind] : 0.6;
    const d = kind === "road" ? 0 : spec.drag[kind] !== undefined ? spec.drag[kind] : 2;
    const share = car.wheelsOff / 4;
    return { grip: 1 + (g - 1) * share, drag: d * share };
  }

  /**
   * What the pedals ask for, in m/s² along the car: engine force fades towards top speed; braking and
   * reverse share the brake pedal. Returns { accel, resist, braking }.
   */
  function pedals(car, input, f, v) {
    const spec = car.spec;
    let accel = 0, braking = false;
    if (input.brake > 0) {
      if (v > 0.4) {
        accel = -spec.brake * input.brake * (0.55 + 0.45 * f.grip);
        braking = true;
      } else accel = v > -REVERSE_SPEED ? -spec.accel * 0.6 : 0; // standstill: brake becomes reverse
    } else if (v < -0.1) {
      accel = spec.brake * 0.6; // releasing the brake while reversing brings the car to rest
      braking = true;
    } else {
      const power = Math.max(0, 1 - (v / spec.topSpeed) ** 2);
      accel = spec.accel * input.throttle * power * (0.7 + 0.3 * f.grip);
      if (input.throttle === 0) accel = -0.8; // engine braking
    }
    // The power curve already holds the car below top speed; air drag only slows a coasting car.
    const air = input.throttle > 0 && input.brake === 0 ? 0 : 0.0004 * v * v;
    const resist = (f.drag + 0.12 + air) * Math.sign(v);
    return { accel, resist, braking };
  }

  /** Apply a longitudinal change without braking through zero into reverse. */
  function settle(v, next, input, accel) {
    if (input.brake > 0 && v > 0 && next < 0) return 0;
    if (input.brake === 0 && v < 0 && next > 0) return 0;
    if (Math.abs(next) < 0.02 && accel === 0) return 0;
    return next;
  }

  function longitudinal(car, input, f, dt) {
    const v = car.speed;
    const { accel, resist } = pedals(car, input, f, v);
    const next = settle(v, v + (accel - resist) * dt, input, accel);
    car.longG = (next - v) / dt / G;
    car.speed = next;
  }

  /** Available front-wheel angle shrinks with speed so the car stays controllable at top speed. */
  function steerAngle(spec, speed, input) {
    const lock = spec.steerLock / (1 + Math.abs(speed) / spec.steerFade);
    return input * lock;
  }

  const arcade = {
    step(car, input, track, dt, opts) {
      const spec = car.spec;
      const f = surfaceFactors(car);
      car.steer = approach(car.steer, input.steer, spec.steerRate * dt);
      const before = car.speed;
      longitudinal(car, input, f, dt);
      const v = car.speed;
      const angle = steerAngle(spec, v, car.steer);
      let yawRate = (v * Math.tan(angle)) / spec.wheelbase;
      // Cornering force capped by grip: past the cap the car simply runs wide.
      const margin = opts && opts.gripMargin ? opts.gripMargin : 1;
      const maxLat = spec.grip * aeroGrip(spec, v) * G * f.grip * margin;
      // Handbrake drift: the nose swings round faster than the grip cap allows, while the direction of
      // travel lags behind it. Let go and travel catches up with the nose again.
      const drifting = input.handbrake > 0 && v > DRIFT.minSpeed;
      if (drifting) {
        yawRate = ((v * Math.tan(angle)) / spec.wheelbase) * DRIFT.yaw;
        const cap = (maxLat * DRIFT.capScale) / Math.max(Math.abs(v), 1);
        yawRate = clamp(yawRate, -cap, cap);
        // Locked rear wheels: no drive, and the slide scrubs speed.
        car.speed = Math.max(0, before - DRIFT.scrub * dt);
      } else if (Math.abs(yawRate * v) > maxLat && Math.abs(v) > 0.1) yawRate = (Math.sign(yawRate) * maxLat) / Math.abs(v);
      car.yawRate = yawRate;
      car.heading = wrapAngle(car.heading + yawRate * dt);
      if (car.travel === undefined) car.travel = car.heading;
      // Out of a drift, travel turns with the nose and any leftover slide dies away.
      if (!drifting) car.travel = wrapAngle(car.travel + yawRate * dt);
      const lag = wrapAngle(car.heading - car.travel);
      car.travel = wrapAngle(car.travel + lag * (1 - Math.exp(-(drifting ? DRIFT.follow : DRIFT.recover) * dt)));
      if (!drifting && Math.abs(wrapAngle(car.heading - car.travel)) < 0.002) car.travel = car.heading;
      const speed = car.speed;
      car.vx = Math.sin(car.travel) * speed;
      car.vz = -Math.cos(car.travel) * speed;
      car.lateralG = (yawRate * speed) / G;
      car.slip = wrapAngle(car.travel - car.heading);
    },
  };

  const models = { arcade };

  /** Advance one car by one fixed step. */
  function step(car, input, track, dt, opts) {
    const model = models[(opts && opts.model) || "arcade"] || arcade;
    model.step(car, input, track, dt, opts || {});
    car.x += car.vx * dt;
    car.z += car.vz * dt;
    sense(car, track);
    car.touching = null;
    car.impactSpeed = 0;
    BDR.barriers.resolve(car, track);
    // Visual body motion: lean against cornering, dip under braking. Never a shake.
    car.roll = approach(car.roll, clamp(-car.lateralG * 0.035, -0.06, 0.06), dt * 0.4);
    car.pitch = approach(car.pitch, clamp(car.longG * 0.02, -0.03, 0.03), dt * 0.3);
  }

  BDR.physics = { createCar, place, step, sense, models, steerAngle, surfaceFactors, longitudinal, pedals, settle, aeroGrip, G };
})();
