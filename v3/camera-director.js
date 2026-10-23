import { clamp, ease } from './timeline.js';
import { samplePenPath } from './pen-path.js';

export const EDGE_BAND=1/10;
export const ENDING_SECONDS=10;
export function cameraSize(aspect){
  const width=clamp(aspect*413,767,1062);
  return {width,height:width/aspect};
}
// Camera centers are event-based and stay absolutely fixed between events.
// A new event occurs only at the inner edge of the outer one-tenth band.
export function makeCameraPlan(path,duration,aspect=2,page=null){
  const endingSeconds=Math.min(ENDING_SECONDS,duration*.25);
  const drawDuration=duration-endingSeconds;
  const view=cameraSize(aspect),safeX=view.width*(.5-EDGE_BAND),safeY=view.height*(.5-EDGE_BAND);
  const first=samplePenPath(path,0);
  let center={x:first.x,y:first.y},from=0,reason='start';
  const groups=[];
  const outside=p=>Math.abs(p.x-center.x)>=safeX-1e-6||Math.abs(p.y-center.y)>=safeY-1e-6;
  const move=(progress,point,nextReason)=>{
    if(progress>from+1e-8)groups.push({from,to:progress,x:center.x,y:center.y,reason});
    from=progress;center={x:point.x,y:point.y};reason=nextReason;
  };
  for(const s of path.segments){
    if(!s.down){
      if(outside(s.b))move(s.end/path.length,s.b,'lift');
      continue;
    }
    let a=s.a,fraction=0;
    // A single long straight ink line can cross several camera windows.
    for(let guard=0;guard<30&&outside(s.b);guard++){
      const dx=s.b.x-a.x,dy=s.b.y-a.y;
      const tx=dx>0?(center.x+safeX-a.x)/dx:dx<0?(center.x-safeX-a.x)/dx:Infinity;
      const ty=dy>0?(center.y+safeY-a.y)/dy:dy<0?(center.y-safeY-a.y)/dy:Infinity;
      const t=clamp(Math.min(tx>=0?tx:Infinity,ty>=0?ty:Infinity));
      const point={x:a.x+dx*t,y:a.y+dy*t};
      fraction=fraction+(1-fraction)*t;
      move((s.start+(s.end-s.start)*fraction)/path.length,point,'edge');
      a=point;if(fraction>=1-1e-8)break;
    }
  }
  if(from<1)groups.push({from,to:1,x:center.x,y:center.y,reason});
  const hold=Math.min(.64,drawDuration*.22/Math.max(1,groups.length));
  const initialHold=1.0;
  const drawingTime=drawDuration-initialHold-hold*(groups.length-1);
  let cursor=0;
  const shots=groups.map((g,index)=>{
    const preparation=index===0?initialHold:hold;
    const shot={...g,index,start:cursor,drawStart:cursor+preparation,drawEnd:cursor+preparation+drawingTime*(g.to-g.from)};
    cursor=shot.drawEnd;return shot;
  });
  shots.at(-1).drawEnd=drawDuration;
  const points=path.segments.flatMap(s=>[s.a,s.b]);
  const left=page?0:Math.min(...points.map(p=>p.x)),top=page?0:Math.min(...points.map(p=>p.y));
  const right=page?page.width:Math.max(...points.map(p=>p.x)),bottom=page?page.height:Math.max(...points.map(p=>p.y));
  const overviewWidth=Math.max((right-left)*1.06,(bottom-top)*aspect*1.06);
  return {shots,duration,drawDuration,endingSeconds,aspect,...view,edgeBand:EDGE_BAND,
    overview:{x:(left+right)/2,y:(top+bottom)/2,width:overviewWidth,height:overviewWidth/aspect}};
}

export function sampleCameraPlan(plan,seconds){
  const time=clamp(seconds,0,plan.drawDuration);
  const shot=plan.shots.find(s=>time<s.drawEnd)||plan.shots.at(-1);
  const preparing=time<shot.drawStart;
  const previous=plan.shots[Math.max(0,shot.index-1)];
  const progress=preparing?shot.from:shot.from+(shot.to-shot.from)*clamp((time-shot.drawStart)/(shot.drawEnd-shot.drawStart));
  return {shot,previous,progress,preparing,mix:preparing?ease(clamp((time-shot.start)/(shot.drawStart-shot.start))):1};
}

export function timeAtPenProgress(plan,progress){
  const shot=plan.shots.find(s=>progress<=s.to)||plan.shots.at(-1);
  return shot.drawStart+(shot.drawEnd-shot.drawStart)*clamp((progress-shot.from)/(shot.to-shot.from));
}

export function cameraPose(plan,path,seconds,aspect=plan.aspect,reducedMotion=false){
  const direction=sampleCameraPlan(plan,seconds),shot=direction.shot;
  const previous=direction.previous;
  const t=direction.preparing&&!reducedMotion?direction.mix:1;
  const overview=seconds>=plan.drawDuration;
  const endMix=overview?(reducedMotion?1:ease(clamp((seconds-plan.drawDuration)/1.8))):0;
  const x=previous.x+(shot.x-previous.x)*t,y=previous.y+(shot.y-previous.y)*t;
  return {...direction,overview,overviewMix:endMix,
    x:x+(plan.overview.x-x)*endMix,y:y+(plan.overview.y-y)*endMix,
    width:plan.width+(plan.overview.width-plan.width)*endMix,height:plan.height+(plan.overview.height-plan.height)*endMix,
    penScale:clamp(plan.height/420,.62,1)};
}
