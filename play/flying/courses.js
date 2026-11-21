// Distances and elevations are in metres. Layout points use [x, altitude, z].
(() => {
"use strict";
const landGrid = {step:24, xmin:-1704, zmin:-1704, nx:147, nz:139};
const waterGrid = {step:24, xmin:-2304, zmin:-2688, nx:193, nz:225};
const landMap = {left:-1450, top:-1470, width:2960, height:2960};
const daylight = {sky:0xfff9e9, ground:0xb7baab, sun:0xffe6b9, intensity:1.95, position:[-.70,1,.52]};
const ocean = ["#379aa8","#45afaf","#67bdb1","#9bd0b8"];
const hillside = {
  sand:["#e6d394","#dece97"], snow:["#e9e7d3","#dae0d2"],
  rock:["#89938b","#92988c","#9ba092"], scrub:["#839674","#8e9f75"],
  grass:["#9eb474","#a5b77b","#92ab70","#8ba26b","#a5b780"]
};
const terrainChart = [[-.4,42,77,72],[12,118,141,110],[67,101,127,96],[130,110,135,100],[205,127,146,110],[Infinity,151,161,128]];
const waterChart = {...landMap, height:3230};
const regionalPattern = [
  {label:"Downwind", pattern:[420,220,104]}, {label:"Base turn", pattern:[405,850,88]},
  {label:"Turn final", final:[920,78]}, {touchdown:true}
];
const lakePattern = [
  {label:"West shore", point:[-578,99,-65]}, {label:"Long point", point:[-551,82,570]},
  {label:"Turn to channel", final:[870,68]}, {touchdown:true}
];
const homeStrip = (x,z,y,angle,length=452,width=34) => ({x,z,y,angle,length,width});
const waterBase = {
  surface:"water", grid:waterGrid, map:waterChart, homeStrip:homeStrip(0,-110,0,0,480,66),
  spawn:{point:[0,2.29,1480]}, approach:lakePattern, treeArea:[-1680,1680,-2020,2020],
  impacts:["Shore impact","Shore impact"]
};
const landDefaults = {
  surface:"land", weather:"clear", grid:landGrid, map:landMap, chartColors:terrainChart,
  seed:23711, clearColor:0xc5dedb, sky:[[.631,.780,.755],[.195,.552,.699]],
  fog:{color:0xc2d9d4,density:.00025,approach:.00025,daily:[.00020,.00065]},
  light:daylight, sea:ocean, ground:hillside, groundStyle:"hillside", waterVisible:true,
  waterPlane:[25000,25000,0], glint:[.16,.52,.55], seabed:{color:"#3999a8",y:-90},
  ringPaint:{gold:"#ffab26",cream:"#fff2ba",lit:true}, vegetation:"pine",
  treeArea:[-1400,1260,-1420,1030], treeDensity:null, clearApproach:false,
  stoneColor:"#899689", edgeBlend:0, outsideHeight:-120,
  impacts:["Water impact","Ground contact"], approach:regionalPattern, spawn:{behind:195,clearance:65},
  faceFirst:true, hasLeaderboard:false, deliveryFields:[],
  // Fuel stops use the home strip (the water channel on water courses): the stop line crosses its middle
  // (along = 0, metres from the centre) and the pump stands beyond the edge on pumpSide, away from the hangars.
  fuelStrip:{strip:"home", stop:0, pumpSide:1}
};
function define(options) {
  return {...landDefaults, scene:"Flight over "+options.name, ...options};
}
// Procedural landscapes share the same grading, vegetation and map-edge rules.
function landscape(options) {
  const {coast=false, sky, haze, ground, sea=ocean, ...settings}=options;
  return define({
    sky, ground, sea, groundStyle:"landscape", clearApproach:true, edgeBlend:180,
    outsideHeight:coast?-120:0, waterVisible:coast,
    seabed:{color:coast?sea[0]:ground[3], y:coast?-92:-.2},
    fog:{...landDefaults.fog,color:sky[0],density:haze,approach:haze}, ...settings
  });
}
// Both canyon circuits follow the same river as the terrain mesh and delivery strips.
function riverCenter(z) {
  const t=Math.min(1,Math.max(0,(z+1440)/740));
  const bend=t*t*(3-2*t);
  const meander=150*Math.sin((z-1300)*.0028)+51*Math.sin((z-1300)*.0052);
  return (1-bend)*-100 + bend*meander;
}
function riverPoint(z,altitude,offset=0) {
  return [riverCenter(z)+offset,altitude,z];
}
const courses = {
  island:define({
    id:"island", daily:true, name:"Cape Aidan", region:"Island", rank:"Beginner",
    terrain:{type:"island", forms:[[-280,-100,630,1080,.4],[756,-793,360,650,2.2],[553,500,118,207,2.9],[-1090,-995,285,430,5.1],[1000,335,120,145,.8],[-860,650,120,188,1.7]],
      peaks:[[-494,-320,385,430,387,.68],[-377,-572,307,282,304,-.55],[-678,-87,210,299,261,-.7],[-370,156,302,320,193,.4],[-531,364,185,290,125,-.7],[774,-800,240,397,249,.5],[670,-1035,227,350,234,-.6],[-1070,-1060,195,341,183,.4],[555,468,85,145,67,.6]]},
    runwayName:"Runway 35", homeStrip:homeStrip(-122,385,24,.19),
    spawn:{point:[0,118,958]}, faceFirst:false, hasLeaderboard:true,
    approach:[{label:"Coast leg",point:[285,127,615]},{label:"Base turn",point:[273,96,1140]},
      {label:"Turn final",final:[870,57]},{touchdown:true}],
    deliveryFields:[
      {name:"South Cove",x:-68,z:820,y:22,width:26,length:305,angle:0.1},
      {name:"North Point",x:55,z:-705,y:30,width:24,length:300,angle:-0.11}
    ],
    layouts:[[
      [0,118,788], [24,129,522], [133,145,265],
      [288,154,35], [411,160,-201], [389,160,-475],
      [125,180,-660], [-150,195,-652], [-279,211,-407],
      [-159,161,-113]
    ]]
  }),
  tuscany:landscape({
    id:"tuscany", name:"Tuscan Hills", region:"Vineyard country", rank:"Beginner",
    terrain:{type:"hills", base:24, upland:[650,1200,100]}, landmark:"vineyards",
    vegetation:"cypress", treeDensity:0.19, seed:1173,
    sky:["#f2ddad","#87b4c3"], haze:0.00036, ground:["#c7ab77","#998364","#e1d0a5","#a3ac6e"],
    runwayName:"Valle Verde", homeStrip:homeStrip(-90,327,41,0.23),
    layouts:[[
      [32,124,788], [137,128,539], [239,137,279],
      [288,143,9], [231,145,-261], [65,157,-477],
      [-197,163,-538], [-424,146,-421], [-545,132,-188],
      [-481,127,64]
    ]]
  }),
  balloon:landscape({
    id:"balloon", name:"Balloon Valley", region:"New Mexico dawn", rank:"Student",
    terrain:{type:"basin", base:24, rim:[530,1320,197]}, landmark:"balloons",
    light:{...daylight, sun:0xffd39a, position:[-1,.44,-.35]},
    vegetation:"scrub", treeDensity:0.09, seed:1289,
    sky:["#f5c69d","#a299c2"], haze:0.00042, ground:["#d9ac83","#ad846c","#e7b997","#baa077"],
    runwayName:"Fiesta Field", homeStrip:homeStrip(23,335,26,-0.12),
    layouts:[[
      [-65,113,806], [-151,121,544], [-244,129,283],
      [-260,143,19], [-162,149,-229], [34,158,-405],
      [289,167,-452], [512,150,-322], [589,134,-86],
      [490,122,154]
    ]]
  }),
  sedona:landscape({
    id:"sedona", name:"Sedona Red Rocks", region:"Sandstone country", rank:"Student",
    terrain:{type:"mesas", base:24, mesas:[[-780,-690,330,360,320],[790,-450,430,280,350],[-720,390,195,240,184],[-125,-1040,280,190,225],[400,-800,110,100,130]]},
    vegetation:"juniper", treeDensity:0.16, seed:601,
    sky:["#f4d6ad","#73a8c7"], haze:0.00034, ground:["#d59a72","#ad6354","#e6b082","#97634d"],
    runwayName:"Oak Creek Strip", homeStrip:homeStrip(-70,345,28,0.12),
    layouts:[[
      [10,111,805], [80,115,520], [179,120,235],
      [256,135,-48], [268,143,-330], [156,150,-568],
      [-66,153,-699], [-302,153,-634], [-420,141,-408],
      [-362,134,-120]
    ]]
  }),
  atoll:landscape({
    id:"atoll", name:"Pearl Atoll", region:"Coral lagoon", rank:"Intermediate",
    terrain:{type:"reef", radii:[1050,1820], floor:-82, rimSlope:220}, ...waterBase, coast:true,
    vegetation:"palms", treeDensity:0.48, seed:823,
    sky:["#d0efe4","#63bfda"], haze:0.00021, ground:["#f4dc9a","#c7b488","#e9e4c5","#8db975"],
    runwayName:"Pearl Lagoon",
    sea:["#12677c","#218f96","#53c8b4","#abeee0"],
    layouts:[[
      [0,50,1000], [54,63,736], [190,73,509],
      [377,83,294], [516,88,39], [540,92,-247],
      [421,92,-502], [191,86,-668], [-73,78,-667],
      [-290,72,-488]
    ]]
  }),
  lake:define({
    id:"lake", name:"Aidan’s Lake", region:"Seaplane base", rank:"Intermediate",
    ...waterBase, scene:"Floatplane on Aidan’s Lake", runwayName:"Water channel",
    terrain:{type:"lake", radii:[940,1640], island:[-248,240,124,195], floor:-56},
    sea:["#286288","#337c9a","#549aac","#81b4b5"], outsideHeight:350,
    faceFirst:false, hasLeaderboard:true,
    layouts:[[
      [0,48,1000], [44,74,725], [176,95,460],
      [350,112,195], [485,121,-90], [480,128,-410],
      [312,131,-660], [45,119,-765], [-210,110,-705],
      [-388,99,-480]
    ]]
  }),
  headland:landscape({
    id:"headland", name:"Lighthouse Head", region:"Atlantic headlands", rank:"Advanced",
    terrain:{type:"cliffs", coastX:250, inland:[430,1150,95]}, landmark:"lighthouse", coast:true,
    vegetation:"heath", treeDensity:0.08, seed:1069,
    sky:["#e9d4b1","#879bb4"], haze:0.00051, ground:["#b9ab88","#698178","#cec8aa","#8a9f74"],
    runwayName:"Keeper’s Field", homeStrip:homeStrip(-266,360,38,0.14),
    sea:["#344e65","#41687a","#61899a","#9cb5b1"],
    layouts:[[
      [-55,109,830], [42,114,564], [173,113,325],
      [316,110,81], [388,121,-184], [330,127,-443],
      [155,132,-627], [-87,133,-680], [-302,125,-571],
      [-399,116,-330]
    ]]
  }),
  caldera:landscape({
    id:"caldera", name:"Cinder Island", region:"Volcanic coast", rank:"Advanced",
    terrain:{type:"volcano", coast:[-100,-170,1250,1100], cone:[-650,-500,680,740], summit:540, craterDepth:290}, coast:true,
    vegetation:"bare", treeDensity:0, seed:947,
    sky:["#ecc9ae","#9691aa"], haze:0.0004, ground:["#826e69","#554f53","#b58770","#73716a"],
    runwayName:"Cinder Airfield", homeStrip:homeStrip(135,344,21,-0.09),
    sea:["#304356","#375569","#557b84","#8ca5a1"],
    layouts:[[
      [123,113,798], [31,130,535], [-118,153,303],
      [-192,170,51], [-138,183,-196], [46,190,-371],
      [299,176,-445], [526,144,-359], [628,130,-130],
      [566,112,114]
    ]]
  }),
  fjord:landscape({
    id:"fjord", name:"Glacier Sound", region:"Alpine fjord", rank:"Expert",
    terrain:{type:"fjord", halfWidth:745, halfLength:1790, floor:-85, rimHeight:350}, ...waterBase, coast:true,
    landmark:"ice", light:{...daylight, sky:0xdbeaff, sun:0xedf2ff},
    vegetation:"spruce", treeDensity:0.77, seed:717,
    sky:["#c3dbe0","#7399bb"], haze:0.00069, ground:["#8b969a","#586976","#eff6f4","#809995"],
    runwayName:"Glacier Narrows",
    sea:["#264961","#33647a","#498599","#80b6be"],
    layouts:[[
      [0,50,995], [48,74,708], [110,90,425],
      [140,104,139], [110,120,-147], [27,120,-417],
      [-111,110,-668], [-300,104,-766], [-455,100,-615],
      [-475,95,-345]
    ]]
  }),
  canyon:define({
    id:"canyon", daily:true, name:"Cape Rioghan", region:"Snowstorm", rank:"Expert",
    scene:"Flight through a snowy Grand Canyon", weather:"snow",
    terrain:{type:"gorge", riverCenter, riverWidth:25, terraces:[[0,57,45],[68,66,35],[139,49,48],[215,71,34],[304,67,61]]},
    grid:{step:20,xmin:-2040,zmin:-4500,nx:205,nz:365}, outsideHeight:350,
    map:{left:-820,top:-2800,width:1640,height:4450},
    chartColors:[[1,74,136,147],[70,126,91,77],[155,148,99,81],[240,164,120,98],[325,183,151,133],[Infinity,205,202,202]],
    runwayName:"Runway 36", homeStrip:homeStrip(55,-2380,24,0), hasLeaderboard:true,
    clearColor:0xbec6d2, sky:[[.515,.565,.645],[.19,.255,.36]],
    light:{...daylight,sky:0xe5efff,ground:0xc19d9d,sun:0xffeee0,intensity:1.25},
    fog:{color:0xbec6d2,density:.00125,approach:.0015,daily:[.0009,.00085]},
    groundStyle:"strata", ground:{rock:"#c1856c",deep:"#326878",river:"#528286",bank:"#b19887",shelf:"#c2a999"},
    seabed:{color:"#b3acaa",y:-90}, waterPlane:[1150,7140,-870], glint:[.045,.20,.23],
    vegetation:"snowPine", treeArea:[-1600,1600,-3600,2000], stoneColor:"#b58c7b",
    impacts:["River impact","Canyon terrain contact"], ringPaint:{gold:"#ffba38",cream:"#fff5cd",lit:false},
    spawn:{point:riverPoint(1460,112)},
    approach:[{label:"River bend",point:[-60,92,-1240]},{label:"Canyon strip",point:[15,86,-1420]},
      {label:"Turn final",final:[850,56]},{touchdown:true}],
    deliveryFields:[
      {name:"Pine Bend",x:riverCenter(920)+103,z:920,y:23,width:26,length:310,angle:0.2},
      {name:"Ferry Bluff",x:riverCenter(-1040)+92,z:-1040,y:31,width:24,length:320,angle:-0.13}
    ],
    slalom:{
      spawn:riverPoint(1570,36),
      route:Array.from({length:10},(_,i)=>riverPoint(1320-248*i,32+5*Math.sin(i*.9),i%2?27:-27))
    },
    layouts:[[
      riverPoint(1290,112), riverPoint(1020,106), riverPoint(750,115), riverPoint(480,131),
      riverPoint(210,120), riverPoint(-60,99), riverPoint(-330,113), riverPoint(-600,129),
      riverPoint(-870,112), riverPoint(-1120,96)
    ]]
  })
};
window.CapeFlight = window.CapeFlight || {};
window.CapeFlight.courses = courses;
})();
