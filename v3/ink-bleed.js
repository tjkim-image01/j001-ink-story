import * as THREE from './vendor/three.module.js';
import {motionVertexShader} from './ending-motion.js';
import {paperGLSL} from './paper.js';

// Artistic presets, not a physical fluid solver. Damchae adds a pale color wash.
export const INKS={
  crisp:{spread:.6,opacity:.04,growth:.65,mode:0,width:0,dryness:0,variation:0,surface:0},
  fountain:{spread:1.8,opacity:.16,growth:.9,mode:0,width:0,dryness:0,variation:0,surface:0},
  soft:{spread:3.0,opacity:.28,growth:1.3,mode:0,width:0,dryness:0,variation:0,surface:0},
  meok:{spread:5.2,opacity:.48,growth:1.65,mode:1,width:2.6,dryness:.19,variation:.43,surface:0},
  watercolor:{spread:3.8,opacity:.34,growth:1.15,mode:2,width:2.1,dryness:.37,variation:.32,surface:0},
  sagunja:{spread:8.8,opacity:.36,growth:2.4,mode:3,width:6,dryness:.24,variation:.5,surface:1},
  damchae:{spread:8.0,opacity:.3,growth:2.6,mode:3,width:6,dryness:.2,variation:.5,surface:1},
  charcoal:{spread:.8,opacity:.08,growth:.4,mode:4,width:4,dryness:.7,variation:.5,surface:0},
  crayon:{spread:0,opacity:0,growth:.4,mode:5,width:4,dryness:.3,variation:.2,surface:0},
};

const vertexShader='varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}';
function uniforms(art,strokes,rect,story,motionMask=null,brushArt=null){
  return {
    art:{value:art},strokes:{value:strokes},brushArt:{value:brushArt||art},washArt:{value:art},drawProgress:{value:0},
    artOffset:{value:new THREE.Vector2(rect.x/story.width,1-(rect.y+rect.height)/story.height)},
    artScale:{value:new THREE.Vector2(rect.width/story.width,rect.height/story.height)},
    pixel:{value:new THREE.Vector2(1/rect.width,1/rect.height)},
    motionMask:{value:motionMask},characterLayer:{value:0},motionActive:{value:0},motionTime:{value:0},motionAmount:{value:0},
    pageOrigin:{value:new THREE.Vector2(rect.x,rect.y)},pageSize:{value:new THREE.Vector2(rect.width,rect.height)},
    time:{value:0},duration:{value:story.chapters[0].duration},
    ...Object.fromEntries(Object.entries(INKS.fountain).map(([key,value])=>[key,{value}])),
  };
}

// Change the body of the line, rather than merely placing a halo around the
// original raster. The stroke mask prevents wider brush marks revealing future ink.
export function makeInkArtwork(art,strokes,rect,story,motionMask=null,brushArt=null){
  return new THREE.ShaderMaterial({
    transparent:true,depthWrite:false,toneMapped:false,uniforms:uniforms(art,strokes,rect,story,motionMask,brushArt),vertexShader:motionVertexShader,
    fragmentShader:`
      uniform sampler2D art,strokes,motionMask,brushArt,washArt;
      uniform vec2 artOffset,artScale,pixel;
      uniform float mode,width,dryness,variation,surface,time,duration,drawProgress;
      uniform vec2 pageOrigin,pageSize;
      uniform float characterLayer,motionActive;
      varying vec2 vUv;
      ${paperGLSL}
      float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
      float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}
      float ink(vec2 p){
        // Ignore the source panel border, matching the displayed artwork inset.
        if(any(lessThan(p,pixel*4.0))||any(greaterThan(p,vec2(1.0)-pixel*4.0)))return 0.0;
        return 1.0-texture2D(art,artOffset+p*artScale).r;
      }
      void main(){
        float mask=texture2D(motionMask,artOffset+vUv*artScale).r;
        float alpha=characterLayer>.5?mask*motionActive:1.0;
        if(mode>2.5){
          vec2 cell=vUv/pixel;
          vec4 stamp=texture2D(strokes,vUv);
          float body=1.0-texture2D(brushArt,vUv).r;
          float grain=hash(floor(cell));
          if(mode<3.5){
            float fibers=hash(vec2(floor(cell.x*.38+cell.y*.12),floor(cell.y*.07)));
            body*=1.0-dryness*smoothstep(.72,.99,fibers)*smoothstep(.45,.9,body);
            float birth=stamp.r/max(stamp.g,.001)*255.0/250.0*duration;
            float soak=(1.0-exp(-max(0.0,time-birth)/1.8))*(1.0+stamp.b*1.35);
            body*=min(1.25,.94+soak*.11);
          }else if(mode<4.5){
            body*=.6+.4*noise(cell*.62);
            body*=1.0-.65*smoothstep(.74,.98,grain);
          }else{
            float tooth=hash(floor(cell*vec2(.7,1.3)));
            body*=1.0-.56*smoothstep(.79,.98,tooth);
            body*=.9+.1*noise(cell*.22);
          }
          vec3 pigment=vec3(clamp(body*stamp.g,0.0,1.0));
          if(mode<3.5){
            vec2 q=pageOrigin+vec2(vUv.x,1.0-vUv.y)*pageSize;
            float cue=q.x<450.0?.31:q.y>800.0?.92:q.x<650.0?.43:q.x<1020.0?.68:q.x<1420.0?.59:.83;
            vec3 wash=(1.0-texture2D(washArt,vUv).rgb)*smoothstep(cue,cue+.065,drawProgress);
            pigment=1.0-(1.0-pigment)*(1.0-wash);
          }
          if(characterLayer<.5)pigment*=1.0-mask*motionActive;
          gl_FragColor=vec4(paperAt(pageOrigin+vec2(vUv.x,1.0-vUv.y)*pageSize,surface)*(1.0-pigment),alpha);
          return;
        }
        float center=ink(vUv);
        if(mode<.5){
          if(characterLayer<.5)center*=1.0-mask*motionActive;
          gl_FragColor=vec4(vec3(1.0-center),alpha);
          #include <colorspace_fragment>
          return;
        }
        vec2 cell=vUv/pixel;
        float load=noise(cell*.026);
        float pressure=.42+.88*noise(cell*.014+vec2(17.0,3.0));
        vec2 r=pixel*width*pressure;
        if(mode>1.5)r*=vec2(1.45,.57);
        float body=center;
        body=max(body,ink(vUv+vec2(r.x,0)));body=max(body,ink(vUv-vec2(r.x,0)));
        body=max(body,ink(vUv+vec2(0,r.y)));body=max(body,ink(vUv-vec2(0,r.y)));
        body=max(body,ink(vUv+r*.71));body=max(body,ink(vUv-r*.71));
        body=max(body,ink(vUv+vec2(r.x,-r.y)*.71));body=max(body,ink(vUv+vec2(-r.x,r.y)*.71));
        float density=1.0-variation*(.2+.8*load);
        float paper=hash(floor(cell));
        if(mode<1.5){
          // Sumi ink: loaded black core, diluted areas, small dry-paper flecks.
          density=1.12-variation*(.15+.85*load);
          density*=1.0-dryness*smoothstep(.62,.96,paper)*(1.0-load*.5);
          body=max(center,body*(.72+.28*load));
        }else{
          // Flat western brush: parallel dry bristles and lighter wash patches.
          float bristle=hash(vec2(floor(cell.x*.52+cell.y*.22),2.0));
          float streak=smoothstep(.52,.91,bristle)*(.5+.5*noise(cell*.12));
          density*=1.0-dryness*streak;
          density*=.84+.16*paper;
        }
        float drawn=texture2D(strokes,vUv).g;
        float brushInk=clamp(body*density*drawn,0.0,1.0);
        if(characterLayer<.5)brushInk*=1.0-mask*motionActive;
        gl_FragColor=vec4(vec3(1.0-brushInk),alpha);
      }
    `,
  });
}

