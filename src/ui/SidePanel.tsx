import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { api, ApiFailure } from '../api/client';
import type { KeywordCard, MyKeyword, PlayerSummary, RankingEntry } from '../api/types';

type Tab = 'search' | 'mine' | 'ranking';

interface Props {
  onPlused(gained: number, player: PlayerSummary): void;
  onError(message: string): void;
  refreshKey: number;
}

const STATE_BADGE: Record<string, string> = { 활성: '🔥활성', 비활성: '💤비활성', 금지: '⛔금지' };

/** 보관함 정렬 기준. 기본은 최신순(보관함에 넣은 시각). */
type SortKey = 'recent' | 'text' | 'state' | 'trend' | 'remaining';
type SortDir = 'asc' | 'desc';
const SORT_LABEL: Record<SortKey, string> = { recent: '최신순', text: '키워드', state: '상태', trend: '트렌드 점수', remaining: '남은 시간' };
/** 기준을 고르면 먼저 쓰는 방향: 최신·트렌드는 큰 것부터, 키워드는 가나다, 상태는 🔥부터, 남은 시간은 적은 것부터 */
const DEFAULT_DIR: Record<SortKey, SortDir> = { recent: 'desc', text: 'asc', state: 'asc', trend: 'desc', remaining: 'asc' };
const STATE_ORDER: Record<string, number> = { 활성: 0, 비활성: 1, 금지: 2 };
const SORT_STORE = 'trendist.mineSort';

function loadSort(): { key: SortKey; dir: SortDir } {
  try {
    const v = JSON.parse(localStorage.getItem(SORT_STORE) ?? 'null');
    if (v && v.key in SORT_LABEL && (v.dir === 'asc' || v.dir === 'desc')) return v;
  } catch { /* 기본값 */ }
  return { key: 'recent', dir: 'desc' };
}

function sortMine(list: MyKeyword[], key: SortKey, dir: SortDir) {
  const sign = dir === 'asc' ? 1 : -1;
  const time = (iso: string) => new Date(iso).getTime();
  const compare = (a: MyKeyword, b: MyKeyword) => {
    switch (key) {
      case 'text': return a.text.localeCompare(b.text, 'ko');
      case 'state': return (STATE_ORDER[a.state] ?? 9) - (STATE_ORDER[b.state] ?? 9);
      case 'trend': return Number(a.trendValue) - Number(b.trendValue);
      case 'remaining': return time(a.expiresAt) - time(b.expiresAt);
      default: return time(a.plusedAt) - time(b.plusedAt);
    }
  };
  // 같은 값이면 최신순으로
  return [...list].sort((a, b) => sign * compare(a, b) || time(b.plusedAt) - time(a.plusedAt));
}

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
  const [sort, setSort] = useState(loadSort);
  const sortedMine = useMemo(() => sortMine(mine, sort.key, sort.dir), [mine, sort]);

  useEffect(() => {
    try { localStorage.setItem(SORT_STORE, JSON.stringify(sort)); } catch { /* 이 브라우저에만 기억 */ }
  }, [sort]);

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
        {([['search', '검색'], ['mine', '보관함'], ['ranking', '랭킹']] as const).map(([k, label]) => (
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
              <p>{Number(card.trendValue).toFixed(0)}점 · 👥 {card.holderCount.toLocaleString()}명</p>
              <div className="card-foot">
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
          {mine.length === 0 ? <p className="muted">아직 추가한 키워드가 없어요</p> : (<>
            <div className="sort-bar">
              <span className="muted small">보유 {mine.length}개</span>
              {/* 기준을 누르면 그 기준으로, 이미 고른 기준을 다시 누르면 방향을 바꾼다 */}
              <div className="sort-chips" role="group" aria-label="보관함 정렬">
                {(Object.keys(SORT_LABEL) as SortKey[]).map((k) => {
                  const active = sort.key === k;
                  return (
                    <button key={k} className={active ? 'sort-chip active' : 'sort-chip'} aria-pressed={active}
                            title={active ? '다시 누르면 순서를 바꿔요' : undefined}
                            aria-label={active ? `${SORT_LABEL[k]} ${sort.dir === 'asc' ? '오름차순' : '내림차순'}, 눌러서 순서 바꾸기` : `${SORT_LABEL[k]}으로 정렬`}
                            onClick={() => setSort((s) => (s.key === k ? { key: k, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key: k, dir: DEFAULT_DIR[k] }))}>
                      {SORT_LABEL[k]}
                      {active && <span className="sort-arrow" aria-hidden="true">{sort.dir === 'asc' ? '↑' : '↓'}</span>}
                    </button>
                  );
                })}
              </div>
            </div>
            <ul className="list">
              {sortedMine.map((k) => (
                <li key={k.keywordId}>
                  <div><strong>{k.text}</strong> <span className="badge">{STATE_BADGE[k.state] ?? k.state}</span></div>
                  <div className="muted small">
                    {Number(k.trendValue).toFixed(0)}점 ·{' '}
                    <span className={new Date(k.expiresAt).getTime() - Date.now() < 3_600_000 ? 'warn' : ''}>{remaining(k.expiresAt)}</span>
                  </div>
                </li>
              ))}
            </ul>
          </>)}
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
