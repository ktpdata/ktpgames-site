// Rules for each mode: which car, how the run starts, what is saved. Mode differences are data here.
(function () {
  "use strict";
  const { wrap } = BDR.math;

  /**
   * start: "rolling" (from behind the line at speed), "standing" (from rest on a grid), "stage" (point-to-point).
   * laps: laps in a run, or 0 for "until the player stops".
   */
  const MODES = {
    school: { start: "lesson", laps: 0, ghost: false, saveBest: false, forwardOnly: true, lessons: true },
    trial: { start: "rolling", laps: 0, ghost: true, saveBest: true, submits: true },
    daily: { start: "rolling", laps: 0, ghost: false, saveBest: false, daily: true },
    race: { start: "grid", laps: 3, ghost: false, saveBest: false, race: true, circuitsOnly: true },
    rally: { start: "stage", laps: 0, ghost: false, saveBest: true, splits: true, stagesOnly: true },
  };
  // Modes that only use the authored direction of each circuit.
  for (const id in MODES) if (MODES[id].forwardOnly) MODES[id].layouts = (l) => !l.reversed;
  const ROLLING_BACK = 140;      // metres before the line a rolling start begins
  const STAGE_COUNTDOWN = 3;     // seconds before a rally stage starts
  const SUBMIT_CAR = "hatch";    // the Cape Aidan GT: the only car whose times go to Game Center
  const ROLLING_SPEED = 0.55;    // fraction of top speed

  function rulesFor(id) {
    return MODES[id] || MODES.trial;
  }

  function createRun(app) {
    const run = { rules: null, recorder: BDR.ghost.createRecorder(), playback: null, ghostKey: null, recording: false };
    const layoutKey = () => app.session.trackId + "/" + app.session.layoutId;

    /** The physics model for this run: a lesson may require one. */
    run.model = () => (run.lesson && run.lesson.model) || app.choice.model;

    /** Place the car(s), reset the clock and fetch the ghost. */
    run.start = function () {
      const { session } = app;
      run.rules = rulesFor(app.choice.mode);
      const track = session.track;
      const diff = BDR.data.difficulty[app.choice.difficulty] || BDR.data.difficulty.normal;
      run.lesson = run.rules.lessons ? BDR.data.lessons.find((l) => l.track === session.trackId) || null : null;
      run.judge = null;
      run.lastLap = null;
      run.daily = run.rules.daily ? BDR.daily.today() : null;
      run.dailyLaps = 0;
      const weather = (run.lesson && run.lesson.weather) || (run.daily && run.daily.weather) || "dry";
      run.weather = weather;
      session.gripMargin = diff.gripMargin * BDR.data.weather[weather].grip;
      if (session.applyWeather) session.applyWeather(weather);
      session.goal = null;
      if (session.setMarkers) session.setMarkers([]);
      if (run.race) run.race.dispose();
      run.race = null;
      run.count = (run.count || 0) + 1;
      run.startTime = app.time;
      session.timer = BDR.createLapTimer(track, { limitMargin: diff.limitMargin });
      session.totalLaps = run.rules.laps || 0;
      session.gapMs = null;
      run.playback = null;
      run.recording = false;
      run.result = null;
      run.countdown = 0;
      run.crashed = null;
      const car = session.car;
      // Garage upgrades count in Race and Rally only; everywhere else the car is stock so times compare.
      const owned = BDR.garage.appliesIn(app.choice.mode) && app.garage ? app.garage.upgrades[session.carId] : null;
      car.spec = BDR.garage.apply(BDR.carById(session.carId), owned);
      if (run.lesson) {
        const plan = BDR.school.plan(run.lesson, track, car);
        const medal = (session.layout.medals || {})[run.lesson.goal.medal];
        run.judge = BDR.school.createJudge(plan, track, { limitMargin: diff.limitMargin, medalMs: medal && medal * diff.medalScale });
        session.goal = BDR.school.goalText(plan);
        if (session.setMarkers) session.setMarkers(plan.markers);
        if (plan.lap) BDR.physics.place(car, track, track.startS - ROLLING_BACK, 0, car.spec.topSpeed * ROLLING_SPEED);
        else BDR.physics.place(car, track, plan.from - 30, 0, run.lesson.startSpeed);
      } else if (run.rules.start === "rolling" && track.closed) {
        BDR.physics.place(car, track, track.startS - ROLLING_BACK, 0, car.spec.topSpeed * ROLLING_SPEED);
      } else if (run.rules.start === "stage") {
        BDR.physics.place(car, track, Math.min(track.startS, track.length), 0, 0);
        run.countdown = STAGE_COUNTDOWN;
        run.splitDelta = null;
      } else if (run.rules.start !== "grid") {
        BDR.physics.place(car, track, track.startS - (track.closed ? 12 : 0), 0, 0);
        session.timer.go(app.time, car);
      }
      car.distance = 0;
      if (run.rules.race) {
        run.race = BDR.race.create(app, BDR.hash((BDR.today ? BDR.dayKey(BDR.today()) : "") + "/race/" + session.trackId + "/" + run.count));
        car.distance = 0;
      }
      if (run.rules.ghost) {
        // Each car has its own ghost, so a quicker car never replaces another car's ghost.
        const key = (run.ghostKey = layoutKey()), carId = (run.ghostCar = session.carId);
        BDR.ghost.load(key, carId).then((saved) => {
          if (run.ghostKey === key && run.ghostCar === carId && saved) run.playback = BDR.ghost.createPlayback(saved);
        });
      }
    };

    // Rally splits: compare each checkpoint with the best stage run's split, kept for the session.
    run.bestSplits = {};
    BDR.on("checkpoint", (index, ms) => {
      if (!run.rules || !run.rules.splits) return;
      const best = run.bestSplits[layoutKey()];
      run.splitDelta = best && best[index - 1] !== undefined ? ms - best[index - 1] : null;
      BDR.emit("split", index, ms, run.splitDelta);
    });

    BDR.on("lapStart", () => {
      run.recorder.begin();
      run.recording = true;
    });

    BDR.on("lap", (record) => {
      if (!run.rules) return;
      run.lastLap = record;
      if (run.rules.splits) {
        const key = layoutKey();
        const best = run.bestSplits[key];
        if (record.valid && (!best || record.ms < best.total)) run.bestSplits[key] = Object.assign(record.splits.slice(), { total: record.ms });
        BDR.emit("stageDone", record, best ? best.total : null);
      }
      const { session } = app;
      const finished = run.recording ? run.recorder.finish(record.ms, session.carId) : null;
      if (!record.valid) return;
      if (run.daily) {
        const today = run.daily;
        BDR.store.get("dailyBest").then((stored) => {
          if (!BDR.daily.counts(stored, today.day, run.dailyLaps++)) return;
          if (stored && stored.day === today.day && stored.ms <= record.ms) return;
          BDR.store.set("dailyBest", { day: today.day, ms: record.ms }).then((saved) => saved && BDR.emit("saved", "dailyBest", saved));
        });
      }
      // Game Center: time trial submits the trainer car's laps only, so every time on a board is like for like.
      if (run.rules.submits && session.layout.board && session.carId === SUBMIT_CAR) {
        BDR.bridge.post("submitScore", { board: session.layout.board, centiseconds: Math.round(record.ms / 10) });
      }
      if (run.rules.saveBest) {
        const entry = {};
        entry[layoutKey() + "/" + session.carId] = record.ms;
        BDR.store.set("bestLaps", entry).then((stored) => stored && BDR.emit("saved", "bestLaps", stored));
      }
      if (run.rules.ghost && finished && BDR.ghost.isValid(finished)) {
        if (!run.playback || record.ms < run.playback.run.time) {
          run.playback = BDR.ghost.createPlayback(finished);
          BDR.ghost.save(run.ghostKey, run.ghostCar, finished);
        }
      }
    });

    /** Hitting a wall, barrier or tree hard ends the run. Returns true when the car has just crashed. */
    function crashCheck(car) {
      const rules = BDR.data.crash;
      let kind = null;
      if (car.impactSpeed > rules.minImpact) kind = car.impactKind === "barrier" || car.impactKind === "water" ? "barrier" : "wall";
      else if (app.session.trees && app.session.trees.near(car.x, car.z, rules.treeRadius + car.spec.size.width / 2)) kind = "tree";
      if (!kind) return false;
      run.crashed = kind;
      car.speed = 0;
      car.vx = car.vz = 0;
      car.roll = 0.12;
      car.pitch = -0.05;
      BDR.emit("crash", kind);
      return true;
    }

    /** Whether the player's car is held still (the race countdown). */
    run.frozen = () => !!(run.race && run.race.frozen) || run.countdown > 0;

    /** What drives the player's car this step: the input, or the race's launch from the pit exit. */
    run.controls = (input) => (run.race ? run.race.controls(input) : input);

    /** Seconds left before the start, or null when there is no countdown. */
    run.countdownLeft = () => (run.race && !run.race.state.started ? run.race.state.countdown : run.countdown > 0 ? run.countdown : null);

    /** Per simulation step, after physics. */
    run.step = function (time, dt) {
      const { session } = app;
      const car = session.car, track = session.track, timer = session.timer;
      if (run.countdown > 0) {
        run.countdown -= dt || 1 / 120;
        if (run.countdown <= 0) {
          run.countdown = 0;
          timer.go(time, car);
          BDR.emit("raceStart");
        }
        return;
      }
      if (run.race) {
        run.race.step(time, dt || 1 / 120);
        session.position = run.race.state.started ? run.race.position() : null;
        session.fieldSize = BDR.race.RIVALS + 1;
        session.pitDue = BDR.pitLane.of(track) ? !run.race.state.playerPitted : null;
      } else session.position = session.pitDue = null;
      timer.update(car, time);
      const t = timer.state;
      const distance = track.closed ? wrap(car.s - track.startS, track.length) : car.s;
      if (run.recording && t.started) run.recorder.sample(t.current, car, distance);
      session.gapMs = run.playback && t.started ? BDR.ghost.gap(run.playback, t.current, distance) : run.rules.splits ? run.splitDelta : null;
      if (!run.crashed && crashCheck(car)) return;
      if (run.judge && !run.result) {
        const verdict = run.judge.update(car, 1 / 120, run.lastLap);
        run.lastLap = null;
        if (verdict) {
          run.result = verdict;
          BDR.emit("lessonResult", run.lesson, verdict);
        }
      }
    };

    run.otherDots = () => (run.race ? run.race.dots() : []);

    /** Where the ghost is now, or null. */
    run.ghostPose = function () {
      const t = app.session.timer && app.session.timer.state;
      if (!run.playback || !t || !t.started) return null;
      const pose = run.playback.poseAt(t.current);
      return pose.done ? null : pose;
    };
    return run;
  }

  BDR.modes = { MODES, rulesFor, createRun, ROLLING_BACK };
})();
