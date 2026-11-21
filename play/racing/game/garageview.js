// The garage screen: the chosen car turning slowly on its spot (still under Reduce Motion), its four upgrade bars,
// the player's credits and math level, and the Drill button. A drill is ten questions at the player's level with
// no timer: one credit per right answer, and every answer moves the adaptive math level.
(function () {
  "use strict";
  const SPIN = 0.25;          // radians per second the car turns
  const STILL_ANGLE = 0.65;   // the fixed three-quarter view under Reduce Motion

  function createGarageView(app, doc) {
    const $ = (id) => doc.getElementById(id);
    const U = BDR.data.upgrades;
    const answers = [0, 1, 2].map((i) => $("drillA" + i));
    let spin = 0, drill = null;

    function carName() {
      return BDR.carById(app.choice.car).name;
    }

    function render() {
      const owned = app.garage.upgrades[app.choice.car];
      $("garageTitle").textContent = BDR.t("garageTitle", { car: carName() });
      $("garageCredits").textContent = BDR.t("credits", { n: app.garage.credits });
      const l = BDR.quiz.levelData(app.math.level);
      $("garageMath").textContent = BDR.t("mathLevel", { level: l.level, name: l.name });
      for (const part of U.parts) {
        const n = owned[part.id];
        const bar = $("bar-" + part.id);
        bar.setAttribute("aria-label", BDR.t("upgradeBar", { part: BDR.t("part." + part.id), n, total: U.steps }));
        [...Array(U.steps).keys()].forEach((k) => ($("bar-" + part.id + "-" + k).dataset.on = k < n ? "1" : "0"));
        const next = BDR.garage.nextStep(owned, part.id, app.garage.credits, app.math.level);
        const button = $("buy-" + part.id);
        button.disabled = !next.ok;
        button.textContent = next.reason === "max" ? BDR.t("upgradeMax")
          : next.reason === "mathLevel" ? BDR.t("upgradeNeedsLevel", { level: next.level })
            : BDR.t("upgradeCost", { cost: next.cost });
        button.setAttribute("aria-label", next.reason === "max" ? BDR.t("upgradeMaxLabel", { part: BDR.t("part." + part.id) })
          : BDR.t("upgradeLabel", { part: BDR.t("part." + part.id), step: next.step, text: button.textContent }));
      }
    }

    function renderDrill() {
      const q = drill.question;
      $("drillCount").textContent = BDR.t("drillOf", { n: drill.index + 1, total: drill.total });
      $("drillQuestion").textContent = q.prompt;
      $("drillQuestion").setAttribute("aria-label", q.speech);
      answers.forEach((b, i) => {
        b.textContent = q.labels[i];
        b.setAttribute("aria-label", q.spoken[i]);
        b.disabled = false;
        b.dataset.state = "";
      });
      $("drillResult").textContent = "";
      $("drillResult").dataset.state = "";
      $("drillNext").hidden = true;
      if (answers[0].focus) answers[0].focus();
    }

    const view = {
      /** Show the garage for the car chosen on the setup screen. */
      open() {
        drill = null;
        $("drill").hidden = true;
        $("garageMain").hidden = false;
        app.setMode("garage");
        render();
        if ($("garageBack").focus) $("garageBack").focus();
      },
      close() {
        drill = null;
        app.setMode("setup");
        app.setup.fill();
      },
      buy(partId) {
        if (app.buyUpgrade(app.choice.car, partId)) render();
      },
      /** Start a ten-question drill at the player's current level. */
      startDrill(seed) {
        const cfg = BDR.data.credits;
        drill = { index: 0, total: cfg.drillQuestions, right: 0, rng: BDR.rng(seed || BDR.hash("drill/" + app.time + "/" + app.garage.credits)) };
        drill.question = BDR.quiz.question(app.math.level, drill.rng);
        $("garageMain").hidden = true;
        $("drill").hidden = false;
        renderDrill();
      },
      get drill() {
        return drill;
      },
      answer(i) {
        if (!drill || drill.answered) return;
        const q = drill.question, right = q.choices[i] === q.answer;
        drill.answered = true;
        if (right) drill.right++;
        app.answered(right);
        if (right) app.earn(BDR.data.credits.perRightAnswer);
        answers.forEach((b, k) => {
          b.disabled = true;
          b.dataset.state = q.choices[k] === q.answer ? "answer" : k === i ? "wrong" : "";
        });
        $("drillResult").dataset.state = right ? "right" : "wrong";
        $("drillResult").textContent = right ? BDR.t("drillRight", { n: BDR.data.credits.perRightAnswer }) : BDR.t("drillWrong", { answer: BDR.quiz.show(q.answer) });
        const last = drill.index + 1 >= drill.total;
        $("drillNext").textContent = BDR.t(last ? "drillFinish" : "drillNext");
        $("drillNext").hidden = false;
        if ($("drillNext").focus) $("drillNext").focus();
      },
      /** No timer: the player moves on when ready. */
      next() {
        if (!drill || !drill.answered) return;
        drill.index++;
        drill.answered = false;
        if (drill.index >= drill.total) {
          const earned = drill.right * BDR.data.credits.perRightAnswer;
          drill = null;
          $("drill").hidden = true;
          $("garageMain").hidden = false;
          render();
          $("garageNote").textContent = BDR.t("drillDone", { right: earned / BDR.data.credits.perRightAnswer, n: earned });
          return;
        }
        drill.question = BDR.quiz.question(app.math.level, drill.rng);
        renderDrill();
      },
      /** Each frame while the garage is open: turn the car (or hold it still) and frame it from the side. */
      frame(dt) {
        const { carModel, car } = app.session;
        if (!carModel || !car) return;
        spin = app.reduceMotion ? STILL_ANGLE : spin + SPIN * dt;
        carModel.rotation.y = -car.heading + spin;
        const fx = Math.sin(car.heading), fz = -Math.cos(car.heading), rx = -fz, rz = fx;
        // The panel sits on the right, so the camera aims a little to the right of the car to keep it in view.
        app.camera.position.set(car.x + fx * 1.5 - rx * 7.5, car.y + 2.2, car.z + fz * 1.5 - rz * 7.5);
        app.camera.lookAt(car.x + fx * -2.4, car.y + 0.6, car.z + fz * -2.4);
      },
      render,
    };

    $("garageOpen").addEventListener("click", () => view.open());
    $("garageBack").addEventListener("click", () => view.close());
    $("drillStart").addEventListener("click", () => view.startDrill());
    $("drillNext").addEventListener("click", () => view.next());
    answers.forEach((b, i) => b.addEventListener("click", () => view.answer(i)));
    U.parts.forEach((p) => $("buy-" + p.id).addEventListener("click", () => view.buy(p.id)));
    return view;
  }

  BDR.createGarageView = createGarageView;
})();
