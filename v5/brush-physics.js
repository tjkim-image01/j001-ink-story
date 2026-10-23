const clamp=(n,a=0,b=1)=>Math.max(a,Math.min(b,n));
export const noise=n=>{const x=Math.sin(n*127.1+311.7)*43758.5453;return x-Math.floor(x);};

// Artistic brush model in source-page units. Speed, pressure and dwell are
// independent inputs: a fast pressed stroke can still be broad; a light flick tapers.
export function brushProfile({phase=.5,speed=1,pressure=1,dwell=0,kind='sagunja',seed=0}={}){
  const p=clamp(phase), belly=Math.pow(Math.max(0,Math.sin(Math.PI*p)),.65);
  const taper=Math.min(1,.18+p*9,.09+(1-p)*12);
  const load=.72+.23*Math.sin(seed*.7+p*4.1);
  if(kind==='charcoal')return {width:(4.2+2.2*belly)*pressure,density:.66+.17*load,wetness:0};
  if(kind==='crayon')return {width:(3.8+1.7*belly)*pressure,density:.91,wetness:0};
  const drag=clamp(1/Math.sqrt(Math.max(.25,speed)),.62,1.7);
  return {
    width:(1.1+7.2*belly)*taper*pressure*drag+Math.sqrt(Math.max(0,dwell))*3.2,
    density:clamp(.57+.36*load+.18*dwell-.07*Math.max(0,speed-1),.3,.98),
    wetness:clamp(.25+.32*pressure+.45*dwell-.13*speed),
  };
}

// Capillary spread grows toward a finite dry edge, with extra water at a held tip.
export function soakAt(age,residency=0){
  return (1-Math.exp(-Math.max(0,age)/1.8))*(1+Math.min(2,Math.max(0,residency))*1.35);
}

export function segmentProfile(segment,t=0.5,kind='sagunja'){
  const phase=(segment.phase||0)+((segment.phaseEnd||0)-(segment.phase||0))*t;
  const pressure=.62+.57*Math.pow(Math.max(0,Math.sin(Math.PI*phase)),.8)+.11*Math.sin((segment.strokeId||0)*2.1+phase*6);
  return brushProfile({phase,speed:1/(segment.tempo||1),pressure,dwell:segment.dwell?t*.9:0,kind,seed:segment.strokeId||0});
}

// Reconstruct all marks from the traced centerlines. Their reveal and wet age
// remain separate textures, so seeking and different frame rates produce identical ink.
export function paintBrushArtwork(canvas,path,rect,kind){
  const ctx=canvas.getContext('2d');
  ctx.setTransform(1,0,0,1,0,0);ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);
  ctx.setTransform(canvas.width/rect.width,0,0,canvas.height/rect.height,-rect.x*canvas.width/rect.width,-rect.y*canvas.height/rect.height);
  ctx.lineCap='round';ctx.lineJoin='round';
  if(kind==='sagunja'){
    // Pale ink laid along the large contours gives the drawing a wash body.
    for(const s of path.segments){
      if(!s.down||s.dwell)continue;
      const tone=227+Math.floor(noise(s.strokeId)*14);
      ctx.strokeStyle=`rgb(${tone},${tone},${tone})`;ctx.lineWidth=11+noise(s.strokeId+4)*9;
      ctx.beginPath();ctx.moveTo(s.a.x,s.a.y);ctx.lineTo(s.b.x,s.b.y);ctx.stroke();
    }
  }
  for(const s of path.segments){
    if(!s.down)continue;
    const steps=Math.max(1,Math.ceil(s.distance/1.7));
    const angle=Math.atan2(s.b.y-s.a.y,s.b.x-s.a.x);
    for(let i=0;i<=steps;i++){
      const t=i/steps,p=segmentProfile(s,t,kind),x=s.a.x+(s.b.x-s.a.x)*t,y=s.a.y+(s.b.y-s.a.y)*t;
      const gray=Math.round(255*(1-p.density));ctx.fillStyle=`rgb(${gray},${gray},${gray})`;
      ctx.beginPath();ctx.ellipse(x,y,Math.max(.4,p.width*.52),Math.max(.5,p.width*(kind==='sagunja'?.36:.5)),angle+.55,0,Math.PI*2);ctx.fill();
    }
  }
  ctx.setTransform(1,0,0,1,0,0);
}
