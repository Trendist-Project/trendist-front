import { useCallback, useEffect, useState, type FormEvent } from 'react';
import {
  adminApi, ApiFailure, resumeSession,
  type AdminKeywordPage, type AdminKeywordQuery, type AdminNotice, type AdminNoticeInput, type AdminReportPage, type AdminSetting, type AdminStatus,
} from '../api/client';
import { STATE_BADGE } from '../ui/keywordFormat';
import { RichText } from '../ui/RichText';

/**
 * 관리자 페이지(13절, /admin/). 게임과 따로 열고, 로그인한 계정(갱신 토큰)으로 들어온다.
 * 서버가 /api/admin/**를 ROLE_ADMIN(users.role = ADMIN)만 받는다. 권한이 없으면 접근할 수 없다는 문구만 보여 준다.
 */
type Tab = 'keywords' | 'add' | 'reports' | 'notices' | 'settings';
const TABS: [Tab, string][] = [['keywords', '키워드'], ['add', '키워드 추가'], ['reports', '신고'], ['notices', '공지'], ['settings', '설정']];

const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleString('ko-KR', { dateStyle: 'short', timeStyle: 'short' }) : '-');
const errMsg = (e: unknown) => (e instanceof ApiFailure ? e.message : '요청에 실패했어요');

export function AdminApp() {
  const [status, setStatus] = useState<AdminStatus | null | 'nologin'>(null);
  const [tab, setTab] = useState<Tab>('keywords');

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
      {tab === 'keywords' && <KeywordsTab />}
      {tab === 'add' && <AddTab />}
      {tab === 'reports' && <ReportsTab />}
      {tab === 'notices' && <NoticesTab />}
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
        <ChipFilter label="상태" options={STATES} value={query.state ?? ''} counts={data?.stateCounts}
                    onChange={(v) => setQuery((q) => ({ ...q, page: 0, state: v }))} />
        <ChipFilter label="소스" options={SOURCES} value={query.source ?? ''}
                    onChange={(v) => setQuery((q) => ({ ...q, page: 0, source: v }))} />
        <form className="admin-search" onSubmit={(e: FormEvent) => { e.preventDefault(); setQuery((q) => ({ ...q, page: 0, q: qInput.trim() })); }}>
          <input value={qInput} onChange={(e) => setQInput(e.target.value)} placeholder="🔍 키워드 검색" aria-label="키워드 검색" />
          <button type="submit" className="primary">검색</button>
          <span className="muted small">{data ? `${data.total.toLocaleString()}개` : ''}</span>
        </form>
        {!query.state && <p className="muted small admin-hint">상태 전체에서는 금지 키워드를 맨 위에 모아 보여 줘요.</p>}
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

function ReportsTab() {
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
    try { await adminApi.setReportStatus(id, s, sameTarget); load(); } catch (e) { setError(errMsg(e)); }
  };
  const pages = data ? Math.max(1, Math.ceil(data.total / data.size)) : 1;

  return (
    <section className="admin-panel">
      <div className="admin-filters">
        {REPORT_STATUS.map(([s, label]) => (
          <button key={s} className={status === s ? 'on' : undefined} onClick={() => { setStatus(s); setPage(0); }}>{label}</button>
        ))}
        <label className="small"><input type="checkbox" checked={sameTarget} onChange={(e) => setSameTarget(e.target.checked)} /> 같은 대상의 접수 신고도 함께 처리</label>
        <span className="muted small">{data ? `${data.total.toLocaleString()}건` : ''}</span>
      </div>
      {error && <p className="error">{error}</p>}
      <ul className="admin-reports">
        {data?.items.map((r) => (
          <li key={r.id} className={`report-${r.status}`}>
            <div className="report-head">
              <span className="badge">{r.type}</span>
              <strong>{r.targetNickname ?? '(없어진 대상)'}</strong>
              <span className="muted small">신고 {r.sameTargetCount}건 · {r.reporterNickname} 신고 · {fmt(r.createdAt)}</span>
              <span className={`report-status ${r.status}`}>{STATUS_LABEL[r.status] ?? r.status}</span>
            </div>
            {r.keywordText && <p className="muted small">키워드: {r.keywordText}</p>}
            {r.content && <blockquote>{r.content}</blockquote>}
            <p className="small">사유: {r.reason ?? '(없음)'}</p>
            <div className="admin-actions">
              <button className="danger" disabled={r.status === 'RESOLVED'} onClick={() => decide(r.id, 'RESOLVED')}>조치함</button>
              <button disabled={r.status === 'REJECTED'} onClick={() => decide(r.id, 'REJECTED')}>문제없음</button>
              {r.status !== 'RECEIVED' && <button onClick={() => decide(r.id, 'RECEIVED')}>접수로 되돌리기</button>}
            </div>
          </li>
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
      setMsg((m) => ({ ...m, [s.name]: { ok: true, text: '저장했어요(바로 반영)' } }));
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
          <thead><tr><th>설정</th><th>값</th><th>범위</th><th>기본값</th><th>바꾼 때</th></tr></thead>
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

/** 공지 쓰기·고치기·지우기. 본문은 게임의 공지 창과 같은 모양으로 미리 본다(문단, `- ` 목록, **굵게** 등). */
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
      setMessage({ text: editing === null ? '공지를 올렸어요' : '공지를 고쳤어요', ok: true });
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
      setMessage({ text: '공지를 지웠어요', ok: true });
      load();
    } catch (err) {
      setMessage({ text: errMsg(err), ok: false });
    } finally {
      setBusy(false); setConfirmDelete(null);
    }
  }

  return (
    <section className="admin-panel">
      <form className="notice-form" onSubmit={submit}>
        <h2>{editing === null ? '새 공지' : '공지 고치기'}</h2>
        <label className="notice-field">
          <span>제목 <span className={titleLen > NOTICE_TITLE_MAX ? 'error small' : 'muted small'}>{titleLen}/{NOTICE_TITLE_MAX}</span></span>
          <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="예) 10월 31일 새벽 점검 안내" />
        </label>
        <div className="notice-edit">
          <label className="notice-field">
            <span>본문 <span className={bodyLen > NOTICE_BODY_MAX ? 'error small' : 'muted small'}>{bodyLen.toLocaleString()}/{NOTICE_BODY_MAX.toLocaleString()}</span></span>
            <textarea value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} rows={12}
                      placeholder={'빈 줄로 문단을 나눠요.\n- 로 시작하면 목록\n**굵게**\n> 로 시작하면 💡 팁 상자'} />
          </label>
          <div className="notice-preview" aria-label="미리 보기">
            <span className="muted small">미리 보기(게임의 공지 창과 같은 모양)</span>
            <div className="notice-preview-box">
              <strong>{form.pinned && '📌 '}{form.title.trim() || '제목'}</strong>
              {form.body.trim() ? <RichText text={form.body} /> : <p className="muted small">본문을 쓰면 여기에 보여요</p>}
            </div>
          </div>
        </div>
        <div className="notice-options">
          <label><input type="checkbox" checked={form.pinned} onChange={(e) => setForm({ ...form, pinned: e.target.checked })} /> 📌 맨 위에 고정</label>
          <label><input type="checkbox" checked={form.popupEnabled} onChange={(e) => setForm({ ...form, popupEnabled: e.target.checked })} /> 팝업으로 띄우기</label>
          {form.popupEnabled && (
            <label>등록일부터 <input type="number" min={1} max={90} value={form.popupDays ?? ''} className="notice-days"
                               onChange={(e) => setForm({ ...form, popupDays: e.target.value === '' ? null : Number(e.target.value) })} />일 (1~90)</label>
          )}
        </div>
        <p className="muted small admin-hint">팝업 설정은 저장만 돼요. 메인·게임 화면에 팝업으로 띄우는 기능은 아직 없어요(목록과 [공지] 창에는 바로 보여요).</p>
        {message && <p className={message.ok ? 'ok small' : 'error small'} role="status">{message.text}</p>}
        <div className="admin-actions">
          <button className="primary" type="submit" disabled={!valid || busy}>{busy ? '저장하는 중…' : editing === null ? '공지 올리기' : '고친 내용 저장'}</button>
          {editing !== null && <button type="button" onClick={() => { setEditing(null); setForm(EMPTY_NOTICE); }} disabled={busy}>새 공지로</button>}
        </div>
      </form>

      <h2>올린 공지 {list ? list.length : ''}</h2>
      {list === null ? <p className="muted">불러오는 중…</p> : list.length === 0 ? <p className="muted">아직 공지가 없어요.</p> : (
        <ul className="admin-reports notice-list">
          {list.map((n) => (
            <li key={n.id} className={editing === n.id ? 'editing' : undefined}>
              <div className="report-head">
                {n.pinned && <span className="badge">📌 고정</span>}
                <strong>{n.title}</strong>
                <span className="muted small">{fmt(n.createdAt)}{n.edited ? ` · 수정 ${fmt(n.updatedAt)}` : ''}{n.popupEnabled && n.popupUntil ? ` · 팝업 ${fmt(n.popupUntil)}까지` : ''}</span>
              </div>
              <details><summary className="muted small">본문 보기</summary><RichText text={n.body} /></details>
              <div className="admin-actions">
                <button onClick={() => startEdit(n)} disabled={busy}>고치기</button>
                {confirmDelete === n.id ? (
                  <span className="confirm">
                    <button className="danger" onClick={() => remove(n.id)} disabled={busy}>정말 지우기</button>
                    <button onClick={() => setConfirmDelete(null)} disabled={busy}>취소</button>
                  </span>
                ) : <button className="danger" onClick={() => setConfirmDelete(n.id)} disabled={busy}>지우기</button>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
