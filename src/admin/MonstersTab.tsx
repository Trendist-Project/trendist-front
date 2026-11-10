import { useCallback, useEffect, useState } from 'react';
import { adminApi, type AdminMonsterLive, type AdminMonsterSpawn, type AdminMonsterType } from '../api/client';
import { ADMIN_COUNTRIES, getAdminCountry, type AdminCountry } from '../api/adminCountry';
import { successToast } from '../ui/toast';
import { adminConfirm, errMsg } from './format';
import { Portrait } from './monster/MonsterVisuals';
import { ScheduleSwitch, SchedulePanel } from './monster/ScheduleSwitch';
import { HistoryPanel, OverviewPanel, PatternsPanel, SettingsPanel } from './monster/panels';
import { kindLabel, mmss, num, settingMap } from './monster/meta';
import { useSettingsEditor } from './monster/useSettingsEditor';

const PHASES: Record<string, string> = {
  CHASE: '추적', DASH_WINDUP: '돌진 예고', DASHING: '돌진 중', RING_WINDUP: '충격고리 예고', RING: '충격고리 확산', RECOVER: '경직',
};
type Tab = 'overview' | 'patterns' | 'settings' | 'history';
const TABS: { id: Tab; label: string }[] = [
  { id: 'overview', label: '개요' }, { id: 'patterns', label: '공격 패턴' }, { id: 'settings', label: '설정 전체' }, { id: 'history', label: '등장 기록' },
];

/**
 * 관리자 몬스터(13.16, 4.35). 위에서 아래로: ① 지금 싸우는 몬스터(2초마다 갱신, 처치·제거) ② 몬스터 목록(카드: 그림·분류·정기 등장·즉시 소환)
 * ③ 고른 몬스터의 상세(개요·공격 패턴·설정 전체·등장 기록). 몬스터 종류·패턴·설정은 모두 DB와 설정 이름 약속(monster/meta.ts)에서 오므로
 * 새 보스·일반 몬스터가 생기면 코드 수정 없이 목록과 상세에 그대로 나타난다. 설정은 저장하면 1초 안에 반영된다(체력·몸 크기는 다음 등장부터).
 */
