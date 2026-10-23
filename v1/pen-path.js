import { clamp, ease } from './timeline.js';

// Actual image centerlines, not a back-and-forth sweep. Travel between
// disconnected strokes has its own short, lifted-pen phase and never erases.
export function makePenPath(data) {
  const segments = [];
  let previous = null, length = 0;
  const add = (a, b, down) => {
    const distance = Math.hypot(b.x-a.x, b.y-a.y);
    const cost = down ? Math.max(.25, distance) : Math.max(4, Math.min(55, distance*.14));
    segments.push({ a, b, down, start: length, end: length+cost });
    length += cost;
  };
  for (const stroke of data.strokes) {
    const points = stroke.map(([x,y]) => ({ x,y }));
    if (!points.length) continue;
    if (previous && Math.hypot(previous.x-points[0].x,previous.y-points[0].y) > .01) add(previous, points[0], false);
    for (let i=1; i<points.length; i++) add(points[i-1], points[i], true);
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
  return { x:segment.a.x+(segment.b.x-segment.a.x)*u, y:segment.a.y+(segment.b.y-segment.a.y)*u, down:segment.down, lift:segment.down?0:Math.sin(t*Math.PI), segment:lo, distance };
}
