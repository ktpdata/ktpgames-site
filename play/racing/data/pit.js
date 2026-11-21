// Pit row: the lane, the stop and its math. All timings in seconds, speeds in m/s, distances in metres.
// Each closed layout in tracks.js says where its lane starts, where the boxes are and where it ends.
(function () {
  "use strict";
  BDR.data = BDR.data || {};
  BDR.data.pit = {
    lane: {
      out: 5.4,          // lane centre beyond the road edge
      halfWidth: 3.6,    // half the lane's width
      driveLine: -1.6,   // where cars drive, from the lane centre (negative = towards the track)
      boxLine: 1.9,      // where cars stop in their boxes, from the lane centre
      turnIn: 14,        // metres over which a car moves between the drive line and its box
      taper: 50,         // metres over which the lane leaves and rejoins the road
      speed: 16,         // pit speed limit (about 36 mph)
      accel: 4.5,        // pit autopilot acceleration
      decel: 5.5,        // pit autopilot braking
      boxSpacing: 9,     // metres between pit boxes; one box per car, box 0 is the player's
      entryWindow: 60,   // metres before the entry point in which turning towards the lane takes the car in
    },
    // One question per task, in this order. Each task's label and icon live in strings.js / the CSS.
    tasks: ["tyres", "fuel", "wing", "check"],
    work: 1.2,           // seconds the crew needs after a right answer
    wrongPenalty: 4,     // extra seconds added by a wrong answer
    launch: 1.5,         // seconds of automatic full throttle after leaving the pit exit
    missedPenalty: 30,   // seconds added at the finish of a race without a pit stop
    // Computer drivers: which lap they stop on (0-based lap index, seeded pick) and how long the stop takes.
    // Stop time = base + (1 - skill) * perSkill + a seeded extra of up to jitter.
    rivals: { laps: [0, 1], base: 9, perSkill: 12, jitter: 3 },
  };
})();
