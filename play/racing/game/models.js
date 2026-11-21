// Car models: .glb files packed as base64 by Tools/pack-models.cjs (models/<id>.model.js sets BDR.models[id]).
// The page runs from file://, so instead of GLTFLoader.load() (which fetches) each one is decoded to an
// ArrayBuffer and handed to GLTFLoader.parse() once at start-up. car.js clones the parsed templates.
(function () {
  "use strict";
  BDR.models = BDR.models || {};

  const templates = {};
  let ready = null;

  function toArrayBuffer(base64) {
    const text = atob(base64);
    const bytes = new Uint8Array(text.length);
    for (let i = 0; i < text.length; i++) bytes[i] = text.charCodeAt(i);
    return bytes.buffer;
  }

  /** Lit materials by role: glossy paint, dark glass, rubber tyres. Everything else keeps its glTF values. */
  function dress(THREE, scene) {
    const swapped = new Map();
    scene.traverse((o) => {
      if (!o.isMesh) return;
      o.geometry.userData.shared = true; // every car clone uses it; never dispose
      const m = o.material;
      if (!swapped.has(m)) {
        let next = m;
        if (m.name === "paint") {
          next = new THREE.MeshPhysicalMaterial({ name: "paint", side: m.side, color: m.color, roughness: 0.32, metalness: 0.05, clearcoat: 1, clearcoatRoughness: 0.08 });
        } else if (m.name === "glass") {
          next = new THREE.MeshStandardMaterial({ name: "glass", side: m.side, color: m.color.clone().multiplyScalar(0.55), roughness: 0.05, metalness: 0.4 });
        } else if (m.name === "tyre") {
          next = new THREE.MeshStandardMaterial({ name: "tyre", side: m.side, color: m.color, roughness: 0.92, metalness: 0 });
        }
        swapped.set(m, next);
      }
      o.material = swapped.get(m);
    });
  }

  /** Parse one packed model. Resolves to its scene. */
  function parse(THREE, id) {
    return new Promise((resolve, reject) => {
      new THREE.GLTFLoader().parse(toArrayBuffer(BDR.models[id]), "", (gltf) => {
        dress(THREE, gltf.scene);
        resolve(gltf.scene);
      }, (error) => reject(new Error("Car model " + id + " failed to load: " + (error && error.message))));
    });
  }

  /** Parse every packed model once. Later calls return the same promise. */
  function load(THREE) {
    if (!ready) {
      ready = Promise.all(Object.keys(BDR.models).sort().map((id) => parse(THREE, id).then((scene) => (templates[id] = scene))))
        .then(() => templates);
    }
    return ready;
  }

  BDR.carModels = { load, template: (id) => templates[id] || null, ids: () => Object.keys(BDR.models).sort() };
})();
