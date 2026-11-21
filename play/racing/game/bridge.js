// Talks to the Swift shell. Outside the app (desktop browser, tests) every call is a harmless no-op.
(function () {
  "use strict";
  const handlers = () => (window.webkit && window.webkit.messageHandlers) || {};

  BDR.bridge = {
    get native() {
      return !!handlers().race;
    },
    /** Fire-and-forget message to the shell. */
    post(type, extra) {
      const h = handlers().race;
      if (!h) return;
      try {
        h.postMessage(Object.assign({ type }, extra || {}));
      } catch (e) {
        /* the shell went away; nothing to do */
      }
    },
    /** Called by Swift with each steering sample, -1..1. */
    steer(value) {
      if (typeof value === "number" && isFinite(value)) BDR.emit("tilt", Math.max(-1, Math.min(1, value)));
    },
    /** Called by Swift with a JSON message. */
    receive(message) {
      if (!message || typeof message.type !== "string") return;
      if (message.type === "motion") BDR.emit("motion", !!message.available);
      else if (message.type === "active") BDR.emit("active", !!message.value);
      else BDR.emit("native:" + message.type, message);
    },
  };
})();
