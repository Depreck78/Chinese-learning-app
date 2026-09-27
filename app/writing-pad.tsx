import { Eraser, Map as MapIcon, Pause, Play, RotateCcw } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { strokeDataUrl } from './offline';

type Point = { x: number; y: number };
type Stroke = Point[];
type StrokeOrderData = {
  strokes: string[];
  medians: [number, number][][];
};

// Stroke data uses a 1024-unit box with y pointing up; the pad uses 0–100 with y pointing down.
const toPad = ([x, y]: [number, number]): Point => ({ x: x * 0.09765625, y: 87.890625 - y * 0.09765625 });

function resample(points: Point[], count = 16): Point[] {
  const lengths = [0];
  for (let index = 1; index < points.length; index += 1) {
    lengths.push(lengths[index - 1] + Math.hypot(points[index].x - points[index - 1].x, points[index].y - points[index - 1].y));
  }
  const total = lengths[lengths.length - 1];
  if (!total) return Array.from({ length: count }, () => points[0]);
  const result: Point[] = [];
  let segment = 1;
  for (let index = 0; index < count; index += 1) {
    const target = (total * index) / (count - 1);
    while (segment < points.length - 1 && lengths[segment] < target) segment += 1;
    const span = lengths[segment] - lengths[segment - 1] || 1;
    const along = Math.min(1, Math.max(0, (target - lengths[segment - 1]) / span));
    result.push({
      x: points[segment - 1].x + (points[segment].x - points[segment - 1].x) * along,
      y: points[segment - 1].y + (points[segment].y - points[segment - 1].y) * along,
    });
  }
  return result;
}

/** Loose check that a drawn stroke follows the expected stroke's path, in the right direction. */
function matchesStroke(drawn: Stroke, median: [number, number][]) {
  const expected = resample(median.map(toPad));
  const actual = resample(drawn);
  const averageGap = actual.reduce((sum, point, index) => sum + Math.hypot(point.x - expected[index].x, point.y - expected[index].y), 0) / actual.length;
  return averageGap < 13;
}

/**
 * Writing practice for one character. With `onTrace`, it checks each stroke against the
 * stroke-order data and calls `onTrace` whenever the whole character has been traced.
 */
