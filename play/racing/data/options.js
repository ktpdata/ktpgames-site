// Fixed menus: modes, driving models and steering sensitivity. The native save store reads these ids too.
(function () {
  "use strict";
  BDR.data = BDR.data || {};
  BDR.data.modes = ["school", "trial", "daily", "race", "rally"];
  BDR.data.models = ["arcade", "sim"];
  BDR.data.sensitivities = [0, 1, 2]; // 0 is the gentlest, and the default

  // Weather: grip multiplier, fog multiplier, light multiplier, and how often the daily lap draws it.
  BDR.data.weather = {
    dry: { grip: 1, haze: 1, light: 1, weight: 6 },
    overcast: { grip: 1, haze: 1.8, light: 0.78, weight: 3 },
    wet: { grip: 0.72, haze: 2.4, light: 0.62, weight: 2 },
  };

  // Crashes end the run. minImpact: m/s of speed straight into a wall or barrier that counts as a crash
  // (gentler scrapes do not). treeRadius: metres around each tree trunk the car may not enter.
  BDR.data.crash = { minImpact: 4, treeRadius: 0.7 };

  // Daily lap rules. scoredAttempts: 0 = every clean lap of the day counts; 1 = only the first lap counts.
  // The day itself comes from BDR.dayKey (core.js), which holds the rollover rule.
  BDR.data.daily = { scoredAttempts: 0 };
})();
