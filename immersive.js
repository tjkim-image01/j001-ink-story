// The drawing and narration keep their existing clock. Only the viewing surface
// changes, including a rotated landscape fallback when orientation lock is unavailable.
const player=document.getElementById('player'),expand=document.getElementById('fullscreen');
if(player&&expand){
  // Keep the player in this wrapper from boot onward, so entering fullscreen
  // never detaches the playing audio element. The wrapper is the native fullscreen
  // root; its child can rotate even where browsers fix the root's transform.
  const viewport=document.createElement('div');viewport.className='watch-viewport';
  player.before(viewport);viewport.append(player);
  const play=document.getElementById('play'),seek=document.getElementById('seek');
  const tray=document.createElement('div');
  tray.className='immersive-controls';tray.id='immersive-controls';tray.hidden=true;
  tray.setAttribute('role','group');tray.setAttribute('aria-label','감상 제어');
  tray.innerHTML=`<label class="sr-only" for="watch-seek">감상 재생 위치</label>
    <input id="watch-seek" type="range" min="0" max="100" step="any" value="0">
    <div class="watch-actions"><button type="button" id="watch-play">일시정지</button>
    <output id="watch-time" aria-live="off"></output>
    <button type="button" id="watch-exit">원래 화면으로</button></div>`;
  const reveal=document.createElement('button');
  reveal.type='button';reveal.className='immersive-reveal';reveal.hidden=true;
  reveal.setAttribute('aria-label','감상 제어 열기');reveal.setAttribute('aria-controls',tray.id);reveal.setAttribute('aria-expanded','false');
  player.append(reveal,tray);
  const watchPlay=tray.querySelector('#watch-play'),watchSeek=tray.querySelector('#watch-seek'),watchTime=tray.querySelector('#watch-time');
  const audio=document.getElementById('narrator');
  let active=false,timer=0,nativeSeen=false,locked=false,dragging=false;
  let previousState='',scrollPosition=[0,0],outside=[];
  const fullscreenElement=()=>document.fullscreenElement||document.webkitFullscreenElement;
  const portrait=()=>((visualViewport?.width||innerWidth)<(visualViewport?.height||innerHeight));
  function fit(){
    if(!active)return;
    const width=visualViewport?.width||innerWidth,height=visualViewport?.height||innerHeight;
    const sideways=portrait();
    player.classList.toggle('is-sideways',sideways);
    player.style.setProperty('--watch-width',`${sideways?height:width}px`);
    player.style.setProperty('--watch-height',`${sideways?width:height}px`);
    player.dataset.watchOrientation=sideways?'rotated-landscape':'landscape';
  }
  function sync(){
    watchPlay.textContent=play.textContent;
    watchPlay.setAttribute('aria-label',play.textContent);
    watchSeek.max=seek.max;
    if(!dragging)watchSeek.value=seek.value;
    watchSeek.setAttribute('aria-valuetext',seek.getAttribute('aria-valuetext')||'');
    watchTime.textContent=`${document.getElementById('current-time').textContent} / ${document.getElementById('total-time').textContent}`;
  }
  function hide(){
    clearTimeout(timer);tray.hidden=true;reveal.setAttribute('aria-expanded','false');
    if(tray.contains(document.activeElement))reveal.focus({preventScroll:true});
  }
  function armHide(){
    clearTimeout(timer);
    if(active&&player.dataset.state==='playing'&&!dragging)timer=setTimeout(hide,3500);
  }
  function show(){
    if(!active)return;
    tray.hidden=false;reveal.setAttribute('aria-expanded','true');sync();armHide();
  }
  function unlock(){
    if(locked){try{screen.orientation?.unlock();}catch{}locked=false;}
  }
  function cleanup(){
    if(!active)return;
    active=false;hide();unlock();nativeSeen=false;dragging=false;
    player.classList.remove('is-immersive','is-sideways');
    viewport.classList.remove('is-active');
    player.style.removeProperty('--watch-width');player.style.removeProperty('--watch-height');
    delete player.dataset.watchOrientation;
    document.body.classList.remove('is-watching');reveal.hidden=true;
    for(const [element,inert] of outside)element.inert=inert;outside=[];
    expand.setAttribute('aria-expanded','false');expand.focus({preventScroll:true});
    window.scrollTo(...scrollPosition);
  }
  async function leave(){
    if(fullscreenElement()===viewport){
      try{await(document.exitFullscreen?.()||document.webkitExitFullscreen?.());}catch{}
    }
    cleanup();
  }
  async function enter(){
    if(active||play.disabled)return;
    active=true;scrollPosition=[scrollX,scrollY];nativeSeen=false;
    outside=[...viewport.parentElement.children].filter(el=>el!==viewport).map(el=>[el,el.inert]);
    for(const [el] of outside)el.inert=true;
    player.classList.add('is-immersive');document.body.classList.add('is-watching');
    viewport.classList.add('is-active');
    expand.setAttribute('aria-expanded','true');reveal.hidden=false;hide();fit();
    // Keep both audio playback and fullscreen inside this user activation.
    if(player.dataset.state!=='playing')play.click();
    reveal.focus({preventScroll:true});
    const request=viewport.requestFullscreen||viewport.webkitRequestFullscreen;
    if(request){try{await request.call(viewport,{navigationUI:'hide'});nativeSeen=fullscreenElement()===viewport;}catch{}}
    if(!active){if(fullscreenElement()===viewport)try{await document.exitFullscreen?.();}catch{}return;}
    if(screen.orientation?.lock){
      try{await screen.orientation.lock('landscape');locked=true;if(!active)unlock();}catch{}
    }
    fit();
  }
  expand.addEventListener('click',()=>active?leave():enter());
  tray.querySelector('#watch-exit').addEventListener('click',leave);
  watchPlay.addEventListener('click',()=>{play.click();sync();armHide();});
  reveal.addEventListener('click',show);
  reveal.addEventListener('focus',()=>{if(active&&reveal.matches(':focus-visible'))show();});
  watchSeek.addEventListener('input',()=>{seek.value=watchSeek.value;seek.dispatchEvent(new Event('input',{bubbles:true}));sync();armHide();});
  tray.addEventListener('pointerdown',()=>{dragging=true;clearTimeout(timer);});
  const release=()=>{if(dragging){dragging=false;armHide();}};
  document.addEventListener('pointerup',release);document.addEventListener('pointercancel',release);
  tray.addEventListener('keydown',()=>{clearTimeout(timer);armHide();});
  player.addEventListener('pointerup',event=>{
    if(!active||event.target.closest('.immersive-controls,.immersive-reveal'))return;
    const box=player.getBoundingClientRect();
    if(event.clientY>box.bottom-Math.max(72,box.height*.22)||(player.classList.contains('is-sideways')&&event.clientX<box.left+box.width*.22))show();
    else hide();
  });
  function onFullscreenChange(){
    if(fullscreenElement()===viewport){nativeSeen=true;fit();}
    else if(active&&nativeSeen)cleanup();
  }
  document.addEventListener('fullscreenchange',onFullscreenChange);
  document.addEventListener('webkitfullscreenchange',onFullscreenChange);
  window.addEventListener('resize',fit);visualViewport?.addEventListener('resize',fit);
  screen.orientation?.addEventListener('change',fit);
  audio.addEventListener('timeupdate',()=>{if(active&&!tray.hidden)sync();});
  new MutationObserver(()=>{
    if(!active)return;
    const state=player.dataset.state;
    if(state!==previousState){previousState=state;sync();if(state==='ended')show();else if(!tray.hidden)armHide();}
  }).observe(player,{attributes:true,attributeFilter:['data-state']});
  document.addEventListener('keydown',event=>{
    if(!active)return;
    if(event.key==='Escape'){event.preventDefault();leave();}
    if(event.key==='Tab'){
      if(tray.hidden)show();
      const buttons=[watchSeek,watchPlay,tray.querySelector('#watch-exit')];
      const index=buttons.indexOf(document.activeElement),next=event.shiftKey?(index<=0?buttons.length-1:index-1):(index+1)%buttons.length;
      event.preventDefault();buttons[next].focus();clearTimeout(timer);
    }
  });
}
