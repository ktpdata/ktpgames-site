"use strict";

window.CapeFlight.connectControls = function (game) {
  const state = game.state;

  const {$, destination} = game.setup;
  const {clamp} = game.graphics;

  const lever = $("manualThrottle");
  const host = window.webkit?.messageHandlers?.flight;
  const informHost = message => host?.postMessage(message);

  state.tiltPitch = 0;
  state.tiltBank = 0;
  state.hasMotion = false;
  state.sceneActive = true;
  function setThrottle(percent) {
   const value = clamp(Math.round(percent), 0, 100);
   lever.value = String(value);
   $("throttleRail").style.setProperty("--power",String(value/100));
   $("powerGrip").style.top="calc("+ (100-value) +"% - "+(26*(1-value/100))+"px)";
   lever.setAttribute("aria-valuetext", value + " percent");
   $("leverValue").textContent = value + "%";
  }
  const rail=$("throttleRail");
  function powerAtPointer(e){
   const bounds=rail.getBoundingClientRect();
   const fraction=1-(e.clientY-bounds.top-13)/Math.max(1,bounds.height-26);
   setThrottle(fraction*100);
  }
  let throttlePointer=null;
  lever.addEventListener("pointerdown",e=>{
   if(throttlePointer!==null)return;
   e.preventDefault();throttlePointer=e.pointerId;lever.setPointerCapture(e.pointerId);powerAtPointer(e);
  });
  lever.addEventListener("pointermove",e=>{if(e.pointerId===throttlePointer)powerAtPointer(e);});
  for(const event of ["pointerup","pointercancel","lostpointercapture"])lever.addEventListener(event,e=>{
   if(e.pointerId===throttlePointer)throttlePointer=null;
  });
  $("fullPower").addEventListener("click",()=>setThrottle(100));
  $("lowPower").addEventListener("click",()=>setThrottle(20));
  $("idlePower").addEventListener("click",()=>setThrottle(0));
  lever.addEventListener("input", () => setThrottle(Number(lever.value)));
  $("trim").addEventListener("click", () => {
   state.tiltPitch = 0; state.tiltBank = 0;
   informHost("recenter"); game.hud.status("Current grip set as level");
  });
  // Keep touch steering available even if the native fallback message also fails to arrive.
  let lastSteeringTime=0;
  function checkSteering(now){
    if(state.hasMotion && now-lastSteeringTime>1500)window.capeFlight.setMotion(false);
  }
  window.capeFlight = {
   restoreGhost(course,run){if(game.missions.ghost && destination===course){game.missions.acceptGhost(run);game.hud.renderHud();}},
   leaderboardStatus(message){$("boardStatus").hidden=!message;$("boardStatus").textContent=message;},
   steer(pitchInput, bankInput) {
     if (state.mode !== "flying" || !state.sceneActive) return false;
     if (!state.hasMotion) window.capeFlight.setMotion(true);
     lastSteeringTime=window.performance.now();
     state.tiltPitch = clamp(pitchInput, -1, 1);
     state.tiltBank = clamp(bankInput, -1, 1);
     return true;
   },
   setMotion(available) {
     state.hasMotion = !!available;
     if(state.hasMotion)lastSteeringTime=window.performance.now();
     state.tiltPitch = 0; state.tiltBank = 0;
     document.body.classList.toggle("fallback", !state.hasMotion);
     $("gripHint").textContent = state.hasMotion ? "Hold your phone comfortably to set level." : (window.matchMedia("(pointer: coarse)").matches?"Use the arrow buttons to steer.":"W/S pitch · A/D roll · Shift adds power.");
   },
   setActive(active) {
     state.sceneActive = !!active;
     if (!active) game.session.suspend();
   }
  };
  const touched=new Set(),pressed=new Set(),down=c=>pressed.has(c)||touched.has(c);

  function clearInput(){state.braking=false;$("brake").classList.remove("held");pressed.clear();touched.clear();document.querySelectorAll(".touch .on").forEach(b=>b.classList.remove("on"));}

  return {lever, host, informHost, setThrottle, touched, pressed, down, clearInput, checkSteering};
};
