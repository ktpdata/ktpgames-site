// Setup screen: mode, track, layout, car, difficulty, driving model and steering settings.
// A change rebuilds only what it affects; the page never reloads.
(function () {
  "use strict";
  const FIELDS = ["mode", "track", "layout", "car", "difficulty", "model", "sensitivity"];
  const TOGGLES = ["racingLine", "autoGas", "tiltOnIPad"];
  const DEFAULTS = { mode: "trial", track: null, layout: null, car: "hatch", difficulty: "normal", model: "arcade",
    sensitivity: 0, racingLine: false, autoGas: false, tiltOnIPad: false };

  /** Tracks offered to the player: the real ones, or the test circuit while it is the only one. */
  function playableTracks() {
    const real = BDR.data.tracks.filter((t) => !t.dev);
    return real.length ? real : BDR.data.tracks;
  }

  /** Modes the page has rules for, in menu order. */
  function availableModes() {
    return BDR.data.modes.filter((m) => BDR.modes.MODES[m]);
  }

  /** Lessons in order, each with its track and whether it is open given `cleared` lessons passed. */
  function lessonList(cleared) {
    return BDR.data.lessons.map((l, i) => ({ lesson: l, index: i, track: BDR.data.tracks.find((t) => t.id === l.track), open: i <= (cleared || 0) }));
  }

  /** Tracks offered for a mode. In driving school the order and locks follow the lessons. */
  function tracksFor(rules, progress) {
    if (rules.lessons) return lessonList(progress && progress.school).filter((x) => x.open).map((x) => x.track);
    return playableTracks().filter((t) => BDR.track.layoutsOf(t).some((l) => layoutAllowed(rules, l)));
  }

  /** Whether a mode can use a layout: circuit-only modes skip point-to-point stages and vice versa. */
  function layoutAllowed(rules, l) {
    if (rules.layouts && !rules.layouts(l)) return false;
    if (rules.circuitsOnly && l.closed === false) return false;
    if (rules.stagesOnly && l.closed !== false) return false;
    return true;
  }

  /** Turn any stored or partial choice into a valid one. */
  function normalize(choice, progress) {
    const c = Object.assign({}, DEFAULTS, choice);
    if (!availableModes().includes(c.mode)) c.mode = availableModes().includes(DEFAULTS.mode) ? DEFAULTS.mode : availableModes()[0];
    const rules = BDR.modes.rulesFor(c.mode);
    if (rules.daily) {
      const today = BDR.daily.today();
      c.track = today.track;
      c.layout = today.layout;
    }
    const tracks = tracksFor(rules, progress);
    const track = tracks.find((t) => t.id === c.track) || (rules.lessons ? tracks[tracks.length - 1] : tracks[0]);
    c.track = track.id;
    const layouts = BDR.track.layoutsOf(track).filter((l) => layoutAllowed(rules, l));
    c.layout = (layouts.find((l) => l.id === c.layout) || layouts[0]).id;
    if (!BDR.data.cars.some((x) => x.id === c.car)) c.car = BDR.data.cars[0].id;
    if (!BDR.data.difficulty[c.difficulty]) c.difficulty = "normal";
    if (!BDR.data.models.includes(c.model)) c.model = "arcade";
    if (!BDR.data.sensitivities.includes(c.sensitivity)) c.sensitivity = 0;
    c.racingLine = !!c.racingLine;
    c.autoGas = !!c.autoGas;
    c.tiltOnIPad = !!c.tiltOnIPad;
    return c;
  }

  /** The ten-field settings record the native store accepts. */
  function toSettings(c) {
    return { track: c.track, layout: c.layout, car: c.car, mode: c.mode, difficulty: c.difficulty, model: c.model,
      sensitivity: c.sensitivity, racingLine: c.racingLine, autoGas: c.autoGas, tiltOnIPad: c.tiltOnIPad };
  }

  function name(kind, item) {
    const key = kind + "." + item.id;
    const t = BDR.t(key);
    return t === key ? item.name : t;
  }
  function layoutName(layout) {
    const base = name("layout", layout.reversed ? { id: layout.reverseOf, name: layout.name } : layout);
    return layout.reversed ? BDR.t("reversed", { name: base }) : base;
  }

  function createSetup(app, doc, onChange) {
    const $ = (id) => doc.getElementById(id);
    let bests = {};
    let dailyBest = null;

    function options(select, items, selected) {
      const signature = items.map((i) => i.value + ":" + i.label + ":" + !!i.disabled).join("|");
      if (select.dataset.signature !== signature) {
        select.replaceChildren(...items.map((i) => {
          const o = doc.createElement("option");
          o.value = i.value;
          o.textContent = i.label;
          o.disabled = !!i.disabled;
          return o;
        }));
        select.dataset.signature = signature;
      }
      select.value = String(selected);
    }

    function fill() {
      const c = app.choice;
      const rules = BDR.modes.rulesFor(c.mode);
      options($("pickMode"), availableModes().map((m) => ({ value: m, label: BDR.t("mode." + m) })), c.mode);
      if (rules.lessons) {
        options($("pickTrack"), lessonList(app.progress.school).map((x) => ({ value: x.track.id, disabled: !x.open,
          label: BDR.t("lessonOption", { n: x.index + 1, skill: BDR.t("lesson." + x.lesson.id), track: name("track", x.track) }) })), c.track);
      } else options($("pickTrack"), playableTracks().map((t) => ({ value: t.id, label: name("track", t) })), c.track);
      $("pickTrackLabel").textContent = BDR.t(rules.lessons ? "labelLesson" : "labelTrack");
      const track = BDR.data.tracks.find((t) => t.id === c.track);
      const layouts = BDR.track.layoutsOf(track).filter((l) => layoutAllowed(rules, l));
      options($("pickLayout"), layouts.map((l) => ({ value: l.id, label: layoutName(l) })), c.layout);
      options($("pickCar"), BDR.data.cars.map((x) => ({ value: x.id, label: name("car", x) })), c.car);
      $("pickTrack").disabled = !!rules.daily;
      $("pickLayout").disabled = !!rules.daily;
      options($("pickDifficulty"), BDR.difficultyIds.map((d) => ({ value: d, label: BDR.t("difficulty." + d) })), c.difficulty);
      options($("pickModel"), BDR.data.models.map((m) => ({ value: m, label: BDR.t("model." + m) })), c.model);
      options($("pickSensitivity"), BDR.data.sensitivities.map((s) => ({ value: s, label: BDR.t("sensitivity." + s) })), c.sensitivity);
      TOGGLES.forEach((key) => $(key).setAttribute("aria-pressed", String(!!c[key])));
      // The tilt switch exists only on iPad; Mac never tilts and iPhone always does.
      $("tiltOnIPad").hidden = app.device !== "iPad";
      $("modeHint").textContent = BDR.t("modeHint." + c.mode);
      $("leaderboard").hidden = !boardFor(c);
      showBest();
      showMath();
    }

    /** The player's math level: it sets the pit crew's and garage drills' questions. */
    function showMath() {
      const l = BDR.quiz.levelData(app.math.level);
      $("setupMath").textContent = BDR.t("mathLevel", { level: l.level, name: l.name });
    }

    function showBest() {
      const c = app.choice;
      if (BDR.modes.rulesFor(c.mode).daily) {
        const today = BDR.daily.today();
        const best = dailyBest && dailyBest.day === today.day ? BDR.t("bestFor", { time: BDR.math.formatTime(dailyBest.ms) }) : BDR.t("noBestYet");
        $("setupBest").textContent = BDR.t("dailyInfo", { weather: BDR.t("weather." + today.weather) }) + " " + best;
        return;
      }
      if (BDR.modes.rulesFor(c.mode).lessons) {
        const lesson = BDR.data.lessons.find((l) => l.track === c.track);
        $("setupBest").textContent = lesson ? BDR.t("lessonTip." + lesson.id) : "";
        return;
      }
      const ms = bests[c.track + "/" + c.layout + "/" + c.car];
      $("setupBest").textContent = ms ? BDR.t("bestFor", { time: BDR.math.formatTime(ms) }) : BDR.t("noBestYet");
    }

    /** The Game Center board for the chosen layout, or null. The button hides when there is none. */
    function boardFor(c) {
      const track = BDR.data.tracks.find((t) => t.id === c.track);
      const layout = track && BDR.track.layoutsOf(track).find((l) => l.id === c.layout);
      return (layout && layout.board) || null;
    }

    $("leaderboard").addEventListener("click", () => {
      const c = app.choice, board = boardFor(c);
      if (!board) return;
      const best = bests[c.track + "/" + c.layout + "/hatch"];
      BDR.bridge.post("leaderboard", { board, centiseconds: best ? Math.round(best / 10) : 0 });
    });

    function change(field, raw) {
      const value = field === "sensitivity" ? Number(raw) : raw;
      const proposed = Object.assign({}, app.choice, { [field]: value });
      // Entering driving school goes straight to the next lesson to pass.
      if (field === "mode" && BDR.modes.rulesFor(value).lessons) {
        const list = lessonList(app.progress.school);
        proposed.track = list[Math.min(app.progress.school, list.length - 1)].track.id;
      }
      const next = normalize(proposed, app.progress);
      Object.assign(app.choice, next);
      fill();
      onChange(field);
      save();
    }

    function save() {
      return BDR.store.set("settings", toSettings(app.choice));
    }

    const ids = { mode: "pickMode", track: "pickTrack", layout: "pickLayout", car: "pickCar", difficulty: "pickDifficulty",
      model: "pickModel", sensitivity: "pickSensitivity" };
    FIELDS.forEach((field) => $(ids[field]).addEventListener("change", (e) => change(field, e.target.value)));
    TOGGLES.forEach((key) => $(key).addEventListener("click", () => change(key, !app.choice[key])));

    BDR.on("saved", (key, value) => {
      if (key === "dailyBest") {
        dailyBest = value;
        showBest();
      }
      if (key === "bestLaps" && value) {
        bests = value;
        showBest();
      }
    });

    return {
      fill,
      change,
      save,
      boardFor,
      /** Restore last-used settings and saved bests. Resolves once the choice is applied. */
      async restore() {
        const [settings, laps, school, daily, math, credits, upgrades] = await Promise.all([BDR.store.get("settings"),
          BDR.store.get("bestLaps"), BDR.store.get("schoolCleared"), BDR.store.get("dailyBest"), BDR.store.get("mathProgress"),
          BDR.store.get("credits"), BDR.store.get("upgrades")]);
        if (math && typeof math === "object") app.math = BDR.quiz.normalize(math);
        if (Number.isInteger(credits) && credits >= 0) app.garage.credits = credits;
        if (upgrades && typeof upgrades === "object") app.garage.upgrades = BDR.garage.normalize(upgrades);
        if (daily && typeof daily === "object") dailyBest = daily;
        if (laps && typeof laps === "object") bests = laps;
        if (Number.isInteger(school)) app.progress.school = school;
        const before = JSON.stringify(app.choice);
        if (settings && typeof settings === "object") Object.assign(app.choice, normalize(settings, app.progress));
        fill();
        if (JSON.stringify(app.choice) !== before) onChange("restore");
      },
    };
  }

  BDR.setup = { createSetup, normalize, toSettings, playableTracks, lessonList, DEFAULTS };
})();
