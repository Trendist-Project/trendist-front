import { useCallback, useEffect, useState, type FormEvent } from 'react';
import {
  adminApi, resumeSession,
  type AdminKeywordPage, type AdminKeywordQuery, type AdminReport, type SanctionKind, type AdminNotice, type AdminNoticeInput, type AdminReportPage, type AdminSetting, type AdminShareStats, type AdminStatus,
} from '../api/client';
import { STATE_BADGE } from '../ui/keywordFormat';
import { RichText } from '../ui/RichText';
import { GuidesTab } from './GuidesTab';
import { DashboardTab } from './DashboardTab';
import { StatsTab } from './StatsTab';
import { AiCommentsTab } from './AiCommentsTab';
import { UsersTab } from './UsersTab';
import { MarkupEditor } from './MarkupEditor';
import { successToast } from '../ui/toast';
import { errMsg, fmt } from './format';

/**
 * 관리자 페이지(13절, /admin/). 게임과 따로 열고, 로그인한 계정(갱신 토큰)으로 들어온다.
 * 서버가 /api/admin/**를 ROLE_ADMIN(users.role = ADMIN)만 받는다. 권한이 없으면 접근할 수 없다는 문구만 보여 준다.
 */
type Tab = 'dashboard' | 'stats' | 'users' | 'keywords' | 'ai' | 'add' | 'reports' | 'notices' | 'guides' | 'share' | 'settings';
const TABS: [Tab, string][] = [['dashboard', '대시보드'], ['stats', '통계'], ['users', '사용자'], ['keywords', '키워드'], ['ai', 'AI 설명'], ['add', '키워드 추가'], ['reports', '신고'], ['notices', '공지'], ['guides', '가이드'], ['share', '공유'], ['settings', '설정']];


export function AdminApp() {
  const [status, setStatus] = useState<AdminStatus | null | 'nologin'>(null);
  const [tab, setTabState] = useState<Tab>('dashboard');
  // 대시보드에서 눌러 들어갈 때 사용자 탭에 넘길 값(바로 열 사용자, 필터). key가 바뀌면 사용자 탭을 새로 연다
  const [jump, setJump] = useState<{ userId: number | null; filter: string; key: number }>({ userId: null, filter: 'all', key: 0 });
  const setTab = (t: Tab) => setTabState(t);
  const go = (t: string, opts?: { userId?: number; filter?: string }) => {
    if (t === 'users') setJump((j) => ({ userId: opts?.userId ?? null, filter: opts?.filter ?? 'all', key: j.key + 1 }));
    setTabState(t as Tab);
    window.scrollTo({ top: 0 });
  };

  useEffect(() => {
    resumeSession().then((ok) => {
      if (!ok) { setStatus('nologin'); return; }
      adminApi.status().then(setStatus).catch(() => setStatus('nologin'));
    });
  }, []);

  if (status === null) return <main className="admin"><p className="muted">확인하는 중…</p></main>;
  // 로그인하지 않았거나 관리자가 아니면 이유나 방법을 알려 주지 않고 접근할 수 없다고만 보여 준다
  if (status === 'nologin' || !status.admin) {
    return (
      <main className="admin admin-denied">
        <h1>접근할 수 없는 페이지예요</h1>
        <p><a href="/">게임으로 돌아가기</a></p>
      </main>
    );
  }
  return (
    <main className="admin">
      <header className="admin-head">
        <h1>Trendist 관리자</h1>
        <nav className="admin-tabs" role="tablist">
          {TABS.map(([t, label]) => (
            <button key={t} role="tab" aria-selected={tab === t} className={tab === t ? 'on' : undefined} onClick={() => setTab(t)}>{label}</button>
          ))}
        </nav>
        <a className="muted small" href="/">게임으로</a>
      </header>
      {tab === 'dashboard' && <DashboardTab onGo={go} />}
      {tab === 'stats' && <StatsTab />}
      {tab === 'users' && <UsersTab key={jump.key} initialUserId={jump.userId} initialFilter={jump.filter} />}
      {tab === 'keywords' && <KeywordsTab />}
      {tab === 'ai' && <AiCommentsTab />}
      {tab === 'add' && <AddTab />}
      {tab === 'reports' && <ReportsTab onGo={go} />}
      {tab === 'notices' && <NoticesTab />}
      {tab === 'guides' && <GuidesTab />}
      {tab === 'share' && <ShareTab />}
      {tab === 'settings' && <SettingsTab />}
    </main>
  );
}

// ---------------------------------------------------------------- 키워드 목록(13.1, 13.6)

