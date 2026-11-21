// Math levels for the pit crew and garage drills, easiest first. Questions are generated in code (game/quiz.js)
// from these descriptions, never hand-written. spread: the furthest a wrong answer sits from the right one.
// negative: whether answers (right or wrong) may be below zero.
(function () {
  "use strict";
  BDR.data = BDR.data || {};
  BDR.data.mathLevels = [
    { level: 1, name: "Addition within 10", kind: "add", max: 10, spread: 3 },
    { level: 2, name: "Subtraction within 20", kind: "sub", max: 20, spread: 3 },
    { level: 3, name: "Addition and subtraction within 100", kind: "addSub", max: 100, spread: 10 },
    { level: 4, name: "Times tables to 10 × 10", kind: "times", max: 10, spread: 6 },
    { level: 5, name: "Division facts to 100 ÷ 10", kind: "divide", max: 10, spread: 3 },
    { level: 6, name: "Two-digit × one-digit", kind: "twoByOne", spread: 20 },
    { level: 7, name: "Mixed operations, order of operations", kind: "order", max: 10, spread: 6 },
    { level: 8, name: "Simple fractions of a number", kind: "fraction", max: 12, spread: 3 },
    { level: 9, name: "Percentages of a number", kind: "percent", max: 200, spread: 10 },
    { level: 10, name: "Negative numbers and one-step equations", kind: "negative", max: 12, spread: 4, negative: true },
  ];
  // Adaptive progress, per player: move up after `up.right` right of the last `up.of` answers at a level,
  // down after `down.wrong` wrong of the last `down.of`. One level at a time.
  BDR.data.mathProgress = { up: { right: 8, of: 10 }, down: { wrong: 3, of: 5 } };
})();
