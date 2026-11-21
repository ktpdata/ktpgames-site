// Boot and frame loop. Simulation runs at a fixed 1/120 s step accumulated from frame time.
(function () {
  "use strict";
  const STEP = 1 / 120;
  /** Longest frame we accept; a stall longer than this is dropped rather than simulated. */
  const MAX_FRAME = 0.1;

  /** Remember whether the player last used touch (the default) or a keyboard, for the focus ring. */
  BDR.trackInputKind = function (doc) {
    doc.body.dataset.input = "touch";
    if (!doc.addEventListener) return;
    doc.addEventListener("pointerdown", () => (doc.body.dataset.input = "touch"), true);
    doc.addEventListener("keydown", () => (doc.body.dataset.input = "keyboard"), true);
  };

  BDR.boot = function (env) {
    const doc = env.document || document;
    const $ = (id) => doc.getElementById(id);
    const body = doc.body;
    BDR.applyStrings(doc);
    BDR.trackInputKind(doc);
    BDR.today = env.today;

    const reduceMotion = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    const input = BDR.createInput();
    BDR.bindControls(input, doc);

    // Renderer and an empty scene.
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    $("scene").appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    const lights = { hemi: new THREE.HemisphereLight(0xdfefff, 0x4a5a3a, 1.1), sun: new THREE.DirectionalLight(0xffffff, 1.4) };
    lights.sun.position.set(-80, 120, 60);
    scene.add(lights.hemi, lights.sun);
    scene.environment = BDR.carModel.environment(THREE, renderer);
    const camera = new THREE.PerspectiveCamera(BDR.camera.BASE_FOV, 16 / 9, 0.3, 4000);
    function resize() {
      const w = window.innerWidth || 852, h = window.innerHeight || 393;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    }
    window.addEventListener("resize", resize);
    resize();

    // App state.
    const app = (BDR.app = { mode: "setup", active: true, input, scene, camera, renderer, reduceMotion, time: 0, THREE, doc, lights });
    body.dataset.mode = app.mode;
    const hud = (app.hud = BDR.createHud(doc));
    const chase = (app.chase = BDR.createChase(camera, reduceMotion));
    app.pitStop = BDR.createPitStop(doc);
    app.progress = { school: 0 };
    app.math = BDR.quiz.normalize(null);
    // Garage: credits and per-car upgrades, saved through the native store.
    app.garage = { credits: 0, upgrades: BDR.garage.normalize(null) };
    app.earn = function (n) {
      if (!n) return;
      app.garage.credits = Math.min(BDR.data.credits.max, app.garage.credits + n);
      BDR.store.set("credits", app.garage.credits);
    };
    /** Buy the next step of a part for a car. Refused (false) without enough credits or math level. */
    app.buyUpgrade = function (carId, partId) {
      const done = BDR.garage.buy(app.garage.upgrades[carId], partId, app.garage.credits, app.math.level);
      if (!done) return false;
      app.garage.credits = done.credits;
      app.garage.upgrades[carId] = done.owned;
      BDR.store.set("upgrades", { [carId]: done.owned });
      BDR.store.set("credits", app.garage.credits);
      return true;
    };
    /** Record one math answer, save the player's level, and tell the setup screen if it moved. */
    app.answered = function (right) {
      app.math = BDR.quiz.record(app.math, right);
      BDR.store.set("mathProgress", { level: app.math.level, recent: app.math.recent });
      if (app.math.moved) {
        BDR.emit("mathLevel", app.math.level, app.math.moved);
        setup.fill();
      }
    };
    app.choice = BDR.setup.normalize({}, app.progress);
    app.session = BDR.createSession(app);
    app.run = BDR.modes.createRun(app);
    BDR.on("track", (session) => hud.setTrack(session.track));

    /** Rebuild whatever the current choice changed, then line the car up at the start. */
    function applyChoice() {
      app.session.load(app.choice);
      input.setAutoGas(app.choice.autoGas);
      $("throttle").hidden = app.choice.autoGas;
      body.classList.toggle("autogas", app.choice.autoGas);
      BDR.bridge.post("sensitivity", { level: app.choice.sensitivity });
      if (app.device === "iPad") BDR.bridge.post("tiltPreference", { enabled: app.choice.tiltOnIPad });
      BDR.emit("choice", app.choice);
      prepareRun();
    }
    /** Put the car(s) on the road ready to go and reset the clock. */
    function prepareRun() {
      app.pitStop.close();
      app.run.start();
      chase.snap(app.session.car, app.session.track);
    }
    app.prepareRun = prepareRun;
    app.mapDots = () => {
      const car = app.session.car, ghost = app.run.ghostPose();
      const dots = [{ x: car.x, z: car.z, kind: "player" }];
      if (ghost) dots.push({ x: ghost.x, z: ghost.z, kind: "ghost" });
      return dots.concat(app.run.otherDots ? app.run.otherDots() : []);
    };
    app.device = "phone";
    BDR.on("native:device", (m) => {
      app.device = m.kind;
      body.dataset.device = m.kind;
      if (m.kind === "iPad") BDR.bridge.post("tiltPreference", { enabled: app.choice.tiltOnIPad });
      setup.fill();
    });
    const setup = (app.setup = BDR.setup.createSetup(app, doc, applyChoice));
    app.garageView = BDR.createGarageView(app, doc);
    applyChoice();
    setup.fill();
    app.ready = setup.restore();

    BDR.on("split", (index, ms, delta) => {
      const text = BDR.t("splitN", { n: index, time: BDR.math.formatTime(ms) });
      hud.toast(delta === null ? text : text + "  " + BDR.math.formatGap(delta));
    });
    BDR.on("stageDone", (record, previous) => {
      const time = BDR.math.formatTime(record.ms);
      const message = !record.valid ? BDR.t(record.cut ? "cutLap" : "missedCheckpoint")
        : previous === null ? BDR.t("stageTime", { time }) : BDR.t("stageTimeVs", { time, gap: BDR.math.formatGap(record.ms - previous) });
      app.finish(BDR.t("stageDone"), message);
    });

    BDR.on("lap", (record, t) => {
      if (app.run.rules && app.run.rules.splits) return;
      if (record.missed) hud.toast(BDR.t("missedCheckpoint"));
      else if (record.cut) hud.toast(BDR.t("cutLap"));
      else if (t.best === record.ms) hud.toast(BDR.t("newBest", { time: BDR.math.formatTime(record.ms) }));
      else hud.toast(BDR.t("lapDone", { time: BDR.math.formatTime(record.ms) }));
    });

    function setMode(mode) {
      app.mode = mode;
      body.dataset.mode = mode;
      if (mode === "driving") BDR.bridge.post("driving");
      else BDR.bridge.post("stopped");
      if (mode !== "driving") input.releaseAll();
    }
    app.setMode = setMode;
    function showOverlay(title, message) {
      $("overlayTitle").textContent = title;
      $("overlayMsg").textContent = message;
    }
    function pause() {
      if (app.mode !== "driving") return;
      showOverlay(BDR.t("paused"), BDR.t("holdLikeWheel"));
      setMode("paused");
    }
    app.pause = pause;
    /** End of a run: show the result with Restart and Setup, plus an optional next step. */
    let nextAction = null;
    app.finish = function (title, message, next) {
      showOverlay(title, message);
      nextAction = next ? next.run : null;
      $("overlayNext").hidden = !next;
      if (next) $("overlayNext").textContent = next.label;
      $("overlayRestart").textContent = BDR.t(next ? "tryAgain" : "restart");
      setMode("finished");
    };
    $("overlayNext").addEventListener("click", () => nextAction && nextAction());

    BDR.on("raceStart", () => hud.toast(BDR.t("go")));
    // A crash ends whatever run is going: no flash, no shake, just the result panel.
    BDR.on("crash", (kind) => app.finish(BDR.t("crashed"), BDR.t("crash." + kind)));
    BDR.on("native:leaderboardStatus", (m) => m.message && hud.toast(m.message));
    BDR.on("raceFinished", (place, field, info) => {
      const key = app.session.trackId + "/" + app.session.layoutId;
      BDR.store.set("raceWins", { [key]: place });
      const penalty = (info && info.penalty) || 0;
      const time = BDR.math.formatTime((app.time - app.run.race.state.startTime + penalty) * 1000);
      const earned = BDR.garage.raceCredits(place);
      app.earn(earned);
      const message = BDR.t("raceResult", { place, field, time }) + (penalty ? "\n" + BDR.t("missedPit", { s: penalty }) : "") +
        (earned ? "\n" + BDR.t("raceCredits", { n: earned }) : "");
      app.finish(BDR.t(place === 1 ? "raceWon" : "raceDone"), message);
    });
    // Pit row: the stop's questions use the player's math level (from the save store, level 1 until then).
    BDR.on("pitAhead", (side) => hud.toast(BDR.t("pitAhead", { side: BDR.t("side." + side) })));
    BDR.on("pitIn", () => hud.toast(BDR.t("pitLane")));
    BDR.on("pitBox", (stop) => app.pitStop.start({ level: () => app.math.level, seed: stop.seed, done: stop.done }));
    // Every answer moves the adaptive math level, which is saved per player.
    BDR.on("pitAnswer", (right) => app.answered(right));
    BDR.on("pitOut", (summary) => hud.toast(summary ? BDR.t("pitSummary", { time: BDR.math.formatTime(summary.time * 1000), right: summary.right, total: summary.total }) : BDR.t("pitOut")));

    BDR.on("lessonResult", (lesson, verdict) => {
      const index = BDR.data.lessons.indexOf(lesson);
      const nextLesson = BDR.data.lessons[index + 1];
      if (verdict.pass && index + 1 === app.progress.school + 1) {
        app.progress.school = index + 1;
        BDR.store.set("schoolCleared", index + 1);
      }
      const next = verdict.pass && nextLesson ? { label: BDR.t("nextLesson"), run: () => {
        setup.change("track", nextLesson.track);
        prepareRun();
        drive();
      } } : null;
      const message = verdict.pass && !nextLesson ? BDR.t("schoolComplete") : BDR.t(verdict.reason);
      app.finish(BDR.t(verdict.pass ? "lessonPassed" : "lessonFailed"), message, next);
      setup.fill();
    });
    function drive() {
      if (!app.active) return;
      input.reset();
      setMode("driving");
    }

    BDR.on("fallback", (on) => body.classList.toggle("fallback", on));
    body.classList.toggle("fallback", input.state.fallback);
    BDR.on("active", (value) => {
      app.active = value;
      if (!value) pause();
    });

    $("start").addEventListener("click", () => {
      setup.save();
      prepareRun();
      drive();
    });
    $("overlayAction").addEventListener("click", drive);
    $("overlayRestart").addEventListener("click", () => {
      $("overlayNext").hidden = true;
      prepareRun();
      drive();
    });
    $("overlaySetup").addEventListener("click", () => {
      prepareRun();
      setMode("setup");
    });
    $("pause").addEventListener("click", pause);
    $("recenter").addEventListener("click", () => BDR.bridge.post("recenter"));
    if (doc.addEventListener) doc.addEventListener("visibilitychange", () => doc.hidden && pause());

    // Frame loop.
    let last = null, acc = 0;
    function simulate(dt) {
      const driving = app.mode === "driving";
      input.update(dt, driving);
      if (!driving) return;
      app.time += dt;
      const { car, track } = app.session;
      if (!app.run.frozen()) {
        BDR.physics.step(car, app.run.controls(input.state), track, dt, { model: app.run.model(), gripMargin: app.session.gripMargin });
        car.distance = (car.distance || 0) + car.speed * dt;
      }
      app.run.step(app.time, dt);
      app.pitStop.step(dt);
    }
    function frame(ts) {
      const seconds = ts / 1000;
      const dt = last === null ? 0 : Math.min(Math.max(seconds - last, 0), MAX_FRAME);
      last = seconds;
      acc += dt;
      while (acc >= STEP) {
        simulate(STEP);
        acc -= STEP;
      }
      const { car, track, carModel } = app.session;
      BDR.carModel.pose(carModel, car);
      app.session.poseGhost(app.run.ghostPose());
      if (app.run.race) app.run.race.pose();
      const left = app.run.countdownLeft();
      hud.countdown(left === null ? null : Math.ceil(left));
      if (app.mode === "driving") chase.update(car, track, dt);
      else if (app.mode === "setup") chase.snap(car, track);
      else if (app.mode === "garage") app.garageView.frame(dt);
      hud.update(app, dt);
      if (app.session.sky) app.session.sky.position.copy(camera.position);
      renderer.render(scene, camera);
      window.requestAnimationFrame(frame);
    }
    app.simulate = simulate;
    window.requestAnimationFrame(frame);
    BDR.bridge.post("ready");
    return app;
  };

  // Car models are parsed before the first frame, so every car is complete when it is built.
  if (!window.BDR_TEST) BDR.carModels.load(THREE).then(() => BDR.boot({ document, today: () => new Date() }), (error) => console.error(error));
})();
