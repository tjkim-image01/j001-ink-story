import { clamp, ease } from './timeline.js';

// Actual image centerlines, not a back-and-forth sweep. Travel between
// disconnected strokes has its own short, lifted-pen phase and never erases.
export function makePenPath(data) {
  const segments = [];
  let region=0;
  let previous = null, length = 0;
  const add = (a, b, down, extra={}) => {
    const distance = Math.hypot(b.x-a.x, b.y-a.y);
    const cost = extra.dwell ? 65 : down ? Math.max(.25, distance)*(extra.tempo||1) : Math.max(4, Math.min(55, distance*.14));
    segments.push({ a, b, down, start: length, end: length+cost, distance, region, ...extra });
    length += cost;
  };
  for (const [strokeId,stroke] of data.strokes.entries()) {
    region=data.strokeRegions?.[strokeId]||0;
    const points = stroke.map(([x,y]) => ({ x,y }));
    if (!points.length) continue;
    if (previous && Math.hypot(previous.x-points[0].x,previous.y-points[0].y) > .01) add(previous, points[0], false);
    const total=points.slice(1).reduce((n,p,i)=>n+Math.hypot(p.x-points[i].x,p.y-points[i].y),0);
    let walked=0;
    if(total>70&&strokeId%3===0)add(points[0],points[0],true,{dwell:true,strokeId,phase:0,phaseEnd:0});
    for (let i=1; i<points.length; i++){
      const d=Math.hypot(points[i].x-points[i-1].x,points[i].y-points[i-1].y);
      const phase=walked/Math.max(total,1),phaseEnd=(walked+d)/Math.max(total,1);
      const tempo=1.5-.85*Math.sin(Math.PI*phase)-.45*phase;
      add(points[i-1],points[i],true,{strokeId,phase,phaseEnd,tempo});walked+=d;
    }
    previous = points.at(-1);
  }
  return { segments, length, radius: data.radius };
}

export function samplePenPath(path, progress) {
  const distance = clamp(progress)*path.length;
  let lo=0, hi=path.segments.length-1;
  while (lo < hi) {
    const middle=(lo+hi)>>1;
    if (path.segments[middle].end < distance) lo=middle+1; else hi=middle;
  }
  const segment=path.segments[lo];
  const t=clamp((distance-segment.start)/(segment.end-segment.start));
  const u=segment.down ? t : ease(t);
  return { x:segment.a.x+(segment.b.x-segment.a.x)*u, y:segment.a.y+(segment.b.y-segment.a.y)*u, down:segment.down, lift:segment.down?0:Math.sin(t*Math.PI), segment:lo, distance, phase:(segment.phase||0)+((segment.phaseEnd||0)-(segment.phase||0))*t, dwell:!!segment.dwell, dwellProgress:segment.dwell?t:0 };
}
