import { useCallback, useEffect, useState } from 'react';
import { api, ApiFailure } from '../api/client';
import type { Activity, ActivityRange, KeywordCard, PlayerSummary } from '../api/types';
import { ActivityChart } from './ActivityChart';
import { Comments } from './Comments';
import { remaining, STATE_BADGE } from './keywordFormat';
import { Modal } from './Modal';

const RANGES: [ActivityRange, string][] = [['24h', '24시간'], ['7d', '7일'], ['30d', '30일'], ['180d', '180일']];
const HOLDERS_KEY = 'trendist.chartHolders';

interface Props {
  keywordId: number;
  onClose(): void;
  onPlused(gained: number, player: PlayerSummary): void;
  onError(message: string): void;
}

/**
 * 키워드 상세 카드(4.12). 키워드 이름이 보이는 곳(보관함, 검색 결과)에서 같은 창이 열린다.
 * 상태·트렌드 값·인원·누적 수, 활동 그래프, 댓글을 보여 주고 바로 추가할 수 있다.
 */
export function KeywordModal({ keywordId, onClose, onPlused, onError }: Props) {
  const [card, setCard] = useState<KeywordCard | null>(null);
  const [failed, setFailed] = useState(false);
  const [range, setRange] = useState<ActivityRange>('24h');
  const [activity, setActivity] = useState<Activity | null>(null);
  const [showHolders, setShowHolders] = useState(() => { try { return localStorage.getItem(HOLDERS_KEY) === '1'; } catch { return false; } });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.keyword(keywordId).then(setCard).catch(() => setFailed(true));
  }, [keywordId]);

  const loadActivity = useCallback(() => {
    api.activity(keywordId, range).then(setActivity).catch(() => setActivity(null));
  }, [keywordId, range]);

  // 이번 시간은 집계 중이라 창이 열려 있는 동안 1분마다 다시 읽는다
  useEffect(() => {
    loadActivity();
    const t = window.setInterval(loadActivity, 60_000);
    return () => clearInterval(t);
  }, [loadActivity]);

  useEffect(() => { try { localStorage.setItem(HOLDERS_KEY, showHolders ? '1' : '0'); } catch { /* 이 브라우저에만 기억 */ } }, [showHolders]);

  async function plus() {
    if (!card || busy) return;
    setBusy(true);
    try {
      const r = await api.plus(card.text);
      setCard(r.keyword);
      onPlused(r.gained, r.player);
      loadActivity();
    } catch (err) {
      onError(err instanceof ApiFailure ? err.message : '추가하지 못했어요');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title={card?.text ?? '키워드'} onClose={onClose} className="keyword-modal">
      {failed && <p className="muted">키워드를 불러오지 못했어요. 금지되었거나 다른 나라의 키워드일 수 있어요.</p>}
      {!failed && !card && <p className="muted">불러오는 중…</p>}
      {card && (<>
        <section className="kw-hero">
          <div className="kw-hero-main">
            <span className={`badge state-${card.state}`}>{STATE_BADGE[card.state] ?? card.state}</span>
            <div className="kw-score"><strong>{card.trendValue}</strong><span>점</span></div>
          </div>
          <div className="kw-hero-side">
            <button className="primary kw-plus" onClick={plus} disabled={busy || card.plusedByMe}
                    aria-label={card.plusedByMe ? '이미 보유중이에요' : `${card.text} 추가하기`}>
              {card.plusedByMe ? '보유중' : '추가'}
            </button>
            {card.plusedByMe && card.myExpiresAt && <span className="muted small">{remaining(card.myExpiresAt)}</span>}
          </div>
        </section>

        <dl className="kw-stats">
          <div><dt>가진 사람</dt><dd>👥 {card.holderCount.toLocaleString()}명</dd></div>
          <div><dt>누적 추가</dt><dd>{card.totalPlusCount.toLocaleString()}</dd></div>
          <div><dt>누적 검색</dt><dd>{card.searchCount.toLocaleString()}</dd></div>
        </dl>

        <section className="kw-activity" aria-label="활동 그래프">
          <div className="kw-activity-head">
            <h3>활동</h3>
            <div className="chip-row" role="group" aria-label="기간">
              {RANGES.map(([r, label]) => (
                <button key={r} className={range === r ? 'chip active' : 'chip'} aria-pressed={range === r} onClick={() => setRange(r)}>{label}</button>
              ))}
            </div>
            <label className="toggle small">
              <input type="checkbox" checked={showHolders} onChange={(e) => setShowHolders(e.target.checked)} /> 가진 사람
            </label>
          </div>
          {activity && activity.range === range ? <ActivityChart activity={activity} showHolders={showHolders} />
            : <div className="chart-placeholder muted small">그래프를 불러오는 중…</div>}
        </section>

        <Comments keywordId={keywordId} onError={onError} />
      </>)}
    </Modal>
  );
}
