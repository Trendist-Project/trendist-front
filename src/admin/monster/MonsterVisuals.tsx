import { useState } from 'react';
import { kindIcon, num, type Pattern, type Seg } from './meta';

/** 몬스터 그림(public/monsters/<image>.svg). 그림이 없거나 못 불러오면 분류 아이콘으로 대신한다 */
export function Portrait({ image, kind, name, size = 64 }: { image: string | null; kind: string; name: string; size?: number }) {
  const [broken, setBroken] = useState(false);
  return (
    <span className="mn-portrait" style={{ width: size, height: size }} aria-hidden={!image || broken ? undefined : true}>
      {image && !broken
        ? <img src={`/monsters/${image}.svg`} alt={name} width={size} height={size} onError={() => setBroken(true)} />
        : <span className="mn-portrait-fallback" style={{ fontSize: size * 0.5 }} role="img" aria-label={name}>{kindIcon(kind)}</span>}
    </span>
  );
}

/** 몸 크기 비교: 몬스터와 일반 원(가장 작은 원·가장 큰 원, 기본 설정 기준)을 같은 눈금으로 그린다 */
export function SizeCompare({ radius }: { radius: number }) {
  const MIN = 30, MAX = 300; // 게임 기본 min_radius·max_radius
  const bossR = 52, k = bossR / radius, cy = 62;
  return (
    <figure className="mn-size">
      <svg viewBox="0 0 280 124" role="img" aria-label={`몬스터 지름 ${num(radius * 2)}px, 가장 큰 원 지름 ${MAX * 2}px`}>
        <circle cx="70" cy={cy} r={bossR} className="mn-size-boss" />
        <text x="70" y={cy + 4} textAnchor="middle" className="mn-size-label">몬스터</text>
        <circle cx="182" cy={cy} r={Math.max(1.5, MAX * k)} className="mn-size-max" />
        <circle cx="222" cy={cy} r={Math.max(1, MIN * k)} className="mn-size-min" />
        <text x="182" y={cy + 30} textAnchor="middle" className="mn-size-cap">최대 원</text>
        <text x="228" y={cy + 30} textAnchor="middle" className="mn-size-cap">최소 원</text>
      </svg>
      <figcaption>지름 <b>{num(radius * 2)}px</b> · 가장 큰 원(지름 {MAX * 2}px)의 <b>{(radius / MAX).toFixed(1)}배</b></figcaption>
    </figure>
  );
}

/** 패턴 도식: 돌진은 화살표, 충격고리는 퍼지는 고리, 그 밖은 아이콘 */
export function PatternDiagram({ pattern }: { pattern: Pattern }) {
  return (
    <svg className="mn-diagram" viewBox="0 0 120 80" role="img" aria-label={pattern.hint || pattern.name}>
      {pattern.diagram === 'line' && (
        <>
          <circle cx="24" cy="40" r="16" className="mn-dg-body" />
          <path d="M44 40 H94" className="mn-dg-path" markerEnd="url(#mn-arrow)" />
          <defs><marker id="mn-arrow" viewBox="0 0 8 8" refX="6" refY="4" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0 L8 4 L0 8 z" fill="#ff6b5a" /></marker></defs>
          <circle cx="104" cy="40" r="6" className="mn-dg-target" />
        </>
      )}
      {pattern.diagram === 'ring' && (
        <>
          <circle cx="60" cy="40" r="10" className="mn-dg-body" />
          <circle cx="60" cy="40" r="22" className="mn-dg-ring r1" />
          <circle cx="60" cy="40" r="34" className="mn-dg-ring r2" />
          <circle cx="60" cy="40" r="46" className="mn-dg-ring r3" />
        </>
      )}
      {pattern.diagram === 'generic' && <text x="60" y="52" textAnchor="middle" className="mn-dg-icon">{pattern.icon}</text>}
    </svg>
  );
}

/** 시간 흐름 막대: 예고 → 실행 → 경직. 길이는 초에 비례하고(맵 끝까지처럼 모르는 칸은 일정 폭) 각 칸에 초를 적는다 */
export function Timeline({ segs }: { segs: Seg[] }) {
  if (segs.length === 0) return null;
  const total = segs.reduce((a, s) => a + (s.seconds ?? 2), 0) || 1;
  return (
    <ol className="mn-timeline" aria-label="시간 흐름">
      {segs.map((s) => (
        <li key={s.label} className={s.tone} style={{ flexGrow: Math.max(0.12, (s.seconds ?? 2) / total) * 100 }}>
          <b>{s.label}</b><span>{s.seconds === null ? s.note ?? '-' : `${Number(s.seconds.toFixed(2))}초`}</span>
        </li>
      ))}
    </ol>
  );
}
