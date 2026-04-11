import { useEffect, useLayoutEffect, useRef } from 'react';
import uPlot, { type AlignedData } from 'uplot';
import 'uplot/dist/uPlot.min.css';
import type { HiLoEvent, TidePoint } from '../iwls/client';
import type { NightBand } from '../lib/sun';
import { formatLocalDateTime, formatLocalTime } from '../lib/time';

export interface TideChartProps {
  points: TidePoint[];
  hiLo: HiLoEvent[];
  nowMs: number;
  nightBands: NightBand[];
  fromMs: number;
  toMs: number;
}

interface ThemeTokens {
  line: string;
  grid: string;
  now: string;
  band: string;
  fg: string;
  stroke: number;
  labelFontPx: number;
  axisFontPx: number;
}

function readThemeTokens(): ThemeTokens {
  const s = getComputedStyle(document.documentElement);
  const sm = parseFloat(s.getPropertyValue('--font-size-sm')) || 14;
  return {
    line: s.getPropertyValue('--chart-line').trim() || '#0a66c2',
    grid: s.getPropertyValue('--chart-grid').trim() || '#e3e6ea',
    now: s.getPropertyValue('--chart-now').trim() || '#b42318',
    band: s.getPropertyValue('--chart-band').trim() || 'rgba(0,0,0,0.06)',
    fg: s.getPropertyValue('--fg').trim() || '#111418',
    stroke: parseFloat(s.getPropertyValue('--chart-stroke')) || 2,
    // Hi/lo markers need to be legible from arm's length, so they get a
    // bump over the axis ticks. Axis stays tied to --font-size-sm.
    labelFontPx: sm + 2,
    axisFontPx: sm,
  };
}

