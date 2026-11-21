// Fuel stops: Flying's pit stop. Copied from Brain Drain Racing's data/pit.js: the same crew timings and
// missed-stop penalty, with Flying's four tasks and the ground autopilot in place of the pit lane.
// All timings in seconds, speeds in m/s, distances in metres.
(function () {
  "use strict";
  BDR.data = BDR.data || {};
  BDR.data.fuel = {
    // One question per task, in this order. Each task's label lives in strings.js.
    tasks: ["fuel", "oil", "tyres", "check"],
    work: 1.2,           // seconds the crew needs after a right answer
    wrongPenalty: 4,     // extra seconds added by a wrong answer
    missedPenalty: 30,   // seconds added at the finish of a delivery without a fuel stop
    // Rolling out on the fuel strip: the crew takes the plane once it has reached the stop line at taxi speed.
    handover: 9,         // the highest speed at which the crew takes the plane
    // The ground autopilot that taxis from the stop line to the pump.
    taxi: { speed: 5, accel: 2, turnRate: 0.7, arrive: 0.6 },
    pumpOffset: 16,      // metres beyond the strip edge where the pump stands
    // Missions that never use the fuel strip, so times and scores compare.
    never: ["trial", "daily"],
  };
})();
