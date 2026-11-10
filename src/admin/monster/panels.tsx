import { useMemo, useState } from 'react';
import type { AdminMonsterSetting, AdminMonsterSpawn, AdminMonsterType } from '../../api/client';
import { fmt } from '../format';
import { PatternDiagram, SizeCompare, Timeline } from './MonsterVisuals';
import { derivePatterns, fmtVal, mmss, num, previewHp, settingMap, timelineOf, type Pattern, type SettingMap } from './meta';
import type { SettingsEditor } from './useSettingsEditor';
import { successToast } from '../../ui/toast';
import { ScheduleSwitch } from './ScheduleSwitch';

const STATUS: Record<string, string> = { ACTIVE: '진행 중', KILLED: '처치', TIMEOUT: '시간 초과', REMOVED: '제거', SKIPPED: '건너뜀(사람 적음)' };

/** 설정 한 줄: 이름·설명·허용 범위와 입력칸. 바꾸면 노란 표시, 잘못되면 빨간 안내 */
export function SettingRow({ s, ed }: { s: AdminMonsterSetting; ed: SettingsEditor }) {
  const changed = ed.isChanged(s);
  const err = ed.draft[s.name] !== undefined ? ed.check(s) : null;
  return (
    <li className={`set-row${changed ? ' dirty' : ''}`}>
      <div className="set-info">
        <code>{s.name}</code>
        <p>{s.description}</p>
        <div className="set-meta"><span>범위 <b>{fmtVal(s.min)} ~ {fmtVal(s.max)}</b></span>{changed && <span>현재 저장값 <b>{fmtVal(s.value)}</b></span>}</div>
        {err && <p className="error small" role="alert">{err}</p>}
      </div>
      <div className="set-edit-col">
        <div className="set-edit">
          <input inputMode="decimal" value={ed.valueOf(s)} aria-label={s.name} aria-invalid={!!err} onChange={(e) => ed.set(s.name, e.target.value)} />
          <span className="set-unit">{s.unit ?? ''}</span>
        </div>
      </div>
    </li>
  );
}

interface Tile { icon: string; label: string; value: string; sub?: string }

function tilesOf(m: SettingMap): Tile[] {
  const t: (Tile | null)[] = [
    m.interval_minutes !== undefined ? { icon: '🗓️', label: '등장', value: `${num(m.interval_minutes)}분마다`, sub: `정각 +${m.offset_minutes ?? 0}분${m.announce_seconds ? ` · ${m.announce_seconds}초 전 예고` : ''}` } : null,
    m.duration_seconds !== undefined ? { icon: '⏱️', label: '제한 시간', value: mmss(m.duration_seconds), sub: m.min_players !== undefined ? `접속 ${m.min_players}명 이상일 때만 등장` : undefined } : null,
    m.speed_ratio !== undefined ? { icon: '🏃', label: '이동 속도', value: `사용자의 ${fmtVal(m.speed_ratio)}배`, sub: m.retarget_seconds !== undefined ? `${m.retarget_seconds}초마다 가장 가까운 사람으로 대상 변경` : undefined } : null,
    m.hit_interval_seconds !== undefined ? { icon: '💥', label: '부딪히면', value: '튕겨 나감(키워드·불꽃 그대로)', sub: `같은 사람은 ${fmtVal(m.hit_interval_seconds)}초에 한 번${m.flame_damage_mult ? ` · 불꽃이면 피해 ×${fmtVal(m.flame_damage_mult)}(불꽃 보스에게는 ×1)` : ''}` } : null,
    m.rage_hp_percent !== undefined || m.rage_remaining_seconds !== undefined
      ? { icon: '😡', label: '분노', value: [m.rage_hp_percent ? `체력 ${m.rage_hp_percent}% 이하` : '', m.rage_remaining_seconds ? `남은 ${m.rage_remaining_seconds}초 이하` : ''].filter(Boolean).join(' · ') || '없음',
          sub: `쿨타임 ×${fmtVal(m.rage_cooldown_mult ?? 1)}${m.rage_speed_mult && m.rage_speed_mult !== 1 ? ` · 속도 ×${fmtVal(m.rage_speed_mult)}` : ''}${m.rage_flame ? ` · 불꽃 붙음${m.rage_flame_seconds ? `(${m.rage_flame_seconds}초)` : ''}` : ''}` } : null,
    m.reward_keywords !== undefined ? { icon: '🎁', label: '보상(처치)', value: `🔥 ${m.reward_keywords}개${m.reward_level_percent !== undefined ? ` + 기여도 레벨 진행 최대 ${fmtVal(m.reward_level_percent)}%` : ''}`, sub: '참여자 모두 받고, 시간 안에 못 잡으면 보상이 없어요' } : null,
  ];
  return t.filter((x): x is Tile => x !== null);
}

