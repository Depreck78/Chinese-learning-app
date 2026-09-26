'use client';

import { ArrowLeft, ExternalLink, Play, WifiOff } from 'lucide-react';
import { useState } from 'react';
import { FUN_KINDS, RECOMMENDATIONS, justWatchUrl, type FunKind, type Recommendation, type WatchLink } from './fun-learning';

const KIND_LABEL: Record<FunKind, string> = { anime: 'Anime', drama: 'TV drama', movie: 'Movie', kids: 'Kids' };
const thumbnail = (videoId: string) => `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;

function WatchList({ links, empty }: { links: WatchLink[]; empty: string }) {
  if (!links.length) return <p className="watch-empty">{empty}</p>;
  return (
    <ul className="watch-list">
      {links.map((link) => (
        <li key={link.url}>
          <a href={link.url} target="_blank" rel="noopener noreferrer">
            <span><b>{link.name}</b>{link.note && <small>{link.note}</small>}</span>
            <ExternalLink size={16} aria-hidden="true" />
          </a>
        </li>
      ))}
    </ul>
  );
}

function Trailer({ item, online }: { item: Recommendation; online: boolean }) {
  const [playing, setPlaying] = useState(false);
  const label = item.trailerLabel ?? 'Trailer';
  return (
    <div className="video-frame fun-trailer">
      {!online ? (
        <div className="video-offline"><WifiOff size={28} /><strong>The trailer needs an internet connection</strong></div>
      ) : playing ? (
        <iframe src={`https://www.youtube-nocookie.com/embed/${item.trailer}?autoplay=1&rel=0`} title={`${item.title}: ${label.toLowerCase()}`} allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen />
      ) : (
        <button className="video-poster" onClick={() => setPlaying(true)} aria-label={`Play ${label.toLowerCase()} for ${item.title}`}>
          <span className="video-thumbnail" style={{ backgroundImage: `url(${thumbnail(item.trailer)})` }} aria-hidden="true" />
          <span className="video-shade" />
          <span className="play-button"><Play size={25} fill="currentColor" /></span>
          <span className="poster-copy">{label.toUpperCase()} <b>{item.chinese}</b></span>
        </button>
      )}
    </div>
  );
}

function RecommendationDetail({ item, online, onBack }: { item: Recommendation; online: boolean; onBack: () => void }) {
  return (
    <article className="fun-detail">
      <button className="back-to-dictionary" onClick={onBack}><ArrowLeft size={17} />All recommendations</button>
      <header className="fun-detail-heading">
        <span className="label">{KIND_LABEL[item.kind].toUpperCase()} · {item.year}</span>
        <h1>{item.title}</h1>
        <p className="fun-chinese"><b lang="zh-CN">{item.chinese}</b><span>{item.pinyin}</span></p>
      </header>
      <div className="fun-detail-grid">
        <div className="fun-detail-main">
          <Trailer key={item.id} item={item} online={online} />
          <p className="fun-trailer-link"><a href={`https://www.youtube.com/watch?v=${item.trailer}`} target="_blank" rel="noopener noreferrer">Open on YouTube<ExternalLink size={14} aria-hidden="true" /></a></p>
          <section className="fun-about">
            <h2>What it&apos;s about</h2>
            <p>{item.synopsis}</p>
            <h2>Why watch it</h2>
            <p>{item.why}</p>
            <p className="fun-level"><span className={`level-badge level-${item.level.toLowerCase()}`}>{item.level}</span> level of Chinese</p>
          </section>
        </div>
        <aside className="fun-watch" aria-label={`Where to watch ${item.title}`}>
          <h2>Where to watch</h2>
          <section className="watch-group watch-free">
            <h3>Free</h3>
            <WatchList links={item.free} empty="No free official option that we know of." />
            <p className="watch-note">These free services are supported by ads, and some show a lot of them. What you can watch depends on your country. Use them at your own discretion.</p>
          </section>
          <section className="watch-group watch-paid">
            <h3>Paid</h3>
            <WatchList links={item.paid} empty="Not needed: it's free on the official channel." />
          </section>
          <a className="watch-justwatch" href={justWatchUrl(item.title)} target="_blank" rel="noopener noreferrer">Check what&apos;s available in your country on JustWatch<ExternalLink size={14} aria-hidden="true" /></a>
        </aside>
      </div>
    </article>
  );
}

export function FunLearningPage({ online }: { online: boolean }) {
  const [kind, setKind] = useState<FunKind | 'all'>('all');
  const [openId, setOpenId] = useState<string | null>(null);
  const open = RECOMMENDATIONS.find((item) => item.id === openId);
  const shown = RECOMMENDATIONS.filter((item) => kind === 'all' || item.kind === kind);

  function openItem(id: string | null) {
    setOpenId(id);
    window.scrollTo({ top: 0 });
  }

  if (open) return <section className="page-main fun-page"><RecommendationDetail item={open} online={online} onBack={() => openItem(null)} /></section>;

  return (
    <section className="page-main fun-page">
      <header className="page-heading">
        <div><span className="label">LEARN WHILE YOU RELAX</span><h1>Fun Learning</h1></div>
        <p>Chinese shows, anime and films to practise listening. Pick one that matches your level, watch the trailer, and find where to stream it.</p>
      </header>
      <nav className="fun-filters" aria-label="Filter recommendations">
        {FUN_KINDS.map((option) => (
          <button key={option.id} aria-pressed={kind === option.id} onClick={() => setKind(option.id)}>{option.label}</button>
        ))}
      </nav>
      <ul className="fun-grid">
        {shown.map((item) => (
          <li key={item.id}>
            <button className="fun-card" onClick={() => openItem(item.id)} aria-label={`${item.title}, ${KIND_LABEL[item.kind]}, ${item.level}`}>
              <span className="fun-card-image" aria-hidden="true"><span className="fun-card-glyph">{item.chinese.slice(0, 2)}</span>{online && <span className="fun-card-thumb" style={{ backgroundImage: `url(${thumbnail(item.trailer)})` }} />}</span>
              <span className="fun-card-body">
                <span className="fun-card-meta"><span>{KIND_LABEL[item.kind]} · {item.year}</span><span className={`level-badge level-${item.level.toLowerCase()}`}>{item.level}</span></span>
                <b>{item.title}</b>
                <span className="fun-card-chinese" lang="zh-CN">{item.chinese}</span>
                <span className="fun-card-synopsis">{item.synopsis}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
