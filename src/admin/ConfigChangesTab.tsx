import { useCallback, useEffect, useState } from 'react';
import { adminApi, type AdminConfigChange } from '../api/client';
import { successToast } from '../ui/toast';
import { adminConfirm, errMsg, fmt } from './format';

const SCOPES: [string, string][] = [['', '전체'], ['SETTING', '밸런스 설정'], ['MONSTER', '몬스터'], ['SKILL', '스킬']];
const SCOPE_LABEL: Record<string, string> = { SETTING: '밸런스 설정', MONSTER: '몬스터', SKILL: '스킬' };
const FIELD_LABEL: Record<string, string> = { value: '값', enabled: '사용 여부', cooldown: '쿨타임(초)', level: '해금 레벨' };
const PAGE = 50;

/** true·false는 켜짐·꺼짐으로 보여 준다 */
const show = (field: string, v: string | null) => (v === null ? '-' : field === 'enabled' ? (v === 'true' ? '켜짐' : '꺼짐') : v);

/**
 * 설정 변경 이력(13.17): 밸런스 설정·몬스터 설정·스킬 설정을 누가 언제 무엇을 어떤 값에서 어떤 값으로 바꿨는지 최신순으로 보여 주고,
 * 이전 값으로 되돌리거나 변경 이유를 메모로 남긴다. 이후에 값이 또 바뀌었으면 되돌리기 전에 확인을 받는다.
 */
export function ConfigChangesTab() {
  const [scope, setScope] = useState('');
  const [q, setQ] = useState('');
  const [rows, setRows] = useState<AdminConfigChange[] | null>(null);
  const [more, setMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ id: number; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback((sc: string, query: string) => {
    adminApi.configChanges(sc, query, 0, PAGE).then((r) => { setRows(r); setMore(r.length >= PAGE); setError(null); }).catch((e) => setError(errMsg(e)));
  }, []);
  useEffect(() => { const id = setTimeout(() => load(scope, q), 250); return () => clearTimeout(id); }, [scope, q, load]);

  const loadMore = async () => {
    if (!rows || rows.length === 0) return;
    try {
      const r = await adminApi.configChanges(scope, q, rows[rows.length - 1].id, PAGE);
      setRows([...rows, ...r]); setMore(r.length >= PAGE);
    } catch (e) { setError(errMsg(e)); }
  };

  const rollback = async (c: AdminConfigChange) => {
    if (busy) return;
    const f = FIELD_LABEL[c.field] ?? c.field;
    const changedSince = c.currentValue !== null && c.currentValue !== c.newValue;
    const msg = `'${c.target}'의 ${f}을(를) ${show(c.field, c.oldValue)}(으)로 되돌릴까요?`
      + (changedSince ? ` 이 변경 뒤에 값이 ${show(c.field, c.currentValue)}(으)로 또 바뀌었어요. 그래도 덮어써요.` : '')
      + ' 되돌린 것도 새 이력으로 남아요.';
    if (!(await adminConfirm(msg))) return;
    setBusy(true);
    try { await adminApi.rollbackConfigChange(c.id); successToast('되돌렸어요'); load(scope, q); } catch (e) { setError(errMsg(e)); } finally { setBusy(false); }
  };

  const saveMemo = async () => {
    if (!editing) return;
    try {
      await adminApi.setConfigChangeMemo(editing.id, editing.text);
      setRows((l) => l?.map((r) => (r.id === editing.id ? { ...r, memo: editing.text.trim() || null } : r)) ?? null);
      setEditing(null);
    } catch (e) { setError(errMsg(e)); }
  };

  return (
    <section className="admin-panel">
      <header className="ap-head">
        <div>
          <h2>변경 이력</h2>
          <p>밸런스 설정·몬스터·스킬 설정이 바뀔 때마다 한 줄씩 남아요. 이전 값으로 되돌리거나 왜 바꿨는지 메모를 남길 수 있어요. 되돌려도 새 이력으로 남아요.</p>
        </div>
      </header>
      <div className="set-toolbar">
        <div className="set-groups" role="group" aria-label="범위">
          {SCOPES.map(([k, label]) => <button key={k} type="button" className={k === scope ? 'on' : ''} onClick={() => setScope(k)}>{label}</button>)}
        </div>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="대상 이름 검색 (예: dash_seconds, elder_turtle/hp_margin)" aria-label="대상 검색" />
      </div>
      {error && <p className="error" role="alert">{error}</p>}
      {!rows ? <p className="muted">불러오는 중…</p> : rows.length === 0 ? <p className="muted">이력이 없어요.</p> : (
        <div className="admin-table-wrap">
          <table className="admin-table cc-table">
            <thead><tr><th>시각</th><th>관리자</th><th>범위</th><th>대상</th><th>항목</th><th>이전 → 이후</th><th>지금</th><th>메모</th><th /></tr></thead>
            <tbody>
              {rows.map((c) => {
                const same = c.currentValue === c.newValue;
                return (
                  <tr key={c.id} className={c.revertedFromId ? 'cc-revert' : ''}>
                    <td>{fmt(c.createdAt)}</td>
                    <td>{c.adminName ?? `#${c.adminUserId}`}</td>
                    <td>{SCOPE_LABEL[c.scope] ?? c.scope}</td>
                    <td className="cc-target"><code>{c.target}</code>{c.label && <span className="muted small">{c.label}</span>}</td>
                    <td>{FIELD_LABEL[c.field] ?? c.field}{c.revertedFromId && <span className="mon-badge">되돌림 #{c.revertedFromId}</span>}</td>
                    <td className="cc-vals"><span className="muted">{show(c.field, c.oldValue)}</span> → <strong>{show(c.field, c.newValue)}</strong></td>
                    <td className={same ? '' : 'cc-diff'}>{show(c.field, c.currentValue)}</td>
                    <td className="cc-memo">
                      {editing?.id === c.id ? (
                        <span className="cc-memo-edit">
                          <input value={editing.text} maxLength={300} autoFocus onChange={(e) => setEditing({ id: c.id, text: e.target.value })}
                                 onKeyDown={(e) => { if (e.key === 'Enter') saveMemo(); if (e.key === 'Escape') setEditing(null); }} aria-label="변경 이유 메모" />
                          <button type="button" onClick={saveMemo}>저장</button>
                        </span>
                      ) : (
                        <button type="button" className="link" onClick={() => setEditing({ id: c.id, text: c.memo ?? '' })}>{c.memo ?? '＋ 메모'}</button>
                      )}
                    </td>
                    <td><button type="button" disabled={busy || c.oldValue === null || c.currentValue === null} onClick={() => rollback(c)}>되돌리기</button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {more && <p><button type="button" onClick={loadMore}>더 보기</button></p>}
    </section>
  );
}
