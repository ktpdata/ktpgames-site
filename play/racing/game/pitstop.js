// The pit stop: while the car sits in its box, the crew works one task per math question (tyres, fuel, wing,
// final check). A right answer lets the crew finish the task quickly; a wrong one adds a fixed penalty, shows the
// right answer and moves on. The stop clock is game time and keeps running while the player thinks.
// Nothing flashes: each result is plain text, a still colour and an icon.
(function () {
  "use strict";

  function createPitStop(doc) {
    const $ = (id) => doc.getElementById(id);
    const panel = $("pitStop");
    const buttons = [0, 1, 2].map((i) => $("pitA" + i));
    let stop = null;

    function render() {
      const cfg = BDR.data.pit;
      const task = cfg.tasks[stop.index];
      $("pitTaskName").textContent = BDR.t("pitTaskOf", { task: BDR.t("pitTask." + task), n: stop.index + 1, total: cfg.tasks.length });
      const q = stop.question;
      $("pitQuestion").textContent = q.prompt;
      $("pitQuestion").setAttribute("aria-label", q.speech);
      buttons.forEach((b, i) => {
        b.textContent = q.labels[i];
        b.setAttribute("aria-label", q.spoken[i]);
        b.disabled = false;
        b.dataset.state = "";
      });
      $("pitResult").textContent = "";
      $("pitResult").dataset.state = "";
      cfg.tasks.forEach((t, i) => {
        const li = $("pitTask-" + t);
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
        doc.body.classList.add("pitting");
        panel.hidden = false;
        render();
      },
      /** The player picks answer button i (0..2). Ignored while the crew is working. */
      answer(i) {
        if (!stop || stop.wait > 0) return;
        const cfg = BDR.data.pit, q = stop.question;
        const right = q.choices[i] === q.answer;
        stop.results[stop.index] = right;
        stop.wait = cfg.work + (right ? 0 : cfg.wrongPenalty);
        if (!right) stop.penalty += cfg.wrongPenalty;
        buttons.forEach((b, k) => {
          b.disabled = true;
          b.dataset.state = q.choices[k] === q.answer ? "answer" : k === i ? "wrong" : "";
        });
        const task = BDR.t("pitTask." + cfg.tasks[stop.index]);
        $("pitResult").dataset.state = right ? "right" : "wrong";
        $("pitResult").textContent = right ? BDR.t("pitRight", { task }) : BDR.t("pitWrong", { answer: BDR.quiz.show(q.answer), s: cfg.wrongPenalty });
        $("pitTask-" + cfg.tasks[stop.index]).dataset.state = right ? "right" : "wrong";
        BDR.emit("pitAnswer", right, q);
      },
      /** Game time passes: the stop clock runs, and the crew finishes the current task. */
      step(dt) {
        if (!stop) return;
        stop.time += dt;
        $("pitClock").textContent = BDR.math.formatTime(stop.time * 1000);
        if (stop.wait <= 0) return;
        stop.wait -= dt;
        if (stop.wait > 0) return;
        stop.wait = 0;
        stop.index++;
        if (stop.index < BDR.data.pit.tasks.length) {
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
        doc.body.classList.remove("pitting");
      },
    };
    buttons.forEach((b, i) => b.addEventListener("click", () => pit.answer(i)));
    return pit;
  }

  BDR.createPitStop = createPitStop;
})();
