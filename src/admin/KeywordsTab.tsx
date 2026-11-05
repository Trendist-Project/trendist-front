import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { adminApi, type AdminKeywordLookup, type AdminKeywordPage, type AdminKeywordQuery, type AdminKeywordRow } from '../api/client';
import { getAdminCountry } from '../api/adminCountry';
import { successToast } from '../ui/toast';
import { errMsg, fmt, useHoldText } from './format';

/**
 * 관리자 키워드 화면(13.6, 13.7). 위에서 아래로: 상태 요약(누르면 필터) → 검색 → 조회 카드 → 목록.
 * 검색한 단어가 아직 등록 전이어도 조회 카드에서 바로 [🔥 추가]·[⛔ 금지]를 할 수 있다.
 */
const SORTS: [string, string][] = [
  ['text', '키워드'], ['state', '상태'], ['source', '소스'], ['trendValue', '점수'], ['holderCount', '가진 사람'],
  ['totalPlusCount', '누적 추가'], ['searchCount', '누적 검색'], ['viewCount', '조회수'], ['activatedAt', '🔥된 때'], ['externalUntil', '유지 끝'], ['createdAt', '등록'],
];
const SORTABLE = new Set(['trendValue', 'holderCount', 'totalPlusCount', 'searchCount', 'viewCount', 'activatedAt', 'externalUntil', 'createdAt']);
const NUMERIC = new Set(['trendValue', 'holderCount', 'totalPlusCount', 'searchCount', 'viewCount']);
const STATE_CARDS: [string, string][] = [['', '전체'], ['활성', '🔥 활성'], ['비활성', '💤 비활성'], ['금지', '⛔ 금지']];
const SOURCES: [string, string][] = [['', '전체'], ['google', 'google'], ['admin', 'admin'], ['internal', 'internal']];

export function StateBadge({ state }: { state: string }) {
  const label = state === '활성' ? '🔥 활성' : state === '비활성' ? '💤 비활성' : state === '금지' ? '⛔ 금지' : state;
  return <span className={`akw-badge s-${state}`}>{label}</span>;
}

/** 공개 키워드 페이지(4.28). 금지된 키워드는 열리지 않으므로 링크를 만들지 않는다 */
const publicUrl = (k: AdminKeywordRow) => `/${getAdminCountry().toLowerCase()}/keywords/${encodeURIComponent(k.normalized)}`;

type Action = 'add' | 'ban' | 'unbanAdd';