const SORTS: [string, string][] = [
  ['text', '키워드'], ['state', '상태'], ['source', '소스'], ['trendValue', '점수'], ['holderCount', '가진 사람'],
  ['totalPlusCount', '누적 추가'], ['searchCount', '누적 검색'], ['activatedAt', '🔥된 때'], ['externalUntil', '유지 끝'], ['createdAt', '등록'],
];
const SORTABLE = new Set(['trendValue', 'holderCount', 'totalPlusCount', 'searchCount', 'activatedAt', 'externalUntil', 'createdAt']);
const STATES: [string, string][] = [['', '전체'], ['활성', '🔥 활성'], ['비활성', '💤 비활성'], ['금지', '⛔ 금지']];
const SOURCES: [string, string][] = [['', '전체'], ['google', 'google'], ['admin', 'admin'], ['internal', 'internal']];

/** 필터 한 줄: 이름표 + 하나만 고르는 칩(게임의 정렬 칩과 같은 모양). */
function ChipFilter({ label, options, value, counts, onChange }: {
  label: string; options: [string, string][]; value: string; counts?: Record<string, number>; onChange(v: string): void;
}) {
  const total = counts ? Object.values(counts).reduce((a, b) => a + b, 0) : undefined;
  return (
    <div className="admin-chip-filter" role="radiogroup" aria-label={label}>
      <span className="admin-chip-label">{label}</span>
      {options.map(([v, text]) => {
        const n = counts ? (v ? counts[v] ?? 0 : total) : undefined;
        return (
          <button key={v || 'all'} type="button" role="radio" aria-checked={value === v}
                  className={`sort-chip${value === v ? ' active' : ''}`} onClick={() => onChange(v)}>
            {text}{n !== undefined && <span className="chip-count">{n.toLocaleString()}</span>}
          </button>
        );
      })}
    </div>
  );
}

/** 필터 한 줄: 여러 개를 고를 수 있는 칩. 아무것도 안 고르면 [전체]. 눌러서 켜고 끈다. */
function MultiChipFilter({ label, options, values, counts, onChange }: {
  label: string; options: [string, string][]; values: string[]; counts?: Record<string, number>; onChange(v: string[]): void;
}) {
  const total = counts ? Object.values(counts).reduce((a, b) => a + b, 0) : undefined;
  const toggle = (v: string) => {
    if (!v) return onChange([]);
    const next = values.includes(v) ? values.filter((x) => x !== v) : [...values, v];
    onChange(next.length === options.length - 1 ? [] : next); // 전부 골랐으면 전체와 같다
  };
  return (
    <div className="admin-chip-filter" role="group" aria-label={label}>
      <span className="admin-chip-label">{label}</span>
      {options.map(([v, text]) => {
        const on = v ? values.includes(v) : values.length === 0;
        const n = counts ? (v ? counts[v] ?? 0 : total) : undefined;
        return (
          <button key={v || 'all'} type="button" role="checkbox" aria-checked={on}
                  className={`sort-chip${on ? ' active' : ''}`} onClick={() => toggle(v)}>
            {text}{n !== undefined && <span className="chip-count">{n.toLocaleString()}</span>}
          </button>
        );
      })}
    </div>
  );
}