export function MonstersTab() {
  const [types, setTypes] = useState<AdminMonsterType[] | null>(null);
  const [live, setLive] = useState<AdminMonsterLive[]>([]);
  const [rooms, setRooms] = useState<{ country: string; humans: number }[]>([]);
  const [history, setHistory] = useState<AdminMonsterSpawn[]>([]);
  const [country, setCountry] = useState<AdminCountry>(getAdminCountry());
  const [selected, setSelected] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('overview');
  const [error, setError] = useState<string | null>(null);

  const loadTypes = useCallback(() => adminApi.monsterTypes().then((t) => { setTypes(t); setSelected((s) => s ?? t[0]?.code ?? null); }).catch((e) => setError(errMsg(e))), []);
  const loadLive = useCallback(() => {
    adminApi.monsterLive().then(setLive).catch(() => { /* 다음 주기에 다시 */ });
    adminApi.monsterRooms().then(setRooms).catch(() => { /* 안내만 빠진다 */ });
  }, []);
  const loadHistory = useCallback(() => adminApi.monsterSpawns(60).then(setHistory).catch(() => { /* 기록만 빠진다 */ }), []);

  useEffect(() => { loadTypes(); loadHistory(); }, [loadTypes, loadHistory]);
  useEffect(() => {
    loadLive();
    const id = setInterval(loadLive, 2000);
    const h = setInterval(loadHistory, 10000);
    return () => { clearInterval(id); clearInterval(h); };
  }, [loadLive, loadHistory]);

  const type = types?.find((t) => t.code === selected) ?? null;
  const activeHere = (code: string) => live.some((l) => l.code === code && l.country === country);
  const humansOf = (c: string) => rooms.find((r) => r.country === c)?.humans ?? 0;
  const typeOf = (code: string) => types?.find((t) => t.code === code) ?? null;

  const spawn = async (t: AdminMonsterType) => {
    if (!(await adminConfirm(`${country} 방에 '${t.name}'을(를) 지금 소환할까요? 접속한 사람 ${humansOf(country)}명 기준으로 체력이 정해져요.`))) return;
    try { await adminApi.spawnMonster(t.code, country); successToast('소환했어요'); setTimeout(loadLive, 600); setTimeout(loadHistory, 800); } catch (e) { setError(errMsg(e)); }
  };
  const end = async (l: AdminMonsterLive, reward: boolean) => {
    const msg = reward ? `'${l.name}'을(를) 처치 처리할까요? 지금까지 입힌 피해로 참여자에게 보상이 지급돼요.` : `'${l.name}'을(를) 제거할까요? 보상 없이 사라져요.`;
    if (!(await adminConfirm(msg))) return;
    try { await adminApi.endMonster(l.id, l.country, reward); successToast(reward ? '처치 처리했어요' : '제거했어요'); setTimeout(loadLive, 600); setTimeout(loadHistory, 1200); } catch (e) { setError(errMsg(e)); }
  };
  const toggle = async (t: AdminMonsterType, on: boolean) => {
    if (!on && !(await adminConfirm(`'${t.name}'을(를) 끌까요? 정해진 시간에 나오지 않아요(싸우는 중인 것은 그대로예요).`))) return;
    try { const u = await adminApi.setMonsterEnabled(t.code, on); setTypes((l) => l?.map((x) => (x.code === t.code ? { ...x, enabled: u.enabled } : x)) ?? null); successToast(on ? '켰어요' : '껐어요'); } catch (e) { setError(errMsg(e)); }
  };

  return (
    <section className="admin-panel mn">
      <header className="ap-head">
        <div>
          <h2>몬스터</h2>
          <p>보스·일반 몬스터를 소환하고 지금 싸우는 모습을 지켜보고, 모습·공격 패턴·수치를 한곳에서 고쳐요.</p>
        </div>
        <div className="mon-country" role="group" aria-label="나라">
          {ADMIN_COUNTRIES.map((c) => (
            <button key={c} type="button" className={c === country ? 'on' : ''} onClick={() => setCountry(c)}>{c}<span> {humansOf(c)}명</span></button>
          ))}
        </div>
      </header>
      {error && <p className="error" role="alert">{error} <button type="button" className="link" onClick={() => setError(null)}>닫기</button></p>}

      <section aria-labelledby="mn-live-h">
        <h3 id="mn-live-h" className="mn-h">지금 싸우는 몬스터 <span className="muted small">2초마다 갱신</span><span className="mn-count">{live.length}</span></h3>
        {live.length === 0 ? <p className="mn-empty">싸우는 몬스터가 없어요. 아래 목록에서 소환할 수 있어요.</p> : (
          <div className="mn-live">
            {live.map((l) => {
              const t = typeOf(l.code);
              const pct = l.maxHp > 0 ? Math.max(0, Math.min(100, (l.hp / l.maxHp) * 100)) : 0;
              return (
                <article key={`${l.country}-${l.id}`} className={`mn-live-card${l.rage ? ' rage' : ''}`}>
                  <header>
                    <Portrait image={t?.image ?? null} kind={t?.kind ?? 'BOSS'} name={l.name} size={48} />
                    <div className="mn-live-title">
                      <strong>{l.name}</strong>
                      <span className="mn-badges">
                        <span className="mn-badge">{l.country}</span>
                        {l.rage && <span className="mn-badge rage">분노</span>}
                        {l.flame && <span className="mn-badge flame">불꽃</span>}
                        <span className="mn-badge phase">{PHASES[l.phase] ?? l.phase}</span>
                      </span>
                    </div>
                    <span className="mn-time" title="남은 시간">⏱ {mmss(l.leftSeconds)}</span>
                  </header>
                  <div className="mn-hpbar" role="progressbar" aria-label="몬스터 체력" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)}><i style={{ width: `${pct}%` }} /><span>{num(l.hp)} / {num(l.maxHp)} · {pct.toFixed(1)}%</span></div>
                  <dl className="mn-facts">
                    <div><dt>따라가는 사람</dt><dd>{l.target ?? '-'}</dd></div>
                    <div><dt>참여</dt><dd>{l.participants}명 / 접속 {l.roomHumans}명</dd></div>
                    <div><dt>다음 패턴</dt><dd>돌진 {l.dashReadyIn}초 · 충격고리 {l.ringReadyIn}초</dd></div>
                    <div><dt>등장 때 기준</dt><dd>{l.humans}명 · 평균 {num(l.avgScore)} · 1등 {num(l.topScore)}</dd></div>
                  </dl>
                  {l.top.length > 0 && (
                    <ol className="mn-top">
                      {l.top.map((r, i) => <li key={r.playerId}><b>{i + 1}</b><span className="nm">{r.nickname}</span><span className="dmg">{num(r.damage)}</span><span className="muted small">{r.hits}회</span></li>)}
                    </ol>
                  )}
                  <div className="mn-live-actions">
                    <button type="button" onClick={() => end(l, true)}>처치 처리(보상 지급)</button>
                    <button type="button" className="danger" onClick={() => end(l, false)}>제거(보상 없음)</button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      <section aria-labelledby="mn-roster-h">
        <h3 id="mn-roster-h" className="mn-h">몬스터 목록 <span className="mn-count">{types?.length ?? 0}</span></h3>
        {!types ? <p className="muted">불러오는 중…</p> : (
          <ul className="mn-roster">
            {types.map((t) => {
              const m = settingMap(t.settings);
              const here = activeHere(t.code);
              return (
                <li key={t.code} className={`mn-card${t.code === selected ? ' on' : ''}${t.enabled ? '' : ' off'}`}>
                  <button type="button" className="mn-card-main" onClick={() => setSelected(t.code)} aria-pressed={t.code === selected}>
                    <Portrait image={t.image} kind={t.kind} name={t.name} size={72} />
                    <span className="mn-card-info">
                      <strong>{t.name}</strong>
                      <small>{t.nameEn ?? t.code}</small>
                      <span className="mn-badges">
                        <span className={`mn-badge kind-${t.kind.toLowerCase()}`}>{kindLabel(t.kind)}</span>
                        {here && <span className="mn-badge live">{country} 싸우는 중</span>}
                        {!t.enabled && <span className="mn-badge off">정기 등장 꺼짐</span>}
                      </span>
                    </span>
                  </button>
                  <div className="mn-card-meta">
                    {m.interval_minutes !== undefined && <span>🗓️ {num(m.interval_minutes)}분마다</span>}
                    {m.duration_seconds !== undefined && <span>⏱️ {mmss(m.duration_seconds)}</span>}
                    {m.min_players !== undefined && <span>👥 {m.min_players}명↑</span>}
                  </div>
                  <div className="mn-card-actions">
                    <button type="button" className="primary" disabled={here} onClick={() => spawn(t)}>{country}에 즉시 소환</button>
                    <ScheduleSwitch compact enabled={t.enabled} onChange={(on) => toggle(t, on)} />
                  </div>
                </li>
              );
            })}
            <li className="mn-card add" aria-label="새 몬스터 추가 안내">
              <span className="mn-add-plus" aria-hidden="true">＋</span>
              <strong>새 몬스터</strong>
              <p>일반·정예·보스 몬스터를 더하면 이 목록과 상세에 자동으로 나타나요. 설정 이름을 <code>&lt;패턴&gt;_weight</code>·<code>&lt;패턴&gt;_cooldown</code>으로 지으면 공격 패턴 탭에 카드로 보여요.</p>
            </li>
          </ul>
        )}
      </section>

      {type && <MonsterDetail key={type.code} type={type} tab={tab} onTab={setTab} history={history} onError={setError}
                              here={activeHere(type.code)} country={country} onSpawn={() => spawn(type)} onToggle={(on) => toggle(type, on)} />}
    </section>
  );
}

/** 고른 몬스터의 상세: 머리(그림·이름·소환) + 탭(개요·공격 패턴·설정 전체·등장 기록) + 저장하지 않은 변경이 있으면 아래에 붙는 저장 줄 */
function MonsterDetail({ type, tab, onTab, history, onError, here, country, onSpawn, onToggle }: {
  type: AdminMonsterType; tab: Tab; onTab: (t: Tab) => void; history: AdminMonsterSpawn[]; onError: (m: string) => void;
  here: boolean; country: AdminCountry; onSpawn: () => void; onToggle: (on: boolean) => void;
}) {
  const ed = useSettingsEditor(type, onError);
  return (
    <section className="mn-detail" aria-label={`${type.name} 상세`}>
      <header className="mn-detail-head">
        <Portrait image={type.image} kind={type.kind} name={type.name} size={88} />
        <div className="mn-detail-title">
          <h3>{type.name} <span className={`mn-badge kind-${type.kind.toLowerCase()}`}>{kindLabel(type.kind)}</span></h3>
          <p className="muted small">{type.nameEn ?? type.code} · <code>{type.code}</code> · 행동 <code>{type.behavior}</code></p>
        </div>
        <button type="button" className="primary" disabled={here} onClick={onSpawn}>{country}에 즉시 소환</button>
      </header>
      <SchedulePanel enabled={type.enabled} onChange={onToggle} m={settingMap(ed.items)} />
      <div className="mn-tabs" role="tablist" aria-label="몬스터 상세">
        {TABS.map((t) => (
          <button key={t.id} type="button" role="tab" id={`mn-tab-${t.id}`} aria-selected={tab === t.id} aria-controls="mn-panel" className={tab === t.id ? 'on' : ''} onClick={() => onTab(t.id)}>
            {t.label}{t.id !== 'history' && t.id !== 'overview' && ed.dirty.length > 0 && <i className="mn-dot" aria-label="저장하지 않은 변경 있음" />}
          </button>
        ))}
      </div>
      <div id="mn-panel" role="tabpanel" aria-labelledby={`mn-tab-${tab}`} className="mn-panel">
        {tab === 'overview' && <OverviewPanel ed={ed} />}
        {tab === 'patterns' && <PatternsPanel ed={ed} />}
        {tab === 'settings' && <SettingsPanel ed={ed} />}
        {tab === 'history' && <HistoryPanel type={type} history={history} />}
      </div>
      {ed.dirty.length > 0 && (
        <div className="mn-savebar" role="status">
          <span>저장하지 않은 변경 <b>{ed.dirty.length}</b>개{ed.blocked.length > 0 ? ` · 입력을 고쳐야 해요(${ed.blocked.length}개)` : ''}<small> 다른 몬스터로 옮기면 사라져요</small></span>
          <button type="button" onClick={ed.reset}>되돌리기</button>
          <button type="button" className="primary" disabled={ed.busy || ed.blocked.length > 0} onClick={ed.saveAll}>{ed.busy ? '저장 중…' : `저장 (${ed.dirty.length})`}</button>
        </div>
      )}
    </section>
  );
}
