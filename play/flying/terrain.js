"use strict";

window.CapeFlight.createTerrain = function (game) {
  const state = game.state;

  const {T, routeDirection, mission, course, terrain, waterLanding, snowWeather} = game.setup;
  const {clamp, mix, smooth, TAU, vec, random, range, scene, mistDensity, lam, basic, mesh, boxGeo,
    box, batch, tri, finishBatch} = game.graphics;

  function coneHeight(x,z,cx,cz,rx,rz,peak,tilt) {
    const a=(x-cx)/rx, b=(z-cz)/rz;
    return peak*Math.max(0,1-Math.sqrt(a*a+b*b+tilt*a*b));
  }

  function coast(x,z){
    let best=-1e5;
    for(const [cx,cz,rx,rz,phase] of terrain.forms){
      const dx=(x-cx)/rx,dz=(z-cz)/rz,theta=Math.atan2(dz,dx);
      const edge=1+.089*Math.sin(3*theta+phase)+.075*Math.sin(5*theta-phase)+.038*Math.cos(9*theta+phase);
      best=Math.max(best,(edge-Math.hypot(dx,dz))*Math.min(rx,rz));
    }
    return best;
  }
  const {runwayName,homeStrip,deliveryFields}=course;
  const returning=routeDirection==="return";
  const origin=deliveryFields[returning?1:0],arrival=deliveryFields[returning?0:1];
  const deliveryAngle=returning?Math.PI:0;
  const strip=mission==="delivery"?{...arrival,angle:arrival.angle+deliveryAngle}:homeStrip;
  const deliveryName=mission==="delivery"?origin.name+" → "+arrival.name:"";
  state.cargoKg = 65;
  state.fuelGal = 2;
  function weightRatio(){return mission==="delivery"?1+(state.cargoKg+state.fuelGal*2.72)/900:1;}
  function stripXZ(x,z,field=strip){const dx=x-field.x,dz=z-field.z,c=Math.cos(field.angle),s=Math.sin(field.angle);return [dx*c-dz*s,dx*s+dz*c];}
  // The river cuts through ledges of sandstone, shale and pale rim limestone.
  function canyonHeight(x,z) {
    const offset=x-terrain.riverCenter(z), side=Math.sign(offset);
    const riverWidth=terrain.riverWidth+5*Math.sin(z*.008);
    const bank=Math.abs(offset)-riverWidth;
    if(bank<0) return -2.0+bank*.17;
    const cuts=33*Math.sin(z*.008+side*1.7)+18*Math.sin(z*.021+side);
    const innerWidth=110+25*Math.sin(z*.004+side)+35*(1-smooth(-1500,-680,z));
    const wall=Math.max(0,bank-innerWidth-cuts);
    const ribs=20*Math.sin(z*.016+x*.004)+10*Math.sin(z*.047-x*.009);
    let height=1.4+Math.min(bank,175)*.22+4*Math.sin(z*.013)*smooth(0,40,bank);
    for(const [edge,high,depth] of terrain.terraces){
      height+=high*smooth(edge,edge+depth,wall);
    }
    height+=ribs*smooth(10,140,wall);
    // Broad buttes and interrupted ridgelines rise beyond the inner gorge.
    const ridge=Math.sin(x*.008+z*.004)+.73*Math.cos(z*.006-x*.003)+.25*Math.cos(z*.018);
    height+=smooth(360,500,wall)*(15+106*smooth(.22,.92,ridge)+57*smooth(.82,1.18,ridge));
    const [sx,sz]=stripXZ(x,z,homeStrip);
    // The airstrip sits on a river terrace which continues under the final approach.
    const pad=Math.max(Math.abs(sx)-58, -sz-homeStrip.length/2-35, sz-980);
    return mix(homeStrip.y,height,smooth(0,45,pad));
  }

  function canyonFace(a,b,c){
    const y=(a.y+b.y+c.y)/3;
    normal.subVectors(b,a).cross(other.subVectors(c,a)).normalize();
    // Keep the underlying rock continuous across each triangle. Bedding and snow
    // are evaluated per pixel so a layer runs through every face at the same height.
    const colors=course.ground;
    let tint=colors.rock;
    if(y<.8) tint=y<-3?colors.deep:colors.river;
    else if(y<9) tint=colors.bank;
    else if(y<36 && normal.y>.9) tint=colors.shelf;
    col.set(tint).multiplyScalar(.66+.30*Math.max(0,normal.dot(light))+.07*random());
    tri(land,a,b,c,col);
  }
  function addRockLayers(ground){
    // Fine bedding runs horizontally through the cliff faces between modeled terraces.
    ground.material.onBeforeCompile=shader=>{
      shader.vertexShader="varying vec3 strataPoint;\n"+shader.vertexShader.replace("#include <begin_vertex>",
        "#include <begin_vertex>\nstrataPoint=position;");
      shader.fragmentShader="varying vec3 strataPoint;\n"+shader.fragmentShader.replace("#include <color_fragment>", `
      #include <color_fragment>
      vec3 n=normalize(cross(dFdx(strataPoint),dFdy(strataPoint)));
      float h=strataPoint.y+5.0*sin(strataPoint.z*.003)+2.5*sin(strataPoint.x*.009);
      float beds=.5+.5*sin(h*.68+.45*sin(h*.25));
      float slope=abs(n.y);
      float cliffs=(1.-smoothstep(.63,.91,slope))*smoothstep(7.,24.,h);
      float layer=fract(h/86.);
      vec3 mineral=mix(vec3(.82,.67,.66),vec3(1.14,.99,.87),smoothstep(.17,.22,layer));
      mineral=mix(mineral,vec3(.73,.54,.55),smoothstep(.54,.60,layer));
      mineral=mix(mineral,vec3(1.19,1.22,1.14),smoothstep(.82,.87,layer));
      diffuseColor.rgb*=mix(vec3(1.),mineral,cliffs)*(1.-cliffs*(.10*beds+.08*pow(beds,6.)));
      float shelf=smoothstep(.77,.94,slope);
      float localSnow=smoothstep(65.,190.,h+16.*sin(strataPoint.x*.013)+13.*sin(strataPoint.z*.021));
      float snowCover=shelf*localSnow;
      diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.73,.77,.81)*(.77+.20*slope),snowCover*.95);
    `);
    };
  }

  function lakeHeight(x,z) {
    const [rx,rz]=terrain.radii, [cx,cz,ix,iz]=terrain.island;
    const theta=Math.atan2(z/rz,x/rx);
    const shore=rx*(Math.hypot(x/rx,z/rz)-1-.07*Math.sin(3*theta)-.05*Math.cos(5*theta));
    const ridge=110*Math.sin(z*.004+x*.004)+55*Math.cos(x*.008-z*.005);
    let h=shore<0?Math.max(terrain.floor,shore*.26):shore*.30+smooth(70,500,shore)*(135+ridge);
    // A small pine-covered island sits inside the circuit, west of the landing lane.
    const island=1-Math.hypot((x-cx)/ix,(z-cz)/iz);
    return Math.max(h,-55+island*94);
  }
  // Shape and collision sample the same height field, including the graded final approach.
  function landscapeHeight(x,z){
    const ripple=Math.sin(x*.011+z*.006)*Math.sin(z*.009-x*.004);
    const r=Math.hypot(x,z);
    let h;
    switch(terrain.type){
      case "fjord":{
        const shore=Math.max(Math.abs(x-60*Math.sin(z*.002))-terrain.halfWidth-70*Math.cos(z*.003),Math.abs(z)-terrain.halfLength);
        return Math.max(terrain.floor,shore*.23)+smooth(0,465,shore)*(terrain.rimHeight+105*Math.cos(z*.005)+58*ripple);
      }
      case "reef":{
        const [rx,rz]=terrain.radii;
        const radius=Math.hypot(x/rx,z/rz),angle=Math.atan2(z/rz,x/rx);
        const rim=1+.055*Math.sin(angle*5)+.04*Math.cos(angle*8);
        const crest=24+12*Math.sin(angle*6)+7*Math.cos(angle*13);
        return Math.max(terrain.floor,crest-Math.abs(radius-rim)*terrain.rimSlope-38*smooth(.87,1,Math.cos(angle*3+.7)));
      }
      case "mesas":{
        h=terrain.base+9*ripple;
        for(const [cx,cz,w,d,height] of terrain.mesas){
          const edge=1-Math.hypot((x-cx)/w,(z-cz)/d)+.05*ripple;
          h+=height*(.36*smooth(-.4,.14,edge)+.48*smooth(.12,.24,edge)+.16*smooth(.35,.43,edge));
        }
        break;
      }
      case "volcano":{
        const [cx,cz,rx,rz]=terrain.coast, [vx,vz,vrx,vrz]=terrain.cone;
        const coastDist=1-Math.hypot((x-cx)/rx,(z-cz)/rz)+.05*ripple;
        const cone=Math.hypot((x-vx)/vrx,(z-vz)/vrz);
        h=Math.max(-125,Math.min(26,coastDist*320))+Math.max(0,1-cone)*terrain.summit-terrain.craterDepth*(1-smooth(.06,.26,cone));
        h+=10*ripple*smooth(0,.18,coastDist);
        break;
      }
      case "cliffs":{
        const edge=terrain.coastX+112*Math.sin(z*.0025)+42*Math.sin(z*.007)-x;
        h=mix(-70,40+14*ripple+terrain.inland[2]*smooth(terrain.inland[0],terrain.inland[1],edge),smooth(-38,42,edge));
        break;
      }
      case "hills":
        h=terrain.base+(1+Math.sin(x*.0042+z*.0036))*(21+13*Math.cos(z*.003-x*.004))+16*ripple+terrain.upland[2]*smooth(terrain.upland[0],terrain.upland[1],r);
        break;
      case "basin":
        h=terrain.base+7*ripple+smooth(terrain.rim[0],terrain.rim[1],Math.abs(x+.22*z))*(terrain.rim[2]+90*Math.cos(z*.0031)+27*ripple);
        break;
    }
    const [side,along]=stripXZ(x,z,homeStrip);
    const margin=Math.max(Math.abs(side)-53,-along-homeStrip.length/2-36,along-930);
    const runwayHeight=mix(homeStrip.y,h,smooth(0,85,margin));
    // Keep space for a banked base-to-final turn, especially on the Tuscan hillside.
    const funnelWidth=65+clamp(along,0,1150)*.36;
    const funnelEdge=Math.max(Math.abs(side)-funnelWidth,-along,along-1230);
    const ceiling=homeStrip.y+Math.max(0,along-homeStrip.length/2)*.043;
    return mix(Math.min(runwayHeight,ceiling),runwayHeight,smooth(0,100,funnelEdge));
  }
  function islandHeight(x,z){
    const d=coast(x,z);
    if(d<=0)return Math.max(-120,d*.56);
    let p=0;
    for(const args of terrain.peaks)p=Math.max(p,coneHeight(x,z,...args));
    const roll=15+10*Math.sin(x*.011+z*.007)+7*Math.sin(z*.019-x*.008);
    const crags=(Math.sin(x*.043+z*.017)*6+Math.cos(z*.047-x*.021)*5+Math.sin(z*.08+x*.071)*2.4)*smooth(45,170,p);
    let h=Math.max(.3,(Math.min(d*.39,17)+roll*smooth(3,100,d)+p+crags)*smooth(0,45,d));
    const [sx,sz]=stripXZ(x,z,homeStrip);
    const pad=Math.max(Math.abs(sx)-homeStrip.width*.5-28,Math.abs(sz)-homeStrip.length*.5-38);
    return mix(homeStrip.y,h,smooth(0,65,pad));
  }
  const heightGenerator={island:islandHeight,lake:lakeHeight,gorge:canyonHeight}[terrain.type] || landscapeHeight;
  function terrainElevation(x,z){
    let ground=heightGenerator(x,z);
    if(course.edgeBlend){
      const edge=Math.min(x-xmin,z-zmin,xmin+(nx-1)*step-x,zmin+(nz-1)*step-z);
      ground=mix(course.outsideHeight,ground,smooth(0,course.edgeBlend,edge));
    }
    return ground;
  }
  const {step,xmin,zmin,nx,nz}=course.grid;
  const heights=new Float32Array(nx*nz);
  for(let j=0;j<nz;j++)for(let i=0;i<nx;i++)heights[i+j*nx]=terrainElevation(xmin+i*step,zmin+j*step);

  // Stamp each delivery strip into the collision and rendering grid after base sampling.
  function gradeDeliveryStrip(field){
    const halfWidth=field.width/2+20, halfLength=field.length/2+25, shoulder=70;
    const reach=Math.hypot(halfWidth+shoulder,halfLength+shoulder);
    const firstRow=Math.max(0,Math.ceil((field.z-reach-zmin)/step));
    const lastRow=Math.min(nz-1,Math.floor((field.z+reach-zmin)/step));
    const firstCol=Math.max(0,Math.ceil((field.x-reach-xmin)/step));
    const lastCol=Math.min(nx-1,Math.floor((field.x+reach-xmin)/step));
    for(let row=firstRow;row<=lastRow;row++){
      const z=zmin+row*step;
      for(let column=firstCol;column<=lastCol;column++){
        const x=xmin+column*step;
        const [cross,along]=stripXZ(x,z,field);
        const edge=Math.max(Math.abs(cross)-halfWidth,Math.abs(along)-halfLength);
        if(edge>=shoulder)continue;
        // Blend with the original double-precision height before the final Float32 rounding.
        heights[row*nx+column]=edge<=0?field.y:mix(field.y,terrainElevation(x,z),smooth(0,shoulder,edge));
      }
    }
  }
  if(mission==="delivery")for(const field of deliveryFields)gradeDeliveryStrip(field);
  function heightAt(x,z){
    const u=(x-xmin)/step,v=(z-zmin)/step,i=Math.floor(u),j=Math.floor(v);
    if(i<0||i>=nx-1||j<0||j>=nz-1)return course.outsideHeight;
    const a=heights[i+j*nx],b=heights[i+1+j*nx],c=heights[i+(j+1)*nx],d=heights[i+1+(j+1)*nx];
    const s=u-i,t=v-j;
    return s+t<=1?a+(b-a)*s+(c-a)*t:d+(c-d)*(1-s)+(b-d)*(1-t);
  }
  const land=batch(),col=new T.Color(),normal=vec(),other=vec();
  const light=vec(-.66,1,.4).normalize();
  const seas=course.sea, groundColors=course.ground;
  function face(a,b,c){
    if(course.groundStyle==="strata"){canyonFace(a,b,c);return;}
    if(a.y<-92&&b.y<-92&&c.y<-92)return;
    const y=(a.y+b.y+c.y)/3,x=(a.x+b.x+c.x)/3,z=(a.z+b.z+c.z)/3;
    normal.subVectors(b,a).cross(other.subVectors(c,a)).normalize();
    let tint;
    const n=random(),variation=Math.sin(x*.015+z*.013)+Math.sin(z*.028-x*.006)*.4;
    if(y<0)tint=seas[y<-48?0:y<-22?1:y<-7?2:3];
    else if(course.groundStyle==="landscape"){
      const [sand,rock,cap,green]=groundColors;
      const slope=normal.y,form=terrain.type;
      if(form==="mesas")tint=y<42?green:slope>.93?cap:Math.floor((y+5*variation)/23)%3===0?sand:rock;
      if(form==="fjord")tint=y>280+28*variation?cap:slope<.76?rock:y<38?sand:green;
      if(form==="reef")tint=y<8?sand:y<14?cap:green;
      if(form==="volcano")tint=y>255 && Math.cos((x+z)*.021)>.80?cap:y>90?rock:sand;
      if(form==="cliffs")tint=slope<.79?(Math.floor(y/12)%2?rock:cap):y<8?sand:green;
      if(form==="hills")tint=Math.sin(x*.009+z*.004)+.7*Math.cos(z*.012)>.45?sand:green;
      if(form==="basin")tint=y>116?(slope>.86?cap:rock):variation>.36?sand:green;
    }
    else if(y<5.3)tint=n<.6?groundColors.sand[0]:groundColors.sand[1];
    else if(y>244+Math.sin(x*.024+z*.012)*16 && (y>277||normal.y>.78))tint=n>.35?groundColors.snow[0]:groundColors.snow[1];
    else if(y>130+variation*20&&(normal.y<.89||y>186))tint=n<.32?groundColors.rock[0]:n<.65?groundColors.rock[1]:groundColors.rock[2];
    else if(y>89+variation*24)tint=n<.6?groundColors.scrub[0]:groundColors.scrub[1];
    else tint=groundColors.grass[clamp(Math.floor((variation+1.5)*1.25+n),0,4)];
    col.set(tint);
    col.multiplyScalar(y<0?.97+n*.035:.62+.49*Math.max(0,normal.dot(light))+.055*n);
    tri(land,a,b,c,col);
  }
  for(let j=0;j<nz-1;j++)for(let i=0;i<nx-1;i++){
    const x=xmin+i*step,z=zmin+j*step,k=i+j*nx;
    const a=vec(x,heights[k],z),b=vec(x+step,heights[k+1],z),c=vec(x,heights[k+nx],z+step),d=vec(x+step,heights[k+nx+1],z+step);
    face(a,c,b);face(d,b,c);
  }
  const ground=finishBatch(land);
  if(course.groundStyle==="strata")addRockLayers(ground);
  const seabed=mesh(new T.PlaneGeometry(25000,25000),basic(course.seabed.color),scene,0,course.seabed.y,0);seabed.rotation.x=-Math.PI/2;
  // Glints lie on the water surface. Their falloff hides subpixel waves at distance.
  const waterMat=new T.ShaderMaterial({transparent:true,depthWrite:false,uniforms:{time:{value:0},mistDensity,glintColor:{value:new T.Color(...course.glint)}},
   vertexShader:'varying vec3 world;void main(){world=(modelMatrix*vec4(position,1.)).xyz;gl_Position=projectionMatrix*viewMatrix*vec4(world,1.);}',
   fragmentShader:`varying vec3 world;uniform float time;uniform float mistDensity;uniform vec3 glintColor;
 float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
 void main(){vec2 uv=world.xz;float row=floor(uv.y/7.);
 float t=uv.x/53.+hash(vec2(row,2.))+.026*time;vec2 id=vec2(floor(t),row);float h=hash(id);
 float wave=abs(fract(uv.y/7.+.035*sin(uv.x*.14+row+time*.6))-.5);
 float glint=(1.-smoothstep(.018,.14,wave))*(1.-smoothstep(.012,.04+.24*h,abs(fract(t)-.5)))*smoothstep(.52,.86,h);
 float dst=length(cameraPosition-world);float f=exp(-dst*.0016);
 vec3 c=mix(glintColor,vec3(.82,.95,.87),glint);
 gl_FragColor=vec4(c,(.12+.48*glint*f)*exp(-dst*dst*mistDensity*mistDensity));
 #include <colorspace_fragment>
 }`});
  const [waterWidth,waterLength,waterZ]=course.waterPlane;
  const water=mesh(new T.PlaneGeometry(waterWidth,waterLength),waterMat,scene,0,.12,waterZ);
  water.rotation.x=-Math.PI/2;water.visible=course.waterVisible;water.renderOrder=2;
  const field=new T.Group();field.position.set(homeStrip.x,homeStrip.y+.4,homeStrip.z);field.rotation.y=homeStrip.angle;scene.add(field);
  const asphalt=lam("#545d57"),paint=basic("#ede6c8"),gravel=lam("#b1a785");
  if(waterLanding){
    const coral=lam("#ee7342"), buoyWhite=lam("#fff4c9");
    const buoyBody=new T.ConeGeometry(1.15,2.8,8),band=new T.CylinderGeometry(.78,.94,.38,8);
    for(const z of [1490,1380,1270,1160,homeStrip.z+235,homeStrip.z+115,homeStrip.z-5,homeStrip.z-125,homeStrip.z-235]){
      for(const side of [-1,1]){
        mesh(buoyBody,coral,scene,side*33,1.3,z);
        mesh(band,buoyWhite,scene,side*33,.88,z);
      }
    }
    // A timber dock sits against the western shore, with a red boathouse at its head.
    const dockZ=1320;
    let shoreX=0;while(shoreX>-1500 && heightAt(shoreX,dockZ)<2)shoreX-=4;
    const timber=lam("#906442"),pilings=lam("#514032"),siding=lam("#ad4e3a"),roof=lam("#395258");
    box(scene,timber,shoreX+34,1.15,dockZ,76,.65,5);
    box(scene,timber,shoreX+70,1.15,dockZ+4,6,.65,21);
    for(let i=4;i<73;i+=12)for(const side of [-1,1])box(scene,pilings,shoreX+i,.25,dockZ+side*2,1.1,4,1.1);
    const groundY=heightAt(shoreX-11,dockZ);
    box(scene,siding,shoreX-11,groundY+4,dockZ,17,8,14);
    for(const side of [-1,1]){
      const half=box(scene,roof,shoreX-11+side*4.6,groundY+9.3,dockZ,10.3,1,17);
      half.rotation.z=-side*.25;
    }
  }else{
    box(field,gravel,0,-.1,0,homeStrip.width+8,.28,homeStrip.length+8);
    box(field,asphalt,0,.1,0,homeStrip.width,.35,homeStrip.length);
    for(let z=-182;z<=182;z+=30)box(field,paint,0,.31,z,1,.05,13);
    for(const end of [-1,1])for(let i=-3;i<=3;i++)box(field,paint,i*3,.31,end*204,1.3,.06,18);
    for(const side of [-1,1])box(field,paint,side*15.4,.31,0,.6,.06,440);
    const timber=lam("#a9704e"),roof=lam("#4f6662"),ivory=lam("#e6d6ae"),doors=lam("#4e605b");
    for(let i=0;i<3;i++){
      let z=-75+i*47;box(field,timber,-37,4.5,z,19,9,29);box(field,doors,-27.4,3.6,z, .3,6.4,20);
      for(const side of [-1,1]){const r=box(field,roof,-37+side*5,10.3,z,11.2,1.1,31);r.rotation.z=-side*.24;}
    }
    box(field,ivory,-37,8,95,7,16,7);box(field,roof,-37,15,95,11,3.6,10);box(field,ivory,-37,17.3,95,13,1,12);
  }
  if(mission==="delivery")for(const site of deliveryFields){
    const apron=new T.Group();apron.position.set(site.x,site.y+.4,site.z);apron.rotation.y=site.angle;scene.add(apron);
    box(apron,gravel,0,.1,0,site.width,.35,site.length);
    for(let z=-site.length/2+10;z<site.length/2;z+=24){
      for(const side of [-1,1])box(apron,paint,side*(site.width/2-1),.35,z,1,.25,5);
    }
    box(apron,lam("#a74d37"),-25,2.5,5,10,5,12);
  }
  function nearDeliveryStrip(x,z){
    return mission==="delivery" && deliveryFields.some(field=>{
      const [side,along]=stripXZ(x,z,field);return Math.abs(side)<42 && Math.abs(along)<field.length/2+35;
    });
  }
  // Instanced forest and ground shadows keep the draw count independent of tree count.
  const trees=[],stones=[];
  for(let i=0;i<12500;i++){
   const [xmin,xmax,zmin,zmax]=course.treeArea;
   const x=range(xmin,xmax),z=range(zmin,zmax),y=heightAt(x,z);
   if(course.treeDensity===0 || (course.treeDensity!==null && random()>course.treeDensity))continue;
   if(course.vegetation==="snowPine" ? y<325 || Math.abs(heightAt(x+5,z)-y)>3 || random()>.58 : y<7||y>192)continue;
   const [sx,sz]=stripXZ(x,z,homeStrip);
   if(course.clearApproach && Math.abs(sx)<64 && sz>-270 && sz<930)continue;
   if((sx>-59&&sx<29&&Math.abs(sz)<252) || nearDeliveryStrip(x,z))continue;
   const noise=Math.sin(x*.019+z*.012)+Math.sin(z*.027-x*.011)+Math.cos(x*.052)*.4;
   if(noise<-.54||random()<smooth(115,200,y)*.67)continue;
   trees.push({x,y,z,h:(course.vegetation==="snowPine"?range(5,13):range(6,17)*(1-smooth(130,220,y)*.35)),a:range(0,TAU),shade:random()});
  }
  for(let i=0;i<800;i++){
   let x=range(-1300,1240),z=range(-1430,1060),y=heightAt(x,z);
   if(nearDeliveryStrip(x,z))continue;
   if(terrain.type==="gorge" ? y>7 && Math.abs(x-terrain.riverCenter(z))<190 && Math.abs(stripXZ(x,z)[0])>42 : (y>-9&&y<8)||y>100)stones.push({x,y,z,s:range(2,7),a:range(0,TAU)});
  }
  const dummy=new T.Object3D();
  function instances(geo,items,setup){
   const obj=new T.InstancedMesh(geo,lam("#ffffff"),items.length);
   items.forEach((p,i)=>{dummy.position.set(0,0,0);dummy.scale.set(1,1,1);dummy.rotation.set(0,0,0);const c=setup(p);dummy.updateMatrix();obj.setMatrixAt(i,dummy.matrix);obj.setColorAt(i,col.set(c));});
   obj.computeBoundingSphere();scene.add(obj);
  }
  const vegetation=course.vegetation;
  if(vegetation==="palms"){
    instances(new T.CylinderGeometry(.45,.68,1,6),trees,p=>{
      dummy.position.set(p.x,p.y+p.h/2,p.z);dummy.scale.y=p.h;return "#93764a";
    });
    const frond=new T.BufferGeometry();
    frond.setAttribute("position",new T.Float32BufferAttribute([0,0,0,-.16,.07,.45,0,.16,.46,.16,.07,.45,0,-.28,1],3));
    frond.setIndex([0,1,2,0,2,3,1,4,2,2,4,3]);frond.computeVertexNormals();
    for(let i=0;i<6;i++)instances(frond,trees,p=>{
      dummy.position.set(p.x,p.y+p.h,p.z);dummy.scale.setScalar(p.h*.70);
      dummy.rotation.y=p.a+TAU*i/6;return i%2?"#59834c":"#789a4d";
    });
  }else if(["juniper","heath","scrub"].includes(vegetation)){
    instances(new T.IcosahedronGeometry(1,0),trees,p=>{
      const s=p.h*(vegetation==="juniper"?.29:.15);
      dummy.scale.set(s*1.3,s,s);dummy.rotation.y=p.a;dummy.position.set(p.x,p.y+s*.62,p.z);
      return p.shade>.5?"#758152":"#666f51";
    });
  }else if(vegetation==="cypress"){
    instances(new T.SphereGeometry(1,6,5),trees,p=>{
      dummy.scale.set(p.h*.14,p.h*.57,p.h*.14);dummy.position.set(p.x,p.y+p.h*.54,p.z);
      return p.shade>.5?"#526444":"#455e42";
    });
  }else for(const upper of [false,true])instances(new T.ConeGeometry(1,1,5),trees,p=>{
   const h=p.h*(upper?.64:.74);dummy.position.set(p.x,p.y+p.h*(upper?.69:.43),p.z);dummy.rotation.y=p.a;
   dummy.scale.set(p.h*(upper?.19:.26),h,p.h*(upper?.19:.26));if(vegetation==="snowPine")return upper?"#d0d6d8":"#515b60";return p.shade<.33?(upper?"#416b4c":"#365b47"):p.shade<.7?(upper?"#537751":"#416548"):(upper?"#688351":"#4e714d");
  });
  instances(new T.DodecahedronGeometry(1,0),stones,p=>{dummy.position.set(p.x,p.y+.45,p.z);dummy.rotation.set(.14,p.a,.17);dummy.scale.set(p.s*1.4,p.s*.7,p.s);return course.stoneColor;});
  function placeLandmarks(){
    const white=lam("#eee7d6"),brick=lam("#b5543a"),slate=lam("#384653"),wood=lam("#80583f");
    function cottage(x,z,size){
      const y=heightAt(x,z);
      box(scene,white,x,y+size*.36,z,size*1.35,size*.72,size);
      for(const side of [-1,1]){
        const roof=box(scene,brick,x+side*size*.36,y+size*.85,z,size*.8,size*.12,size*1.19);
        roof.rotation.z=-side*.34;
      }
    }
    if(course.landmark==="lighthouse"){
      const x=252,z=360,y=heightAt(x,z);
      for(let i=0;i<5;i++)mesh(new T.CylinderGeometry(5.5-i*.40,5.9-i*.40,8,12),i%2?brick:white,scene,x,y+4+8*i,z);
      mesh(new T.CylinderGeometry(5.8,5.8,1.3,12),slate,scene,x,y+40,z);
      mesh(new T.CylinderGeometry(3.9,3.9,6,8),basic("#ffe7a6"),scene,x,y+43,z);
      mesh(new T.ConeGeometry(5.8,4,8),slate,scene,x,y+48,z);
      cottage(x-26,z+18,12);
    }else if(course.landmark==="vineyards"){
      const vines=[];
      for(const [cx,cz] of [[-590,325],[540,350],[450,-290],[-410,-540]]){
        cottage(cx-78,cz-65,16);
        for(let row=-7;row<=7;row++)for(let post=-6;post<=6;post++){
          const x=cx+row*11+post*3,z=cz+post*13;
          vines.push({x,z,y:heightAt(x,z)});
        }
      }
      instances(boxGeo,vines,p=>{dummy.position.set(p.x,p.y+1.4,p.z);dummy.scale.set(3,2.8,12);dummy.rotation.y=.23;return "#697644";});
    }else if(course.landmark==="balloons"){
      const colors=["#c6513f","#edb64d","#468c88","#da8249"];
      [[480,190,-180],[-550,162,-260],[710,254,-650],[-830,225,-845],[250,255,-920],[-415,122,530]].forEach(([x,y,z],i)=>{
        const outline=[[0,3],[.15,7],[.42,18],[.69,22],[.88,18],[1,8]];
        for(let band=1;band<outline.length;band++){
          const [a,ra]=outline[band-1],[b,rb]=outline[band];
          mesh(new T.CylinderGeometry(rb,ra,(b-a)*48,12),band%2?lam(colors[i%4]):white,scene,x,y+(b+a)*24,z);
        }
        for(const side of [-1,1])box(scene,wood,x+side*2.1,y-3,z,.36,7,.36);
        box(scene,wood,x,y-8,z,5,4,5);
      });
    }else if(course.landmark==="ice"){
      const ice=[];
      for(let i=0;i<115;i++){
        const z=range(-1490,1440),x=(i%2?1:-1)*range(610,850);
        if(heightAt(x,z)<-.5)ice.push({x,z,r:range(3,14),a:range(0,TAU)});
      }
      instances(new T.IcosahedronGeometry(1,0),ice,p=>{dummy.position.set(p.x,1,p.z);dummy.scale.set(p.r*1.7,p.r*.72,p.r);dummy.rotation.y=p.a;return "#c5e5e9";});
    }
  }
  if(course.landmark)placeLandmarks();
  const clouds=[],cloudGeo=new T.IcosahedronGeometry(1,1),cloudParts=[];
  function cloud(x,y,z,s){
   for(let i=0;i<9;i++){
   const t=i/8-.5,mid=1-Math.abs(t)*1.35;
   cloudParts.push({x:x+t*s*2.7,y:y+s*(.10+mid*.25+range(-.07,.08)),z:z+range(-.35,.38)*s,
    w:range(.38,.78)*s,h:(.18+mid*range(.24,.46))*s,d:range(.3,.64)*s,a:range(0,TAU)});
   }
  }
  if(!snowWeather)[[-950,360,-900,100],[430,370,-1190,105],[1160,430,-475,130],[-1850,490,-2300,201],[-240,535,-3350,230],[1380,590,-2680,206],[-1360,375,530,127],[870,345,1180,92],[-1780,520,1940,158],[40,570,2920,233]].forEach(a=>cloud(...a));
  if(cloudParts.length)instances(cloudGeo,cloudParts,p=>{dummy.position.set(p.x,p.y,p.z);dummy.scale.set(p.w,p.h,p.d);dummy.rotation.y=p.a;return "#fff8e8";});

  return {runwayName, origin, arrival, deliveryAngle, strip, deliveryName, weightRatio, stripXZ, heightAt,
    waterMat, field, paint};
};