/** 개요: 요약 타일, 몸 크기 비교, 체력 미리 계산기(접속 인원·평균·1등 유행도를 넣어 보면 정해질 체력) */
export function OverviewPanel({ ed }: { ed: SettingsEditor }) {
  const m = settingMap(ed.items);
  const [players, setPlayers] = useState('10'), [avg, setAvg] = useState('200'), [top, setTop] = useState('600');
  const hp = previewHp(m, Number(players) || 0, Number(avg) || 0, Number(top) || 0);
  const tiles = tilesOf(m);
  return (
    <div className="mn-overview">
      <ul className="mn-tiles">
        {tiles.map((t) => (
          <li key={t.label}><span className="mn-tile-icon" aria-hidden="true">{t.icon}</span><div><small>{t.label}</small><strong>{t.value}</strong>{t.sub && <em>{t.sub}</em>}</div></li>
        ))}
      </ul>
      <div className="mn-side">
        {m.radius !== undefined && <SizeCompare radius={m.radius} />}
        {hp !== null && (
          <div className="mn-calc">
            <h4>체력 미리 계산</h4>
            <p className="muted small">접속 인원과 유행도를 넣어 보면 그때 정해질 체력이에요(서버 공식과 같아요).</p>
            <div className="mn-calc-in">
              <label>접속 인원<input inputMode="numeric" value={players} onChange={(e) => setPlayers(e.target.value)} /></label>
              <label>평균 유행도<input inputMode="numeric" value={avg} onChange={(e) => setAvg(e.target.value)} /></label>
              <label>1등 유행도<input inputMode="numeric" value={top} onChange={(e) => setTop(e.target.value)} /></label>
            </div>
            <p className="mn-calc-out"><span>예상 체력</span><b>{num(hp)}</b></p>
            <p className="muted small">제한 시간 {mmss(m.duration_seconds ?? 0)} 안에 아슬아슬하게 잡도록 계산해요(참여 {Math.round((m.hp_participation_rate ?? 0) * 100)}% · 1인당 {m.hp_hits_per_player}회 · 불꽃 {Math.round((m.hp_flame_ratio ?? 0) * 100)}% · 여유 {m.hp_margin}).</p>
          </div>
        )}
      </div>
    </div>
  );
}

