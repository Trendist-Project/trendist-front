import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { adminApi, type AdminUserDetail, type AdminUserPage, type AdminUserRow, type SanctionKind } from '../api/client';
import { artCanvas, drawArt } from '../game/pixelArt';
import { borderLineWidth, drawTurtle } from '../game/turtle';
import { STATE_BADGE } from '../ui/keywordFormat';
import { successToast } from '../ui/toast';
import { errMsg, fmt } from './format';

/**
 * 관리자 사용자 관리(13.10): 닉네임·번호로 찾고 종류·상태로 거르며, 한 사람을 열어 기록·꾸미기·보관함·댓글·채팅·받은 신고·제재 이력을 본다.
 * 조치: 제재(계정 금지 / 그림 저장 정지 / 댓글 작성 정지, 기간·사유)와 풀기, 닉네임 바꾸기, 꾸미기 초기화, 관리자 권한, 강제 퇴장.
 */
const FILTERS: [string, string][] = [['all', '전체'], ['online', '🟢 접속 중'], ['google', 'Google'], ['guest', '게스트'], ['admin', '관리자'], ['banned', '⛔ 금지 중'], ['withdrawn', '탈퇴']];
const SORTS: [string, string][] = [['seen', '최근 접속'], ['created', '가입순'], ['score', '유행도'], ['level', '레벨'], ['plus', '누적 추가']];
const SANCTIONS: [SanctionKind, string, string][] = [
  ['BAN', '계정 금지', '입장·로그인을 막고 접속 중이면 내보내요'],
  ['UPLOAD', '그림 저장 정지', '픽셀 그림을 저장할 수 없어요'],
  ['COMMENT', '댓글 작성 정지', '댓글을 쓸 수 없어요'],
  ['CHAT', '채팅 정지', '게임 채팅을 보낼 수 없어요'],
];
const DAYS: [number | null, string][] = [[1, '1일'], [3, '3일'], [7, '7일'], [30, '30일'], [null, '영구']];
const REPORT_STATUS: Record<string, string> = { RECEIVED: '접수', RESOLVED: '조치함', REJECTED: '문제없음' };

const ago = (iso: string | null) => {
  if (!iso) return '-';
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return '방금';
  if (m < 60) return `${m}분 전`;
  if (m < 60 * 24) return `${Math.floor(m / 60)}시간 전`;
  return `${Math.floor(m / 1440)}일 전`;
};
const until = (iso: string) => (iso.startsWith('9999') ? '영구' : `${fmt(iso)}까지`);

function Badges({ u }: { u: AdminUserRow }) {
  return (
    <span className="user-badges">
      {u.online && <span className="badge on">접속 중</span>}
      <span className="badge">{u.type === 'GOOGLE' ? 'Google' : '게스트'}</span>
      {u.admin && <span className="badge admin">관리자</span>}
      {u.bannedUntil && <span className="badge danger">금지</span>}
      {u.uploadBannedUntil && <span className="badge warn">그림 정지</span>}
      {u.commentBannedUntil && <span className="badge warn">댓글 정지</span>}
      {u.chatBannedUntil && <span className="badge warn">채팅 정지</span>}
      {u.withdrawn && <span className="badge muted">탈퇴</span>}
    </span>
  );
}