export function KeywordsTab() {
  const [query, setQuery] = useState<AdminKeywordQuery>({ sort: 'createdAt', dir: 'desc', page: 0 });
  const [qInput, setQInput] = useState('');
  const [data, setData] = useState<AdminKeywordPage | null>(null);
  const [lookup, setLookup] = useState<AdminKeywordLookup | null>(null);
  const [lookupBusy, setLookupBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmBan, setConfirmBan] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const hold = useHoldText();

  const load = useCallback(() => {
    adminApi.keywords(query).then((d) => { setData(d); setError(null); }).catch((e) => setError(errMsg(e)));
  }, [query]);
  useEffect(load, [load]);

  const runLookup = useCallback(async (text: string) => {
    if (!text) { setLookup(null); return; }
    setLookupBusy(true);
    try { setLookup(await adminApi.lookupKeyword(text)); } catch (e) { setError(errMsg(e)); } finally { setLookupBusy(false); }
  }, []);

  const submit = (e?: FormEvent) => {
    e?.preventDefault();
    const text = qInput.trim();
    setQuery((q) => ({ ...q, page: 0, q: text }));
    void runLookup(text);
  };
  const clear = () => { setQInput(''); setQuery((q) => ({ ...q, page: 0, q: '' })); setLookup(null); inputRef.current?.focus(); };

  const refresh = (text: string) => { load(); void runLookup(text); };
  const sortBy = (key: string) => {
    if (!SORTABLE.has(key)) return;
    setQuery((q) => ({ ...q, page: 0, sort: key, dir: q.sort === key && q.dir === 'desc' ? 'asc' : 'desc' }));
  };
  const toggleBan = async (k: AdminKeywordRow, banned: boolean) => {
    setConfirmBan(null);
    try { await adminApi.ban(k.id, banned); successToast(banned ? `⛔ '${k.text}'을(를) 금지했어요` : `'${k.text}'의 금지를 풀었어요`); refresh(lookup?.text ?? ''); }
    catch (e) { setError(errMsg(e)); }
  };
  const quickAdd = async (k: AdminKeywordRow) => {
    try { await adminApi.addKeyword(k.text); successToast(`🔥 '${k.text}'을(를) 추가했어요`); refresh(lookup?.text ?? ''); }
    catch (e) { setError(errMsg(e)); }
  };

  const counts = data?.stateCounts ?? {};
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const stateOn = (v: string) => (v ? query.state?.length === 1 && query.state[0] === v : !query.state || query.state.length === 0);
  const pickState = (v: string) => setQuery((q) => ({ ...q, page: 0, state: v ? [v] : [] }));
  const toggleSource = (v: string) => setQuery((q) => {
    if (!v) return { ...q, page: 0, source: [] };
    const cur = q.source ?? [];
    const next = cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v];
    return { ...q, page: 0, source: next.length === SOURCES.length - 1 ? [] : next };
  });
  const pages = data ? Math.max(1, Math.ceil(data.total / data.size)) : 1;
  const hit = lookup?.keyword?.id;

  return (
    <section className="admin-panel akw">
      <div className="akw-stats" role="group" aria-label="상태 필터">
        {STATE_CARDS.map(([v, label]) => (
          <button key={v || 'all'} type="button" className={`akw-stat s-${v || 'all'}${stateOn(v) ? ' on' : ''}`} aria-pressed={stateOn(v)} onClick={() => pickState(v)}>
            <span className="akw-stat-label">{label}</span>
            <strong>{(v ? counts[v] ?? 0 : total).toLocaleString()}</strong>
          </button>
        ))}
      </div>

      <form className="akw-search" role="search" onSubmit={submit}>
        <span className="akw-search-icon" aria-hidden="true">🔍</span>
        <input ref={inputRef} value={qInput} onChange={(e) => setQInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Escape') clear(); }}
               placeholder="키워드를 검색하거나, 새 단어를 입력해 바로 추가·금지하세요" aria-label="키워드 검색" autoComplete="off" />
        {qInput && <button type="button" className="akw-clear" onClick={clear} aria-label="검색어 지우기">✕</button>}
        <button type="submit" className="primary">검색</button>
      </form>

      <div aria-live="polite">
        {lookupBusy && !lookup && <div className="akw-card akw-skeleton" aria-hidden="true" />}
        {lookup && <LookupCard lookup={lookup} onChanged={() => refresh(lookup.text)} onError={setError} />}
      </div>

      <div className="akw-filter-row">
        <div className="akw-sources" role="group" aria-label="소스 필터">
          <span className="muted small">소스</span>
          {SOURCES.map(([v, label]) => {
            const on = v ? query.source?.includes(v) : !query.source || query.source.length === 0;
            return <button key={v || 'all'} type="button" role="checkbox" aria-checked={!!on} className={`sort-chip${on ? ' active' : ''}`} onClick={() => toggleSource(v)}>{label}</button>;
          })}
        </div>
        <span className="muted small akw-count">{data ? `${data.total.toLocaleString()}개${query.q ? ` · “${query.q}” 검색 결과` : ''}` : '불러오는 중…'}</span>
      </div>

      {error && <p className="error" role="alert">{error}</p>}
      <div className="admin-table-wrap akw-table-wrap">
        <table className="admin-table akw-table">
          <thead>
            <tr>
              {SORTS.map(([key, label]) => (
                <th key={key} className={`${SORTABLE.has(key) ? 'sortable' : ''}${NUMERIC.has(key) ? ' num' : ''}`} onClick={() => sortBy(key)}
                    aria-sort={query.sort === key ? (query.dir === 'asc' ? 'ascending' : 'descending') : undefined}>
                  {label}{query.sort === key ? (query.dir === 'asc' ? ' ↑' : ' ↓') : ''}
                </th>
              ))}
              <th>관리</th>
            </tr>
          </thead>
          <tbody>
            {!data && <tr><td colSpan={SORTS.length + 1} className="muted akw-empty">불러오는 중…</td></tr>}
            {data?.items.map((k) => (
              <tr key={k.id} className={`${k.state === '금지' ? 'banned' : ''}${k.id === hit ? ' akw-hit' : ''}`}>
                <td>
                  <div className="akw-key">
                    <strong>{k.text}</strong>
                    {k.state !== '금지' && <a className="akw-link" href={publicUrl(k)} target="_blank" rel="noopener noreferrer" title="공개 페이지 열기" aria-label={`${k.text} 공개 페이지 열기`}>↗</a>}
                  </div>
                </td>
                <td><StateBadge state={k.state} /></td>
                <td><span className="akw-source">{k.source}</span></td>
                <td className="num">{k.trendValue}</td>
                <td className="num">{k.holderCount.toLocaleString()}</td>
                <td className="num">{k.totalPlusCount.toLocaleString()}</td>
                <td className="num">{k.searchCount.toLocaleString()}</td>
                <td className="num">{k.viewCount.toLocaleString()}</td>
                <td>{fmt(k.activatedAt)}</td>
                <td>{fmt(k.externalUntil)}</td>
                <td>{fmt(k.createdAt)}</td>
                <td>
                  <span className="akw-row-actions">
                    {k.state === '금지' ? <button onClick={() => toggleBan(k, false)}>해제</button>
                      : confirmBan === k.id ? (
                        <>
                          <button className="danger solid" onClick={() => toggleBan(k, true)}>금지 확인</button>
                          <button onClick={() => setConfirmBan(null)}>취소</button>
                        </>
                      ) : (
                        <>
                          {k.state === '비활성' && <button onClick={() => quickAdd(k)} title={`🔥활성으로 추가(${hold.short} 유지)`}>🔥 추가</button>}
                          <button className="danger" onClick={() => setConfirmBan(k.id)}>금지</button>
                        </>
                      )}
                  </span>
                </td>
              </tr>
            ))}
            {data && data.items.length === 0 && (
              <tr><td colSpan={SORTS.length + 1} className="muted akw-empty">
                {query.q ? '검색한 단어와 맞는 키워드가 없어요. 위 카드에서 바로 추가하거나 금지할 수 있어요.' : '키워드가 없어요'}
              </td></tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="admin-pager">
        <button disabled={query.page <= 0} onClick={() => setQuery((q) => ({ ...q, page: q.page - 1 }))}>‹ 이전</button>
        <span>{query.page + 1} / {pages}</span>
        <button disabled={query.page + 1 >= pages} onClick={() => setQuery((q) => ({ ...q, page: q.page + 1 }))}>다음 ›</button>
      </div>
    </section>
  );
}

/** 검색한 단어 한 개의 조회 카드: 등록돼 있으면 상태·수치와 조치, 등록 전이면 [바로 추가]·[바로 금지], 규칙에 안 맞으면 이유 */
function LookupCard({ lookup, onChanged, onError }: { lookup: AdminKeywordLookup; onChanged(): void; onError(m: string): void }) {
  const [pending, setPending] = useState<Action | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => setPending(null), [lookup.text, lookup.keyword?.state]);
  const k = lookup.keyword;
  const hold = useHoldText();

  if (!lookup.valid) {
    return (
      <div className="akw-card invalid" role="status">
        <div className="akw-card-head"><strong className="akw-word">{lookup.text || '(비어 있음)'}</strong><span className="akw-badge s-warn">⚠ 쓸 수 없는 단어</span></div>
        <p className="muted small">{lookup.reason ?? '키워드 규칙에 맞지 않아요'} · 규칙에 맞지 않는 단어는 사용자가 만들 수 없어서 금지할 필요가 없어요.</p>
      </div>
    );
  }

  const run = async (action: Action) => {
    setBusy(true);
    try {
      if (action === 'add') { await adminApi.addKeyword(lookup.text); successToast(`🔥 '${lookup.text}'을(를) 추가했어요`); }
      else if (action === 'ban') { await adminApi.banKeywordText(lookup.text); successToast(`⛔ '${lookup.text}'을(를) 금지했어요`); }
      else if (k) { await adminApi.ban(k.id, false); await adminApi.addKeyword(lookup.text); successToast(`🔥 금지를 풀고 '${lookup.text}'을(를) 추가했어요`); }
      setPending(null);
      onChanged();
    } catch (e) { onError(errMsg(e)); } finally { setBusy(false); }
  };
  const confirmText: Record<Action, string> = {
    add: `‘${lookup.text}’을(를) 🔥활성 키워드로 추가할까요? 반영 소스는 admin이고 지금부터 ${hold.long} 동안 유지돼요.`,
    ban: `‘${lookup.text}’을(를) 금지할까요? 검색·추가가 막히고 공개 페이지도 열리지 않아요.${k ? ' 가진 사람의 점수에서도 바로 빠져요.' : ' 아직 등록 전이라 금지 상태로 새로 등록돼요.'}`,
    unbanAdd: `‘${lookup.text}’의 금지를 풀고 🔥활성으로 추가할까요?`,
  };
  const confirmBar = pending && (
    <div className={`akw-confirm${pending === 'ban' ? ' danger' : ''}`} role="alertdialog" aria-label="확인">
      <p>{confirmText[pending]}</p>
      <div className="akw-actions">
        <button className={pending === 'ban' ? 'danger solid' : 'primary'} disabled={busy} onClick={() => run(pending)}>{busy ? '처리하는 중…' : pending === 'ban' ? '금지 확인' : '추가 확인'}</button>
        <button disabled={busy} onClick={() => setPending(null)}>취소</button>
      </div>
    </div>
  );

  if (!k) {
    return (
      <div className="akw-card new" role="status">
        <div className="akw-card-head"><strong className="akw-word">{lookup.text}</strong><span className="akw-badge s-new">✨ 아직 등록되지 않았어요</span></div>
        <p className="muted small">바로 🔥활성으로 넣거나, 사용자가 쓰기 전에 미리 금지해 둘 수 있어요.</p>
        {!pending && (
          <div className="akw-actions">
            <button className="primary" onClick={() => setPending('add')}>🔥 바로 추가</button>
            <button className="danger" onClick={() => setPending('ban')}>⛔ 바로 금지</button>
          </div>
        )}
        {confirmBar}
      </div>
    );
  }

  return (
    <div className={`akw-card ${k.state === '금지' ? 'banned' : 'found'}`} role="status">
      <div className="akw-card-head">
        <strong className="akw-word">{k.text}</strong><StateBadge state={k.state} /><span className="akw-source">{k.source}</span>
        {k.state !== '금지' && <a className="akw-link wide" href={publicUrl(k)} target="_blank" rel="noopener noreferrer">공개 페이지 ↗</a>}
      </div>
      <dl className="akw-metrics">
        <div><dt>점수</dt><dd>{k.trendValue}</dd></div>
        <div><dt>가진 사람</dt><dd>{k.holderCount.toLocaleString()}</dd></div>
        <div><dt>누적 추가</dt><dd>{k.totalPlusCount.toLocaleString()}</dd></div>
        <div><dt>누적 검색</dt><dd>{k.searchCount.toLocaleString()}</dd></div>
        <div><dt>조회수</dt><dd>{k.viewCount.toLocaleString()}</dd></div>
        <div><dt>{k.state === '금지' ? '금지한 때' : '유지 끝'}</dt><dd className="small">{fmt(k.state === '금지' ? k.bannedAt : k.externalUntil)}</dd></div>
      </dl>
      {!pending && (
        <div className="akw-actions">
          {k.state === '금지' ? (
            <>
              <button onClick={async () => { setBusy(true); try { await adminApi.ban(k.id, false); successToast(`'${k.text}'의 금지를 풀었어요`); onChanged(); } catch (e) { onError(errMsg(e)); } finally { setBusy(false); } }} disabled={busy}>금지 해제</button>
              <button className="primary" onClick={() => setPending('unbanAdd')}>해제하고 🔥 추가</button>
            </>
          ) : (
            <>
              <button className="primary" onClick={() => setPending('add')}>{k.state === '활성' ? `🔥 ${hold.short} 다시 연장` : '🔥 활성으로 추가'}</button>
              <button className="danger" onClick={() => setPending('ban')}>⛔ 금지</button>
            </>
          )}
        </div>
      )}
      {confirmBar}
    </div>
  );
}
