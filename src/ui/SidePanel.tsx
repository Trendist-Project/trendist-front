import { useEffect, useState, type FormEvent } from 'react';
import { api, ApiFailure } from '../api/client';
import type { KeywordCard, MyKeyword, PlayerSummary, RankingEntry } from '../api/types';

type Tab = 'search' | 'mine' | 'ranking';

interface Props {
  onPlused(gained: number, player: PlayerSummary): void;
  onError(message: string): void;
  refreshKey: number;
}

const STATE_BADGE: Record<string, string> = { 활성: '🔥활성', 비활성: '💤비활성', 금지: '⛔금지' };

function remaining(iso: string) {
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return '곧 삭제';
  const h = Math.floor(ms / 3_600_000), m = Math.floor((ms % 3_600_000) / 60_000);
  return h > 0 ? `${h}시간 ${m}분 남음` : `${m}분 남음`;
}

export function SidePanel({ onPlused, onError, refreshKey }: Props) {
  const [tab, setTab] = useState<Tab>('search');
  const [q, setQ] = useState('');
  const [card, setCard] = useState<KeywordCard | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [mine, setMine] = useState<MyKeyword[]>([]);
  const [ranking, setRanking] = useState<RankingEntry[]>([]);
  const [busy, setBusy] = useState(false);

  async function loadMine() { try { setMine(await api.myKeywords()); } catch { /* 다음에 다시 */ } }
  async function loadRanking() { try { setRanking(await api.rankings()); } catch { /* 다음에 다시 */ } }

  useEffect(() => {
    if (tab === 'mine') loadMine();
    if (tab === 'ranking') loadRanking();
    if (tab !== 'ranking') return;
    const t = window.setInterval(loadRanking, 5000);
    return () => clearInterval(t);
  }, [tab, refreshKey]);

  async function search(e: FormEvent) {
    e.preventDefault();
    if (!q.trim()) return;
    setBusy(true); setNotice(null); setCard(null);
    try {
      const r = await api.search(q);
      if (r.status === 'BANNED') setNotice('검색할 수 없는 키워드예요');
      else setCard(r.keyword);
    } catch (err) {
      setNotice(err instanceof ApiFailure ? err.message : '검색하지 못했어요');
    } finally {
      setBusy(false);
    }
  }

  async function plus() {
    if (!card) return;
    setBusy(true);
    try {
      const r = await api.plus(card.text);
      setCard(r.keyword);
      onPlused(r.gained, r.player);
    } catch (err) {
      onError(err instanceof ApiFailure ? err.message : '+하지 못했어요');
    } finally {
      setBusy(false);
    }
  }

  return (
    <aside className="side">
      <nav className="tabs" role="tablist">
        {([['search', '검색'], ['mine', '내 트렌드 키워드'], ['ranking', '랭킹']] as const).map(([k, label]) => (
          <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'active' : ''} onClick={() => setTab(k)}>{label}</button>
        ))}
      </nav>

      {tab === 'search' && (
        <div className="tab-body">
          <form onSubmit={search} className="search-row">
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="키워드를 입력하세요" maxLength={20}
                   aria-label="키워드 검색" autoComplete="off" />
            <button className="primary" disabled={busy}>검색</button>
          </form>
          {notice && <p className="muted">{notice}</p>}
          {card && (
            <div className="card">
              <div className="card-head">
                <strong className="kw">{card.text}</strong>
                <span className="badge">{STATE_BADGE[card.state] ?? card.state}</span>
              </div>
              <p>트렌드 {Number(card.trendValue).toFixed(0)} · 👥 {card.holderCount.toLocaleString()}명</p>
              <div className="card-foot">
                {card.state === '활성' && !card.plusedByMe && <span>지금 +{Number(card.score).toFixed(1)}점</span>}
                {card.plusedByMe && card.myExpiresAt && <span className="muted small">{remaining(card.myExpiresAt)}</span>}
                <button className="primary" onClick={plus} disabled={busy || card.plusedByMe}
                        aria-label={card.plusedByMe ? '이미 보유중이에요' : `${card.text} +하기`}>
                  {card.plusedByMe ? '보유중' : '+'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {tab === 'mine' && (
        <div className="tab-body">
          {mine.length === 0 ? <p className="muted">아직 추가한 키워드가 없어요</p> : (
            <ul className="list">
              {mine.map((k) => (
                <li key={k.keywordId}>
                  <div><strong>{k.text}</strong> <span className="badge">{STATE_BADGE[k.state] ?? k.state}</span></div>
                  <div className="muted small">
                    트렌드 {Number(k.trendValue).toFixed(0)} · {Number(k.score).toFixed(1)}점 ·{' '}
                    <span className={new Date(k.expiresAt).getTime() - Date.now() < 3_600_000 ? 'warn' : ''}>{remaining(k.expiresAt)}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {tab === 'ranking' && (
        <div className="tab-body">
          <h3 className="small">현재 유행도 TOP 10</h3>
          <ol className="list ranking">
            {ranking.map((r) => (
              <li key={r.playerId}><span className="rank">{r.rank}</span> <strong>{r.nickname}</strong>
                <span className="muted small"> {r.level}레벨</span><span className="score">{Number(r.score).toFixed(1)}</span></li>
            ))}
          </ol>
        </div>
      )}
    </aside>
  );
}
