import { useEffect, useState } from 'react';
import { api } from '../api/client';
import type { GuideArticle, GuideCategory } from '../api/types';
import { Modal } from './Modal';
import { RichText } from './RichText';

interface Props { onClose(): void; initialCategory?: string }

/** 게임 가이드·FAQ(4.17). 카테고리 탭을 고르면 문서형은 글을 이어서, FAQ형은 질문을 펼쳐 보는 목록으로 보여 준다. */
export function GuideModal({ onClose, initialCategory }: Props) {
  const [categories, setCategories] = useState<GuideCategory[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [articles, setArticles] = useState<GuideArticle[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    api.guideCategories().then((cs) => {
      setCategories(cs);
      setSelected(cs.find((c) => c.code === initialCategory)?.code ?? cs[0]?.code ?? null);
    }).catch(() => setError(true));
  }, [initialCategory]);

  useEffect(() => {
    if (!selected) return;
    let alive = true;
    setArticles(null);
    api.guideArticles(selected).then((a) => { if (alive) setArticles(a); }).catch(() => { if (alive) setError(true); });
    return () => { alive = false; };
  }, [selected]);

  const category = categories?.find((c) => c.code === selected);

  return (
    <Modal title="가이드·FAQ" onClose={onClose}>
      {error && <p className="muted">가이드를 불러오지 못했어요. 잠시 후 다시 열어 주세요.</p>}
      {categories && categories.length > 0 && (
        <nav className="chip-tabs" role="tablist" aria-label="가이드 카테고리">
          {categories.map((c) => (
            <button key={c.code} role="tab" aria-selected={c.code === selected}
                    className={c.code === selected ? 'chip active' : 'chip'} onClick={() => setSelected(c.code)}>
              {c.name}
            </button>
          ))}
        </nav>
      )}
      {categories?.length === 0 && <p className="muted">아직 가이드가 없어요.</p>}
      {selected && articles === null && !error && <p className="muted">불러오는 중…</p>}
      {category && articles && (articles.length === 0 ? <p className="muted">아직 글이 없어요.</p>
        : category.displayType === 'FAQ' ? (
          <div className="accordion">
            {articles.map((a) => (
              <details key={a.id}>
                <summary><span className="summary-title">{a.title}</span></summary>
                <RichText text={a.body} />
              </details>
            ))}
          </div>
        ) : (
          <div className="articles">
            {articles.map((a) => (
              <article key={a.id}>
                <h3>{a.title}</h3>
                <RichText text={a.body} />
              </article>
            ))}
          </div>
        ))}
    </Modal>
  );
}