/** initialUserId·initialFilter: 대시보드(13.11)에서 눌러 들어올 때 바로 열 사용자와 필터 */
export function UsersTab({ initialUserId = null, initialFilter = 'all' }: { initialUserId?: number | null; initialFilter?: string } = {}) {
  const [q, setQ] = useState('');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState(initialFilter);
  const [sort, setSort] = useState('seen');
  const [page, setPage] = useState(0);
  const [data, setData] = useState<AdminUserPage | null>(null);
  const [selected, setSelected] = useState<number | null>(initialUserId);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    adminApi.users({ q: query || undefined, filter, sort, page }).then((d) => { setData(d); setError(null); }).catch((e) => setError(errMsg(e)));
  }, [query, filter, sort, page]);
  useEffect(load, [load]);

  const pages = data ? Math.max(1, Math.ceil(data.total / data.size)) : 1;
  const submit = (e: FormEvent) => { e.preventDefault(); setPage(0); setQuery(q.trim()); };

  return (
    <section className="admin-panel admin-users">
      <div className="admin-filter-box">
        <form className="admin-search" onSubmit={submit}>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="닉네임 또는 사용자·플레이어 번호" aria-label="사용자 찾기" />
          <button type="submit">찾기</button>
        </form>
        <div className="admin-filters">
          {FILTERS.map(([v, l]) => <button key={v} className={filter === v ? 'on' : undefined} onClick={() => { setFilter(v); setPage(0); }}>{l}</button>)}
        </div>
        <div className="admin-filters">
          <span className="muted small">정렬</span>
          {SORTS.map(([v, l]) => <button key={v} className={sort === v ? 'on' : undefined} onClick={() => { setSort(v); setPage(0); }}>{l}</button>)}
          <span className="muted small">{data ? `${data.total.toLocaleString()}명` : ''}</span>
        </div>
      </div>
      {error && <p className="error">{error}</p>}
      <div className="admin-users-layout">
        <div className="admin-table-wrap">
          <table className="admin-table admin-user-table">
            <thead><tr><th>닉네임</th><th>레벨</th><th>유행도</th><th>보유</th><th>누적 추가</th><th>신고</th><th>최근 접속</th><th>가입</th></tr></thead>
            <tbody>
              {data?.items.map((u) => (
                <tr key={u.userId} className={selected === u.userId ? 'selected' : undefined} onClick={() => setSelected(u.userId)} tabIndex={0}
                    onKeyDown={(e) => { if (e.key === 'Enter') setSelected(u.userId); }}>
                  <td><strong>{u.nickname}</strong> <span className="muted small">#{u.userId}</span><br /><Badges u={u} /></td>
                  <td className="num">{u.level}</td>
                  <td className="num">{u.score.toLocaleString()}</td>
                  <td className="num">{u.holdCount}</td>
                  <td className="num">{u.totalPlusCount.toLocaleString()}</td>
                  <td className={u.reportCount > 0 ? 'num warn' : 'num'}>{u.reportCount}</td>
                  <td>{u.online ? '지금' : ago(u.lastSeenAt)}</td>
                  <td>{fmt(u.createdAt).slice(0, 10)}</td>
                </tr>
              ))}
              {data && data.items.length === 0 && <tr><td colSpan={8} className="muted">찾는 사용자가 없어요</td></tr>}
            </tbody>
          </table>
          <div className="admin-pager">
            <button disabled={page <= 0} onClick={() => setPage((p) => p - 1)}>‹ 이전</button>
            <span>{page + 1} / {pages}</span>
            <button disabled={page + 1 >= pages} onClick={() => setPage((p) => p + 1)}>다음 ›</button>
          </div>
        </div>
        {selected !== null
          ? <UserDetail key={selected} userId={selected} onChanged={load} onClose={() => setSelected(null)} />
          : <div className="admin-card muted admin-user-empty">왼쪽 목록에서 사용자를 고르면 자세한 정보와 조치가 보여요.</div>}
      </div>
    </section>
  );
}

/** 원 미리 보기: 장착한 그림이 있으면 그림, 없으면 레벨에 맞는 성장 캐릭터 */
function LookPreview({ d }: { d: AdminUserDetail }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1), size = 96;
    c.width = size * dpr; c.height = size * dpr;
    const ctx = c.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#1f2a37'; ctx.fillRect(0, 0, size, size);
    const r = 40, x = size / 2, y = size / 2;
    ctx.fillStyle = d.look.background;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    if (d.art) drawArt(ctx, artCanvas(d.art.palette, d.art.pixels), x, y, r);
    else drawTurtle(ctx, x, y, r, Math.min(d.stats.level, 10));
    ctx.strokeStyle = d.look.borderColor ?? '#11372a';
    ctx.lineWidth = borderLineWidth(r, d.look.borderWidth);
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke();
  }, [d]);
  return <canvas ref={ref} style={{ width: 96, height: 96 }} className="admin-look" aria-label="원 모습" />;
}

