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
  const endingSeconds=Math.min(ENDING_SECONDS,duration*.25),drawDuration=duration-endingSeconds;
  const groups=[];
  for(const segment of path.segments){
    const region=segment.region||0;let g=groups.at(-1);
    if(!g||g.region!==region){g={region,from:segment.start/path.length,to:0,points:[]};groups.push(g);}
    g.to=segment.end/path.length;if(segment.down)g.points.push(segment.a,segment.b);
  }
  const hold=.55,drawingTime=drawDuration-1-hold*(groups.length-1);let cursor=0;
  const shots=groups.map((g,index)=>{
    const pts=g.points.length?g.points:[path.segments[0].a];
    let left=Math.min(...pts.map(p=>p.x)),right=Math.max(...pts.map(p=>p.x)),top=Math.min(...pts.map(p=>p.y)),bottom=Math.max(...pts.map(p=>p.y));
    if(!g.region&&page){left=0;right=page.width;top=0;bottom=page.height;}
    const width=Math.max(767,(right-left+70)*1.3,(bottom-top+70)*aspect*1.3),height=width/aspect;
    const prep=index===0?1:hold;
    const shot={...g,points:undefined,index,x:(left+right)/2,y:(top+bottom)/2,width,height,reason:'paint-region',start:cursor,drawStart:cursor+prep,drawEnd:cursor+prep+drawingTime*(g.to-g.from)};
    cursor=shot.drawEnd;return shot;
  });shots.at(-1).drawEnd=drawDuration;
  const overviewWidth=Math.max(page.width*1.06,page.height*aspect*1.06);
  return {shots,duration,drawDuration,endingSeconds,aspect,width:shots[0].width,height:shots[0].height,edgeBand:EDGE_BAND,overview:{x:page.width/2,y:page.height/2,width:overviewWidth,height:overviewWidth/aspect}};
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
  const viewWidth=previous.width+(shot.width-previous.width)*t,viewHeight=previous.height+(shot.height-previous.height)*t;
  return {...direction,overview,overviewMix:endMix,
    x:x+(plan.overview.x-x)*endMix,y:y+(plan.overview.y-y)*endMix,
    width:viewWidth+(plan.overview.width-viewWidth)*endMix,height:viewHeight+(plan.overview.height-viewHeight)*endMix,
    penScale:clamp(viewHeight/420,.62,1)};
}
