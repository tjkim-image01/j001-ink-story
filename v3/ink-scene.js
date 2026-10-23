import * as THREE from './vendor/three.module.js';
import { makePenPath, samplePenPath } from './pen-path.js';
import { makeCameraPlan, cameraPose, timeAtPenProgress } from './camera-director.js';
import { makeInkBleed, makeInkArtwork, INKS } from './ink-bleed.js?v=damchae-1';
import {TOOLS,createDrawingTool,toolPose,applyToolPose} from './pen-tools.js';
import {endingMotion,EndingAccents} from './ending-motion.js';
import {paperGLSL} from './paper.js';
import {paintBrushArtwork,segmentProfile} from './brush-physics.js';

export class InkScene {
  constructor(story, image, baseMask, pathData, ui, reducedMotion,motionMaskImage,underpainting) {
    this.story=story; this.ui=ui; this.reducedMotion=reducedMotion;
    this.baseMask=baseMask;
    this.underpainting=underpainting;
    this.aspect=ui.stage.clientWidth/Math.max(1,ui.stage.clientHeight)||2;
    this.paths=pathData.chapters.map(makePenPath);
    this.plans=this.paths.map((path,i)=>makeCameraPlan(path,story.chapters[i].duration,this.aspect,story));
    this.renderer=new THREE.WebGLRenderer({canvas:ui.scene, antialias:true, alpha:false});
    this.renderer.setPixelRatio(Math.min(devicePixelRatio,2));
    this.renderer.setClearColor(0xffffff);
    this.renderer.outputColorSpace=THREE.SRGBColorSpace;
    this.renderer.toneMapping=THREE.NoToneMapping;
    this.scene=new THREE.Scene();
    this.camera=new THREE.OrthographicCamera(-1,1,1,-1,.1,1000);
    this.camera.position.z=300;
    this.backgroundMaterial=new THREE.ShaderMaterial({
      uniforms:{surface:{value:1}},depthWrite:false,toneMapped:false,
      vertexShader:'varying vec2 q;void main(){q=position.xy;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
      fragmentShader:`uniform float surface;varying vec2 q;${paperGLSL}void main(){gl_FragColor=vec4(paperAt(vec2(q.x+${story.width/2},${story.height/2}-q.y),surface),1.0);}`,
    });
    const backdrop=new THREE.Mesh(new THREE.PlaneGeometry(story.width*8,story.height*8),this.backgroundMaterial);backdrop.position.z=-1;backdrop.renderOrder=-1;this.scene.add(backdrop);

    const texture=new THREE.Texture(image);
    texture.colorSpace=THREE.SRGBColorSpace;
    texture.minFilter=THREE.LinearFilter; texture.generateMipmaps=false; texture.needsUpdate=true;
    const motionMask=new THREE.Texture(motionMaskImage);motionMask.colorSpace=THREE.NoColorSpace;
    motionMask.minFilter=THREE.LinearFilter;motionMask.generateMipmaps=false;motionMask.needsUpdate=true;
    const washTexture=new THREE.Texture(underpainting[1]);washTexture.colorSpace=THREE.NoColorSpace;washTexture.minFilter=THREE.LinearFilter;washTexture.generateMipmaps=false;washTexture.needsUpdate=true;
    const colorWash=new THREE.Texture(underpainting[2]);colorWash.colorSpace=THREE.NoColorSpace;colorWash.minFilter=THREE.LinearFilter;colorWash.generateMipmaps=false;colorWash.needsUpdate=true;
    this.washTextures={sagunja:washTexture,damchae:colorWash};
    this.papers=story.chapters.map((chapter,index)=>{
      const r=chapter.rect;
      const canvas=document.createElement('canvas');
      canvas.width=Math.ceil(r.width*.5); canvas.height=Math.ceil(r.height*.5);
      const ctx=canvas.getContext('2d');
      const strokeCanvas=document.createElement('canvas');
      strokeCanvas.width=canvas.width;strokeCanvas.height=canvas.height;
      const strokeCtx=strokeCanvas.getContext('2d');
      const strokeTexture=new THREE.CanvasTexture(strokeCanvas);
      strokeTexture.colorSpace=THREE.NoColorSpace;strokeTexture.minFilter=THREE.LinearFilter;strokeTexture.generateMipmaps=false;
      const brushCanvas=document.createElement('canvas');brushCanvas.width=r.width;brushCanvas.height=r.height;
      brushCanvas.getContext('2d').drawImage(underpainting[0],0,0);
      const brushTexture=new THREE.CanvasTexture(brushCanvas);brushTexture.colorSpace=THREE.NoColorSpace;brushTexture.minFilter=THREE.LinearFilter;brushTexture.generateMipmaps=false;
      const artworkMaterial=makeInkArtwork(texture,strokeTexture,r,story,motionMask,brushTexture);
      artworkMaterial.uniforms.washArt.value=washTexture;
      const artwork=new THREE.Mesh(new THREE.PlaneGeometry(r.width,r.height),artworkMaterial);
      artwork.position.set(r.x+r.width/2-story.width/2,story.height/2-r.y-r.height/2,0);
      this.scene.add(artwork);
      const characterMaterial=makeInkArtwork(texture,strokeTexture,r,story,motionMask,brushTexture);
      characterMaterial.uniforms.washArt.value=washTexture;
      characterMaterial.uniforms.characterLayer.value=1;
      const character=new THREE.Mesh(new THREE.PlaneGeometry(r.width,r.height,128,80),characterMaterial);
      character.position.copy(artwork.position);character.position.z=1.2;character.renderOrder=2;character.visible=false;this.scene.add(character);
      const maskTexture=new THREE.CanvasTexture(canvas);
      maskTexture.colorSpace=THREE.NoColorSpace;
      maskTexture.minFilter=THREE.LinearFilter; maskTexture.generateMipmaps=false;
      const material=new THREE.ShaderMaterial({
        uniforms:{ revealMask:{value:maskTexture},mode:{value:3} },
        vertexShader:'varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
        fragmentShader:'uniform sampler2D revealMask;uniform float mode; varying vec2 vUv; void main(){float r=texture2D(revealMask,vUv).r;gl_FragColor=vec4(1.0,1.0,1.0,mode>2.5?0.0:1.0-r);}',
        transparent:true,depthWrite:false,toneMapped:false,
      });
      const paper=new THREE.Mesh(new THREE.PlaneGeometry(r.width,r.height),material);
      paper.position.set(r.x+r.width/2-story.width/2,story.height/2-r.y-r.height/2,.5);
      paper.renderOrder=1; this.scene.add(paper);
      const bleedMaterial=makeInkBleed(texture,strokeTexture,r,story,motionMask,brushTexture);
      const bleed=new THREE.Mesh(new THREE.PlaneGeometry(r.width,r.height),bleedMaterial);
      bleed.position.copy(paper.position);bleed.position.z=.2;bleed.renderOrder=.5;this.scene.add(bleed);
      return {canvas,ctx,maskTexture,strokeCanvas,strokeCtx,strokeTexture,brushCanvas,brushTexture,coverMaterial:material,bleedMaterial,artworkMaterial,characterMaterial,character,rect:r};
    });
    this.tools=Object.fromEntries(Object.keys(TOOLS).map(kind=>{
      const tool=createDrawingTool(kind);tool.visible=false;this.scene.add(tool);return [kind,tool];
    }));
    this.setPenKind('sagunja');
    const cursorMaterial=new THREE.MeshBasicMaterial({color:0x444444,transparent:true,opacity:.65,depthWrite:false});
    this.brush=new THREE.Mesh(new THREE.RingGeometry(2.5,3.5,32),cursorMaterial);
    this.brush.position.z=2; this.brush.renderOrder=3; this.scene.add(this.brush);
    this.scene.add(new THREE.AmbientLight(0xffffff,2.4));
    this.endingAccents=new EndingAccents(this.scene,story);
    const light=new THREE.DirectionalLight(0xffffff,3); light.position.set(-100,200,400); this.scene.add(light);
    this.resetMask();
    this.observer=new ResizeObserver(()=>this.resize()); this.observer.observe(ui.stage); this.resize();
    ui.player.dataset.revealMode='ink-strokes';
    ui.player.dataset.whiteAlreadyClear='true';
    ui.player.dataset.brushRadius='7';
    this.setInkKind('sagunja');
  }

