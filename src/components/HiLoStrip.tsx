import type { CSSProperties } from 'react';
import type { HiLoEvent } from '../iwls/client';
import { dayColorIndex, formatLocalDate, formatLocalTime } from '../lib/time';

interface Props {
  events: HiLoEvent[];
  nowMs: number;
}

export function HiLoStrip({ events, nowMs }: Props) {
  const upcoming = events.filter((e) => e.t >= nowMs).slice(0, 6);
  if (!upcoming.length) {
    return <div className="hilo-strip hilo-strip--empty">No upcoming high/low data.</div>;
  }
  return (
    <ul className="hilo-strip" aria-label="Upcoming tide extremes">
      {upcoming.map((e) => {
        const idx = dayColorIndex(e.t);
        // Matches --day-{idx} in tokens.css and the tide-chart day bands,
        // so the user can visually link a card to a day on the graph.
        const style = { background: `var(--day-${idx})` } as CSSProperties;
        return (
          <li
            key={e.t}
            className={`hilo-strip__item hilo-strip__item--${e.type.toLowerCase()}`}
            style={style}
          >
            <span className="hilo-strip__type">{e.type}</span>
            <span className="hilo-strip__value">{e.v.toFixed(1)} m</span>
            <span className="hilo-strip__time">{formatLocalTime(e.t)}</span>
            <span className="hilo-strip__date">{formatLocalDate(e.t)}</span>
          </li>
        );
      })}
    </ul>
  );
}
