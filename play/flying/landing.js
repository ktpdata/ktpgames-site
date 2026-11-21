"use strict";

window.CapeFlight.createLanding = function (game) {
  const state = game.state;

  const {T, $, schoolCourses, saves, saveLandingScore, mission, daily, course, waterLanding,
    snowWeather, stage, school, courseRank, graduation, schoolLabel} = game.setup;
  const {clamp, mix, rad, vec, scene, fogCapable, basic, mesh, box} = game.graphics;
  const {runwayName, arrival, strip, deliveryName, stripXZ, heightAt, field, paint} = game.terrain;
  const {informHost, setThrottle, down, clearInput} = game.controls;
  const {route, ringRadius, gates} = game.missions;

  // This course uses the paved surface and the actual height of the plane's main wheels.
  const pavementY = waterLanding?.12:strip.y + .4 + .1 + .35 / 2;
  const wheelsDownY = pavementY + (waterLanding?2.17:1.96);
  const mainWheelX = 1.15;
  const courseLevels = {
    easy:   { name:"Easy",   ringScale:1.35, maxKnots:84, maxSink:5.0, maxBank:22, maxHeading:34 },
    normal: { name:"Normal", ringScale:1.00, maxKnots:70, maxSink:3.3, maxBank:14, maxHeading:22 },
    hard:   { name:"Hard",   ringScale:0.74, maxKnots:60, maxSink:1.8, maxBank:8,  maxHeading:13 },
    expert: { name:"Expert", ringScale:0.60, maxKnots:59, maxSink:1.55, maxBank:6, maxHeading:10 }
  };
  state.level = courseLevels.easy;

  state.phase = "rings"; // water takeoff, rings, approach, rollout
  state.practice = false;
  state.landingRetry = false;
  state.pathIndex = 0;
  state.braking = false;
  let touchdownKnots = 0;
  let touchdownSink = 0;
  state.passedStage = false;
  const targetLocalZ = strip.length / 2 - 72;
  const finalHeading = -strip.angle;
  const runwayPoint = (along, y) => vec(strip.x + Math.sin(strip.angle)*along, y, strip.z + Math.cos(strip.angle)*along);
  const touchdownPoint = runwayPoint(targetLocalZ, wheelsDownY);
  const practiceAlong = strip.length / 2 + 510;
  function patternPoint(offset,along,height){
    // Join on the same side of the field as the final ring.
    const last=route[route.length-1],sign=Math.sign(stripXZ(last[0],last[2])[0])||1;
    const p=runwayPoint(along,strip.y+height);
    p.x+=sign*offset*Math.cos(strip.angle);p.z-=sign*offset*Math.sin(strip.angle);
    p.y=Math.max(p.y,heightAt(p.x,p.z)+65);
    return p;
  }
  const approachPath = mission==="delivery" ? [
    {label:"Turn final",point:runwayPoint(strip.length/2+440,strip.y+60)},
    {label:arrival.name,point:touchdownPoint}
  ] : course.approach.map(waypoint=>{
    if(waypoint.touchdown)return {label:runwayName,point:touchdownPoint};
    const {label,point,pattern,final}=waypoint;
    if(point)return {label,point:vec(...point)};
    if(pattern)return {label,point:patternPoint(...pattern)};
    return {label,point:runwayPoint(final[0],strip.y+final[1])};
  });
  const finalIndex = approachPath.length - 1;
  const approachMark = new T.Group();
  scene.add(approachMark);
  const markerOutline = new T.LineLoop(
    new T.BufferGeometry().setFromPoints([vec(0,16,0),vec(17,0,0),vec(0,-16,0),vec(-17,0,0)]),
    new T.LineBasicMaterial({color:0xfff7d5})
  );
  approachMark.add(markerOutline);
  approachMark.visible = false;
  const landingLights = new T.Group();
  if(!waterLanding)field.add(landingLights);
  const lampGeo = new T.SphereGeometry(.83,6,4), lampPaint = basic("#ffed9a");
  for(let z=-strip.length/2+4; z<strip.length/2; z+=28) {
    for(const side of [-1,1]) mesh(lampGeo,lampPaint,landingLights,side*(strip.width/2+.9),.66,z);
  }
  for(const side of [-1,1]) box(landingLights,paint,side*8,.34,targetLocalZ,3,.04,18);
  landingLights.visible = false;

  function chooseLevel() {
    if(school){
      const t=stage/(schoolCourses.length-1),first=courseLevels.easy,last=courseLevels.expert;
      state.level={name:courseRank,ringScale:mix(first.ringScale,last.ringScale,t),
        maxKnots:Math.round(mix(first.maxKnots,last.maxKnots,t)),maxSink:mix(first.maxSink,last.maxSink,t),
        maxBank:mix(first.maxBank,last.maxBank,t),maxHeading:mix(first.maxHeading,last.maxHeading,t)};
    }else state.level=courseLevels[$("difficulty").value] || courseLevels.easy;
    for(let i=0;i<gates.length;i++){
      const g=gates[i], scale=state.level.ringScale*(school?1-.10*i/(gates.length-1):1), radius=ringRadius*scale;
      if(g.baseAltitude===undefined)g.baseAltitude=g.center.y;
      g.center.y=g.baseAltitude;
      for(let n=-4;n<=4;n++){
        const side=radius*n/4;
        const floor=heightAt(g.center.x-g.normal.z*side,g.center.z+g.normal.x*side);
        g.center.y=Math.max(g.center.y,floor+Math.sqrt(Math.max(0,radius*radius-side*side))+4);
      }
      g.group.position.copy(g.center);g.group.scale.setScalar(scale);
    }
    game.effects.setWeather();
    $("levelHint").textContent = snowWeather ? (state.level===courseLevels.easy?"Wide rings · light gusts":state.level===courseLevels.hard?"Small rings · heavy snow":"Standard rings · steady snow") : state.level.name==="Easy" ? "Wide rings · forgiving landings"
      : state.level.name==="Hard" ? "Small rings · precise landings" : "Standard rings · balanced landings";
    if(state.level===courseLevels.expert)$("levelHint").textContent="Expert · tight rings and precise touchdowns";
    if(school)$("levelHint").textContent=courseRank+" · "+state.schoolCleared+"/10 passed · Fly the rings in order and land at "+runwayName+".";
    if(graduation)$("levelHint").textContent="Expert checkout · 10 rings, then a fog landing in Simulator.";
    if(mission==="fog")$("levelHint").textContent="Simulator · Start on final. Follow the needles, land and stop"+(waterLanding?" inside the buoyed channel.":" on the runway.");
    if(mission==="slalom")$("levelHint").textContent="Weave through 10 gates · stay below 230 ft over the river";
    if(mission==="trial")$("levelHint").textContent=course.hasLeaderboard?"Fly all 10 rings in order · Simulator, Normal":"Race your personal ghost · 10 rings";
    if(mission==="delivery")$("levelHint").textContent=deliveryName+" · "+arrival.length+" m strip · Fuel stop at "+runwayName;
    if(mission==="daily") $("levelHint").textContent=dailyBrief();
  }
  function dailyBrief() {
    return daily.day+" UTC · "+runwayName+" · wind from "+String(daily.direction).padStart(3,"0")+"° at "+daily.knots+" kt";
  }
  function endMission(title,detail) {
    if(state.flightUnlocks?.length)detail+=" · Unlocked: "+state.flightUnlocks.join(", ");
    clearInput(); game.hud.setMode("complete"); $("toast").hidden=true; game.hud.panel(title,detail,"Flight setup"); game.hud.renderHud();
  }
  state.landingPoints = 0;
  state.outsideRiverSeconds = 0;
  function dailyResult(points,reason) {
    state.landingPoints=points;
    saveLandingScore(points);
    endMission("Touchdown · "+points+" / 100",reason+" · "+daily.day+" UTC");
  }
  function setPhase(value) {
    state.waterClimbRemaining=0;
    state.phase = value;
    document.body.dataset.phase = value;
    document.body.dataset.practice=String(state.practice);
    $("practiceScore").hidden=!state.practice; $("practiceLevel").textContent=state.level.name;
    landingLights.visible = value !== "rings";
    approachMark.visible = false;
    state.braking = false;
  }
  function positionOnFinal() {
    setPhase("approach");
    state.pathIndex = finalIndex;
    game.physics.pos.copy(runwayPoint(practiceAlong, wheelsDownY + (practiceAlong-targetLocalZ)*.078));
    game.physics.oldPos.copy(game.physics.pos);
    state.heading = finalHeading; state.bank = 0; state.throttle = .20; state.speed = 29.75;
    state.pathAngle=state.simulation?-Math.atan(.078):0;
    state.pitch=state.simulation?state.pathAngle+(game.physics.trimLift*(game.physics.cruiseSpeed/state.speed)**2-.24)/4.6:0;
    game.physics.resetLoop();
    setThrottle(20);
  }
  function placeOnFinal(){
    positionOnFinal();
    clearInput(); game.hud.hidePanel();
    game.hud.setMode("flying"); informHost("recenter");
    game.effects.syncPose(0,true); game.hud.renderHud();
    game.hud.status(waterLanding?"Water channel ahead · settle the floats gently":runwayName+" ahead · ease back just above the pavement",3);
  }
  function beginPractice() {
    game.session.reset(false);
    state.practice = true;
    gates.forEach(g => { g.group.visible=false; });
    placeOnFinal();
  }
  function normalizedAngle(radians) { return Math.atan2(Math.sin(radians),Math.cos(radians)); }
  function landingSurface(x,z) {
    if(waterLanding)return heightAt(x,z)<-.25;
    const [cross,along] = stripXZ(x,z);
    return Math.abs(cross) <= strip.width/2 && Math.abs(along) <= strip.length/2;
  }
  /** On the delivery's destination strip (or the mission's landing surface otherwise). */
  function onDestination(x,z){return landingSurface(x,z);}
  function failLanding(reason) {
    if(mission==="slalom"){endMission("Canyon run ended",reason+" · "+state.score+"/10 gates");return;}
    if(mission==="trial"){endMission("Time trial ended",reason);return;}
    if(mission==="daily"){ dailyResult(0,reason); return; }
    if(mission==="fog"){
      state.landingPoints=0;saveLandingScore(0);endMission("Missed approach",reason);$("panelAction").textContent="Retry landing";
      $("newFlight").hidden=false;return;
    }
    if(mission==="delivery"){endMission("Delivery interrupted",reason+" · "+deliveryName);return;}
    state.landingRetry = state.phase==="approach" || state.phase==="rollout" && (state.practice || state.score===gates.length);
    clearInput(); state.braking = false;
    game.hud.setMode("crashed"); state.crashWait = state.landingRetry ? 3.2 : 1.9;
    $("toast").hidden=true;
    game.hud.panel(reason,state.landingRetry ? "Retrying on final approach." : "Restarting the ring course.","");
  }
  function tryTouchdown(sink) {
    if(game.fuel.wanted(game.physics.pos.x,game.physics.pos.z)){game.fuel.touchdown(sink);return;}
    if(mission==="slalom"){endMission("Canyon run ended",state.score+" of 10 gates cleared");return;}
    if(mission==="trial"){endMission("Time trial ended","Land after crossing the finish ring");return;}
    const [cross] = stripXZ(game.physics.pos.x,game.physics.pos.z);
    if(!waterLanding && Math.abs(cross) > strip.width/2-mainWheelX) { failLanding("Wheel off the runway"); return; }
    if(school && state.score!==gates.length){endMission("Landed before the finish",state.score+"/10 rings · Clear every ring in order to pass.");return;}
    if((school || mission==="fog") && waterLanding && (Math.abs(cross)>strip.width/2-1.57 || Math.abs(stripXZ(game.physics.pos.x,game.physics.pos.z)[1])>strip.length/2)){
      failLanding("Land inside the marked water channel");return;
    }
    const error = Math.abs(normalizedAngle(state.heading-finalHeading));
    const alignment = Math.min(error,Math.PI-error)/rad;
    const knots = state.speed*1.94384;
    if(fogCapable && error/rad>state.level.maxHeading){failLanding("Align with the inbound course");return;}
    if(!waterLanding && alignment>state.level.maxHeading) { failLanding("Line up with the runway"); return; }
    if(waterLanding && state.pitch < -5*rad){failLanding("Float bow dug in · raise the nose");return;}
    if(knots>state.level.maxKnots) { failLanding("Touchdown too fast"); return; }
    if(Math.abs(state.bank)/rad>state.level.maxBank) { failLanding("Level your wings"); return; }
    if(sink>state.level.maxSink) { failLanding("Hard landing · ease the nose up"); return; }
    if(mission==="daily" || mission==="fog" || graduation){
      const along=stripXZ(game.physics.pos.x,game.physics.pos.z)[1];
      const quality=(error,limit)=>1-clamp(error/limit,0,1);
      const points=Math.round(30*quality(sink,state.level.maxSink)+20*quality(Math.abs(cross),strip.width/2)+
        15*quality(Math.abs(state.bank)/rad,state.level.maxBank)+15*quality(error/rad,state.level.maxHeading)+
        10*quality(Math.abs(along-targetLocalZ),strip.length*.5)+10*quality(Math.abs(knots-55),20));
      state.landingPoints=points;
      if(mission==="daily"){
        dailyResult(points,Math.round(knots)+" kt · "+sink.toFixed(1)+" m/s descent · "+Math.abs(cross).toFixed(1)+" m off center");
        return;
      }
    }
    touchdownKnots = Math.round(knots); touchdownSink = sink;
    game.physics.pos.y = wheelsDownY; state.pitch = 0; state.bank = 0; state.pathAngle=0; game.physics.resetLoop();
    setPhase("rollout"); game.hud.status(waterLanding?"Floats down · tap Idle and coast to a stop":"Wheels down · idle throttle and hold Brake",3);
  }
  function groundRoll(dt,steering) {
    const brakeForce = state.braking || down("Space") ? 5.9 : 0;
    const netForce = waterLanding?3.4*state.throttle-(.48+.135*state.speed):3.0*state.throttle - 1.1 - 2.3*(1-state.throttle) - brakeForce;
    const nextSpeed = clamp(state.speed+dt*netForce,0,59);
    const distance = .5*(state.speed+nextSpeed)*dt;
    state.heading += steering*Math.min(state.speed/7,1)*.32*dt;
    game.physics.pos.x += Math.sin(state.heading)*distance; game.physics.pos.z -= Math.cos(state.heading)*distance;
    game.physics.pos.y = wheelsDownY; state.speed=nextSpeed;
    const [cross,along]=stripXZ(game.physics.pos.x,game.physics.pos.z);
    if(waterLanding && !game.physics.afloat()){failLanding("Grounded on the shore");return;}
    if(!waterLanding && (Math.abs(cross)>strip.width/2-mainWheelX || Math.abs(along)>strip.length/2)) {
      failLanding("Runway excursion"); return;
    }
    if(state.speed>.12) return;
    state.speed=0; state.braking=false; clearInput(); game.hud.setMode("complete"); $("toast").hidden=true;
    if(mission==="delivery"){
      // As in Racing: a delivery without its fuel stop has the missed-stop penalty added at the finish.
      const penalty=game.fuel.penalty(), time=BDR.math.formatTime((state.elapsed+penalty)*1000);
      state.deliveryTime=state.elapsed+penalty;
      endMission("Cargo delivered",state.cargoKg+" kg delivered to "+arrival.name+" in "+time+
        (penalty?" · "+BDR.t("missedFuel",{s:penalty}):" · "+BDR.t("fuelDone"))+" · "+state.fuelGal.toFixed(1)+" gal remaining");return;
    }
    if(mission==="fog"){
      saveLandingScore(state.landingPoints);
      game.hud.panel("Fog landing · "+state.landingPoints+"/100",runwayName+" · "+touchdownKnots+" kt at touchdown · "+
        touchdownSink.toFixed(1)+" m/s descent","Fly again");
      $("newFlight").hidden=false;game.hud.renderHud();return;
    }
    if(school && state.score===gates.length){
      state.passedStage=true;
      if(stage===state.schoolCleared){
        state.schoolCleared++;
        const cleared=state.schoolCleared;
        saves.set("schoolCleared",cleared).then(record=>{
          if(state.passedStage && (!record || record.schoolCleared<cleared))
            $("panelMsg").textContent+=" · Could not save progress on this device.";
        });
      }
      updateSchoolMenu();
      const next=schoolCourses[stage+1];
      game.hud.panel(next?"Course "+(stage+1)+" passed":"Expert flight school complete",
        courseRank+" · "+touchdownKnots+" kt at touchdown · "+(next?"Next: "+next.name:"Fog landing "+state.landingPoints+"/100 · All ten courses passed."),
        next?"Next course":"Flight setup");
      $("newFlight").hidden=!next;game.hud.renderHud();return;
    }
    const title = state.practice ? "Practice landing complete" : state.score===gates.length ? "Course complete" : "Landed early";
    const rings = state.practice ? "" : state.score+"/10 rings · ";
    game.hud.panel(title,state.level.name+" · "+rings+touchdownKnots+" kt at touchdown · "+touchdownSink.toFixed(1)+" m/s descent","New flight");
  }
  function updateSchoolMenu(){
    Array.from($("destination").children).forEach((option,index)=>{
      option.disabled=index>state.schoolCleared;
      option.textContent=schoolLabel(index)+(index<state.schoolCleared?" ✓":option.disabled?" · Locked":"");
    });
  }
  function advanceApproach() {
    if(state.phase!=="approach" || state.pathIndex===finalIndex) return;
    const [cross,along]=stripXZ(game.physics.pos.x,game.physics.pos.z);
    if(Math.abs(cross)<70 && along>strip.length/2 && along<950 && Math.abs(normalizedAngle(state.heading-finalHeading))<48*rad) {
      state.pathIndex=finalIndex; return;
    }
    const target=approachPath[state.pathIndex].point;
    if(Math.hypot(game.physics.pos.x-target.x,game.physics.pos.z-target.z)<120) state.pathIndex++;
  }

  return {pavementY, wheelsDownY, courseLevels, targetLocalZ, finalHeading, runwayPoint, touchdownPoint,
    approachPath, finalIndex, approachMark, chooseLevel, endMission, dailyResult, setPhase,
    positionOnFinal, placeOnFinal, beginPractice, normalizedAngle, landingSurface, onDestination, failLanding,
    tryTouchdown, groundRoll, advanceApproach};
};
