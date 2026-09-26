'use client';

import { ChevronDown, ChevronUp } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { DICTIONARY_FILTERS, type DictionaryFilterId } from './dictionary-filters';

// Rows of topics shown before the learner asks for the full list.
const COLLAPSED_ROWS = 2;

export function DictionaryFilterBar({ active, counts, onSelect }: {
  active: DictionaryFilterId;
  counts: Record<string, number>;
  onSelect: (filter: DictionaryFilterId) => void;
}) {
  const grid = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(false);
  // Columns in the topic grid, or null on phones where every topic sits in one scrolling row.
  const [columns, setColumns] = useState<number | null>(6);

  useEffect(() => {
    const element = grid.current;
    if (!element) return;
    const phone = window.matchMedia('(max-width:760px)');
    const measure = () => {
      if (phone.matches) return setColumns(null);
      setColumns(Math.max(getComputedStyle(element).gridTemplateColumns.split(' ').length, 1));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    phone.addEventListener('change', measure);
    return () => {
      observer.disconnect();
      phone.removeEventListener('change', measure);
    };
  }, []);

  // One cell of the collapsed grid is kept for the "more" toggle.
  const collapsedCount = columns === null ? DICTIONARY_FILTERS.length : columns * COLLAPSED_ROWS - 1;
  const collapsible = DICTIONARY_FILTERS.length > collapsedCount + 1;
  let shown: readonly (typeof DICTIONARY_FILTERS)[number][] = DICTIONARY_FILTERS;
  if (collapsible && !expanded) {
    shown = DICTIONARY_FILTERS.slice(0, collapsedCount);
    // Keep the selected topic in view even when it sits in the hidden part of the list.
    const activeIndex = DICTIONARY_FILTERS.findIndex((filter) => filter.id === active);
    if (activeIndex >= collapsedCount) shown = [...shown.slice(0, -1), DICTIONARY_FILTERS[activeIndex]];
  }
  const hiddenCount = DICTIONARY_FILTERS.length - shown.length;

  return (
    <nav className="dictionary-filters" aria-label="Filter dictionary by topic">
      <span className="label" id="dictionary-filter-label">FILTER BY TOPIC</span>
      <div ref={grid} className="filter-grid" id="dictionary-filter-grid" aria-labelledby="dictionary-filter-label">
        {shown.map((filter) => (
          <button key={filter.id} aria-pressed={active === filter.id} onClick={() => onSelect(filter.id)}>
            <span>{filter.label}</span>
            <small>{(counts[filter.id] ?? 0).toLocaleString()}</small>
          </button>
        ))}
        {collapsible && (
          <button className="filter-more" onClick={() => setExpanded(!expanded)} aria-expanded={expanded} aria-controls="dictionary-filter-grid">
            <span>{expanded ? 'Fewer topics' : `+${hiddenCount} more`}</span>
            {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
        )}
      </div>
    </nav>
  );
}
