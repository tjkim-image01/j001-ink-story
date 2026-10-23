import * as THREE from './vendor/three.module.js';
import {clamp,ease} from './timeline.js';

export function endingMotion(local,duration,reduced=false){
  const start=duration-8,clock=Math.max(0,local-start);
  const active=local>=start;
  const strength=active&&!reduced?ease(clamp(clock/.9))*ease(clamp((duration-local)/1.1)):0;
  return {active,clock,strength};
}

// Used by both the static artwork and its isolated character layer. Feet remain
// planted; the upper body, head and trailing cloak deform around their own pivots.
export const motionVertexShader=`
  varying vec2 vUv;
  uniform vec2 pageOrigin,pageSize;
  uniform float characterLayer,motionTime,motionAmount;
  void main(){
    vUv=uv;vec3 p=position;
    if(characterLayer>.5){
      vec2 q=pageOrigin+vec2(uv.x,1.0-uv.y)*pageSize;
      float upper=1.0-smoothstep(480.0,860.0,q.y);
      float cape=(1.0-smoothstep(260.0,345.0,q.x))*smoothstep(450.0,570.0,q.y)*(1.0-smoothstep(730.0,800.0,q.y));
      float head=exp(-pow((q.x-350.0)/69.0,2.0)-pow((q.y-408.0)/62.0,2.0));
      float turn=sin(motionTime*1.1)*.035*head;
      p.x+=motionAmount*(upper*7.0*sin(motionTime*1.35)+cape*13.0*sin(motionTime*2.05)+turn*(448.0-q.y));
      p.y+=motionAmount*(upper*2.6*sin(motionTime*1.7)+cape*3.0*sin(motionTime*2.05+.8)+turn*(q.x-345.0));
    }
    gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.0);
  }
`;

export class EndingAccents{
  constructor(scene,story){
    this.story=story;this.group=new THREE.Group();scene.add(this.group);
    this.lines=Array.from({length:3},()=>{
      const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(new Float32Array(48*3),3));
      const line=new THREE.Line(geometry,new THREE.LineBasicMaterial({color:0x555555,transparent:true,opacity:0,depthWrite:false}));
      line.renderOrder=2.5;this.group.add(line);return line;
    });
    this.rings=[0,1].map(()=>{
      const ring=new THREE.Mesh(new THREE.RingGeometry(1,1.035,64),new THREE.MeshBasicMaterial({color:0x777777,transparent:true,opacity:0,depthWrite:false,side:THREE.DoubleSide}));
      ring.position.set(1250-story.width/2,story.height/2-635,1.5);ring.renderOrder=2.5;this.group.add(ring);return ring;
    });
  }
  update(motion){
    this.group.visible=motion.active&&motion.strength>0;
    const {clock,strength}=motion,s=this.story;
    for(const [i,line] of this.lines.entries()){
      const phase=(clock*.32+i*.31)%1,points=line.geometry.attributes.position;
      for(let j=0;j<48;j++){
        const u=j/47,x=90+u*135+phase*25,y=570+i*47+Math.sin(u*Math.PI*1.4+clock*1.8+i)*8;
        points.setXYZ(j,x-s.width/2,s.height/2-y,1.5);
      }
      points.needsUpdate=true;line.material.opacity=strength*Math.sin(phase*Math.PI)*.28;
    }
    for(const [i,ring] of this.rings.entries()){
      const phase=(clock*.24+i*.5)%1;
      ring.scale.setScalar(23+phase*40);ring.material.opacity=strength*Math.sin(phase*Math.PI)*.17;
    }
  }
}
