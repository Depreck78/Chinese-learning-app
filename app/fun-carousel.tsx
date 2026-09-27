'use client';

import { ChevronLeft, ChevronRight, Pause, Play } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { monthlyPicks, type FunKind } from './fun-learning';

const KIND_LABEL: Record<FunKind, string> = { anime: 'Anime', drama: 'TV drama', movie: 'Movie', kids: 'Kids' };
const SLIDE_SECONDS = 7;

// The month and motion preference come from the viewer's browser, so the server renders an empty frame.
const subscribeToNothing = () => () => {};
const monthKey = () => { const now = new Date(); return `${now.getFullYear()}-${now.getMonth()}`; };
const motionQuery = '(prefers-reduced-motion: reduce)';
const subscribeToMotion = (onChange: () => void) => {
  const query = window.matchMedia(motionQuery);
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
};

export function FunCarousel({ online, onOpen }: { online: boolean; onOpen: (id: string) => void }) {
  const month = useSyncExternalStore(subscribeToNothing, monthKey, () => '');
  const reducedMotion = useSyncExternalStore(subscribeToMotion, () => window.matchMedia(motionQuery).matches, () => true);
  const picks = useMemo(() => {
    if (!month) return [];
    const [year, monthIndex] = month.split('-').map(Number);
    return monthlyPicks(year, monthIndex);
  }, [month]);
  const monthName = useMemo(() => {
    if (!month) return '';
    const [year, monthIndex] = month.split('-').map(Number);
    return new Date(year, monthIndex, 1).toLocaleDateString(undefined, { month: 'long' });
  }, [month]);
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [hovering, setHovering] = useState(false);
  const hero = useRef<HTMLElement>(null);
  const autoplay = !paused && !hovering && !reducedMotion && picks.length > 1;

  useEffect(() => {
    if (!autoplay) return;
    const timer = window.setInterval(() => setIndex((current) => (current + 1) % picks.length), SLIDE_SECONDS * 1000);
    return () => window.clearInterval(timer);
  }, [autoplay, picks.length]);

  // Pause while the pointer or keyboard focus is on the slideshow, and let touch users swipe between slides.
  useEffect(() => {
    const element = hero.current;
    if (!element || picks.length < 2) return;
    let swipeStart: number | null = null;
    const hold = () => setHovering(true);
    const release = () => setHovering(false);
    const leaveFocus = (event: FocusEvent) => { if (!element.contains(event.relatedTarget as Node | null)) setHovering(false); };
    const down = (event: PointerEvent) => { if (event.pointerType !== 'mouse') swipeStart = event.clientX; };
    const up = (event: PointerEvent) => {
      if (swipeStart === null) return;
      const distance = event.clientX - swipeStart;
      swipeStart = null;
      if (Math.abs(distance) > 50) setIndex((current) => (current + (distance < 0 ? 1 : -1) + picks.length) % picks.length);
    };
    element.addEventListener('mouseenter', hold);
    element.addEventListener('mouseleave', release);
    element.addEventListener('focusin', hold);
    element.addEventListener('focusout', leaveFocus);
    element.addEventListener('pointerdown', down);
    element.addEventListener('pointerup', up);
    return () => {
      element.removeEventListener('mouseenter', hold);
      element.removeEventListener('mouseleave', release);
      element.removeEventListener('focusin', hold);
      element.removeEventListener('focusout', leaveFocus);
      element.removeEventListener('pointerdown', down);
      element.removeEventListener('pointerup', up);
    };
  }, [picks.length]);

  if (!picks.length) return <section className="fun-hero" aria-busy="true" />;

  const go = (step: number) => setIndex((current) => (current + step + picks.length) % picks.length);

  return (
    <section ref={hero} className="fun-hero" aria-roledescription="carousel" aria-label={`${monthName} picks`}>
      {picks.map((item, slide) => (
        <article
          key={item.id}
          className="fun-slide"
          data-active={slide === index || undefined}
          aria-roledescription="slide"
          aria-label={`${slide + 1} of ${picks.length}: ${item.title}`}
          aria-hidden={slide !== index}
          inert={slide !== index}
        >
          <span className="fun-slide-image" aria-hidden="true">
            <span className="fun-slide-glyph">{item.chinese}</span>
            {online && <span className="fun-slide-thumb" style={{ backgroundImage: `url(https://i.ytimg.com/vi/${item.trailer}/hqdefault.jpg)` }} />}
          </span>
          <div className="fun-slide-content">
            <span className="fun-slide-eyebrow">{monthName.toUpperCase()} PICKS · {KIND_LABEL[item.kind].toUpperCase()} · {item.year}</span>
            <h2>{item.title}</h2>
            <p className="fun-slide-chinese"><b lang="zh-CN">{item.chinese}</b><span>{item.pinyin}</span></p>
            <p className="fun-slide-synopsis">{item.synopsis}</p>
            <div className="fun-slide-actions">
              <button className="fun-slide-primary" onClick={() => onOpen(item.id)}><Play size={18} fill="currentColor" />Trailer &amp; where to watch</button>
              <span className={`level-badge level-${item.level.toLowerCase()}`}>{item.level}</span>
            </div>
          </div>
        </article>
      ))}
      <div className="fun-hero-controls">
        <button onClick={() => go(-1)} aria-label="Previous pick"><ChevronLeft size={20} /></button>
        <div className="fun-hero-dots">
          {picks.map((item, slide) => (
            <button key={item.id} aria-label={`Show ${item.title}`} aria-current={slide === index || undefined} onClick={() => setIndex(slide)} />
          ))}
        </div>
        <button onClick={() => go(1)} aria-label="Next pick"><ChevronRight size={20} /></button>
        {!reducedMotion && (
          <button onClick={() => setPaused(!paused)} aria-label={paused ? 'Play slideshow' : 'Pause slideshow'}>{paused ? <Play size={16} /> : <Pause size={16} />}</button>
        )}
      </div>
    </section>
  );
}
