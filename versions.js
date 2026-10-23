const picker=document.getElementById('version-picker');
if(picker){
  picker.addEventListener('change',()=>{
    const base=new URL(picker.dataset.base,location.href);
    location.href=new URL(`${['v1','v2','v3'].includes(picker.value)?picker.value:'v2'}/index.html`,base).href;
  });
}
const settings=document.getElementById('drawing-settings');
if(settings){
  const compact=matchMedia('(max-width:700px), (max-width:950px) and (max-height:550px)');
  const fit=()=>{settings.open=!compact.matches;};
  fit();compact.addEventListener('change',fit);
}
const player=document.getElementById('player'),expand=document.getElementById('fullscreen');
function leaveExpanded(){
  player?.classList.remove('is-expanded');document.body.classList.remove('has-expanded-player');
  if(expand)expand.textContent='크게 보기';
}
if(player&&expand){
  expand.addEventListener('click',event=>{
    if(document.fullscreenEnabled&&player.requestFullscreen)return;
    event.preventDefault();event.stopImmediatePropagation();
    if(player.classList.contains('is-expanded'))leaveExpanded();
    else{player.classList.add('is-expanded');document.body.classList.add('has-expanded-player');expand.textContent='원래 크기';}
  },true);
  document.addEventListener('keydown',event=>{if(event.key==='Escape')leaveExpanded();});
}
