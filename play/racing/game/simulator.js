// Simulator driving model: a two-axle tyre model. Braking and cornering share one grip budget per axle,
// the car slides past the limit (travel lags the nose) and recovers when the driver eases off,
// and weight shifts forward under braking.
(function () {
  "use strict";
  const { clamp, approach, wrapAngle } = BDR.math;
  const P = BDR.physics;
  const G = P.G;
  const CG_HEIGHT = 0.5;      // metres
  const STIFFNESS = 16;       // cornering stiffness per unit load, per radian
  const LOW_SPEED = 4;        // below this the car follows its wheels kinematically

  /** Saturating tyre: linear at small slip, levelling off at the grip limit, slightly lower once sliding. */
  function tyre(slip, limit, load) {
    if (limit <= 0) return 0;
    const x = (STIFFNESS * load * slip) / limit;
    const sliding = Math.abs(x) > 2 ? 0.92 : 1;
    return -limit * Math.tanh(x) * sliding;
  }

  const sim = {
    step(car, input, track, dt, opts) {
      const spec = car.spec;
      const f = P.surfaceFactors(car);
      const m = spec.mass, L = spec.wheelbase, a = L * 0.48, b = L - a;
      const inertia = m * (a * a + b * b) * 0.55;
      car.steer = approach(car.steer, input.steer, spec.steerRate * dt);

      const fx = Math.sin(car.heading), fz = -Math.cos(car.heading);
      const rx = -fz, rz = fx;
      let u = car.vx * fx + car.vz * fz;       // forward speed
      let w = car.vx * rx + car.vz * rz;       // sideways speed (right positive)
      let r = car.yawRate;
      const delta = P.steerAngle(spec, u, car.steer) * 0.9;

      // Pedals give the requested acceleration; tyres decide how much of it they can deliver.
      const want = P.pedals(car, input, f, u);
      const mu = spec.grip * BDR.physics.aeroGrip(spec, Math.abs(car.speed)) * f.grip * ((opts && opts.gripMargin) || 1);
      // Weight transfer from last step's tyre force along the car: braking loads the front axle.
      const ax = car.tyreAx || 0;
      const loadF = clamp((m * G * b - m * ax * CG_HEIGHT) / L, m * G * 0.15, m * G * 0.85);
      const loadR = m * G - loadF;
      // A planted rear keeps the car stable; cars with a higher slide value let the rear go more readily.
      // The handbrake locks the rear wheels: they lose most of their grip and drag the car back.
      const handbrake = input.handbrake > 0 && Math.abs(u) > 3;
      const rearMu = mu * (1.26 - 0.18 * (spec.slide || 1)) * (handbrake ? 0.35 : 1);
      // Longitudinal force: brakes on both axles by load, drive through the rear axle.
      let fxF = 0, fxR = 0;
      const total = m * want.accel;
      if (want.braking) {
        fxF = total * (loadF / (m * G));
        fxR = total - fxF;
      } else fxR = total;
      if (handbrake) fxR = -Math.sign(u) * rearMu * loadR * 0.8;
      fxF = clamp(fxF, -mu * loadF, mu * loadF);
      fxR = clamp(fxR, -rearMu * loadR, rearMu * loadR);
      // Friction circle: what longitudinal force uses is not available for cornering.
      const latF = Math.sqrt(Math.max(0, (mu * loadF) ** 2 - fxF * fxF));
      const latR = Math.sqrt(Math.max(0, (rearMu * loadR) ** 2 - fxR * fxR));

      const speed = Math.abs(u);
      if (speed < LOW_SPEED) {
        // Parking speeds: follow the wheels, no tyre slip.
        const next = P.settle(u, u + (want.accel - want.resist) * dt, input, want.accel);
        car.longG = (next - u) / dt / G;
        u = next;
        const blend = speed / LOW_SPEED;
        w *= blend;
        r = (u * Math.tan(delta)) / L;
        car.tyreAx = want.accel;
      } else {
        const slipF = Math.atan2(w + a * r, speed) - delta * Math.sign(u);
        const slipR = Math.atan2(w - b * r, speed);
        const fyF = tyre(slipF, latF, loadF), fyR = tyre(slipR, latR, loadR);
        const du = (fxF * Math.cos(delta) + fxR - fyF * Math.sin(delta)) / m - want.resist + w * r;
        const dw = (fyF * Math.cos(delta) + fxF * Math.sin(delta) + fyR) / m - u * r;
        const dr = (a * (fyF * Math.cos(delta) + fxF * Math.sin(delta)) - b * fyR) / inertia;
        const next = P.settle(u, u + du * dt, input, want.accel);
        car.longG = (next - u) / dt / G;
        u = next;
        w += dw * dt;
        r += dr * dt;
        // A little yaw damping keeps the model calm at 120 Hz.
        r *= 1 - 1.2 * dt;
        car.load = { front: loadF, rear: loadR };
        car.tyreAx = (fxF * Math.cos(delta) + fxR) / m;
      }

      car.yawRate = r;
      car.heading = wrapAngle(car.heading + r * dt);
      const nfx = Math.sin(car.heading), nfz = -Math.cos(car.heading);
      car.vx = nfx * u + -nfz * w;
      car.vz = nfz * u + nfx * w;
      car.speed = u;
      car.slip = Math.abs(u) > 1 ? Math.atan2(w, Math.abs(u)) : 0;
      car.lateralG = (u * r) / G;
    },
  };

  P.models.sim = sim;
  BDR.simulator = { tyre, STIFFNESS };
})();
