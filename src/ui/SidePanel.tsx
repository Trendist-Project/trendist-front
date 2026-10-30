import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { api, ApiFailure } from '../api/client';
import type { KeywordCard, MyKeyword, PlayerSummary } from '../api/types';
import { remaining, STATE_BADGE } from './keywordFormat';

type Tab = 'search' | 'mine';

interface Props {
  onPlused(gained: number, player: PlayerSummary): void;
  onError(message: string): void;
  refreshKey: number;
  /** 키워드 이름을 누르면 상세 창(4.12)을 연다. */
  onOpenKeyword(keywordId: number): void;
  /** 채팅의 #키워드를 누르면 검색창에 넣고 검색한다(4.13). */
  searchRequest: { text: string; key: number } | null;
}

/** 보관함 정렬 기준. 기본은 남은 시간이 많은 것부터(곧 사라질 키워드가 아래로). */
type SortKey = 'recent' | 'text' | 'state' | 'trend' | 'remaining';
type SortDir = 'asc' | 'desc';
// 칩은 이 순서로 보인다. 기본 정렬인 남은 시간을 맨 앞에 둔다
const SORT_LABEL: Record<SortKey, string> = { remaining: '남은 시간', recent: '최신순', text: '키워드', state: '상태', trend: '트렌드 점수' };
/** 기준을 고르면 먼저 쓰는 방향: 최신·트렌드·남은 시간은 큰 것부터, 키워드는 가나다, 상태는 🔥부터 */
const DEFAULT_DIR: Record<SortKey, SortDir> = { recent: 'desc', text: 'asc', state: 'asc', trend: 'desc', remaining: 'desc' };
const STATE_ORDER: Record<string, number> = { 활성: 0, 비활성: 1, 금지: 2 };
// 기본 정렬을 남은 시간으로 바꾸면서 키를 바꿨다. 예전 키에는 열기만 해도 최신순이 저장되어 있어서 새 기본값이 적용되지 않는다
const SORT_STORE = 'trendist.mineSort.v2';

function loadSort(): { key: SortKey; dir: SortDir } {
  try {
    const v = JSON.parse(localStorage.getItem(SORT_STORE) ?? 'null');
    if (v && v.key in SORT_LABEL && (v.dir === 'asc' || v.dir === 'desc')) return v;
  } catch { /* 기본값 */ }
  return { key: 'remaining', dir: 'desc' };
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


export function SidePanel({ onPlused, onError, refreshKey, onOpenKeyword, searchRequest }: Props) {
  const [tab, setTab] = useState<Tab>('search');
  const [q, setQ] = useState('');
  const [card, setCard] = useState<KeywordCard | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [mine, setMine] = useState<MyKeyword[]>([]);
  const [busy, setBusy] = useState(false);
  // 모바일 하단 시트: 접혀 있으면 탭 줄만 보인다. 탭을 누르면 펼치고, 펼친 탭을 다시 누르면 접는다(데스크톱은 늘 펼침)
  const [expanded, setExpanded] = useState(false);
  const [sort, setSort] = useState(loadSort);
  const sortedMine = useMemo(() => sortMine(mine, sort.key, sort.dir), [mine, sort]);

  useEffect(() => {
    try { localStorage.setItem(SORT_STORE, JSON.stringify(sort)); } catch { /* 이 브라우저에만 기억 */ }
  }, [sort]);

  async function loadMine() { try { setMine(await api.myKeywords()); } catch { /* 다음에 다시 */ } }

  // 채팅의 #키워드: 검색 탭으로 옮겨 그 단어로 검색한다
  useEffect(() => {
    if (!searchRequest) return;
    setTab('search');
    setExpanded(true);
    setQ(searchRequest.text);
    runSearch(searchRequest.text);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchRequest]);

  useEffect(() => {
    if (tab === 'mine') loadMine();
  }, [tab, refreshKey]);

  async function search(e: FormEvent) {
    e.preventDefault();
    await runSearch(q);
  }

  async function runSearch(text: string) {
    if (!text.trim()) return;
    setBusy(true); setNotice(null); setCard(null);
    try {
      const r = await api.search(text);
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
      onError(err instanceof ApiFailure ? err.message : '추가하지 못했어요');
    } finally {
      setBusy(false);
    }
  }

  return (
    <aside className={expanded ? 'side expanded' : 'side'}>
      <nav className="tabs" role="tablist">
        {([['search', '🔍 검색'], ['mine', '📦 보관함']] as const).map(([k, label]) => (
          <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'active' : ''}
                  onClick={() => { if (tab === k && expanded) setExpanded(false); else { setTab(k); setExpanded(true); } }}>{label}</button>
        ))}
        <button className="sheet-toggle" onClick={() => setExpanded((v) => !v)} aria-expanded={expanded}
                aria-label={expanded ? '패널 접기' : '패널 펼치기'}>{expanded ? '▾' : '▴'}</button>
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
                {card.id !== null
                  ? <button className="kw kw-link" onClick={() => onOpenKeyword(card.id!)} title="키워드 자세히 보기">{card.text} <span aria-hidden="true">›</span></button>
                  : <strong className="kw">{card.text}</strong>}
                <span className="badge">{STATE_BADGE[card.state] ?? card.state}</span>
              </div>
              <p>{card.trendValue}점 · 👥 {card.holderCount.toLocaleString()}명</p>
              <div className="card-foot">
                {card.plusedByMe && card.myExpiresAt && <span className="muted small">{remaining(card.myExpiresAt)}</span>}
                <button className="primary" onClick={plus} disabled={busy || card.plusedByMe}
                        aria-label={card.plusedByMe ? '이미 보유중이에요' : `${card.text} 추가하기`}>
                  {card.plusedByMe ? '보유중' : '추가'}
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
                <li key={k.keywordId} className="mine-item">
                  <button className="mine-open" onClick={() => onOpenKeyword(k.keywordId)} aria-label={`${k.text} 자세히 보기`}>
                    <div><strong>{k.text}</strong> <span className="badge">{STATE_BADGE[k.state] ?? k.state}</span></div>
                    <div className="muted small">
                      {k.trendValue}점 ·{' '}
                      <span className={new Date(k.expiresAt).getTime() - Date.now() < 3_600_000 ? 'warn' : ''}>{remaining(k.expiresAt)}</span>
                    </div>
                    <span className="mine-chevron" aria-hidden="true">›</span>
                  </button>
                </li>
              ))}
            </ul>
          </>)}
        </div>
      )}

    </aside>
  );
}
