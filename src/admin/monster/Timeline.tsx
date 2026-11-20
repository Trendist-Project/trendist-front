import { useEffect, useMemo, useRef, useState } from 'react';
import { adminApi, type AdminMonsterCycle, type AdminMonsterTimeline, type AdminMonsterTimelineEntry } from '../../api/client';
import { Portrait } from './MonsterVisuals';

/** 결과 하나는 기호·글자·색을 함께 쓴다(색만으로 구분하지 않는다). glyph는 그림 모서리의 동그라미에 들어간다 */
const STATUS: Record<string, { label: string; glyph: string; cls: string }> = {
  ACTIVE: { label: '싸우는 중', glyph: '⚔', cls: 'live' }, KILLED: { label: '처치', glyph: '✓', cls: 'killed' }, TIMEOUT: { label: '시간 초과', glyph: '⏱', cls: 'timeout' },
  REMOVED: { label: '제거', glyph: '✕', cls: 'removed' }, SCHEDULED: { label: '예정', glyph: '◷', cls: 'scheduled' },
};
const DAYS = ['일', '월', '화', '수', '목', '금', '토'];
/** 보스 고유색(테두리·점): 한눈에 "누구인지" 알아보게 한다. 모르는 보스는 코드로 정한 색 */
const BOSS_COLOR: Record<string, string> = {
  elder_turtle: '#6fbf73', moon_rabbit: '#c7b0f5', deep_octopus: '#9d6bff', electric_eel: '#2ed3ee', puffer_king: '#fbbf24', great_shark: '#94a3b8', great_whale: '#4f8ff7',
};
const bossColor = (code: string) => BOSS_COLOR[code] ?? `hsl(${[...code].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7)} 60% 62%)`;

const hourKey = (iso: string) => Math.floor(Date.parse(iso) / 3_600_000);
const hh = (iso: string) => `${String(new Date(iso).getHours()).padStart(2, '0')}시`;
const md = (iso: string) => { const d = new Date(iso); return `${d.getMonth() + 1}/${d.getDate()} (${DAYS[d.getDay()]})`; };

/** 칸의 대표 보스: 정기 등장(SCHEDULE·예정)을 먼저, 없으면 첫 번째. 나머지는 접어서 "+N"으로 보여 준다(관리자가 한 시간에 여러 번 소환해도 칸 높이가 늘지 않는다) */
const mainOf = (list: AdminMonsterTimelineEntry[]) => list.find((e) => e.source !== 'ADMIN') ?? list[0];
const hm = (iso: string) => { const d = new Date(iso); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };

interface Tile { hour: string; key: number; future: boolean; current: boolean; cells: Record<string, AdminMonsterTimelineEntry[]> }

/** 한 칸의 보스 타일: 고유색 테두리 + 큰 그림 + 모서리의 결과 기호 + 이름 + 결과 글자. 예정은 점선과 옅은 그림 */
function Boss({ e, country, hour, focus, onPick }: { e: AdminMonsterTimelineEntry; country: string; hour: string; focus: string | null; onPick: (code: string) => void }) {
  const st = STATUS[e.status] ?? { label: e.status, glyph: '·', cls: '' };
  const dim = focus !== null && focus !== e.code;
  const aria = `${country} ${md(hour)} ${hh(hour)} ${e.name} ${st.label}${e.source === 'ADMIN' ? ' (관리자 소환)' : ''}`;
  const tip = `${e.name} · ${st.label}${e.source === 'ADMIN' ? ' · 관리자 소환' : ''}${e.status !== 'SCHEDULED' && e.maxHp > 0 ? ` · 참여 ${e.participants}명` : ''}`;
  return (
    <button type="button" className={`tl-boss ${st.cls}${dim ? ' dim' : ''}`} style={{ '--c': bossColor(e.code) } as React.CSSProperties} title={tip} aria-label={aria} onClick={() => onPick(e.code)}>
      <span className="tl-art">
        <Portrait image={e.image} kind="BOSS" name={e.name} size={40} />
        <i className={`tl-glyph ${st.cls}`} aria-hidden="true">{st.glyph}</i>
        {e.source === 'ADMIN' && <i className="tl-admin" aria-hidden="true" title="관리자 소환">관리자</i>}
      </span>
      <span className="tl-name">{e.name}</span>
      <span className={`tl-state ${st.cls}`}>{st.label}</span>
    </button>
  );
}

