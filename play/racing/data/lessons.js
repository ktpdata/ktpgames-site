// Driving school: ten lessons, one per track, each teaching one skill and ending with a pass mark.
// Corners are counted from the start line (0 = first corner tighter than 120 m radius).
// goal.kind: "section" (stay on the road), "entrySpeed", "entryLine", "apexLine", "exitLine",
//            "slide" (simulator: slide and recover), "lap" (clean lap), "timedLap" (clean lap under medal time).
(function () {
  "use strict";
  BDR.data = BDR.data || {};
  BDR.data.lessons = [
    { id: "steering", track: "island", skill: "steering", from: 0.02, to: 0.38, startSpeed: 16,
      goal: { kind: "section", offSeconds: 0 } },
    { id: "braking", track: "lake", skill: "braking", corner: "tightest", before: 260, after: 120, startSpeed: 30,
      goal: { kind: "entrySpeed", factor: 1.2 } },
    { id: "entry", track: "sedona", skill: "entry", corner: 1, before: 220, after: 100, startSpeed: 24,
      goal: { kind: "entryLine", share: 0.12 } },
    { id: "apex", track: "fjord", skill: "apex", corner: 0, before: 200, after: 100, startSpeed: 22,
      goal: { kind: "apexLine", share: 0.12 } },
    { id: "exit", track: "atoll", skill: "exit", corner: 1, before: 220, after: 140, startSpeed: 26,
      goal: { kind: "exitLine", share: 0.12 } },
    { id: "linked", track: "tuscany", skill: "linked", corner: 0, corners: 2, before: 160, after: 120, startSpeed: 26,
      goal: { kind: "section", offSeconds: 0.5 } },
    { id: "wet", track: "headland", skill: "wet", from: 0.1, to: 0.45, startSpeed: 22, weather: "wet",
      goal: { kind: "section", offSeconds: 0.5 } },
    { id: "slide", track: "caldera", skill: "slide", corner: 4, before: 140, after: 200, startSpeed: 28, model: "sim",
      goal: { kind: "slide", slip: 0.14, offSeconds: 2.5 } },
    { id: "cleanLap", track: "canyon", skill: "cleanLap", goal: { kind: "lap" } },
    { id: "timedLap", track: "balloon", skill: "timedLap", goal: { kind: "timedLap", medal: "bronze" } },
  ];
})();