  setPenKind(kind){
    if(!TOOLS[kind])kind='fountain';
    if(this.pen)this.pen.visible=false;
    this.penKind=kind;this.pen=this.tools[kind];
    this.ui.player.dataset.penKind=kind;
    return TOOLS[kind].ink;
  }

  resetMask() {
    for (const p of this.papers) {
      p.ctx.setTransform(1,0,0,1,0,0);
      p.ctx.drawImage(this.baseMask,p.rect.x,p.rect.y,p.rect.width,p.rect.height,0,0,p.canvas.width,p.canvas.height);
      p.ctx.setTransform(p.canvas.width/p.rect.width,0,0,p.canvas.height/p.rect.height,-p.rect.x*p.canvas.width/p.rect.width,-p.rect.y*p.canvas.height/p.rect.height);
      p.maskTexture.needsUpdate=true;
      p.strokeCtx.setTransform(1,0,0,1,0,0);
      p.strokeCtx.fillStyle='#000';p.strokeCtx.fillRect(0,0,p.strokeCanvas.width,p.strokeCanvas.height);
      p.strokeCtx.setTransform(p.canvas.width/p.rect.width,0,0,p.canvas.height/p.rect.height,-p.rect.x*p.canvas.width/p.rect.width,-p.rect.y*p.canvas.height/p.rect.height);
      p.strokeTexture.needsUpdate=true;
    }
    this.paintedIndex=-1; this.paintedProgress=0;
  }

