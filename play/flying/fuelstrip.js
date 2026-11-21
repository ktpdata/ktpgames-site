"use strict";

// The fuel strip: Flying's pit lane. Landing on it mid-flight and rolling to the stop line hands the plane to the
// ground crew; the autopilot taxis to the pump, the crew asks one math question per task (game/fuelstop.js),
// then the plane is lined up on the runway and the pilot takes off again. Deliveries need one stop.
window.CapeFlight.createFuelStrip = function (game) {
  const state = game.state;
  const {T, $, mission, course, waterLanding} = game.setup;
  const {clamp, vec, lam, box, mesh, rad} = game.graphics;
  const {stripXZ, heightAt, field} = game.terrain;
  const cfg = BDR.data.fuel;
  const data = course.fuelStrip;
  const strip = course.homeStrip;
  const pavementY = waterLanding ? .12 : strip.y + .4 + .1 + .35 / 2;
  const wheelsDownY = pavementY + (waterLanding ? 2.17 : 1.96);
  const pumpCross = data.pumpSide * (strip.width / 2 + cfg.pumpOffset);
  const crew = BDR.createFuelStop(document);
  state.fuelStops = 0;

  /** A point on the fuel strip from its own coordinates: across (+ to pumpSide 1) and along. */
  function point(cross, along, y = wheelsDownY) {
    const c = Math.cos(strip.angle), s = Math.sin(strip.angle);
    return vec(strip.x + cross * c + along * s, y, strip.z - cross * s + along * c);
  }
  const pump = point(pumpCross, data.stop);

  // The pump: a red dispenser on a concrete pad (a floating pad on the water courses). Still, never animated.
  const pumpGroup = new T.Group();
  pumpGroup.position.copy(point(pumpCross, data.stop, pavementY - (waterLanding ? 0 : .4)));
  pumpGroup.rotation.y = strip.angle;
  (field.parent || field).add(pumpGroup);
  box(pumpGroup, lam(waterLanding ? "#906442" : "#c9c3ad"), 0, .1, 0, 12, .3, 12);
  box(pumpGroup, lam("#b8452f"), -data.pumpSide * 3.5, 1.4, 0, 1.4, 2.4, 1);
  box(pumpGroup, lam("#f1e4bf"), -data.pumpSide * 3.5, 2.8, 0, 1.6, .5, 1.2);
  if (!waterLanding) box(field, lam("#ffd06b"), 0, .31, data.stop, strip.width - 2, .06, 1.2); // the stop line

  /** Whether this flight may use the fuel strip at all. */
  function open() {
    return !cfg.never.includes(mission) && !state.practice;
  }
  /** On the fuel strip's landing surface. */
  function onStrip(x, z) {
    const [cross, along] = stripXZ(x, z, strip);
    if (Math.abs(cross) > strip.width / 2 || Math.abs(along) > strip.length / 2) return false;
    return waterLanding ? heightAt(x, z) < -.25 : true;
  }
  /** Touching down here is a fuel stop: during the rings, or anywhere off the delivery's destination. */
  function wanted(x, z) {
    if (!open() || !onStrip(x, z)) return false;
    if (mission === "delivery") return !game.landing.onDestination(x, z);
    return state.phase === "rings";
  }
  /** Direction of travel along the strip: +1 towards +along, -1 towards -along. */
  function travel(heading) {
    return -Math.cos(heading + strip.angle) >= 0 ? 1 : -1;
  }

  function touchdown(sink) {
    const pos = game.physics.pos;
    const [cross] = stripXZ(pos.x, pos.z, strip);
    if (!waterLanding && Math.abs(cross) > strip.width / 2 - 1.15) { game.landing.failLanding("Wheel off the runway"); return; }
    const error = Math.abs(game.landing.normalizedAngle(state.heading + strip.angle));
    const alignment = Math.min(error, Math.PI - error) / rad, knots = state.speed * 1.94384;
    if (alignment > state.level.maxHeading) { game.landing.failLanding("Line up with the runway"); return; }
    if (knots > state.level.maxKnots) { game.landing.failLanding("Touchdown too fast"); return; }
    if (Math.abs(state.bank) / rad > state.level.maxBank) { game.landing.failLanding("Level your wings"); return; }
    if (sink > state.level.maxSink) { game.landing.failLanding("Hard landing · ease the nose up"); return; }
    pos.y = wheelsDownY; state.pitch = 0; state.bank = 0; state.pathAngle = 0; game.physics.resetLoop();
    state.fuelDir = travel(state.heading);
    state.resumePhase = mission === "delivery" ? "approach" : waterLanding ? "takeoff" : "rings";
    game.landing.setPhase("fuelRoll");
    game.hud.status(BDR.t("fuelStripAhead"), 3);
  }

  /** Rolling out after touchdown, flown by the pilot, as on the runway. */
  function roll(dt, steering) {
    const pos = game.physics.pos;
    const brakeForce = state.braking || game.controls.down("Space") ? 5.9 : 0;
    const netForce = waterLanding ? 3.4 * state.throttle - (.48 + .135 * state.speed) : 3.0 * state.throttle - 1.1 - 2.3 * (1 - state.throttle) - brakeForce;
    const next = clamp(state.speed + dt * netForce, 0, 59);
    const distance = .5 * (state.speed + next) * dt;
    state.heading += steering * Math.min(state.speed / 7, 1) * .32 * dt;
    pos.x += Math.sin(state.heading) * distance; pos.z -= Math.cos(state.heading) * distance;
    pos.y = wheelsDownY; state.speed = next;
    const [cross, along] = stripXZ(pos.x, pos.z, strip);
    if (waterLanding && !game.physics.afloat()) { game.landing.failLanding("Grounded on the shore"); return; }
    if (!waterLanding && (Math.abs(cross) > strip.width / 2 - 1.15 || Math.abs(along) > strip.length / 2)) {
      game.landing.failLanding("Runway excursion"); return;
    }
    // At or past the stop line, slow enough to taxi: the crew takes over.
    if (state.fuelDir * (along - data.stop) >= 0 && state.speed <= cfg.handover) handOver();
  }

  function handOver() {
    game.controls.clearInput(); state.braking = false; state.throttle = 0; game.controls.setThrottle(0);
    state.taxiPath = [point(0, data.stop + state.fuelDir * 10), pump];
    game.landing.setPhase("fuelTaxi");
    game.hud.status(BDR.t("fuelCrew"), 2);
  }

  /** The ground autopilot: steer towards each point in turn at taxi speed, stop at the pump. */
  function taxi(dt) {
    const pos = game.physics.pos, t = cfg.taxi;
    const target = state.taxiPath[0];
    const dx = target.x - pos.x, dz = target.z - pos.z, distance = Math.hypot(dx, dz);
    const last = state.taxiPath.length === 1;
    if (distance < t.arrive) {
      if (!last) { state.taxiPath.shift(); return; }
      state.speed = 0; pos.x = target.x; pos.z = target.z;
      state.heading = -strip.angle + (state.fuelDir > 0 ? Math.PI : 0);
      startCrew();
      return;
    }
    const want = Math.atan2(dx, -dz);
    const turn = game.landing.normalizedAngle(want - state.heading);
    state.heading += clamp(turn, -t.turnRate * dt, t.turnRate * dt);
    // Slow down for the turn and for the pump, never faster than taxi speed.
    const limit = last ? Math.min(t.speed, Math.sqrt(2 * t.accel * distance)) : t.speed * (Math.abs(turn) > .6 ? .5 : 1);
    state.speed = state.speed > limit ? Math.max(limit, state.speed - t.accel * 2 * dt) : Math.min(limit, state.speed + t.accel * dt);
    const step = Math.min(distance, state.speed * dt);
    pos.x += Math.sin(state.heading) * step; pos.z -= Math.cos(state.heading) * step; pos.y = wheelsDownY;
  }

  function startCrew() {
    game.landing.setPhase("fuelStop");
    const seed = window.crypto.getRandomValues(new Uint32Array(1))[0] >>> 0;
    crew.start({ level: () => state.math.level, seed, done: lineUp });
  }
  BDR.on("fuelAnswer", (right) => game.missions.recordMathAnswer(right));

  /** After the stop: refuel a delivery, line up at the start of the strip in the landing direction. */
  function lineUp(summary) {
    const pos = game.physics.pos;
    state.fuelStops++;
    if (mission === "delivery") state.fuelGal = state.fuelLoaded ?? state.fuelGal;
    pos.copy(point(0, -state.fuelDir * (strip.length / 2 - 15)));
    state.heading = -strip.angle + (state.fuelDir > 0 ? Math.PI : 0);
    state.speed = 0; state.bank = 0; state.pitch = 0; state.pathAngle = 0; state.throttle = 0; game.controls.setThrottle(0);
    state.departureStrip = strip;
    game.landing.setPhase(state.resumePhase === "takeoff" ? "takeoff" : "departure");
    game.effects.syncPose(0, true);
    game.hud.status(BDR.t("fuelSummary", { time: BDR.math.formatTime(summary.time * 1000), right: summary.right, total: summary.total }) +
      " · " + BDR.t("fuelLinedUp"), 3);
  }

  /** Game time passes during the stop, so the stop clock and the flight clock both run. */
  function step(dt) { crew.step(dt); }
  function reset() { crew.close(); state.fuelStops = 0; state.departureStrip = null; }
  /** Seconds added at the finish of a delivery that never stopped. */
  function penalty() { return mission === "delivery" && !state.fuelStops ? cfg.missedPenalty : 0; }

  return {strip, data, pump, pavementY, wheelsDownY, crew, open, onStrip, wanted, travel, point, touchdown, roll,
    handOver, taxi, step, lineUp, reset, penalty};
};
