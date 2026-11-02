import { useMemo, useRef, useState } from 'react';

/**
 * 관리자 통계 그래프(13.9). 라이브러리 없이 SVG로 그린다.
 * 선 그래프: 여러 계열, 마우스를 올리면 세로선과 그 점의 값. 막대 그래프: 계열 하나.
 */
export interface Series { key: string; label: string; color: string; dashed?: boolean; values: number[] }

const H = 220, PAD_L = 40, PAD_R = 12, PAD_T = 12, PAD_B = 26;

/** 축 최댓값: 1·2·5 × 10ⁿ 중 값보다 큰 가장 작은 수 */
function niceMax(v: number) {
  if (v <= 0) return 4;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  for (const m of [1, 2, 4, 5, 10]) if (m * p >= v) return m * p;
  return 10 * p;
}

const fmtNum = (v: number) => (Number.isInteger(v) ? v.toLocaleString() : v.toFixed(1));

export function LineChart({ labels, series, liveLast, height = H }: {
  labels: string[]; series: Series[]; liveLast?: boolean; height?: number;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const W = 720;
  const shown = series.filter((s) => !hidden.has(s.key));
  const max = niceMax(Math.max(0, ...shown.flatMap((s) => s.values)));
  const n = labels.length;
  const x = (i: number) => PAD_L + (n <= 1 ? 0 : (i / (n - 1)) * (W - PAD_L - PAD_R));
  const y = (v: number) => PAD_T + (1 - v / max) * (height - PAD_T - PAD_B);
  const tickEvery = Math.max(1, Math.ceil(n / 8));

  const paths = useMemo(() => shown.map((s) => {
    const pts = s.values.map((v, i) => [x(i), y(v)] as const);
    const full = liveLast && pts.length > 1 ? pts.slice(0, -1) : pts;
    const d = full.map(([px, py], i) => `${i ? 'L' : 'M'}${px.toFixed(1)},${py.toFixed(1)}`).join('');
    const live = liveLast && pts.length > 1 ? `M${pts[pts.length - 2][0]},${pts[pts.length - 2][1]}L${pts[pts.length - 1][0]},${pts[pts.length - 1][1]}` : '';
    return { s, d, live };
  }), [shown, n, max, height, liveLast]); // eslint-disable-line react-hooks/exhaustive-deps

  const onMove = (e: React.MouseEvent) => {
    const r = wrap.current?.getBoundingClientRect();
    if (!r || n === 0) return;
    const px = ((e.clientX - r.left) / r.width) * W;
    const i = Math.round(((px - PAD_L) / (W - PAD_L - PAD_R)) * (n - 1));
    setHover(Math.max(0, Math.min(n - 1, i)));
  };

  return (
    <div className="admin-chart" ref={wrap} onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
      <svg viewBox={`0 0 ${W} ${height}`} role="img" aria-label={series.map((s) => s.label).join(', ')}>
        {[0, 0.25, 0.5, 0.75, 1].map((f) => (
          <g key={f}>
            <line x1={PAD_L} x2={W - PAD_R} y1={y(max * f)} y2={y(max * f)} className="grid" />
            <text x={PAD_L - 6} y={y(max * f) + 4} textAnchor="end" className="axis">{fmtNum(max * f)}</text>
          </g>
        ))}
        {labels.map((l, i) => (i % tickEvery === 0 || i === n - 1) && (
          <text key={i} x={x(i)} y={height - 8} textAnchor="middle" className="axis">{l}</text>
        ))}
        {paths.map(({ s, d, live }) => (
          <g key={s.key}>
            <path d={d} fill="none" stroke={s.color} strokeWidth={2} strokeDasharray={s.dashed ? '5 4' : undefined} />
            {live && <path d={live} fill="none" stroke={s.color} strokeWidth={2} strokeDasharray="2 4" opacity={0.8} />}
          </g>
        ))}
        {hover !== null && (
          <g>
            <line x1={x(hover)} x2={x(hover)} y1={PAD_T} y2={height - PAD_B} className="hover" />
            {shown.map((s) => <circle key={s.key} cx={x(hover)} cy={y(s.values[hover] ?? 0)} r={3.5} fill={s.color} />)}
          </g>
        )}
      </svg>
      {hover !== null && (
        <div className="admin-chart-tip" style={{ left: `${(x(hover) / W) * 100}%` }}>
          <strong>{labels[hover]}{liveLast && hover === n - 1 ? ' (집계 중)' : ''}</strong>
          {shown.map((s) => <span key={s.key}><i style={{ background: s.color }} />{s.label} {fmtNum(s.values[hover] ?? 0)}</span>)}
        </div>
      )}
      <div className="admin-legend">
        {series.map((s) => (
          <button key={s.key} type="button" className={hidden.has(s.key) ? 'off' : undefined} aria-pressed={!hidden.has(s.key)}
                  onClick={() => setHidden((h) => { const nh = new Set(h); if (nh.has(s.key)) nh.delete(s.key); else nh.add(s.key); return nh; })}>
            <i style={{ background: s.color }} />{s.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function BarChart({ labels, values, color = '#3fb68b', height = 180 }: { labels: string[]; values: number[]; color?: string; height?: number }) {
  const W = 720;
  const max = niceMax(Math.max(0, ...values));
  const n = labels.length;
  const slot = (W - PAD_L - PAD_R) / Math.max(1, n);
  const y = (v: number) => PAD_T + (1 - v / max) * (height - PAD_T - PAD_B);
  return (
    <div className="admin-chart">
      <svg viewBox={`0 0 ${W} ${height}`} role="img" aria-label="막대 그래프">
        {[0, 0.5, 1].map((f) => (
          <g key={f}>
            <line x1={PAD_L} x2={W - PAD_R} y1={y(max * f)} y2={y(max * f)} className="grid" />
            <text x={PAD_L - 6} y={y(max * f) + 4} textAnchor="end" className="axis">{fmtNum(max * f)}</text>
          </g>
        ))}
        {values.map((v, i) => {
          const bx = PAD_L + i * slot + slot * 0.15, bw = slot * 0.7;
          return (
            <g key={i}>
              <rect x={bx} y={y(v)} width={bw} height={Math.max(0, height - PAD_B - y(v))} fill={color} rx={3}><title>{`${labels[i]}: ${v.toLocaleString()}`}</title></rect>
              {v > 0 && <text x={bx + bw / 2} y={y(v) - 4} textAnchor="middle" className="axis">{v.toLocaleString()}</text>}
              <text x={bx + bw / 2} y={height - 8} textAnchor="middle" className="axis">{labels[i]}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

/** 작은 추이 선(대시보드 카드용). 마지막 점(집계 중)은 점으로 표시 */
export function Sparkline({ values, color = '#3fb68b', width = 120, height = 32 }: { values: number[]; color?: string; width?: number; height?: number }) {
  if (values.length < 2) return <svg width={width} height={height} aria-hidden="true" />;
  const max = Math.max(1, ...values);
  const x = (i: number) => (i / (values.length - 1)) * (width - 4) + 2;
  const y = (v: number) => height - 3 - (v / max) * (height - 6);
  const d = values.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join('');
  const area = `${d}L${x(values.length - 1)},${height}L${x(0)},${height}Z`;
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="sparkline" aria-hidden="true">
      <path d={area} fill={color} opacity={0.15} />
      <path d={d} fill="none" stroke={color} strokeWidth={1.6} />
      <circle cx={x(values.length - 1)} cy={y(values[values.length - 1])} r={2.4} fill={color} />
    </svg>
  );
}
