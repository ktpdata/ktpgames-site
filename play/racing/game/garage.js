// Garage rules: credits, upgrade costs and requirements, and how upgrades change a car. No DOM here
// (the screen is game/garageview.js). Saved through the native store as "credits" and "upgrades".
(function () {
  "use strict";
  const U = () => BDR.data.upgrades;

  /** A saved upgrades record made safe: { carId: { part: 0..steps } } for known cars and parts only. */
  function normalize(saved) {
    const out = {};
    for (const car of BDR.data.cars) {
      const parts = (saved && saved[car.id]) || {};
      out[car.id] = {};
      for (const p of U().parts) {
        const n = parts[p.id];
        out[car.id][p.id] = Number.isInteger(n) ? Math.min(Math.max(n, 0), U().steps) : 0;
      }
    }
    return out;
  }

  /**
   * What buying the next step of a part needs. Returns { step, cost, level, ok, reason }:
   * reason is "max", "credits" or "mathLevel" when the step cannot be bought.
   */
  function nextStep(owned, partId, credits, mathLevel) {
    const step = (owned[partId] || 0) + 1;
    if (step > U().steps) return { step, ok: false, reason: "max" };
    const cost = U().costs[step - 1], level = U().mathLevel[step - 1];
    if (mathLevel < level) return { step, cost, level, ok: false, reason: "mathLevel" };
    if (credits < cost) return { step, cost, level, ok: false, reason: "credits" };
    return { step, cost, level, ok: true, reason: null };
  }

  /** Buy the next step: returns { credits, owned } after the purchase, or null when refused. */
  function buy(owned, partId, credits, mathLevel) {
    const next = nextStep(owned, partId, credits, mathLevel);
    if (!next.ok) return null;
    return { credits: credits - next.cost, owned: Object.assign({}, owned, { [partId]: next.step }) };
  }

  /** A car spec with upgrades applied (a copy; the data is never changed). No upgrades: the spec itself. */
  function apply(spec, owned) {
    if (!owned) return spec;
    const out = Object.assign({}, spec, { surfaces: Object.assign({}, spec.surfaces) });
    for (const p of U().parts) {
      const n = owned[p.id] || 0;
      if (!n) continue;
      for (const [key, per] of Object.entries(p.effects)) {
        if (key === "surfaces") for (const k in out.surfaces) out.surfaces[k] = Math.min(1, out.surfaces[k] * (1 + per * n));
        else if (key === "aero") out.aero = (out.aero || 0) + per * n;
        else out[key] = out[key] * (1 + per * n);
      }
    }
    return out;
  }

  /** Whether a mode uses upgrades. */
  const appliesIn = (mode) => U().modes.includes(mode);

  /** Credits for a race finish. */
  const raceCredits = (place) => BDR.data.credits.race[place - 1] || 0;

  BDR.garage = { normalize, nextStep, buy, apply, appliesIn, raceCredits };
})();