  paint(index,from,to) {
    const p=this.papers[index], path=this.paths[index], ctx=p.ctx, r=p.rect,wet=p.strokeCtx;
    ctx.save(); ctx.beginPath(); ctx.rect(r.x,r.y,r.width,r.height); ctx.clip();
    ctx.fillStyle='#fff'; ctx.strokeStyle='#fff'; ctx.lineWidth=path.radius*2; ctx.lineCap='round'; ctx.lineJoin='round';
    if(to>from) {
      const start=samplePenPath(path,from), end=to*path.length;
      let connected=false;
      ctx.beginPath();
      for(let i=start.segment;i<path.segments.length;i++) {
        const s=path.segments[i]; if(s.start>end)break;
        if(!s.down){connected=false;continue;}
        const span=s.end-s.start;
        const a=Math.max(0,(from*path.length-s.start)/span), b=Math.min(1,(end-s.start)/span);
        if(b<a)continue;
        const ax=s.a.x+(s.b.x-s.a.x)*a, ay=s.a.y+(s.b.y-s.a.y)*a;
        const bx=s.a.x+(s.b.x-s.a.x)*b, by=s.a.y+(s.b.y-s.a.y)*b;
        if(!connected)ctx.moveTo(ax,ay);
        ctx.lineTo(bx,by); connected=true;
        // Fixed spatial stamps, independent of frame boundaries. Red is contact
        // time, green coverage, blue ink load. A held tip ages instead of being
        // freshly re-stamped on every animation frame.
        const steps=Math.max(1,Math.ceil(s.distance/2));
        for(let j=Math.max(0,Math.ceil(a*steps));j<=Math.min(steps,Math.floor(b*steps));j++){
          const t=j/steps,progress=(s.start+span*t)/path.length;
          if(from>0&&progress<=from)continue;
          const profile=segmentProfile(s,s.dwell?1:t,this.inkKind);
          const born=timeAtPenProgress(this.plans[index],s.dwell?s.start/path.length:progress);
          wet.fillStyle=`rgb(${Math.round(born/this.story.chapters[index].duration*250)},255,${Math.round(profile.wetness*255)})`;
          wet.beginPath();wet.arc(s.a.x+(s.b.x-s.a.x)*t,s.a.y+(s.b.y-s.a.y)*t,['sagunja','damchae'].includes(this.inkKind)?15:path.radius,0,Math.PI*2);wet.fill();
        }
      }
      ctx.stroke();
    }
    if(to>=1)ctx.fillRect(r.x,r.y,r.width,r.height);
    ctx.restore();p.maskTexture.needsUpdate=true;p.strokeTexture.needsUpdate=true;
  }

  setInkKind(kind){
    if(!INKS[kind])kind='fountain';
    const ink=INKS[kind];
    this.inkKind=kind;
    this.backgroundMaterial.uniforms.surface.value=ink.surface;
    for(const [index,paper] of this.papers.entries()){
      paper.coverMaterial.uniforms.mode.value=ink.mode;
      if(ink.mode>2.5){
        if(kind==='sagunja'||kind==='damchae'){
          const ctx=paper.brushCanvas.getContext('2d');ctx.setTransform(1,0,0,1,0,0);ctx.drawImage(this.underpainting[0],0,0);
        }else paintBrushArtwork(paper.brushCanvas,this.paths[index],paper.rect,kind);
        paper.brushTexture.needsUpdate=true;
      }
      for(const material of [paper.bleedMaterial,paper.artworkMaterial,paper.characterMaterial]){
        for(const [name,value] of Object.entries(ink))material.uniforms[name].value=value;
        material.uniforms.washArt.value=this.washTextures[kind]||this.washTextures.sagunja;
      }
    }
    this.ui.player.dataset.inkKind=kind;
    this.ui.player.dataset.inkSpread=String(ink.spread);
    this.ui.player.dataset.strokeStyle=kind;
    this.ui.player.dataset.strokeWidth=String(ink.width);
    this.ui.player.dataset.paperKind=ink.surface?'xuan':'plain';
    this.ui.player.dataset.artStyle=ink.mode>2.5?kind:'original';
    this.resetMask();
  }