export function makeInkBleed(art,strokes,rect,story,motionMask=null,brushArt=null){
  return new THREE.ShaderMaterial({
    transparent:true,depthWrite:false,toneMapped:false,
    uniforms:uniforms(art,strokes,rect,story,motionMask,brushArt),
    vertexShader,
    fragmentShader:`
      uniform sampler2D art,strokes,motionMask,brushArt;
      uniform vec2 artOffset,artScale,pixel;
      uniform float time,duration,spread,opacity,growth,mode,motionActive;
      varying vec2 vUv;
      float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
      float sourceInk(vec2 p){
        if(any(lessThan(p,vec2(0.0)))||any(greaterThan(p,vec2(1.0))))return 0.0;
        float drawn=texture2D(strokes,p).g;
        return (1.0-(mode>2.5?texture2D(brushArt,p).r:texture2D(art,artOffset+p*artScale).r))*drawn;
      }
      void main(){
        vec2 cell=floor(vUv/pixel);
        float grain=hash(cell);
        vec4 stamp=texture2D(strokes,vUv);
        float birth=(stamp.r/max(stamp.g,.001))*255.0/250.0*duration;
        float age=max(0.0,time-birth);
        float wet=mix(.25,1.0,smoothstep(0.0,growth,age));
        if(mode>2.5&&mode<3.5)wet*=.75+stamp.b*1.4;
        vec2 r=pixel*spread*wet*(.78+.36*grain);
        if(mode>1.5&&mode<2.5)r*=vec2(1.3,.7);
        float halo=0.0;
        halo+=sourceInk(vUv+vec2(r.x,0.0));
        halo+=sourceInk(vUv-vec2(r.x,0.0));
        halo+=sourceInk(vUv+vec2(0.0,r.y));
        halo+=sourceInk(vUv-vec2(0.0,r.y));
        halo+=sourceInk(vUv+r*.71);
        halo+=sourceInk(vUv-r*.71);
        halo+=sourceInk(vUv+vec2(r.x,-r.y)*.71);
        halo+=sourceInk(vUv+vec2(-r.x,r.y)*.71);
        halo*=.125;
        float center=sourceInk(vUv);
        float alpha=halo*opacity*(.72+.28*grain)*(1.0-center*.85);
        // Broader, pale wash outside the main edge for the two brush media.
        if(mode>.5){
          float wash=(sourceInk(vUv+r*.42)+sourceInk(vUv-r*.42)+sourceInk(vUv+vec2(r.x,-r.y)*.42)+sourceInk(vUv+vec2(-r.x,r.y)*.42))*.25;
          alpha=max(alpha,wash*opacity*.56*(.6+.4*grain));
        }
        alpha*=1.0-texture2D(motionMask,artOffset+vUv*artScale).r*motionActive;
        gl_FragColor=vec4(vec3(.025),alpha);
      }
    `,
  });
}
