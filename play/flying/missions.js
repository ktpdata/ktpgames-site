"use strict";

window.CapeFlight.createMissions = function (game) {
  const state = game.state;

  const {T, $, mission, destination, course, layoutIndex, stage, school, graduation} = game.setup;
  const {clamp, mix, vec, scene, lam, basic, mesh} = game.graphics;
  const {runwayName, heightAt} = game.terrain;
  const {plane} = game.aircraft;
  const {host, informHost} = game.controls;

  const baseRoute=mission==="slalom"?course.slalom.route:course.layouts[layoutIndex];
  // Later courses alternate banks and heights. Keep the entry gate aligned with the departure.
  const route=school?baseRoute.map(([x,y,z],i)=>{
    const before=baseRoute[Math.max(0,i-1)],after=baseRoute[Math.min(i+1,baseRoute.length-1)];
    const dx=after[0]-before[0],dz=after[2]-before[2],length=Math.hypot(dx,dz);
    const amplitude=stage*(i/9)*3.2;
    const weave=Math.sin(i*Math.PI*.55)*amplitude;
    return [x-dz/length*weave,y+Math.sin(i*Math.PI*.64)*amplitude*.76,z+dx/length*weave];
  }):baseRoute;
  const spawn=mission==="slalom"?vec(...course.slalom.spawn):vec(...(course.spawn.point || []));
  const ringRadius=mission==="slalom"?15:27.5,ringTube=mission==="slalom"?.85:1.06;
  if(course.spawn.behind){
    const ahead=vec(...route[1]).sub(vec(...route[0]));ahead.y=0;ahead.normalize();
    spawn.copy(vec(...route[0])).addScaledVector(ahead,-course.spawn.behind);
    spawn.y=Math.max(spawn.y,heightAt(spawn.x,spawn.z)+course.spawn.clearance);
  }
  const initialHeading=course.faceFirst?Math.atan2(route[0][0]-spawn.x,spawn.z-route[0][2]):0;
  const ringMaterial=course.ringPaint.lit?lam:basic;
  const gates=[],ringGold=ringMaterial(course.ringPaint.gold),ringCream=ringMaterial(course.ringPaint.cream);
  for(let i=0;i<route.length;i++){
   const [x,y,z]=route[i],center=vec(x,y,z),before=i?vec(...route[i-1]):spawn,after=i+1<route.length?vec(...route[i+1]):center;
   const normal=after.clone().sub(before);normal.y=0;normal.normalize();
   const side=vec(-normal.z,0,normal.x);
   for(const v of [-1,0,1])center.y=Math.max(center.y,heightAt(x+side.x*v*ringRadius,z+side.z*v*ringRadius)+ringRadius+18);
   const group=new T.Group();group.position.copy(center);group.quaternion.setFromUnitVectors(vec(0,0,1),normal);scene.add(group);
   mesh(new T.TorusGeometry(ringRadius,ringTube,8,80),ringGold,group);
   for(let j=0;j<4;j++){const stripe=mesh(new T.TorusGeometry(ringRadius,ringTube*1.025,8,5,.17),ringCream,group);stripe.rotation.z=Math.PI*.25+j*Math.PI*.5;}
   gates.push({center,normal,group,done:false});
  }


  const marks=$("blocks");for(const g of gates)marks.appendChild(document.createElement("i"));

  state.bestRun = null;
  state.samples = [];
  state.ghostIndex = 0;
  const ghost=mission==="trial"?plane.clone():null;
  if(ghost){
    const tint=new T.MeshBasicMaterial({color:"#8ceaff",transparent:true,opacity:.34,depthWrite:false});
    ghost.traverse(part=>{if(part.isMesh)part.material=tint;});
    ghost.visible=false;scene.add(ghost);
  }
  function acceptGhost(run){
    if(!run || !Number.isFinite(run.time) || run.time<=0 || run.time>1800 || (state.bestRun && state.bestRun.time<=run.time))return;
    if(!Array.isArray(run.samples) || run.samples.length<2 || run.samples.length>10000)return;
    let previous=-1;
    for(const row of run.samples){
      if(!Array.isArray(row)||row.length!==7||!row.every(Number.isFinite)||row[0]<=previous)return;
      previous=row[0];
    }
    if(run.samples[0][0]!==0 || Math.abs(previous-run.time)>.02)return;
    state.bestRun=run;state.ghostIndex=0;
  }
  function samplePose(time){
    return [time,game.physics.pos.x,game.physics.pos.y,game.physics.pos.z,state.pitch,state.heading,state.bank].map(v=>Math.round(v*1000)/1000);
  }
  const ghostRotation=new T.Euler(0,0,0,"YXZ"),ghostTarget=new T.Quaternion();
  function updateGhost(){
    if(!ghost)return;
    const path=state.bestRun?.samples;
    ghost.visible=state.mode==="flying" && !!path && state.elapsed<state.bestRun.time;
    if(!ghost.visible)return;
    while(state.ghostIndex+2<path.length && path[state.ghostIndex+1][0]<state.elapsed)state.ghostIndex++;
    const a=path[state.ghostIndex],b=path[state.ghostIndex+1],t=clamp((state.elapsed-a[0])/(b[0]-a[0]),0,1);
    ghost.position.set(mix(a[1],b[1],t),mix(a[2],b[2],t),mix(a[3],b[3],t));
    ghost.quaternion.setFromEuler(ghostRotation.set(a[4],-a[5],-a[6]));
    ghostTarget.setFromEuler(ghostRotation.set(b[4],-b[5],-b[6]));
    ghost.quaternion.slerp(ghostTarget,t);
    if(ghost.position.distanceToSquared(game.physics.pos)<9)ghost.visible=false;
  }
  function finishTrial(){
    const time=state.elapsed,record=!state.bestRun || time<state.bestRun.time;
    if(record){
      if(state.samples.at(-1)[0]>=Math.round(time*1000)/1000)state.samples.pop();
      state.samples.push(samplePose(time));acceptGhost({time,samples: state.samples});
      if(host)informHost({action:"saveGhost",course:destination,run:state.bestRun});
      else game.setup.saves.saveWebsiteGhost(destination,state.bestRun);
    }
    game.landing.endMission(record?"Personal best":"Time trial complete",time.toFixed(2)+" s · "+(record?"Your ghost is ready to race":"Best "+state.bestRun.time.toFixed(2)+" s"));
    if(host && course.hasLeaderboard)informHost({action:"finishedTrial",course:destination,centiseconds:Math.round(time*100)});
  }
  function openLeaderboard(){informHost({action:"leaderboard",course:destination,centiseconds:state.bestRun?Math.round(state.bestRun.time*100):0});}
  $("leaderboard").hidden=!(host && course.hasLeaderboard && mission==="trial");
  $("leaderboard").addEventListener("click",openLeaderboard);
  $("resultBoard").addEventListener("click",openLeaderboard);

  // Questions are only ever asked on the ground. Each math answer moves the adaptive level and may unlock
  // a plane or course; unlocks are listed at the end of the flight, never mid-flight.
  function recordMathAnswer(correct){
    const lockedBefore=Object.keys(window.CapeFlight.unlockRules).filter(id=>!game.setup.openItem(id));
    const next=BDR.quiz.record(state.math,correct);
    state.math={level:next.level,recent:next.recent};
    const progress=state.progress;
    progress.mathLevel=next.level;progress.highestMathLevel=Math.max(progress.highestMathLevel,next.level);
    if(correct)progress.correctTotal++;
    for(const id of lockedBefore){
      if(game.setup.openItem(id))state.flightUnlocks.push((window.CapeFlight.courses[id] || game.setup.fleet[id]).name);
    }
    if(correct)game.setup.saves.set("correctTotal",progress.correctTotal);
    game.setup.saves.set("mathProgress",state.math);
    return next;
  }
  function clearGate(i){
   const g=gates[i];g.done=true;g.group.visible=false;state.score++;game.hud.markScore();
   if(state.score===gates.length){
    if(mission==="slalom"){game.landing.endMission("Canyon run complete","10 gates · "+state.elapsed.toFixed(1)+" seconds downriver");return;}
    if(mission==="trial"){finishTrial();return;}
    game.landing.setPhase("approach"); state.pathIndex=0;
    game.hud.status(graduation?"Expert final · fog ahead · follow the approach to "+runwayName:"10 rings cleared · follow the diamonds to "+runwayName,3);
   }else game.hud.status("Ring "+String(i+1).padStart(2,"0")+" cleared");
  }

  return {recordMathAnswer, route, spawn, ringRadius, ringTube, initialHeading, gates,
    marks, ghost, acceptGhost, samplePose, updateGhost, finishTrial, clearGate};
};
