import { useEffect, useState, type FormEvent } from 'react';
import { api, ApiFailure } from '../api/client';
import type { PlayerSummary } from '../api/types';
import { Modal } from './Modal';

interface Props { player: PlayerSummary; onChanged(player: PlayerSummary): void; onClose(): void }

const timeFormat = new Intl.DateTimeFormat('ko-KR', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Seoul' });

/** 내 정보(4.1): 지금 기록을 보여 주고 닉네임을 바꾼다. 변경 간격은 서버가 정하고, 화면은 다음 가능 시각만 안내한다. */
export function ProfileModal({ player, onChanged, onClose }: Props) {
  const [nickname, setNickname] = useState(player.nickname);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);
  const [now, setNow] = useState(() => Date.now());

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

  return (
    <Modal title="내 정보" onClose={onClose}>
      <dl className="profile-stats">
        <div><dt>닉네임</dt><dd>{player.nickname}</dd></div>
        <div><dt>레벨</dt><dd>🐢 {player.level}레벨</dd></div>
        <div><dt>EXP</dt><dd>{player.exp}{player.nextLevelExp > 0 ? ` / ${player.nextLevelExp}` : ''}</dd></div>
        <div><dt>내 유행도</dt><dd>{Number(player.currentScore).toFixed(1)}</dd></div>
        <div><dt>보유 키워드</dt><dd>{player.holdCount}개</dd></div>
        <div><dt>누적 추가</dt><dd>{player.totalPlusCount.toLocaleString()}회</dd></div>
      </dl>

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
    </Modal>
  );
}
