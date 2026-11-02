import { useEffect, useState } from 'react';

/**
 * 성공 알림(토스트, 8절): 저장·수정·복사처럼 요청이 잘 끝났을 때 화면 위 가운데에 잠깐 띄운다.
 * 어느 화면에서든 successToast('저장했어요')만 부르면 되고, <Toaster />는 게임·관리자 페이지에 하나씩 둔다.
 * 오류는 입력 칸 옆에 그대로 보여 준다(무엇을 고쳐야 하는지 그 자리에서 보이게).
 */
type Item = { id: number; text: string };
type Listener = (items: Item[]) => void;

const SHOW_MS = 2400;
const MAX = 3;
let items: Item[] = [];
let nextId = 1;
const listeners = new Set<Listener>();
const emit = () => listeners.forEach((l) => l(items));

export function successToast(text: string) {
  const id = nextId++;
  // 같은 문구를 연달아 누르면 하나만 남긴다
  items = [...items.filter((t) => t.text !== text), { id, text }].slice(-MAX);
  emit();
  window.setTimeout(() => { items = items.filter((t) => t.id !== id); emit(); }, SHOW_MS);
}

export function Toaster() {
  const [list, setList] = useState<Item[]>(items);
  useEffect(() => {
    listeners.add(setList);
    return () => { listeners.delete(setList); };
  }, []);
  return (
    <div className="success-toasts" role="status" aria-live="polite">
      {list.map((t) => (
        <div key={t.id} className="success-toast"><span aria-hidden="true">✓</span>{t.text}</div>
      ))}
    </div>
  );
}
