import * as THREE from './vendor/three.module.js';
import {makePenPath,samplePenPath} from './pen-path.js';
import {makeCameraPlan,cameraPose} from './camera-director.js';
import {TOOLS,createDrawingTool,toolPose,applyToolPose,setToolColor} from './pen-tools.js';
import {endingMotion,EndingAccents,motionVertexShader} from './ending-motion.js';

const paperGLSL=`
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
vec3 paperAt(vec2 q,float wall){
 float grain=hash(floor(q*1.7));
 if(wall<.5){float tooth=sin(q.x*2.1)*sin(q.y*1.7);return vec3(.988+(grain-.5)*.016+tooth*.002);}
 float row=floor(q.y/92.0);vec2 brick=vec2(mod(q.x+mod(row,2.0)*112.0,224.0),mod(q.y,92.0));
 float mortar=max(1.0-smoothstep(2.0,5.0,brick.x),1.0-smoothstep(2.0,5.0,brick.y));
 float weather=sin(q.x*.017+sin(q.y*.023))*sin(q.y*.011);
 return vec3(.76+(grain-.5)*.055+weather*.028+mortar*.065);
}`;
function tex(image,nearest=false){const t=new THREE.Texture(image);t.colorSpace=THREE.NoColorSpace;t.minFilter=t.magFilter=nearest?THREE.NearestFilter:THREE.LinearFilter;t.generateMipmaps=false;t.needsUpdate=true;return t;}
export class InkScene{
 constructor(story,image,baseMask,pathData,ui,reducedMotion,motionMaskImage,plates){
  this.story=story;this.ui=ui;this.reducedMotion=reducedMotion;this.pathData=pathData;
  this.paths=pathData.chapters.map(makePenPath);this.aspect=ui.stage.clientWidth/Math.max(1,ui.stage.clientHeight);
  this.plans=this.paths.map((p,i)=>makeCameraPlan(p,story.chapters[i].duration,this.aspect,story));
  this.renderer=new THREE.WebGLRenderer({canvas:ui.scene,antialias:true});this.renderer.setPixelRatio(Math.min(devicePixelRatio,2));this.renderer.outputColorSpace=THREE.SRGBColorSpace;this.renderer.setClearColor(0xffffff);
  this.scene=new THREE.Scene();this.camera=new THREE.OrthographicCamera(-1,1,1,-1,.1,1000);this.camera.position.z=300;
  this.plates=Object.fromEntries(story.drawing.styles.map(kind=>[kind,tex(plates[kind])]));
  const birth=tex(plates.reveal,true),sketch=tex(plates.sketch),mask=tex(motionMaskImage);
  this.background=new THREE.ShaderMaterial({uniforms:{wall:{value:0}},depthWrite:false,toneMapped:false,vertexShader:'varying vec2 q;void main(){q=position.xy;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',fragmentShader:`uniform float wall;varying vec2 q;${paperGLSL}void main(){gl_FragColor=vec4(paperAt(vec2(q.x+${story.width/2},${story.height/2}-q.y),wall),1.0);}`});
  const backdrop=new THREE.Mesh(new THREE.PlaneGeometry(story.width*8,story.height*8),this.background);backdrop.position.z=-1;backdrop.renderOrder=-1;this.scene.add(backdrop);
  this.materials=[];this.characters=[];
  for(const chapter of story.chapters){
   const r=chapter.rect;
   const make=character=>new THREE.ShaderMaterial({transparent:true,depthWrite:false,toneMapped:false,vertexShader:motionVertexShader,uniforms:{
    art:{value:this.plates[story.drawing.defaultTool]},birth:{value:birth},sketch:{value:sketch},motionMask:{value:mask},
    progress:{value:0},wall:{value:0},softness:{value:.003},characterLayer:{value:character},motionActive:{value:0},motionTime:{value:0},motionAmount:{value:0},
    artOffset:{value:new THREE.Vector2(r.x/story.width,1-(r.y+r.height)/story.height)},artScale:{value:new THREE.Vector2(r.width/story.width,r.height/story.height)},
    pageOrigin:{value:new THREE.Vector2(r.x,r.y)},pageSize:{value:new THREE.Vector2(r.width,r.height)},
   },fragmentShader:`
    uniform sampler2D art,birth,sketch,motionMask;uniform float progress,wall,softness,characterLayer,motionActive;uniform vec2 pageOrigin,pageSize,artOffset,artScale;varying vec2 vUv;
    ${paperGLSL}
    void main(){
     vec2 q=pageOrigin+vec2(vUv.x,1.0-vUv.y)*pageSize;vec3 paper=paperAt(q,wall);
     vec2 code=texture2D(birth,vUv).rg;float contact=(code.r*255.0*256.0+code.g*255.0)/65535.0;
     float cover=progress>=.999999?1.0:smoothstep(0.0,softness,progress-contact);
     float pencil=(1.0-texture2D(sketch,vUv).r)*(wall>.5?0.0:.17);
     vec3 paint=mix(vec3(1.0-pencil),texture2D(art,vUv).rgb,cover);
     if(wall>.5){float edge=min(min(vUv.x,1.0-vUv.x),min(vUv.y,1.0-vUv.y));paint=mix(vec3(1.0),paint,smoothstep(0.0,.025,edge));}
     float mask=texture2D(motionMask,artOffset+vUv*artScale).r;
     if(characterLayer<.5)paint=mix(paint,vec3(1.0),mask*motionActive);
     gl_FragColor=vec4(paper*paint,characterLayer>.5?mask*motionActive:1.0);
    }`});
   const material=make(0),art=new THREE.Mesh(new THREE.PlaneGeometry(r.width,r.height),material);
   art.position.set(r.x+r.width/2-story.width/2,story.height/2-r.y-r.height/2,0);this.scene.add(art);this.materials.push(material);
   const cm=make(1),character=new THREE.Mesh(new THREE.PlaneGeometry(r.width,r.height,128,80),cm);character.position.copy(art.position);character.position.z=1.2;character.renderOrder=2;character.visible=false;this.scene.add(character);this.characters.push(character);this.materials.push(cm);
  }
  this.tools=Object.fromEntries(story.drawing.styles.map(kind=>{const t=createDrawingTool(kind);t.visible=false;this.scene.add(t);return [kind,t];}));
  this.scene.add(new THREE.AmbientLight(0xffffff,2.4));const light=new THREE.DirectionalLight(0xffffff,3);light.position.set(-100,200,400);this.scene.add(light);this.endingAccents=new EndingAccents(this.scene,story);
  this.palette=new Map(pathData.chapters[0].regions.map(r=>[r.id,r.color]));
  this.setPenKind(story.drawing.defaultTool);this.setInkKind(story.drawing.defaultTool);
  this.observer=new ResizeObserver(()=>this.resize());this.observer.observe(ui.stage);this.resize();
  ui.player.dataset.revealMode='color-underpainting';ui.player.dataset.detailLevel='50';
 }
 resetMask(){} // Contact-time plate is immutable: seeks require no frame history.
 setPenKind(kind){if(!this.tools[kind])kind=this.story.drawing.defaultTool;if(this.pen)this.pen.visible=false;this.penKind=kind;this.pen=this.tools[kind];this.ui.player.dataset.penKind=kind;return kind;}
 setInkKind(kind){if(!this.plates[kind])kind=this.story.drawing.defaultTool;if(kind!==this.penKind)this.setPenKind(kind);this.kind=kind;
  for(const m of this.materials){m.uniforms.art.value=this.plates[kind];m.uniforms.wall.value=kind==='mural'?1:0;m.uniforms.softness.value=kind==='marker'?.0007:kind==='crayon'?.0015:.0035;}
  this.background.uniforms.wall.value=kind==='mural'?1:0;
  Object.assign(this.ui.player.dataset,{inkKind:kind,paperKind:kind==='mural'?'concrete-wall':'drawing-paper',artStyle:kind});
 }
 resize(){const width=this.ui.stage.clientWidth,height=this.ui.stage.clientHeight;if(!width||!height)return;this.renderer.setSize(width,height,false);const a=width/height;if(Math.abs(a-this.aspect)>.001){this.aspect=a;this.plans=this.paths.map((p,i)=>makeCameraPlan(p,this.story.chapters[i].duration,a,this.story));}}
 render(state,started){
  const path=this.paths[state.index],plan=this.plans[state.index],pose=cameraPose(plan,path,state.local,this.aspect,this.reducedMotion),point=samplePenPath(path,pose.progress),s=path.segments[point.segment];
  const motion=toolPose(path,pose.progress,state.local,pose.preparing,this.penKind);applyToolPose(this.pen,motion);this.pen.scale.setScalar(pose.penScale);this.pen.position.set(point.x-this.story.width/2,this.story.height/2-point.y,2+motion.lift);this.pen.visible=started&&!pose.overview;
  const rgb=this.palette.get(s.region)||[74,65,54],hex='#'+rgb.map(v=>Math.round(v).toString(16).padStart(2,'0')).join('');setToolColor(this.pen,hex,motion.down);this.ui.player.dataset.paintColor=hex;const swatch=document.getElementById('paint-swatch');if(swatch)swatch.style.backgroundColor=hex;
  this.camera.left=-pose.width/2;this.camera.right=pose.width/2;this.camera.top=pose.height/2;this.camera.bottom=-pose.height/2;this.camera.updateProjectionMatrix();this.camera.position.x=pose.x-this.story.width/2;this.camera.position.y=this.story.height/2-pose.y;
  const ending=endingMotion(state.local,plan.duration,this.reducedMotion);
  for(const m of this.materials){m.uniforms.progress.value=pose.progress;m.uniforms.motionActive.value=started&&ending.active?1:0;m.uniforms.motionTime.value=ending.clock;m.uniforms.motionAmount.value=ending.strength;}
  for(const c of this.characters)c.visible=started&&ending.active;this.endingAccents.update(started?ending:{active:false,strength:0,clock:0});
  Object.assign(this.ui.player.dataset,{cameraPhase:pose.overview?'overview':pose.preparing?'anticipate':'draw',cameraShot:String(pose.shot.index+1),cameraX:pose.x.toFixed(2),cameraY:pose.y.toFixed(2),cameraWidth:pose.width.toFixed(2),cameraHeight:pose.height.toFixed(2),cameraLocked:String(pose.overview?pose.overviewMix===1:!pose.preparing),cameraEdgeBand:'0.1',penDown:String(this.pen.visible&&motion.down),penVisible:String(this.pen.visible),penX:point.x.toFixed(1),penY:point.y.toFixed(1),drawingProgress:pose.progress.toFixed(6),overviewStart:String(plan.drawDuration),overviewMix:pose.overviewMix.toFixed(4),characterMotion:ending.active?'sway':'still',motionStrength:ending.strength.toFixed(4),motionTime:ending.clock.toFixed(4)});
  this.renderer.render(this.scene,this.camera);
 }
}
