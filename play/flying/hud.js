"use strict";

window.CapeFlight.createHud = function (game) {
  const state = game.state;

  const {$, mission, course, waterLanding, school, courseRank} = game.setup;
  const {clamp, rad, TAU, renderer, camera, fogCapable} = game.graphics;
  const {origin, arrival, strip, stripXZ, heightAt} = game.terrain;
  const {host, informHost} = game.controls;
  const {spawn, gates, marks} = game.missions;
  const {wheelsDownY, targetLocalZ, finalHeading, runwayPoint, approachPath, finalIndex,
    approachMark, landingSurface} = game.landing;
  const {waterRotationSpeed, pos, projection, wind, groundHeading} = game.physics;
  const {snow, syncPose} = game.effects;

  function updateApproachInstrument(){
    const display=$("approachInstrument");
    display.hidden=!(fogCapable && state.phase==="approach" && state.pathIndex===finalIndex && state.mode==="flying");
    if(display.hidden)return;
    const [cross,along]=stripXZ(pos.x,pos.z);
    const distance=Math.max(0,along-targetLocalZ),heightError=pos.y-wheelsDownY-distance*.078;
    const lateral=clamp(-cross/Math.max(12,distance*.10),-1,1);
    const vertical=clamp(heightError/Math.max(5,distance*.055),-1,1);
    display.style.setProperty("--needle-x",(50+lateral*44)+"%");
    display.style.setProperty("--needle-y",(50+vertical*44)+"%");
    $("finalCourse").textContent=String(Math.round((finalHeading/rad+360)%360)%360).padStart(3,"0")+"°";
    const lateralCue=Math.abs(cross)<2?"Centered":cross>0?"Fly left":"Fly right";
    const verticalCue=Math.abs(heightError)<2?"On path":heightError>0?"High":"Low";
    $("needleCue").textContent=lateralCue+" · "+verticalCue;
  }
  function showLandingHud() {
    if(state.phase==="departure"){
      $("gateLabel").textContent=origin.name;$("dist").textContent=arrival.name;
      $("approachGuide").hidden=state.mode!=="flying";$("arrow").hidden=true;
      $("approachGuide").textContent=state.speed<27?"Full power · hold the centerline":state.hasMotion?"Tilt the top edge toward you to climb":"Pull up to lift off";
      return;
    }
    if(state.phase==="takeoff"){
      $("gateLabel").textContent="Takeoff lane";$("dist").textContent=Math.round(state.speed*1.94384)+" kt";
      $("approachGuide").hidden=state.mode!=="flying";$("arrow").hidden=true;
      const rotationSpeed=state.simulation?waterRotationSpeed:25;
      const knots=Math.round(rotationSpeed*1.94384);
      let cue;
      if(state.speed<rotationSpeed){
        cue=state.throttle<.85 ? "Tap Max · steer between the buoys" : "Keep level · build to "+knots+" kt";
      }else if(state.hasMotion){
        cue=state.tiltPitch<-.035 ? "Nose down · tilt the opposite way" :
            state.tiltPitch>.045 ? "Nose rising · hold that tilt" : "Tilt the top edge gently toward you";
      }else{
        cue=window.matchMedia("(pointer: coarse)").matches ? "Hold ↑ to lift the nose" : "Hold S to lift the nose";
      }
      $("approachGuide").textContent=cue;
      return;
    }
    const final = state.pathIndex===finalIndex, rolling = state.phase==="rollout";
    const target = approachPath[state.pathIndex], distance = Math.hypot(pos.x-target.point.x,pos.z-target.point.z);
    $("gateLabel").textContent = rolling ? (waterLanding?"Water taxi":"Rollout") : target.label;
    $("dist").textContent = rolling ? Math.round(state.speed*1.94384)+" kt" : Math.round(distance)+" m";
    $("approachGuide").hidden = state.mode!=="flying";
    $("arrow").hidden = true; approachMark.visible=false;
    if(state.mode!=="flying") return;
    if(rolling) {
      $("approachGuide").textContent = waterLanding?"Tap Idle · let the floats settle":"Idle throttle · hold Brake to stop"; return;
    }
    if(!final) {
      approachMark.position.copy(target.point); approachMark.quaternion.copy(camera.quaternion); approachMark.visible=true;
      const degrees=Math.round((Math.atan2(target.point.x-pos.x,pos.z-target.point.z)/rad+360)%360);
      $("approachGuide").textContent = target.label+" · steer "+String(degrees).padStart(3,"0")+"° toward the diamond"; return;
    }
    const [cross,along]=stripXZ(pos.x,pos.z);
    const height = Math.max(0,pos.y-wheelsDownY), heightFeet=Math.round(height*3.28084);
    const expected=Math.max(0,(along-targetLocalZ)*.078);
    let cue = "On glidepath";
    if(Math.abs(cross)>40) cue=waterLanding?"Line up with the buoys":"Align with centerline";
    else if(height<3.5 && landingSurface(pos.x,pos.z)) cue="Flare gently · level wings";
    else if(state.speed*1.94384>state.level.maxKnots) cue="Slow below "+state.level.maxKnots+" kt";
    else if(height>expected+7) cue="High · lower nose";
    else if(height<expected-7) cue="Low · raise nose";
    $("approachGuide").textContent = cue+" · "+heightFeet+(waterLanding?" ft above water":" ft above runway");
  }

  function hidePanel(){$("panel").hidden=true;}
  function panel(title,detail,action){$("panelTitle").textContent=title;$("panelMsg").textContent=detail;$("panelAction").textContent=action||"";$("panelAction").hidden=!action;$("panel").hidden=false;}
  function status(message,seconds=1.5){$("toast").textContent=message;$("toast").hidden=false;state.toastTime=seconds;}

  function markScore(){state.nextGate=gates.findIndex(g=>!g.done);$("score").textContent=String(state.score).padStart(2,"0");gates.forEach((g,i)=>{marks.children[i].className=g.done?"done":i===state.nextGate?"active":"";});}
  function setMode(value){
   if(value!==state.mode)closeMap();
   state.mode=value;
   if(value==="flying")state.last=0;
   document.body.dataset.mode = value;
   $("newFlight").hidden = value !== "paused";
   $("resultBoard").hidden=!(host && course.hasLeaderboard && mission==="trial" && value==="complete");
   $("boardStatus").hidden=true;
   if(value !== "flying") { $("approachInstrument").hidden=true; $("approachGuide").hidden=true; approachMark.visible=false; }
   $("trim").disabled = value !== "flying";
   state.tiltPitch = 0; state.tiltBank = 0;
   informHost(value);
   $("launch").hidden=value!=="ready";$("pause").disabled=!["flying","paused"].includes(value);
   $("pause").setAttribute("aria-label",value==="paused"?"Resume flight":"Pause flight");
   $("pause").title=value==="paused"?"Resume flight (P)":"Pause flight (P)";
   $("pause").querySelector("path").setAttribute("d",value==="paused"?"m6 4 10 6-10 6z":"M7 5v10m6-10v10");
   if(value!=="flying")$("arrow").hidden=true;
  }

  const mapCanvas=$("map"),compCanvas=$("comp"),mapCtx=mapCanvas.getContext("2d"),compCtx=compCanvas.getContext("2d");
  const chart=document.createElement("canvas"),MW=360,MH=202;chart.width=MW;chart.height=MH;
  const chartCtx=chart.getContext("2d");
  const {left:chartLeft,top:chartTop,width:chartWidth,height:chartHeight}=course.map;
  const chartImage=chartCtx.createImageData(MW,MH);
  for(let j=0;j<MH;j++)for(let i=0;i<MW;i++){
   const h=heightAt(chartLeft+i/MW*chartWidth,chartTop+j/MH*chartHeight);
   const [,r,g,b]=course.chartColors.find(([upper])=>h<upper);
   let k=4*(j*MW+i);chartImage.data.set([r,g,b,255],k);
  }
  chartCtx.putImageData(chartImage,0,0);chartCtx.strokeStyle="#c3d2a523";chartCtx.lineWidth=1;
  for(let i=0;i<MW;i+=40){chartCtx.beginPath();chartCtx.moveTo(i,0);chartCtx.lineTo(i,MH);chartCtx.stroke();}
  for(let i=0;i<MH;i+=40){chartCtx.beginPath();chartCtx.moveTo(0,i);chartCtx.lineTo(MW,i);chartCtx.stroke();}
  function sizeCanvas(canvas){const d=Math.min(window.devicePixelRatio||1,2),r=canvas.getBoundingClientRect();canvas.width=Math.max(1,Math.round(r.width*d));canvas.height=Math.max(1,Math.round(r.height*d));}
  const mapToggle=$("mapToggle");
  let mapOpen=false;
  function setMapOpen(open){
    mapOpen=open;
    mapToggle.setAttribute("aria-expanded",String(open));
    mapToggle.setAttribute("aria-label",open?"Close course map":"Enlarge course map");
    mapToggle.querySelector(".map-action").textContent=open?"Close ×":"⤢";
    document.body.dataset.mapOpen=String(open);
    sizeCanvas(mapCanvas);drawMap();
  }
  function closeMap(){
    if(!mapOpen)return false;
    setMapOpen(false);return true;
  }
  mapToggle.addEventListener("click",()=>setMapOpen(!mapOpen));
  const ringPath=[spawn,...gates.map(g=>g.center)];
  const stripEnds=[runwayPoint(-strip.length/2,0),runwayPoint(strip.length/2,0)];
  function drawMap(){
    const ctx=mapCtx, pixelRatio=Math.min(window.devicePixelRatio||1,2);
    const w=mapOpen?mapCanvas.width/pixelRatio:MW,h=mapOpen?mapCanvas.height/pixelRatio:MH;
    if(!w || !h)return;
    const rings=state.phase==="rings" || state.phase==="takeoff";
    const route=rings?ringPath:[pos];
    if(state.phase==="approach" || state.phase==="departure"){
      for(const waypoint of approachPath.slice(state.pathIndex))route.push(waypoint.point);
    }
    let scaleX=w/chartWidth,scaleY=h/chartHeight,left=chartLeft,top=chartTop;
    if(mapOpen){
      // Keep north up and use the same metres per pixel on both axes. Include
      // the aircraft even when the pilot has flown beyond the course boundary.
      const points=[...route,pos,...stripEnds];
      if(mission==="delivery")points.push(origin,arrival);
      const xs=points.map(p=>p.x),zs=points.map(p=>p.z);
      const x0=Math.min(...xs),x1=Math.max(...xs),z0=Math.min(...zs),z1=Math.max(...zs);
      scaleX=scaleY=Math.min((w-44)/Math.max(250,x1-x0),(h-40)/Math.max(250,z1-z0));
      left=(x0+x1-w/scaleX)/2;top=(z0+z1-h/scaleY)/2;
    }
    const xOf=x=>(x-left)*scaleX,yOf=z=>(z-top)*scaleY;
    ctx.setTransform(mapCanvas.width/w,0,0,mapCanvas.height/h,0,0);
    ctx.fillStyle="#234740";ctx.fillRect(0,0,w,h);
    ctx.drawImage(chart,xOf(chartLeft),yOf(chartTop),chartWidth*scaleX,chartHeight*scaleY);
    ctx.save();ctx.setLineDash([5,4]);ctx.strokeStyle=rings?"#f6e6adba":"#ffd06b";ctx.lineWidth=1.6;
    ctx.beginPath();route.forEach((p,i)=>ctx[i?"lineTo":"moveTo"](xOf(p.x),yOf(p.z)));ctx.stroke();ctx.restore();
    if(rings){
      gates.forEach((g,i)=>{
        const x=xOf(g.center.x),y=yOf(g.center.z),next=i===state.nextGate;
        const radius=mapOpen?(next?10:7):(next?6:3);
        ctx.beginPath();ctx.arc(x,y,radius,0,TAU);
        ctx.fillStyle=g.done?"#a7b5a7":next?"#ffcd64":"#e3ebda";ctx.fill();
        if(next){ctx.strokeStyle="#223f33";ctx.lineWidth=2;ctx.stroke();}
        if(mapOpen){
          ctx.fillStyle="#163932";ctx.font="bold 10px system-ui";ctx.textAlign="center";
          ctx.fillText(String(i+1),x,y+3.5);
        }
      });
    }
    const [a,b]=stripEnds;
    ctx.strokeStyle="#fff1c6";ctx.lineWidth=mapOpen?4:2;ctx.beginPath();
    ctx.moveTo(xOf(a.x),yOf(a.z));ctx.lineTo(xOf(b.x),yOf(b.z));ctx.stroke();
    if(game.fuel.open()){
      // The fuel strip (the home strip, drawn here when it isn't the landing runway) and its pump.
      const fuel=game.fuel,ends=[fuel.point(0,-fuel.strip.length/2),fuel.point(0,fuel.strip.length/2)];
      if(fuel.strip!==strip){ctx.beginPath();ctx.moveTo(xOf(ends[0].x),yOf(ends[0].z));ctx.lineTo(xOf(ends[1].x),yOf(ends[1].z));ctx.stroke();}
      const px=xOf(fuel.pump.x),py=yOf(fuel.pump.z);
      ctx.fillStyle="#e2674c";ctx.fillRect(px-3,py-3,6,6);
      if(mapOpen){ctx.font="bold 12px system-ui";ctx.textAlign="left";ctx.fillStyle="#fff1c6";ctx.fillText(BDR.t("fuelLabel"),px+6,py+4);}
    }
    if(mission==="delivery"){
      ctx.font="bold 12px system-ui";ctx.textAlign="left";
      for(const site of [origin,arrival]){
        const x=xOf(site.x),y=yOf(site.z);
        ctx.fillStyle=site===arrival?"#ffcf66":"#f5f1dc";ctx.fillRect(x-3,y-3,6,6);
        if(!mapOpen || site===origin)ctx.fillText(site.name,x+5,y-4);
      }
    }
    if(mapOpen){
      ctx.font="bold 12px system-ui";ctx.textAlign="center";ctx.lineWidth=3;
      ctx.strokeStyle="#173932";ctx.fillStyle="#fff1c6";
      const label=mission==="delivery"?arrival.name:waterLanding?"Water channel":"Runway";
      const margin=Math.min(w/2,ctx.measureText(label).width/2+4);
      const x=clamp(xOf(strip.x),margin,w-margin),y=clamp(yOf(strip.z)-9,14,h-4);
      ctx.strokeText(label,x,y);ctx.fillText(label,x,y);
      if(!rings && state.pathIndex<approachPath.length && state.phase!=="rollout"){
        const p=approachPath[state.pathIndex].point;
        ctx.beginPath();ctx.arc(xOf(p.x),yOf(p.z),6,0,TAU);ctx.strokeStyle="#ffd06b";ctx.lineWidth=2;ctx.stroke();
      }
    }
    const x=clamp(xOf(pos.x),6,w-6),y=clamp(yOf(pos.z),7,h-7);
    ctx.save();ctx.translate(x,y);ctx.rotate(groundHeading());ctx.beginPath();
    ctx.moveTo(0,-10);ctx.lineTo(6.4,7.3);ctx.lineTo(0,3.7);ctx.lineTo(-6.4,7.3);ctx.closePath();
    ctx.fillStyle="#fff8df";ctx.strokeStyle="#273e38";ctx.lineWidth=2.4;ctx.fill();ctx.stroke();ctx.restore();
  }
  const cardinal=["N","NE","E","SE","S","SW","W","NW"];
  function drawCompass(){
   const ctx=compCtx,w=compCanvas.width,h=compCanvas.height,scale=h/28,deg=((groundHeading()/rad)%360+360)%360;
   ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,w,h);ctx.translate(w/2,0);ctx.scale(scale,scale);ctx.font='bold 10px ui-monospace,monospace';ctx.textAlign="center";
   for(let t=Math.floor((deg-49)/5)*5;t<=deg+49;t+=5){const norm=(t+720)%360,offset=(t-deg)*w/(scale*98),major=norm%15===0;
   ctx.globalAlpha=clamp(1-Math.abs(t-deg)/57,.08,1);ctx.fillStyle="#173d37";ctx.fillRect(offset,major?17:20,major?1.5:1,major?7:4);
   if(major)ctx.fillText(norm%45===0?cardinal[norm/45]:String(norm).padStart(3,"0"),offset,12);
   }ctx.globalAlpha=1;$("heading").textContent=String(Math.round(deg)%360).padStart(3,"0")+"° "+cardinal[Math.round(deg/45)%8];
  }
  function showWind(){
    const indicator=$("wind"), speed=wind.length()/.514444;
    indicator.hidden=!speed || state.mode!=="flying" || (state.phase!=="rings" && state.phase!=="approach");
    if(indicator.hidden)return;
    const angle=Math.atan2(wind.x,-wind.z)-groundHeading();
    const knots=speed<.1?"<0.1":speed.toFixed(1);
    $("windArrow").style.transform="rotate("+angle+"rad)";
    $("windSpeed").textContent=knots+" kt";
    const degrees=(Math.round(angle/rad)%360+360)%360;
    indicator.setAttribute("aria-label","Wind drift "+degrees+" degrees clockwise from the nose at "+knots+" knots");
  }
  function renderHud(){
   showWind();
   updateApproachInstrument();
   if(mission==="fog")$("missionValue").textContent=state.mode==="complete"?state.landingPoints+"/100":state.phase==="rollout"?"Rollout":"Final approach";
   if(school)$("missionValue").textContent=courseRank+" · "+(state.phase==="approach" || state.phase==="rollout"?"Landing":state.score+"/10 rings");
   if(mission==="slalom"){
     $("missionValue").textContent=state.score+" / 10";
     $("approachGuide").hidden=state.mode!=="flying" || state.outsideRiverSeconds<.15;
     if(!$("approachGuide").hidden)$("approachGuide").textContent=pos.y>70?"Descend below 230 ft":"Turn back over the river";
   }
   if(mission==="trial"){
     $("missionValue").textContent=state.mode==="ready"?(state.bestRun?"Best "+state.bestRun.time.toFixed(2)+" s":"Set a time"):
       state.elapsed.toFixed(2)+" s · "+state.score+"/10";
   }
   if(mission==="delivery")$("missionValue").textContent=state.cargoKg+" kg · "+state.fuelGal.toFixed(1)+" gal · "+
     BDR.t(state.fuelStops?"fuelDone":"fuelDue");
   if(mission==="daily")$("missionValue").textContent=state.mode==="complete"?state.landingPoints+" / 100":Math.max(0,60-Math.floor(state.missionSeconds))+" s";
   if(state.simulation){
     const fpm=Math.round(state.speed*Math.sin(state.pathAngle)*196.8504/10)*10;
     $("verticalSpeed").textContent=(fpm>0?"+":"")+fpm;
   }
   $("stallWarning").hidden=!state.stalled || state.mode!=="flying";
   $("speed").textContent=Math.round(state.speed*1.94384);$("alt").textContent=Math.round(pos.y*3.28084).toLocaleString("en-US");
   $("thrust").style.width=Math.round(state.throttle*100)+"%";$("power").textContent=Math.round(state.throttle*100)+"%";
   if(state.phase!=="rings")showLandingHud();
   else if(state.nextGate>=0){
    const g=gates[state.nextGate],d=pos.distanceTo(g.center);$("gateLabel").textContent="Ring "+String(state.nextGate+1).padStart(2,"0");$("dist").textContent=d<1000?Math.round(d)+" m":(d/1000).toFixed(1)+" km";
    projection.copy(g.center).project(camera);
    const outside=projection.z>1||Math.abs(projection.x)>.93||Math.abs(projection.y)>.94;
    $("arrow").hidden=!(outside&&state.mode==="flying");
    if(outside&&state.mode==="flying"){const bearing=Math.atan2(g.center.x-pos.x,pos.z-g.center.z)-groundHeading(),delta=Math.atan2(Math.sin(bearing),Math.cos(bearing));
     $("arrow").textContent=Math.abs(delta)>.22?(delta<0?"◀ Ring to the left":"Ring to the right ▶"):(g.center.y>pos.y?"▲ Ring above":"▼ Ring below");
    }
   }else{$("gateLabel").textContent="Finished";$("dist").textContent="10 / 10";$("arrow").hidden=true;}
   drawMap();drawCompass();
  }
  function resize(){
   const w=innerWidth,h=innerHeight;
   renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.7));renderer.setSize(w,h);
   if(snow)snow.material.uniforms.pixelScale.value=h*Math.min(window.devicePixelRatio||1,1.7);
   camera.aspect=w/h;camera.updateProjectionMatrix();sizeCanvas(mapCanvas);sizeCanvas(compCanvas);syncPose(0,true);renderHud();
  }

  return {hidePanel, panel, status, markScore, setMode, renderHud, resize, closeMap};
};
