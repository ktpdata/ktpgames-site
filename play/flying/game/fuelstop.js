// The fuel stop, copied from Brain Drain Racing's game/pitstop.js: while the plane sits at the pump, the crew
// works one task per math question (fuel, oil, tyres, final check). A right answer lets the crew finish the task
// quickly; a wrong one adds a fixed penalty, shows the
// right answer and moves on. The stop clock is game time and keeps running while the player thinks.
// Nothing flashes: each result is plain text, a still colour and an icon.
(function () {
  "use strict";

  function createFuelStop(doc) {
    const $ = (id) => doc.getElementById(id);
    const panel = $("fuelStop");
    const buttons = [0, 1, 2].map((i) => $("fuelA" + i));
    let stop = null;

    function render() {
      const cfg = BDR.data.fuel;
      const task = cfg.tasks[stop.index];
      $("fuelTaskName").textContent = BDR.t("fuelTaskOf", { task: BDR.t("fuelTask." + task), n: stop.index + 1, total: cfg.tasks.length });
      const q = stop.question;
      $("fuelQuestion").textContent = q.prompt;
      $("fuelQuestion").setAttribute("aria-label", q.speech);
      buttons.forEach((b, i) => {
        b.textContent = q.labels[i];
        b.setAttribute("aria-label", q.spoken[i]);
        b.disabled = false;
        b.dataset.state = "";
      });
      $("fuelResult").textContent = "";
      $("fuelResult").dataset.state = "";
      cfg.tasks.forEach((t, i) => {
        const li = $("fuelTask-" + t);
        li.dataset.state = stop.results[i] === undefined ? (i === stop.index ? "now" : "todo") : stop.results[i] ? "right" : "wrong";
      });
      if (buttons[0].focus) buttons[0].focus();
    }

    const pit = {
      get open() {
        return !!stop;
      },
      get state() {
        return stop;
      },
      /** Start a stop. opts: { level: number or () => number (read for each question), seed, done(summary) }. */
      start(opts) {
        const level = typeof opts.level === "function" ? opts.level : () => opts.level || 1;
        stop = { index: 0, results: [], wait: 0, time: 0, penalty: 0, rng: BDR.rng(opts.seed || 1), level, done: opts.done };
        stop.question = BDR.quiz.question(stop.level(), stop.rng);
        doc.body.classList.add("fueling");
        panel.hidden = false;
        render();
      },
      /** The player picks answer button i (0..2). Ignored while the crew is working. */
      answer(i) {
        if (!stop || stop.wait > 0) return;
        const cfg = BDR.data.fuel, q = stop.question;
        const right = q.choices[i] === q.answer;
        stop.results[stop.index] = right;
        stop.wait = cfg.work + (right ? 0 : cfg.wrongPenalty);
        if (!right) stop.penalty += cfg.wrongPenalty;
        buttons.forEach((b, k) => {
          b.disabled = true;
          b.dataset.state = q.choices[k] === q.answer ? "answer" : k === i ? "wrong" : "";
        });
        const task = BDR.t("fuelTask." + cfg.tasks[stop.index]);
        $("fuelResult").dataset.state = right ? "right" : "wrong";
        $("fuelResult").textContent = right ? BDR.t("fuelRight", { task }) : BDR.t("fuelWrong", { answer: BDR.quiz.show(q.answer), s: cfg.wrongPenalty });
        $("fuelTask-" + cfg.tasks[stop.index]).dataset.state = right ? "right" : "wrong";
        BDR.emit("fuelAnswer", right, q);
      },
      /** Game time passes: the stop clock runs, and the crew finishes the current task. */
      step(dt) {
        if (!stop) return;
        stop.time += dt;
        $("fuelClock").textContent = BDR.math.formatTime(stop.time * 1000);
        if (stop.wait <= 0) return;
        stop.wait -= dt;
        if (stop.wait > 0) return;
        stop.wait = 0;
        stop.index++;
        if (stop.index < BDR.data.fuel.tasks.length) {
          stop.question = BDR.quiz.question(stop.level(), stop.rng);
          render();
          return;
        }
        const summary = { time: stop.time, right: stop.results.filter(Boolean).length, total: stop.results.length, penalty: stop.penalty };
        const done = stop.done;
        pit.close();
        if (done) done(summary);
      },
      close() {
        stop = null;
        panel.hidden = true;
        doc.body.classList.remove("fueling");
      },
    };
    buttons.forEach((b, i) => b.addEventListener("click", () => pit.answer(i)));
    return pit;
  }

  BDR.createFuelStop = createFuelStop;

  // Copied from Racing's game/main.js (commit 7a90a95).
  /** Remember whether the player last used touch (the default) or a keyboard, for the focus ring. */
  BDR.trackInputKind = function (doc) {
    doc.body.dataset.input = "touch";
    if (!doc.addEventListener) return;
    doc.addEventListener("pointerdown", () => (doc.body.dataset.input = "touch"), true);
    doc.addEventListener("keydown", () => (doc.body.dataset.input = "keyboard"), true);
  };
})();
