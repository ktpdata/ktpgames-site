// Chase camera: behind and above the car, looking ahead into the corner.
(function () {
  "use strict";
  const { lerp, clamp } = BDR.math;
  const BASE_FOV = 60;
  const MAX_FOV = 68;

  function createChase(camera, reduceMotion) {
    const state = { x: 0, y: 0, z: 0, lx: 0, ly: 0, lz: 0, fov: BASE_FOV, ready: false };

    function target(car, track) {
      const back = 6.2, up = 2.4;
      const fx = Math.sin(car.heading), fz = -Math.cos(car.heading);
      // Look toward a point on the road ahead so the corner comes into view early.
      const lookAhead = 12 + Math.max(0, car.speed) * 0.35;
      const p = track.sampleAt(car.s + lookAhead);
      const roadWeight = car.speed > 2 ? 0.45 : 0;
      return {
        x: car.x - fx * back, y: car.y + up, z: car.z - fz * back,
        lx: lerp(car.x + fx * 8, p.x + p.rx * car.offset * 0.5, roadWeight),
        ly: car.y + 1.0,
        lz: lerp(car.z + fz * 8, p.z + p.rz * car.offset * 0.5, roadWeight),
      };
    }

    return {
      state,
      snap(car, track) {
        Object.assign(state, target(car, track), { ready: true });
        this.apply(car);
      },
      update(car, track, dt) {
        if (!state.ready) return this.snap(car, track);
        const t = target(car, track);
        const k = 1 - Math.exp(-dt * 8), kl = 1 - Math.exp(-dt * 6);
        state.x = lerp(state.x, t.x, k); state.y = lerp(state.y, t.y, k); state.z = lerp(state.z, t.z, k);
        state.lx = lerp(state.lx, t.lx, kl); state.ly = lerp(state.ly, t.ly, kl); state.lz = lerp(state.lz, t.lz, kl);
        // Field of view widens slightly with speed, except under Reduce Motion.
        const wanted = reduceMotion ? BASE_FOV : BASE_FOV + (MAX_FOV - BASE_FOV) * clamp(car.speed / car.spec.topSpeed, 0, 1);
        state.fov = lerp(state.fov, wanted, 1 - Math.exp(-dt * 2));
        this.apply(car);
      },
      apply() {
        camera.position.set(state.x, state.y, state.z);
        camera.lookAt(state.lx, state.ly, state.lz);
        if (Math.abs(camera.fov - state.fov) > 0.01) {
          camera.fov = state.fov;
          camera.updateProjectionMatrix();
        }
      },
    };
  }

  BDR.createChase = createChase;
  BDR.camera = { BASE_FOV, MAX_FOV };
})();
