(() => {
"use strict";
const KEEP = "island";                       // Cape Aidan
const STORE = "/#apps";
window.BDR = window.BDR || {}; const data = window.BDR.data || {};
if(Array.isArray(data.tracks)) for(const t of data.tracks) if(t.id !== KEEP) t.dev = true;
if(Array.isArray(data.lessons)) data.lessons = data.lessons.filter(l => l.track === KEEP);
function bar(){
  if(document.getElementById("ktpDemoBar")) return;
  const d=document.createElement("div"); d.id="ktpDemoBar";
  d.innerHTML='<span class="lead"><b>Free web demo</b> — one track, Cape Aidan.</span>'
   +'<span class="keys">↑/W gas · ↓/S brake · ←/→ steer · Shift handbrake</span>'
   +'<a href="'+STORE+'">Full game: 10 tracks, 4 cars, garage upgrades → KTP Games</a>';
  document.body.appendChild(d);
  const mini=()=>d.classList.add("mini"); setTimeout(mini,9000);
  for(const ev of ["keydown","touchstart","pointerdown"]) window.addEventListener(ev,mini,{once:true,capture:true});
}
if(document.readyState==="loading") document.addEventListener("DOMContentLoaded",bar); else bar();
})();
