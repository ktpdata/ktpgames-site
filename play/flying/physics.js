"use strict";

window.CapeFlight.createPhysics = function (game) {
  const state = game.state;

  const {T, $, mission, daily, terrain, waterLanding, snowWeather, stage, school, aircraft, spec} = game.setup;
  const {clamp, mix, smooth, damp, rad, TAU, vec} = game.graphics;
  const {origin, arrival, strip, weightRatio, stripXZ, heightAt} = game.terrain;
  const {lever, down} = game.controls;
  const {spawn, ringRadius, ringTube, gates, samplePose, clearGate} = game.missions;
  const {pavementY, wheelsDownY, courseLevels, endMission, setPhase, landingSurface, failLanding,
    tryTouchdown, groundRoll, advanceApproach} = game.landing;

  state.mode = "ready";
  state.score = 0;
  state.pitch = 0;
  state.bank = 0;
  state.heading = 0;
  state.speed = 44;
  state.throttle = .55;
  state.elapsed = 0;
  state.crashWait = 0;
  state.toastTime = 0;
  state.nextGate = 0;

  const cruiseSpeed = 44; // m/s
  const trimPitch = 2*rad;
  const trimLift = .24+4.6*trimPitch;
  state.simulation = false;
  state.pathAngle = 0;
  state.stalled = false;
  const waterRotationSpeed=28.3; // m/s, 55 kt in Simulator
  const waterClimbSeconds=4;
  state.waterClimbRemaining = 0;

  const pos=spawn.clone(),oldPos=vec(),forward=vec(),aim=vec(),desired=vec(),projection=vec(),intersection=vec(),segment=vec();

  const floatSamples=[vec(-1.57,-2.17,.45),vec(1.57,-2.17,.45),vec(-1.57,-1.83,-3.10),vec(1.57,-1.83,-3.10),vec(0,-.44,-4.54),vec(-spec.span,spec.tipY-.06,0),vec(spec.span,spec.tipY-.06,0)];
  const groundSamples=waterLanding?floatSamples:[vec(-1.15,-1.96,-1.07),vec(1.15,-1.96,-1.07),vec(0,-.77,4.95),vec(-spec.span,spec.tipY-.06,0),vec(spec.span,spec.tipY-.06,0),vec(0,-.44,-4.54)],probe=vec(),orientation=new T.Quaternion(),rotation=new T.Euler(0,0,0,"YXZ");
  if(aircraft==="biplane")groundSamples.push(vec(-5.88,-.27,0),vec(5.88,-.27,0));
  if(aircraft==="twin")groundSamples.push(vec(-3.05,-1.54,-3.13),vec(3.05,-1.54,-3.13));
  // Extra engine power appears above cruise throttle so the approach and trim speeds
  // stay familiar when switching planes. Wings change the response to the same grip.
  function powerFactor(throttle=state.throttle){return 1+(spec.power-1)*smooth(.55,1,throttle);}
  function arcadeLevelSpeed(throttle){
    const extraPower=Math.max(0,(throttle-.55)/.45);
    return 21.5+(41*throttle+20*extraPower**1.5)*powerFactor(throttle)/weightRatio();
  }
  function topSpeed(){return state.simulation?spec.simTopSpeed:arcadeLevelSpeed(1);}
  function loopEntrySpeed(){return .8*topSpeed();}
  function arcadeStep(dt,vertical,lateral) {
    state.pitch=damp(state.pitch,vertical*.64*spec.pitch,1.45*spec.pitch,dt);
    state.bank=damp(state.bank,lateral*1.14*Math.sqrt(spec.roll),2.15*spec.roll,dt);
    const mass=weightRatio();
    state.speed=damp(state.speed,arcadeLevelSpeed(state.throttle)-7*Math.sin(state.pitch),.72/mass,dt);
    state.heading=(state.heading+9.81*Math.tan(state.bank)/state.speed*dt)%TAU;
    state.pathAngle=state.pitch;
  }

  // Point-mass flight dynamics in the air-mass frame. Pitch is the attitude of the
  // fuselage. Lift bends the velocity vector, so its angle can differ from pitch.
  function wingLift(alpha,separation) {
    return clamp(.24+4.6*alpha,-1.05,1.44)*(1-.65*separation);
  }
  function simulatorStep(dt,vertical,lateral) {
    const gravity=9.81;
    const authority=clamp(state.speed/32,.45,1);
    let commandedPitch=trimPitch+vertical*30*rad*spec.pitch;
    if(state.waterClimbRemaining>0){
      // Blend out the attitude used on the step as the airspeed builds. A forward
      // input gives the pilot immediate nose-down authority.
      if(vertical<-.03)state.waterClimbRemaining=0;
      const weight=smooth(0,waterClimbSeconds,state.waterClimbRemaining);
      commandedPitch=mix(commandedPitch,clamp(commandedPitch,9*rad,13*rad),weight);
      state.waterClimbRemaining=Math.max(0,state.waterClimbRemaining-dt);
    }
    state.pitch=damp(state.pitch,commandedPitch,1.7*authority*spec.pitch,dt);
    state.bank=damp(state.bank,lateral*65*rad*Math.sqrt(spec.roll),1.75*authority*spec.roll,dt);
    const alpha=state.pitch-state.pathAngle;
    const separation=smooth(14*rad,28*rad,Math.abs(alpha));
    state.stalled=Math.abs(alpha)>(state.stalled?13:15)*rad;
    const liftCoefficient=wingLift(alpha,separation);
    const pressureRatio=(state.speed/cruiseSpeed)**2;
    const loadFactor=pressureRatio*liftCoefficient/(trimLift*weightRatio());
    const propAcceleration=3.4*state.throttle*powerFactor()*cruiseSpeed/Math.max(22,state.speed);
    const dragAcceleration=pressureRatio*(1.21+4.1*liftCoefficient**2+4.0*separation);
    const acceleration=(propAcceleration-dragAcceleration)/weightRatio()-gravity*Math.sin(state.pathAngle);
    const turnRate=gravity*loadFactor*Math.sin(state.bank)/(state.speed*Math.max(.35,Math.cos(state.pathAngle)));
    const pathRate=gravity*(loadFactor*Math.cos(state.bank)-Math.cos(state.pathAngle))/state.speed;
    state.speed=clamp(state.speed+acceleration*dt,12,100);
    state.heading=(state.heading+turnRate*dt)%TAU;
    state.pathAngle=clamp(state.pathAngle+pathRate*dt,-80*rad,80*rad);
  }
  let maneuver=null, pullStarted=null, secondPullUntil=0;
  function resetLoop(){
    maneuver=null;pullStarted=null;secondPullUntil=0;state.stalled=false;
  }
  function loopRequested(pull){
    if(state.phase!=="rings" || state.waterClimbRemaining>0)return false;
    if(pull>=.8 && pullStarted===null){
      pullStarted=state.elapsed;
      if(secondPullUntil>0 && state.elapsed<=secondPullUntil){secondPullUntil=0;return true;}
    }else if(pull<=.35 && pullStarted!==null){
      secondPullUntil=state.elapsed-pullStarted<=.55?state.elapsed+.75:0;
      pullStarted=null;
    }
    return false;
  }
  function groundHeading(){
    return state.heading+(Math.cos(state.pathAngle)<0?Math.PI:0);
  }
  function leaveLoop(stall){
    // Use an equivalent upright pitch frame. Over the top, the exit track is
    // reciprocal and the wings start inverted, then roll level over time.
    const inverted=Math.cos(state.pathAngle)<0;
    state.heading=groundHeading()%TAU;
    if(inverted)state.bank+=state.bank>0?-Math.PI:Math.PI;
    state.pathAngle=Math.asin(clamp(Math.sin(state.pathAngle),-1,1));
    state.pitch=state.pathAngle;
    maneuver=stall?"stall":"recovery";
    state.stalled=stall;
    pullStarted=null;secondPullUntil=0;
  }
  function maneuverStep(dt,pull,steer){
    if(!maneuver){
      if(!loopRequested(pull))return false;
      if(state.speed<loopEntrySpeed())leaveLoop(true);
      else{
        maneuver="loop";
        state.stalled=false;
        game.hud.status("Hold for a loop · release to roll level",2);
      }
    }
    if(maneuver==="loop"){
      if(state.speed<loopEntrySpeed() || pull<=.35)leaveLoop(state.speed<loopEntrySpeed());
      else{
        const maximum=topSpeed();
        const target=maximum*(.30+.70*state.throttle);
        state.speed=damp(state.speed,target,.55,dt)-3.2*Math.sin(state.pathAngle)*dt;
        const radius=maximum/(1.08*spec.pitch);
        state.pathAngle+=state.speed/radius*dt;
        if(state.pathAngle>=TAU)state.pathAngle-=TAU;
        state.pitch=state.pathAngle;
        state.bank=damp(state.bank,steer*.45,2,dt);
        state.heading=(state.heading+Math.sin(state.bank)*Math.cos(state.pathAngle)*.35*dt)%TAU;
        return true;
      }
    }
    const stalling=maneuver==="stall";
    const targetAngle=stalling?-.48:Math.min(0,pull)*.35;
    state.bank=damp(state.bank,0,2.6,dt);
    state.pathAngle=damp(state.pathAngle,targetAngle,stalling?1.8:2.2,dt);
    state.pitch=state.pathAngle;
    state.speed=damp(state.speed,topSpeed()*(.30+.70*state.throttle),.4,dt)-4*Math.sin(state.pathAngle)*dt;
    if(stalling && pull<=.35 && state.pathAngle<-.18){
      state.stalled=false;maneuver="recovery";
    }else if(!stalling && Math.abs(state.bank)<.04 && Math.abs(state.pathAngle-targetAngle)<.05){
      maneuver=null;
    }
    return true;
  }
  function afloat(){
    // Check both pontoons so a wing-level pass over a shoreline cannot count as a landing.
    const sideX=1.57*Math.cos(state.heading),sideZ=1.57*Math.sin(state.heading);
    return landingSurface(pos.x-sideX,pos.z-sideZ) && landingSurface(pos.x+sideX,pos.z+sideZ);
  }
  function waterTakeoff(dt,vertical,lateral){
    const drag=.38+.074*state.speed;
    state.speed=clamp(state.speed+(4.6*state.throttle*powerFactor()-drag)*dt,0,36);
    state.heading+=lateral*.28*clamp(state.speed/4,0,1)*dt;
    pos.x+=Math.sin(state.heading)*state.speed*dt;pos.z-=Math.cos(state.heading)*state.speed*dt;
    const pull=clamp(vertical,0,1);
    // At speed the floats plane bow-up. A small deliberate pull rotates them
    // from that attitude without requiring the pilot to hold a steep phone angle.
    const rotationPitch=state.simulation ? mix(2*rad,12*rad,smooth(.015,.085,pull)) : pull*.34;
    state.pitch=damp(state.pitch,rotationPitch*smooth(7,24,state.speed),2.1,dt);
    pos.y=wheelsDownY+.08*Math.sin(state.elapsed*3)*smooth(1,10,state.speed);
    if(!afloat()){game.session.impact();return;}
    if(state.speed<(state.simulation?waterRotationSpeed:25) || state.pitch<.035 || (state.simulation && pull<.025))return;
    const departureAngle=state.simulation?.012:Math.min(state.pitch*.55,.055);
    if(state.simulation){
      const alpha=state.pitch-departureAngle;
      const coefficient=wingLift(alpha,smooth(14*rad,28*rad,Math.abs(alpha)));
      if((state.speed/cruiseSpeed)**2*coefficient/trimLift<1.05)return;
    }
    state.pathAngle=departureAngle;
    pos.y=wheelsDownY+.35;
    setPhase("rings");
    state.waterClimbRemaining=state.simulation?waterClimbSeconds:0;
    $("approachGuide").hidden=true;
    game.hud.status(state.simulation?"Airborne · ease toward level as you climb":"Airborne · follow the rings",2);
  }
  function stripDeparture(dt,pull,steer){
    const rotation=26*Math.sqrt(weightRatio());
    state.speed=clamp(state.speed+(5.7*state.throttle*powerFactor()/weightRatio()-.6-.012*state.speed)*dt,0,45);
    state.heading+=steer*.33*clamp(state.speed/7,0,1)*dt;
    pos.x+=Math.sin(state.heading)*state.speed*dt;pos.z-=Math.cos(state.heading)*state.speed*dt;
    // Deliveries start at their origin; after a fuel stop the plane leaves from the fuel strip.
    const runway=state.departureStrip || origin;
    const [cross,along]=stripXZ(pos.x,pos.z,runway);
    if(Math.abs(cross)>runway.width/2-1 || Math.abs(along)>runway.length/2){failLanding("Takeoff left the strip");return;}
    if(state.speed<rotation || pull<.05)return;
    const next=state.departureStrip?state.resumePhase:"approach";
    state.pitch=state.simulation?11*rad:.10;state.pathAngle=.055;pos.y+=.65;setPhase(next);state.departureStrip=null;
    state.waterClimbRemaining=state.simulation?waterClimbSeconds:0;
    game.hud.status(mission==="delivery"?"Airborne · deliver to "+arrival.name:"Airborne · follow the rings",2);
  }
  // World-space drift in metres per second. Keep the last sample for the cockpit HUD.
  const wind=vec();
  function sampleWind(dt){
    wind.set(0,0,0);
    if(mission==="daily"){
      const speed=daily.knots*.514444, angle=daily.direction*rad;
      wind.x=-Math.sin(angle)*speed;
      wind.z=Math.cos(angle)*speed;
    }
    if(school){
      const crosswind=stage*.40*(.62+.38*Math.sin(state.elapsed*.36+pos.z*.001));
      wind.x=Math.cos(strip.angle)*crosswind;
      wind.z=-Math.sin(strip.angle)*crosswind;
    }else if(snowWeather && state.phase==="rings"){
      const strength=state.level===courseLevels.easy?.7:state.level===courseLevels.expert?4.9:state.level===courseLevels.hard?3.8:2;
      const z=pos.z+wind.z*dt;
      wind.x+=strength*(.45*Math.sin(state.elapsed*.8)+.55*Math.sin(state.elapsed*.28+z*.001));
    }
    return wind;
  }
  function flightStep(dt){
   if(state.mode!=="flying")return;
   state.elapsed+=dt;oldPos.copy(pos);
   if(mission==="trial"){
     if(state.elapsed>=1800){endMission("Time trial ended","30-minute course limit");return;}
     if(state.elapsed-state.samples.at(-1)[0]>=.20)state.samples.push(samplePose(state.elapsed));
   }
   const pitchKeys=Number(down("KeyS"))-Number(down("KeyW"));
   const bankKeys=Number(down("KeyD"))-Number(down("KeyA"));
   const vertical=pitchKeys || state.tiltPitch, lateral=bankKeys || state.tiltBank;
   state.throttle=damp(state.throttle,(down("ShiftLeft")||down("ShiftRight"))?1:Number(lever.value)/100,1.6,dt);
   if(state.phase==="fuelTaxi"){game.fuel.taxi(dt);return;}
   if(state.phase==="fuelStop"){game.fuel.step(dt);return;}
   if(mission==="delivery"){
     state.fuelGal=Math.max(0,state.fuelGal-dt*(.002+.016*state.throttle));
     if(!state.fuelGal){state.throttle=0;if(!state.simulation)pos.y-=3.2*dt;}
   }
   if(state.phase==="departure"){stripDeparture(dt,vertical,lateral);return;}
   if(state.phase==="takeoff"){waterTakeoff(dt,vertical,lateral);return;}
   if(state.phase==="rollout"){groundRoll(dt,lateral);return;}
   if(state.phase==="fuelRoll"){game.fuel.roll(dt,lateral);return;}
   if(!maneuverStep(dt,vertical,lateral)){
     if(state.simulation)simulatorStep(dt,vertical,lateral);
     else arcadeStep(dt,vertical,lateral);
   }
   forward.set(Math.sin(state.heading)*Math.cos(state.pathAngle),Math.sin(state.pathAngle),-Math.cos(state.heading)*Math.cos(state.pathAngle));
   pos.addScaledVector(forward,state.speed*dt);
   pos.addScaledVector(sampleWind(dt),dt);
   // With reduced power on final, the plane naturally descends. Back pressure flattens the glide.
   if(!state.simulation && state.phase==="approach") pos.y-=state.speed*.16*clamp((.42-state.throttle)/.42,0,1)*dt;
   advanceApproach();
   orientation.setFromEuler(rotation.set(state.pitch,-state.heading,-state.bank,"YXZ"));
   // Test airframe strikes before the wheels, including when a wingtip skims the shoulder.
   let gearContact=false;
   for(let i=groundSamples.length-1;i>=0;i--){
    probe.copy(groundSamples[i]).applyQuaternion(orientation).add(pos);
    const onRunway=landingSurface(probe.x,probe.z);
    // The fuel strip is landable too whenever this flight may stop there (deliveries land away from home).
    const onFuel=!onRunway && game.fuel.open() && game.fuel.onStrip(probe.x,probe.z);
    const landable=onRunway || onFuel;
    const surface=onRunway?pavementY:onFuel?game.fuel.pavementY:Math.max(.12,heightAt(probe.x,probe.z));
    if(probe.y>surface) continue;
    if(landable && i<(waterLanding?4:3)) { gearContact=true; continue; }
    if(state.phase==="approach" || landable) failLanding(landable?(state.pitch<-.20?"Nose strike · flare earlier":"Airframe strike · level your wings"):(waterLanding?"Missed the lake":"Missed the runway"));
    else game.session.impact();
    return;
   }
   if(gearContact && waterLanding && !afloat()){failLanding("Float struck the shore");return;}
   if(gearContact) {tryTouchdown(Math.max(0,(oldPos.y-pos.y)/dt)); return;}
   if(state.phase!=="rings")return;
   if(mission==="slalom"){
     const outside=pos.y>70 || Math.abs(pos.x-terrain.riverCenter(pos.z))>115;
     state.outsideRiverSeconds=outside?state.outsideRiverSeconds+dt:0;
     if(state.outsideRiverSeconds>3){failLanding("Left the river corridor");return;}
   }
   segment.subVectors(pos,oldPos);
   for(let i=0;i<gates.length;i++){
    const g=gates[i];if(g.done || ((school || mission==="trial" || mission==="slalom") && i!==state.nextGate))continue;
    const d0=intersection.subVectors(oldPos,g.center).dot(g.normal),d1=intersection.subVectors(pos,g.center).dot(g.normal);
    if(((school || mission==="trial" || mission==="slalom") && d1<d0) || (d0>0)===(d1>0)||Math.abs(d0-d1)<1e-7)continue;
    intersection.copy(oldPos).addScaledVector(segment,d0/(d0-d1));
    if(intersection.distanceToSquared(g.center)<((ringRadius-ringTube)*g.group.scale.x)**2)clearGate(i);
   }
  }

  return {cruiseSpeed, trimPitch, trimLift, waterRotationSpeed, pos, oldPos, aim, desired, projection,
    powerFactor, loopEntrySpeed, groundHeading, resetLoop, afloat, wind, flightStep};
};
