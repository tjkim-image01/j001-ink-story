import * as THREE from './vendor/three.module.js';
import {clamp} from './timeline.js';
import {samplePenPath} from './pen-path.js';
import {segmentProfile} from './brush-physics.js';

export const TOOLS={watercolor:{label:'컬러 수채화',ink:'watercolor'},crayon:{label:'컬러 크레파스',ink:'crayon'},marker:{label:'컬러 마카펜',ink:'marker'},spray:{label:'컬러 스프레이',ink:'spray'},mural:{label:'벽화 스프레이',ink:'mural'}};

// Every model is genuinely three-dimensional, with its contact point at (0,0,0)
// and its shaft along +Y. Tilting never moves the nib off the traced line.
export function createDrawingTool(kind){
  const group=new THREE.Group();group.name=kind;
  const dark=new THREE.MeshStandardMaterial({color:0x191919,roughness:.4,metalness:.15});
  const metal=new THREE.MeshStandardMaterial({color:0xbcbcbc,roughness:.24,metalness:.8});
  const wood=new THREE.MeshStandardMaterial({color:0x99948b,roughness:.85});
  const hair=new THREE.MeshStandardMaterial({color:0x282828,roughness:.95});
  const add=(geometry,material,x=0,y=0,z=0)=>{
    const mesh=new THREE.Mesh(geometry,material);mesh.position.set(x,y,z);group.add(mesh);return mesh;
  };
  const shaft=(top,bottom,length,y,material=dark,sides=24)=>add(new THREE.CylinderGeometry(top,bottom,length,sides),material,0,y);
  const clip=(y,length=30)=>add(new THREE.BoxGeometry(2,length,2),metal,4,y,6);
  if(kind==='marker'){
    const pigment=new THREE.MeshStandardMaterial({color:0x507b99,roughness:.65});group.userData.pigments=[pigment];
    shaft(5.5,2,9,4.5,pigment,12);shaft(6,6,16,17,dark);shaft(8,8,105,78,wood);shaft(8.5,8.5,12,33,pigment);shaft(8,8,13,137,pigment);
    add(new THREE.BoxGeometry(2,70,1),dark,0,83,8);
  }else if(kind==='spray'||kind==='mural'){
    const pigment=new THREE.MeshStandardMaterial({color:0xa95e46,roughness:.58});group.userData.pigments=[pigment];
    shaft(12,12,68,72,metal);shaft(12,10,9,34,metal);shaft(10,12,9,110,dark);
    shaft(12.3,12.3,17,67,pigment);shaft(4,4,8,27,pigment);add(new THREE.BoxGeometry(7,5,7),dark,0,21);
    const mist=new THREE.MeshBasicMaterial({color:0xa95e46,transparent:true,opacity:.12,depthWrite:false});group.userData.pigments.push(mist);
    const plume=add(new THREE.ConeGeometry(9,20,20,1,true),mist,0,10);plume.rotation.z=Math.PI;group.userData.plume=plume;
  }else if(kind==='fountain'){
    shaft(5,6,24,40);shaft(5.5,5.5,100,102);
    shaft(6,6,3,53,metal);shaft(6,6,3,147,metal);shaft(5.5,5.5,12,155);clip(139);
    const shape=new THREE.Shape();shape.moveTo(0,0);shape.lineTo(-7,18);shape.lineTo(-5,29);shape.lineTo(5,29);shape.lineTo(7,18);shape.closePath();
    add(new THREE.ExtrudeGeometry(shape,{depth:1.2,bevelEnabled:false}),metal);
    const line=new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0,1,1.3),new THREE.Vector3(0,22,1.3)]),new THREE.LineBasicMaterial({color:0x111111}));group.add(line);
    add(new THREE.CircleGeometry(1.2,16),dark,0,22,1.4);
  }else if(kind==='ballpoint'){
    add(new THREE.SphereGeometry(1.3,16,12),metal,0,1.3);
    shaft(4.4,1.1,22,13,metal);shaft(4.5,4.5,30,39);
    for(let y=28;y<52;y+=4)shaft(4.8,4.8,.9,y,metal);
    shaft(4.2,4.2,99,103);shaft(4.5,4.5,3,150,metal);shaft(2.6,2.6,9,157,metal);clip(137,25);
  }else if(kind==='pencil'){
    shaft(1.8,0,8,4,dark,6);shaft(5.3,1.8,19,17.5,wood,6);
    shaft(5.3,5.3,120,87,dark,6);
    // Exposed pale facets and a silver ferrule distinguish the hexagonal pencil.
    add(new THREE.BoxGeometry(1.3,110,.7),wood,0,87,4.7);
    shaft(5.5,5.5,9,151,metal);shaft(5.4,5.4,12,161,wood);
    for(const y of [148,151,154])shaft(5.7,5.7,.8,y,dark);
  }else if(kind==='korean'){
    const profile=[[0,0],[1.4,5],[4.8,14],[8.7,25],[9.5,34],[7,42]].map(([r,y])=>new THREE.Vector2(r,y));
    const bristles=add(new THREE.LatheGeometry(profile,32),hair);group.userData.bristles=bristles;
    shaft(6.5,7,116,100,wood);
    for(const y of [47,74,112,151]){shaft(7.1,7.1,2,y,dark);shaft(6.9,6.9,1,y+2,metal);}
    for(let i=0;i<11;i++){
      const angle=i*Math.PI*2/11,r=7.4;
      const curve=new THREE.CatmullRomCurve3([new THREE.Vector3(0,1,0),new THREE.Vector3(Math.cos(angle)*5,16,Math.sin(angle)*5),new THREE.Vector3(Math.cos(angle)*r,37,Math.sin(angle)*r)]);
      add(new THREE.TubeGeometry(curve,12,.22,4,false),metal);
    }
    const loop=add(new THREE.TorusGeometry(3.5,.8,8,24),dark,0,163);loop.scale.y=1.6;
  }else if(kind==='charcoal'){
    const coal=new THREE.MeshStandardMaterial({color:0x202020,roughness:1,flatShading:true});
    shaft(4.7,1.2,12,6,coal,5);shaft(5.8,4.7,71,47.5,coal,7);
    for(let i=0;i<7;i++){
      const a=i*2.399;const chip=add(new THREE.DodecahedronGeometry(2.5,0),coal,Math.sin(a)*4,18+i*9,Math.cos(a)*4);
      chip.scale.set(.3,2,.5);chip.rotation.y=a;
    }
  }else if(kind==='crayon'){
    const wax=new THREE.MeshStandardMaterial({color:0x161616,roughness:.68});group.userData.pigments=[wax];
    const wrap=new THREE.MeshStandardMaterial({color:0x777777,roughness:.95});
    shaft(6,0,13,6.5,wax,16);shaft(6,6,14,20,wax,16);shaft(6.5,6.5,60,57,wrap,20);
    for(const y of [31,34,80,83])shaft(6.7,6.7,1,y,dark);
    shaft(6,6,5,89,wax,16);add(new THREE.BoxGeometry(2,29,.6),dark,0,56,6.3);
  }else if(kind==='sagunja'){
    const profile=[[0,0],[.7,6],[2.1,15],[5.2,29],[6.4,38],[4.6,46]].map(([r,y])=>new THREE.Vector2(r,y));
    const bristles=add(new THREE.LatheGeometry(profile,28),hair);group.userData.bristles=bristles;
    shaft(4.2,4.8,130,111,wood,18);
    for(const y of [49,88,127,168]){shaft(4.9,4.9,2,y,dark);}
    for(let i=0;i<9;i++){
      const a=i*Math.PI*2/9;
      const curve=new THREE.CatmullRomCurve3([new THREE.Vector3(0,1,0),new THREE.Vector3(Math.cos(a)*2.2,18,Math.sin(a)*2.2),new THREE.Vector3(Math.cos(a)*5.6,38,Math.sin(a)*5.6)]);
      add(new THREE.TubeGeometry(curve,10,.13,3,false),wood);
    }
    shaft(4.6,4.6,4,177,dark);const loop=add(new THREE.TorusGeometry(2.7,.6,6,20),dark,0,184);loop.scale.y=1.4;
  }else{
    // Flat bristles with a sloping edge, rectangular ferrule and tapered handle.
    const shape=new THREE.Shape();shape.moveTo(0,0);shape.lineTo(-10,4);shape.lineTo(-12,26);shape.lineTo(12,26);shape.lineTo(10,6);shape.closePath();
    const bristles=add(new THREE.ExtrudeGeometry(shape,{depth:3,bevelEnabled:false}),hair,0,0,-1.5);group.userData.bristles=bristles;
    add(new THREE.BoxGeometry(25,23,7),metal,0,37);
    for(let x=-9;x<=9;x+=3)add(new THREE.BoxGeometry(.35,18,.3),wood,x,16,1.8);
    for(const y of [28,45])add(new THREE.BoxGeometry(25.6,1,7.6),dark,0,y);
    shaft(3,6.5,111,104,dark);shaft(3,3,5,161,metal);
  }
  if(!group.userData.pigments&&group.userData.bristles)group.userData.pigments=[group.userData.bristles.material];
  group.traverse(o=>o.renderOrder=4);
  return group;
}

