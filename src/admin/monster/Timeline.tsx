import { useEffect, useMemo, useState } from 'react';
import { adminApi, type AdminMonsterTimeline, type AdminMonsterTimelineEntry } from '../../api/client';
import { Portrait } from './MonsterVisuals';

const STATUS: Record<string, { label: string; cls: string }> = {
  ACTIVE: { label: '싸우는 중', cls: 'live' }, KILLED: { label: '처치', cls: 'killed' }, TIMEOUT: { label: '시간 초과', cls: 'timeout' },
  REMOVED: { label: '제거', cls: 'removed' }, SCHEDULED: { label: '예정', cls: 'scheduled' },
};
const DAYS = ['일', '월', '화', '수', '목', '금', '토'];

const hourLabel = (iso: string) => `${String(new Date(iso).getHours()).padStart(2, '0')}시`;
const dayLabel = (iso: string) => { const d = new Date(iso); return `${d.getMonth() + 1}/${d.getDate()} (${DAYS[d.getDay()]})`; };
const sameHour = (a: string, b: string) => Math.floor(Date.parse(a) / 3_600_000) === Math.floor(Date.parse(b) / 3_600_000);

/** 칸 하나: 그 시간·나라에 나온(또는 나올) 보스들. 지난 칸이 비었으면 등장이 없었던 시간(접속자가 없어 건너뛰었거나 정기 등장이 꺼져 있었다) */
function Cell({ list, future, onPick }: { list: AdminMonsterTimelineEntry[]; future: boolean; onPick: (code: string) => void }) {
  if (list.length === 0) return <span className="mn-tl-none" title={future ? '나올 보스가 없어요(정기 등장이 켜진 보스가 없어요)' : '등장 없음(접속자가 없어 건너뛰었거나 정기 등장이 꺼져 있었어요)'}>—</span>;
  return (
    <ul className="mn-tl-cell">
      {list.map((e, i) => {
        const st = STATUS[e.status] ?? { label: e.status, cls: '' };
        const tip = `${e.name} · ${st.label}${e.source === 'ADMIN' ? ' · 관리자 소환' : ''}${e.status !== 'SCHEDULED' && e.maxHp > 0 ? ` · 참여 ${e.participants}명` : ''}`;
        return (
          <li key={`${e.code}-${e.startedAt}-${i}`}>
            <button type="button" className={`mn-tl-boss ${st.cls}`} title={tip} onClick={() => onPick(e.code)}>
              <Portrait image={e.image} kind="BOSS" name={e.name} size={30} />
              <span className="nm">{e.name}</span>
              <span className={`mn-tl-badge ${st.cls}`}>{st.label}</span>
              {e.source === 'ADMIN' && <span className="mn-tl-badge admin">관리자</span>}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * 시간별 출현표(4.35, 13.16): 정각마다 나라별로 어떤 보스가 나왔는지(지난 24시간)와 나올 예정인지(앞으로 12시간)를 한눈에 보여 준다. 미래가 위, 지금 시간이 강조된다.
 * 지난 칸은 등장 기록(관리자 소환 포함)이고 예정 칸은 서버가 예고·등장과 같은 뽑기로 미리 계산한 값이다(정기 등장이 켜진 보스만).
 * 위쪽에는 지난 24시간 동안 보스별로 몇 번 나왔는지 요약이 붙는다. 보스 칸을 누르면 아래 상세가 그 보스로 바뀐다.
 */
export function TimelinePanel({ tick, onPick, onError }: { tick: number; onPick: (code: string) => void; onError: (m: string) => void }) {
  const [tl, setTl] = useState<AdminMonsterTimeline | null>(null);
  useEffect(() => {
    let alive = true;
    adminApi.monsterTimeline(24, 12).then((t) => { if (alive) setTl(t); }).catch((e) => { if (alive) onError(e instanceof Error ? e.message : '출현표를 불러오지 못했어요'); });
    return () => { alive = false; };
  }, [tick]); // eslint-disable-line react-hooks/exhaustive-deps

  /** 지난 24시간 보스별 등장 횟수(나라별) */
  const summary = useMemo(() => {
    const out = new Map<string, { name: string; image: string | null; byCountry: Record<string, number> }>();
    if (!tl) return [];
    for (const row of tl.rows) for (const c of tl.countries) for (const e of row.cells[c] ?? []) {
      if (e.status === 'SCHEDULED') continue;
      const cur = out.get(e.code) ?? { name: e.name, image: e.image, byCountry: {} };
      cur.byCountry[c] = (cur.byCountry[c] ?? 0) + 1;
      out.set(e.code, cur);
    }
    return [...out.entries()].map(([code, v]) => ({ code, ...v, total: Object.values(v.byCountry).reduce((a, b) => a + b, 0) })).sort((a, b) => b.total - a.total);
  }, [tl]);

  if (!tl) return <p className="muted">불러오는 중…</p>;
  let lastDay = '';
  return (
    <div className="mn-tl-wrap">
      {summary.length > 0 && (
        <ul className="mn-tl-summary" aria-label="지난 24시간 보스별 등장 횟수">
          {summary.map((s) => (
            <li key={s.code}>
              <button type="button" onClick={() => onPick(s.code)} title={`${s.name}: ${tl.countries.map((c) => `${c} ${s.byCountry[c] ?? 0}회`).join(' · ')}`}>
                <Portrait image={s.image} kind="BOSS" name={s.name} size={26} />
                <span className="nm">{s.name}</span>
                <b>{s.total}회</b>
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="mn-tl-scroll" tabIndex={0} aria-label="시간별 출현표">
        <table className="mn-tl">
          <thead>
            <tr><th scope="col">시간</th>{tl.countries.map((c) => <th scope="col" key={c}>{c}</th>)}</tr>
          </thead>
          <tbody>
            {tl.rows.map((row) => {
              const future = Date.parse(row.hour) > Date.parse(tl.now), current = sameHour(row.hour, tl.now), day = dayLabel(row.hour);
              const header = day !== lastDay; lastDay = day;
              return (
                <tr key={row.hour} className={`${current ? 'now' : ''}${future ? ' future' : ''}`} aria-current={current ? 'time' : undefined}>
                  <th scope="row">
                    {header && <small>{day}</small>}
                    <span>{hourLabel(row.hour)}{current && <em>지금</em>}</span>
                  </th>
                  {tl.countries.map((c) => <td key={c}><Cell list={row.cells[c] ?? []} future={future} onPick={onPick} /></td>)}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="muted small mn-tl-note">지난 칸의 "—"는 등장이 없던 시간이에요(접속자가 없어 건너뛰었거나 정기 등장이 꺼져 있었어요, 건너뛴 시간은 기록하지 않아요). "예정"은 정기 등장이 켜진 보스만 나와요.</p>
    </div>
  );
}