function PatternCard({ p, share, ed }: { p: Pattern; share: number; ed: SettingsEditor }) {
  const m = settingMap(ed.items);
  const rage = m.rage_cooldown_mult;
  const cd = m[`${p.code}_cooldown`];
  const anyDirty = p.settings.some((s) => ed.isChanged(s));
  const hasSwitch = m[`${p.code}_enabled`] !== undefined;
  const enabled = !hasSwitch || m[`${p.code}_enabled`] >= 1;
  const off = !enabled || (m[`${p.code}_weight`] ?? 0) === 0;
  const toggle = async (on: boolean) => { if (await ed.saveNow([{ name: `${p.code}_enabled`, value: on ? 1 : 0 }]) > 0) successToast(`${p.name}을(를) ${on ? '켰어요' : '껐어요'}(1초 안에 반영)`); };
  return (
    <article className={`mn-pattern${off ? ' off' : ''}`}>
      <header>
        <span className="mn-pattern-icon" aria-hidden="true">{p.icon}</span>
        <div><h4>{p.name}</h4>{p.hint && <p>{p.hint}</p>}</div>
        <span className={`mn-share${off ? ' off' : ''}`} title="쓸 수 있는 패턴 중 이 패턴이 뽑힐 비중">{off ? '사용 안 함' : `선택 ${share}%`}</span>
        {hasSwitch && <ScheduleSwitch compact enabled={enabled} onChange={toggle} label="사용" />}
      </header>
      <div className="mn-pattern-body">
        <PatternDiagram pattern={p} />
        <div className="mn-pattern-facts">
          <dl>
            <div><dt>쿨타임</dt><dd>{cd !== undefined ? `${fmtVal(cd)}초` : '-'}</dd></div>
            {rage !== undefined && cd !== undefined && <div><dt>분노 때</dt><dd>{fmtVal(cd * rage)}초</dd></div>}
            {m[`${p.code}_hp_percent`] !== undefined && <div><dt>맞으면</dt><dd>체력 {fmtVal(m[`${p.code}_hp_percent`])}% 감소</dd></div>}
            {m[`${p.code}_max_hp_percent`] !== undefined && <div><dt>맞으면</dt><dd>체력 {fmtVal(m[`${p.code}_max_hp_percent`])}% → {fmtVal(m[`${p.code}_min_hp_percent`] ?? 0)}% 감소(멀수록 적게)</dd></div>}
          </dl>
          <Timeline segs={timelineOf(p.code, m)} />
        </div>
      </div>
      <details className="mn-edit" open={anyDirty ? true : undefined}>
        <summary>수치 고치기 <span className="set-count">{p.settings.length}개{anyDirty ? ' · 변경 있음' : ''}</span></summary>
        <ul className="set-list">{p.settings.map((s) => <SettingRow key={s.name} s={s} ed={ed} />)}</ul>
      </details>
    </article>
  );
}

/** 공격 패턴: 패턴마다 도식·시간 흐름·쿨타임·선택 비중을 카드로 보여 주고 그 자리에서 수치를 고친다. 패턴 공통 규칙은 맨 아래 */
export function PatternsPanel({ ed }: { ed: SettingsEditor }) {
  const patterns = useMemo(() => derivePatterns(ed.items), [ed.items]);
  const m = settingMap(ed.items);
  const isOn = (code: string) => m[`${code}_enabled`] === undefined || m[`${code}_enabled`] >= 1;
  const total = patterns.reduce((a, p) => a + (isOn(p.code) ? (m[`${p.code}_weight`] ?? 0) : 0), 0);
  const switchable = patterns.filter((p) => m[`${p.code}_enabled`] !== undefined);
  const onCount = switchable.filter((p) => isOn(p.code)).length;
  const setAll = async (on: boolean) => {
    const changes = switchable.filter((p) => isOn(p.code) !== on).map((p) => ({ name: `${p.code}_enabled`, value: on ? 1 : 0 }));
    if (changes.length === 0) return;
    const ok = await ed.saveNow(changes);
    if (ok > 0) successToast(`패턴 ${ok}개를 ${on ? '켰어요' : '껐어요'}(1초 안에 반영)`);
  };
  const common = ed.items.filter((s) => s.group === '패턴 공통');
  if (patterns.length === 0) return <p className="muted">이 몬스터는 정해진 패턴이 없어요(설정 탭에서 모든 값을 볼 수 있어요).</p>;
  return (
    <div className="mn-patterns">
      <p className="muted small">보스는 쓸 수 있는 패턴 중에서 <b>비중대로 무작위</b>로 고르고(방금 쓴 패턴은 건너뜀), 쓴 뒤에는 공통 대기 시간이 지나야 다음 패턴을 써요.</p>
      {switchable.length > 0 && (
        <div className="mn-pattern-bulk" role="group" aria-label="패턴 전체 켜기·끄기">
          <span>패턴 <b>{onCount}</b> / {switchable.length}개 켜짐{onCount === 0 && <em> · 모두 꺼서 보스는 쫓아다니기만 해요</em>}</span>
          <button type="button" disabled={ed.busy || onCount === switchable.length} onClick={() => setAll(true)}>전체 켜기</button>
          <button type="button" disabled={ed.busy || onCount === 0} onClick={() => setAll(false)}>전체 끄기</button>
        </div>
      )}
      <div className="mn-pattern-grid">
        {patterns.map((p) => <PatternCard key={p.code} p={p} share={total > 0 && isOn(p.code) ? Math.round(((m[`${p.code}_weight`] ?? 0) / total) * 100) : 0} ed={ed} />)}
      </div>
      {common.length > 0 && (
        <details className="mn-common" open={common.some((s) => ed.isChanged(s)) ? true : undefined}>
          <summary><h4>패턴 공통 규칙</h4><span className="set-count">{common.length}개</span></summary>
          <ul className="set-list">{common.map((s) => <SettingRow key={s.name} s={s} ed={ed} />)}</ul>
        </details>
      )}
    </div>
  );
}