// A short, symmetric tangent window damps corner jitter. Motion depends only on
// narration time / path progress so a pause or a backward seek is reproducible.
export function toolPose(path,progress,seconds,preparing=false,kind='fountain'){
  const p=samplePenPath(path,progress);
  let dx=0,dy=0;
  for(const offset of [-.0015,0,.0015]){
    const a=samplePenPath(path,clamp(progress+offset-.002)),b=samplePenPath(path,clamp(progress+offset+.002));
    const length=Math.hypot(b.x-a.x,b.y-a.y)||1;
    dx+=(b.x-a.x)/length;dy+=(b.y-a.y)/length;
  }
  const brush=kind==='watercolor'||kind==='korean'||kind==='western'||kind==='sagunja';
  const ink=segmentProfile(path.segments[p.segment],p.dwell?p.dwellProgress:.5,kind);
  const wrist=seconds*.83;
  const elevation=(brush?.91:.65)+Math.sin(wrist)*.19+Math.sin(wrist*1.73+.4)*.08+(preparing?.13:0)+(kind==='sagunja'?(1-ink.width/10)*.1:0);
  const yaw=.55+Math.sin(seconds*.57)*.23+dx*.065+dy*.035;
  const roll=Math.sin(seconds*.72+.7)*.16+dx*.035;
  return {elevation,yaw,roll,lift:preparing?13:Math.max(p.lift*15,p.down?0:2),
    pressure:preparing||!p.down?1:kind==='sagunja'?.75+ink.width*.055:1+Math.sin(seconds*2.1)*.08,down:p.down&&!preparing};
}

export function applyToolPose(tool,pose){
  const axis=new THREE.Vector3(Math.sin(pose.yaw)*Math.cos(pose.elevation),Math.cos(pose.yaw)*Math.cos(pose.elevation),Math.sin(pose.elevation));
  tool.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),axis);
  tool.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),pose.roll));
  if(tool.userData.bristles)tool.userData.bristles.scale.set(pose.pressure,1,pose.pressure);
}

export function setToolColor(tool,color,down){for(const material of tool.userData.pigments||[])material.color.set(color);if(tool.userData.plume)tool.userData.plume.visible=down;}
