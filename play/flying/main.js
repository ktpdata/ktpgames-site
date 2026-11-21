"use strict";

window.CapeFlight.ready = (async () => {
  const app = window.CapeFlight;
  const state = {};
  const game = {state};

  const T = window.THREE;
  const $ = id => document.getElementById(id);
  BDR.trackInputKind(document);
  const saves = await app.openSaves();
  const saved = saves.initial;
  const parents=app.createParents(saves,$);
  // Racing's adaptive math record. Saves from before WO-4 kept mathLevel and mathRecent instead.
  state.math = BDR.quiz.normalize(saved.mathProgress ?? {level:saved.mathLevel, recent:saved.mathRecent});
  state.progress = {mathLevel:state.math.level, highestMathLevel:Math.max(saved.highestMathLevel ?? 1, state.math.level),
    correctTotal:saved.correctTotal ?? 0};
  const hash = window.location.hash.slice(1);
  const settings = saved.settings || {};
  const [destinationId,initialDifficulty,initialHandling,requestedMission,routeDirection,requestedAircraft,requestedLayout] =
    hash ? hash.split("/") : [settings.course,settings.difficulty,settings.flightModel,settings.mission,undefined,settings.aircraft];
  const courses=app.courses;
  const schoolCourses=Object.values(courses);
  state.schoolCleared = Number.isInteger(saved.schoolCleared) && saved.schoolCleared >= 0 && saved.schoolCleared <= schoolCourses.length
    ? saved.schoolCleared : 0;
  const missions = {school:"Flight school", fog:"Fog landing", classic:"Ring course", daily:"Daily landing", delivery:"Bush deliveries", trial:"Ghost time trial", slalom:"Canyon run"};
  const fleet={
    // Simulator top speeds in m/s at full power in trimmed, level flight.
    trainer:{name:"Sport Trainer",body:"#bd3923",wing:"#e44f2b",trim:"#963823",roll:1,pitch:1,power:1,simTopSpeed:59,span:6.99,tipY:.21},
    scout:{name:"Bush Scout",body:"#376046",wing:"#dfb34e",trim:"#284538",roll:.78,pitch:.91,power:.90,simTopSpeed:56.4,span:8.25,tipY:1.76},
    biplane:{name:"Stunt Biplane",body:"#913a31",wing:"#c94033",trim:"#6c2a22",roll:1.39,pitch:1.18,power:.96,simTopSpeed:58,span:6.2,tipY:1.86},
    twin:{name:"Coastal Twin",body:"#23435b",wing:"#e3e6da",trim:"#34495d",roll:.74,pitch:.87,power:1.28,simTopSpeed:65,span:9,tipY:.42}
  };
  let mission = Object.hasOwn(missions, requestedMission) ? requestedMission : destinationId?"classic":"school";
  function dailyConditions(date = new Date()) {
    const day = date.toISOString().slice(0,10);
    let bits = Math.floor(Date.parse(day+"T00:00:00Z")/86400000);
    const draw = () => { bits = (Math.imul(bits,1664525)+1013904223)>>>0; return bits/4294967296; };
    draw(); draw();
    const fields=schoolCourses.filter(course=>course.daily);
    const field=fields[Math.floor(draw()*fields.length)].id;
    const direction = Math.floor(draw()*36)*10;
    const knots = 3+Math.floor(draw()*10);
    return {day, field, direction, knots, haze:draw(), light:draw()};
  }
  const daily = dailyConditions();
  function missionDestination(){
    if(mission==="school"){
      const available=Math.min(state.schoolCleared,schoolCourses.length-1);
      const requested=schoolCourses.findIndex(course=>course.id===destinationId);
      return schoolCourses[requested>=0 && requested<=available?requested:available].id;
    }
    if(mission==="daily")return daily.field;
    if(mission==="slalom")return schoolCourses.find(course=>course.slalom).id;
    if(mission==="delivery" && !courses[destinationId]?.deliveryFields?.length)return "island";
    return Object.hasOwn(courses,destinationId)?destinationId:"island";
  }
  const openItem=id=>app.isUnlocked(id,state.progress,saved.learningMode!==false);
  const requiredField=selected=>selected==="daily"?daily.field:selected==="slalom"?schoolCourses.find(c=>c.slalom).id:null;
  if(requiredField(mission) && !openItem(requiredField(mission)))mission="classic";
  const wanted=missionDestination();
  const destination=openItem(wanted)?wanted:"island";
  function requirement(id){
    const [key,value]=app.unlockRules[id];
    return key==="mathLevel"?"Unlocks at math level "+value:
      "Unlocks at "+value+" correct answers ("+Math.max(0,value-state.progress.correctTotal)+" to go)";
  }
  // Courses and planes each get their own padlock line under the pickers.
  function hint(text,target="unlockHint"){
    $(target).textContent=text;$(target).hidden=!text;
  }
  const course=courses[destination];
  const terrain=course.terrain;
  const waterLanding=course.surface==="water", snowWeather=course.weather==="snow";
  const layoutNumber=Number(requestedLayout);
  const layoutIndex=mission==="classic" && Number.isInteger(layoutNumber) && layoutNumber>=1 && layoutNumber<=course.layouts.length?layoutNumber-1:0;
  const stage=schoolCourses.findIndex(course=>course.id===destination);
  const school=mission==="school";
  const courseRank=schoolCourses[stage].rank;
  const graduation=school && stage===schoolCourses.length-1;
  function schoolLabel(index){return (index+1)+"/10 · "+schoolCourses[index].name;}
  const preferredAircraft=Object.hasOwn(fleet,requestedAircraft) && openItem(requestedAircraft)?requestedAircraft:"trainer";
  const standardAircraft=mission==="daily" || mission==="trial";
  const aircraft=standardAircraft?"trainer":preferredAircraft;
  const spec=fleet[aircraft];
  for(const [id,model] of Object.entries(fleet)){
    const option=document.createElement("option");option.value=id;option.textContent=model.name;
    $("aircraft").appendChild(option);
  }
  $("aircraft").value=aircraft;$("aircraft").disabled=standardAircraft;
  $("aircraft").title=standardAircraft?"Standard aircraft for this challenge":spec.name;
  $("aircraft").addEventListener("change",()=>changeDestination(destination,mission,routeDirection,$("aircraft").value));
  $("mission").value=mission;
  document.body.dataset.special=String(mission!=="classic");
  $("missionScore").hidden=mission==="classic";
  $("missionName").textContent=school?"Flight school · "+(stage+1)+"/10":missions[mission];
  $("practice").hidden=mission!=="classic";
  $("mission").addEventListener("change",()=>{
    const selected=$("mission").value;
    const id=selected==="school"?schoolCourses[Math.min(state.schoolCleared,schoolCourses.length-1)].id:destination;
    changeDestination(id,selected);
  });
  document.body.dataset.destination=destination;
  document.body.dataset.weather=course.weather;
  document.body.dataset.water=String(waterLanding);
  for(const [index,course] of schoolCourses.entries()){
    const id=course.id;
    const option=document.createElement("option");option.value=id;option.textContent=school?schoolLabel(index)+(index<state.schoolCleared?" ✓":index>state.schoolCleared?" · Locked":""):course.name;
    option.disabled=(school && index>state.schoolCleared) || (mission==="delivery" && !course.deliveryFields.length);
    $("destination").appendChild(option);
  }
  function updateLocks(){
    for(const [picker,items,target] of [["destination",courses,"unlockHint"],["aircraft",fleet,"aircraftHint"]]){
      let next="";
      for(const option of $(picker).children){
        const id=option.value;
        option.baseLabel ??= option.textContent;
        if(openItem(id)){option.textContent=option.baseLabel;continue;}
        option.textContent="🔒 "+items[id].name+" · "+requirement(id);
        if(!next)next=option.textContent;
      }
      hint(next,target);
    }
  }
  updateLocks();
  $("destination").value=destination;
  $("destination").disabled=mission==="daily" || mission==="slalom";
  $("destination").addEventListener("change",()=>changeDestination($("destination").value));
  if(["easy","normal","hard","expert"].includes(initialDifficulty)) $("difficulty").value=initialDifficulty;
  if(initialHandling==="sim") $("handling").value="sim";
  if(mission==="daily" || mission==="trial"){
    $("handling").value="sim"; $("difficulty").value="normal";
    $("handling").disabled=true; $("difficulty").disabled=true;
  }
  if(mission==="fog"){$("handling").value="sim";$("handling").disabled=true;}
  if(school){
    const displayLevel=stage<2?"easy":stage<6?"normal":stage<8?"hard":"expert";
    $("difficulty").value=displayLevel;$("difficulty").disabled=true;
    if(graduation){$("handling").value="sim";$("handling").disabled=true;}
  }
  let lastSettings=saved.settings;
  function saveSettings(id=destination, selected=mission, model=aircraft){
    const value={course:id, mission:selected, aircraft:model, difficulty:$("difficulty").value, flightModel:$("handling").value};
    if(lastSettings && Object.keys(value).every(key=>lastSettings[key]===value[key]))return;
    lastSettings=value;
    return saves.set("settings",value).then(record=>{
      if(!record && lastSettings===value)lastSettings=null;
    });
  }
  function showLandingBest(){
    const output=$("landingBest");
    output.hidden=mission!=="daily" && mission!=="fog";
    if(output.hidden)return;
    const score=mission==="daily" ? (saved.dailyBest?.day===daily.day?saved.dailyBest.score:null) : saved.fogBest?.[destination];
    output.textContent=(mission==="daily"?"Today's best":"Course best")+" · "+(score==null?"No score yet":score+"/100");
  }
  function saveLandingScore(score){
    if(mission==="daily"){
      const previous=saved.dailyBest?.day===daily.day?saved.dailyBest.score:0;
      saved.dailyBest={day:daily.day,score:Math.max(previous,score)};
      saves.set("dailyBest",{day:daily.day,score});
    }else if(mission==="fog"){
      saved.fogBest ??= {};
      saved.fogBest[destination]=Math.max(saved.fogBest[destination]??0,score);
      saves.set("fogBest",{course:destination,score});
    }
    showLandingBest();
  }
  showLandingBest();
  await saveSettings();
  $("dispatch").hidden=mission!=="delivery";
  $("reverseRoute").addEventListener("click",()=>changeDestination(destination,mission,routeDirection==="return"?"out":"return"));
  $("flightName").textContent=course.name;
  $("flightRegion").textContent="Brain Drain Flying · "+course.region;
  $("scene").setAttribute("aria-label",course.scene);
  document.title="Brain Drain Flying · "+course.name;
  $("layoutRow").hidden=mission!=="classic" || course.layouts.length<2;
  if(!$("layoutRow").hidden){
    course.layouts.forEach((_,i)=>{
      const option=document.createElement("option");
      option.value=String(i+1);option.textContent="Layout "+(i+1);$("layout").appendChild(option);
    });
    $("layout").value=String(layoutIndex+1);
    $("layout").addEventListener("change",()=>changeDestination(destination,mission,routeDirection,preferredAircraft,Number($("layout").value)-1));
  }
  // Reload the same bundled document so the outgoing WebGL world and its resources are released.
  function changeDestination(id,selected=mission,direction,model=preferredAircraft,layout=id===destination && selected===mission?layoutIndex:0){
    const locked=[requiredField(selected),id,model].find(item=>item && !openItem(item));
    if(locked){
      hint("🔒 "+(courses[locked] || fleet[locked]).name+" · "+requirement(locked),fleet[locked]?"aircraftHint":"unlockHint");
      $("aircraft").value=aircraft;$("destination").value=destination;$("mission").value=mission;
      return;
    }
    if(id===destination && selected===mission && !direction && model===preferredAircraft && layout===layoutIndex)return;
    saveSettings(id,selected,model);
    const handling=$("handling").value==="sim"?"sim":"arcade";
    if(layout>0){
      window.location.replace("#"+[id,$("difficulty").value,handling,selected,direction||"out",model,layout+1].join("/"));
      return;
    }
    if(model!=="trainer"){
      window.location.replace("#"+[id,$("difficulty").value,handling,selected,direction||"out",model].join("/"));
      return;
    }
    const suffix=selected==="classic"?(handling==="sim"?"/sim":""):"/"+handling+"/"+selected;
    window.location.replace("#"+id+"/"+$("difficulty").value+suffix+(direction?"/"+direction:""));
  }
  window.addEventListener("hashchange",()=>window.location.reload());

  game.setup = {updateLocks, openItem, fleet, T, $, routeDirection, schoolCourses, saves, saveLandingScore, mission, dailyConditions, daily,
    destination, course, terrain, waterLanding, snowWeather, layoutIndex, stage, school, courseRank,
    graduation, schoolLabel, aircraft, spec, changeDestination};
  game.graphics = app.createScene(game);
  if (!game.graphics) return;
  game.terrain = app.createTerrain(game);
  game.aircraft = app.createAircraft(game);
  game.controls = app.connectControls(game);
  game.missions = app.createMissions(game);
  game.landing = app.createLanding(game);
  game.fuel = app.createFuelStrip(game);
  game.physics = app.createPhysics(game);
  game.effects = app.createEffects(game);
  game.hud = app.createHud(game);

  const {TAU, renderer, scene, camera, fogCapable} = game.graphics;
  const {origin, deliveryAngle, waterMat} = game.terrain;
  const {propellers} = game.aircraft;
  const {host, informHost, setThrottle, touched, pressed, clearInput, checkSteering} = game.controls;
  const {spawn, initialHeading, gates, samplePose} = game.missions;
  const {chooseLevel, endMission, dailyResult, setPhase, positionOnFinal, placeOnFinal,
    beginPractice, failLanding} = game.landing;
  const {cruiseSpeed, trimPitch, pos, flightStep} = game.physics;
  const {snow, updateApproachFog, showAirspeed, syncPose} = game.effects;
  const {hidePanel, panel, markScore, setMode, renderHud, resize} = game.hud;

  function start(){
   if(state.mode!=="ready")return;
   if(mission==="delivery"){loadDelivery();setMode("flying");hidePanel();}
   else if(mission==="daily" || mission==="fog"){
     if(mission==="daily" && daily.day!==dailyConditions().day){window.location.reload();return;}
     gates.forEach(g=>{g.group.visible=false;});
     placeOnFinal();
   }else{setMode("flying");hidePanel();}
   $("start").blur();
  }
  function loadDelivery(){
    state.cargoKg=Number($("cargo").value)||65;state.fuelGal=Number($("fuel").value)||2;state.fuelLoaded=state.fuelGal;
    const angle=origin.angle+deliveryAngle,along=origin.length/2-15;
    pos.set(origin.x+Math.sin(angle)*along,origin.y+.675+1.96,origin.z+Math.cos(angle)*along);
    state.speed=0;state.heading=-angle;state.bank=0;state.pitch=0;state.pathAngle=0;state.throttle=0;setThrottle(0);
    setPhase("departure");state.pathIndex=0;gates.forEach(g=>{g.group.visible=false;});syncPose(0,true);
  }
  function reset(fly=true){
   state.flightUnlocks=[];updateLocks();game.fuel.reset();
   game.physics.wind.set(0,0,0);
   state.passedStage=false;state.missionSeconds=0; state.landingPoints=0;state.outsideRiverSeconds=0;state.ghostIndex=0;
   state.simulation=fogCapable || $("handling").value==="sim";
   $("flightDynamics").hidden=!state.simulation;
   state.pathAngle=0; game.physics.resetLoop();
   state.practice=false; state.landingRetry=false; state.pathIndex=0; setPhase(waterLanding?"takeoff":"rings");
   $("approachGuide").hidden=true; chooseLevel();
   clearInput();setThrottle(55);pos.copy(spawn);state.heading=initialHeading;state.pitch=state.simulation?trimPitch:0;state.bank=0;state.speed=cruiseSpeed;state.throttle=.55;state.score=0;state.elapsed=0;state.crashWait=0;state.toastTime=0;
   if(waterLanding){state.speed=0;state.throttle=0;state.pitch=0;setThrottle(0);}
   const loopHint=$("loopHint");
   loopHint.hidden=["daily","fog","delivery"].includes(mission);
   loopHint.textContent="Loop at "+Math.ceil(game.physics.loopEntrySpeed()*1.94384)+"+ kt · pull up twice and hold";
   gates.forEach(g=>{g.done=false;g.group.visible=true;});markScore();hidePanel();$("toast").hidden=true;
   if(mission==="trial")state.samples=[samplePose(0)];
   if(mission==="delivery")loadDelivery();
   if(mission==="fog"){positionOnFinal();gates.forEach(g=>{g.group.visible=false;});}
   if(fogCapable)updateApproachFog(0,true);
   setMode(fly?"flying":"ready");syncPose(0,true);renderHud();
  }
  function pauseFlight(){if(state.mode==="flying"){clearInput();setMode("paused");panel("Flight paused","Your course is on hold.","Resume flight");}
   else if(state.mode==="paused"){hidePanel();setMode("flying");}}
  function impact(){
   if(mission==="fog"){failLanding("Terrain contact");return;}
   if(mission==="slalom"){failLanding("Canyon contact");return;}
   if(mission==="trial"){endMission("Time trial ended","Terrain contact");return;}
   if(mission==="delivery"){failLanding("Terrain contact");return;}
   clearInput();setMode("crashed");state.crashWait=1.7;$("toast").hidden=true;
   panel(course.impacts[pos.y<5?0:1],waterLanding?"Restarting at the seaplane base…":"Restarting at the first ring…","");
  }

  for(const id of ["cargo","fuel"])$(id).addEventListener("change",()=>reset(false));
  $("handling").addEventListener("change",()=>{saveSettings();reset(false);});
  $("difficulty").addEventListener("change",()=>{saveSettings();chooseLevel();});
  $("practice").addEventListener("click",beginPractice);
  $("newFlight").addEventListener("click",()=>reset(false));
  const brakeButton=$("brake");
  brakeButton.addEventListener("pointerdown",e=>{
   if(state.mode!=="flying"||(state.phase!=="rollout" && state.phase!=="fuelRoll"))return;
   e.preventDefault();brakeButton.setPointerCapture(e.pointerId);state.braking=true;brakeButton.classList.add("held");
  });
  for(const event of ["pointerup","pointercancel","lostpointercapture"])brakeButton.addEventListener(event,()=>{
   state.braking=false;brakeButton.classList.remove("held");
  });
  $("start").addEventListener("click",start);$("restart").addEventListener("click",()=>reset(false));$("pause").addEventListener("click",pauseFlight);
  function panelAction(){
    if(state.mode==="paused"){pauseFlight();return;}
    if(mission==="fog" && state.mode==="complete"){reset(false);start();return;}
    if(state.passedStage && state.mode==="complete" && stage+1<schoolCourses.length){
      changeDestination(schoolCourses[stage+1].id);return;
    }
    reset(false);
  }
  $("panelAction").addEventListener("click",panelAction);
  const keys=new Set(["KeyW","KeyS","KeyA","KeyD","ShiftLeft","ShiftRight"]);
  window.addEventListener("keydown",e=>{
   if(parents.active||e.metaKey||e.ctrlKey||e.altKey||e.target?.tagName==="SELECT")return;
   if(e.code==="Escape" && game.hud.closeMap()){e.preventDefault();return;}
   if(e.code==="Space" && e.target!==$("mapToggle") && state.mode==="flying" && (state.phase==="rollout" || state.phase==="fuelRoll")){e.preventDefault();pressed.add("Space");return;}
   if(keys.has(e.code)){e.preventDefault();if(state.mode==="ready")start();if(state.mode==="flying")pressed.add(e.code);return;}
   if(e.repeat)return;
   if(e.code==="KeyR"){e.preventDefault();reset(false);}
   if(e.code==="KeyP"||e.code==="Escape"){e.preventDefault();pauseFlight();}
   if(e.code==="Enter" && !(e.target instanceof HTMLButtonElement)){if(state.mode==="ready")start();else if(state.mode==="paused")pauseFlight();else if(state.mode==="complete")panelAction();}
  });
  window.addEventListener("keyup",e=>pressed.delete(e.code));
  for(const button of document.querySelectorAll("[data-key]")){
   const code=button.dataset.key;
   button.addEventListener("pointerdown",e=>{e.preventDefault();button.setPointerCapture(e.pointerId);if(state.mode==="ready")start();if(state.mode==="flying"){touched.add(code);button.classList.add("on");}});
   const release=()=>{touched.delete(code);button.classList.remove("on");};
   button.addEventListener("pointerup",release);button.addEventListener("lostpointercapture",release);button.addEventListener("pointercancel",release);
  }
  function suspend(){clearInput();if(state.mode==="flying")pauseFlight();}
  window.addEventListener("blur",suspend);document.addEventListener("visibilitychange",()=>{if(document.hidden)suspend();});
  window.addEventListener("resize",resize);
  renderer.domElement.addEventListener("webglcontextlost",e=>{e.preventDefault();clearInput();setMode("unavailable");panel("Graphics interrupted","Reload the page to restart the simulator.","");});
  state.missionSeconds = 0;
  state.last = 0;
  let simClock = 0;
  let hudClock = 0;
  function frame(now){
   requestAnimationFrame(frame);
   const realDt=state.last?Math.max(0,(now-state.last)/1000):0;
   const dt=Math.min(realDt,.12);state.last=now;
   if(!state.sceneActive||document.hidden||state.mode==="unavailable")return;
   if(state.mode==="flying"){
    checkSteering(now);
    state.missionSeconds+=realDt;
    if(mission==="daily" && state.missionSeconds>=60)dailyResult(0,"Time expired before touchdown");
    const steps=Math.max(1,Math.ceil(dt/(1/90)));for(let i=0;i<steps;i++)flightStep(dt/steps);
   }else if(state.mode==="crashed"){state.crashWait-=dt;if(state.crashWait<=0){if(state.landingRetry)placeOnFinal();else reset(true);}}
   if(state.mode==="ready"||state.mode==="flying"){for(const prop of propellers)prop.rotation.z=(prop.rotation.z+dt*(55+state.throttle*61))%TAU;simClock+=dt;waterMat.uniforms.time.value=simClock;if(snow)snow.material.uniforms.weatherTime.value=simClock;}
   if(state.toastTime>0&&state.mode==="flying"){state.toastTime-=dt;if(state.toastTime<=0)$("toast").hidden=true;}
   if(fogCapable && (state.mode==="ready" || state.mode==="flying"))updateApproachFog(dt);
   syncPose(dt);showAirspeed(dt);hudClock+=dt;if(hudClock>.07){renderHud();hudClock=0;}
   renderer.render(scene,camera);
  }
  game.session = {start, reset, pauseFlight, impact, panelAction, suspend, frame};
  window.capeFlight.setMotion(false);resize();reset(false);requestAnimationFrame(frame);
  if(mission==="trial"){
    if(host)informHost({action:"loadGhost",course:destination});
    else game.missions.acceptGhost(await saves.readWebsiteGhost(destination));
  }

  return game;
})();
