import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';

// ---------- Audio previews ----------
// One shared <audio> element for the whole app, so starting a preview stops
// whatever else was playing (cards and the product page stay in sync).
const bus = (() => {
  let audio = null;
  let state = { url: null, playing: false, time: 0, duration: 0 };
  const subs = new Set();
  const emit = (patch) => { state = { ...state, ...patch }; subs.forEach((f) => f()); };
  const el = () => {
    if (audio) return audio;
    audio = new Audio();
    audio.preload = 'none';
    audio.addEventListener('play', () => emit({ playing: true }));
    audio.addEventListener('pause', () => emit({ playing: false }));
    audio.addEventListener('ended', () => emit({ playing: false, time: 0 }));
    audio.addEventListener('timeupdate', () => emit({ time: audio.currentTime }));
    audio.addEventListener('loadedmetadata', () => emit({ duration: audio.duration }));
    return audio;
  };
  return {
    subscribe: (f) => { subs.add(f); return () => subs.delete(f); },
    get: () => state,
    toggle(url) {
      const a = el();
      if (state.url !== url) {
        a.src = url;
        emit({ url, time: 0, duration: 0 });
      }
      if (a.paused) a.play().catch(() => emit({ playing: false }));
      else a.pause();
    },
    seek(url, fraction) {
      const a = el();
      if (state.url !== url) { this.toggle(url); }
      const apply = () => { if (a.duration) a.currentTime = fraction * a.duration; };
      a.duration ? apply() : a.addEventListener('loadedmetadata', apply, { once: true });
      if (a.paused) a.play().catch(() => {});
    },
    stop() { if (audio) audio.pause(); },
  };
})();

function useAudio(url) {
  const s = useSyncExternalStore(bus.subscribe, bus.get);
  const mine = s.url === url;
  return {
    playing: mine && s.playing,
    time: mine ? s.time : 0,
    duration: mine ? s.duration : 0,
    toggle: () => bus.toggle(url),
    seek: (f) => bus.seek(url, f),
  };
}

// Stop previews when leaving the page that started them.
export function useStopAudioOnUnmount() {
  useEffect(() => () => bus.stop(), []);
}

const PlayIcon = ({ size = 18 }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z" /></svg>;
const PauseIcon = ({ size = 18 }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="5" width="4" height="14" rx="1.2" /><rect x="14" y="5" width="4" height="14" rx="1.2" /></svg>;
const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

export function AudioPlayer({ preview, title }) {
  const { playing, time, duration, toggle, seek } = useAudio(preview.url);
  const peaks = preview.peaks?.length ? preview.peaks : Array(60).fill(0.5);
  const progress = duration ? time / duration : 0;
  const onSeek = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    seek(Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)));
  };
  const onKey = (e) => {
    if (!duration) return;
    if (e.key === 'ArrowRight') seek(Math.min(1, progress + 0.05));
    if (e.key === 'ArrowLeft') seek(Math.max(0, progress - 0.05));
  };
  return (
    <div className="audio-player">
      <button type="button" className="audio-play" onClick={toggle} aria-label={playing ? 'Pause preview' : `Play preview of ${title}`}>
        {playing ? <PauseIcon size={20} /> : <PlayIcon size={20} />}
      </button>
      <div className="audio-main">
        <div className="audio-head"><span>Listen to a preview</span><span className="muted">{fmt(time)} / {duration ? fmt(duration) : '0:25'}</span></div>
        <div
          className="audio-wave" onClick={onSeek} onKeyDown={onKey} role="slider" tabIndex={0}
          aria-label="Seek" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)}
        >
          {peaks.map((v, i) => (
            <span key={i} className={i / peaks.length < progress ? 'on' : ''} style={{ height: `${Math.max(8, v * 100)}%` }} />
          ))}
        </div>
      </div>
    </div>
  );
}

export function CardPlayButton({ preview, title }) {
  const { playing, time, duration, toggle } = useAudio(preview.url);
  return (
    <>
      <button type="button" className={'card-play' + (playing ? ' on' : '')} onClick={toggle} aria-label={playing ? 'Pause preview' : `Play preview of ${title}`}>
        {playing ? <PauseIcon /> : <PlayIcon />}
      </button>
      {(playing || time > 0) && <span className="card-progress" style={{ width: `${duration ? (time / duration) * 100 : 0}%` }} />}
    </>
  );
}

// ---------- Before / after comparison ----------
export function CompareSlider({ before, after, alt }) {
  const [pos, setPos] = useState(50);
  const box = useRef(null);
  const dragging = useRef(false);
  const setFromX = useCallback((clientX) => {
    const r = box.current.getBoundingClientRect();
    setPos(Math.min(100, Math.max(0, ((clientX - r.left) / r.width) * 100)));
  }, []);
  useEffect(() => setPos(50), [before]);
  const down = (e) => { dragging.current = true; e.currentTarget.setPointerCapture?.(e.pointerId); setFromX(e.clientX); };
  const move = (e) => { if (dragging.current) setFromX(e.clientX); };
  const up = () => { dragging.current = false; };
  const key = (e) => {
    const step = e.shiftKey ? 10 : 2;
    if (e.key === 'ArrowLeft') { e.preventDefault(); setPos((p) => Math.max(0, p - step)); }
    if (e.key === 'ArrowRight') { e.preventDefault(); setPos((p) => Math.min(100, p + step)); }
  };
  return (
    <div className="compare" ref={box} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
      <img src={after} alt={`${alt} - after`} draggable="false" />
      <div className="compare-before" style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }}>
        <img src={before} alt={`${alt} - before`} draggable="false" />
      </div>
      <span className="compare-tag left">Before</span>
      <span className="compare-tag right">After</span>
      <div
        className="compare-handle" style={{ left: `${pos}%` }} role="slider" tabIndex={0} onKeyDown={key}
        aria-label="Before and after comparison" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pos)}
      >
        <span className="compare-knob"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 6l-6 6 6 6M15 6l6 6-6 6" /></svg></span>
      </div>
    </div>
  );
}
