import { useEffect, useMemo, useRef, useState } from 'react';
import type { Activity, ActivityPoint } from '../api/types';

const HEIGHT = 200;
const PAD = { top: 18, right: 40, bottom: 26, left: 34 };
const COLORS = { search: '#5aa9e6', plus: '#3fb68b', holders: '#f2b84b' };

interface Props { activity: Activity; showHolders: boolean }

/**
 * 키워드 활동 그래프(4.12). 검색 수(실선)와 + 수(파선)를 부드러운 곡선으로 그리고, 켜면 가진 사람 수를 오른쪽 축의 점선으로 겹친다.
 * 이번 시간·오늘은 집계 중이라 마지막 구간을 점선으로 그리고 끝점이 깜빡인다. 가장 높은 점에 "최고"를 단다.
 */
export function ActivityChart({ activity, showHolders }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(560);
  const [hover, setHover] = useState<number | null>(null);
  const points = activity.points;
  const hourly = activity.range === '24h';

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(Math.max(260, Math.floor(entry.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const fmt = useMemo(() => formatters(activity.timezone, hourly, activity.range), [activity.timezone, hourly, activity.range]);
  const innerW = width - PAD.left - PAD.right, innerH = HEIGHT - PAD.top - PAD.bottom;
  const yMax = niceMax(Math.max(1, ...points.map((p) => Math.max(p.search, p.plus))));
  const hMax = niceMax(Math.max(1, ...points.map((p) => p.holders)));
  const x = (i: number) => PAD.left + (points.length === 1 ? innerW / 2 : (i / (points.length - 1)) * innerW);
  const y = (v: number) => PAD.top + innerH - (v / yMax) * innerH;
  const yh = (v: number) => PAD.top + innerH - (v / hMax) * innerH;
  const empty = points.every((p) => p.search === 0 && p.plus === 0);
  const peak = empty ? -1 : points.reduce((best, p, i) => (p.search + p.plus > points[best].search + points[best].plus ? i : best), 0);
  const labelEvery = { '24h': 6, '7d': 1, '30d': 5, '180d': 30 }[activity.range];
  const lastDone = points.length - (points[points.length - 1]?.live ? 2 : 1);

  function onMove(e: React.PointerEvent<SVGRectElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = (e.clientX - rect.left) / rect.width;
    setHover(Math.max(0, Math.min(points.length - 1, Math.round(ratio * (points.length - 1)))));
  }

  const series = (key: 'search' | 'plus', scale: (v: number) => number) => {
    const done = points.slice(0, lastDone + 1).map((p, i) => [x(i), scale(p[key])] as [number, number]);
    const live = lastDone < points.length - 1
      ? [done[done.length - 1], [x(points.length - 1), scale(points[points.length - 1][key])] as [number, number]] : null;
    return { line: smoothPath(done), area: done.length ? `${smoothPath(done)} L${done[done.length - 1][0]},${PAD.top + innerH} L${done[0][0]},${PAD.top + innerH} Z` : '', live };
  };
  const s = series('search', y), p = series('plus', y);
  const holderPts = points.map((pt, i) => [x(i), yh(pt.holders)] as [number, number]);
  const hp = hover === null ? null : points[hover];

  return (
    <div className="activity-chart" ref={wrapRef}>
      {empty ? <p className="chart-empty muted">아직 기록이 없어요</p> : (
        <svg width={width} height={HEIGHT} role="img" aria-label={summary(activity, fmt)} className="chart-svg">
          <defs>
            <linearGradient id="grad-search" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={COLORS.search} stopOpacity="0.28" /><stop offset="100%" stopColor={COLORS.search} stopOpacity="0" />
            </linearGradient>
            <linearGradient id="grad-plus" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={COLORS.plus} stopOpacity="0.22" /><stop offset="100%" stopColor={COLORS.plus} stopOpacity="0" />
            </linearGradient>
            <clipPath id="chart-reveal"><rect className="chart-reveal" x="0" y="0" width={width} height={HEIGHT} /></clipPath>
          </defs>

          {/* 눈금: 왼쪽은 검색·+ 수, 오른쪽은 가진 사람 수 */}
          {[0, 0.5, 1].map((f) => (
            <g key={f}>
              <line x1={PAD.left} x2={width - PAD.right} y1={PAD.top + innerH * (1 - f)} y2={PAD.top + innerH * (1 - f)} className="chart-grid" />
              <text x={PAD.left - 6} y={PAD.top + innerH * (1 - f) + 4} className="chart-axis" textAnchor="end">{Math.round(yMax * f)}</text>
              {showHolders && <text x={width - PAD.right + 6} y={PAD.top + innerH * (1 - f) + 4} className="chart-axis holders">{Math.round(hMax * f)}</text>}
            </g>
          ))}
          {points.map((pt, i) => (i % labelEvery === 0 || i === points.length - 1) && (
            <text key={pt.t} x={x(i)} y={HEIGHT - 6} className="chart-axis" textAnchor={i === 0 ? 'start' : i === points.length - 1 ? 'end' : 'middle'}>
              {pt.live ? (hourly ? '지금' : '오늘') : fmt.tick(pt.t)}
            </text>
          ))}

          <g clipPath="url(#chart-reveal)">
            <path d={s.area} fill="url(#grad-search)" />
            <path d={p.area} fill="url(#grad-plus)" />
            <path d={s.line} className="chart-line" stroke={COLORS.search} />
            <path d={p.line} className="chart-line dashed" stroke={COLORS.plus} />
            {s.live && <path d={`M${s.live[0]} L${s.live[1]}`} className="chart-line live" stroke={COLORS.search} />}
            {p.live && <path d={`M${p.live[0]} L${p.live[1]}`} className="chart-line live" stroke={COLORS.plus} />}
            {showHolders && <path d={smoothPath(holderPts)} className="chart-line holders" stroke={COLORS.holders} />}
          </g>

          {peak >= 0 && (
            <g className="chart-peak">
              <circle cx={x(peak)} cy={y(Math.max(points[peak].search, points[peak].plus))} r="4" />
              <text x={x(peak)} y={y(Math.max(points[peak].search, points[peak].plus)) - 9} textAnchor="middle">최고</text>
            </g>
          )}
          {points[points.length - 1]?.live && (
            <g className="chart-live-dot">
              <circle cx={x(points.length - 1)} cy={y(points[points.length - 1].search)} r="3.5" fill={COLORS.search} />
              <circle cx={x(points.length - 1)} cy={y(points[points.length - 1].plus)} r="3.5" fill={COLORS.plus} />
            </g>
          )}

          {hover !== null && hp && (
            <g pointerEvents="none">
              <line x1={x(hover)} x2={x(hover)} y1={PAD.top} y2={PAD.top + innerH} className="chart-guide" />
              <circle cx={x(hover)} cy={y(hp.search)} r="4" fill={COLORS.search} className="chart-hover-dot" />
              <circle cx={x(hover)} cy={y(hp.plus)} r="4" fill={COLORS.plus} className="chart-hover-dot" />
              {showHolders && <circle cx={x(hover)} cy={yh(hp.holders)} r="3.5" fill={COLORS.holders} className="chart-hover-dot" />}
            </g>
          )}
          <rect x={PAD.left} y={PAD.top} width={innerW} height={innerH} fill="transparent"
                onPointerMove={onMove} onPointerDown={onMove} onPointerLeave={() => setHover(null)} />
        </svg>
      )}

      {!empty && hover !== null && hp && (
        <div className="chart-tooltip" style={{ left: Math.min(Math.max(x(hover), 70), width - 70) }}>
          <strong>{fmt.full(hp.t)}{hp.live ? ' · 집계 중' : ''}</strong>
          <span><i style={{ background: COLORS.search }} />검색 {hp.search.toLocaleString()}회</span>
          <span><i style={{ background: COLORS.plus }} />+ {hp.plus.toLocaleString()}회</span>
          {showHolders && <span><i style={{ background: COLORS.holders }} />가진 사람 {hp.holders.toLocaleString()}명</span>}
        </div>
      )}

      <div className="chart-legend" aria-hidden="true">
        <span><i className="solid" style={{ borderColor: COLORS.search }} />검색</span>
        <span><i className="dash" style={{ borderColor: COLORS.plus }} />+</span>
        {showHolders && <span><i className="dot" style={{ borderColor: COLORS.holders }} />가진 사람</span>}
      </div>
      <p className="chart-summary">{summary(activity, fmt)}</p>
    </div>
  );
}

function formatters(timeZone: string, hourly: boolean, range: string) {
  const tick = new Intl.DateTimeFormat('ko-KR', hourly ? { hour: 'numeric', timeZone } : range === '180d' ? { month: 'short', timeZone } : { month: 'numeric', day: 'numeric', timeZone });
  const full = new Intl.DateTimeFormat('ko-KR', hourly ? { month: 'numeric', day: 'numeric', hour: 'numeric', timeZone } : { month: 'long', day: 'numeric', weekday: 'short', timeZone });
  const hour = new Intl.DateTimeFormat('ko-KR', { hour: 'numeric', timeZone });
  return { tick: (t: string) => tick.format(new Date(t)), full: (t: string) => full.format(new Date(t)), hour: (t: string) => hour.format(new Date(t)) };
}

/** 그래프 아래 요약 문장(화면 낭독기도 읽는다). */
function summary(a: Activity, fmt: ReturnType<typeof formatters>) {
  const label = { '24h': '최근 24시간', '7d': '최근 7일', '30d': '최근 30일', '180d': '최근 180일' }[a.range];
  const search = a.points.reduce((n, p) => n + p.search, 0), plus = a.points.reduce((n, p) => n + p.plus, 0);
  if (search + plus === 0) return `${label} 동안 기록이 없어요. 지금 ${a.holders.toLocaleString()}명이 가지고 있어요.`;
  const best: ActivityPoint = a.points.reduce((b, p) => (p.search + p.plus > b.search + b.plus ? p : b));
  const when = a.range === '24h' ? `${fmt.hour(best.t)}에` : `${fmt.full(best.t)}에`;
  return `${label} 검색 ${search.toLocaleString()}회, + ${plus.toLocaleString()}회, ${when} 가장 많았어요.`;
}

/** 축 최댓값을 보기 좋은 수로 올린다(1, 2, 5 × 10ⁿ). */
function niceMax(v: number) {
  const exp = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / exp;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * exp;
}

/** 단조 3차 보간(Fritsch–Carlson): 부드럽지만 값 사이에서 위아래로 넘치지 않는 곡선. */
function smoothPath(pts: [number, number][]) {
  if (pts.length === 0) return '';
  if (pts.length === 1) return `M${pts[0][0]},${pts[0][1]}`;
  const n = pts.length, dx: number[] = [], m: number[] = [], t: number[] = new Array(n);
  for (let i = 0; i < n - 1; i++) { dx.push(pts[i + 1][0] - pts[i][0]); m.push((pts[i + 1][1] - pts[i][1]) / dx[i]); }
  t[0] = m[0]; t[n - 1] = m[n - 2];
  for (let i = 1; i < n - 1; i++) t[i] = m[i - 1] * m[i] <= 0 ? 0 : (3 * (dx[i - 1] + dx[i])) / ((2 * dx[i] + dx[i - 1]) / m[i - 1] + (dx[i] + 2 * dx[i - 1]) / m[i]);
  let d = `M${pts[0][0]},${pts[0][1]}`;
  for (let i = 0; i < n - 1; i++) {
    const h = dx[i] / 3;
    d += ` C${pts[i][0] + h},${pts[i][1] + h * t[i]} ${pts[i + 1][0] - h},${pts[i + 1][1] - h * t[i + 1]} ${pts[i + 1][0]},${pts[i + 1][1]}`;
  }
  return d;
}
