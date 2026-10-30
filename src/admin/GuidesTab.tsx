import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { adminApi, type AdminGuideArticle, type AdminGuideArticleInput, type AdminGuideCategory, type AdminGuideCategoryInput } from '../api/client';
import { RichText } from '../ui/RichText';
import { errMsg, fmt } from './format';
import { MarkupEditor } from './MarkupEditor';

const NAME_MAX = 100, TITLE_MAX = 100, BODY_MAX = 20000;
const chars = (s: string) => [...s.trim()].length; // 서버와 같이 글자(코드 포인트) 수로 센다
const TYPE_LABEL = { ARTICLE: '📄 문서형', FAQ: '❓ FAQ형' } as const;
const EMPTY_CATEGORY: AdminGuideCategoryInput = { code: '', name: '', displayType: 'ARTICLE', enabled: true };
const EMPTY_ARTICLE: AdminGuideArticleInput = { title: '', body: '' };

type Msg = { text: string; ok: boolean } | null;

/**
 * 가이드 관리(4.17, 13.4). 왼쪽은 카테고리(순서·숨기기·형식), 오른쪽은 고른 카테고리의 글 목록과 편집기.
 * 글은 사용자 가이드 창과 같은 모양(문서형 카드 / FAQ 질문)으로 미리 본다.
 */