function UserDetail({ userId, onChanged, onClose }: { userId: number; onChanged(): void; onClose(): void }) {
  const [d, setD] = useState<AdminUserDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [kind, setKind] = useState<SanctionKind>('BAN');
  const [days, setDays] = useState<number | null>(7);
  const [reason, setReason] = useState('');
  const [nickname, setNickname] = useState('');

  useEffect(() => {
    adminApi.user(userId).then((x) => { setD(x); setNickname(x.user.nickname); }).catch((e) => setError(errMsg(e)));
  }, [userId]);

  async function act(f: () => Promise<AdminUserDetail | void>, done: string, confirmText?: string) {
    if (confirmText && !window.confirm(confirmText)) return;
    setBusy(true); setError(null);
    try {
      const x = await f();
      if (x) { setD(x); setNickname(x.user.nickname); } else setD(await adminApi.user(userId));
      successToast(done);
      onChanged();
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  if (!d) return <div className="admin-card">{error ? <p className="error">{error}</p> : <p className="muted">불러오는 중…</p>}</div>;
  const u = d.user, s = d.stats;
  const facts: [string, string | number][] = [
    ['레벨', `${s.level} (EXP ${s.exp.toLocaleString()})`], ['현재 유행도', s.score.toLocaleString()], ['보유 키워드', s.holdCount],
    ['누적 추가', s.totalPlusCount.toLocaleString()], ['누적 검색', s.searchCount.toLocaleString()], ['댓글 점수', s.commentScore],
    ['빼앗기', s.stealCount], ['봇 사냥', s.botWinCount], ['? 구슬', s.orbCount], ['잃기', s.loseCount], ['활동한 날', s.activeDays],
    ['칭호', `${s.titleCount}개${s.title ? ` · 장착 ${s.title}` : ''}`], ['댓글', s.commentCount], ['채팅(30일)', s.chatCount],
  ];
  const times: [string, string][] = [
    ['가입', fmt(u.createdAt)], ['최근 접속', u.online ? '지금 접속 중' : u.lastSeenAt ? `${fmt(u.lastSeenAt)} (${ago(u.lastSeenAt)})` : '-'],
    ['마지막 로그인', d.lastLoginAt ? fmt(d.lastLoginAt) : '-'], ['마지막 키워드 얻음', d.lastPlayedAt ? fmt(d.lastPlayedAt) : '-'],
    ['닉네임 바꾼 때', d.nicknameChangedAt ? fmt(d.nicknameChangedAt) : '-'], ...(d.deletedAt ? [['탈퇴', fmt(d.deletedAt)] as [string, string]] : []),
  ];

  return (
    <div className="admin-card admin-user-detail">
      <div className="admin-user-head">
        <LookPreview d={d} />
        <div>
          <h2>{u.nickname} <span className="muted small">사용자 #{u.userId} · 플레이어 #{u.playerId}</span></h2>
          <Badges u={u} />
          {u.bannedUntil && <p className="error small">계정 금지 {until(u.bannedUntil)}</p>}
          {u.uploadBannedUntil && <p className="warn small">그림 저장 정지 {until(u.uploadBannedUntil)}</p>}
          {u.commentBannedUntil && <p className="warn small">댓글 작성 정지 {until(u.commentBannedUntil)}</p>}
          {u.chatBannedUntil && <p className="warn small">채팅 정지 {until(u.chatBannedUntil)}</p>}
        </div>
        <button className="link-back" onClick={onClose} aria-label="닫기">✕</button>
      </div>
      {error && <p className="error">{error}</p>}

      <dl className="admin-facts">
        {facts.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}
      </dl>
      <dl className="admin-facts times">
        {times.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}
      </dl>

      <h3>조치</h3>
      <form className="admin-sanction" onSubmit={(e) => { e.preventDefault(); act(() => adminApi.sanction(userId, kind, days, reason.trim()), '제재를 걸었어요', `${u.nickname}에게 ${SANCTIONS.find((x) => x[0] === kind)![1]}(${days ? `${days}일` : '영구'})을 걸까요?`).then(() => setReason('')); }}>
        <div className="admin-filters">
          {SANCTIONS.map(([k, l, help]) => <button type="button" key={k} title={help} className={kind === k ? 'on' : undefined} onClick={() => setKind(k)}>{l}</button>)}
        </div>
        <div className="admin-filters">
          {DAYS.map(([v, l]) => <button type="button" key={l} className={days === v ? 'on' : undefined} onClick={() => setDays(v)}>{l}</button>)}
        </div>
        <div className="admin-inline">
          <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} placeholder="사유(필수, 이력에 남아요)" aria-label="제재 사유" />
          <button className="danger" disabled={busy || !reason.trim()}>제재 걸기</button>
        </div>
        <p className="muted small">{SANCTIONS.find((x) => x[0] === kind)![2]}. 같은 종류를 여러 번 걸면 가장 늦게 끝나는 것까지 유지돼요.</p>
      </form>

      <div className="admin-inline">
        <input value={nickname} onChange={(e) => setNickname(e.target.value)} maxLength={20} aria-label="새 닉네임" />
        <button disabled={busy || !nickname.trim() || nickname.trim() === u.nickname}
                onClick={() => act(() => adminApi.renameUser(userId, nickname), '닉네임을 바꿨어요', `닉네임을 '${nickname.trim()}'(으)로 바꿀까요?`)}>닉네임 바꾸기</button>
      </div>
      <div className="admin-actions">
        <button disabled={busy} onClick={() => act(() => adminApi.resetUserLook(userId), '꾸미기를 초기화했어요', '그린 그림을 지우고 색·테두리를 기본으로 되돌릴까요? 되돌릴 수 없어요.')}>🎨 꾸미기 초기화</button>
        {u.type === 'GOOGLE' && (u.admin
          ? <button disabled={busy} onClick={() => act(() => adminApi.setUserAdmin(userId, false), '관리자 권한을 뺐어요', '관리자 권한을 뺄까요?')}>관리자 권한 빼기</button>
          : <button disabled={busy} onClick={() => act(() => adminApi.setUserAdmin(userId, true), '관리자 권한을 줬어요', `${u.nickname}에게 관리자 권한을 줄까요? 이 화면의 모든 기능을 쓸 수 있게 돼요.`)}>🛠 관리자 권한 주기</button>)}
        {u.online && <button className="danger" disabled={busy} onClick={() => act(() => adminApi.kickUser(userId), '접속을 끊었어요', '지금 접속을 끊을까요? 다시 들어올 수는 있어요.')}>강제 퇴장</button>}
      </div>

      <h3>제재 이력 <span className="muted small">{d.sanctions.length}건</span></h3>
      <ul className="admin-lines">
        {d.sanctions.map((x) => (
          <li key={x.id} className={x.active ? 'active' : undefined}>
            <div><span className={x.active ? 'badge danger' : 'badge'}>{x.type}</span> <strong>{x.active ? until(x.expiresAt) : x.releasedAt ? `${fmt(x.releasedAt)} 해제` : '끝남'}</strong>
              <span className="muted small"> · {fmt(x.createdAt)}</span></div>
            <p className="small">{x.reason}</p>
            {x.active && <button className="small-btn" disabled={busy} onClick={() => act(() => adminApi.releaseSanction(x.id), '제재를 풀었어요', '이 제재를 지금 풀까요?')}>풀기</button>}
          </li>
        ))}
        {d.sanctions.length === 0 && <li className="muted">제재 이력이 없어요</li>}
      </ul>

      <h3>받은 신고 <span className="muted small">{u.reportCount}건</span></h3>
      <ul className="admin-lines">
        {d.reports.map((r) => (
          <li key={r.id}>
            <div><span className="badge">{r.type}</span> <span className={`report-status ${r.status}`}>{REPORT_STATUS[r.status] ?? r.status}</span>
              <span className="muted small"> · {r.reporter} 신고 · {fmt(r.createdAt)}</span></div>
            {r.content && <blockquote>{r.content}</blockquote>}
            <p className="small">사유: {r.reason ?? '(없음)'}</p>
          </li>
        ))}
        {d.reports.length === 0 && <li className="muted">받은 신고가 없어요</li>}
      </ul>

      <h3>보관함 <span className="muted small">{d.keywords.length}개</span></h3>
      <div className="admin-chips">
        {d.keywords.map((k) => <span key={k.keywordId} className="chip">{STATE_BADGE[k.state] ?? ''} {k.text} <em>{k.trendValue}점</em></span>)}
        {d.keywords.length === 0 && <span className="muted small">없어요</span>}
      </div>

      <h3>최근 댓글</h3>
      <ul className="admin-lines">
        {d.comments.map((c) => (
          <li key={c.id} className={c.deleted ? 'deleted' : undefined}>
            <div><strong>{c.keyword}</strong> <span className="muted small">👍 {c.likes} · 👎 {c.dislikes} · {fmt(c.createdAt)}{c.deleted ? ' · 삭제됨' : ''}</span></div>
            <p className="small">{c.body}</p>
          </li>
        ))}
        {d.comments.length === 0 && <li className="muted">댓글이 없어요</li>}
      </ul>

      <h3>최근 채팅</h3>
      <ul className="admin-lines compact">
        {d.chats.map((c) => <li key={c.id}><span className="muted small">{fmt(c.createdAt)}</span> {c.body}</li>)}
        {d.chats.length === 0 && <li className="muted">채팅이 없어요</li>}
      </ul>
    </div>
  );
}