  reveal(index,progress) {
    if(index!==this.paintedIndex||progress<this.paintedProgress-.00001) {
      this.resetMask(); for(let i=0;i<index;i++)this.paint(i,0,1); this.paintedIndex=index;
    }
    if(Math.abs(progress-this.paintedProgress)>.000001) {
      this.paint(index,this.paintedProgress,progress); this.paintedProgress=progress;
    }
    const p=samplePenPath(this.paths[index],progress);
    const x=p.x-this.story.width/2, y=this.story.height/2-p.y;
    this.brush.position.set(x,y,2);
    this.pen.position.set(x,y,2);
    this.ui.player.dataset.penX=p.x.toFixed(1);
    this.ui.player.dataset.penY=p.y.toFixed(1);
  }

  resize() {
    const {clientWidth:width,clientHeight:height}=this.ui.stage; if(!width||!height)return;
    this.renderer.setSize(width,height,false);
    const aspect=width/height;
    if(Math.abs(aspect-this.aspect)>.001){
      this.aspect=aspect;
      this.plans=this.paths.map((path,i)=>makeCameraPlan(path,this.story.chapters[i].duration,aspect,this.story));
      this.resetMask();
    }
  }

  render(state,started) {
    const path=this.paths[state.index],plan=this.plans[state.index];
    const pose=cameraPose(plan,path,state.local,this.aspect||2,this.reducedMotion);
    this.reveal(state.index,pose.progress);
    const motion=toolPose(path,pose.progress,state.local,pose.preparing,this.penKind);
    applyToolPose(this.pen,motion);this.pen.position.z+=motion.lift;
    this.pen.scale.setScalar(pose.penScale);
    this.pen.visible=started&&!pose.overview;
    this.brush.visible=this.pen.visible&&motion.down;
    this.camera.left=-pose.width/2;this.camera.right=pose.width/2;
    this.camera.top=pose.height/2;this.camera.bottom=-pose.height/2;
    this.camera.updateProjectionMatrix();
    this.camera.position.x=pose.x-this.story.width/2;
    this.camera.position.y=this.story.height/2-pose.y;
    const ending=endingMotion(state.local,plan.duration,this.reducedMotion);
    for(const paper of this.papers){
      paper.bleedMaterial.uniforms.time.value=state.local;
      paper.artworkMaterial.uniforms.time.value=state.local;
      paper.characterMaterial.uniforms.time.value=state.local;
      paper.artworkMaterial.uniforms.drawProgress.value=pose.progress;
      paper.characterMaterial.uniforms.drawProgress.value=pose.progress;
      paper.character.visible=started&&ending.active;
      for(const material of [paper.bleedMaterial,paper.artworkMaterial,paper.characterMaterial]){
        material.uniforms.motionActive.value=started&&ending.active?1:0;
        material.uniforms.motionTime.value=ending.clock;
        material.uniforms.motionAmount.value=ending.strength;
      }
    }
    this.endingAccents.update(started?ending:{active:false,strength:0,clock:0});
    const data=this.ui.player.dataset;
    data.cameraPhase=pose.overview?'overview':pose.preparing?'anticipate':'draw';data.cameraShot=String(pose.shot.index+1);
    data.cameraX=pose.x.toFixed(2);data.cameraY=pose.y.toFixed(2);
    data.cameraWidth=pose.width.toFixed(2);data.cameraHeight=pose.height.toFixed(2);
    data.cameraLocked=String(pose.overview?pose.overviewMix===1:!pose.preparing);data.cameraEdgeBand='0.1';
    data.penDown=String(this.pen.visible&&motion.down);data.penElevation=(motion.elevation*180/Math.PI).toFixed(2);
    data.penYaw=(motion.yaw*180/Math.PI).toFixed(2);data.penRoll=motion.roll.toFixed(4);
    data.overviewStart=String(plan.drawDuration);data.overviewMix=pose.overviewMix.toFixed(4);
    data.drawingProgress=pose.progress.toFixed(6);data.penVisible=String(this.pen.visible);
    data.characterMotion=ending.active?'sway':'still';data.motionStrength=ending.strength.toFixed(4);data.motionTime=ending.clock.toFixed(4);
    this.renderer.render(this.scene,this.camera);
  }
}
