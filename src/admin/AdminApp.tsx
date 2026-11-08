import { useCallback, useEffect, useState, type FormEvent } from 'react';
import {
  adminApi, resumeSession,
  type AdminReport, type SanctionKind, type AdminNotice, type AdminNoticeInput, type AdminReportPage, type AdminSetting, type AdminSkill, type AdminShareStats, type AdminStatus,
} from '../api/client';
import { ADMIN_COUNTRIES, getAdminCountry, setAdminCountry, type AdminCountry } from '../api/adminCountry';
import { RichText } from '../ui/RichText';
import { GuidesTab } from './GuidesTab';
import { KeywordsTab } from './KeywordsTab';
import { BulkTab } from './BulkTab';
import { EmergencyTab } from './EmergencyTab';
import { IntegrationsTab } from './IntegrationsTab';
import { DashboardTab } from './DashboardTab';
import { StatsTab } from './StatsTab';
import { SpectateTab } from './SpectateTab';
import { AiCommentsTab } from './AiCommentsTab';
import { UsersTab } from './UsersTab';
import { MarkupEditor } from './MarkupEditor';
import { successToast } from '../ui/toast';
import { adminConfirm, errMsg, fmt } from './format';

/**
 * 관리자 페이지(13절, /admin/). 게임과 따로 열고, 로그인한 계정(갱신 토큰)으로 들어온다.
 * 서버가 /api/admin/**를 ROLE_ADMIN(users.role = ADMIN)만 받는다. 권한이 없으면 접근할 수 없다는 문구만 보여 준다.
 */
type Tab = 'dashboard' | 'stats' | 'spectate' | 'users' | 'keywords' | 'ai' | 'add' | 'reports' | 'notices' | 'emergency' | 'guides' | 'share' | 'integrations' | 'skills' | 'settings';
const TABS: [Tab, string][] = [['dashboard', '대시보드'], ['stats', '통계'], ['spectate', '관전'], ['users', '사용자'], ['keywords', '키워드'], ['ai', 'AI 설명'], ['add', '일괄 추가·금지'], ['reports', '신고'], ['notices', '공지'], ['emergency', '긴급 안내'], ['guides', '가이드'], ['share', '공유'], ['integrations', '연동'], ['skills', '스킬'], ['settings', '설정']];


