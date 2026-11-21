// Text for the shared ground-math screens (fuel stop and hangar), in one table so it can be translated later.
// The keys and the BDR.t lookup match Brain Drain Racing's game/strings.js, so quiz.js is the same file in both games.
(function () {
  "use strict";
  const table = {
    sayPlus: "What is {a} plus {b}?",
    sayMinus: "What is {a} minus {b}?",
    sayTimes: "What is {a} times {b}?",
    sayDivide: "What is {a} divided by {b}?",
    sayPlusTimes: "What is {a} plus {b} times {c}?",
    sayTimesPlus: "What is {a} times {b}, plus {c}?",
    sayTimesMinus: "What is {a} times {b}, minus {c}?",
    sayOf: "What is {part} of {n}?",
    sayPercent: "What is {p} percent of {n}?",
    sayEquationPlus: "x plus {a} equals {c}. What is x?",
    sayEquationTimes: "{a} times x equals {c}. What is x?",
    sayNegative: "negative {n}",
    "fraction.half": "one half",
    "fraction.quarter": "one quarter",
    "fraction.third": "one third",
    mathLevel: "Math level {level}: {name}",
    // Fuel stop (Racing's pit stop strings, with Flying's tasks)
    "fuelTask.fuel": "Fuel",
    "fuelTask.oil": "Oil",
    "fuelTask.tyres": "Tyres",
    "fuelTask.check": "Final check",
    fuelTaskOf: "{task} · {n} of {total}",
    fuelRight: "✓ Right! {task} done.",
    fuelWrong: "✗ Not quite. The answer is {answer}. +{s} s",
    fuelClock: "Stop time",
    fuelDue: "Fuel stop due",
    fuelDone: "✓ Fuelled",
    fuelSummary: "Fuel stop {time}: {right} of {total} right",
    missedFuel: "Missed fuel stop: +{s} s",
    fuelStripAhead: "Fuel strip · roll to the stop line",
    fuelCrew: "Ground crew has the plane",
    fuelLinedUp: "Fuelled · lined up for takeoff",
    fuelLabel: "Fuel",
  };
  BDR.strings = table;
  /** Look up a string and fill {name} placeholders. Unknown keys show the key so gaps are obvious. */
  BDR.t = function (key, params) {
    let text = Object.prototype.hasOwnProperty.call(table, key) ? table[key] : key;
    if (params) for (const name in params) text = text.split("{" + name + "}").join(String(params[name]));
    return text;
  };
})();
