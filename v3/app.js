import * as THREE from './vendor/three.module.js';
import { clamp, makeTimeline, locate, formatTime } from './timeline.js';
import { InkScene } from './ink-scene.js?v=damchae-1';

const $ = id => document.getElementById(id);
const setText = (element, text) => { if (element.textContent !== text) element.textContent = text; };
const ui = Object.fromEntries(['player', 'stage', 'scene', 'intro', 'start', 'load-message', 'scene-note', 'fullscreen', 'chapter-title', 'caption', 'seek', 'current-time', 'total-time', 'playback-status', 'restart', 'previous', 'play', 'next', 'mute', 'speed', 'narrator', 'transcript'].map(id => [id, $(id)]));
const chapterButtons = [...document.querySelectorAll('[data-chapter]')];
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

async function boot() {
  const response = await fetch('./assets/story-page-01.json');
  if (!response.ok) throw new Error('이야기 정보를 읽지 못했습니다.');
  const story = await response.json();
  const image = new Image(); image.src = story.image; await image.decode();
  const pathResponse = await fetch('./assets/pen-paths.json');
  if (!pathResponse.ok) throw new Error('펜 경로를 읽지 못했습니다.');
  const pathData = await pathResponse.json();
  const maskImage = new Image(); maskImage.src = pathData.mask; await maskImage.decode();
  const motionMask=new Image();motionMask.src='./assets/joshua-motion-mask.png';await motionMask.decode();
  const underpainting=await Promise.all(['sumi-lines.png','sumi-wash.png','damchae-wash.png'].map(async name=>{const img=new Image();img.src='./assets/'+name;await img.decode();return img;}));
  const view = new InkScene(story, image, maskImage, pathData, ui, reducedMotion,motionMask,underpainting);
  const lastIndex = story.chapters.length - 1;
  const timeline = makeTimeline(story.chapters, story.transitionSeconds);
  const audio = ui.narrator;
  let playhead = 0, playing = false, started = false, waiting = false;
  let silentFallback = false, audioRequest = 0, activeAudio = -1;
  let rate = 1, previousTick = performance.now(), captionKey = '', customStatus = '';

  ui.seek.max = timeline.total;
  ui['total-time'].textContent = formatTime(timeline.total);
  ui['load-message'].textContent = '수묵 밑그림을 따라 사군자 먹붓이 움직입니다. 화선지에 먹이 스며들고, 마지막에는 완성된 그림을 함께 봅니다.';
  [...chapterButtons, ui.start, ui.play, ui.seek, ui.restart, ui.fullscreen].forEach(el => el.disabled = false);
  for (const chapter of story.chapters) {
    const section = document.createElement('section');
    const title = document.createElement('h3'); title.textContent = chapter.title; section.append(title);
    for (const paragraph of chapter.text.split('\n\n')) {
      const p = document.createElement('p'); p.textContent = paragraph; section.append(p);
    }
    ui.transcript.append(section);
  }

  function pause() {
    playing = false; audio.pause(); previousTick = performance.now(); update();
  }

  async function prepareAudio(index, local = 0) {
    const request = ++audioRequest;
    if (silentFallback) return;
    waiting = true;
    audio.pause();
    try {
      if (activeAudio !== index) {
        activeAudio = index;
        audio.src = story.chapters[index].audio;
        audio.load();
      }
      if (audio.readyState < 1) await new Promise((resolve, reject) => {
        const clean = () => { clearTimeout(timeout); audio.removeEventListener('loadedmetadata', success); audio.removeEventListener('error', fail); };
        const success = () => { clean(); resolve(); };
        const fail = () => { clean(); reject(new Error('음성 파일을 읽지 못했습니다.')); };
        const timeout = setTimeout(fail, 15000);
        audio.addEventListener('loadedmetadata', success, { once: true });
        audio.addEventListener('error', fail, { once: true });
      });
      if (request !== audioRequest) return;
      audio.currentTime = clamp(local, 0, Math.max(0, audio.duration - .01));
      audio.playbackRate = rate;
      waiting = false;
      if (playing) {
        try { await audio.play(); }
        catch (error) {
          if (request !== audioRequest || error.name === 'AbortError') return;
          pause(); customStatus = '재생 버튼을 한 번 더 눌러 주세요.';
        }
      }
    } catch {
      if (request !== audioRequest) return;
      waiting = false; silentFallback = true;
      customStatus = '음성을 읽지 못해 자막으로 진행합니다.';
      ui.mute.textContent = '자막으로 재생'; ui.mute.disabled = true;
    }
  }

  function seek(seconds) {
    playhead = clamp(seconds, 0, timeline.total);
    const state = locate(timeline, playhead);
    captionKey = ''; view.resetMask();
    if (playhead >= timeline.total) {
      audioRequest++; waiting = false; audio.pause(); playing = false;
    } else if (state.phase === 'scene') prepareAudio(state.index, state.local);
    else { audioRequest++; waiting = false; audio.pause(); }
    previousTick = performance.now(); update();
  }

  async function play() {
    customStatus = '';
    if (playhead >= timeline.total) { seek(0); }
    started = true; playing = true;
    ui.intro.hidden = true;
    previousTick = performance.now();
    const state = locate(timeline, playhead);
    if (state.phase === 'scene') await prepareAudio(state.index, state.local);
    update();
  }

  function update() {
    const state = locate(timeline, playhead);
    const chapter = story.chapters[state.index];
    const ended = playhead >= timeline.total;
    ui.player.dataset.state = ended ? 'ended' : playing ? 'playing' : started ? 'paused' : 'ready';
    ui.player.dataset.chapter = state.index + 1;
    ui.player.dataset.phase = state.phase;
    ui.player.dataset.progress = state.progress.toFixed(4);
    setText(ui.play, ended ? '다시 재생' : playing ? '일시정지' : started ? '계속 재생' : '재생');
    ui.play.setAttribute('aria-label', ui.play.textContent);
    ui.previous.disabled = state.index === 0;
    ui.next.disabled = state.index === story.chapters.length - 1;
    ui.seek.value = playhead;
    ui.seek.setAttribute('aria-valuetext', `${formatTime(playhead)} / ${formatTime(timeline.total)}, ${chapter.title}`);
    setText(ui['current-time'], formatTime(playhead));
    setText(ui['chapter-title'], chapter.title);
    setText(ui['scene-note'], `${state.index + 1} / ${story.chapters.length} · ${chapter.title}`);
    for (const [index, button] of chapterButtons.entries()) {
      if (index === state.index) button.setAttribute('aria-current', 'step'); else button.removeAttribute('aria-current');
      button.classList.toggle('is-complete', index < state.index);
    }
    const foundCue = chapter.cues.findIndex(c => state.local < c.end);
    const cueIndex = foundCue < 0 ? chapter.cues.length - 1 : foundCue;
    const cue = state.phase === 'transition' || ended ? chapter.cues.at(-1) : chapter.cues[cueIndex];
    const key = `${state.index}:${cue?.start}:${started}`;
    if (key !== captionKey) {
      ui.caption.textContent = started ? cue?.text || chapter.text : '재생을 누르면 목소리와 함께 그림이 드러납니다.';
      for(const speaker of document.querySelectorAll('[data-speaker]'))speaker.setAttribute('aria-current',String(started&&speaker.dataset.speaker===cue?.speaker));
      ui.player.dataset.speaker=started?cue?.speaker||'':'';
      captionKey = key;
    }
    view.render(state, started);
    setText(ui['playback-status'], customStatus || (ended ? '첫 페이지 끝' : waiting && playing ? '음성 준비 중' : playing && ui.player.dataset.cameraPhase==='overview' ? '완성된 그림 감상' : playing && ui.player.dataset.cameraPhase==='anticipate' ? '그릴 부분을 먼저 비춥니다' : playing ? '재생 중' : started ? '일시정지' : '준비 완료'));
  }

  audio.addEventListener('ended', () => {
    if (!playing || waiting) return;
    const state = locate(timeline, playhead);
    if (state.phase !== 'scene' || state.index !== activeAudio) return;
    playhead = timeline.entries[state.index].end;
    if (state.index === lastIndex) playing = false;
    else playhead += .0001;
    previousTick = performance.now(); update();
  });

  function tick(now) {
    const dt = clamp((now - previousTick) / 1000, 0, .1); previousTick = now;
    if (playing) {
      const state = locate(timeline, playhead);
      if (state.phase === 'transition') {
        const next = timeline.entries[state.index + 1];
        playhead = Math.min(playhead + dt * rate, next.start);
        if (playhead >= next.start) prepareAudio(state.index + 1, 0);
      } else if (!waiting) {
        if (silentFallback) {
          playhead = Math.min(playhead + dt * rate, timeline.entries[state.index].end);
          if (playhead >= timeline.entries[state.index].end) {
            if (state.index === lastIndex) playing = false; else playhead += .0001;
          }
        } else if (!audio.paused) playhead = timeline.entries[state.index].start + Math.min(audio.currentTime, story.chapters[state.index].duration - .00001);
      }
    }
    update(); requestAnimationFrame(tick);
  }

  ui.start.addEventListener('click', play);
  ui.play.addEventListener('click', () => playing ? pause() : play());
  ui.restart.addEventListener('click', () => {
    pause(); started = false; ui.intro.hidden = false; customStatus = ''; seek(0);
  });
  ui.previous.addEventListener('click', () => { started = true; ui.intro.hidden = true; seek(timeline.entries[Math.max(0, locate(timeline, playhead).index - 1)].start); });
  ui.next.addEventListener('click', () => { started = true; ui.intro.hidden = true; seek(timeline.entries[Math.min(lastIndex, locate(timeline, playhead).index + 1)].start); });
  for (const [index, button] of chapterButtons.entries()) button.addEventListener('click', () => {
    started = true; ui.intro.hidden = true; seek(timeline.entries[index].start);
  });
  ui.seek.addEventListener('input', () => { started = true; ui.intro.hidden = true; seek(Number(ui.seek.value)); });
  ui.speed.addEventListener('change', () => { rate = Number(ui.speed.value); audio.playbackRate = rate; });
  $('ink-kind').addEventListener('change',event=>{
    if(event.target.value==='damchae'){$('pen-kind').value='sagunja';view.setPenKind('sagunja');}
    view.setInkKind(event.target.value);update();
  });
  $('pen-kind').addEventListener('change',event=>{
    const ink=view.setPenKind(event.target.value);
    $('ink-kind').value=ink;view.setInkKind(ink);update();
  });
  ui.mute.addEventListener('click', () => {
    audio.muted = !audio.muted; ui.mute.textContent = audio.muted ? '소리 꺼짐' : '소리 켜짐'; ui.mute.setAttribute('aria-pressed', String(audio.muted));
  });
  document.addEventListener('keydown', event => {
    if (event.altKey || event.ctrlKey || event.metaKey || /INPUT|SELECT|TEXTAREA/.test(event.target.tagName)) return;
    if (event.code === 'Space' && !/BUTTON|SUMMARY/.test(event.target.tagName)) { event.preventDefault(); playing ? pause() : play(); }
    if (event.code === 'ArrowRight' && !ui.next.disabled) { event.preventDefault(); ui.next.click(); }
    if (event.code === 'ArrowLeft' && !ui.previous.disabled) { event.preventDefault(); ui.previous.click(); }
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden && playing) pause(); });
  ui.scene.addEventListener('webglcontextlost', event => { event.preventDefault(); pause(); customStatus = '화면 연결이 끊겼습니다. 페이지를 새로고침해 주세요.'; });
  window.addEventListener('pagehide', () => { audio.pause(); });
  ui.player.dataset.renderer = `Three.js r${THREE.REVISION}`;
  if(new URLSearchParams(location.search).get('ink')==='damchae'){
    $('ink-kind').value='damchae';view.setInkKind('damchae');
  }
  prepareAudio(0);
  update(); requestAnimationFrame(tick);
}

boot().catch(error => {
  console.error(error);
  ui.player.dataset.state = 'error';
  ui['load-message'].textContent = '그림을 불러오지 못했습니다. 페이지를 새로고침하거나 Chrome 또는 Safari에서 다시 열어 주세요.';
  ui['playback-status'].textContent = '페이지를 준비하지 못했습니다.';
});
