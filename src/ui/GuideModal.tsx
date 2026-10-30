import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api/client';
import type { GuideArticle, GuideCategory } from '../api/types';
import { Modal } from './Modal';
import { RichText } from './RichText';

interface Props { onClose(): void; initialCategory?: string }

/** 검색에 쓰는 본문: 문법 기호와 그림 자리(`[[...]]`)를 뺀 글자 */
const plain = (s: string) => s.replace(/\[\[[^\]]+\]\]|\*\*|`|^[>-] |^\d+\. /gm, '').toLowerCase();

/**
 * 게임 가이드·FAQ(4.17). 넓은 화면은 왼쪽에 카테고리 목록, 좁은 화면은 위에 가로로 넘기는 칩.
 * 문서형은 맨 위 목차(누르면 그 글로 이동)와 글 카드, FAQ형은 질문을 펼쳐 보는 목록이다.
 * 위의 검색 칸은 모든 카테고리의 제목·본문에서 찾는다(처음 검색할 때 전체 글을 한 번 불러온다).
 */
export function GuideModal({ onClose, initialCategory }: Props) {
  const [categories, setCategories] = useState<GuideCategory[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [byCategory, setByCategory] = useState<Record<string, GuideArticle[]>>({});
  const [error, setError] = useState(false);
  const [query, setQuery] = useState('');
  const [jumpTo, setJumpTo] = useState<number | null>(null);
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api.guideCategories().then((cs) => {
      setCategories(cs);
      setSelected(cs.find((c) => c.code === initialCategory)?.code ?? cs[0]?.code ?? null);
    }).catch(() => setError(true));
  }, [initialCategory]);

  // 고른 카테고리의 글. 한 번 불러온 것은 다시 부르지 않는다
  useEffect(() => {
    if (!selected || byCategory[selected]) return;
    let alive = true;
    api.guideArticles(selected).then((a) => { if (alive) setByCategory((m) => ({ ...m, [selected]: a })); })
      .catch(() => { if (alive) setError(true); });
    return () => { alive = false; };
  }, [selected, byCategory]);

  // 검색을 시작하면 아직 안 불러온 카테고리를 모두 불러온다
  const searching = query.trim().length > 0;
  useEffect(() => {
    if (!searching || !categories) return;
    for (const c of categories) {
      if (byCategory[c.code]) continue;
      api.guideArticles(c.code).then((a) => setByCategory((m) => (m[c.code] ? m : { ...m, [c.code]: a }))).catch(() => {});
    }
  }, [searching, categories, byCategory]);

  // 검색 결과에서 고른 글로 스크롤한다(카테고리를 바꾼 뒤 그려지면)
  useEffect(() => {
    if (jumpTo === null || searching) return;
    const el = bodyRef.current?.querySelector<HTMLElement>(`[data-article="${jumpTo}"]`);
    if (!el) return;
    if (el instanceof HTMLDetailsElement) el.open = true;
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setJumpTo(null);
  }, [jumpTo, searching, byCategory, selected]);

  const results = useMemo(() => {
    if (!searching || !categories) return [];
    const q = query.trim().toLowerCase();
    return categories.flatMap((c) => (byCategory[c.code] ?? [])
      .filter((a) => a.title.toLowerCase().includes(q) || plain(a.body).includes(q))
      .map((a) => ({ category: c, article: a })));
  }, [searching, query, categories, byCategory]);

  const index = categories?.findIndex((c) => c.code === selected) ?? -1;
  const category = index >= 0 ? categories![index] : undefined;
  const articles = selected ? byCategory[selected] : undefined;
  const prev = index > 0 ? categories![index - 1] : null;
  const next = categories && index >= 0 && index < categories.length - 1 ? categories[index + 1] : null;

  function open(code: string, articleId?: number) {
    setQuery('');
    setSelected(code);
    setJumpTo(articleId ?? null);
    if (articleId === undefined) bodyRef.current?.scrollTo({ top: 0 });
  }

  return (
    <Modal title="가이드·FAQ" onClose={onClose} className="guide-modal">
      <div className="guide-search">
        <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="🔎 궁금한 것을 찾아보세요 (예: 세이프존, 칭호)"
               aria-label="가이드 검색" />
      </div>
      {error && <p className="muted">가이드를 불러오지 못했어요. 잠시 후 다시 열어 주세요.</p>}
      {categories?.length === 0 && <p className="muted">아직 가이드가 없어요.</p>}
      {categories && categories.length > 0 && (
        <div className="guide-layout">
          <nav className="guide-nav" role="tablist" aria-label="가이드 카테고리">
            {categories.map((c) => (
              <button key={c.code} role="tab" aria-selected={!searching && c.code === selected}
                      className={!searching && c.code === selected ? 'guide-nav-item active' : 'guide-nav-item'} onClick={() => open(c.code)}>
                {c.name}
              </button>
            ))}
          </nav>
          <div className="guide-content" ref={bodyRef}>
            {searching ? (
              <section aria-label="검색 결과">
                <p className="muted small">'{query.trim()}' 검색 결과 {results.length}개</p>
                {results.length === 0 ? <p className="muted">찾는 글이 없어요. 다른 말로 찾아보세요.</p> : (
                  <ul className="guide-results">
                    {results.map(({ category: c, article: a }) => (
                      <li key={a.id}>
                        <button onClick={() => open(c.code, a.id)}>
                          <span className="muted small">{c.name}</span>
                          <strong>{a.title}</strong>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            ) : (<>
              {category && <h3 className="guide-heading">{category.name}</h3>}
              {selected && !articles && !error && <p className="muted">불러오는 중…</p>}
              {category && articles && (articles.length === 0 ? <p className="muted">아직 글이 없어요.</p>
                : category.displayType === 'FAQ' ? (
                  <div className="accordion guide-faq">
                    {articles.map((a) => (
                      <details key={a.id} data-article={a.id}>
                        <summary><span className="faq-q" aria-hidden="true">Q</span><span className="summary-title">{a.title}</span></summary>
                        <RichText text={a.body} />
                      </details>
                    ))}
                  </div>
                ) : (<>
                  {articles.length > 1 && (
                    <nav className="guide-toc" aria-label="이 카테고리의 글">
                      {articles.map((a) => (
                        <button key={a.id} className="chip" onClick={() => setJumpTo(a.id)}>{a.title}</button>
                      ))}
                    </nav>
                  )}
                  <div className="articles">
                    {articles.map((a) => (
                      <article key={a.id} className="guide-card" data-article={a.id}>
                        <h4>{a.title}</h4>
                        <RichText text={a.body} />
                      </article>
                    ))}
                  </div>
                </>))}
              {(prev || next) && (
                <div className="guide-pager">
                  {prev ? <button onClick={() => open(prev.code)}>‹ {prev.name}</button> : <span />}
                  {next && <button className="primary" onClick={() => open(next.code)}>{next.name} ›</button>}
                </div>
              )}
            </>)}
          </div>
        </div>
      )}
    </Modal>
  );
}