/** 한 칸의 전체 기록 패널: "+N"을 누르면 표 아래에 펼쳐진다. 시각순 목록(시각·보스·결과·구분·참여 인원), 많아도 이 안에서만 스크롤한다 */
function CellDetail({ country, hour, list, onPick, onClose }: { country: string; hour: string; list: AdminMonsterTimelineEntry[]; onPick: (code: string) => void; onClose: () => void }) {
  const admin = list.filter((e) => e.source === 'ADMIN').length;
  return (
    <section className="tl-detail" aria-label={`${country} ${md(hour)} ${hh(hour)} 전체 기록`}>
      <header>
        <b>{country}</b><span>{md(hour)} {hh(hour)}</span><em>{list.length}건{admin > 0 ? ` (관리자 소환 ${admin})` : ''}</em>
        <button type="button" onClick={onClose} aria-label="닫기">✕</button>
      </header>
      <ul>
        {[...list].sort((a, b) => Date.parse(a.startedAt) - Date.parse(b.startedAt)).map((e, i) => {
          const st = STATUS[e.status] ?? { label: e.status, glyph: '·', cls: '' };
          return (
            <li key={`${e.code}-${e.startedAt}-${i}`}>
              <button type="button" onClick={() => onPick(e.code)} style={{ '--c': bossColor(e.code) } as React.CSSProperties}>
                <time dateTime={e.startedAt}>{hm(e.startedAt)}</time>
                <span className="tl-dart"><Portrait image={e.image} kind="BOSS" name={e.name} size={24} /></span>
                <span className="nm">{e.name}</span>
                <span className={`tl-pill ${st.cls}`}><i aria-hidden="true">{st.glyph}</i>{st.label}</span>
                <span className={`tl-src${e.source === 'ADMIN' ? ' by-admin' : ''}`}>{e.source === 'ADMIN' ? '관리자' : '정기'}</span>
                <span className="tl-part">{e.status === 'SCHEDULED' ? '' : e.maxHp > 0 ? `참여 ${e.participants}명` : ''}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** 이번 사이클 줄: 켜진 보스 수만큼의 정각을 순서대로 보여 준다(몇 번째인지, 지나간 칸이 실제로 나왔는지, 남은 칸) */
function CycleStrip({ country, cycle, tl, focus, onFocus }: { country: string; cycle: AdminMonsterCycle; tl: AdminMonsterTimeline; focus: string | null; onFocus: (c: string | null) => void }) {
  const spawned = (start: string) => (tl.rows.find((r) => hourKey(r.hour) === hourKey(start))?.cells[country] ?? []).some((e) => e.status !== 'SCHEDULED');
  return (
    <div className="tl-cycle">
      <div className="tl-cycle-head"><b>{country}</b><span><b>{Math.min(cycle.size, cycle.index + 1)}</b>/{cycle.size}</span><small>사이클</small></div>
      <ol>
        {cycle.items.map((it, i) => {
          const past = i < cycle.index, now = i === cycle.index;
          const ok = past ? spawned(it.start) : null;
          return (
            <li key={`${it.code}-${it.start}`} className={`${past ? 'past' : ''}${now ? ' now' : ''}${focus !== null && focus !== it.code ? ' dim' : ''}`} style={{ '--c': bossColor(it.code) } as React.CSSProperties}>
              <button type="button" onClick={() => onFocus(focus === it.code ? null : it.code)} title={`${i + 1}번째 · ${hh(it.start)} ${it.name}${past ? (ok ? ' · 나왔어요' : ' · 등장 없음(건너뜀)') : now ? ' · 지금 시간' : ' · 예정'}`}
                      aria-label={`${i + 1}번째 ${hh(it.start)} ${it.name}${past ? (ok ? ' 나옴' : ' 등장 없음') : now ? ' 지금' : ' 예정'}`}>
                <Portrait image={it.image} kind="BOSS" name={it.name} size={28} />
                <em>{i + 1}</em>
                {past && <i className={ok ? 'ok' : 'miss'} aria-hidden="true">{ok ? '✓' : '–'}</i>}
              </button>
              <small>{hh(it.start)}</small>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/**
 * 시간별 출현표(4.35, 13.16): 시간이 왼쪽(과거)에서 오른쪽(미래)으로 흐르는 나라별 두 줄 타임라인. 열릴 때 "지금"이 보이게 자동으로 스크롤한다.
 * 보스마다 고유색 테두리와 큰 그림으로 누구인지 한눈에 알아보고, 결과는 모서리 기호·글자·색을 함께 쓴다(✓ 처치 · ⏱ 시간 초과 · ✕ 제거 · ⚔ 싸우는 중 · ◷ 예정).
 * 위에는 이번 사이클 진행 줄(켜진 보스 수만큼의 정각, 보스마다 최소 한 번, 나라별로 나란히)이 있고, 사이클 칸을 누르면 그 보스만 도드라진다. 세로로 길어지지 않게 타일은 작게, 한 칸에 보스가 여럿이면 둘째부터 한 줄짜리로 보인다.
 * 타일을 누르면 아래 상세가 그 보스로 바뀐다.
 */
export function TimelinePanel({ tick, onPick, onError }: { tick: number; onPick: (code: string) => void; onError: (m: string) => void }) {
  const [tl, setTl] = useState<AdminMonsterTimeline | null>(null);
  const [focus, setFocus] = useState<string | null>(null);
  const [open, setOpen] = useState<{ country: string; hour: string } | null>(null); // "+N"으로 펼친 칸
  const scroller = useRef<HTMLDivElement>(null);
  const centered = useRef(false);

  useEffect(() => {
    let alive = true;
    adminApi.monsterTimeline(24, 12).then((t) => { if (alive) setTl(t); }).catch((e) => { if (alive) onError(e instanceof Error ? e.message : '출현표를 불러오지 못했어요'); });
    return () => { alive = false; };
  }, [tick]); // eslint-disable-line react-hooks/exhaustive-deps

  /** 시간순(왼쪽이 과거) 타일 목록 */
  const tiles: Tile[] = useMemo(() => {
    if (!tl) return [];
    const nowKey = hourKey(tl.now);
    return [...tl.rows].reverse().map((r) => ({ hour: r.hour, key: hourKey(r.hour), future: hourKey(r.hour) > nowKey, current: hourKey(r.hour) === nowKey, cells: r.cells }));
  }, [tl]);

  useEffect(() => {
    if (!open) return;
    const k = (ev: KeyboardEvent) => { if (ev.key === 'Escape') setOpen(null); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [open]);

  // 처음 그려질 때 "지금" 타일이 왼쪽에서 3분의 1쯤에 오게 스크롤한다(이후 새로 읽어도 사용자의 스크롤을 건드리지 않는다)
  useEffect(() => {
    if (!tl || centered.current || !scroller.current) return;
    const el = scroller.current.querySelector<HTMLElement>('[data-now="true"]');
    if (el) { scroller.current.scrollLeft = Math.max(0, el.offsetLeft - scroller.current.clientWidth / 3); centered.current = true; }
  }, [tl]);

  if (!tl) return <p className="muted">불러오는 중…</p>;
  const colsStyle = { gridTemplateColumns: `64px repeat(${tiles.length}, 84px)` } as React.CSSProperties;
  const jump = () => { const el = scroller.current?.querySelector<HTMLElement>('[data-now="true"]'); if (el && scroller.current) scroller.current.scrollTo({ left: Math.max(0, el.offsetLeft - scroller.current.clientWidth / 3), behavior: 'smooth' }); };

  return (
    <div className="tl">
      {Object.keys(tl.cycles).length > 0 && (
        <div className="tl-cycles">{tl.countries.filter((c) => tl.cycles[c]).map((c) => <CycleStrip key={c} country={c} cycle={tl.cycles[c]} tl={tl} focus={focus} onFocus={setFocus} />)}</div>
      )}

      <div className="tl-toolbar">
        <ul className="tl-legend" aria-label="범례">
          {Object.values(STATUS).map((st) => <li key={st.cls}><i className={`tl-glyph ${st.cls}`} aria-hidden="true">{st.glyph}</i>{st.label}</li>)}
          <li className="muted small" title="접속자가 없어 건너뛰었거나 정기 등장이 꺼져 있던 시간이에요(건너뛴 시간은 기록하지 않아요)">등장 없음 = 건너뜀</li>
        </ul>
        <button type="button" className="tl-now-btn" onClick={jump}>지금으로 이동</button>
      </div>

      <div className="tl-scroll" ref={scroller} tabIndex={0} role="group" aria-label="시간별 출현표(좌우로 스크롤)">
        <div className="tl-grid" style={colsStyle}>
          <div className="tl-corner" aria-hidden="true" />
          {tiles.map((t, i) => {
            const day = md(t.hour), newDay = i === 0 || md(tiles[i - 1].hour) !== day;
            return (
              <div key={t.hour} className={`tl-hour${t.current ? ' now' : ''}${t.future ? ' future' : ''}${newDay ? ' day' : ''}`} data-now={t.current ? 'true' : undefined}>
                {newDay && <small>{day}</small>}
                <span>{hh(t.hour)}{t.current && <em>지금</em>}</span>
              </div>
            );
          })}
          {tl.countries.map((c) => (
            <div className="tl-lane" key={c} style={{ display: 'contents' }}>
              <div className="tl-country" role="rowheader">{c}</div>
              {tiles.map((t, i) => {
                const list = t.cells[c] ?? [];
                const newDay = i === 0 || md(tiles[i - 1].hour) !== md(t.hour);
                return (
                  <div key={t.hour} className={`tl-cell${t.current ? ' now' : ''}${t.future ? ' future' : ''}${newDay ? ' day' : ''}`}>
                    {list.length === 0
                      ? <span className="tl-empty" title={t.future ? '나올 보스가 없어요(정기 등장이 켜진 보스가 없어요)' : '등장 없음(접속자가 없어 건너뛰었거나 정기 등장이 꺼져 있었어요)'}>{t.future ? '예정 없음' : '등장 없음'}</span>
                      : (() => {
                        const main = mainOf(list), rest = list.length - 1, adminRest = list.filter((e) => e !== main && e.source === 'ADMIN').length;
                        const opened = open?.country === c && open.hour === t.hour;
                        return (
                          <>
                            <Boss e={main} country={c} hour={t.hour} focus={focus} onPick={onPick} />
                            {rest > 0 && (
                              <button type="button" className={`tl-more${opened ? ' on' : ''}${adminRest === rest ? ' by-admin' : ''}`} aria-expanded={opened}
                                      title={`이 시간의 전체 기록 ${list.length}건 보기`} onClick={() => setOpen(opened ? null : { country: c, hour: t.hour })}>
                                {adminRest === rest ? '관리자 ' : ''}+{rest}
                              </button>
                            )}
                          </>
                        );
                      })()}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {open && (() => {
        const row = tl.rows.find((r) => r.hour === open.hour);
        const list = row?.cells[open.country] ?? [];
        return list.length > 1 ? <CellDetail country={open.country} hour={open.hour} list={list} onPick={onPick} onClose={() => setOpen(null)} /> : null;
      })()}
    </div>
  );
}
