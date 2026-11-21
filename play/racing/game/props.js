// Roadside object shapes: trees by vegetation type, marker posts, fences, grandstands and distance boards.
// Everything is instanced: one draw call per shape, however many are placed.
(function () {
  "use strict";
  const TAU = Math.PI * 2;

  /** Draw `items` with one InstancedMesh; place(item, dummy) positions the dummy and returns a colour. */
  function instances(THREE, group, geometry, items, place, options) {
    if (!items.length) return null;
    const material = new THREE.MeshLambertMaterial(Object.assign({ flatShading: true }, options || {}));
    const mesh = new THREE.InstancedMesh(geometry, material, items.length);
    const dummy = new THREE.Object3D();
    const color = new THREE.Color();
    items.forEach((item, i) => {
      dummy.position.set(0, 0, 0);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(1, 1, 1);
      const c = place(item, dummy);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      mesh.setColorAt(i, color.set(c || "#ffffff"));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
    group.add(mesh);
    return mesh;
  }

  /** Tree shapes per vegetation type, after Brain Drain Flying. Each tree: { x, y, z, h, a, shade }. */
  const TREES = {
    palms(THREE, group, trees) {
      instances(THREE, group, new THREE.CylinderGeometry(0.45, 0.68, 1, 6), trees, (p, d) => {
        d.position.set(p.x, p.y + p.h / 2, p.z);
        d.scale.y = p.h;
        return "#93764a";
      });
      const frond = new THREE.BufferGeometry();
      frond.setAttribute("position", new THREE.Float32BufferAttribute([0, 0, 0, -0.16, 0.07, 0.45, 0, 0.16, 0.46, 0.16, 0.07, 0.45, 0, -0.28, 1], 3));
      frond.setIndex([0, 1, 2, 0, 2, 3, 1, 4, 2, 2, 4, 3]);
      frond.computeVertexNormals();
      for (let i = 0; i < 6; i++) {
        instances(THREE, group, frond, trees, (p, d) => {
          d.position.set(p.x, p.y + p.h, p.z);
          d.scale.setScalar(p.h * 0.7);
          d.rotation.y = p.a + (TAU * i) / 6;
          return i % 2 ? "#59834c" : "#789a4d";
        }, { side: THREE.DoubleSide });
      }
    },
    bush(THREE, group, trees, scale) {
      instances(THREE, group, new THREE.IcosahedronGeometry(1, 0), trees, (p, d) => {
        const s = p.h * scale;
        d.scale.set(s * 1.3, s, s);
        d.rotation.y = p.a;
        d.position.set(p.x, p.y + s * 0.62, p.z);
        return p.shade > 0.5 ? "#758152" : "#666f51";
      });
    },
    cypress(THREE, group, trees) {
      instances(THREE, group, new THREE.SphereGeometry(1, 6, 5), trees, (p, d) => {
        d.scale.set(p.h * 0.14, p.h * 0.57, p.h * 0.14);
        d.position.set(p.x, p.y + p.h * 0.54, p.z);
        return p.shade > 0.5 ? "#526444" : "#455e42";
      });
    },
    conifer(THREE, group, trees, snowy) {
      for (const upper of [false, true]) {
        instances(THREE, group, new THREE.ConeGeometry(1, 1, 5), trees, (p, d) => {
          const h = p.h * (upper ? 0.64 : 0.74);
          d.position.set(p.x, p.y + p.h * (upper ? 0.69 : 0.43), p.z);
          d.rotation.y = p.a;
          d.scale.set(p.h * (upper ? 0.19 : 0.26), h, p.h * (upper ? 0.19 : 0.26));
          if (snowy) return upper ? "#d0d6d8" : "#515b60";
          return p.shade < 0.33 ? (upper ? "#416b4c" : "#365b47") : p.shade < 0.7 ? (upper ? "#537751" : "#416548") : (upper ? "#688351" : "#4e714d");
        });
      }
    },
  };
  const VEGETATION = {
    pine: (T, g, t) => TREES.conifer(T, g, t, false),
    spruce: (T, g, t) => TREES.conifer(T, g, t, false),
    snowPine: (T, g, t) => TREES.conifer(T, g, t, true),
    cypress: TREES.cypress,
    palms: TREES.palms,
    juniper: (T, g, t) => TREES.bush(T, g, t, 0.29),
    heath: (T, g, t) => TREES.bush(T, g, t, 0.15),
    scrub: (T, g, t) => TREES.bush(T, g, t, 0.15),
    bare: () => {},
  };

  function trees(THREE, group, vegetation, list) {
    (VEGETATION[vegetation] || VEGETATION.pine)(THREE, group, list);
  }

  /** Marker posts: white posts with a reflector, both sides, every few metres. Each: { x, y, z, a }. */
  function posts(THREE, group, list) {
    instances(THREE, group, new THREE.BoxGeometry(0.16, 1, 0.16), list, (p, d) => {
      d.position.set(p.x, p.y + 0.5, p.z);
      d.rotation.y = p.a;
      return "#f1efe9";
    });
    instances(THREE, group, new THREE.BoxGeometry(0.17, 0.18, 0.17), list, (p, d) => {
      d.position.set(p.x, p.y + 0.86, p.z);
      d.rotation.y = p.a;
      return p.side > 0 ? "#d24a32" : "#e8c547";
    });
  }

  /** Fence panels: { x, y, z, a, len }. */
  function fences(THREE, group, list) {
    instances(THREE, group, new THREE.BoxGeometry(0.06, 0.9, 1), list, (p, d) => {
      d.position.set(p.x, p.y + 0.6, p.z);
      d.rotation.y = p.a;
      d.scale.z = p.len;
      return "#8d8f8a";
    });
  }

  /** Grandstands: { x, y, z, a, len } stepped blocks rising away from the road (local +x), with a roof. */
  function grandstands(THREE, group, list) {
    for (let step = 0; step < 4; step++) {
      instances(THREE, group, new THREE.BoxGeometry(1.4, 1, 1), list, (p, d) => {
        d.position.set(p.x, p.y + 0.6 + step * 0.45, p.z);
        d.rotation.y = p.a;
        d.translateX(step * 1.3);
        d.scale.set(1, 1.2 + step * 0.9, p.len);
        return step % 2 ? "#c9ccd2" : "#aeb3bb";
      });
    }
    instances(THREE, group, new THREE.BoxGeometry(6.5, 0.2, 1), list, (p, d) => {
      d.position.set(p.x, p.y + 5.6, p.z);
      d.rotation.y = p.a;
      d.translateX(2.2);
      d.scale.z = p.len + 1;
      return "#39577a";
    });
  }

  /** Braking boards before corners: { x, y, z, a, n } where n is 3, 2 or 1 (hundreds of metres). */
  function boards(THREE, group, list) {
    instances(THREE, group, new THREE.BoxGeometry(1.4, 1.0, 0.1), list, (p, d) => {
      d.position.set(p.x, p.y + 1.3, p.z);
      d.rotation.y = p.a;
      return "#f5f3ee";
    });
    instances(THREE, group, new THREE.BoxGeometry(0.1, 1.3, 0.1), list, (p, d) => {
      d.position.set(p.x, p.y + 0.4, p.z);
      return "#5d6066";
    });
    // Stripes: one bar per hundred metres, so the board reads without text.
    const bars = [];
    list.forEach((b) => { for (let i = 0; i < b.n; i++) bars.push(Object.assign({ i }, b)); });
    instances(THREE, group, new THREE.BoxGeometry(0.24, 0.7, 0.12), bars, (p, d) => {
      d.position.set(p.x, p.y + 1.3, p.z);
      d.rotation.y = p.a;
      d.translateX((p.i - (p.n - 1) / 2) * 0.38);
      return "#1d2a3a";
    });
  }

  BDR.props = { instances, trees, posts, fences, grandstands, boards, VEGETATION };
})();
