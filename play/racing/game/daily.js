// Daily lap: the same track, layout and weather for everyone on a given day, chosen from the day key.
(function () {
  "use strict";

  /** The day's challenge for a date. Pure: depends only on BDR.dayKey(date) and the data tables. */
  function forDate(date) {
    const day = BDR.dayKey(date);
    const rng = BDR.rng(BDR.hash("daily:" + day));
    const tracks = BDR.data.tracks.filter((t) => !t.dev);
    const track = tracks[Math.floor(rng() * tracks.length)];
    const layouts = BDR.track.layoutsOf(track).filter((l) => l.closed !== false);
    const layout = layouts[Math.floor(rng() * layouts.length)];
    const names = Object.keys(BDR.data.weather);
    const total = names.reduce((sum, n) => sum + BDR.data.weather[n].weight, 0);
    let pick = rng() * total, weather = names[0];
    for (const n of names) {
      pick -= BDR.data.weather[n].weight;
      if (pick < 0) { weather = n; break; }
    }
    return { day, track: track.id, layout: layout.id, weather };
  }

  function today() {
    return forDate(BDR.today ? BDR.today() : null);
  }

  /** Whether a lap finished now still counts toward today's score. */
  function counts(stored, day, lapsToday) {
    const limit = BDR.data.daily.scoredAttempts;
    if (!limit) return true;
    if (stored && stored.day === day) return false; // today's scored lap is already in
    return lapsToday < limit;
  }

  BDR.daily = { forDate, today, counts };
})();