export function WritingPad({ character, onTrace }: { character: string; onTrace?: () => void }) {
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [active, setActive] = useState<Stroke | null>(null);
  const [guide, setGuide] = useState(true);
  const [strokeOrder, setStrokeOrder] = useState<StrokeOrderData | null>(null);
  const [strokeOrderError, setStrokeOrderError] = useState(false);
  const [demoRun, setDemoRun] = useState(0);
  const [demoPlaying, setDemoPlaying] = useState(false);
  const [feedback, setFeedback] = useState<'miss' | 'traced' | null>(null);
  const frame = useRef<SVGSVGElement>(null);
  // The stroke being drawn. Kept in a ref as well as state so no points are lost when several
  // pointer events arrive between renders, which happens a lot with fast strokes on phones.
  const drawn = useRef<Stroke | null>(null);
  const demoTimer = useRef<number | null>(null);
  const feedbackTimer = useRef<number | null>(null);
  const tracing = Boolean(onTrace && strokeOrder);

  useEffect(() => {
    const controller = new AbortController();

    fetch(strokeDataUrl(character), {
      signal: controller.signal,
    })
      .then((response) => {
        if (!response.ok) throw new Error(`Stroke data request failed with ${response.status}`);
        return response.json();
      })
      .then((data: unknown) => {
        if (!data || typeof data !== 'object') throw new Error('Stroke data is not an object');
        const strokeData = data as Partial<StrokeOrderData>;
        if (!Array.isArray(strokeData.strokes) || !Array.isArray(strokeData.medians)) {
          throw new Error('Stroke data is missing paths or medians');
        }
        setStrokeOrder({ strokes: strokeData.strokes, medians: strokeData.medians });
      })
      .catch((error: unknown) => {
        if (!(error instanceof Error && error.name === 'AbortError')) setStrokeOrderError(true);
      });

    return () => {
      controller.abort();
      if (demoTimer.current !== null) window.clearTimeout(demoTimer.current);
      if (feedbackTimer.current !== null) window.clearTimeout(feedbackTimer.current);
    };
  }, [character]);

  // On phones a drawing finger would otherwise start a text selection, often on the buttons under the pad,
  // or open the long-press menu. Touch listeners must be non-passive to cancel that.
  useEffect(() => {
    const pad = frame.current;
    if (!pad) return;
    const cancel = (event: Event) => event.preventDefault();
    pad.addEventListener('touchstart', cancel, { passive: false });
    pad.addEventListener('touchmove', cancel, { passive: false });
    pad.addEventListener('contextmenu', cancel);
    return () => {
      pad.removeEventListener('touchstart', cancel);
      pad.removeEventListener('touchmove', cancel);
      pad.removeEventListener('contextmenu', cancel);
    };
  }, []);

  // While a stroke is being drawn, nothing on the page can be selected.
  const drawing = active !== null;
  useEffect(() => {
    if (!drawing) return;
    const cancel = (event: Event) => event.preventDefault();
    document.addEventListener('selectstart', cancel);
    return () => document.removeEventListener('selectstart', cancel);
  }, [drawing]);

  // A finger that runs past the pad's edge keeps drawing along the edge instead of off the pad,
  // so overshooting the end of a stroke doesn't make it fail the check.
  function point(event: React.PointerEvent<SVGSVGElement>) {
    const rect = frame.current!.getBoundingClientRect();
    const clamp = (value: number) => Math.min(100, Math.max(0, value));
    return { x: clamp(((event.clientX - rect.left) / rect.width) * 100), y: clamp(((event.clientY - rect.top) / rect.height) * 100) };
  }
  function start(event: React.PointerEvent<SVGSVGElement>) {
    // Ignore new strokes while a finished trace is being cleared.
    event.preventDefault();
    if (feedback === 'traced') return;
    window.getSelection()?.removeAllRanges();
    event.currentTarget.setPointerCapture(event.pointerId);
    drawn.current = [point(event)];
    setActive(drawn.current);
  }
  function move(event: React.PointerEvent<SVGSVGElement>) {
    if (!drawn.current) return;
    drawn.current = [...drawn.current, point(event)];
    setActive(drawn.current);
  }

  function showFeedback(kind: 'miss' | 'traced', then?: () => void) {
    if (feedbackTimer.current !== null) window.clearTimeout(feedbackTimer.current);
    setFeedback(kind);
    feedbackTimer.current = window.setTimeout(() => {
      setFeedback(null);
      then?.();
    }, kind === 'traced' ? 1300 : 900);
  }

  function end() {
    const stroke = drawn.current;
    drawn.current = null;
    setActive(null);
    if (!stroke?.length) return;
    if (!tracing || !strokeOrder || !onTrace) {
      setStrokes([...strokes, stroke]);
      return;
    }
    const expected = strokeOrder.medians[strokes.length];
    if (!expected || !matchesStroke(stroke, expected)) {
      showFeedback('miss');
      return;
    }
    const next = [...strokes, stroke];
    setStrokes(next);
    if (next.length === strokeOrder.medians.length) {
      showFeedback('traced', () => {
        setStrokes([]);
        onTrace();
      });
    }
  }

  const path = (stroke: Stroke) => stroke.map((p, i) => `${i ? 'L' : 'M'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
  const medianPoints = (median: [number, number][]) => median
    .map(([x, y]) => `${(x * 0.09765625).toFixed(2)},${(87.890625 - y * 0.09765625).toFixed(2)}`)
    .join(' ');
  // Real stroke length in pad units. Safari does not reliably honour pathLength on polylines,
  // so the drawing animation dashes by the measured length instead.
  const medianLength = (median: [number, number][]) => median
    .reduce((total, [x, y], index) => index ? total + Math.hypot(x - median[index - 1][0], y - median[index - 1][1]) * 0.09765625 : 0, 0) + 1;

  // Each loop restarts three seconds after the last stroke has actually finished drawing (see
  // demoStrokeDrawn). Phones, Safari especially, can run the animation well behind schedule, and a
  // restart timed from the start cut off the last strokes. The timer here is only a fallback for
  // browsers that never report the animation ending.
  function runStrokeOrderCycle() {
    if (!strokeOrder) return;
    if (demoTimer.current !== null) window.clearTimeout(demoTimer.current);
    setDemoRun((run) => run + 1);
    const drawingDuration = Math.max((strokeOrder.strokes.length - 1) * 620 + 550, 550);
    demoTimer.current = window.setTimeout(runStrokeOrderCycle, drawingDuration * 4 + 3000);
  }

  function demoStrokeDrawn(event: React.AnimationEvent<SVGGElement>) {
    if (!(event.target instanceof Element)) return;
    // Safari often doesn't repaint an animation's final frame, so the last strokes of a character
    // stayed invisible even though they had finished drawing. A plain class change always repaints.
    // The group is re-keyed every loop, so the class is gone when the next loop starts.
    event.target.classList.add('is-drawn');
    if (!demoPlaying || !event.target.hasAttribute('data-last-stroke')) return;
    if (demoTimer.current !== null) window.clearTimeout(demoTimer.current);
    demoTimer.current = window.setTimeout(runStrokeOrderCycle, 3000);
  }

  function toggleStrokeOrder() {
    if (!strokeOrder) return;
    if (demoPlaying) {
      if (demoTimer.current !== null) window.clearTimeout(demoTimer.current);
      demoTimer.current = null;
      setDemoPlaying(false);
      setDemoRun(0);
      return;
    }

    setGuide(true);
    setDemoPlaying(true);
    runStrokeOrderCycle();
  }

  const strokeProgress = feedback === 'miss'
    ? `Try stroke ${strokes.length + 1} again`
    : feedback === 'traced'
      ? 'Traced!'
      : strokeOrder
        ? `${strokes.length} of ${strokeOrder.strokes.length} strokes drawn`
        : strokeOrderError
          ? `${strokes.length} strokes drawn`
          : 'Loading stroke order…';

  return (
    <section className="writing-panel" aria-label={`Writing practice for ${character}`}>
      <div className="panel-heading"><div><span className="label">WRITING DESK</span><h2>Trace the character</h2></div><span className="stroke-count" aria-live="polite">{strokeProgress}</span></div>
      <div className="practice-stage">
        <svg ref={frame} className={`writing-pad ${feedback ?? ''}`} viewBox="0 0 100 100" aria-label={`Canvas for practicing ${character}`} onPointerDown={start} onPointerMove={move} onPointerUp={end} onPointerCancel={end}>
          <title>{`Writing practice for ${character}`}</title>
          <line className="practice-grid" x1="50" y1="0" x2="50" y2="100" /><line className="practice-grid" x1="0" y1="50" x2="100" y2="50" />
          <line className="practice-grid diagonal" x1="0" y1="0" x2="100" y2="100" /><line className="practice-grid diagonal" x1="100" y1="0" x2="0" y2="100" />
          {guide && strokeOrder ? (
            <g className="stroke-order-guide" aria-hidden="true">
              <g className="stroke-order-outlines" transform="translate(0 87.890625) scale(.09765625 -.09765625)">
                {strokeOrder.strokes.map((stroke, index) => <path key={index} d={stroke} />)}
              </g>
              <g key={demoRun} className={`stroke-order-medians ${demoRun ? 'is-animating' : ''}`} onAnimationEnd={demoStrokeDrawn}>
                {strokeOrder.medians.map((median, index) => {
                  const [startX, startY] = median[0] ?? [0, 0];
                  const labelX = startX * 0.09765625;
                  const labelY = 87.890625 - startY * 0.09765625;
                  return (
                    <g key={index}>
                      <polyline points={medianPoints(median)} data-last-stroke={index === strokeOrder.medians.length - 1 ? '' : undefined} style={{ animationDelay: `${index * 0.62}s`, '--stroke-length': medianLength(median).toFixed(2) } as React.CSSProperties} />
                      <circle cx={labelX} cy={labelY} r={index > 8 ? 3.15 : 2.75} />
                      <text x={labelX} y={labelY + 0.2} textAnchor="middle">{index + 1}</text>
                    </g>
                  );
                })}
              </g>
            </g>
          ) : guide ? (
            <text className="character-guide" x="50" y="69" textAnchor="middle">{character}</text>
          ) : null}
          {strokes.map((stroke, index) => <path key={index} className="ink-stroke" d={path(stroke)} />)}{active && <path className="ink-stroke" d={path(active)} />}
        </svg>
        <div className="pad-actions">
          <button className={`tool-button ${guide ? 'active' : ''}`} onClick={() => setGuide(!guide)} aria-pressed={guide}><MapIcon size={17} /> Guide</button>
          <button className={`tool-button ${demoPlaying ? 'active' : ''}`} onClick={toggleStrokeOrder} disabled={!strokeOrder} aria-pressed={demoPlaying}>
            {demoPlaying ? <Pause size={17} fill="currentColor" /> : <Play size={17} fill="currentColor" />}
            {demoPlaying ? 'Pause' : 'Play'}
          </button>
          <button className="tool-button" onClick={() => setStrokes(strokes.slice(0, -1))} disabled={!strokes.length}><RotateCcw size={17} /> Undo</button>
          <button className="tool-button" onClick={() => setStrokes([])} disabled={!strokes.length}><Eraser size={17} /> Clear</button>
        </div>
      </div>
      <p className="pad-tip">{tracing
        ? 'Draw each stroke in order from its numbered start. A stroke that doesn’t follow the guide is erased so you can try again.'
        : 'Follow the numbered starts or press Play to loop the strokes with a three-second pause between demonstrations.'}</p>
    </section>
  );
}
