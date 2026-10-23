import './immersive.js?v=20261023-watch';

const picker=document.getElementById('version-picker');
if(picker){
  picker.addEventListener('change',()=>{
    const base=new URL(picker.dataset.base,location.href);
    location.href=new URL(`${['v1','v2','v3'].includes(picker.value)?picker.value:'v3'}/index.html`,base).href;
  });
}
const settings=document.getElementById('drawing-settings');
if(settings){
  const compact=matchMedia('(max-width:700px), (max-width:950px) and (max-height:550px)');
  const fit=()=>{settings.open=!compact.matches;};
  fit();compact.addEventListener('change',fit);
}