export function TideChart(props: TideChartProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const plotRef = useRef<uPlot | null>(null);

  // Recreate the plot whenever dimensions change. uPlot is DOM-imperative so
  // we tear down and rebuild rather than mutate options in place.
  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const build = () => {
      if (plotRef.current) {
        plotRef.current.destroy();
        plotRef.current = null;
      }
      if (!host.isConnected) return;
      const { width } = host.getBoundingClientRect();
      if (width === 0) return;
      // On narrow viewports (mobile) we want a taller chart since it's the
      // primary content. Clamp to [320, 480] and bias toward taller.
      const height = Math.max(320, Math.min(480, Math.round(width * 0.7)));
      const tokens = readThemeTokens();

      const xs = props.points.map((p) => p.t / 1000);
      const ys = props.points.map((p) => p.v);
      const data: AlignedData = [xs, ys];

      // Tooltip overlay elements. Created up-front so the setCursor hook
      // closure captures stable references. They're attached to `u.over`
      // after the plot is constructed below.
      const valueTip = document.createElement('div');
      valueTip.className = 'tide-chart__value-tip';
      valueTip.style.display = 'none';
      const timeTip = document.createElement('div');
      timeTip.className = 'tide-chart__time-tip';
      timeTip.style.display = 'none';

      const opts: uPlot.Options = {
        width,
        height,
        padding: [16, 16, 8, 8],
        scales: {
          x: { time: true, min: props.fromMs / 1000, max: props.toMs / 1000 },
          y: { auto: true },
        },
        axes: [
          {
            stroke: tokens.fg,
            grid: { stroke: tokens.grid, width: 1 },
            ticks: { stroke: tokens.grid, width: 1 },
            font: `500 ${tokens.axisFontPx}px -apple-system, system-ui, sans-serif`,
          },
          {
            stroke: tokens.fg,
            grid: { stroke: tokens.grid, width: 1 },
            ticks: { stroke: tokens.grid, width: 1 },
            font: `500 ${tokens.axisFontPx}px -apple-system, system-ui, sans-serif`,
            // Keep the left axis region tight: rotated "Height (m)" label
            // hugs the tick values, which hugs the plot area.
            size: 38,
            gap: 2,
            label: 'Height (m)',
            labelSize: 14,
            labelGap: 0,
            labelFont: `600 ${tokens.axisFontPx}px -apple-system, system-ui, sans-serif`,
          },
        ],
        series: [
          {},
          {
            label: 'Tide (m)',
            stroke: tokens.line,
            width: tokens.stroke,
            points: { show: false },
          },
        ],
        legend: { show: false },
        // Keep uPlot's built-in cursor (x-line + idx tracking) for hover;
        // disable drag-to-zoom and the default point marker since we draw
        // our own tooltip overlay below.
        cursor: { drag: { x: false, y: false }, points: { show: false } },
        hooks: {
          drawClear: [
            (u) => {
              const ctx = u.ctx;
              ctx.save();
              // Night shading: sunset → next sunrise, shaded vertical bands.
              ctx.fillStyle = tokens.band;
              for (const band of props.nightBands) {
                const x1 = Math.max(u.bbox.left, u.valToPos(band.from / 1000, 'x', true));
                const x2 = Math.min(
                  u.bbox.left + u.bbox.width,
                  u.valToPos(band.to / 1000, 'x', true),
                );
                if (x2 > x1) {
                  ctx.fillRect(x1, u.bbox.top, x2 - x1, u.bbox.height);
                }
              }
              ctx.restore();
            },
          ],
          draw: [
            (u) => {
              const ctx = u.ctx;
              ctx.save();

              // Now-line
              if (props.nowMs >= props.fromMs && props.nowMs <= props.toMs) {
                const x = u.valToPos(props.nowMs / 1000, 'x', true);
                ctx.strokeStyle = tokens.now;
                ctx.lineWidth = tokens.stroke;
                ctx.beginPath();
                ctx.moveTo(x, u.bbox.top);
                ctx.lineTo(x, u.bbox.top + u.bbox.height);
                ctx.stroke();
              }

              // Hi/lo markers
              ctx.fillStyle = tokens.fg;
              ctx.font = `700 ${tokens.labelFontPx}px -apple-system, system-ui, sans-serif`;
              ctx.textAlign = 'center';
              const dotR = Math.max(4, tokens.stroke + 2);
              const labelGap = Math.round(tokens.labelFontPx * 0.5);
              for (const e of props.hiLo) {
                if (e.t < props.fromMs || e.t > props.toMs) continue;
                const x = u.valToPos(e.t / 1000, 'x', true);
                const y = u.valToPos(e.v, 'y', true);
                ctx.beginPath();
                ctx.arc(x, y, dotR, 0, Math.PI * 2);
                ctx.fill();
                const label = `${formatLocalTime(e.t)} ${e.v.toFixed(1)}m`;
                ctx.textBaseline = e.type === 'HIGH' ? 'bottom' : 'top';
                ctx.fillText(label, x, e.type === 'HIGH' ? y - labelGap : y + labelGap);
              }
              ctx.restore();
            },
          ],
          setCursor: [
            (u) => {
              const { left, idx } = u.cursor;
              if (left == null || left < 0 || idx == null) {
                valueTip.style.display = 'none';
                timeTip.style.display = 'none';
                return;
              }
              const xs = u.data[0] as number[];
              const ys = u.data[1] as number[];
              if (!xs.length) return;

              // Linearly interpolate tide height at the exact cursor time
              // rather than snapping to the nearest 15-min sample.
              const tSec = u.posToVal(left, 'x');
              let i = idx;
              if (i > 0 && xs[i] > tSec) i -= 1;
              let v: number;
              if (i >= xs.length - 1) {
                v = ys[xs.length - 1];
              } else {
                const x0 = xs[i];
                const x1 = xs[i + 1];
                const y0 = ys[i];
                const y1 = ys[i + 1];
                const clamped = Math.max(x0, Math.min(x1, tSec));
                const frac = x1 === x0 ? 0 : (clamped - x0) / (x1 - x0);
                v = y0 + (y1 - y0) * frac;
              }
              const yPx = u.valToPos(v, 'y');

              valueTip.style.display = 'block';
              valueTip.style.left = `${left}px`;
              valueTip.style.top = `${yPx}px`;
              valueTip.textContent = `${v.toFixed(2)} m`;

              timeTip.style.display = 'block';
              timeTip.style.left = `${left}px`;
              timeTip.textContent = formatLocalDateTime(tSec * 1000);
            },
          ],
        },
      };

      plotRef.current = new uPlot(opts, data, host);

      // Append to `u.over` (the plot-area div uPlot already manages) so
      // cursor coordinates map straight to their `left`/`top` without any
      // bounding-box math. Destroyed automatically with the plot.
      plotRef.current.over.appendChild(valueTip);
      plotRef.current.over.appendChild(timeTip);
    };

    build();
    const ro = new ResizeObserver(() => build());
    ro.observe(host);
    return () => {
      ro.disconnect();
      if (plotRef.current) {
        plotRef.current.destroy();
        plotRef.current = null;
      }
    };
  }, [props.points, props.hiLo, props.nowMs, props.nightBands, props.fromMs, props.toMs]);

  // Re-draw on theme change (no data change).
  useEffect(() => {
    const mo = new MutationObserver(() => {
      if (!plotRef.current || !hostRef.current) return;
      // Trigger a rebuild via ResizeObserver path by setting width.
      plotRef.current.redraw(false, true);
    });
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => mo.disconnect();
  }, []);

  return <div className="tide-chart" ref={hostRef} />;
}
