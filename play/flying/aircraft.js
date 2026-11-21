"use strict";

window.CapeFlight.createAircraft = function (game) {
  const {T, waterLanding, aircraft, spec} = game.setup;
  const {mix, TAU, vec, scene, lam, mesh} = game.graphics;

  // Local aircraft axis: the nose points toward negative Z.
  const plane=new T.Group();plane.rotation.order="YXZ";scene.add(plane);
  const floatTrainer=waterLanding && aircraft==="trainer";
  const red=lam(floatTrainer?"#246176":spec.body),redTop=lam(floatTrainer?"#eeb741":spec.wing);
  const cream=lam("#fff0c9"),redDark=lam(floatTrainer?"#204a5c":spec.trim);
  const glass=lam("#33565a"),glassLit=lam("#648887"),canopyFrame=lam("#d6b98c"),black=lam("#343d39"),metal=lam("#a4a598");
  function tube(parent,a,b,r,mat,r2=r,segments=8){
   const axis=b.clone().sub(a),m=mesh(new T.CylinderGeometry(r2,r,axis.length(),segments),mat,parent);
   m.position.copy(a).add(b).multiplyScalar(.5);m.quaternion.setFromUnitVectors(vec(0,1,0),axis.normalize());return m;
  }
  function poly(parent,vertices,indices,mat){
   const g=new T.BufferGeometry();g.setAttribute("position",new T.Float32BufferAttribute(vertices.flatMap(v=>[v.x,v.y,v.z]),3));g.setIndex(indices);g.computeVertexNormals();
   return mesh(g,mat,parent);
  }
  for(const m of [red,redTop,cream,redDark,glass,glassLit,canopyFrame,metal])m.side=T.DoubleSide;
  const fuselage=[[-4.42,.52,.51,-.06],[-4.1,.78,.73,-.04],[-3.0,.91,.88,0],[-1.1,.93,.94,.0],[.8,.84,.82,.015],[2.7,.55,.60,.07],[4.8,.26,.34,.11],[5.58,.085,.15,.13]];
  if(aircraft==="twin")for(const station of fuselage)station[1]*=1.28;
  function skinPoint(st,a,mul=1){return vec(st[1]*Math.cos(a)*mul,st[3]+st[2]*Math.sin(a)*mul,st[0]);}
  function hullBand(stations,lo,hi,n,mat,mul=1){
   const v=[],ix=[];for(const s of stations)for(let k=0;k<=n;k++)v.push(skinPoint(s,mix(lo,hi,k/n),mul));
   for(let j=0;j<stations.length-1;j++)for(let k=0;k<n;k++){const i=j*(n+1)+k;ix.push(i,i+1,i+n+1,i+1,i+n+2,i+n+1);}
   poly(plane,v,ix,mat);
  }
  hullBand(fuselage,0,TAU,16,redTop);
  for(const a of [0,Math.PI])hullBand(fuselage,a-.13,a+.13,2,cream,1.027);
  // A greenhouse canopy with divided panes and a distinct aft window.
  const canopy=[[-2.12,.68,.67],[-1.53,.74,1.49],[-.12,.74,1.59],[.65,.69,1.45],[1.34,.63,.72]];
  if(aircraft==="twin")for(const station of canopy)station[1]*=1.23;
  function glassRow(s){const [z,w,h]=s;return [vec(-w,.51,z),vec(-w*.84,h-.12,z),vec(-w*.54,h,z),vec(w*.54,h,z),vec(w*.84,h-.12,z),vec(w,.51,z)];}
  for(let j=0;j<canopy.length-1;j++){
   const a=glassRow(canopy[j]),b=glassRow(canopy[j+1]);
   for(let k=0;k<5;k++)poly(plane,[a[k],a[k+1],b[k],b[k+1]],[0,1,2,1,3,2],k===2?glassLit:glass);
  }
  for(const s of canopy){const row=glassRow(s);for(let i=0;i<5;i++)tube(plane,row[i],row[i+1],.037,canopyFrame,undefined,5);}
  for(const k of [1,4])for(let i=0;i<canopy.length-1;i++)tube(plane,glassRow(canopy[i])[k],glassRow(canopy[i+1])[k],.038,cream);
  function airfoil(side,stations,materials){
   stations.forEach((s,j)=>{
    if(j===0)return;const last=stations[j-1];
    function section(p){const [x,lead,trail,y]=p;return [vec(side*x,y,lead),vec(side*x,y+.13,lead+(trail-lead)*.31),vec(side*x,y-.025,trail),vec(side*x,y-.105,lead+(trail-lead)*.27)];}
    const a=section(last),b=section(s),mat=materials[j-1]||redTop;
    for(let k=0;k<4;k++)poly(plane,[a[k],a[(k+1)%4],b[k],b[(k+1)%4]],[0,1,2,1,3,2],mat);
    if(j===stations.length-1)poly(plane,b,[0,1,2,0,2,3],mat);
   });
  }
  const wing=[[.65,-1.78,1.0,-.13],[3.95,-1.67,.90,.02],[4.18,-1.65,.89,.035],[4.51,-1.63,.86,.05],[4.70,-1.62,.85,.06],[6.54,-1.48,.69,.17],[6.88,-1.26,.46,.20],[6.99,-.95,.17,.21]];
  const scoutWing=[[0,-1.65,1.04,1.62],[5.95,-1.65,1.03,1.69],[6.25,-1.64,1.03,1.70],[7.9,-1.56,.89,1.74],[8.25,-1.26,.59,1.76]];
  const biplaneWing=[[.1,-1.45,.86,-.36],[4.88,-1.25,.99,-.28],[5.24,-1.19,.99,-.26],[5.88,-.98,.85,-.24]];
  const twinWing=[[.75,-1.82,1.69,.02],[3.05,-1.79,1.66,.11],[6.95,-1.21,1.35,.30],[7.3,-1.15,1.32,.33],[8.72,-.77,1.13,.41],[9,-.43,.88,.42]];
  for(const s of [-1,1]){
   if(aircraft==="scout"){
     airfoil(s,scoutWing,[redTop,cream,redTop,red]);
     for(const z of [-1.17,.63])tube(plane,vec(s*.72,-.56,-.1),vec(s*4.78,1.63,z),.066,metal);
   }else if(aircraft==="biplane"){
     airfoil(s,biplaneWing,[red,cream,red]);
     const upper=biplaneWing.map(([x,lead,trail,y])=>[x*1.054,lead-.51,trail-.51,y+2.10]);
     airfoil(s,upper,[redTop,cream,redTop]);
     for(const x of [1.04,4.65]){
       for(const z of [-1.52,.48])tube(plane,vec(s*x,-.22,-.15),vec(s*(x+.20),1.81,z),.055,cream);
     }
   }else if(aircraft==="twin"){
     airfoil(s,twinWing,[redTop,redTop,red,redTop,red]);
   }else airfoil(s,wing,[redTop,cream,redTop,cream,redTop,cream,cream]);
   airfoil(s,[[.12,3.53,5.12,.28],[1.95,3.95,5.18,.34],[2.36,4.21,5.10,.35],[2.5,4.50,4.9,.35]],[red,cream,cream]);
   if(waterLanding){
     const center=s*1.57;
     for(const z of [-1.3,1.40]){
       tube(plane,vec(s*.69,-.34,z),vec(center,-1.37,z),.078,metal);
       tube(plane,vec(s*.69,-.30,z+.67),vec(center,-1.37,z),.05,black);
     }
     // Chined aluminum hull, raised bow and a step in the keel.
     const sections=[[-4.05,.04,-1.34,-1.49],[-3.10,.38,-1.29,-1.83],[-1.5,.53,-1.30,-2.14],
        [.45,.54,-1.32,-2.17],[.49,.51,-1.32,-1.99],[2.35,.40,-1.37,-1.93],[3.23,.17,-1.40,-1.69]];
     const hull=sections.map(([z,w,deck,keel])=>[vec(center-w*.82,deck,z),vec(center+w*.82,deck,z),
        vec(center+w,keel+.15,z),vec(center,keel,z),vec(center-w,keel+.15,z)]);
     for(let j=1;j<hull.length;j++)for(let k=0;k<5;k++){
       const next=(k+1)%5;
       poly(plane,[hull[j-1][k],hull[j-1][next],hull[j][k],hull[j][next]],[0,1,2,1,3,2],k===0?cream:k===1||k===4?red:metal);
     }
     for(const end of [hull[0],hull[hull.length-1]])poly(plane,end,[0,1,2,0,2,3,0,3,4],metal);
   }else{
     tube(plane,vec(s*.8,-.28,-1.30),vec(s*1.15,-1.61,-1.07),.075,black);
     tube(plane,vec(s*.72,-.28,-.16),vec(s*1.15,-1.61,-1.07),.055,metal);
     const radius=aircraft==="scout"?.57:.41;
     const wheel=mesh(new T.CylinderGeometry(radius,radius,aircraft==="scout"?.37:.23,12),black,plane,s*1.15,-1.96+radius,-1.07);wheel.rotation.z=Math.PI/2;
     const hub=mesh(new T.CylinderGeometry(.19,.19,.24,12),metal,plane,s*1.15,-1.96+radius,-1.07);hub.rotation.z=Math.PI/2;
   }
  }
  const fin=[vec(0,.27,3.49),vec(0,1.20,4.17),vec(0,2.04,4.66),vec(0,2.08,4.99),vec(0,1.91,5.17),vec(0,.39,5.44),vec(0,.23,5.37)];
  for(const side of [-1,1]){
   const verts=fin.map(p=>vec(p.x+side*.071,p.y,p.z));poly(plane,verts,[0,1,6,1,2,6,2,3,6,3,4,6,4,5,6],red);
   poly(plane,[vec(side*.078,1.18,4.18),vec(side*.078,1.48,4.34),vec(side*.078,1.48,5.23),vec(side*.078,1.18,5.29)],[0,1,2,0,2,3],cream);
  }
  for(let i=0;i<fin.length;i++){const a=fin[i],b=fin[(i+1)%fin.length];poly(plane,[vec(-.071,a.y,a.z),vec(.071,a.y,a.z),vec(-.071,b.y,b.z),vec(.071,b.y,b.z)],[0,1,2,1,3,2],redDark);}
  if(!waterLanding){
    tube(plane,vec(0,-.07,4.82),vec(0,-.56,4.95),.055,black);
    const tailWheel=mesh(new T.CylinderGeometry(.20,.20,.14,9),black,plane,0,-.57,4.96);tailWheel.rotation.z=Math.PI/2;
  }
  function propeller(x,y,z,blades,scale){
    const hub=new T.Group();hub.position.set(x,y,z);hub.scale.setScalar(scale);plane.add(hub);
    for(let i=0;i<blades;i++){
      const blade=new T.Group();blade.rotation.z=i*TAU/blades+.24;hub.add(blade);
      const paddle=mesh(new T.SphereGeometry(1,8,6),black,blade,0,.94,0);paddle.scale.set(.125,.99,.045);
      const tip=mesh(new T.SphereGeometry(1,8,5),cream,blade,0,1.80,0);tip.scale.set(.075,.16,.052);
    }
    return hub;
  }
  const propellers=[];
  if(aircraft==="twin"){
    const nose=mesh(new T.SphereGeometry(1,12,8),red,plane,0,-.04,-4.26);nose.scale.set(.72,.62,.62);
    for(const side of [-1,1]){
      const x=side*3.05;
      const nacelle=mesh(new T.SphereGeometry(1,12,8),red,plane,x,.09,-.70);nacelle.scale.set(.57,.61,2.42);
      tube(plane,vec(x,.09,-3.21),vec(x,.09,-2.65),.23,metal,.52,12);
      propellers.push(propeller(x,.09,-3.13,3,.84));
    }
  }else{
    for(const [z1,z2,r1,r2,m] of [[-4.48,-4.16,.64,.79,black],[-4.6,-4.45,.55,.65,metal],[-4.94,-4.59,.09,.47,cream]])
      tube(plane,vec(0,-.04,z1),vec(0,-.04,z2),r1,m,r2,16);
    propellers.push(propeller(0,-.04,-4.67,2,1));
  }
  const insignia=document.createElement("canvas");insignia.width=128;insignia.height=128;
  const badgeCtx=insignia.getContext("2d");
  badgeCtx.fillStyle="#f5e4b8";badgeCtx.beginPath();badgeCtx.arc(64,64,58,0,TAU);badgeCtx.fill();
  badgeCtx.fillStyle="#354f4e";badgeCtx.beginPath();badgeCtx.arc(64,64,49,0,TAU);badgeCtx.fill();
  badgeCtx.fillStyle="#f5e4b8";badgeCtx.beginPath();for(let i=0;i<10;i++){let a=i*Math.PI/5-Math.PI/2,r=i%2?16:37;badgeCtx[i?"lineTo":"moveTo"](64+r*Math.cos(a),64+r*Math.sin(a));}badgeCtx.fill();
  const decalTex=new T.CanvasTexture(insignia);decalTex.colorSpace=T.SRGBColorSpace;
  const decalMat=new T.MeshBasicMaterial({map:decalTex,transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-1});
  const decal=mesh(new T.PlaneGeometry(.97,.97),decalMat,plane,-spec.span*.79,spec.tipY+.03,-.51);decal.rotation.x=-Math.PI/2;

  return {plane, poly, propellers};
};
