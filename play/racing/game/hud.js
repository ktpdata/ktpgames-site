// On-screen display. Reads state; never changes it.
(function () {
  "use strict";
  const { mph, clamp, formatTime, formatGap } = BDR.math;
  const TOAST_SECONDS = 2.6;

  function createHud(doc) {
    const $ = (id) => doc.getElementById(id);
    const cache = new Map();
    const map = BDR.createMinimap($("map"));
    let toastLeft = 0;

    /** Only touch the DOM when a value actually changes. */
    function set(id, text) {
      if (cache.get(id) === text) return;
      cache.set(id, text);
      $(id).textContent = text;
    }
    function show(id, visible) {
      const key = "show:" + id;
      if (cache.get(key) === visible) return;
      cache.set(key, visible);
      $(id).hidden = !visible;
    }

    const hud = {
      set,
      show,
      /** Countdown before a standing start: a steady number, changing once a second. No flashing. */
      countdown(n) {
        show("countdown", n !== null && n > 0);
        if (n !== null && n > 0) set("countdown", String(n));
      },
      map,
      toast(text) {
        $("toast").textContent = text;
        show("toast", true);
        toastLeft = TOAST_SECONDS;
      },
      setTrack(track) {
        map.setTrack(track);
      },
      /** gapMs: signed gap to the ghost (negative = ahead), or null to hide. */
      update(app, dt) {
        const { session } = app;
        const car = session && session.car;
        if (car) set("speed", String(Math.round(Math.abs(mph(car.speed)))));
        const steer = clamp(app.input.state.steer, -1, 1);
        const left = (50 + steer * 48).toFixed(1);
        if (cache.get("needle") !== left) {
          cache.set("needle", left);
          $("steerNeedle").style.left = "calc(" + left + "% - 2px)";
        }
        const timer = session && session.timer;
        if (timer) {
          const t = timer.state;
          const total = session.totalLaps;
          set("lapLabel", !session.track.closed ? BDR.t("stage") : !t.started ? BDR.t(session.totalLaps ? "grid" : "outLap") : total ? BDR.t("lapOf", { lap: Math.min(t.lap, total), total }) : BDR.t("lapN", { lap: t.lap }));
          set("lapTime", formatTime(t.current * 1000));
          set("bestTime", formatTime(t.best === null ? NaN : t.best));
        }
        const gap = session && session.gapMs;
        show("gapRow", gap !== null && gap !== undefined);
        if (gap !== null && gap !== undefined) {
          set("gapLabel", BDR.t(app.run && app.run.rules && app.run.rules.splits ? "splitGap" : "ghostGap"));
          set("gap", formatGap(gap));
          const cls = gap <= 0 ? "ahead" : "behind";
          if (cache.get("gapClass") !== cls) {
            cache.set("gapClass", cls);
            $("gap").className = cls;
          }
        }
        show("pitRow", !!session && session.pitDue !== null && session.pitDue !== undefined);
        if (session && session.pitDue !== null && session.pitDue !== undefined) set("pitFlag", BDR.t(session.pitDue ? "pitDue" : "pitDone"));
        if (session && session.position) {
          show("position", true);
          set("position", BDR.t("positionOf", { pos: session.position, total: session.fieldSize }));
        } else show("position", false);
        const goal = session && session.goal;
        show("goal", !!goal);
        if (goal) set("goal", goal);
        if (toastLeft > 0) {
          toastLeft -= dt;
          if (toastLeft <= 0) show("toast", false);
        }
        if (car) map.draw(app.mapDots ? app.mapDots() : [{ x: car.x, z: car.z, kind: "player" }]);
      },
    };
    return hud;
  }

  BDR.createHud = createHud;
})();
