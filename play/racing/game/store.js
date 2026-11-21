// Saving goes through the native store: get(key) and set(key, value), validated in Swift.
// In a desktop browser (no native shell) values live in memory for the session only.
(function () {
  "use strict";
  const memory = new Map();
  const native = () => window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.store;

  /** Every call resolves; a refusal or failure resolves to null so callers never need to catch. */
  async function call(op, key, value) {
    const handler = native();
    if (!handler) {
      if (op === "get") return memory.has(key) ? JSON.parse(memory.get(key)) : null;
      memory.set(key, JSON.stringify(value));
      return value;
    }
    try {
      const reply = await handler.postMessage(op === "get" ? { op, key } : { op, key, value });
      return reply === undefined ? null : reply;
    } catch (error) {
      return null;
    }
  }

  BDR.store = {
    get: (key) => call("get", key),
    set: (key, value) => call("set", key, value),
  };
})();
