"use strict";

window.CapeFlight.createScene = function (game) {
  const {T, $, mission, course, snowWeather, graduation} = game.setup;

  const clamp = T.MathUtils.clamp, mix = T.MathUtils.lerp;
  const smooth = (a,b,x) => { const t=clamp((x-a)/(b-a),0,1); return t*t*(3-2*t); };
  const damp = (a,b,k,dt) => mix(a,b,1-Math.exp(-k*dt));
  const rad = Math.PI/180, TAU = Math.PI*2;
  const vec = (x=0,y=0,z=0) => new T.Vector3(x,y,z);
  function seededRandom(seed){
    return ()=>{
      seed=(Math.imul(seed,1664525)+1013904223)>>>0;
      return seed/4294967296;
    };
  }
  const random=seededRandom(course.seed);
  const range=(a,b)=>mix(a,b,random());
  let renderer;
  try {
    renderer = new T.WebGLRenderer({antialias:true,alpha:false,powerPreference:"high-performance"});
  } catch(error) {
    $("hud").innerHTML='<section class="panel"><h2>Graphics unavailable</h2><p>Open this file in a browser with WebGL 2 and hardware acceleration enabled.</p></section>';
    return;
  }
  renderer.setClearColor(course.clearColor);
  $("scene").appendChild(renderer.domElement);
  const scene=new T.Scene(), camera=new T.PerspectiveCamera(49,1,.3,14500);
  scene.fog=new T.FogExp2(course.fog.color,course.fog.density);
  const hemi=new T.HemisphereLight(course.light.sky,course.light.ground,1.55);
  const sun=new T.DirectionalLight(course.light.sun,course.light.intensity);
  sun.position.set(...course.light.position);
  scene.add(hemi,sun);
  const fogCapable=mission==="fog" || graduation;
  const clearHorizon=scene.fog.color.clone(), fieldDaylight=sun.intensity;
  const mistColor=new T.Color("#b4c1c3"), mistBlend={value:0}, mistDensity={value:0};
  const skyColors=course.sky.map(color=>Array.isArray(color)?new T.Color(...color):new T.Color(color));
  const sky=new T.Mesh(new T.SphereGeometry(10500,40,24),new T.ShaderMaterial({
    side:T.BackSide,depthWrite:false,uniforms:{
      mistBlend,mistColor:{value:mistColor},horizon:{value:skyColors[0]},zenith:{value:skyColors[1]}
    },
    vertexShader:'varying vec3 d; void main(){d=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader:`uniform float mistBlend;uniform vec3 mistColor;uniform vec3 horizon;uniform vec3 zenith;varying vec3 d; void main(){ vec3 v=normalize(d);
   ${snowWeather?`
   vec3 c=mix(horizon,zenith,smoothstep(-.03,.67,v.y));
   float ribbons=sin(19.*v.y+5.*v.x-4.*v.z+.7*sin(12.*v.x))+sin(33.*v.y-7.*v.x+8.*v.z)*.4;
   c+=vec3(.034,.03,.031)*ribbons*smoothstep(.035,.4,v.y);
   `:`
   vec3 c=mix(horizon,zenith,smoothstep(-.025,.65,v.y));
   float s=max(0.,dot(v,normalize(vec3(-.78,.42,-.40))));
   c+=vec3(.35,.22,.08)*pow(s,17.); c=mix(c,vec3(1.,.93,.71),smoothstep(.9983,.9987,s)*.94);
   `}
   c=mix(c,mistColor*(1.+.09*max(v.y,0.)),mistBlend);
   gl_FragColor=vec4(c,1.);
   #include <colorspace_fragment>
  }`
  }));
  sky.renderOrder=-10;sky.frustumCulled=false;scene.add(sky);
  const lam=(color,extra={})=>new T.MeshLambertMaterial({color,flatShading:true,...extra});
  const basic=color=>new T.MeshBasicMaterial({color});
  function mesh(geometry,material,parent=scene,x=0,y=0,z=0){
    const m=new T.Mesh(geometry,material);m.position.set(x,y,z);parent.add(m);return m;
  }
  const boxGeo=new T.BoxGeometry(1,1,1);
  function box(parent,material,x,y,z,w,h,l){const m=mesh(boxGeo,material,parent,x,y,z);m.scale.set(w,h,l);return m;}
  function batch(){return {p:[],c:[]};}
  function tri(b,a,d,e,col){ for(const v of [a,d,e]) {b.p.push(v.x,v.y,v.z);b.c.push(col.r,col.g,col.b);} }
  function finishBatch(b,parent=scene){
    const g=new T.BufferGeometry();
    g.setAttribute("position",new T.Float32BufferAttribute(b.p,3));
    g.setAttribute("color",new T.Float32BufferAttribute(b.c,3));
    return mesh(g,new T.MeshBasicMaterial({vertexColors:true,side:T.DoubleSide}),parent);
  }

  return {clamp, mix, smooth, damp, rad, TAU, vec, seededRandom, random, range, renderer, scene, camera,
    sun, fogCapable, clearHorizon, fieldDaylight, mistColor, mistBlend, mistDensity, sky, lam, basic,
    mesh, boxGeo, box, batch, tri, finishBatch};
};
