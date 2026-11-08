import { useEffect } from 'react';

/**
 * 조이스틱을 쥔 채 다른 손가락으로 화면 버튼을 누르면 브라우저가 click을 만들지 않는다(멀티터치). 그래서 **다른 손가락이 이미 화면에 닿아 있을 때**
 * 누른 버튼은 누르는 즉시 click을 대신 일으킨다(스킬·이모트·접기 탭·메뉴 등 모든 버튼이 한 곳에서 같은 방식으로 고쳐진다).
 * 손가락이 하나뿐일 때는 평소처럼 브라우저가 만든 click을 그대로 쓰고, 혹시 뒤따라 오는 진짜 click은 한 번 걸러 두 번 눌리지 않게 한다.
 */
export function useMultiTouchClicks() {
  useEffect(() => {
    const active = new Set<number>(); // 지금 화면에 닿아 있는 터치 손가락
    let last: { btn: Element; at: number } | null = null;
    const down = (e: PointerEvent) => {
      if (e.pointerType !== 'touch') return;
      const others = active.size > 0; // 이 손가락 말고 이미 닿은 손가락(조이스틱 등)이 있다
      active.add(e.pointerId);
      if (!others) return;
      const btn = e.target instanceof Element ? e.target.closest('button') : null;
      if (!btn || btn.disabled || btn.getAttribute('aria-disabled') === 'true') return;
      last = { btn, at: performance.now() };
      btn.click();
    };
    const up = (e: PointerEvent) => { active.delete(e.pointerId); };
    const click = (e: MouseEvent) => {
      // 우리가 일으킨 click은 isTrusted가 false다. 직후 같은 버튼에 오는 진짜 click은 걸러 두 번 눌리지 않게 한다
      if (!e.isTrusted || !last) return;
      if (e.target instanceof Node && last.btn.contains(e.target) && performance.now() - last.at < 700) {
        e.stopImmediatePropagation();
        e.preventDefault();
        last = null;
      }
    };
    window.addEventListener('pointerdown', down, true);
    window.addEventListener('pointerup', up, true);
    window.addEventListener('pointercancel', up, true);
    window.addEventListener('click', click, true);
    return () => {
      window.removeEventListener('pointerdown', down, true);
      window.removeEventListener('pointerup', up, true);
      window.removeEventListener('pointercancel', up, true);
      window.removeEventListener('click', click, true);
    };
  }, []);
}