/** 설정 전체: 이름·설명 검색 + 그룹 바로가기(변경 있는 그룹에 점) + 그룹별 접이식 목록 */
export function SettingsPanel({ ed }: { ed: SettingsEditor }) {
  const [q, setQ] = useState('');
  const [only, setOnly] = useState<string | null>(null);
  const needle = q.trim().toLowerCase();
  const groups = useMemo(() => {
    const map = new Map<string, AdminMonsterSetting[]>();
    for (const s of ed.items) { if (!map.has(s.group)) map.set(s.group, []); map.get(s.group)!.push(s); }
    return [...map.entries()];
  }, [ed.items]);
  const visible = (s: AdminMonsterSetting) => !needle || s.name.toLowerCase().includes(needle) || s.description.toLowerCase().includes(needle);
  return (
    <div className="mn-settings">
      <div className="mn-set-tools">
        <input type="search" placeholder="설정 이름이나 설명으로 찾기" value={q} onChange={(e) => setQ(e.target.value)} aria-label="설정 검색" />
        <div className="mn-chips" role="group" aria-label="그룹">
          <button type="button" className={only === null ? 'on' : ''} onClick={() => setOnly(null)}>전체</button>
          {groups.map(([g, list]) => (
            <button key={g} type="button" className={only === g ? 'on' : ''} onClick={() => setOnly(only === g ? null : g)}>
              {g} <span className="chip-count">{list.length}</span>{list.some((s) => ed.isChanged(s)) && <i className="mn-dot" aria-label="변경 있음" />}
            </button>
          ))}
        </div>
      </div>
      {groups.filter(([g]) => only === null || g === only).map(([g, list]) => {
        const shown = list.filter(visible);
        if (shown.length === 0) return null;
        return (
          <details key={g} className="set-group" open>
            <summary><h3>{g}</h3><span className="set-count">{shown.length}개</span></summary>
            <ul className="set-list">{shown.map((s) => <SettingRow key={s.name} s={s} ed={ed} />)}</ul>
          </details>
        );
      })}
    </div>
  );
}

/** 이 몬스터의 등장 기록 */
export function HistoryPanel({ type, history }: { type: AdminMonsterType; history: AdminMonsterSpawn[] }) {
  const rows = history.filter((h) => h.code === type.code);
  return (
    <div className="admin-table-wrap">
      <table className="admin-table">
        <thead><tr><th>시작</th><th>나라</th><th>방식</th><th>결과</th><th className="num">체력</th><th className="num">남은 체력</th><th className="num">접속</th><th className="num">평균/1등 유행도</th><th className="num">참여</th><th className="num">피해 1위</th></tr></thead>
        <tbody>
          {rows.length === 0 && <tr><td colSpan={10} className="muted">아직 등장 기록이 없어요.</td></tr>}
          {rows.map((h) => (
            <tr key={h.id}>
              <td>{fmt(h.startedAt)}</td><td>{h.country}</td><td>{h.source === 'ADMIN' ? '관리자' : '정각'}</td>
              <td><span className={`mn-result ${h.status.toLowerCase()}`}>{STATUS[h.status] ?? h.status}</span></td>
              <td className="num">{num(h.maxHp)}</td><td className="num">{num(h.finalHp)}</td><td className="num">{h.humans}</td>
              <td className="num">{num(h.avgScore)} / {num(h.topScore)}</td><td className="num">{h.participants}</td><td className="num">{num(h.topDamage)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
