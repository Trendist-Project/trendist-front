import { useEffect, useRef, type ReactNode } from 'react';

/** titleExtra: 제목 바로 옆에 두는 버튼 등(예: 키워드 공유) */
interface Props { title: string; onClose(): void; children: ReactNode; className?: string; titleExtra?: ReactNode }

/** 게임 위에 뜨는 창. 바깥 클릭·ESC·닫기 버튼으로 닫고, 게임은 멈추지 않는다. */
export function Modal({ title, onClose, children, className, titleExtra }: Props) {
  const closeRef = useRef<HTMLButtonElement>(null);
  // 게임 화면이 자주 다시 그려져도 포커스가 닫기 버튼으로 다시 튀지 않게, 열 때 한 번만 등록하고 최신 onClose는 ref로 부른다
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onCloseRef.current(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <section className={className ? `modal ${className}` : 'modal'} role="dialog" aria-modal="true" aria-label={title}>
        <header className="modal-head">
          <div className="modal-title"><h2>{title}</h2>{titleExtra}</div>
          <button ref={closeRef} className="icon-button" onClick={onClose} aria-label="닫기">✕</button>
        </header>
        <div className="modal-body">{children}</div>
      </section>
    </div>
  );
}
