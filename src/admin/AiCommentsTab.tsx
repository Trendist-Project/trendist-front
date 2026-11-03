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
      <header className="ap-head">
        <div>
          <h2>AI 한 줄 설명</h2>
          <p>키워드 카드에 보이는 "왜 유행인지" 설명을 확인하고, 사용자가 접수한 갱신 요청을 처리해요.</p>
        </div>
        {data && <span className="ap-total" role="status"><strong>{data.total.toLocaleString()}</strong>개</span>}
      </header>
      <div className="seg" role="tablist" aria-label="목록 종류">
        {FILTERS.map(([v, l]) => (
          <button key={v} role="tab" aria-selected={filter === v} className={filter === v ? 'on' : undefined}
                  onClick={() => { setFilter(v); setPage(0); setEditing(null); }}>{l}</button>
        ))}
      </div>
      {data && !data.aiEnabled && (
        <p className="ap-note warn">AI 연결(제미나이 API 키)이 설정되지 않아 AI 요청은 꺼져 있어요. 설명은 직접 쓸 수 있어요.</p>
      )}
      {error && <p className="ap-note error" role="alert">{error}</p>}
      <ul className="ai-list">
        {data?.items.map((r) => {
          const isEditing = editing === r.keywordId;
          const working = busy === r.keywordId;
          return (
            <li key={r.keywordId} className={`ai-card${r.openRequests > 0 ? ' requested' : ''}${isEditing ? ' editing' : ''}`}>
              <div className="ai-card-head">
                <strong className="ai-kw">{r.text}</strong>
                <span className={`badge state-${r.state}`}>{STATE_BADGE[r.state as keyof typeof STATE_BADGE] ?? r.state}</span>
                {r.openRequests > 0 && (
                  <span className="ai-req" title="사용자가 [설명이 이상해요]로 접수한 요청">
                    갱신 요청 <strong>{r.openRequests}</strong><em>{fmt(r.lastRequestedAt)}</em>
                  </span>
                )}
              </div>
              {isEditing ? (
                <div className="ai-edit">
                  <textarea value={draft} maxLength={200} rows={3} autoFocus onChange={(e) => setDraft(e.target.value)} aria-label={`${r.text} AI 설명 직접 수정`} />
                  <span className={`ai-count${draft.length >= 190 ? ' near' : ''}`}>{draft.length}/200</span>
                </div>
              ) : r.comment ? (
                <>
                  <p className="ai-text">{r.comment}</p>
                  <div className="ai-meta">
                    <span className={`ai-by${r.by === 'ADMIN' ? ' admin' : ''}`}>{r.by === 'ADMIN' ? '관리자가 씀' : 'AI'}</span>
                    <span>{fmt(r.commentedAt)}</span>
                  </div>
                </>
              ) : (
                <p className="ai-empty">
                  {r.attempts >= 3 ? '자동 생성을 포기한 키워드예요(모르거나 실패). 재요청하거나 직접 써 주세요.' : '아직 만들지 않았어요(곧 자동으로 만들어요).'}
                </p>
              )}
              <div className="ai-actions">
                {isEditing ? (<>
                  <button className="primary" disabled={working || !draft.trim()} onClick={() => act(r.keywordId, () => adminApi.aiEdit(r.keywordId, draft), '설명을 저장했어요')}>저장</button>
                  <button onClick={() => setEditing(null)}>취소</button>
                </>) : (<>
                  <button disabled={working || !data?.aiEnabled} title={data?.aiEnabled ? '제미나이에게 다시 받아요' : '제미나이 API 키가 필요해요'}
                          onClick={() => act(r.keywordId, () => adminApi.aiRegenerate(r.keywordId), 'AI에게 다시 받았어요')}>
                    {working ? '요청 중…' : '✨ AI 재요청'}
                  </button>
                  <button onClick={() => { setEditing(r.keywordId); setDraft(r.comment ?? ''); }}>직접 수정</button>
                  {r.openRequests > 0 && <button className="quiet" onClick={() => act(r.keywordId, () => adminApi.aiDismiss(r.keywordId), '요청을 닫았어요')}>요청 닫기</button>}
                </>)}
              </div>
            </li>
          );
        })}
      </ul>
      {data && data.items.length === 0 && (
        <div className="ap-empty">{filter === 'requests' ? '접수된 갱신 요청이 없어요 🎉' : '해당하는 키워드가 없어요'}</div>
      )}
      <div className="admin-pager">
        <button disabled={page <= 0} onClick={() => setPage((p) => p - 1)}>‹ 이전</button>
        <span>{page + 1} / {pages}</span>
        <button disabled={page + 1 >= pages} onClick={() => setPage((p) => p + 1)}>다음 ›</button>
      </div>
    </section>
  );
}
