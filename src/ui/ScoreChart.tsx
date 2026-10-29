import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { ScoreHistory } from '../api/types';
import { niceMax, smoothPath } from './chartMath';

const HEIGHT = 170;
const PAD = { top: 16, right: 12, bottom: 24, left: 40 };
const COLOR = '#3fb68b';

/** 내 점수 추이(4.15): 현재 유행도의 시간·하루 단위 선 그래프. 마지막 점은 지금 값이라 점선으로 잇고 깜빡인다. */
export function ScoreChart({ history }: { history: ScoreHistory }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(520);
  const [hover, setHover] = useState<number | null>(null);
  const points = history.points;
  const hourly = history.range === '24h';

  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (el && el.clientWidth > 0) setWidth(Math.max(240, el.clientWidth));
  }, []);
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(240, Math.floor(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const fmt = useMemo(() => {
    const tz = history.timezone;
    const tick = new Intl.DateTimeFormat('ko-KR', hourly ? { hour: 'numeric', timeZone: tz } : { month: 'numeric', day: 'numeric', timeZone: tz });
    const full = new Intl.DateTimeFormat('ko-KR', hourly ? { month: 'numeric', day: 'numeric', hour: 'numeric', timeZone: tz } : { month: 'long', day: 'numeric', weekday: 'short', timeZone: tz });
    return { tick: (t: string) => tick.format(new Date(t)), full: (t: string) => full.format(new Date(t)) };
  }, [history.timezone, hourly]);

  const innerW = width - PAD.left - PAD.right, innerH = HEIGHT - PAD.top - PAD.bottom;
  const yMax = niceMax(Math.max(1, ...points.map((p) => p.score)));
  const x = (i: number) => PAD.left + (points.length === 1 ? innerW / 2 : (i / (points.length - 1)) * innerW);
  const y = (v: number) => PAD.top + innerH - (v / yMax) * innerH;
  const done = points.slice(0, -1).map((p, i) => [x(i), y(p.score)] as [number, number]);
  const last = points.length - 1;
  const line = smoothPath(done);
  const area = done.length ? `${line} L${done[done.length - 1][0]},${PAD.top + innerH} L${done[0][0]},${PAD.top + innerH} Z` : '';
  const labelEvery = Math.max(1, Math.ceil(points.length / 6));
  const hp = hover === null ? null : points[hover];

  function onMove(e: React.PointerEvent<SVGRectElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    setHover(Math.max(0, Math.min(last, Math.round(((e.clientX - rect.left) / rect.width) * last))));
  }

  return (
    <div className="activity-chart score-chart" ref={wrapRef}>
      <svg width={width} height={HEIGHT} role="img" aria-label={summary(history, fmt.full)} className="chart-svg">
        <defs>
          <linearGradient id="grad-score" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={COLOR} stopOpacity="0.3" /><stop offset="100%" stopColor={COLOR} stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0, 0.5, 1].map((f) => (
          <g key={f}>
            <line x1={PAD.left} x2={width - PAD.right} y1={PAD.top + innerH * (1 - f)} y2={PAD.top + innerH * (1 - f)} className="chart-grid" />
            <text x={PAD.left - 6} y={PAD.top + innerH * (1 - f) + 4} className="chart-axis" textAnchor="end">{(yMax * f).toLocaleString()}</text>
          </g>
        ))}
        {points.map((p, i) => (i % labelEvery === 0 || i === last) && (
          <text key={p.t} x={x(i)} y={HEIGHT - 6} className="chart-axis" textAnchor={i === 0 ? 'start' : i === last ? 'end' : 'middle'}>
            {p.live ? (hourly ? '지금' : '오늘') : fmt.tick(p.t)}
          </text>
        ))}
        <path d={area} fill="url(#grad-score)" />
        <path d={line} className="chart-line" stroke={COLOR} />
        {last > 0 && <path d={`M${x(last - 1)},${y(points[last - 1].score)} L${x(last)},${y(points[last].score)}`} className="chart-line live" stroke={COLOR} />}
        <g className="chart-live-dot"><circle cx={x(last)} cy={y(points[last].score)} r="4" fill={COLOR} /></g>
        {hp && hover !== null && (
          <g pointerEvents="none">
            <line x1={x(hover)} x2={x(hover)} y1={PAD.top} y2={PAD.top + innerH} className="chart-guide" />
            <circle cx={x(hover)} cy={y(hp.score)} r="4.5" fill={COLOR} className="chart-hover-dot" />
          </g>
        )}
        <rect x={PAD.left} y={PAD.top} width={innerW} height={innerH} fill="transparent"
              onPointerMove={onMove} onPointerDown={onMove} onPointerLeave={() => setHover(null)} />
      </svg>
      {hp && hover !== null && (
        <div className="chart-tooltip" style={{ left: Math.min(Math.max(x(hover), 60), width - 60) }}>
          <strong>{fmt.full(hp.t)}{hp.live ? ' · 지금' : ''}</strong>
          <span><i style={{ background: COLOR }} />유행도 {hp.score.toLocaleString()}</span>
        </div>
      )}
      <p className="chart-summary">{summary(history, fmt.full)}</p>
    </div>
  );
}

/** 요약 문장: "7일 전 120점 → 지금 148점" */
function summary(h: ScoreHistory, full: (t: string) => string) {
  const first = h.points[0], now = h.points[h.points.length - 1];
  const label = { '24h': '24시간 전', '7d': '7일 전', '30d': '30일 전', all: `${full(first.t)}` }[h.range];
  const diff = now.score - first.score;
  const change = diff === 0 ? '그대로예요' : diff > 0 ? `${diff.toLocaleString()}점 올랐어요` : `${(-diff).toLocaleString()}점 내려갔어요`;
  return `${label} ${first.score.toLocaleString()}점 → 지금 ${now.score.toLocaleString()}점, ${change}.`;
}
