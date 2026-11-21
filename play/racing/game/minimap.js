// Track map: the outline and pit lane, then dots for the player, the ghost and other cars.
(function () {
  "use strict";

  function createMinimap(canvas) {
    const ctx = canvas.getContext("2d");
    let outline = null, fit = null, size = { w: 0, h: 0 };

    function setTrack(track) {
      const xs = track.samples.map((p) => p.x), zs = track.samples.map((p) => p.z);
      const minX = Math.min(...xs), maxX = Math.max(...xs), minZ = Math.min(...zs), maxZ = Math.max(...zs);
      fit = { minX, minZ, spanX: maxX - minX || 1, spanZ: maxZ - minZ || 1 };
      outline = track.samples.filter((_, i) => i % 3 === 0).map((p) => [p.x, p.z]);
      outline.closed = track.closed;
      outline.start = track.sampleAt(track.startS);
      const lane = BDR.pitLane.of(track);
      outline.pit = lane ? lane.points.map((p) => [p.x, p.z]) : null;
      size = { w: 0, h: 0 };
    }

    function project(x, z) {
      const pad = 6;
      const scale = Math.min((size.w - pad * 2) / fit.spanX, (size.h - pad * 2) / fit.spanZ);
      const ox = (size.w - fit.spanX * scale) / 2, oz = (size.h - fit.spanZ * scale) / 2;
      return [ox + (x - fit.minX) * scale, oz + (z - fit.minZ) * scale];
    }

    /** dots: [{ x, z, kind: "player" | "ghost" | "car" }] */
    function draw(dots) {
      if (!outline) return;
      const rect = canvas.getBoundingClientRect();
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      if (size.w !== rect.width || size.h !== rect.height) {
        size = { w: rect.width, h: rect.height };
        canvas.width = rect.width * ratio;
        canvas.height = rect.height * ratio;
      }
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      ctx.clearRect(0, 0, size.w, size.h);
      ctx.lineJoin = "round";
      ctx.lineWidth = 3;
      ctx.strokeStyle = "rgba(255,255,255,0.75)";
      ctx.beginPath();
      outline.forEach(([x, z], i) => {
        const [px, py] = project(x, z);
        if (i) ctx.lineTo(px, py);
        else ctx.moveTo(px, py);
      });
      if (outline.closed) ctx.closePath();
      ctx.stroke();
      if (outline.pit) {
        // The pit lane: a thinner line beside the main straight.
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = "rgba(255,201,74,0.9)";
        ctx.beginPath();
        outline.pit.forEach(([x, z], i) => {
          const [px, py] = project(x, z);
          if (i) ctx.lineTo(px, py);
          else ctx.moveTo(px, py);
        });
        ctx.stroke();
      }
      const [sx, sy] = project(outline.start.x, outline.start.z);
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(sx - 1, sy - 4, 3, 8);
      const order = { car: 0, ghost: 1, player: 2 };
      dots.slice().sort((a, b) => order[a.kind] - order[b.kind]).forEach((d) => {
        const [px, py] = project(d.x, d.z);
        ctx.beginPath();
        ctx.arc(px, py, d.kind === "player" ? 4 : 3, 0, Math.PI * 2);
        ctx.fillStyle = d.kind === "player" ? "#ffc94a" : d.kind === "ghost" ? "rgba(190,225,255,0.8)" : d.color || "#ff7a6b";
        ctx.fill();
        if (d.kind === "player") {
          ctx.lineWidth = 1.5;
          ctx.strokeStyle = "#12161c";
          ctx.stroke();
        }
      });
    }

    return { setTrack, draw };
  }

  BDR.createMinimap = createMinimap;
})();
