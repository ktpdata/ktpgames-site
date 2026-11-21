// Math questions with three answer choices, generated from a level description (data/math-levels.js) and a
// seeded random source, plus the adaptive level that decides which level a player sees.
// Choices are shown in ascending order; the right answer is equally likely to be the lowest, middle or highest,
// so its button position cannot be predicted.
(function () {
  "use strict";
  const int = (rng, lo, hi) => lo + Math.floor(rng() * (hi - lo + 1));
  const MINUS = "−";

  /** A number as shown on screen: a true minus sign for negatives. */
  const show = (n) => (n < 0 ? MINUS + Math.abs(n) : String(n));
  /** A number as read aloud. */
  const say = (n) => (n < 0 ? BDR.t("sayNegative", { n: Math.abs(n) }) : String(n));

  const FRACTIONS = [
    { d: 2, glyph: "½", word: "fraction.half" },
    { d: 4, glyph: "¼", word: "fraction.quarter" },
    { d: 3, glyph: "⅓", word: "fraction.third" },
  ];
  const PERCENTS = [10, 25, 50];

  /** Question makers by kind: each returns { prompt, speech, answer }. */
  const KINDS = {
    add(rng, l) {
      const a = int(rng, 0, l.max), b = int(rng, 0, l.max - a);
      return { prompt: a + " + " + b + " = ?", speech: BDR.t("sayPlus", { a, b }), answer: a + b };
    },
    sub(rng, l) {
      const a = int(rng, 1, l.max), b = int(rng, 0, a);
      return { prompt: a + " " + MINUS + " " + b + " = ?", speech: BDR.t("sayMinus", { a, b }), answer: a - b };
    },
    addSub(rng, l) {
      return rng() < 0.5 ? KINDS.add(rng, l) : KINDS.sub(rng, l);
    },
    times(rng, l) {
      const a = int(rng, 1, l.max), b = int(rng, 1, l.max);
      return { prompt: a + " × " + b + " = ?", speech: BDR.t("sayTimes", { a, b }), answer: a * b };
    },
    divide(rng, l) {
      const b = int(rng, 1, l.max), q = int(rng, 1, l.max), a = b * q;
      return { prompt: a + " ÷ " + b + " = ?", speech: BDR.t("sayDivide", { a, b }), answer: q };
    },
    twoByOne(rng) {
      const a = int(rng, 10, 99), b = int(rng, 2, 9);
      return { prompt: a + " × " + b + " = ?", speech: BDR.t("sayTimes", { a, b }), answer: a * b };
    },
    order(rng, l) {
      const a = int(rng, 1, l.max), b = int(rng, 2, l.max), c = int(rng, 2, l.max);
      const form = int(rng, 0, 2);
      if (form === 0) return { prompt: a + " + " + b + " × " + c + " = ?", speech: BDR.t("sayPlusTimes", { a, b, c }), answer: a + b * c };
      if (form === 1) return { prompt: b + " × " + c + " + " + a + " = ?", speech: BDR.t("sayTimesPlus", { a: b, b: c, c: a }), answer: b * c + a };
      const small = Math.min(a, b * c);
      return { prompt: b + " × " + c + " " + MINUS + " " + small + " = ?", speech: BDR.t("sayTimesMinus", { a: b, b: c, c: small }), answer: b * c - small };
    },
    fraction(rng, l) {
      const f = FRACTIONS[int(rng, 0, FRACTIONS.length - 1)], k = int(rng, 1, l.max), n = f.d * k;
      return { prompt: f.glyph + " of " + n + " = ?", speech: BDR.t("sayOf", { part: BDR.t(f.word), n }), answer: k };
    },
    percent(rng, l) {
      const p = PERCENTS[int(rng, 0, PERCENTS.length - 1)], step = 100 / gcd(p, 100), n = step * int(rng, 1, Math.floor(l.max / step));
      return { prompt: p + "% of " + n + " = ?", speech: BDR.t("sayPercent", { p, n }), answer: (p * n) / 100 };
    },
    negative(rng, l) {
      const form = int(rng, 0, 3), a = int(rng, 1, l.max), b = int(rng, 1, l.max);
      if (form === 0) { // a negative start plus a positive number
        return { prompt: show(-a) + " + " + b + " = ?", speech: BDR.t("sayPlus", { a: say(-a), b }), answer: b - a };
      }
      if (form === 1) { // subtract past zero
        return { prompt: a + " " + MINUS + " " + (a + b) + " = ?", speech: BDR.t("sayMinus", { a, b: a + b }), answer: -b };
      }
      if (form === 2) { // x + a = c, with c possibly negative
        const x = int(rng, -l.max, l.max), c = x + a;
        return { prompt: "x + " + a + " = " + show(c) + "   x = ?", speech: BDR.t("sayEquationPlus", { a, c: say(c) }), answer: x };
      }
      const x = int(rng, -l.max, l.max), m = int(rng, 2, 9); // m × x = c
      return { prompt: m + "x = " + show(m * x) + "   x = ?", speech: BDR.t("sayEquationTimes", { a: m, c: say(m * x) }), answer: x };
    },
  };

  function gcd(a, b) {
    return b ? gcd(b, a % b) : a;
  }

  function levelData(level) {
    const all = BDR.data.mathLevels;
    return all.find((l) => l.level === level) || all[0];
  }

  /** Three distinct choices around the answer in ascending order; null when a choice would be below zero. */
  function choices(answer, rank, spread, rng, negative) {
    const d1 = int(rng, 1, spread), d2 = int(rng, 1, spread);
    const list = rank === 0 ? [answer, answer + d1, answer + d1 + d2]
      : rank === 1 ? [answer - d1, answer, answer + d2]
        : [answer - d1 - d2, answer - d1, answer];
    if (!negative && list[0] < 0) return null;
    return list;
  }

  /**
   * A question for a level: { level, prompt, speech, answer, choices: [3 ascending numbers], labels: [3 strings] }.
   * The right answer's rank is drawn first, so lowest, middle and highest are equally likely.
   */
  function question(level, rng) {
    const l = levelData(level);
    const rank = int(rng, 0, 2);
    for (;;) {
      const q = KINDS[l.kind](rng, l);
      const list = choices(q.answer, rank, l.spread, rng, !!l.negative);
      if (list) return Object.assign(q, { level: l.level, choices: list, labels: list.map(show), spoken: list.map(say) });
    }
  }

  // ---------------------------------------------------------------- adaptive level

  /** A saved progress record made safe: { level 1..10, recent: up to 10 booleans, newest last }. */
  function normalize(saved) {
    const top = BDR.data.mathLevels.length;
    const level = saved && Number.isInteger(saved.level) ? Math.min(Math.max(saved.level, 1), top) : 1;
    const recent = saved && Array.isArray(saved.recent) ? saved.recent.filter((x) => typeof x === "boolean").slice(-10) : [];
    return { level, recent };
  }

  /** Record one answer. Returns the new progress; `moved` is +1, -1 or 0. Never skips a level. */
  function record(progress, right) {
    const rules = BDR.data.mathProgress, top = BDR.data.mathLevels.length;
    const recent = progress.recent.concat([right]).slice(-rules.up.of);
    const lastUp = recent.slice(-rules.up.of), lastDown = recent.slice(-rules.down.of);
    if (lastUp.length >= rules.up.of && lastUp.filter(Boolean).length >= rules.up.right && progress.level < top) {
      return { level: progress.level + 1, recent: [], moved: 1 };
    }
    if (lastDown.filter((x) => !x).length >= rules.down.wrong && progress.level > 1) {
      return { level: progress.level - 1, recent: [], moved: -1 };
    }
    return { level: progress.level, recent, moved: 0 };
  }

  BDR.quiz = { question, levelData, KINDS, show, normalize, record };
})();
