import { useEffect, useState, type FormEvent } from 'react';
import { api, ApiFailure } from '../api/client';
import type { PlayerSummary, ScoreHistory, ScoreRange } from '../api/types';
import { GoogleButton } from './GoogleButton';
import { Modal } from './Modal';
import { ScoreChart } from './ScoreChart';
import { WithdrawDialog } from './WithdrawDialog';

const SCORE_RANGES: [ScoreRange, string][] = [['24h', '24시간'], ['7d', '7일'], ['30d', '30일'], ['all', '전체']];

interface Props {
  player: PlayerSummary; onChanged(player: PlayerSummary): void; onClose(): void;
  guest: boolean; onLogout(): void; onWithdrawn(): void;
}

const timeFormat = new Intl.DateTimeFormat('ko-KR', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Seoul' });

/** 내 정보(4.1): 지금 기록을 보여 주고 닉네임을 바꾼다. 변경 간격은 서버가 정하고, 화면은 다음 가능 시각만 안내한다. */
export function ProfileModal({ player, onChanged, onClose, guest, onLogout, onWithdrawn }: Props) {
  // 탈퇴 확인은 내 정보 창 대신 뜨는 창이다(창이 겹치면 ESC가 둘 다 닫는다)
  const [view, setView] = useState<'main' | 'withdraw'>('main');
  const [nickname, setNickname] = useState(player.nickname);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [range, setRange] = useState<ScoreRange>('24h');
  const [history, setHistory] = useState<ScoreHistory | null>(null);

  // 열 때 최신 기록(누적 검색 등)으로 한 번 다시 읽는다. 검색은 화면의 플레이어 요약을 바꾸지 않는다
  useEffect(() => {
    api.me().then((m) => { if (m.player) onChanged(m.player); }).catch(() => { /* 가진 값으로 보여 준다 */ });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 점수 추이(4.15): 기간을 바꾸면 다시 읽는다
  useEffect(() => {
    let alive = true;
    api.scoreHistory(range).then((h) => { if (alive) setHistory(h); }).catch(() => { if (alive) setHistory(null); });
    return () => { alive = false; };
  }, [range]);

  // 다음 변경 가능 시각이 지나면 버튼이 바로 풀리도록 30초마다 시계를 갱신한다
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  const changeableAt = player.nicknameChangeableAt ? new Date(player.nicknameChangeableAt) : null;
  const waiting = changeableAt !== null && changeableAt.getTime() > now;
  const unchanged = nickname.trim() === player.nickname;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy || waiting || unchanged) return;
    setBusy(true); setMessage(null);
    try {
      const p = await api.changeNickname(nickname);
      onChanged(p);
      setNickname(p.nickname);
      setMessage({ text: '닉네임을 바꿨어요', error: false });
    } catch (err) {
      setMessage({ text: err instanceof ApiFailure ? err.message : '닉네임을 바꾸지 못했어요', error: true });
    } finally {
      setBusy(false);
    }
  }

  if (view === 'withdraw') return <WithdrawDialog onDone={onWithdrawn} onCancel={() => setView('main')} />;

  return (
    <Modal title="내 정보" onClose={onClose}>
      <dl className="profile-stats">
        <div><dt>닉네임</dt><dd>{player.nickname}</dd></div>
        <div><dt>레벨</dt><dd>🐢 {player.level}레벨</dd></div>
        <div><dt>EXP</dt><dd>{player.exp}{player.nextLevelExp > 0 ? ` / ${player.nextLevelExp}` : ''}</dd></div>
        <div><dt>내 유행도</dt><dd>{Number(player.currentScore).toLocaleString()}</dd></div>
        <div><dt>보유 키워드</dt><dd>{player.holdCount}개</dd></div>
        <div><dt>누적 추가</dt><dd>{player.totalPlusCount.toLocaleString()}회</dd></div>
        <div><dt>누적 검색</dt><dd>{(player.searchCount ?? 0).toLocaleString()}회</dd></div>
      </dl>

      <section className="kw-activity" aria-label="점수 추이">
        <div className="kw-activity-head">
          <h3>점수 추이</h3>
          <div className="chip-row" role="group" aria-label="기간">
            {SCORE_RANGES.map(([r, label]) => (
              <button key={r} className={range === r ? 'chip active' : 'chip'} aria-pressed={range === r} onClick={() => setRange(r)}>{label}</button>
            ))}
          </div>
        </div>
        {history && history.range === range ? <ScoreChart history={history} />
          : <div className="chart-placeholder muted small">그래프를 불러오는 중…</div>}
      </section>

      <form className="profile-form" onSubmit={submit}>
        <label htmlFor="nickname-input"><strong>닉네임 바꾸기</strong></label>
        <div className="search-row">
          <input id="nickname-input" value={nickname} onChange={(e) => { setNickname(e.target.value); setMessage(null); }}
                 maxLength={10} autoComplete="off" disabled={waiting} aria-describedby="nickname-hint" />
          <button className="primary" disabled={busy || waiting || unchanged || !nickname.trim()}>바꾸기</button>
        </div>
        <p id="nickname-hint" className="muted small">
          {waiting && changeableAt
            ? `${timeFormat.format(changeableAt)}부터 다시 바꿀 수 있어요`
            : '1~10자, 한 번 바꾸면 1시간 뒤에 다시 바꿀 수 있어요'}
        </p>
        {message && <p className={message.error ? 'error small' : 'small'} role={message.error ? 'alert' : 'status'}>{message.text}</p>}
      </form>
      <section className="account-box" aria-label="계정">
        <strong>계정</strong>
        {guest ? (<>
          <p className="muted small">게스트로 플레이 중이에요.</p>
          <GoogleButton label="Google로 로그인" />
        </>) : (<>
          <p className="muted small">Google 계정으로 로그인했어요. 다른 기기에서도 이 기록으로 이어서 할 수 있어요.</p>
          <div className="account-actions">
            <button onClick={onLogout}>로그아웃</button>
            <button className="link-danger" onClick={() => setView('withdraw')}>회원 탈퇴</button>
          </div>
        </>)}
      </section>
    </Modal>
  );
}
