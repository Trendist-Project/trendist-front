import { useLayer } from './layers';
import { useEffect, useRef, useState } from 'react';
import { api } from '../api/client';
import type { KeywordTag } from '../api/types';
import { fmtNumber, t } from '../i18n';
import type { OrbLook } from '../game/skin';
import { PlayerOrb } from './PlayerOrb';

type Info = { nickname: string; level: number; score: number; bot: boolean; look: OrbLook };

const AUTO_CLOSE_MS = 10_000;  // 따라가고 있지 않을 때 이 시간이 지나면 저절로 닫힌다
const SWIPE_START = 8;         // 이만큼(px) 옆으로 움직이면 스와이프로 본다(탭·클릭과 구분)
const SWIPE_DISMISS = 56;      // 왼쪽으로 이만큼(px) 넘게 밀면 치운다
const SWIPE_FLICK = 0.5;       // 또는 이 속도(px/ms)보다 빠르게 쓸면 치운다

/**
 * 클릭한 플레이어·봇의 작은 정보 카드(왼쪽 위, 4.11): 닉네임·레벨·현재 유행도·가진 키워드(상위 3개, # 해시태그 모양).
 * 이름은 지금 화면의 값을 0.5초마다 읽고, 키워드는 5초마다 서버에서 읽는다(사람만). 그 원이 사라지면 저절로 닫힌다.
 * - 닫는 법: ✕(눌러야 하는 자리는 36px로 넓혔다), **왼쪽으로 밀기**(PC는 끌기), 누른 뒤 10초가 지나면 저절로.
 * - 따라가는 중(`following`)에는 10초 타이머 없이 계속 보인다("따라가는 중" 표시). 따라가기를 멈추면 그때부터 10초를 센다.
 * - 이름을 누르면 자세한 창(신고 포함)이 열린다.
 * touchKey는 이 원을 누를 때마다 바뀌어서 10초를 다시 시작한다.
 */
export function TargetCard({ entityNo, following, touchKey, read, onClose, onDetail, onOpenKeyword }: {
  entityNo: number;
  following: boolean;
  touchKey: number;
  read: (e: number) => Info | null;
  onClose(): void;
  onDetail(): void;
  onOpenKeyword(id: number): void;
}) {
  const [info, setInfo] = useState<Info | null>(() => read(entityNo));
  const [keywords, setKeywords] = useState<KeywordTag[] | null>(null);
  const ref = useRef<HTMLElement>(null);
  const layer = useLayer('target');
  useEffect(() => { layer.front(); }, [entityNo, touchKey]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setKeywords(null);
    let missing = 0;
    const tick = () => {
      const v = read(entityNo);
      if (v) { missing = 0; setInfo(v); } else if (++missing >= 4) onClose(); // 2초 넘게 안 보이면(나감·죽음·은신) 닫는다
    };
    tick();
    const id = window.setInterval(tick, 500);
    return () => window.clearInterval(id);
  }, [entityNo, read, onClose]);

  // 따라가고 있지 않으면 10초 뒤 저절로 닫는다. 누를 때마다·따라가기가 멈출 때마다 새로 센다
  useEffect(() => {
    if (following) return;
    const id = window.setTimeout(onClose, AUTO_CLOSE_MS);
    return () => window.clearTimeout(id);
  }, [following, touchKey, entityNo, onClose]);

  const bot = info?.bot ?? false;
  useEffect(() => {
    if (bot) return;
    let alive = true;
    const load = () => api.roomPlayer(entityNo).then((c) => { if (alive) setKeywords(c.topKeywords); }).catch(() => { /* 키워드만 못 보인다 */ });
    load();
    const id = window.setInterval(load, 5000);
    return () => { alive = false; window.clearInterval(id); };
  }, [entityNo, bot]);

  // 왼쪽으로 밀어서 치우기: 손가락(마우스)을 따라 움직이다가 충분히 밀었거나 빠르게 쓸었으면 밀려나가고, 아니면 제자리로 돌아온다.
  // 화면 갱신 없이 스타일만 바꿔서 끊기지 않게 하고, 밀었던 뒤 따라오는 클릭은 막는다(이름·키워드가 잘못 눌리지 않게)
  const drag = useRef<{ id: number; x0: number; y0: number; t0: number; dx: number; active: boolean } | null>(null);
  const suppressClick = useRef(false);
  const slide = (x: number, animate: boolean) => {
    const el = ref.current;
    if (!el) return;
    el.style.transition = animate ? 'transform 0.18s ease-out, opacity 0.18s ease-out' : 'none';
    el.style.transform = x === 0 ? '' : `translateX(${x}px)`;
    el.style.opacity = x === 0 ? '' : String(Math.max(0, 1 - Math.abs(x) / 160));
  };
  const onPointerDown = (e: React.PointerEvent) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    drag.current = { id: e.pointerId, x0: e.clientX, y0: e.clientY, t0: performance.now(), dx: 0, active: false };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const dx = e.clientX - d.x0, dy = e.clientY - d.y0;
    if (!d.active) {
      if (Math.abs(dy) > SWIPE_START && Math.abs(dy) > Math.abs(dx)) { drag.current = null; return; } // 세로로 움직이면 스와이프가 아니다
      if (Math.abs(dx) < SWIPE_START) return;
      d.active = true;
      try { ref.current?.setPointerCapture(e.pointerId); } catch { /* 이미 뗐다 */ }
    }
    d.dx = Math.min(0, dx); // 왼쪽으로만 움직인다
    slide(d.dx, false);
  };
  const endDrag = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    drag.current = null;
    if (!d.active) return;
    suppressClick.current = true;
    window.setTimeout(() => { suppressClick.current = false; }, 0);
    const speed = Math.abs(d.dx) / Math.max(1, performance.now() - d.t0);
    if (e.type === 'pointerup' && (d.dx < -SWIPE_DISMISS || (d.dx < -24 && speed > SWIPE_FLICK))) {
      slide(-260, true);
      window.setTimeout(onClose, 170);
    } else slide(0, true);
  };

  if (!info) return null;
  return (
    <aside ref={ref} className={`target-card${following ? ' following' : ''}`} aria-label={t('player.title')} {...layer.props}
           onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={endDrag} onPointerCancel={endDrag}
           onClickCapture={(e) => { if (suppressClick.current) { e.preventDefault(); e.stopPropagation(); } }}>
      <div className="tc-top">
        <PlayerOrb look={info.look} level={info.level} size={40} />
        <div className="tc-main">
          <div className="tc-head">
            <button className="tc-name" onClick={onDetail} title={t('player.cardMore')}>{info.nickname}</button>
            {bot && <span className="badge bot">BOT</span>}
            <button className="tc-close" onClick={onClose} aria-label={t('dialogs.close')} title={t('player.cardClose')}><span aria-hidden="true">✕</span></button>
          </div>
          <div className="tc-stats">
            <span className="tc-level">Lv.{info.level}</span>
            <span className="tc-score" title={t('player.score')}>{t('player.score')} <strong>{fmtNumber(info.score)}</strong></span>
          </div>
        </div>
      </div>
      {following && <div className="tc-follow" role="status">{t('player.following')}</div>}
      {!bot && keywords && keywords.length > 0 && (
        <div className="tc-tags">
          {keywords.map((k) => (
            <button key={k.keywordId} onClick={() => onOpenKeyword(k.keywordId)} aria-label={t('player.detailAria', { text: k.text })}>
              <i aria-hidden="true">#</i>{k.text}
            </button>
          ))}
        </div>
      )}
      {!following && <div className="tc-timer" key={`${entityNo}:${touchKey}`} aria-hidden="true" />}
    </aside>
  );
}