export function GuidesTab() {
  const [cats, setCats] = useState<AdminGuideCategory[] | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [catForm, setCatForm] = useState<{ id: number | null; value: AdminGuideCategoryInput } | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<Msg>(null);
  const [confirmCat, setConfirmCat] = useState(false);

  const load = useCallback(() => adminApi.guideCategories().then((cs) => {
    setCats(cs);
    setSelected((s) => (s !== null && cs.some((c) => c.id === s) ? s : cs[0]?.id ?? null));
  }).catch((e) => setMessage({ text: errMsg(e), ok: false })), []);
  useEffect(() => { load(); }, [load]);

  const current = cats?.find((c) => c.id === selected) ?? null;

  async function run(act: () => Promise<unknown>, ok?: string) {
    setBusy(true); setMessage(null);
    try {
      await act();
      if (ok) setMessage({ text: ok, ok: true });
      return true;
    } catch (e) {
      setMessage({ text: errMsg(e), ok: false });
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function saveCategory(e: FormEvent) {
    e.preventDefault();
    if (!catForm) return;
    const { id, value } = catForm;
    const done = await run(async () => {
      const c = id === null ? await adminApi.createGuideCategory(value) : await adminApi.updateGuideCategory(id, value);
      setSelected(c.id);
      await load();
    }, id === null ? '카테고리를 만들었어요' : '카테고리를 수정했어요');
    if (done) setCatForm(null);
  }

  const move = (id: number, d: -1 | 1) => run(async () => setCats(await adminApi.moveGuideCategory(id, d)));

  const catValid = catForm !== null && chars(catForm.value.name) >= 1 && chars(catForm.value.name) <= NAME_MAX
    && (catForm.id !== null || /^[a-z0-9][a-z0-9-]{1,49}$/.test(catForm.value.code ?? ''));

  return (
    <section className="admin-panel guide-admin">
      {message && <p className={message.ok ? 'ok small' : 'error small'} role="status">{message.text}</p>}
      <div className="guide-admin-layout">
        <aside className="guide-admin-cats" aria-label="카테고리">
          <div className="guide-admin-head">
            <h2>카테고리</h2>
            <button className="primary" onClick={() => setCatForm({ id: null, value: EMPTY_CATEGORY })} disabled={busy}>+ 새 카테고리</button>
          </div>
          {cats === null ? <p className="muted small">불러오는 중…</p> : cats.length === 0 ? <p className="muted small">카테고리가 없어요.</p> : (
            <ol className="guide-cat-list">
              {cats.map((c, i) => (
                <li key={c.id} className={c.id === selected ? 'on' : undefined}>
                  <button className="guide-cat-main" onClick={() => { setSelected(c.id); setCatForm(null); setConfirmCat(false); }}>
                    <strong>{c.name}</strong>
                    <span className="muted small">{TYPE_LABEL[c.displayType]} · 글 {c.articleCount}{c.enabled ? '' : ' · '}{!c.enabled && <span className="notice-badge off">숨김</span>}</span>
                  </button>
                  <span className="guide-order">
                    <button onClick={() => move(c.id, -1)} disabled={busy || i === 0} aria-label={`${c.name} 위로`}>▲</button>
                    <button onClick={() => move(c.id, 1)} disabled={busy || i === cats.length - 1} aria-label={`${c.name} 아래로`}>▼</button>
                  </span>
                </li>
              ))}
            </ol>
          )}
        </aside>

        <div className="guide-admin-main">
          {catForm ? (
            <form className="notice-form guide-cat-form" onSubmit={saveCategory}>
              <div className="notice-form-head">
                <h2>{catForm.id === null ? '새 카테고리' : '카테고리 수정'}</h2>
                <button type="button" className="notice-cancel" onClick={() => setCatForm(null)} disabled={busy}>취소</button>
              </div>
              {catForm.id === null && (
                <label className="notice-field">
                  <span className="notice-label">코드<span className="count">영어 소문자·숫자·하이픈, 나중에 못 바꿔요</span></span>
                  <input value={catForm.value.code ?? ''} placeholder="예) events" onChange={(e) => setCatForm({ ...catForm, value: { ...catForm.value, code: e.target.value.toLowerCase() } })} />
                </label>
              )}
              <label className="notice-field">
                <span className="notice-label">이름<span className="count">{chars(catForm.value.name)}/{NAME_MAX}</span></span>
                <input className="notice-title-input" value={catForm.value.name} placeholder="예) 🎉 이벤트" onChange={(e) => setCatForm({ ...catForm, value: { ...catForm.value, name: e.target.value } })} />
              </label>
              <div className="notice-options">
                {(['ARTICLE', 'FAQ'] as const).map((t) => (
                  <label key={t} className={catForm.value.displayType === t ? 'notice-toggle on' : 'notice-toggle'}>
                    <input type="radio" name="displayType" checked={catForm.value.displayType === t} onChange={() => setCatForm({ ...catForm, value: { ...catForm.value, displayType: t } })} />
                    <span className="notice-toggle-text"><strong>{TYPE_LABEL[t]}</strong>
                      <span className="muted small">{t === 'ARTICLE' ? '글을 카드로 펼쳐 보여요(설명서)' : '질문을 눌러 답을 펼쳐요(자주 묻는 질문)'}</span></span>
                  </label>
                ))}
                <label className={catForm.value.enabled ? 'notice-toggle on' : 'notice-toggle'}>
                  <input type="checkbox" checked={catForm.value.enabled} onChange={(e) => setCatForm({ ...catForm, value: { ...catForm.value, enabled: e.target.checked } })} />
                  <span className="notice-toggle-text"><strong>👁 사용자에게 보이기</strong><span className="muted small">끄면 가이드 창에서 숨겨요(글은 남아요)</span></span>
                </label>
              </div>
              <div className="notice-submit">
                <button className="primary" type="submit" disabled={!catValid || busy}>{catForm.id === null ? '만들기' : '수정'}</button>
              </div>
            </form>
          ) : current ? (<>
            <div className="guide-cat-bar">
              <div>
                <h2>{current.name} {!current.enabled && <span className="notice-badge off">숨김</span>}</h2>
                <span className="muted small"><code>{current.code}</code> · {TYPE_LABEL[current.displayType]} · 글 {current.articleCount}개</span>
              </div>
              <div className="notice-row-actions">
                <button onClick={() => setCatForm({ id: current.id, value: { name: current.name, displayType: current.displayType, enabled: current.enabled } })} disabled={busy}>카테고리 수정</button>
                {confirmCat ? (<>
                  <span className="small">삭제할까요?</span>
                  <button className="danger" disabled={busy} onClick={async () => {
                    if (await run(() => adminApi.deleteGuideCategory(current.id), '카테고리를 삭제했어요')) { setConfirmCat(false); load(); }
                  }}>삭제</button>
                  <button onClick={() => setConfirmCat(false)} disabled={busy}>취소</button>
                </>) : (
                  <button className="danger" onClick={() => setConfirmCat(true)} disabled={busy || current.articleCount > 0}
                          title={current.articleCount > 0 ? '글이 있으면 지울 수 없어요. 숨기기를 쓰세요' : undefined}>삭제</button>
                )}
              </div>
            </div>
            <Articles key={current.id} category={current} onCountChange={load} onMessage={setMessage} />
          </>) : <p className="muted">왼쪽에서 카테고리를 고르세요.</p>}
        </div>
      </div>
    </section>
  );
}

/** 한 카테고리의 글: 목록(순서·수정·삭제)과 편집기 */
function Articles({ category, onCountChange, onMessage }: { category: AdminGuideCategory; onCountChange(): void; onMessage(m: Msg): void }) {
  const [list, setList] = useState<AdminGuideArticle[] | null>(null);
  const [editing, setEditing] = useState<number | 'new' | null>(null);
  const [form, setForm] = useState<AdminGuideArticleInput>(EMPTY_ARTICLE);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);

  const load = useCallback(() => adminApi.guideArticles(category.id).then(setList).catch((e) => onMessage({ text: errMsg(e), ok: false })), [category.id, onMessage]);
  useEffect(() => { load(); }, [load]);

  async function run(act: () => Promise<unknown>, ok?: string) {
    setBusy(true); onMessage(null);
    try {
      await act();
      if (ok) onMessage({ text: ok, ok: true });
      return true;
    } catch (e) {
      onMessage({ text: errMsg(e), ok: false });
      return false;
    } finally {
      setBusy(false);
    }
  }

  const dirty = editing !== null && (editing === 'new' ? form.title.trim() !== '' || form.body.trim() !== ''
    : (() => { const a = list?.find((x) => x.id === editing); return !!a && (a.title !== form.title || a.body !== form.body); })());

  function open(target: number | 'new') {
    if (dirty && !window.confirm('저장하지 않은 내용이 있어요. 버리고 넘어갈까요?')) return;
    const a = target === 'new' ? null : list?.find((x) => x.id === target);
    setEditing(target);
    setForm(a ? { title: a.title, body: a.body } : EMPTY_ARTICLE);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    if (editing === null) return;
    const done = await run(async () => {
      if (editing === 'new') await adminApi.createGuideArticle(category.id, form);
      else await adminApi.updateGuideArticle(editing, form);
      await load();
      onCountChange();
    }, editing === 'new' ? '글을 올렸어요' : '글을 수정했어요');
    if (done) { setEditing(null); setForm(EMPTY_ARTICLE); }
  }

  const titleLen = chars(form.title), bodyLen = chars(form.body);
  const valid = titleLen >= 1 && titleLen <= TITLE_MAX && bodyLen >= 1 && bodyLen <= BODY_MAX;

  return (<>
    {editing !== null ? (
      <form className="notice-form editing" onSubmit={save}>
        <div className="notice-form-head">
          <h2>{editing === 'new' ? '✍️ 새 글 쓰기' : '✏️ 글 수정'}</h2>
          <span className="muted small">{category.name}</span>
          <button type="button" className="notice-cancel" onClick={() => { if (!dirty || window.confirm('저장하지 않은 내용을 버릴까요?')) { setEditing(null); setForm(EMPTY_ARTICLE); } }} disabled={busy}>취소</button>
        </div>
        <label className="notice-field">
          <span className="notice-label">{category.displayType === 'FAQ' ? '질문' : '제목'}<span className={titleLen > TITLE_MAX ? 'count over' : 'count'}>{titleLen}/{TITLE_MAX}</span></span>
          <input className="notice-title-input" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                 placeholder={category.displayType === 'FAQ' ? '예) 키워드가 사라졌어요.' : '예) 세이프존'} />
        </label>
        <div className="notice-edit">
          <div className="notice-field">
            <label className="notice-label" htmlFor="guide-body">{category.displayType === 'FAQ' ? '답변' : '본문'}<span className={bodyLen > BODY_MAX ? 'count over' : 'count'}>{bodyLen.toLocaleString()}/{BODY_MAX.toLocaleString()}</span></label>
            <MarkupEditor id="guide-body" embeds value={form.body} onChange={(body) => setForm((f) => ({ ...f, body }))} rows={18}
                          placeholder={'놀이 방법을 쉬운 말로 써 주세요. 세부 수치·계산식은 쓰지 않아요.\n🖼 그림 넣기로 게임 그림을 넣을 수 있어요.'} />
          </div>
          <div className="notice-preview" aria-label="미리 보기">
            <span className="notice-label">미리 보기<span className="count">사용자 가이드 창과 같은 모양</span></span>
            <div className="notice-preview-box">
              {category.displayType === 'FAQ' ? (
                <div className="accordion guide-faq">
                  <details open><summary><span className="faq-q" aria-hidden="true">Q</span><span className="summary-title">{form.title.trim() || '질문을 입력하세요'}</span></summary>
                    {form.body.trim() ? <RichText text={form.body} /> : <p className="muted small">답변을 쓰면 여기에 보여요</p>}
                  </details>
                </div>
              ) : (
                <article className="guide-card">
                  <h4>{form.title.trim() || '제목을 입력하세요'}</h4>
                  {form.body.trim() ? <RichText text={form.body} /> : <p className="muted small">본문을 쓰면 여기에 보여요</p>}
                </article>
              )}
            </div>
          </div>
        </div>
        <div className="notice-submit">
          <button className="primary" type="submit" disabled={!valid || busy}>{busy ? '저장하는 중…' : editing === 'new' ? '글 올리기' : '수정'}</button>
        </div>
      </form>
    ) : null}

    <div className="notice-list-head">
      <h2>글 목록</h2>
      {list && <span className="muted small">{list.length}개 · 위에서부터 보이는 순서</span>}
      <button className="primary guide-new" onClick={() => open('new')} disabled={busy || editing === 'new'}>+ 새 글</button>
    </div>
    {list === null ? <p className="muted">불러오는 중…</p> : list.length === 0 ? <p className="muted notice-empty">아직 글이 없어요. [+ 새 글]로 첫 글을 써 보세요.</p> : (
      <ol className="notice-list">
        {list.map((a, i) => (
          <li key={a.id} className={editing === a.id ? 'notice-row editing' : 'notice-row'}>
            <span className="guide-order">
              <button onClick={() => run(async () => setList(await adminApi.moveGuideArticle(a.id, -1)))} disabled={busy || i === 0} aria-label={`${a.title} 위로`}>▲</button>
              <button onClick={() => run(async () => setList(await adminApi.moveGuideArticle(a.id, 1)))} disabled={busy || i === list.length - 1} aria-label={`${a.title} 아래로`}>▼</button>
            </span>
            <div className="notice-row-main">
              {editing === a.id && <div className="notice-row-badges"><span className="notice-badge editing">수정 중</span></div>}
              <strong className="notice-row-title">{category.displayType === 'FAQ' ? 'Q. ' : ''}{a.title}</strong>
              <span className="muted small">수정 {fmt(a.updatedAt)}</span>
              <details className="notice-row-body"><summary>본문 보기</summary><RichText text={a.body} /></details>
            </div>
            <div className="notice-row-actions">
              {confirmDelete === a.id ? (<>
                <span className="small">삭제할까요?</span>
                <button className="danger" disabled={busy} onClick={async () => {
                  if (await run(async () => { await adminApi.deleteGuideArticle(a.id); await load(); onCountChange(); }, '글을 삭제했어요')) {
                    setConfirmDelete(null);
                    if (editing === a.id) { setEditing(null); setForm(EMPTY_ARTICLE); }
                  }
                }}>삭제</button>
                <button onClick={() => setConfirmDelete(null)} disabled={busy}>취소</button>
              </>) : (<>
                <button onClick={() => open(a.id)} disabled={busy || editing === a.id}>수정</button>
                <button className="danger" onClick={() => setConfirmDelete(a.id)} disabled={busy}>삭제</button>
              </>)}
            </div>
          </li>
        ))}
      </ol>
    )}
  </>);
}
