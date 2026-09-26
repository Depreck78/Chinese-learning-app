import { Play, WifiOff } from 'lucide-react';
import { useState } from 'react';

/** TrainChinese stroke-order video. Give it a `key` per character so playback resets. */
export function VideoPanel({ character, videoId, online }: { character: string; videoId: string; online: boolean }) {
  const [playing, setPlaying] = useState(false);

  return (
    <section className="video-panel"><div className="panel-heading video-heading"><div><span className="label">STROKE ORDER</span><h2>Watch it written</h2></div><span className="source-badge">TRAINCHINESE</span></div><div className="video-frame">
      {!online ? <div className="video-offline"><WifiOff size={28} /><strong>Video needs an internet connection</strong><span>Use the stroke-order tracing on the writing pad while you&apos;re offline.</span></div> : playing ? <iframe src={`https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&rel=0`} title={`TrainChinese: how to write ${character}`} allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen /> : <button className="video-poster" onClick={() => setPlaying(true)} aria-label="Play writing video"><span className="video-thumbnail" style={{ backgroundImage: `url(https://i.ytimg.com/vi/${videoId}/hqdefault.jpg)` }} aria-hidden="true" /><span className="video-shade" /><span className="play-button"><Play size={25} fill="currentColor" /></span><span className="poster-copy">HOW TO WRITE <b>{character}</b></span></button>}
    </div><p className="video-caption">The original TrainChinese lesson plays here, so your practice stays in one place.</p></section>
  );
}