export function AdminApp() {
  const [status, setStatus] = useState<AdminStatus | null | 'nologin'>(null);
  const [tab, setTabState] = useState<Tab>('dashboard');
  const country = getAdminCountry(); // 바꾸면 새로 읽어 모든 탭이 같은 나라를 본다
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
        <label className="muted small admin-country">나라
          <select value={country} onChange={(e) => { setAdminCountry(e.target.value as AdminCountry); location.reload(); }}>
            {ADMIN_COUNTRIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
        <a className="muted small" href="/">게임으로</a>
      </header>
      {tab === 'dashboard' && <DashboardTab onGo={go} />}
      {tab === 'stats' && <StatsTab />}
      {tab === 'spectate' && <SpectateTab />}
      {tab === 'users' && <UsersTab key={jump.key} initialUserId={jump.userId} initialFilter={jump.filter} />}
      {tab === 'keywords' && <KeywordsTab />}
      {tab === 'ai' && <AiCommentsTab />}
      {tab === 'add' && <BulkTab />}
      {tab === 'reports' && <ReportsTab onGo={go} />}
      {tab === 'notices' && <NoticesTab />}
      {tab === 'emergency' && <EmergencyTab />}
      {tab === 'guides' && <GuidesTab />}
      {tab === 'share' && <ShareTab />}
      {tab === 'integrations' && <IntegrationsTab />}
      {tab === 'skills' && <SkillsTab />}
      {tab === 'settings' && <SettingsTab />}
    </main>
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
  키워드: { sanction: null, days: 1, del: false },
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
  const isKeyword = r.type === '키워드';
  const [banKeyword, setBanKeyword] = useState(false); // 키워드 신고: 조치하면서 그 키워드도 금지
  const label = ACT_SANCTIONS.find(([k]) => k === sanction)?.[1] ?? '';

  async function act() {
    const what = [banKeyword ? '키워드 금지' : null, sanction ? `${label.replace(/^\S+\s/, '')} ${days ? `${days}일` : '영구'}` : null, del ? '댓글 지우기' : null].filter(Boolean).join(' + ') || '제재 없이 조치함';
    if (!(await adminConfirm(`${r.targetNickname ?? '대상'}: ${what} — 이렇게 처리하고 조치함으로 넘길까요?`))) return;
    setBusy(true);
    try {
      if (banKeyword && isKeyword) await adminApi.ban(r.targetId, true);
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
          {isKeyword && (
            <label className="report-check"><input type="checkbox" checked={banKeyword} onChange={(e) => setBanKeyword(e.target.checked)} /> 이 키워드를 금지하기(금지어가 들어 있는 키워드도 함께 막혀요)</label>
          )}
          <div className="admin-actions">
            <button className="danger" disabled={busy} onClick={act}>{banKeyword ? '키워드 금지하고 조치함' : sanction || del ? '제재하고 조치함' : '조치함(제재 없이)'}</button>
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
      <header className="ap-head">
        <div>
          <h2>카드 공유</h2>
          <p>같은 방문자는 카드마다 하루 1번만 세고, 메신저 미리보기 크롤러는 세지 않아요.</p>
        </div>
      </header>
      <div className="admin-stat-row">
        <div className="admin-stat"><span>만든 카드</span><strong>{data?.cards.toLocaleString() ?? '-'}</strong><em>오늘 {data?.cardsToday.toLocaleString() ?? 0}</em></div>
        <div className="admin-stat"><span>조회</span><strong>{data?.views.toLocaleString() ?? '-'}</strong><em>공유 페이지를 연 사람</em></div>
        <div className="admin-stat"><span>[플레이 하러 가기]</span><strong>{data?.plays.toLocaleString() ?? '-'}</strong><em>게임으로 들어온 사람</em></div>
        <div className="admin-stat highlight"><span>클릭률</span><strong>{rate}</strong><em>클릭 ÷ 조회</em></div>
      </div>
      <div className="seg" role="tablist" aria-label="정렬">
        {SHARE_SORTS.map(([v, l]) => (
          <button key={v} role="tab" aria-selected={sort === v} className={sort === v ? 'on' : undefined} onClick={() => { setSort(v); setPage(0); }}>{l}</button>
        ))}
      </div>
      {error && <p className="ap-note error" role="alert">{error}</p>}
      <div className="admin-table-wrap">
        <table className="admin-table share-table">
          <thead><tr><th>닉네임 <span className="muted small">(공유한 때)</span></th><th className="num">조회</th><th className="num">클릭</th><th className="num">클릭률</th><th>만든 때</th><th></th></tr></thead>
          <tbody>
            {data?.items.map((c) => {
              const r = c.views > 0 ? Math.min(100, (c.plays / c.views) * 100) : 0;
              return (
                <tr key={c.code}>
                  <td><strong>{c.nickname}</strong></td>
                  <td className="num">{c.views.toLocaleString()}</td>
                  <td className="num">{c.plays.toLocaleString()}</td>
                  <td className="num"><span className="rate-cell"><span className="rate-bar"><i style={{ width: `${r}%` }} /></span>{c.views > 0 ? `${r.toFixed(0)}%` : '-'}</span></td>
                  <td className="muted">{fmt(c.createdAt)}</td>
                  <td className="act"><a className="open-link" href={c.url} target="_blank" rel="noreferrer">열기 ↗</a></td>
                </tr>
              );
            })}
            {data && data.items.length === 0 && <tr><td colSpan={6} className="muted empty-cell">아직 만든 카드가 없어요</td></tr>}
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

/** 스킬 설정(13.3, 4.33): 스킬마다 쿨타임·해금 레벨·사용 여부를 따로 고친다. 저장하면 바로 DB에 들어가고 게임 방에는 1초 안에 반영된다 */
const SKILL_NAMES: Record<string, string> = { shield: '🛡 방패', hook: '🪝 갈고리', shockwave: '💥 충격파', stealth: '👻 은신', dash: '⚡ 대시' };
function SkillsTab() {
  const [items, setItems] = useState<AdminSkill[] | null>(null);
  const [draft, setDraft] = useState<Record<string, { cd?: string; lv?: string }>>({});
  const [msg, setMsg] = useState<Record<string, string>>({});
  useEffect(() => { adminApi.skills().then(setItems).catch(() => setItems([])); }, []);

  const patch = async (s: AdminSkill, body: { cooldownSeconds?: number; requiredLevel?: number; enabled?: boolean }, done: string) => {
    try {
      const updated = await adminApi.updateSkill(s.code, body);
      setItems((l) => l?.map((x) => (x.code === s.code ? updated : x)) ?? null);
      setDraft((d) => { const n = { ...d }; delete n[s.code]; return n; });
      setMsg((m) => { const { [s.code]: _, ...rest } = m; return rest; });
      successToast(`${SKILL_NAMES[s.code] ?? s.code} ${done}(1초 안에 게임에 반영)`);
    } catch (e) {
      setMsg((m) => ({ ...m, [s.code]: errMsg(e) }));
    }
  };
  const save = (s: AdminSkill) => {
    const d = draft[s.code] ?? {};
    const body: { cooldownSeconds?: number; requiredLevel?: number } = {};
    if (d.cd !== undefined && d.cd.trim() !== '' && Number(d.cd) !== s.cooldownSeconds) body.cooldownSeconds = Number(d.cd);
    if (d.lv !== undefined && d.lv.trim() !== '' && Number(d.lv) !== s.requiredLevel) body.requiredLevel = Number(d.lv);
    if (Object.keys(body).length === 0) return;
    if ((body.cooldownSeconds !== undefined && Number.isNaN(body.cooldownSeconds)) || (body.requiredLevel !== undefined && Number.isNaN(body.requiredLevel))) {
      setMsg((m) => ({ ...m, [s.code]: '숫자로 입력해 주세요' })); return;
    }
    void patch(s, body, '설정을 저장했어요');
  };
  return (
    <section className="admin-panel">
      <header className="ap-head">
        <div>
          <h2>스킬 설정</h2>
          <p>스킬마다 쿨타임과 해금 레벨을 따로 고쳐요. 쿨타임은 0~3600초(0이면 쿨타임 없음), 해금 레벨은 1~100이에요. 사용 여부를 끄면 목록에서 빠지고 서버도 그 스킬을 받지 않아요. 저장하면 게임 방에는 1초 안에 반영돼요.</p>
        </div>
        {items && <span className="ap-total" role="status"><strong>{items.length}</strong>개</span>}
      </header>
      {items === null ? <p className="muted">불러오는 중…</p> : (
        <ul className="set-list">
          {items.map((s) => {
            const d = draft[s.code] ?? {};
            const cd = d.cd ?? String(s.cooldownSeconds), lv = d.lv ?? String(s.requiredLevel);
            const dirty = (d.cd !== undefined && Number(d.cd) !== s.cooldownSeconds) || (d.lv !== undefined && Number(d.lv) !== s.requiredLevel);
            return (
              <li key={s.code} className={`set-row${dirty ? ' dirty' : ''}`}>
                <div className="set-info">
                  <code>{s.code}</code> <strong>{SKILL_NAMES[s.code] ?? s.icon ?? s.code}</strong>
                  <div className="set-meta">
                    <span>종류 <b>{s.category}</b></span>
                    <span>기본 키 <b>{s.defaultKey}</b></span>
                    <span>기본 쿨타임 <b>{s.defaultCooldown}초</b></span>
                    <span>수정 {fmt(s.updatedAt)}</span>
                  </div>
                </div>
                <div className="set-edit-col">
                  <form className="set-edit" onSubmit={(e: FormEvent) => { e.preventDefault(); save(s); }}>
                    <label className="skill-field">쿨타임
                      <input value={cd} inputMode="decimal" onChange={(e) => setDraft((x) => ({ ...x, [s.code]: { ...x[s.code], cd: e.target.value } }))} aria-label={`${s.code} 쿨타임(초)`} />
                      <span className="set-unit" aria-hidden="true">초</span>
                    </label>
                    <label className="skill-field">해금 레벨
                      <input value={lv} inputMode="numeric" onChange={(e) => setDraft((x) => ({ ...x, [s.code]: { ...x[s.code], lv: e.target.value } }))} aria-label={`${s.code} 해금 레벨`} />
                    </label>
                    <button type="submit" className={dirty ? 'primary' : undefined} disabled={!dirty}>저장</button>
                  </form>
                  <label className="skill-enabled">
                    <input type="checkbox" checked={s.enabled} onChange={(e) => void patch(s, { enabled: e.target.checked }, e.target.checked ? '사용을 켰어요' : '사용을 껐어요')} /> 사용
                  </label>
                  {(s.cooldownSeconds !== s.defaultCooldown) && !dirty && (
                    <button type="button" className="set-reset" onClick={() => void patch(s, { cooldownSeconds: s.defaultCooldown }, '쿨타임을 기본값으로 되돌렸어요')}>쿨타임 기본값({s.defaultCooldown}초)으로</button>
                  )}
                  {msg[s.code] && <div className="error small">{msg[s.code]}</div>}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function SettingsTab() {
  const [items, setItems] = useState<AdminSetting[] | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<Record<string, { ok: boolean; text: string }>>({});
  const [filter, setFilter] = useState('');
  const [group, setGroup] = useState<string | null>(null); // 고른 그룹(없으면 전체)

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

  const matched = (items ?? []).filter((s) => !filter || s.name.includes(filter) || (s.description ?? '').includes(filter));
  const groupNames = [...new Set((items ?? []).map((s) => s.group))]; // 서버가 그룹 순서대로 준다
  const countOf = (g: string) => matched.filter((s) => s.group === g).length;
  const shown = group ? matched.filter((s) => s.group === group) : matched;
  const dirtyOf = (list: AdminSetting[]) => list.filter((s) => draft[s.name] !== undefined && draft[s.name] !== s.value).length;
  const dirtyCount = dirtyOf(items ?? []);
  const row = (s: AdminSetting) => {
    const v = draft[s.name] ?? s.value;
    const dirty = draft[s.name] !== undefined && draft[s.name] !== s.value;
    const isDefault = s.defaultValue != null && v === s.defaultValue;
    return (
      <li key={s.name} className={`set-row${dirty ? ' dirty' : ''}`}>
        <div className="set-info">
          <code>{s.name}</code>
          <p>{s.description}</p>
          <div className="set-meta">
            <span>범위 <b>{s.min ?? ''} ~ {s.max ?? ''}</b>{s.unit ? ` ${s.unit}` : ''}{s.type === 'INT' ? ' · 정수' : ''}</span>
            <span>기본값 <b>{s.defaultValue ?? '-'}</b>{s.defaultValue != null && s.unit ? ` ${s.unit}` : ''}</span>
            <span>수정 {fmt(s.updatedAt)}</span>
          </div>
        </div>
        <div className="set-edit-col">
          <form className="set-edit" onSubmit={(e: FormEvent) => { e.preventDefault(); save(s); }}>
            <input value={v} inputMode="decimal" onChange={(e) => setDraft((d) => ({ ...d, [s.name]: e.target.value }))} aria-label={`${s.name} 값${s.unit ? `(${s.unit})` : ''}`} />
            {s.unit && <span className="set-unit" aria-hidden="true">{s.unit}</span>}
            <button type="submit" className={dirty ? 'primary' : undefined} disabled={!dirty}>저장</button>
          </form>
          {s.defaultValue != null && !isDefault && (
            <button type="button" className="set-reset" onClick={() => setDraft((d) => ({ ...d, [s.name]: s.defaultValue as string }))}>기본값({s.defaultValue}{s.unit ? ` ${s.unit}` : ''})으로</button>
          )}
          {msg[s.name] && <div className={msg[s.name].ok ? 'ok small' : 'error small'}>{msg[s.name].text}</div>}
        </div>
      </li>
    );
  };
  return (
    <section className="admin-panel">
      <header className="ap-head">
        <div>
          <h2>게임 설정</h2>
          <p>저장하면 서버가 바로 읽고, 게임 방에는 1초 안에 반영돼요. 범위를 벗어난 값은 저장되지 않아요.</p>
        </div>
        {items && <span className="ap-total" role="status"><strong>{shown.length}</strong>{filter || group ? ` / ${items.length}` : ''}개</span>}
      </header>
      <div className="set-toolbar">
        <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="이름·설명으로 찾기" aria-label="설정 찾기" />
        {dirtyCount > 0 && <span className="set-dirty-note">저장하지 않은 변경 {dirtyCount}개</span>}
      </div>
      {items && groupNames.length > 1 && (
        <div className="set-groups" role="tablist" aria-label="설정 그룹">
          <button type="button" role="tab" aria-selected={group === null} className={group === null ? 'on' : undefined} onClick={() => setGroup(null)}>전체 <span>{matched.length}</span></button>
          {groupNames.map((g) => {
            const n = countOf(g), d = dirtyOf((items ?? []).filter((s) => s.group === g));
            return (
              <button key={g} type="button" role="tab" aria-selected={group === g} className={group === g ? 'on' : undefined} disabled={n === 0}
                      onClick={() => setGroup(group === g ? null : g)}>
                {g} <span>{n}</span>{d > 0 && <i className="set-dot" title="저장하지 않은 변경이 있어요" />}
              </button>
            );
          })}
        </div>
      )}
      {groupNames.filter((g) => shown.some((s) => s.group === g)).map((g) => {
        const list = shown.filter((s) => s.group === g);
        const d = dirtyOf(list);
        return (
          <details key={g} className="set-group" open>
            <summary><h3>{g}</h3><span className="set-count">{list.length}개</span>{d > 0 && <span className="set-dirty-note">변경 {d}개</span>}</summary>
            <ul className="set-list">{list.map(row)}</ul>
          </details>
        );
      })}
      {items && shown.length === 0 && <div className="ap-empty">찾는 설정이 없어요</div>}
    </section>
  );
}

// ---------------------------------------------------------------- 공지(4.16)

const NOTICE_TITLE_MAX = 50, NOTICE_BODY_MAX = 5000;
const EMPTY_NOTICE: AdminNoticeInput = { title: '', body: '', titleEn: '', bodyEn: '', pinned: false, popupEnabled: true, popupDays: 7 };
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
      // 영어판은 비우면 null(영어 사용자에게는 한국어가 대신 보인다)
      const input: AdminNoticeInput = { ...form, titleEn: form.titleEn?.trim() || null, bodyEn: form.bodyEn?.trim() || null };
      if (editing === null) await adminApi.createNotice(input); else await adminApi.updateNotice(editing, input);
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
    setForm({ title: n.title, body: n.body, titleEn: n.titleEn ?? '', bodyEn: n.bodyEn ?? '', pinned: n.pinned, popupEnabled: n.popupEnabled, popupDays: n.popupDays ?? 7 });
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

        <label className="notice-field">
          <span className="notice-label">제목 (English)<span className="count">비우면 영어 사용자에게도 한국어가 보여요</span></span>
          <input className="notice-title-input" value={form.titleEn ?? ''} onChange={(e) => setForm({ ...form, titleEn: e.target.value })}
                 placeholder="e.g. Maintenance on Oct 31" />
        </label>

        <div className="notice-edit">
          <div className="notice-field">
            <label className="notice-label" htmlFor="notice-body">본문<span className={bodyLen > NOTICE_BODY_MAX ? 'count over' : 'count'}>{bodyLen.toLocaleString()}/{NOTICE_BODY_MAX.toLocaleString()}</span></label>
            <MarkupEditor id="notice-body" value={form.body} onChange={(body) => setForm((f) => ({ ...f, body }))}
                          placeholder={'공지 내용을 쓰세요. 위 단추로 굵게·목록·팁 상자를 넣을 수 있어요.\n빈 줄로 문단을 나눠요.'} />
          </div>
          <div className="notice-field">
            <label className="notice-label" htmlFor="notice-body-en">본문 (English)</label>
            <MarkupEditor id="notice-body-en" value={form.bodyEn ?? ''} onChange={(bodyEn) => setForm((f) => ({ ...f, bodyEn }))}
                          placeholder="English body. Leave empty to show the Korean text." />
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
