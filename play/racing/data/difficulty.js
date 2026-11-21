// Difficulty changes track-limit strictness, grip margin and medal times. Nothing else.
// limitMargin: metres past the road edge (beyond the kerb) a wheel may go before it counts as off.
// gripMargin: multiplier on available cornering grip. medalScale: multiplier on medal target times.
(function () {
  "use strict";
  BDR.data = BDR.data || {};
  BDR.data.difficulty = {
    easy: { limitMargin: 2.5, gripMargin: 1.1, medalScale: 1.1 },
    normal: { limitMargin: 1.2, gripMargin: 1.0, medalScale: 1.0 },
    hard: { limitMargin: 0.5, gripMargin: 0.97, medalScale: 0.97 },
    expert: { limitMargin: 0, gripMargin: 0.94, medalScale: 0.94 },
  };
  BDR.difficultyIds = ["easy", "normal", "hard", "expert"];
})();
