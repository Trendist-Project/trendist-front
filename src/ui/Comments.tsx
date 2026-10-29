import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { api, ApiFailure } from '../api/client';
import type { CommentItem, CommentPage } from '../api/types';
import { ago } from './keywordFormat';
import { ReportDialog } from './ReportDialog';

const MEDALS = ['🥇', '🥈', '🥉'];
const MAX = 200; // 최소 글자 수 제한은 없다. 빈 댓글만 막는다

interface Props { keywordId: number; onError(message: string): void }

/**
 * 키워드 댓글(4.12). 추천 상위 3개를 🥇🥈🥉로 고정하고, 나머지는 최신순 20개씩 페이지로 보여 준다.
 * 같은 투표 버튼을 다시 누르면 취소, 반대 버튼은 변경. 내 댓글은 5분 안에 고치고 언제든 지운다.
 */
export function Comments({ keywordId, onError }: Props) {
  const [top, setTop] = useState<CommentItem[]>([]);
  const [page, setPage] = useState<CommentPage | null>(null);
  const [pageNo, setPageNo] = useState(0);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<{ id: number; body: string } | null>(null);
  const [reporting, setReporting] = useState<CommentItem | null>(null);

  const load = useCallback(async (p: number) => {
    try {
      const [t, l] = await Promise.all([api.topComments(keywordId), api.comments(keywordId, p)]);
      setTop(t);
      setPage(l);
    } catch (e) {
      onError(e instanceof ApiFailure ? e.message : '댓글을 불러오지 못했어요');
    }
  }, [keywordId, onError]);

  useEffect(() => { load(pageNo); }, [load, pageNo]);

  async function write(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      await api.writeComment(keywordId, draft);
      setDraft('');
      if (pageNo === 0) await load(0); else setPageNo(0);
    } catch (err) {
      onError(err instanceof ApiFailure ? err.message : '댓글을 쓰지 못했어요');
    } finally {
      setBusy(false);
    }
  }

  // 투표 결과는 상위 목록과 최신순 목록 양쪽에 같은 댓글이 있을 수 있어 둘 다 고친다
  const patch = (id: number, f: (c: CommentItem) => CommentItem) => {
    setTop((list) => list.map((c) => (c.id === id ? f(c) : c)));
    setPage((pg) => (pg ? { ...pg, items: pg.items.map((c) => (c.id === id ? f(c) : c)) } : pg));
  };

  async function vote(c: CommentItem, v: 'LIKE' | 'DISLIKE') {
    try {
      const r = await api.vote(c.id, v);
      patch(c.id, (x) => ({ ...x, ...r }));
    } catch (err) {
      onError(err instanceof ApiFailure ? err.message : '투표하지 못했어요');
    }
  }

  async function saveEdit(e: FormEvent) {
    e.preventDefault();
    if (!editing) return;
    try {
      const updated = await api.editComment(editing.id, editing.body);
      patch(updated.id, () => updated);
      setEditing(null);
    } catch (err) {
      onError(err instanceof ApiFailure ? err.message : '댓글을 고치지 못했어요');
    }
  }

  async function remove(c: CommentItem) {
    if (!window.confirm('댓글을 지울까요?')) return;
    try {
      await api.deleteComment(c.id);
      await load(pageNo);
    } catch (err) {
      onError(err instanceof ApiFailure ? err.message : '댓글을 지우지 못했어요');
    }
  }

  const length = [...draft.trim()].length;
  const row = (c: CommentItem, medal?: string) => (
    <li key={`${medal ?? 'l'}-${c.id}`} className={`comment${c.deleted || c.withdrawn ? ' gone' : ''}${medal ? ' top' : ''}`}>
      <div className="comment-head">
        {medal && <span className="medal" aria-label={`추천 ${MEDALS.indexOf(medal) + 1}위`}>{medal}</span>}
        <strong>{c.nickname}</strong>
        {c.mine && <span className="badge mine">나</span>}
        <span className="muted small">{ago(c.createdAt)}{c.edited ? ' · 수정됨' : ''}</span>
      </div>
      {editing?.id === c.id ? (
        <form className="comment-edit" onSubmit={saveEdit}>
          <textarea value={editing.body} maxLength={MAX} rows={2} autoFocus
                    onChange={(e) => setEditing({ id: c.id, body: e.target.value })} aria-label="댓글 고치기" />
          <div className="comment-actions">
            <button type="button" onClick={() => setEditing(null)}>취소</button>
            <button className="primary">저장</button>
          </div>
        </form>
      ) : <p className="comment-body">{c.body}</p>}
      {!c.deleted && !c.withdrawn && editing?.id !== c.id && (
        <div className="comment-actions">
          <button className={`vote${c.myVote === 'LIKE' ? ' on' : ''}`} disabled={c.mine} onClick={() => vote(c, 'LIKE')}
                  aria-pressed={c.myVote === 'LIKE'} aria-label={`추천 ${c.likeCount}`} title={c.mine ? '내 댓글에는 투표할 수 없어요' : '추천'}>
            👍 {c.likeCount}
          </button>
          <button className={`vote${c.myVote === 'DISLIKE' ? ' on down' : ''}`} disabled={c.mine} onClick={() => vote(c, 'DISLIKE')}
                  aria-pressed={c.myVote === 'DISLIKE'} aria-label={`비추천 ${c.dislikeCount}`} title={c.mine ? '내 댓글에는 투표할 수 없어요' : '비추천'}>
            👎 {c.dislikeCount}
          </button>
          <span className="spacer" />
          {c.editable && <button className="link" onClick={() => setEditing({ id: c.id, body: c.body })}>고치기</button>}
          {c.mine && <button className="link" onClick={() => remove(c)}>지우기</button>}
          {!c.mine && <button className="link" onClick={() => setReporting(c)}>신고</button>}
        </div>
      )}
    </li>
  );

  const total = page?.total ?? 0;
  return (
    <section className="comments" aria-label="댓글">
      <h3>댓글 <span className="muted">{total.toLocaleString()}</span></h3>
      <form className="comment-write" onSubmit={write}>
        <textarea value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={MAX} rows={2}
                  placeholder="이 키워드가 뭔지, 왜 뜨는지 알려 주세요" aria-label="댓글 쓰기" />
        <div className="comment-actions">
          <span className="muted small">{length}/{MAX}</span>
          <span className="spacer" />
          <button className="primary" disabled={busy || length === 0}>등록</button>
        </div>
      </form>

      {page && total === 0 && <p className="muted empty-comments">아직 댓글이 없어요</p>}
      {top.length > 0 && <ol className="comment-list">{top.map((c, i) => row(c, MEDALS[i]))}</ol>}
      {page && page.items.length > 0 && (<>
        <div className="comment-divider muted small">최신순</div>
        <ol className="comment-list">{page.items.map((c) => row(c))}</ol>
      </>)}
      {page && page.totalPages > 1 && (
        <nav className="pager" aria-label="댓글 페이지">
          <button disabled={pageNo === 0} onClick={() => setPageNo((p) => p - 1)} aria-label="이전 페이지">‹</button>
          <span className="muted small">{pageNo + 1} / {page.totalPages}</span>
          <button disabled={pageNo >= page.totalPages - 1} onClick={() => setPageNo((p) => p + 1)} aria-label="다음 페이지">›</button>
        </nav>
      )}
      {reporting && (
        <ReportDialog target="COMMENT" targetId={reporting.id} preview={`${reporting.nickname}: ${reporting.body}`}
                      onClose={() => setReporting(null)} onDone={(msg) => { setReporting(null); onError(msg); }} />
      )}
      {total > 0 && <p className="muted small disclaimer">사용자가 쓴 의견이며 사실 확인은 되지 않았어요</p>}
    </section>
  );
}
