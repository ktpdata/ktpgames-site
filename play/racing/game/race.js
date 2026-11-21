// Race: five computer cars, three laps, a standing start from a grid behind the line.
// Rivals drive a seeded mix of car types, each in its own colour. Every car makes one pit stop: the player's is
// a math stop (game/pitstop.js), the rivals' last a seeded time set by their skill. Missing it costs time.
(function () {
  "use strict";
  const RIVALS = 5;
  const COUNTDOWN = 3;            // seconds of 3, 2, 1 before the start
  const PLAYER_SLOT = 4;          // grid slot, 0 = pole
  const COLORS = [0xd94f30, 0xf2b134, 0x2c8c5a, 0x7a4fc9, 0x1aa3c4, 0xe86aa8];

  /** A seeded mix of car types for the rivals: every type can appear, at least three different types each race. */
  function lineup(rng) {
    const ids = BDR.data.cars.map((c) => c.id);
    return rng.shuffle(ids.concat(ids)).slice(0, RIVALS).map((id) => BDR.carById(id));
  }

  /** Grid slot positions: two by two, staggered, behind the start line. */
  function gridSlot(track, slot) {
    const p = track.sampleAt(track.startS);
    const row = Math.floor(slot / 2), side = slot % 2 ? 1 : -1;
    return { s: track.startS - 8 - row * 9 - (slot % 2) * 4.5, offset: side * p.w * 0.22 };
  }

  function create(app, seed) {
    const { session, THREE, scene } = app;
    const track = session.track;
    const rng = BDR.rng(seed);
    const diff = app.choice.difficulty;
    const base = BDR.ai.SKILL[diff] || BDR.ai.SKILL.normal;
    const slots = rng.shuffle([0, 1, 2, 3, 5]);
    const specs = lineup(rng);
    const rivals = [];
    for (let i = 0; i < RIVALS; i++) {
      const spec = specs[i];
      const car = BDR.physics.createCar(spec, track, track.startS, 0);
      const slot = gridSlot(track, slots[i]);
      BDR.physics.place(car, track, slot.s, slot.offset, 0);
      const skill = Math.min(1, Math.max(0, base + rng.range(-0.06, 0.06)));
      const driver = BDR.ai.createDriver(car, track, { seed: BDR.hash(seed + ":" + i), skill, name: "car" + i });
      const timer = BDR.createLapTimer(track, { limitMargin: Infinity, quiet: true });
      const model = BDR.carModel.build(THREE, spec, { colors: { body: COLORS[i % COLORS.length] } });
      scene.add(model);
      const plan = BDR.data.pit.rivals;
      const pitLap = rng.pick(plan.laps), stopTime = plan.base + (1 - skill) * plan.perSkill + rng() * plan.jitter;
      rivals.push({ spec, car, driver, timer, model, finished: null, pitLap, stopTime, pit: null, pitted: false, finishTime: null, color: "#" + COLORS[i % COLORS.length].toString(16).padStart(6, "0") });
    }
    const playerSlot = gridSlot(track, PLAYER_SLOT);
    BDR.physics.place(session.car, track, playerSlot.s, playerSlot.offset, 0);

    const state = { countdown: COUNTDOWN, started: false, finishOrder: [], playerPlace: null, laps: 3, done: false,
      startTime: 0, playerPitted: false, pitStop: null, penalty: 0 };
    const lane = BDR.pitLane.of(track);
    let playerPit = null, launchLeft = 0, warnedLap = -1;
    const all = () => [session.car].concat(rivals.map((r) => r.car));

    /** Laps completed plus distance into the current lap: larger is further ahead. */
    function progress(timer, car) {
      const t = timer.state;
      if (!t.started) return -1;
      const into = t.awaitLine ? 0 : track.ahead(track.startS, car.s);
      return t.laps.length * track.length + into;
    }

    function standings() {
      const rows = [{ who: "player", p: state.playerPlace ? Infinity : progress(session.timer, session.car), done: state.playerPlace }]
        .concat(rivals.map((r) => ({ who: r, p: r.finished ? Infinity : progress(r.timer, r.car), done: r.finished })));
      return rows.sort((a, b) => (a.done && b.done ? a.done - b.done : a.done ? -1 : b.done ? 1 : b.p - a.p));
    }

    /** A rival's stop: steer to the pit side on its pit lap, take the lane, wait its stop time, rejoin. */
    function rivalPit(r, i, dt) {
      if (r.pit) {
        const phase = r.pit.step(dt);
        if (phase === "stopped" && (r.stopLeft -= dt) <= 0) r.pit.release();
        if (phase === "done") {
          r.pit = null;
          r.pitted = true;
          r.driver.headFor = null;
        }
        return true;
      }
      if (!lane || r.pitted || r.timer.state.laps.length !== r.pitLap) return false;
      const toEntry = track.ahead(r.car.s, lane.entryS);
      if (toEntry < 320) r.driver.headFor = lane.side * (track.sampleAt(r.car.s).w / 2 - 1.6);
      if (lane.wantsIn(r.car)) {
        r.pit = BDR.pitLane.createRun(track, r.car, i + 1);
        r.stopLeft = r.stopTime;
        return true;
      }
      return false;
    }

    /** The player's stop: the lane autopilot, then the crew's questions, then the release. */
    function playerPitStep(time, dt) {
      const car = session.car;
      if (!playerPit) {
        if (!lane || state.playerPitted || session.timer.state.laps.length >= state.laps) return;
        const toEntry = track.ahead(car.s, lane.entryS);
        const lap = session.timer.state.laps.length;
        if (toEntry < 400 && toEntry > 60 && warnedLap !== lap) {
          warnedLap = lap;
          BDR.emit("pitAhead", lane.side > 0 ? "right" : "left");
        }
        if (!lane.wantsIn(car)) return;
        playerPit = BDR.pitLane.createRun(track, car, 0);
        BDR.emit("pitIn");
      }
      const phase = playerPit.step(dt);
      if (phase === "stopped" && !state.pitStop) {
        state.pitStop = { at: time };
        BDR.emit("pitBox", { seed: BDR.hash(seed + ":pit"), done: (summary) => {
          state.pitStop.summary = summary;
          playerPit.release();
        } });
      }
      if (phase === "done") {
        playerPit = null;
        state.playerPitted = true;
        launchLeft = BDR.data.pit.launch;
        BDR.emit("pitOut", state.pitStop && state.pitStop.summary);
      }
    }

    /** Where the player finishes once the missed-stop penalty is added: rivals not yet home are projected. */
    function placeWithPenalty(finishAt, penalty) {
      const elapsed = finishAt - state.startTime, total = state.laps * track.length;
      let beaten = 0;
      for (const r of rivals) {
        let t = r.finishTime;
        if (t === null) {
          const p = Math.max(progress(r.timer, r.car), 1);
          t = state.startTime + elapsed * (total / p);
        }
        if (t - state.startTime < elapsed + penalty) beaten++;
      }
      return beaten + 1;
    }

    return {
      state,
      rivals,
      /** The player's car is held by the countdown, or driven by the pit autopilot. */
      get frozen() {
        return !state.started || !!playerPit;
      },
      get inPit() {
        return !!playerPit;
      },
      /** Controls for the player's car: full throttle for a moment after leaving the pit exit. */
      controls(input) {
        return launchLeft > 0 ? Object.assign({}, input, { throttle: 1, brake: 0 }) : input;
      },
      /** Each simulation step, after the player's physics. */
      step(time, dt) {
        if (state.done) return;
        if (!state.started) {
          state.countdown -= dt;
          if (state.countdown <= 0) {
            state.started = true;
            state.startTime = time;
            session.timer.go(time, session.car);
            rivals.forEach((r) => r.timer.go(time, r.car));
            BDR.emit("raceStart");
          }
          return;
        }
        launchLeft = Math.max(0, launchLeft - dt);
        playerPitStep(time, dt);
        const cars = all();
        rivals.forEach((r, i) => {
          if (!rivalPit(r, i, dt)) BDR.physics.step(r.car, r.driver.drive(cars, dt), track, dt);
          r.timer.update(r.car, time);
          if (!r.finished && r.timer.state.laps.length >= state.laps) {
            state.finishOrder.push(r);
            r.finished = state.finishOrder.length;
            r.finishTime = time;
          }
        });
        BDR.ai.collide(cars);
        const laps = session.timer.state.laps.length;
        if (!state.playerPlace && laps >= state.laps) {
          state.finishOrder.push("player");
          state.playerPlace = state.finishOrder.length;
          if (!state.playerPitted) {
            state.penalty = BDR.data.pit.missedPenalty;
            state.playerPlace = placeWithPenalty(time, state.penalty);
          }
          state.done = true;
          BDR.emit("raceFinished", state.playerPlace, RIVALS + 1, { penalty: state.penalty });
        }
      },
      /** Player's current place, 1-based. */
      position() {
        return standings().findIndex((row) => row.who === "player") + 1;
      },
      pose() {
        rivals.forEach((r) => BDR.carModel.pose(r.model, r.car));
      },
      dots() {
        return rivals.map((r) => ({ x: r.car.x, z: r.car.z, kind: "car", color: r.color }));
      },
      dispose() {
        rivals.forEach((r) => session.dispose(r.model));
      },
    };
  }

  BDR.race = { create, gridSlot, lineup, RIVALS, COUNTDOWN };
})();