function KeywordsTab() {
  const [query, setQuery] = useState<AdminKeywordQuery>({ sort: 'trendValue', dir: 'desc', page: 0 });
  const [qInput, setQInput] = useState('');
  const [data, setData] = useState<AdminKeywordPage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmBan, setConfirmBan] = useState<number | null>(null);

  const load = useCallback(() => {
    adminApi.keywords(query).then((d) => { setData(d); setError(null); }).catch((e) => setError(errMsg(e)));
  }, [query]);
  useEffect(load, [load]);

  const sortBy = (key: string) => {
    if (!SORTABLE.has(key)) return;
    setQuery((q) => ({ ...q, page: 0, sort: key, dir: q.sort === key && q.dir === 'desc' ? 'asc' : 'desc' }));
  };
  const toggleBan = async (id: number, banned: boolean) => {
    setConfirmBan(null);
    try { await adminApi.ban(id, banned); load(); } catch (e) { setError(errMsg(e)); }
  };
  const pages = data ? Math.max(1, Math.ceil(data.total / data.size)) : 1;

  return (
    <section className="admin-panel">
      <div className="admin-filter-box">
        <form className="admin-search" onSubmit={(e: FormEvent) => { e.preventDefault(); setQuery((q) => ({ ...q, page: 0, q: qInput.trim() })); }}>
          <input value={qInput} onChange={(e) => setQInput(e.target.value)} placeholder="🔍 키워드 검색" aria-label="키워드 검색" />
          <button type="submit" className="primary">검색</button>
          <span className="muted small">{data ? `${data.total.toLocaleString()}개` : ''}</span>
        </form>
        <MultiChipFilter label="상태" options={STATES} values={query.state ?? []} counts={data?.stateCounts}
                         onChange={(v) => setQuery((q) => ({ ...q, page: 0, state: v }))} />
        <MultiChipFilter label="소스" options={SOURCES} values={query.source ?? []}
                         onChange={(v) => setQuery((q) => ({ ...q, page: 0, source: v }))} />
      </div>
      {error && <p className="error">{error}</p>}
      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              {SORTS.map(([key, label]) => (
                <th key={key} className={SORTABLE.has(key) ? 'sortable' : undefined} onClick={() => sortBy(key)}
                    aria-sort={query.sort === key ? (query.dir === 'asc' ? 'ascending' : 'descending') : undefined}>
                  {label}{query.sort === key ? (query.dir === 'asc' ? ' ↑' : ' ↓') : ''}
                </th>
              ))}
              <th>관리</th>
            </tr>
          </thead>
          <tbody>
            {data?.items.map((k) => (
              <tr key={k.id} className={k.state === '금지' ? 'banned' : undefined}>
                <td><strong>{k.text}</strong></td>
                <td>{STATE_BADGE[k.state] ?? k.state}</td>
                <td>{k.source}</td>
                <td className="num">{k.trendValue}</td>
                <td className="num">{k.holderCount.toLocaleString()}</td>
                <td className="num">{k.totalPlusCount.toLocaleString()}</td>
                <td className="num">{k.searchCount.toLocaleString()}</td>
                <td>{fmt(k.activatedAt)}</td>
                <td>{fmt(k.externalUntil)}</td>
                <td>{fmt(k.createdAt)}</td>
                <td>
                  {k.state === '금지' ? <button onClick={() => toggleBan(k.id, false)}>해제</button>
                    : confirmBan === k.id ? (
                      <span className="confirm">
                        <button className="danger" onClick={() => toggleBan(k.id, true)}>금지 확인</button>
                        <button onClick={() => setConfirmBan(null)}>취소</button>
                      </span>
                    ) : <button onClick={() => setConfirmBan(k.id)}>금지</button>}
                </td>
              </tr>
            ))}
            {data && data.items.length === 0 && <tr><td colSpan={SORTS.length + 1} className="muted">키워드가 없어요</td></tr>}
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

// ---------------------------------------------------------------- 키워드 추가(13.7): 쉼표로 여러 개, 확인 후 추가

type AddResult = { text: string; ok: boolean; message: string };

function parseKeywords(input: string) {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of input.split(/[,，\n]/)) {
    const t = raw.trim().replace(/\s+/g, ' ');
    const key = t.replace(/\s+/g, '').toLowerCase(); // 서버 정규화처럼 공백·대소문자는 같은 키워드로 본다
    if (!t || seen.has(key)) continue;
    seen.add(key);
    out.push(t);
  }
  return out;
}

function AddTab() {
  const [input, setInput] = useState('');
  const [pending, setPending] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<AddResult[]>([]);

  async function apply() {
    if (!pending) return;
    setBusy(true);
    const out: AddResult[] = [];
    for (const text of pending) {
      try {
        const r = await adminApi.addKeyword(text);
        out.push({ text, ok: true, message: `${r.created ? '새로 만듦' : '이미 있던 키워드를 admin으로'} · 🔥 ${r.trendValue}점 · ${fmt(r.externalUntil)}까지` });
      } catch (e) {
        out.push({ text, ok: false, message: errMsg(e) });
      }
      setResults([...out]);
    }
    setBusy(false);
    setPending(null);
    setInput('');
  }

  return (
    <section className="admin-panel">
      <p className="muted small">관리자가 넣은 키워드는 바로 🔥활성이 되고 반영 소스가 <code>admin</code>이에요. 넣은 때부터 7일(설정 <code>external_hold_hours</code>) 동안 유지되고, 끝나면 internal로 내려가요. 여러 개는 쉼표로 나눠 적어요.</p>
      {!pending ? (
        <form className="admin-add" onSubmit={(e: FormEvent) => { e.preventDefault(); const list = parseKeywords(input); if (list.length) { setPending(list); setResults([]); } }}>
          <textarea value={input} onChange={(e) => setInput(e.target.value)} rows={3} placeholder="예) 양쯔깐루, 두바이 쫀득 쿠키, 말차라떼" aria-label="추가할 키워드" />
          <button className="primary" type="submit" disabled={!parseKeywords(input).length}>확인</button>
        </form>
      ) : (
        <div className="admin-confirm">
          <p><strong>{pending.length}개</strong>를 🔥활성 키워드로 추가할까요?</p>
          <ul className="admin-chips">{pending.map((k) => <li key={k}>{k}</li>)}</ul>
          <div className="admin-actions">
            <button className="primary" onClick={apply} disabled={busy}>{busy ? '추가하는 중…' : '추가'}</button>
            <button onClick={() => setPending(null)} disabled={busy}>다시 고치기</button>
          </div>
        </div>
      )}
      {results.length > 0 && (
        <ul className="admin-results">
          {results.map((r) => <li key={r.text} className={r.ok ? 'ok' : 'fail'}>{r.ok ? '✔' : '✖'} <strong>{r.text}</strong> · {r.message}</li>)}
        </ul>
      )}
    </section>
  );
}

