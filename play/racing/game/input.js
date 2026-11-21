// Driver input: tilt from the shell, or on-screen buttons and keys when tilt is unavailable.
(function () {
  "use strict";
  const { clamp, approach } = BDR.math;

  /** Seconds without a tilt sample, while driving, before the steering buttons appear. */
  const TILT_TIMEOUT = 1.5;
  /** How fast button steering moves toward full lock, per second. */
  const BUTTON_RATE = 3.2;
  /** Brake pressure the moment the pedal is touched, and seconds to build to full. */
  const BRAKE_START = 0.25;
  const BRAKE_BUILD = 0.9;

  function createInput() {
    const state = {
      steer: 0,
      brake: 0,
      throttle: 0,
      autoGas: false,
      tiltAvailable: false,
      tiltValue: 0,
      sinceTilt: 0,
      fallback: true,
      handbrake: 0,
      held: { left: false, right: false, brake: false, throttle: false, handbrake: false },
    };

    function setFallback(value) {
      if (state.fallback === value) return;
      state.fallback = value;
      BDR.emit("fallback", value);
    }

    BDR.on("motion", (available) => {
      state.tiltAvailable = available;
      state.sinceTilt = 0;
      setFallback(!available);
    });
    BDR.on("tilt", (value) => {
      state.tiltValue = value;
      state.sinceTilt = 0;
      if (state.tiltAvailable) setFallback(false);
    });

    return {
      state,
      hold(control, down) {
        if (control in state.held) state.held[control] = !!down;
      },
      releaseAll() {
        for (const key in state.held) state.held[key] = false;
      },
      /** Auto gas: the car accelerates by itself. Otherwise it accelerates only while the gas pedal is held. */
      setAutoGas(on) {
        state.autoGas = !!on;
      },
      /** Advance by one simulation step while driving. */
      update(dt, driving) {
        if (driving && !state.fallback) {
          state.sinceTilt += dt;
          if (state.sinceTilt > TILT_TIMEOUT) setFallback(true);
        }
        const h = state.held;
        if (state.fallback) {
          const target = (h.right ? 1 : 0) - (h.left ? 1 : 0);
          const rate = target === 0 || Math.sign(target) !== Math.sign(state.steer) ? BUTTON_RATE * 1.6 : BUTTON_RATE;
          state.steer = approach(state.steer, target, rate * dt);
        } else {
          state.steer = clamp(state.tiltValue, -1, 1);
        }
        // Brake pressure builds while the pedal is held: a tap scrubs speed, a hold stops the car.
        state.brake = h.brake ? Math.min(1, Math.max(BRAKE_START, state.brake + dt / BRAKE_BUILD)) : 0;
        state.throttle = state.autoGas ? 1 : h.throttle ? 1 : 0;
        state.handbrake = h.handbrake ? 1 : 0;
      },
      reset() {
        state.steer = 0;
        state.tiltValue = 0;
        state.sinceTilt = 0;
        this.releaseAll();
      },
    };
  }

  BDR.createInput = createInput;

  /** Wire buttons carrying data-hold="left|right|brake|throttle" and desktop keys to an input. */
  BDR.bindControls = function (input, root) {
    root.querySelectorAll("[data-hold]").forEach((el) => {
      const control = el.dataset.hold;
      const set = (down) => (e) => {
        e.preventDefault();
        input.hold(control, down);
        el.classList.toggle("held", down);
      };
      el.addEventListener("pointerdown", set(true));
      el.addEventListener("pointerup", set(false));
      el.addEventListener("pointercancel", set(false));
      el.addEventListener("pointerleave", set(false));
    });
    const keys = { ArrowLeft: "left", KeyA: "left", ArrowRight: "right", KeyD: "right",
      ArrowDown: "brake", KeyS: "brake", Space: "brake", ArrowUp: "throttle", KeyW: "throttle", KeyE: "handbrake", ShiftLeft: "handbrake" };
    const key = (down) => (e) => {
      const control = keys[e.code];
      if (!control) return;
      e.preventDefault();
      input.hold(control, down);
    };
    window.addEventListener("keydown", key(true));
    window.addEventListener("keyup", key(false));
  };
})();
