import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { adminApi, type AdminIntegration } from '../api/client';
import { successToast } from '../ui/toast';
import { errMsg } from './format';

/**
 * 연동(13.15): 연동된 외부 사이트(검색·분석 도구)를 아이콘으로 바로 열어 본다. 아이콘이나 [열기]를 누르면 새 탭으로 이동하고,
 * 주소는 바뀔 수 있어서 [주소 수정]으로 고친다(서버에 저장되어 모든 관리자에게 같다).
 */
const ICONS: Record<string, ReactNode> = {
  NAVER_SEARCH_ADVISOR: (
    <svg viewBox="0 0 48 48" aria-hidden="true"><rect width="48" height="48" rx="10" fill="#03c75a" /><path d="M15 12h7.4l4.6 8.1V12h6v24h-7.4L21 27.9V36h-6z" fill="#fff" /></svg>
  ),
  GOOGLE_SEARCH_CONSOLE: (
    <svg viewBox="0 0 48 48" aria-hidden="true"><rect width="48" height="48" rx="10" fill="#fff" /><circle cx="21" cy="21" r="10" fill="none" stroke="#4285f4" strokeWidth="5" /><path d="M29 29l10 10" stroke="#ea4335" strokeWidth="6" strokeLinecap="round" /><path d="M16 22l4 4 7-8" fill="none" stroke="#34a853" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
  ),
  GOOGLE_ANALYTICS: (
    <svg viewBox="0 0 48 48" aria-hidden="true"><rect width="48" height="48" rx="10" fill="#fff" /><rect x="29" y="8" width="10" height="32" rx="5" fill="#f9ab00" /><rect x="18" y="19" width="10" height="21" rx="5" fill="#e37400" /><circle cx="13" cy="35" r="5" fill="#e37400" /></svg>
  ),
};

export function IntegrationsTab() {
  const [list, setList] = useState<AdminIntegration[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => { adminApi.integrations().then(setList).catch((e) => setError(errMsg(e))); }, []);

  async function save(e: FormEvent, code: string) {
    e.preventDefault();
    setBusy(true);
    try {
      const saved = await adminApi.updateIntegration(code, draft);
      setList((l) => l?.map((x) => (x.code === code ? saved : x)) ?? l);
      setEditing(null); setError(null);
      successToast('주소를 저장했어요');
    } catch (err) { setError(errMsg(err)); } finally { setBusy(false); }
  }

  return (
    <section className="admin-panel">
      <p className="muted small">연동된 사이트예요. 아이콘이나 [열기]를 누르면 새 탭으로 바로 이동해요. 주소가 바뀌면 [주소 수정]으로 고쳐 주세요.</p>
      {error && <p className="error" role="alert">{error}</p>}
      {!list ? <p className="muted">불러오는 중…</p> : (
        <ul className="int-list">
          {list.map((x) => (
            <li key={x.code} className="admin-card int-card">
              <div className="int-main">
                <a className="int-icon" href={x.url} target="_blank" rel="noopener noreferrer" aria-label={`${x.label} 열기`}>{ICONS[x.code]}</a>
                <div className="int-text">
                  <a className="int-name" href={x.url} target="_blank" rel="noopener noreferrer">{x.label}</a>
                  <span className="int-url muted small">{x.url}</span>
                </div>
                <div className="admin-actions">
                  <a className="int-open" href={x.url} target="_blank" rel="noopener noreferrer">열기 ↗</a>
                  {editing !== x.code && <button onClick={() => { setEditing(x.code); setDraft(x.url); setError(null); }}>주소 수정</button>}
                </div>
              </div>
              {editing === x.code && (
                <form className="int-edit" onSubmit={(e) => save(e, x.code)}>
                  <input value={draft} onChange={(e) => setDraft(e.target.value)} disabled={busy} maxLength={500} aria-label={`${x.label} 주소`} placeholder="https://" autoFocus />
                  <div className="admin-actions">
                    <button className="primary" type="submit" disabled={busy || !draft.trim() || draft.trim() === x.url}>{busy ? '저장 중…' : '저장'}</button>
                    <button type="button" disabled={busy} onClick={() => setEditing(null)}>취소</button>
                  </div>
                </form>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
