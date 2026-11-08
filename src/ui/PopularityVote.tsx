import { useState } from 'react';
import { api, ApiFailure } from '../api/client';
import { fmtNumber, t } from '../i18n';
import { successToast } from './toast';

interface Props {
  playerId: number;
  /** 결과 팝업에 넣는 상대 닉네임 */
  name: string;
  popularity: number;
  /** 오늘 내가 준 표(+1, -1, 없으면 0) */
  myVote: number;
  /** 나 자신이면 버튼 없이 숫자만 */
  me?: boolean;
  onChange?(popularity: number, myVote: number): void;
  onError?(message: string): void;
}

/** 인기도 숫자와 올리기·내리기 버튼(4.34). 대상마다 하루에 한 번이라, 오늘 줬으면 누른 쪽을 강조하고 둘 다 막는다. */
export function PopularityVote({ playerId, name, popularity, myVote, me, onChange, onError }: Props) {
  const [busy, setBusy] = useState(false);
  async function vote(v: 1 | -1) {
    if (busy || (myVote ?? 0) !== 0) return;
    setBusy(true);
    try {
      const r = await api.votePopularity(playerId, v);
      onChange?.(r.popularity, r.myVote);
      successToast(t(v === 1 ? 'player.popUpDone' : 'player.popDownDone', { name })); // 결과 팝업
    } catch (e) {
      const msg = e instanceof ApiFailure ? e.message : t('player.loadFailed');
      successToast(msg); // 실패도 같은 팝업으로(오늘 이미 했어요 등)
      onError?.(msg);
    } finally { setBusy(false); }
  }
  const locked = busy || (myVote ?? 0) !== 0;
  return (
    <span className="pop-vote">
      <span className="pop-value">{fmtNumber(popularity ?? 0)}</span>
      {!me && (
        <span className="pop-btns">
          <button className={myVote === 1 ? 'pop-btn up on' : 'pop-btn up'} disabled={locked && myVote !== 1} aria-pressed={myVote === 1}
                  onClick={() => vote(1)} title={(myVote ?? 0) !== 0 ? t('player.popDone') : t('player.popUp')} aria-label={t('player.popUp')}>+</button>
          <button className={myVote === -1 ? 'pop-btn down on' : 'pop-btn down'} disabled={locked && myVote !== -1} aria-pressed={myVote === -1}
                  onClick={() => vote(-1)} title={(myVote ?? 0) !== 0 ? t('player.popDone') : t('player.popDown')} aria-label={t('player.popDown')}>−</button>
        </span>
      )}
    </span>
  );
}
