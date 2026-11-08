import { createContext, useCallback, useContext, useMemo, useState, type CSSProperties, type ReactNode } from 'react';

/**
 * 화면 위에 겹치는 덩어리(도구·메뉴, 채팅, 명령 줄·이모트, 정보 카드, 검색 서랍)는 **마지막에 손댄 것이 맨 위**에 보인다.
 * 열거나 누르거나 포커스하면 그 덩어리를 맨 위로 올린다(raise). 올린 적 없는 덩어리는 CSS의 기본 순서를 따른다.
 * 모달(40~)·알림(60~)은 항상 이 덩어리들보다 위다.
 */
const BASE = 16;

interface Layers { zOf(id: string): number | undefined; raise(id: string): void }
const Ctx = createContext<Layers>({ zOf: () => undefined, raise: () => {} });

export function LayersProvider({ children }: { children: ReactNode }) {
  const [order, setOrder] = useState<string[]>([]);
  const raise = useCallback((id: string) => setOrder((o) => (o[o.length - 1] === id ? o : [...o.filter((x) => x !== id), id])), []);
  const value = useMemo<Layers>(() => ({ zOf: (id) => { const i = order.indexOf(id); return i < 0 ? undefined : BASE + i; }, raise }), [order, raise]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** 덩어리의 맨 바깥 요소에 펼쳐 쓴다: style(z-index)과 누르기·포커스 때 맨 위로 올리는 핸들러. raise는 열릴 때 직접 부를 수도 있다 */
export function useLayer(id: string) {
  const { zOf, raise } = useContext(Ctx);
  const z = zOf(id);
  const front = useCallback(() => raise(id), [raise, id]);
  const props = useMemo(() => ({
    style: (z === undefined ? undefined : { zIndex: z }) as CSSProperties | undefined,
    onPointerDownCapture: front,
    onFocusCapture: front,
  }), [z, front]);
  return { props, front };
}