// ---------------------------------------------------------------- 신고(13.5)

const REPORT_STATUS: [string, string][] = [['RECEIVED', '접수'], ['RESOLVED', '조치함'], ['REJECTED', '문제없음'], ['', '전체']];
const STATUS_LABEL: Record<string, string> = { RECEIVED: '접수', RESOLVED: '조치함', REJECTED: '문제없음' };

/** 신고 유형별로 먼저 골라 두는 조치(13.5): 채팅은 채팅 정지, 댓글은 댓글 작성 정지 + 댓글 지우기, 플레이어는 제재 없이 */
const ACT_DEFAULT: Record<string, { sanction: SanctionKind | null; days: number | null; del: boolean }> = {
  채팅: { sanction: 'CHAT', days: 1, del: false },
  댓글: { sanction: 'COMMENT', days: 1, del: true },
  플레이어: { sanction: null, days: 1, del: false },
};
const ACT_SANCTIONS: [SanctionKind | null, string][] = [[null, '제재 없이'], ['CHAT', '💬 채팅 정지'], ['COMMENT', '📝 댓글 작성 정지'], ['UPLOAD', '🎨 그림 저장 정지'], ['BAN', '⛔ 계정 금지']];
const ACT_DAYS: [number | null, string][] = [[1, '1일'], [3, '3일'], [7, '7일'], [30, '30일'], [null, '영구']];

function ReportsTab({ onGo }: { onGo(tab: string, opts?: { userId?: number }): void }) {
  const [status, setStatus] = useState('RECEIVED');
  const [page, setPage] = useState(0);
  const [data, setData] = useState<AdminReportPage | null>(null);
  const [sameTarget, setSameTarget] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    adminApi.reports(status, page).then((d) => { setData(d); setError(null); }).catch((e) => setError(errMsg(e)));
  }, [status, page]);
  useEffect(load, [load]);

  const decide = async (id: number, s: string) => {
    try {
      const r = await adminApi.setReportStatus(id, s, sameTarget);
      successToast(`${STATUS_LABEL[s]}으로 바꿨어요${r.changed > 1 ? ` (같은 대상 ${r.changed}건)` : ''}`);
      load();
    } catch (e) { setError(errMsg(e)); }
  };
  const pages = data ? Math.max(1, Math.ceil(data.total / data.size)) : 1;

  return (
    <section className="admin-panel">
      <div className="admin-filters">
        {REPORT_STATUS.map(([s, label]) => (
          <button key={s} className={status === s ? 'on' : undefined} onClick={() => { setStatus(s); setPage(0); }}>{label}</button>
        ))}
        <span className="muted small">{data ? `${data.total.toLocaleString()}건` : ''}</span>
        <label className={sameTarget ? 'admin-switch on' : 'admin-switch'} title="처리할 때 같은 댓글·채팅·플레이어에 들어온 다른 접수 신고도 같은 결과로 바꿔요">
          <input type="checkbox" role="switch" checked={sameTarget} onChange={(e) => setSameTarget(e.target.checked)} />
          <span className="admin-switch-track" aria-hidden="true"><span /></span>
          <span className="admin-switch-text"><strong>같은 대상 함께 처리</strong><span className="muted">같은 대상의 접수 신고도 같은 결과로</span></span>
        </label>
      </div>
      {error && <p className="error">{error}</p>}
      <ul className="admin-reports">
        {data?.items.map((r) => (
          <ReportCard key={r.id} r={r} sameTarget={sameTarget} onDone={load} onDecide={decide} onError={setError} onGo={onGo} />
        ))}
        {data && data.items.length === 0 && <li className="muted">신고가 없어요</li>}
      </ul>
      <div className="admin-pager">
        <button disabled={page <= 0} onClick={() => setPage((p) => p - 1)}>‹ 이전</button>
        <span>{page + 1} / {pages}</span>
        <button disabled={page + 1 >= pages} onClick={() => setPage((p) => p + 1)}>다음 ›</button>
      </div>
    </section>
  );
}

/**
 * 신고 한 건(13.5). 접수된 신고는 아래 조치 칸에서 제재 종류·기간·사유를 골라 [제재하고 조치함]을 누르면 그 사람에게 제재를 걸고
 * (댓글이면 지우기도) 바로 조치함으로 넘어간다. 문제가 없으면 [문제없음].
 */
