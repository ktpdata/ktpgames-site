(() => {
"use strict";
const KEEP = "island";                       // Cape Aidan
const STORE = "/#apps";                      // where "full game" links go for now
const label = "Full game · coming to the App Store";
function gateDestinations(){
  const sel = document.getElementById("destination"); if(!sel) return;
  for(const o of sel.options){
    if(o.value === KEEP){ o.disabled=false; continue; }
    o.disabled = true;
    if(!o.textContent.includes(label)) o.textContent = "🔒 " + (window.CapeFlight?.courses?.[o.value]?.name || o.value) + " · " + label;
  }
  if(sel.value !== KEEP){ sel.value = KEEP; sel.dispatchEvent(new Event("change",{bubbles:true})); }
}
function skipParentNotice(){
  const dlg = document.getElementById("parents"); if(!dlg || dlg.hidden) return;
  const keep = document.getElementById("keepLearning"), start = document.getElementById("parentStart");
  if(keep && keep.offsetParent !== null){ keep.click(); setTimeout(skipParentNotice, 250); return; }
  if(start && start.offsetParent !== null){ start.click(); return; }
  setTimeout(skipParentNotice, 250);
}
function hideParentSettings(){ const b=document.getElementById("parentSettingsOpen"); if(b) b.style.display="none"; }
function bar(){
  if(document.getElementById("ktpDemoBar")) return;
  const d=document.createElement("div"); d.id="ktpDemoBar";
  d.innerHTML='<span class="lead"><b>Free web demo</b> — one course, Cape Aidan.</span>'
   +'<span class="keys">W/S pitch · A/D bank · Space throttle · R reset · P pause</span>'
   +'<a href="'+STORE+'">Full game: 12 courses, 4 planes, missions → KTP Games</a>';
  document.body.appendChild(d);
  const mini=()=>d.classList.add("mini"); setTimeout(mini,9000);
  for(const ev of ["keydown","touchstart","pointerdown"]) window.addEventListener(ev,mini,{once:true,capture:true});
}
const run=()=>{ bar(); hideParentSettings(); skipParentNotice(); gateDestinations(); };
if(document.readyState==="loading") document.addEventListener("DOMContentLoaded",()=>setTimeout(run,300)); else setTimeout(run,300);
for(const t of [800,1500,3000]) setTimeout(skipParentNotice,t);
const sel=()=>document.getElementById("destination");
const mo=new MutationObserver(()=>gateDestinations());
const arm=()=>{ const s=sel(); if(s) mo.observe(s,{childList:true,characterData:true,subtree:true}); else setTimeout(arm,300); };
arm();
document.addEventListener("click",()=>setTimeout(()=>{skipParentNotice();gateDestinations();},50),true);
})();
