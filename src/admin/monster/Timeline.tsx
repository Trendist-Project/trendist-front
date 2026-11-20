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

const hm = (iso: string) => { const d = new Date(iso); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
/** 나라 코드를 칩에 들어가게 줄인다(KR → KR, GLOBAL → GL) */
const cc = (c: string) => (c.length > 3 ? c.slice(0, 2) : c);
/** 한 시간에 여러 상태가 있을 때 타일에 보일 대표 상태(싸우는 중 > 처치 > 시간 초과 > 제거 > 예정) */
const RANK = ['ACTIVE', 'KILLED', 'TIMEOUT', 'REMOVED', 'SCHEDULED'];

type Rec = AdminMonsterTimelineEntry & { country: string };
interface Tile { hour: string; key: number; future: boolean; current: boolean; cells: Record<string, AdminMonsterTimelineEntry[]> }
/** 한 시간 칸: 대표 보스(서버마다 하나씩, 같은 보스) + 접힌 나머지 + 전체 기록 */
interface Slot { main: Rec[]; extras: Rec[]; all: Rec[] }

/**
 * 한 시간의 서버별 기록을 한 칸으로 합친다. 두 서버가 같은 시각에 같은 보스를 내므로 보스는 한 번만 그리고, 서버별 결과는 칩으로 붙인다.
 * 대표 보스는 정기 등장(예정 포함)을 먼저, 없으면 첫 기록이다. 서버마다 대표와 같은 보스의 기록 하나씩이 대표 묶음이고 나머지(관리자가 여러 번 소환한 것 등)는 "+N"으로 접힌다.
 */
function slotOf(cells: Record<string, AdminMonsterTimelineEntry[]>, countries: string[]): Slot | null {
  const all: Rec[] = countries.flatMap((c) => (cells[c] ?? []).map((e) => ({ ...e, country: c })));
  if (all.length === 0) return null;
  const lead = all.find((e) => e.source !== 'ADMIN') ?? all[0];
  const used = new Set<Rec>(), main: Rec[] = [];
  for (const c of countries) {
    const e = all.find((x) => x.country === c && x.code === lead.code && !used.has(x) && (lead.source === 'ADMIN' || x.source !== 'ADMIN'));
    if (e) { used.add(e); main.push(e); }
  }
  return { main, extras: all.filter((e) => !used.has(e)), all };
}

/**
 * 한 시간의 보스 타일: 고유색 테두리 + 그림 + 모서리의 대표 결과 기호 + 이름. 서버 결과가 모두 같으면 결과 글자 한 줄,
 * 서버마다 다르면(한쪽만 처치, 한쪽은 접속자가 없어 건너뜀 등) 서버별 칩(KR ✓ · GL ⏱)을 붙인다. 예정은 점선과 옅은 그림.
 */
function Boss({ main, countries, hour, focus, onPick }: { main: Rec[]; countries: string[]; hour: string; focus: string | null; onPick: (code: string) => void }) {
  const e = main[0];
  const overall = [...main].sort((a, b) => RANK.indexOf(a.status) - RANK.indexOf(b.status))[0].status;
  const st = STATUS[overall] ?? { label: overall, glyph: '·', cls: '' };
  const uniform = main.length === countries.length && new Set(main.map((m) => m.status)).size === 1;
  const dim = focus !== null && focus !== e.code;
  const detail = countries.map((c) => { const m = main.find((x) => x.country === c); return `${c} ${m ? (STATUS[m.status]?.label ?? m.status) : '등장 없음'}`; }).join(' · ');
  const byAdmin = e.source === 'ADMIN';
  return (
    <button type="button" className={`tl-boss ${st.cls}${dim ? ' dim' : ''}`} style={{ '--c': bossColor(e.code) } as React.CSSProperties} title={`${e.name}${byAdmin ? ' · 관리자 소환' : ''} · ${detail}`}
            aria-label={`${md(hour)} ${hh(hour)} ${e.name} ${detail}${byAdmin ? ' (관리자 소환)' : ''}`} onClick={() => onPick(e.code)}>
      <span className="tl-art">
        <Portrait image={e.image} kind="BOSS" name={e.name} size={40} />
        <i className={`tl-glyph ${st.cls}`} aria-hidden="true">{st.glyph}</i>
        {byAdmin && <i className="tl-admin" aria-hidden="true">관리자</i>}
      </span>
      <span className="tl-name">{e.name}</span>
      {uniform
        ? <span className={`tl-state ${st.cls}`}>{st.label}</span>
        : (
          <span className="tl-ccs">
            {countries.map((c) => {
              const m = main.find((x) => x.country === c), cs = m ? (STATUS[m.status] ?? { label: m.status, glyph: '·', cls: '' }) : { label: '등장 없음', glyph: '–', cls: 'none' };
              return <span key={c} className={`tl-cc ${cs.cls}`} title={`${c} ${cs.label}`}>{cc(c)}<i aria-hidden="true">{cs.glyph}</i></span>;
            })}
          </span>
        )}
    </button>
  );
}

/** 한 시간의 전체 기록 패널: "+N"을 누르면 표 아래에 펼쳐진다. 모든 서버의 기록을 시각순으로(시각·서버·보스·결과·구분·참여 인원), 많아도 이 안에서만 스크롤한다 */
function CellDetail({ hour, list, onPick, onClose }: { hour: string; list: Rec[]; onPick: (code: string) => void; onClose: () => void }) {
  const admin = list.filter((e) => e.source === 'ADMIN').length;
  return (
    <section className="tl-detail" aria-label={`${md(hour)} ${hh(hour)} 전체 기록`}>
      <header>
        <b>{md(hour)} {hh(hour)}</b><em>{list.length}건{admin > 0 ? ` (관리자 소환 ${admin})` : ''}</em>
        <button type="button" onClick={onClose} aria-label="닫기">✕</button>
      </header>
      <ul>
        {[...list].sort((a, b) => Date.parse(a.startedAt) - Date.parse(b.startedAt) || a.country.localeCompare(b.country)).map((e, i) => {
          const st = STATUS[e.status] ?? { label: e.status, glyph: '·', cls: '' };
          return (
            <li key={`${e.country}-${e.code}-${e.startedAt}-${i}`}>
              <button type="button" onClick={() => onPick(e.code)} style={{ '--c': bossColor(e.code) } as React.CSSProperties}>
                <time dateTime={e.startedAt}>{hm(e.startedAt)}</time>
                <span className="tl-ctry">{cc(e.country)}</span>
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
function CycleStrip({ label, countries, cycle, tl, focus, onFocus }: { label: string; countries: string[]; cycle: AdminMonsterCycle; tl: AdminMonsterTimeline; focus: string | null; onFocus: (c: string | null) => void }) {
  /** 지난 칸이 실제로 나왔는지: 이 줄이 묶은 서버 중 한 곳이라도 기록이 있으면 나온 것 */
  const spawned = (start: string) => countries.some((c) => (tl.rows.find((r) => hourKey(r.hour) === hourKey(start))?.cells[c] ?? []).some((e) => e.status !== 'SCHEDULED'));
  return (
    <div className="tl-cycle">
      <div className="tl-cycle-head"><b>{label}</b><span><b>{Math.min(cycle.size, cycle.index + 1)}</b>/{cycle.size}</span><small>사이클</small></div>
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
 * 시간별 출현표(4.35, 13.16): 시간이 왼쪽(과거)에서 오른쪽(미래)으로 흐르는 한 줄 타임라인(서버가 같은 시각에 같은 보스를 내므로 보스는 한 번만 그리고 서버별 결과는 칩으로 붙인다). 열릴 때 "지금"이 보이게 자동으로 스크롤한다.
 * 보스마다 고유색 테두리와 큰 그림으로 누구인지 한눈에 알아보고, 결과는 모서리 기호·글자·색을 함께 쓴다(✓ 처치 · ⏱ 시간 초과 · ✕ 제거 · ⚔ 싸우는 중 · ◷ 예정).
 * 위에는 이번 사이클 진행 줄(켜진 보스 수만큼의 정각, 보스마다 최소 한 번, 서버가 같으면 한 줄)이 있고, 사이클 칸을 누르면 그 보스만 도드라진다. 한 시간에 기록이 여럿이면 대표 보스만 보이고 나머지는 "+N"으로 접힌다.
 * 타일을 누르면 아래 상세가 그 보스로 바뀐다.
 */
export function TimelinePanel({ tick, onPick, onError }: { tick: number; onPick: (code: string) => void; onError: (m: string) => void }) {
  const [tl, setTl] = useState<AdminMonsterTimeline | null>(null);
  const [focus, setFocus] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null); // "+N"으로 펼친 시간(hour)
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
  const colsStyle = { gridTemplateColumns: `48px repeat(${tiles.length}, 84px)` } as React.CSSProperties;
  const jump = () => { const el = scroller.current?.querySelector<HTMLElement>('[data-now="true"]'); if (el && scroller.current) scroller.current.scrollTo({ left: Math.max(0, el.offsetLeft - scroller.current.clientWidth / 3), behavior: 'smooth' }); };

  return (
    <div className="tl">
      {(() => {
        const cs = tl.countries.filter((c) => tl.cycles[c]);
        if (cs.length === 0) return null;
        const sig = (c: string) => tl.cycles[c].items.map((i) => `${i.code}@${i.start}`).join(',');
        const same = cs.every((c) => sig(c) === sig(cs[0])); // 두 서버가 같은 시각에 같은 보스를 내므로 보통 같다: 한 줄로 합친다
        return (
          <div className="tl-cycles">
            {same
              ? <CycleStrip label={cs.length > 1 ? '전체' : cs[0]} countries={cs} cycle={tl.cycles[cs[0]]} tl={tl} focus={focus} onFocus={setFocus} />
              : cs.map((c) => <CycleStrip key={c} label={c} countries={[c]} cycle={tl.cycles[c]} tl={tl} focus={focus} onFocus={setFocus} />)}
          </div>
        );
      })()}

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
          <div className="tl-country" role="rowheader">보스</div>
          {tiles.map((t, i) => {
            const slot = slotOf(t.cells, tl.countries);
            const newDay = i === 0 || md(tiles[i - 1].hour) !== md(t.hour);
            const opened = open === t.hour, adminRest = slot ? slot.extras.filter((e) => e.source === 'ADMIN').length : 0;
            return (
              <div key={t.hour} className={`tl-cell${t.current ? ' now' : ''}${t.future ? ' future' : ''}${newDay ? ' day' : ''}`}>
                {!slot
                  ? <span className="tl-empty" title={t.future ? '나올 보스가 없어요(정기 등장이 켜진 보스가 없어요)' : '등장 없음(접속자가 없어 건너뛰었거나 정기 등장이 꺼져 있었어요)'}>{t.future ? '예정 없음' : '등장 없음'}</span>
                  : (
                    <>
                      <Boss main={slot.main} countries={tl.countries} hour={t.hour} focus={focus} onPick={onPick} />
                      {slot.extras.length > 0 && (
                        <button type="button" className={`tl-more${opened ? ' on' : ''}${adminRest === slot.extras.length ? ' by-admin' : ''}`} aria-expanded={opened}
                                title={`이 시간의 전체 기록 ${slot.all.length}건 보기`} onClick={() => setOpen(opened ? null : t.hour)}>
                          {adminRest === slot.extras.length ? '관리자 ' : ''}+{slot.extras.length}
                        </button>
                      )}
                    </>
                  )}
              </div>
            );
          })}
        </div>
      </div>

      {open && (() => {
        const row = tl.rows.find((r) => r.hour === open);
        const slot = row ? slotOf(row.cells, tl.countries) : null;
        return slot && slot.all.length > 1 ? <CellDetail hour={open} list={slot.all} onPick={onPick} onClose={() => setOpen(null)} /> : null;
      })()}
    </div>
  );
}
