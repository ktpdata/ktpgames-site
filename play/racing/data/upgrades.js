// Garage: credits and car upgrades. Each car has four parts with three steps each; every step costs more than the
// one before and needs a minimum math level, so upgrades follow learning. Effects are fractions added per step.
(function () {
  "use strict";
  BDR.data = BDR.data || {};
  BDR.data.upgrades = {
    parts: [
      { id: "engine", effects: { accel: 0.06, topSpeed: 0.02 } },   // power
      { id: "tyres", effects: { grip: 0.04, surfaces: 0.03 } },     // grip, on and off the road
      { id: "brakes", effects: { brake: 0.08 } },                   // braking
      { id: "aero", effects: { aero: 0.06 } },                      // extra grip at high speed
    ],
    steps: 3,
    costs: [20, 45, 80],     // credits for step 1, 2 and 3
    mathLevel: [1, 3, 6],    // minimum math level for step 1, 2 and 3
    modes: ["race", "rally"], // upgrades apply only here; time trial and the daily lap stay stock so times compare
  };
  // Credits: by finishing place in a race (1st first), and per right answer in a garage drill.
  BDR.data.credits = { race: [12, 9, 7, 5, 4, 3], drillQuestions: 10, perRightAnswer: 1, max: 99999 };
})();
