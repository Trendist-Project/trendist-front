import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { adminApi, type AdminEmergency } from '../api/client';
import { EmergencyBar } from '../ui/EmergencyBar';
import { successToast } from '../ui/toast';
import { errMsg, fmt } from './format';

/**
 * 긴급 안내(4.29, 13): 한 줄을 쓰고 몇 분 동안 보일지 정해 올리면, 접속 중인 모든 사용자(KR·GLOBAL)의 게임 화면 맨 위에
 * 글이 오른쪽에서 왼쪽으로 천천히 흘러간다. 한 번에 하나만 보이고, 새로 올리면 이전 것은 끝난다.
 * 위에서 아래로: 지금 보이는 안내(남은 시간, 지금 끝내기) → 쓰기(미리 보기) → 지난 기록.
 */
const MAX = 200;
const PRESETS: [number, string][] = [[5, '5분'], [10, '10분'], [30, '30분'], [60, '1시간'], [180, '3시간']];
const STATUS: Record<AdminEmergency['status'], string> = { ACTIVE: '보이는 중', ENDED: '시간이 끝남', CANCELED: '직접 끝냄' };

/** 남은 시간을 "12분 34초" / "1시간 5분"으로 */
function left(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000)), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h}시간 ${m}분` : `${m}분 ${String(s % 60).padStart(2, '0')}초`;
}

export function EmergencyTab() {
  const [list, setList] = useState<AdminEmergency[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [en, setEn] = useState('');
  const [minutes, setMinutes] = useState(10);
  const [confirm, setConfirm] = useState(false);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const load = useCallback(() => { adminApi.emergencyList().then((l) => { setList(l); setError(null); }).catch((e) => setError(errMsg(e))); }, []);
  useEffect(load, [load]);
  useEffect(() => { const t = window.setInterval(() => setNow(Date.now()), 1000); return () => window.clearInterval(t); }, []);

  const active = list?.find((x) => x.status === 'ACTIVE' && new Date(x.endsAt).getTime() > now) ?? null;
  const text = message.replace(/\s+/g, ' ').trim();
  const len = [...text].length;
  const valid = len >= 1 && len <= MAX && [...en.trim()].length <= MAX && minutes >= 1 && minutes <= 720;

  async function publish() {
    setBusy(true);
    try {
      await adminApi.createEmergency({ message: text, messageEn: en.trim() || null, minutes });
      successToast(`🚨 긴급 안내를 올렸어요 (${minutes}분)`);
      setMessage(''); setEn(''); setConfirm(false); load();
    } catch (e) { setError(errMsg(e)); } finally { setBusy(false); }
  }
  async function endNow(id: number) {
    setBusy(true);
    try { await adminApi.cancelEmergency(id); successToast('긴급 안내를 끝냈어요'); setConfirmEnd(false); load(); }
    catch (e) { setError(errMsg(e)); } finally { setBusy(false); }
  }

  return (
    <section className="admin-panel em">
      <p className="muted small em-intro">올리면 접속 중인 모든 사용자의 게임 화면 맨 위에 한 줄로 바로 나타나 글이 천천히 왼쪽으로 흘러가요. 한 번에 하나만 보이고, 새로 올리면 이전 안내는 끝나요. 정한 시간이 지나면 저절로 사라져요.</p>
      {error && <p className="error" role="alert">{error}</p>}

      <div className={`em-now${active ? ' on' : ''}`}>
        <div className="em-now-head"><strong>{active ? '🚨 지금 보이는 안내' : '지금 보이는 안내가 없어요'}</strong>
          {active && <span className="em-left">남은 시간 <b>{left(new Date(active.endsAt).getTime() - now)}</b></span>}
        </div>
        {active && (<>
          <EmergencyBar text={active.message} preview />
          {active.messageEn && <p className="muted small">영어 화면: {active.messageEn}</p>}
          <div className="admin-actions">
            {confirmEnd ? (<>
              <button className="danger solid" disabled={busy} onClick={() => endNow(active.id)}>지금 끝내기 확인</button>
              <button disabled={busy} onClick={() => setConfirmEnd(false)}>취소</button>
            </>) : <button className="danger" onClick={() => setConfirmEnd(true)}>⏹ 지금 끝내기</button>}
          </div>
        </>)}
      </div>

      <form className="em-form" onSubmit={(e: FormEvent) => { e.preventDefault(); if (valid) setConfirm(true); }}>
        <h2>새 긴급 안내</h2>
        <div className="notice-field">
          <label className="notice-label" htmlFor="em-msg">안내 내용 <span className={`count${len > MAX ? ' over' : ''}`}>{len} / {MAX}</span></label>
          <textarea id="em-msg" rows={2} value={message} onChange={(e) => { setMessage(e.target.value); setConfirm(false); }} disabled={busy}
                    placeholder="예) 10분 뒤 서버 점검이 시작돼요. 잠시 후 다시 접속해 주세요." />
          <span className="muted small">줄바꿈은 한 칸으로 바뀌어 한 줄로 흘러가요.</span>
        </div>
        <div className="notice-field">
          <label className="notice-label" htmlFor="em-en">영어 안내 <span className="muted small">(선택, 비우면 영어 화면에도 위 내용이 보여요)</span></label>
          <input id="em-en" value={en} onChange={(e) => { setEn(e.target.value); setConfirm(false); }} disabled={busy} placeholder="e.g. Server maintenance starts in 10 minutes." />
        </div>
        <div className="notice-field">
          <span className="notice-label">보여 줄 시간</span>
          <div className="em-durations" role="group" aria-label="보여 줄 시간">
            {PRESETS.map(([m, label]) => (
              <button key={m} type="button" className={`sort-chip${minutes === m ? ' active' : ''}`} aria-pressed={minutes === m} disabled={busy}
                      onClick={() => { setMinutes(m); setConfirm(false); }}>{label}</button>
            ))}
            <label className="em-custom">직접 <input type="number" min={1} max={720} value={minutes} disabled={busy}
                   onChange={(e) => { setMinutes(Math.round(Number(e.target.value)) || 0); setConfirm(false); }} aria-label="보여 줄 시간(분)" />분</label>
          </div>
          <span className="muted small">1분에서 720분(12시간)까지. 올린 때부터 센다.</span>
        </div>
        <div className="notice-field">
          <span className="notice-label">미리 보기 <span className="muted small">(게임 화면 맨 위에 이렇게 흘러가요)</span></span>
          <div className="em-preview">{text ? <EmergencyBar key={text} text={text} preview /> : <p className="muted small em-empty">내용을 쓰면 여기에 미리 보여 줘요</p>}</div>
        </div>
        {!confirm ? (
          <div className="admin-actions"><button className="primary" type="submit" disabled={!valid || busy}>게시하기</button></div>
        ) : (
          <div className="akw-confirm danger" role="alertdialog" aria-label="확인">
            <p><strong>모든 사용자</strong>의 게임 화면에 지금 바로 <strong>{minutes}분</strong> 동안 보여요.{active ? ' 지금 보이는 안내는 끝나요.' : ''} 게시할까요?</p>
            <div className="admin-actions">
              <button className="danger solid" type="button" disabled={busy} onClick={publish}>{busy ? '올리는 중…' : '🚨 게시'}</button>
              <button type="button" disabled={busy} onClick={() => setConfirm(false)}>다시 고치기</button>
            </div>
          </div>
        )}
      </form>

      <div className="em-history">
        <h2>지난 기록</h2>
        {!list ? <p className="muted">불러오는 중…</p> : list.length === 0 ? <p className="muted notice-empty">아직 올린 긴급 안내가 없어요</p> : (
          <ul className="em-list">
            {list.map((x) => {
              const live = x.status === 'ACTIVE' && new Date(x.endsAt).getTime() > now;
              const status = x.status === 'ACTIVE' && !live ? 'ENDED' : x.status;
              return (
                <li key={x.id} className={`em-row ${status}`}>
                  <div className="em-row-main">
                    <span className={`akw-badge em-badge ${status}`}>{STATUS[status]}</span>
                    <span className="em-row-text">{x.message}</span>
                  </div>
                  <span className="muted small">{fmt(x.createdAt)} · {x.minutes}분{x.canceledAt ? ` · ${fmt(x.canceledAt)} 종료` : ''}</span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