function ReportCard({ r, sameTarget, onDone, onDecide, onError, onGo }: {
  r: AdminReport; sameTarget: boolean; onDone(): void; onDecide(id: number, s: string): void; onError(e: string): void;
  onGo(tab: string, opts?: { userId?: number }): void;
}) {
  const def = ACT_DEFAULT[r.type] ?? { sanction: null, days: 1, del: false };
  const [sanction, setSanction] = useState<SanctionKind | null>(def.sanction);
  const [days, setDays] = useState<number | null>(def.days);
  const [reason, setReason] = useState('');
  const [del, setDel] = useState(def.del && !r.contentDeleted);
  const [busy, setBusy] = useState(false);
  const canSanction = r.targetUserId !== null;
  const isComment = r.type === '댓글';
  const label = ACT_SANCTIONS.find(([k]) => k === sanction)?.[1] ?? '';

  async function act() {
    const what = [sanction ? `${label.replace(/^\S+\s/, '')} ${days ? `${days}일` : '영구'}` : null, del ? '댓글 지우기' : null].filter(Boolean).join(' + ') || '제재 없이 조치함';
    if (!window.confirm(`${r.targetNickname ?? '대상'}: ${what}\n이렇게 처리하고 조치함으로 넘길까요?`)) return;
    setBusy(true);
    try {
      const res = await adminApi.actReport(r.id, { sanction, days, reason: reason.trim(), deleteContent: del && isComment, sameTarget });
      successToast(`처리했어요: ${what}${res.changed > 1 ? ` (신고 ${res.changed}건 조치함)` : ''}`);
      onDone();
    } catch (e) {
      onError(errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className={`report-${r.status}`}>
      <div className="report-head">
        <span className="badge">{r.type}</span>
        <strong>{r.targetNickname ?? '(없어진 대상)'}</strong>
        {r.targetUserId !== null && <button className="link-btn small" onClick={() => onGo('users', { userId: r.targetUserId! })}>사용자 보기 ›</button>}
        <span className="muted small">신고 {r.sameTargetCount}건 · {r.reporterNickname} 신고 · {fmt(r.createdAt)}</span>
        <span className={`report-status ${r.status}`}>{STATUS_LABEL[r.status] ?? r.status}</span>
      </div>
      {r.targetSanctions.length > 0 && (
        <div className="report-sanctions">{r.targetSanctions.map((x) => <span key={x} className="badge danger">{x}</span>)}</div>
      )}
      {r.keywordText && <p className="muted small">키워드: {r.keywordText}</p>}
      {r.content && <blockquote className={r.contentDeleted ? 'deleted' : undefined}>{r.content}{r.contentDeleted ? ' (지운 댓글)' : ''}</blockquote>}
      <p className="small">사유: {r.reason ?? '(없음)'}</p>
      {r.status === 'RECEIVED' ? (
        <div className="report-act">
          <div className="admin-filters">
            <span className="muted small">제재</span>
            {ACT_SANCTIONS.map(([k, l]) => (
              <button key={l} type="button" disabled={!canSanction && k !== null} className={sanction === k ? (k === 'BAN' ? 'on danger-on' : 'on') : undefined}
                      onClick={() => setSanction(k)}>{l}</button>
            ))}
          </div>
          {sanction && (
            <div className="admin-filters">
              <span className="muted small">기간</span>
              {ACT_DAYS.map(([v, l]) => <button key={l} type="button" className={days === v ? 'on' : undefined} onClick={() => setDays(v)}>{l}</button>)}
            </div>
          )}
          {sanction && (
            <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500}
                   placeholder={`사유(비우면 "신고 #${r.id}(${r.type}): ${r.reason ?? ''}"로 남아요)`} aria-label="제재 사유" />
          )}
          {isComment && !r.contentDeleted && (
            <label className="report-check"><input type="checkbox" checked={del} onChange={(e) => setDel(e.target.checked)} /> 신고된 댓글 지우기(사용자에게 "삭제된 댓글"로 보여요)</label>
          )}
          <div className="admin-actions">
            <button className="danger" disabled={busy} onClick={act}>{sanction || del ? '제재하고 조치함' : '조치함(제재 없이)'}</button>
            <button disabled={busy} onClick={() => onDecide(r.id, 'REJECTED')}>문제없음</button>
          </div>
        </div>
      ) : (
        <div className="admin-actions">
          <button onClick={() => onDecide(r.id, 'RECEIVED')}>접수로 되돌리기</button>
          <span className="muted small">걸린 제재는 사용자 탭에서 풀 수 있어요</span>
        </div>
      )}
    </li>
  );
}

// ---------------------------------------------------------------- 공유 통계(13.8)

const SHARE_SORTS: [string, string][] = [['views', '조회순'], ['plays', '클릭순'], ['createdAt', '최신순']];

function ShareTab() {
  const [sort, setSort] = useState('views');
  const [page, setPage] = useState(0);
  const [data, setData] = useState<AdminShareStats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    adminApi.shareStats(sort, page).then((d) => { setData(d); setError(null); }).catch((e) => setError(errMsg(e)));
  }, [sort, page]);

  const pages = data ? Math.max(1, Math.ceil(data.total / data.size)) : 1;
  const rate = data && data.views > 0 ? `${((data.plays / data.views) * 100).toFixed(1)}%` : '-';

  return (
    <section className="admin-panel">
      <div className="admin-stat-row">
        <div className="admin-stat"><span>만든 카드</span><strong>{data?.cards.toLocaleString() ?? '-'}</strong><em>오늘 {data?.cardsToday.toLocaleString() ?? 0}</em></div>
        <div className="admin-stat"><span>조회</span><strong>{data?.views.toLocaleString() ?? '-'}</strong><em>공유 페이지를 연 사람</em></div>
        <div className="admin-stat"><span>[플레이 하러 가기]</span><strong>{data?.plays.toLocaleString() ?? '-'}</strong><em>게임으로 들어온 사람</em></div>
        <div className="admin-stat"><span>클릭률</span><strong>{rate}</strong><em>클릭 ÷ 조회</em></div>
      </div>
      <p className="muted small admin-hint">같은 방문자는 카드마다 하루 1번만 세고, 메신저 미리보기 크롤러는 세지 않아요.</p>
      <div className="admin-filter-box">
        <ChipFilter label="정렬" options={SHARE_SORTS} value={sort} onChange={(v) => { setSort(v); setPage(0); }} />
      </div>
      {error && <p className="error">{error}</p>}
      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead><tr><th>닉네임(공유한 때)</th><th>조회</th><th>클릭</th><th>만든 때</th><th>카드</th></tr></thead>
          <tbody>
            {data?.items.map((c) => (
              <tr key={c.code}>
                <td><strong>{c.nickname}</strong></td>
                <td className="num">{c.views.toLocaleString()}</td>
                <td className="num">{c.plays.toLocaleString()}</td>
                <td>{fmt(c.createdAt)}</td>
                <td><a href={c.url} target="_blank" rel="noreferrer">열기 ↗</a></td>
              </tr>
            ))}
            {data && data.items.length === 0 && <tr><td colSpan={5} className="muted">아직 만든 카드가 없어요</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="admin-pager">
        <button disabled={page <= 0} onClick={() => setPage((p) => p - 1)}>‹ 이전</button>
        <span>{page + 1} / {pages}</span>
        <button disabled={page + 1 >= pages} onClick={() => setPage((p) => p + 1)}>다음 ›</button>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- 설정(13.3)

function SettingsTab() {
  const [items, setItems] = useState<AdminSetting[] | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<Record<string, { ok: boolean; text: string }>>({});
  const [filter, setFilter] = useState('');

  useEffect(() => { adminApi.settings().then(setItems).catch(() => setItems([])); }, []);

  const save = async (s: AdminSetting) => {
    const value = draft[s.name];
    if (value === undefined || value === s.value) return;
    try {
      const updated = await adminApi.updateSetting(s.name, value);
      setItems((list) => list?.map((x) => (x.name === s.name ? updated : x)) ?? null);
      setDraft((d) => { const n = { ...d }; delete n[s.name]; return n; });
      setMsg((m) => { const { [s.name]: _, ...rest } = m; return rest; });
      successToast(`${s.name} 값을 저장했어요(바로 반영)`);
    } catch (e) {
      setMsg((m) => ({ ...m, [s.name]: { ok: false, text: errMsg(e) } }));
    }
  };

  const shown = (items ?? []).filter((s) => !filter || s.name.includes(filter) || (s.description ?? '').includes(filter));
  return (
    <section className="admin-panel">
      <div className="admin-filters">
        <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="이름·설명으로 찾기" aria-label="설정 찾기" />
        <span className="muted small">저장하면 서버가 바로 읽고, 게임 방에는 1초 안에 반영돼요. 범위를 벗어난 값은 저장되지 않아요.</span>
      </div>
      <div className="admin-table-wrap">
        <table className="admin-table settings">
          <thead><tr><th>설정</th><th>값</th><th>범위</th><th>기본값</th><th>수정 일시</th></tr></thead>
          <tbody>
            {shown.map((s) => {
              const v = draft[s.name] ?? s.value;
              const dirty = draft[s.name] !== undefined && draft[s.name] !== s.value;
              return (
                <tr key={s.name} className={dirty ? 'dirty' : undefined}>
                  <td><code>{s.name}</code><div className="muted small">{s.description}</div></td>
                  <td>
                    <form className="setting-edit" onSubmit={(e: FormEvent) => { e.preventDefault(); save(s); }}>
                      <input value={v} inputMode="decimal" onChange={(e) => setDraft((d) => ({ ...d, [s.name]: e.target.value }))} aria-label={`${s.name} 값`} />
                      <button type="submit" disabled={!dirty}>저장</button>
                    </form>
                    {msg[s.name] && <div className={msg[s.name].ok ? 'ok small' : 'error small'}>{msg[s.name].text}</div>}
                  </td>
                  <td className="small">{s.min ?? ''} ~ {s.max ?? ''}{s.type === 'INT' ? ' (정수)' : ''}</td>
                  <td className="small">{s.defaultValue ?? '-'}</td>
                  <td className="small">{fmt(s.updatedAt)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- 공지(4.16)

const NOTICE_TITLE_MAX = 50, NOTICE_BODY_MAX = 5000;
const EMPTY_NOTICE: AdminNoticeInput = { title: '', body: '', pinned: false, popupEnabled: true, popupDays: 7 };
const chars = (s: string) => [...s].length; // 서버와 같이 글자(코드 포인트) 수로 센다

/** 공지 쓰기·수정·삭제. 본문은 게임의 공지 창과 같은 모양으로 미리 본다(문단, `- ` 목록, **굵게** 등). */
function NoticesTab() {
  const [list, setList] = useState<AdminNotice[] | null>(null);
  const [form, setForm] = useState<AdminNoticeInput>(EMPTY_NOTICE);
  const [editing, setEditing] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);

  const load = useCallback(() => { adminApi.notices().then(setList).catch((e) => setMessage({ text: errMsg(e), ok: false })); }, []);
  useEffect(load, [load]);

  const titleLen = chars(form.title.trim()), bodyLen = chars(form.body.trim());
  const valid = titleLen >= 1 && titleLen <= NOTICE_TITLE_MAX && bodyLen >= 1 && bodyLen <= NOTICE_BODY_MAX
    && (!form.popupEnabled || (form.popupDays !== null && form.popupDays >= 1 && form.popupDays <= 90));

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!valid) return;
    setBusy(true); setMessage(null);
    try {
      if (editing === null) await adminApi.createNotice(form); else await adminApi.updateNotice(editing, form);
      successToast(editing === null ? '공지를 올렸어요' : '공지를 수정했어요');
      setForm(EMPTY_NOTICE); setEditing(null);
      load();
    } catch (err) {
      setMessage({ text: errMsg(err), ok: false });
    } finally {
      setBusy(false);
    }
  }

  function startEdit(n: AdminNotice) {
    setEditing(n.id);
    setForm({ title: n.title, body: n.body, pinned: n.pinned, popupEnabled: n.popupEnabled, popupDays: n.popupDays ?? 7 });
    setMessage(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function remove(id: number) {
    setBusy(true);
    try {
      await adminApi.deleteNotice(id);
      if (editing === id) { setEditing(null); setForm(EMPTY_NOTICE); }
      successToast('공지를 삭제했어요');
      load();
    } catch (err) {
      setMessage({ text: errMsg(err), ok: false });
    } finally {
      setBusy(false); setConfirmDelete(null);
    }
  }

  const popupState = (n: AdminNotice) => !n.popupEnabled || !n.popupUntil ? null
    : new Date(n.popupUntil).getTime() > Date.now() ? { on: true, text: `팝업 중 · ${fmt(n.popupUntil)}까지` } : { on: false, text: '팝업 끝남' };
  const editingNotice = editing === null ? null : list?.find((n) => n.id === editing) ?? null;

  function cancelEdit() { setEditing(null); setForm(EMPTY_NOTICE); setMessage(null); }

  return (
    <section className="admin-panel notice-admin">
      <form className={editing === null ? 'notice-form' : 'notice-form editing'} onSubmit={submit}>
        <div className="notice-form-head">
          <h2>{editing === null ? '✍️ 새 공지 쓰기' : '✏️ 공지 수정'}</h2>
          {editingNotice && <span className="muted small">{fmt(editingNotice.createdAt)}에 올린 공지</span>}
          {editing !== null && <button type="button" className="notice-cancel" onClick={cancelEdit} disabled={busy}>취소</button>}
        </div>

        <label className="notice-field">
          <span className="notice-label">제목<span className={titleLen > NOTICE_TITLE_MAX ? 'count over' : 'count'}>{titleLen}/{NOTICE_TITLE_MAX}</span></span>
          <input className="notice-title-input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })}
                 placeholder="예) 10월 31일 새벽 점검 안내" />
        </label>

        <div className="notice-edit">
          <div className="notice-field">
            <label className="notice-label" htmlFor="notice-body">본문<span className={bodyLen > NOTICE_BODY_MAX ? 'count over' : 'count'}>{bodyLen.toLocaleString()}/{NOTICE_BODY_MAX.toLocaleString()}</span></label>
            <MarkupEditor id="notice-body" value={form.body} onChange={(body) => setForm((f) => ({ ...f, body }))}
                          placeholder={'공지 내용을 쓰세요. 위 단추로 굵게·목록·팁 상자를 넣을 수 있어요.\n빈 줄로 문단을 나눠요.'} />
          </div>
          <div className="notice-preview" aria-label="미리 보기">
            <span className="notice-label">미리 보기<span className="count">사용자 화면과 같은 모양</span></span>
            <div className="notice-preview-box notice-article">
              <div className="notice-article-badges">
                {form.pinned && <span className="notice-badge pin">📌 고정</span>}
                <span className="notice-badge new">NEW</span>
              </div>
              <h3 className="notice-article-title">{form.title.trim() || '제목을 입력하세요'}</h3>
              {form.body.trim() ? <RichText text={form.body} /> : <p className="muted small">본문을 쓰면 여기에 보여요</p>}
            </div>
          </div>
        </div>

        <div className="notice-options">
          <label className={form.pinned ? 'notice-toggle on' : 'notice-toggle'}>
            <input type="checkbox" checked={form.pinned} onChange={(e) => setForm({ ...form, pinned: e.target.checked })} />
            <span className="notice-toggle-text"><strong>📌 맨 위에 고정</strong><span className="muted small">목록에서 항상 맨 위에 보여요</span></span>
          </label>
          <div className={form.popupEnabled ? 'notice-toggle on' : 'notice-toggle'}>
            <label className="notice-toggle-main">
              <input type="checkbox" checked={form.popupEnabled} onChange={(e) => setForm({ ...form, popupEnabled: e.target.checked })} />
              <span className="notice-toggle-text"><strong>🔔 팝업으로 띄우기</strong><span className="muted small">게임에 들어올 때 아직 안 본 사람에게 한 번 보여요</span></span>
            </label>
            {form.popupEnabled && (
              <label className="notice-days-row">
                <span>올린 날부터</span>
                <input type="number" min={1} max={90} value={form.popupDays ?? ''} className="notice-days"
                       onChange={(e) => setForm({ ...form, popupDays: e.target.value === '' ? null : Number(e.target.value) })} />
                <span>일 동안</span>
                <span className="muted small">(1~90)</span>
              </label>
            )}
          </div>
        </div>

        <div className="notice-submit">
          {message && <p className={message.ok ? 'ok small' : 'error small'} role="status">{message.text}</p>}
          <button className="primary" type="submit" disabled={!valid || busy}>{busy ? '저장하는 중…' : editing === null ? '공지 올리기' : '수정'}</button>
        </div>
      </form>

      <div className="notice-list-head">
        <h2>올린 공지</h2>
        {list && <span className="muted small">{list.length}개 · 고정 먼저, 최신순</span>}
      </div>
      {list === null ? <p className="muted">불러오는 중…</p> : list.length === 0 ? <p className="muted notice-empty">아직 공지가 없어요. 위에서 첫 공지를 써 보세요.</p> : (
        <ul className="notice-list">
          {list.map((n) => {
            const popup = popupState(n);
            return (
              <li key={n.id} className={editing === n.id ? 'notice-row editing' : 'notice-row'}>
                <div className="notice-row-main">
                  <div className="notice-row-badges">
                    {n.pinned && <span className="notice-badge pin">📌 고정</span>}
                    {popup && <span className={popup.on ? 'notice-badge popup' : 'notice-badge off'}>🔔 {popup.text}</span>}
                    {editing === n.id && <span className="notice-badge editing">수정 중</span>}
                  </div>
                  <strong className="notice-row-title">{n.title}</strong>
                  <span className="muted small">{fmt(n.createdAt)}{n.edited ? ` · 수정 ${fmt(n.updatedAt)}` : ''}</span>
                  <details className="notice-row-body"><summary>본문 보기</summary><RichText text={n.body} /></details>
                </div>
                <div className="notice-row-actions">
                  {confirmDelete === n.id ? (<>
                    <span className="small">삭제할까요?</span>
                    <button className="danger" onClick={() => remove(n.id)} disabled={busy}>삭제</button>
                    <button onClick={() => setConfirmDelete(null)} disabled={busy}>취소</button>
                  </>) : (<>
                    <button onClick={() => startEdit(n)} disabled={busy || editing === n.id}>수정</button>
                    <button className="danger" onClick={() => setConfirmDelete(n.id)} disabled={busy}>삭제</button>
                  </>)}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
