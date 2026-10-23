export const clamp = (n, min = 0, max = 1) => Math.max(min, Math.min(max, n));
export const ease = n => n * n * (3 - 2 * n);

export function makeTimeline(chapters, transitionSeconds) {
  let cursor = 0;
  const entries = chapters.map((chapter, index) => {
    const entry = { start: cursor, end: cursor + chapter.duration, duration: chapter.duration, index };
    cursor = entry.end + (index < chapters.length - 1 ? transitionSeconds : 0);
    return entry;
  });
  return { entries, total: cursor, transitionSeconds };
}

export function locate(timeline, seconds) {
  const t = clamp(seconds, 0, timeline.total);
  for (const entry of timeline.entries) {
    if (t < entry.end || entry.index === timeline.entries.length - 1) {
      return { index: entry.index, phase: 'scene', local: clamp(t - entry.start, 0, entry.duration), progress: clamp((t - entry.start) / entry.duration) };
    }
    if (t < entry.end + timeline.transitionSeconds) {
      return { index: entry.index, phase: 'transition', local: t - entry.end, progress: clamp((t - entry.end) / timeline.transitionSeconds) };
    }
  }
}

export function formatTime(seconds) {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
