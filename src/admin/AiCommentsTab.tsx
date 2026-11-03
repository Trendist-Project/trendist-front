import { useCallback, useEffect, useState } from 'react';
import { adminApi } from '../api/client';
import type { AiCommentPage, AiCommentRow } from '../api/types';
import { STATE_BADGE } from '../ui/keywordFormat';
import { successToast } from '../ui/toast';
import { errMsg, fmt } from './format';

const FILTERS: [string, string][] = [['requests', '갱신 요청'], ['missing', '설명 없음'], ['all', '설명 있음']];

/**
 * 키워드 AI 한 줄 설명 관리(13.12). 사용자가 "설명이 이상해요"로 접수한 갱신 요청을 먼저 받고,
 * [AI 재요청]으로 제미나이에게 다시 받거나 [직접 수정]으로 쓰거나 [요청 닫기]로 그대로 둔다.
 */
export function AiCommentsTab() {
  const [filter, setFilter] = useState('requests');
  const [page, setPage] = useState(0);
  const [data, setData] = useState<AiCommentPage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<number | null>(null);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState<number | null>(null);

  const load = useCallback(() => {
    adminApi.aiComments(filter, page).then((d) => { setData(d); setError(null); }).catch((e) => setError(errMsg(e)));
  }, [filter, page]);
  useEffect(load, [load]);

  const act = async (id: number, fn: () => Promise<AiCommentRow>, done: string) => {
    setBusy(id); setError(null);
    try { await fn(); successToast(done); setEditing(null); load(); } catch (e) { setError(errMsg(e)); } finally { setBusy(null); }
  };
  const pages = data ? Math.max(1, Math.ceil(data.total / data.size)) : 1;

  return (
    <section className="admin-panel">
      <div className="admin-filters">
        {FILTERS.map(([v, l]) => <button key={v} className={filter === v ? 'on' : undefined} onClick={() => { setFilter(v); setPage(0); setEditing(null); }}>{l}</button>)}
        {data && <span className="user-total" role="status"><strong>{data.total.toLocaleString()}</strong>개</span>}
      </div>
      {data && !data.aiEnabled && (
        <p className="error">AI 연결(제미나이 API 키)이 설정되지 않아 AI 요청은 꺼져 있어요. 설명은 직접 쓸 수 있어요.</p>
      )}
      {error && <p className="error">{error}</p>}
      <div className="admin-table-wrap">
        <table className="admin-table ai-table">
          <thead><tr><th>키워드</th><th>AI 설명</th><th>요청</th><th>관리</th></tr></thead>
          <tbody>
            {data?.items.map((r) => (
              <tr key={r.keywordId}>
                <td><strong>{r.text}</strong><br /><span className={`badge state-${r.state}`}>{STATE_BADGE[r.state as keyof typeof STATE_BADGE] ?? r.state}</span></td>
                <td className="ai-comment-cell">
                  {editing === r.keywordId ? (
                    <div className="ai-edit">
                      <textarea value={draft} maxLength={200} rows={3} onChange={(e) => setDraft(e.target.value)} aria-label={`${r.text} AI 설명 직접 수정`} />
                      <span className="muted small">{draft.length}/200</span>
                    </div>
                  ) : r.comment ? (
                    <>
                      <span>{r.comment}</span><br />
                      <span className="muted small">{r.by === 'ADMIN' ? '관리자가 씀' : 'AI'} · {fmt(r.commentedAt)}</span>
                    </>
                  ) : (
                    <span className="muted">{r.attempts >= 3 ? '자동 생성을 포기한 키워드예요(모르거나 실패). 재요청하거나 직접 써 주세요' : '아직 만들지 않았어요(곧 자동으로 만들어요)'}</span>
                  )}
                </td>
                <td className="num">{r.openRequests > 0 ? <><strong className="warn">{r.openRequests}</strong><br /><span className="muted small">{fmt(r.lastRequestedAt)}</span></> : '-'}</td>
                <td>
                  <div className="ai-actions">
                    {editing === r.keywordId ? (<>
                      <button className="primary" disabled={busy === r.keywordId || !draft.trim()} onClick={() => act(r.keywordId, () => adminApi.aiEdit(r.keywordId, draft), '설명을 저장했어요')}>저장</button>
                      <button onClick={() => setEditing(null)}>취소</button>
                    </>) : (<>
                      <button disabled={busy === r.keywordId || !data?.aiEnabled} title={data?.aiEnabled ? '제미나이에게 다시 받아요' : '제미나이 API 키가 필요해요'}
                              onClick={() => act(r.keywordId, () => adminApi.aiRegenerate(r.keywordId), 'AI에게 다시 받았어요')}>
                        {busy === r.keywordId ? '요청 중…' : 'AI 재요청'}
                      </button>
                      <button onClick={() => { setEditing(r.keywordId); setDraft(r.comment ?? ''); }}>직접 수정</button>
                      {r.openRequests > 0 && <button onClick={() => act(r.keywordId, () => adminApi.aiDismiss(r.keywordId), '요청을 닫았어요')}>요청 닫기</button>}
                    </>)}
                  </div>
                </td>
              </tr>
            ))}
            {data && data.items.length === 0 && <tr><td colSpan={4} className="muted">{filter === 'requests' ? '접수된 갱신 요청이 없어요' : '해당하는 키워드가 없어요'}</td></tr>}
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
