// The current world: track, scenery, the player's car. Rebuilds only the parts whose choice changed.
(function () {
  "use strict";

  function createSession(app) {
    const { scene, THREE } = app;
    const session = { trackId: null, layoutId: null, carId: null, track: null, layout: null, trackData: null, car: null, carModel: null, roadGroup: null };

    function findLayout(trackData, layoutId) {
      const all = BDR.track.layoutsOf(trackData);
      return all.find((l) => l.id === layoutId) || all[0];
    }

    /** Load a track/layout/car. Returns which parts were rebuilt. */
    session.load = function (choice) {
      const rebuilt = [];
      const trackData = BDR.data.tracks.find((t) => t.id === choice.track) || BDR.data.tracks[0];
      const layout = findLayout(trackData, choice.layout);
      if (trackData.id !== session.trackId || layout.id !== session.layoutId) {
        if (session.roadGroup) dispose(session.roadGroup);
        if (session.scenery) dispose(session.scenery.group);
        session.trackData = trackData;
        session.layout = layout;
        session.track = BDR.track.build(layout);
        const region = BDR.data.regions[trackData.region] || {};
        session.roadGroup = BDR.roadMesh.build(THREE, session.track, region.road);
        scene.add(session.roadGroup);
        session.scenery = BDR.scenery.build(THREE, session.track, trackData);
        session.sky = session.scenery.group.getObjectByName("sky");
        session.track.groundAt = session.scenery.field.heightAt;
        session.track.seaLevel = session.scenery.field.sea;
        session.trees = BDR.scenery.treeIndex(session.scenery.placements.trees);
        const pitLane = BDR.pitLane.mesh(THREE, session.track, session.scenery.field.heightAt, BDR.race.RIVALS + 1);
        if (pitLane) session.scenery.group.add(pitLane);
        scene.add(session.scenery.group);
        BDR.scenery.applyLook(THREE, scene, app.lights, session.scenery.look);
        session.trackId = trackData.id;
        session.layoutId = layout.id;
        rebuilt.push("track");
        BDR.emit("track", session);
      }
      const spec = BDR.carById(choice.car);
      if (spec.id !== session.carId || rebuilt.length) {
        if (session.carModel && spec.id !== session.carId) dispose(session.carModel);
        if (!session.carModel || spec.id !== session.carId) {
          session.carModel = BDR.carModel.build(THREE, spec);
          scene.add(session.carModel);
          rebuilt.push("car");
        }
        session.car = BDR.physics.createCar(spec, session.track, session.track.startS, 0);
        session.carId = spec.id;
      }
      return rebuilt;
    };

    /** The translucent ghost car: no collision, hidden when there is no ghost to show. */
    session.poseGhost = function (pose) {
      if (!session.ghostModel) {
        session.ghostModel = BDR.carModel.build(THREE, BDR.carById("hatch"), { ghost: true, colors: { body: 0xbfe3ff } });
        scene.add(session.ghostModel);
      }
      session.ghostModel.visible = !!pose;
      if (!pose) return;
      const p = session.track.sampleAt(session.track.locate(pose.x, pose.z, session.ghostHint).s);
      session.ghostHint = p.index;
      BDR.carModel.pose(session.ghostModel, { x: pose.x, y: pose.y, z: pose.z, heading: pose.heading, bank: p.bank, steer: 0 });
    };

    /** Orange marker cones on both road edges at each lesson marker. */
    session.setMarkers = function (markers) {
      if (session.markerGroup) dispose(session.markerGroup);
      session.markerGroup = null;
      if (!markers.length) return;
      const group = new THREE.Group();
      const cone = new THREE.ConeGeometry(0.35, 0.9, 10), mat = new THREE.MeshLambertMaterial({ color: 0xff7a1a });
      for (const m of markers) {
        const p = session.track.sampleAt(m.s);
        for (const side of [-1, 1]) {
          const at = session.track.worldAt(m.s, side * (p.w / 2 + 0.8));
          const mesh = new THREE.Mesh(cone, mat);
          mesh.position.set(at.x, at.y + 0.45, at.z);
          group.add(mesh);
        }
      }
      session.markerGroup = group;
      scene.add(group);
    };

    /** Weather changes fog and light over the region look; it never rebuilds the scene. */
    session.applyWeather = function (name) {
      if (!session.scenery) return;
      const weather = BDR.data.weather[name] || BDR.data.weather.dry;
      BDR.scenery.applyLook(THREE, scene, app.lights, session.scenery.look, weather);
      // The sky dome ignores fog, so dim and grey it to match.
      if (session.sky) session.sky.material.color.set(0xffffff).lerp(new THREE.Color("#a7adb3"), Math.min(0.75, (weather.haze - 1) / 1.6));
    };

    function dispose(object) {
      scene.remove(object);
      object.traverse((o) => {
        if (o.geometry && !o.geometry.userData.shared) o.geometry.dispose();
        if (o.isInstancedMesh) o.dispose();
      });
    }
    session.dispose = dispose;
    return session;
  }

  BDR.createSession = createSession;
})();
