"use strict";

window.CapeFlight.createEffects = function (game) {
  const state = game.state;

  const {T, mission, daily, course, waterLanding, snowWeather, school, graduation} = game.setup;
  const {clamp, mix, smooth, damp, vec, random, range, scene, camera, sun, clearHorizon,
    fieldDaylight, mistColor, mistBlend, mistDensity, sky} = game.graphics;
  const {heightAt} = game.terrain;
  const {plane, poly} = game.aircraft;
  const {updateGhost} = game.missions;
  const {courseLevels, finalIndex} = game.landing;
  const {pos, aim, desired} = game.physics;

  // Thin air trails pass at the edges of the chase camera only at high airspeed.
  const reducedMotion=window.matchMedia("(prefers-reduced-motion: reduce)");
  // Weather stays anchored to the canyon as the chase camera banks through it.
  // Wrap one volume of flakes around the camera so the whole gorge needs one draw call.
  function buildSnow() {
    const count=6500, position=new Float32Array(count*3), seeds=new Float32Array(count);
    for(let i=0;i<count;i++){
      position[i*3]=range(-60,60); position[i*3+1]=range(-36,36);
      position[i*3+2]=range(-60,60); seeds[i]=random();
    }
    const geometry=new T.BufferGeometry();
    geometry.setAttribute("position",new T.BufferAttribute(position,3));
    geometry.setAttribute("flakeSeed",new T.BufferAttribute(seeds,1));
    const material=new T.ShaderMaterial({
      transparent:true, depthWrite:false,
      uniforms:{weatherTime:{value:0},wind:{value:1},pixelScale:{value:400}},
      vertexShader:`
      attribute float flakeSeed;
      uniform float weatherTime,wind,pixelScale;
      varying float fade;
      void main(){
        vec3 size=vec3(120.,72.,120.);
        float rate=.82+.68*flakeSeed;
        vec3 drift=vec3(wind*(weatherTime*5.2+1.4*sin(weatherTime*.65+flakeSeed*18.)),
                        -weatherTime*7.1,-weatherTime*1.2)*rate;
        vec3 rel=mod(position+drift-cameraPosition+size*.5,size)-size*.5;
        vec4 eye=viewMatrix*vec4(cameraPosition+rel,1.);
        float d=length(rel);
        fade=(1.-smoothstep(34.,58.,d))*smoothstep(2.8,8.,d)*(.68+.30*flakeSeed);
        gl_Position=projectionMatrix*eye;
        gl_PointSize=clamp(pixelScale*(.085+.12*flakeSeed)/max(2.,-eye.z),2.0,9.0);
      }`,
      fragmentShader:`
      varying float fade;
      void main(){
        vec2 q=gl_PointCoord-.5;
        q.x+=q.y*.50;
        float a=1.-smoothstep(.19,.53,length(vec2(q.x*1.28,q.y)));
        if(a*fade<.025)discard;
        gl_FragColor=vec4(.93,.965,1.,a*fade);
        #include <colorspace_fragment>
      }`
    });
    const flakes=new T.Points(geometry,material);
    flakes.frustumCulled=false; flakes.renderOrder=4;scene.add(flakes);
    return flakes;
  }
  const snow=snowWeather?buildSnow():null;
  function updateApproachFog(dt,snap=false){
    // The canyon stays visible for the rings. The bank of fog thickens on the final leg.
    const desired=mission==="fog"?1:state.phase==="approach"?(state.pathIndex===finalIndex?1:.50):state.phase==="rollout"?1:0;
    const amount=snap?desired:damp(mistBlend.value,desired,.60,dt);
    const density=state.level===courseLevels.easy?.0048:state.level===courseLevels.normal?.0063:state.level===courseLevels.hard?.0077:.009;
    const base=graduation?.00185:course.fog.approach;
    mistBlend.value=amount;mistDensity.value=density*amount;
    scene.fog.density=mix(base,density,amount);
    scene.fog.color.copy(clearHorizon).lerp(mistColor,amount);
    sun.intensity=mix(fieldDaylight,.60,amount);
  }
  function setWeather(){
    if(mission==="fog"){updateApproachFog(0,true);return;}
    if(mission==="daily"){
      scene.fog.density=course.fog.daily[0]+daily.haze*course.fog.daily[1];
      sun.intensity=1.1+daily.light;
      if(snow){
        const count=Math.round(2800+daily.haze*3400);
        snow.geometry.setDrawRange(0,reducedMotion.matches?Math.round(count*.38):count);
        snow.material.uniforms.wind.value=daily.knots/8;
      }
      return;
    }
    if(!snow)return;
    const easy=state.level===courseLevels.easy, hard=school || state.level===courseLevels.hard || state.level===courseLevels.expert;
    const count=easy?3600:hard?6500:5000;
    snow.geometry.setDrawRange(0,reducedMotion.matches?Math.round(count*.38):count);
    snow.material.uniforms.wind.value=easy?.70:hard?1.55:1.05;
    scene.fog.density=easy?.00125:hard?.00185:.0015;
  }

  const trails=Array.from({length:30},(_,i)=>({
   x:(i%2?1:-1)*range(3.8,11.8),y:range(-5,5),offset:range(0,64)
  }));
  let airDistance=0;
  const trailPositions=new Float32Array(trails.length*6);
  const trailGeometry=new T.BufferGeometry();
  trailGeometry.setAttribute("position",new T.BufferAttribute(trailPositions,3).setUsage(T.DynamicDrawUsage));
  const trailLines=new T.LineSegments(trailGeometry,new T.LineBasicMaterial({color:0xf3f5e9,transparent:true,opacity:0,depthWrite:false}));
  trailLines.frustumCulled=false;camera.add(trailLines);scene.add(camera);
  function showAirspeed(dt){
   const rush=smooth(49,78,state.speed);
   const strength=reducedMotion.matches?0:rush;
   const targetFov=49+strength*7;
   if(Math.abs(camera.fov-targetFov)>.012){camera.fov=damp(camera.fov,targetFov,3,dt);camera.updateProjectionMatrix();}
   trailLines.visible=strength>.04 && state.phase!=="rollout" && state.mode==="flying";
   if(!trailLines.visible)return;
   airDistance=(airDistance+state.speed*dt)%64;
   trailLines.material.opacity=.30*strength;
   trails.forEach((t,i)=>{
     const z=(airDistance+t.offset)%64-65, k=i*6;
     trailPositions[k]=trailPositions[k+3]=t.x; trailPositions[k+1]=trailPositions[k+4]=t.y;
     trailPositions[k+2]=z;trailPositions[k+5]=z+1.0+2.8*strength;
   });
   trailGeometry.attributes.position.needsUpdate=true;
  }
  // Two fading fans of foam follow the floats while they are on the step.
  const wake=waterLanding?new T.Group():null;
  if(wake){
    scene.add(wake);
    const foam=new T.MeshBasicMaterial({color:0xe5f5ee,transparent:true,opacity:.5,depthWrite:false,side:T.DoubleSide});
    for(const side of [-1,1]){
      const x=side*1.57;
      const fan=poly(wake,[vec(x,0,1),vec(x+side*.85,0,6),vec(x+side*6,0,25),vec(x+side*3.5,0,20)],[0,1,2,0,2,3],foam);
      fan.renderOrder=3;
    }
  }
  const chaseRotation=new T.Euler(0,0,0,"YXZ");
  const chaseOrientation=new T.Quaternion();
  function syncPose(dt,snap=false){
   updateGhost();
   if(wake){
     wake.visible=(state.phase==="takeoff"||state.phase==="rollout") && state.speed>1;
     wake.position.set(pos.x,.16,pos.z);wake.rotation.y=-state.heading;wake.scale.z=clamp(state.speed/25,.05,1.4);
   }
   plane.position.copy(pos);plane.rotation.set(state.pitch,-state.heading,-state.bank,"YXZ");
   const aspect=camera.aspect,dist=aspect<1?32/aspect**.36:22,viewHeight=dist*.32;
   // Follow the local up vector through vertical and inverted flight. Keep the
   // horizon steady in ordinary banked turns and follow a full inverted rollout.
   const bankFollow=mix(.12,1,smooth(.9,Math.PI,Math.abs(state.bank)));
   chaseOrientation.setFromEuler(chaseRotation.set(state.pitch,-state.heading,-state.bank*bankFollow));
   desired.set(0,viewHeight,dist).applyQuaternion(chaseOrientation).add(pos);
   desired.y=Math.max(desired.y,Math.max(0,heightAt(desired.x,desired.z))+2);
   if(snap)camera.position.copy(desired);else camera.position.lerp(desired,1-Math.exp(-6.2*dt));
   aim.set(0,1.4,-18).applyQuaternion(chaseOrientation).add(pos);
   camera.up.set(0,1,0).applyQuaternion(chaseOrientation);camera.lookAt(aim);camera.updateMatrixWorld();sky.position.copy(camera.position);
  }

  return {snow, updateApproachFog, setWeather, showAirspeed, syncPose};
};
