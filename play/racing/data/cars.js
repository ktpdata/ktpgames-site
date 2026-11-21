// Every car. All handling is data; physics.js reads these numbers and nothing else differs between cars.
// Units: metres, kilograms, seconds. grip is the lateral limit in g on tarmac.
(function () {
  "use strict";
  BDR.data = BDR.data || {};
  BDR.data.cars = [
    {
      id: "hatch",
      name: "Cape Aidan GT",
      model: "cape-aidan-gt",   // models/<model>.model.js; the trainer: forgiving handling
      mass: 1150,
      accel: 4.6,          // m/s² from rest at full throttle
      topSpeed: 52,        // m/s (about 116 mph)
      brake: 10.5,         // m/s² on tarmac
      grip: 1.05,          // g
      steerLock: 0.56,     // radians of front-wheel angle at standstill
      steerFade: 30,       // m/s at which available lock has halved
      steerRate: 3.2,      // how quickly the wheels follow the input, per second
      wheelbase: 2.5,
      surfaces: { grass: 0.62, gravel: 0.55 }, // grip multiplier off tarmac
      drag: { grass: 2.2, gravel: 3.4 },       // extra slowing off tarmac, m/s²
      slide: 0.9,          // simulator: how readily the rear lets go (higher slides more)
      size: { length: 4.7, width: 1.84, height: 1.3 },
      colors: { body: 0xd8462a, trim: 0x1b1f27, glass: 0x9fc4e6 },
    },
    {
      id: "rally",
      name: "Rally car",
      model: "rally-car",
      mass: 1230,
      accel: 5.0,
      topSpeed: 47,
      brake: 10.5,
      grip: 1.08,
      steerLock: 0.6,
      steerFade: 30,
      steerRate: 3.6,
      wheelbase: 2.5,
      surfaces: { grass: 0.86, gravel: 0.9 },
      drag: { grass: 0.9, gravel: 1.1 },
      slide: 1.1,
      size: { length: 4.1, width: 1.8, height: 1.45 },
      colors: { body: 0xf2f2ee, trim: 0x1d4ea0, glass: 0x22303c },
    },
    {
      id: "muscle",
      name: "Muscle car",
      model: "muscle-car",
      mass: 1600,
      accel: 6.2,
      topSpeed: 60,
      brake: 9.6,
      grip: 0.98,
      steerLock: 0.5,
      steerFade: 27,
      steerRate: 2.8,
      wheelbase: 2.8,
      surfaces: { grass: 0.55, gravel: 0.5 },
      drag: { grass: 2.6, gravel: 3.6 },
      slide: 1.6,
      size: { length: 4.7, width: 1.9, height: 1.3 },
      colors: { body: 0xb3261e, trim: 0x111111, glass: 0x2a2f36, stripe: 0xf3f3f3 },
    },
    {
      id: "open",
      name: "Open-wheel racer",
      model: "open-wheel-racer",
      mass: 640,
      accel: 8.0,
      topSpeed: 70,
      brake: 14,
      grip: 1.5,
      steerLock: 0.45,
      steerFade: 36,
      steerRate: 5.0,
      wheelbase: 3.0,
      surfaces: { grass: 0.45, gravel: 0.4 },
      drag: { grass: 3.6, gravel: 5.0 },
      slide: 1.3,
      size: { length: 4.6, width: 1.9, height: 1.0 },
      colors: { body: 0x1f8a5b, trim: 0x181818, glass: 0x181818 },
    },
  ];
  BDR.carById = (id) => BDR.data.cars.find((c) => c.id === id) || BDR.data.cars[0];
})();
