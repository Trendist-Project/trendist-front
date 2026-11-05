import { useEffect, useState } from 'react';
import { t } from '../i18n';

/**
 * 성공 알림(토스트, 8절): 저장·수정·복사처럼 요청이 잘 끝났을 때 화면 위 가운데에 잠깐 띄운다.
 * 어느 화면에서든 successToast(t('toast.saved'))만 부르면 되고, <Toaster />는 게임·관리자 페이지에 하나씩 둔다.
 * 오류는 입력 칸 옆에 그대로 보여 준다(무엇을 고쳐야 하는지 그 자리에서 보이게).
 * 브라우저 확인 창(window.confirm) 대신 아래 confirmToast(예·아니오 버튼이 있는 토스트)를 쓴다.
 */
type Item = { id: number; text: string; confirm?: { yes: string; no: string } };
type Listener = (items: Item[]) => void;

const SHOW_MS = 2400;
const MAX = 3;
let items: Item[] = [];
let nextId = 1;
const listeners = new Set<Listener>();
const emit = () => listeners.forEach((l) => l(items));

function push(text: string, ms: number) {
  const id = nextId++;
  // 같은 문구를 연달아 누르면 하나만 남긴다
  items = [...items.filter((i) => i.text !== text), { id, text }].slice(-MAX);
  emit();
  window.setTimeout(() => { items = items.filter((i) => i.id !== id); emit(); }, ms);
}

export function successToast(text: string) { push(text, SHOW_MS); }

/**
 * window.confirm 대신 쓰는 확인 토스트. 화면 위에 질문과 [예]·[아니오] 버튼이 뜨고, 고를 때까지 남아 있다.
 * `if (!(await confirmToast('…할까요?'))) return;`처럼 쓴다. Esc나 새 확인이 뜨면 아니오로 본다. labels는 관리자 화면처럼 언어를 바꿀 때만 넘긴다.
 */
let pending: { id: number; resolve: (ok: boolean) => void } | null = null;

function closeConfirm(id: number, ok: boolean) {
  if (!pending || pending.id !== id) return;
  const { resolve } = pending;
  pending = null;
  items = items.filter((x) => x.id !== id);
  emit();
  resolve(ok);
}

export function confirmToast(text: string, labels?: { yes: string; no: string }): Promise<boolean> {
  if (pending) closeConfirm(pending.id, false); // 한 번에 하나만 묻는다
  const id = nextId++;
  items = [...items, { id, text, confirm: labels ?? { yes: t('toast.yes'), no: t('toast.no') } }].slice(-MAX - 1);
  emit();
  return new Promise<boolean>((resolve) => { pending = { id, resolve }; });
}

export function Toaster() {
  const [list, setList] = useState<Item[]>(items);
  useEffect(() => {
    listeners.add(setList);
    return () => { listeners.delete(setList); };
  }, []);
  const asking = list.some((i) => i.confirm);
  useEffect(() => {
    if (!asking) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && pending) closeConfirm(pending.id, false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [asking]);
  return (
    <div className="success-toasts" role="status" aria-live="polite">
      {list.map((i) => i.confirm ? (
        <div key={i.id} className="success-toast confirm" role="alertdialog" aria-label={i.text}>
          <span aria-hidden="true">?</span>
          <div className="toast-text">{i.text}</div>
          <div className="toast-actions">
            <button type="button" className="primary" autoFocus onClick={() => closeConfirm(i.id, true)}>{i.confirm.yes}</button>
            <button type="button" onClick={() => closeConfirm(i.id, false)}>{i.confirm.no}</button>
          </div>
        </div>
      ) : (
        <div key={i.id} className="success-toast"><span aria-hidden="true">✓</span>{i.text}</div>
      ))}
    </div>
  );
}
