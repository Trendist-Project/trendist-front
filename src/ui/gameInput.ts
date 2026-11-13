import type { Dispatch, MutableRefObject, RefObject, SetStateAction } from 'react';
import type { SkillInfo } from '../api/types';
import type { Arena } from '../game/Arena';
import type { GameConnection } from '../game/connection';
import { EMOTES } from '../game/skin';
import { loadSlotKeys, SKILL_WINDOW_KEY, targetOfKey } from '../game/skillKeys';
import { t } from '../i18n';
import type { GameSession } from './gameMessages';

/**
 * 게임 화면의 입력(4.2, 4.11, 4.26, 4.27, 4.33): 방향키·WASD, PC 마우스(우클릭 이동·좌클릭 따라가기·Shift+클릭 정보), 모바일 조이스틱·탭,
 * 스킬·대시·이모트 키, 미니맵 크게 보기. 연결 하나 동안 붙어 있고 detach로 모든 리스너·타이머를 걷는다.
 * 서버에는 방에 들어간 뒤(sess.ready)에만 보내고, 보낸 입력만 아레나 예측에 넣는다.
 */
export const KEYS: Record<string, [number, number]> = {
  ArrowUp: [0, -1], KeyW: [0, -1], ArrowDown: [0, 1], KeyS: [0, 1],
  ArrowLeft: [-1, 0], KeyA: [-1, 0], ArrowRight: [1, 0], KeyD: [1, 0],
};
const KEY_INTERVAL_MS = 16;    // 방향키는 누르고 뗄 때마다 바로 보낸다. 한 프레임(16ms) 안의 변화만 하나로 합친다(4.2)
const CLICK_INTERVAL_MS = 100; // 클릭 이동은 초당 10회까지(4.2). 세밀하게 방향을 바꿀 수 있게
const INPUT_RESYNC_MS = 1000;  // 방향키를 누르고 있는 동안 지금 방향을 다시 보내는 간격(서버와 어긋남 방지)
const JOY_RADIUS = 56;         // 조이스틱 판 반지름(px). 이만큼 끌면 최대 속도
const JOY_DEAD = 8;            // 이보다 덜 끌면 멈춘 것으로 본다(손가락 떨림)
const JOY_INTERVAL_MS = 50;    // 조이스틱 방향은 초당 20회까지 보낸다(끄는 동안 계속 바뀌므로 방향키보다 넉넉하게 묶는다)

type Set<T> = Dispatch<SetStateAction<T>>;
type Panel = 'notice' | 'guide' | 'profile' | 'skills' | 'wheel' | null;

export interface GameInputDeps {
  arena: Arena;
  conn: GameConnection;
  sess: GameSession;
  canvas: HTMLCanvasElement;
  /** 조이스틱 판 요소(없으면 그리지 않는다) */
  joyEl: () => HTMLDivElement | null;
  sendDash: () => void;
  showToast: (msg: string) => void;
  /** 끌려오거나 스턴인 동안 스킬 키를 막는 끝 시각(performance.now) */
  hookedUntilRef: MutableRefObject<number>;
  slotsRef: MutableRefObject<(string | null)[]>;
  /** 내 레벨(잠긴 스킬 키를 누르면 안내만 한다) */
  levelRef: MutableRefObject<number>;
  skillsRef: MutableRefObject<SkillInfo[]>;
  sendSkillRef: MutableRefObject<(id: string) => void>;
  sendEmoteRef: MutableRefObject<(code: string) => void>;
  chatOnRef: MutableRefObject<boolean>;
  chatInputRef: RefObject<HTMLInputElement | null>;
  emoteOpenRef: MutableRefObject<boolean>;
  setMenuOpen: Set<boolean>;
  setEmoteOpen: Set<boolean>;
  setPanel: Set<Panel>;
  setTargetCard: Set<number | null>;
  setTargetTouch: Set<number>;
  setFollowUi: Set<number | null>;
  /** 원(hit)의 자세한 정보 창을 연다 */
  openInfo: (hit: number) => void;
}

export function attachGameInput(d: GameInputDeps): { aimPoint: () => { x: number; y: number } | null; detach: () => void } {
  const { arena, conn, sess, canvas, joyEl, sendDash, showToast, hookedUntilRef, slotsRef, levelRef, skillsRef, sendSkillRef, sendEmoteRef,
    chatOnRef, chatInputRef, emoteOpenRef, setMenuOpen, setEmoteOpen, setPanel, setTargetCard, setTargetTouch, setFollowUi, openInfo } = d;
  const pressed = new Set<string>();
  let lastSent = 0, pending: number | null = null;
  // 터치 조이스틱(4.2): 누른 자리가 중심이고, 끈 방향·거리가 방향키처럼 서버로 가는 방향(-1~1)이 된다
  let joy: { pointerId: number; ox: number; oy: number; dx: number; dy: number; armed: boolean } | null = null; // armed: 탭 범위를 넘게 끌어서 조이스틱이 켜졌다
  const currentDir = () => {
    if (joy) return { dx: joy.dx, dy: joy.dy };
    let dx = 0, dy = 0;
    pressed.forEach((k) => { dx += KEYS[k][0]; dy += KEYS[k][1]; });
    return { dx, dy };
  };
  // 예측(arena)에는 서버로 실제로 보낸 입력만 넣는다. 그래야 둘이 같은 입력으로 움직인다(떨림·혼자 움직임 방지)
  const fire = () => {
    lastSent = performance.now();
    const { dx, dy } = currentDir();
    if (sess.ready && conn.send({ type: 'input', dx, dy })) arena.setInput(dx, dy);
  };
  const sendDir = () => {
    const now = performance.now();
    const interval = joy ? JOY_INTERVAL_MS : KEY_INTERVAL_MS;
    if (now - lastSent >= interval) fire();
    else if (pending === null) pending = window.setTimeout(() => { pending = null; sendDir(); }, interval - (now - lastSent));
  };
  const steering = () => pressed.size > 0 || joy !== null;
  sess.resyncDir = () => { if (steering()) fire(); };
  // 누르고 있는 동안에는 1초마다 지금 방향을 다시 보낸다. 중간에 메시지 하나가 빠져도 서버가 곧 같은 상태로 돌아온다
  const resyncTimer = window.setInterval(() => { if (steering() && pending === null) fire(); }, INPUT_RESYNC_MS);
  // 조이스틱 그림은 React state 대신 직접 옮긴다(끄는 동안 매 프레임 바뀌어서)
  const drawJoy = () => {
    const el = joyEl();
    if (!el) return;
    if (!joy || !joy.armed) { el.hidden = true; return; } // 탭(원 누르기)일 때는 조이스틱을 띄우지 않는다
    const rect = canvas.getBoundingClientRect();
    el.hidden = false;
    el.style.left = `${joy.ox - rect.left}px`;
    el.style.top = `${joy.oy - rect.top}px`;
    el.style.setProperty('--kx', `${joy.dx * JOY_RADIUS}px`);
    el.style.setProperty('--ky', `${joy.dy * JOY_RADIUS}px`);
  };
  const endJoy = () => { joy = null; drawJoy(); };
  // 떼는 신호(keyup)를 못 받는 경우(창 전환, 보조키 조합, 입력창으로 포커스 이동)에는 모두 뗀 것으로 본다
  const releaseAll = () => {
    if (!steering()) return;
    pressed.clear();
    if (joy) endJoy();
    sendDir();
  };
  // 빈 바닥 클릭(탭): 그 지점으로 이동(4.2). 이동 중에 다시 찍으면 이전 목표를 버리고 새 지점으로 바로 바꾼다.
  // 서버에는 초당 10회까지만 보내되, 그 사이에 찍은 지점은 버리지 않고 마지막 지점을 이어서 보낸다.
  // 내 원의 예측 이동도 서버로 보내는 순간에 새 목표를 쓴다. 연타해도 예측과 서버의 목표가 같아서 떨리지 않는다.
  let moveTarget: { x: number; y: number } | null = null;
  let lastMoveSent = 0, movePending: number | null = null;
  const sendMove = () => {
    if (!moveTarget) return;
    const now = performance.now();
    if (now - lastMoveSent >= CLICK_INTERVAL_MS) {
      lastMoveSent = now;
      if (sess.ready && conn.send({ type: 'move', x: moveTarget.x, y: moveTarget.y })) arena.setTarget(moveTarget.x, moveTarget.y);
    } else if (movePending === null) {
      movePending = window.setTimeout(() => { movePending = null; sendMove(); }, CLICK_INTERVAL_MS - (now - lastMoveSent));
    }
  };
  // 다른 플레이어 정보(4.11): PC는 우클릭, 모바일은 [🔍]을 누른 뒤 원을 탭한다. 왼쪽 클릭·터치·드래그는 언제나 이동이라 겹치지 않는다
  // 누르고 있는 동안에는 손가락·마우스가 있는 곳으로 계속 따라간다(4.2). 화면이 같이 움직이므로 가만히 누르고 있어도 주기적으로 다시 찍는다
  let hold: { pointerId: number; x: number; y: number } | null = null;
  const followHold = () => {
    if (!hold || !sess.ready) return;
    moveTarget = arena.screenToWorld(hold.x, hold.y);
    sendMove();
  };
  const holdTimer = window.setInterval(followHold, CLICK_INTERVAL_MS);
  // PC 좌클릭으로 고른 원(플레이어·봇)을 자동으로 따라간다. 그 원의 지금 위치를 이동 목표로 계속 보낸다(초당 10회).
  // 방향키·우클릭 이동·터치·원이 사라짐·죽음이면 멈춘다
  let followE: number | null = null;
  // 조이스틱을 쥔 채 다른 손가락으로 고른 원: 조이스틱이 우선이라 쥐고 있는 동안은 따라가지 않고(표시만), 떼면 그 원을 따라간다
  let followKeep = false;
  const stopFollow = () => {
    if (followE === null) return;
    followE = null;
    followKeep = false;
    followPrev = null;
    setFollowUi(null);
    arena.setFollowTarget(null);
    // 마지막 이동 목표와 이미 예약된 이동 전송을 지운다. 안 지우면 방향키·WASD를 눌렀는데도 늦게 나가는 이동 명령이 서버에서 방향 입력을 덮어써서 조작이 안 먹힌다
    moveTarget = null;
    if (movePending !== null) { clearTimeout(movePending); movePending = null; }
  };
  // 서버는 목표에 가까워질수록(120 안) 속도를 줄여서, 움직이는 원을 쫓으면 그 원의 속도에 비례한 거리가 벌어진다.
  // 따라가는 원이 움직이는 만큼 그 진행 방향으로 목표를 앞에 두어(최대 120) 감속 구간을 채운다. 가만히 있으면 0이라 정확히 겹친다.
  let followPrev: { x: number; y: number; at: number } | null = null;
  const FOLLOW_SLOW_ZONE = 120, FOLLOW_REF_SPEED = 240;
  const followTick = () => {
    if (followE === null) return;
    if (joy && joy.armed && (joy.dx || joy.dy)) return; // 조이스틱으로 움직이는 중에는 따라가기 명령이 방향 입력을 덮어쓰지 않게 건너뛴다
    const p = sess.ready ? arena.followPosition(followE) : null;
    if (!p) { stopFollow(); return; }
    const now = performance.now();
    let lead = { x: 0, y: 0 };
    if (followPrev && now - followPrev.at > 0) {
      const dt = (now - followPrev.at) / 1000;
      const vx = (p.x - followPrev.x) / dt, vy = (p.y - followPrev.y) / dt, v = Math.hypot(vx, vy);
      if (v > 20 && v < 4000) { const k = FOLLOW_SLOW_ZONE * Math.min(1, v / FOLLOW_REF_SPEED) / v; lead = { x: vx * k, y: vy * k }; }
    }
    followPrev = { x: p.x, y: p.y, at: now };
    moveTarget = { x: p.x + lead.x, y: p.y + lead.y };
    sendMove();
  };
  const followTimer = window.setInterval(followTick, CLICK_INTERVAL_MS);
  // 탭·더블탭 기준(UX): 손가락·마우스가 조금 흔들려도 탭으로 보고, 움직이는 원을 누르는 것이라 일반 앱(Android 탭 300ms·터치 슬롭 8dp·더블탭 300ms)보다 넉넉하게 잡는다.
  // 손가락 목표는 지름 44~48px이 권장이라 터치는 원 둘레 24px까지 맞은 것으로 본다(마우스는 정확해서 14px).
  const TAP_MS = 300;          // 이 안에 떼야 탭(길게 누르면 탭이 아니다)
  const TAP_SLOP = 16;         // 이만큼(px) 안 움직여야 탭이고, 이보다 많이 움직여야 조이스틱이 뜬다
  const TOUCH_TOL = 24, MOUSE_TOL = 14;
  // 터치 탭 후보: 눌렀을 때의 자리와 시각
  const taps = new Map<number, { x: number; y: number; t: number }>();
  // 원을 골라 따라간다(터치 탭·PC 좌클릭). 누른 원의 정보는 왼쪽 위 작은 카드로 보여 주고(더블클릭·더블탭은 쓰지 않는다),
  // 빈 곳은 아무 효과 없고, 따라가는 원을 다시 누르면 따라가기만 멈춘다(카드는 그대로)
  const selectTarget = (px: number, py: number, tol: number) => {
    const hit = arena.entityAt(px, py, tol);
    if (hit === null) return;
    setTargetCard(hit);
    setTargetTouch((n) => n + 1);
    if (hit === followE) { stopFollow(); return; }
    followE = hit;
    followKeep = !!(joy && joy.armed); // 조이스틱을 쥔 채 골랐다면 조이스틱을 움직여도 취소하지 않는다
    setFollowUi(hit);
    arena.setFollowTarget(hit);
    followTick();
  };
  const pointerDown = (e: PointerEvent) => {
    if (!sess.ready) return;
    const mouse = e.pointerType === 'mouse';
    // PC(마우스): 우클릭이 이동, 좌클릭은 원을 골라 따라가기(빈 곳이면 따라가기 취소). 터치·펜은 그대로 왼쪽(0) 버튼이 이동이다
    if (mouse ? e.button !== 0 && e.button !== 2 : e.button !== 0) return;
    setMenuOpen(false); // 아레나를 누르면 열린 메뉴는 닫는다
    // 미니맵: 크게 보는 중이면 어디를 눌러도 닫고, 작은 미니맵을 누르면(PC 좌클릭·터치) 크게 본다. 이동·따라가기는 하지 않는다
    if (arena.isMinimapEnlarged()) { arena.setMinimapEnlarged(false); return; }
    if ((!mouse || e.button === 0) && arena.minimapHit(e.clientX, e.clientY)) { arena.setMinimapEnlarged(true); return; }
    if (mouse && e.button === 0) {
      const hit = arena.entityAt(e.clientX, e.clientY, MOUSE_TOL);
      if (hit !== null && e.shiftKey) { openInfo(hit); return; } // Shift+클릭: 바로 정보
      selectTarget(e.clientX, e.clientY, MOUSE_TOL); // 클릭: 따라가기 + 왼쪽 위 정보 카드
      return;
    }
    if (e.pointerType !== 'touch') stopFollow(); // 직접 움직이면(우클릭) 자동 따라가기는 멈춘다. 터치는 탭일 수도 있어서 조이스틱이 켜질 때(끌기) 멈춘다
    try { canvas.setPointerCapture(e.pointerId); } catch { /* 이미 뗐다 */ }
    if (e.pointerType === 'touch') {
      // 짧게 톡 누르고 떼면 원 고르기(따라가기)다. 조이스틱을 쥔 채 다른 손가락으로 찍어도 된다. 대시는 ⚡ 버튼으로 쓴다
      taps.set(e.pointerId, { x: e.clientX, y: e.clientY, t: performance.now() });
      // 조이스틱: 누른 자리에 판이 생기고, 끌기 전까지는 움직이지 않는다. 두 번째 손가락은 조이스틱이 되지 않는다
      if (joy) return;
      hold = null;
      moveTarget = null;
      pressed.clear();
      joy = { pointerId: e.pointerId, ox: e.clientX, oy: e.clientY, dx: 0, dy: 0, armed: false };
      drawJoy();
      return;
    }
    hold = { pointerId: e.pointerId, x: e.clientX, y: e.clientY };
    const p = arena.screenToWorld(e.clientX, e.clientY);
    pressed.clear(); // 방향키 이동 중이었다면 목표 이동으로 바꾼다(서버도 목표를 받으면 방향 입력을 지운다)
    arena.showRipple(p.x, p.y); // 물결은 클릭하는 즉시
    moveTarget = p;
    sendMove();
  };
  canvas.addEventListener('pointerdown', pointerDown);
  const pointerMove = (e: PointerEvent) => {
    if (e.pointerType !== 'touch') lastPointer = { x: e.clientX, y: e.clientY }; // 갈고리를 겨누는 마우스 위치(4.33)
    if (joy && e.pointerId === joy.pointerId) {
      const vx = e.clientX - joy.ox, vy = e.clientY - joy.oy, d = Math.hypot(vx, vy);
      if (!joy.armed) {
        if (d < TAP_SLOP) return; // 탭 범위 안의 떨림: 조이스틱도 이동도 아니다(원을 탭하려던 것일 수 있다)
        joy.armed = true;
        drawJoy();
      }
      // 판 반지름만큼 끌면 최대 속도. 소수 둘째 자리로 묶어 같은 방향을 거듭 보내지 않는다
      const k = d < JOY_DEAD ? 0 : Math.min(d, JOY_RADIUS) / JOY_RADIUS / d;
      const dx = Math.round(vx * k * 100) / 100, dy = Math.round(vy * k * 100) / 100;
      if (dx === joy.dx && dy === joy.dy) return;
      joy.dx = dx; joy.dy = dy;
      if ((dx || dy) && !followKeep) stopFollow(); // 조이스틱으로 직접 움직이면 자동 따라가기는 멈춘다(조이스틱을 쥔 채 고른 원은 예외)
      drawJoy();
      sendDir();
      return;
    }
    if (hold && e.pointerId === hold.pointerId) { hold.x = e.clientX; hold.y = e.clientY; followHold(); }
  };
  const pointerEnd = (e: PointerEvent) => {
    const tp = taps.get(e.pointerId);
    taps.delete(e.pointerId);
    if (tp && e.type === 'pointerup' && performance.now() - tp.t < TAP_MS && Math.hypot(e.clientX - tp.x, e.clientY - tp.y) < TAP_SLOP) {
      selectTarget(tp.x, tp.y, TOUCH_TOL); // 짧은 탭: 원 고르기(따라가기 + 왼쪽 위 정보 카드)
    }
    if (joy && e.pointerId === joy.pointerId) { endJoy(); followKeep = false; sendDir(); if (followE !== null) followTick(); return; } // 떼면 그 자리에서 감속해 멈추고, 고른 원이 있으면 그 원을 따라가기 시작한다
    if (hold && e.pointerId === hold.pointerId) hold = null;
  };
  // 우클릭: 브라우저 메뉴 대신 그 자리 원의 정보. 모바일의 길게 누르기 메뉴도 막는다
  const noMenu = (e: MouseEvent) => {
    e.preventDefault();
    if (!sess.ready) return;
    if ((e as PointerEvent).pointerType === 'mouse') return; // PC 우클릭은 이동이다. 정보는 Shift+클릭이나 [🔍]
    const hit = arena.entityAt(e.clientX, e.clientY);
    if (hit !== null) openInfo(hit);
  };
  canvas.addEventListener('pointermove', pointerMove);
  canvas.addEventListener('pointerup', pointerEnd);
  canvas.addEventListener('pointercancel', pointerEnd);
  canvas.addEventListener('pointerleave', pointerEnd);
  canvas.addEventListener('contextmenu', noMenu);

  const typing = (e: KeyboardEvent) => e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement;
  const down = (e: KeyboardEvent) => {
    if (typing(e)) return;
    // Enter: 채팅 입력창으로(입력창에서 Esc를 누르면 다시 조작으로)
    if (e.key === 'Enter' && !e.isComposing && chatOnRef.current) {
      e.preventDefault();
      releaseAll();
      chatInputRef.current?.focus();
      return;
    }
    // M: 미니맵 크게 보기(켜고 닫기), Esc: 크게 보기 닫기. 미니맵·리더보드·채팅을 켜고 끄는 것은 위쪽 버튼으로만 한다(예전의 M·L·C 키는 없앴다).
    // 한글 입력 상태(ㅡ)에서도 되도록 key가 아니라 code로 본다
    if (e.code === 'KeyM' && !e.repeat && !e.ctrlKey && !e.metaKey && !e.altKey) {
      arena.setMinimapEnlarged(!arena.isMinimapEnlarged());
      return;
    }
    if (e.code === 'Escape' && arena.isMinimapEnlarged()) { arena.setMinimapEnlarged(false); return; }
    // E: 이모트 창 열기/닫기, 창이 열려 있을 때 1~8: 그 이모트를 보내고 창을 접는다(4.26). 한글 입력 상태(ㄷ)에서도 되게 code로 본다
    if (e.code === 'KeyE' && !e.repeat && !e.ctrlKey && !e.metaKey && !e.altKey) {
      setEmoteOpen((v) => !v);
      return;
    }
    if (emoteOpenRef.current && /^Digit[1-8]$/.test(e.code) && !e.repeat && !e.ctrlKey && !e.metaKey && !e.altKey) {
      const em = EMOTES[Number(e.code.slice(5)) - 1];
      if (em) sendEmoteRef.current(em[0]);
      setEmoteOpen(false);
      return;
    }
    // 스킬 키(4.33): 칸(1~4번)에 묶인 키를 눌러 그 칸에 장착한 스킬을 쓴다. 대시는 장착과 상관없이 대시 키로 쓴다. 키는 사용자가 바꾼 것이 있으면 그것이다.
    // 이모트 창이 열려 있을 때의 숫자는 위에서 이모트로 처리했다. 한글 입력 상태에서도 되게 code로 보고, 숫자 줄의 키는 숫자패드로도 쓴다.
    // K는 스킬창을 열고 닫는다. 스페이스는 버튼이 눌리거나 화면이 내려가지 않게 막는다
    if (!e.ctrlKey && !e.metaKey && !e.altKey) {
      if (e.code === SKILL_WINDOW_KEY) { if (!e.repeat) setPanel((p) => (p === 'skills' ? null : 'skills')); return; }
      const target = targetOfKey(e.code, loadSlotKeys());
      if (target !== null) {
        if (e.code === 'Space') e.preventDefault();
        if (e.repeat) return;
        if (performance.now() < hookedUntilRef.current) return; // 갈고리에 잡혀 끌려오는 동안은 쓸 수 없다(정화는 서버가 따로 받는다)
        if (target === 'dash') { sendDash(); return; }
        const code = slotsRef.current[target];
        if (!code) { showToast(t('gamescreen.skillEmptySlotTip')); return; }
        const sk = skillsRef.current.find((k) => k.code === code);
        if (sk && sk.requiredLevel > levelRef.current) { showToast(t('gamescreen.skillLockedToast', { n: sk.requiredLevel })); return; } // 해금 레벨이 안 됐다(서버도 막는다)
        sendSkillRef.current(code);
        return;
      }
    }
    if (!(e.code in KEYS)) return;
    // Ctrl·Alt·Cmd와 함께 누른 키는 단축키다. 이때는 떼는 신호가 오지 않는 브라우저가 있어 이동으로 쓰지 않는다
    if (e.ctrlKey || e.metaKey || e.altKey) { releaseAll(); return; }
    e.preventDefault();
    stopFollow(); // 방향키로 움직이면 자동 따라가기는 멈춘다
    if (pressed.has(e.code)) return; // 길게 눌러 반복되는 신호
    pressed.add(e.code); sendDir();
  };
  const up = (e: KeyboardEvent) => {
    if (e.code === 'Space' && !typing(e)) e.preventDefault(); // 포커스된 버튼이 스페이스로 눌리지 않게
    if (e.key === 'Meta' || e.key === 'Control' || e.key === 'Alt') { releaseAll(); return; }
    if (pressed.delete(e.code)) sendDir();
  };
  const focusIn = (e: FocusEvent) => { if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) releaseAll(); };
  const hidden = () => { if (document.hidden) releaseAll(); };
  window.addEventListener('keydown', down);
  window.addEventListener('keyup', up);
  window.addEventListener('blur', releaseAll);
  window.addEventListener('focusin', focusIn);
  document.addEventListener('visibilitychange', hidden);

  // 겨눈 지점(4.33): PC는 마우스, 모바일은 조이스틱·이동 방향. 겨누지 않았으면 null(서버가 가던 방향으로 쓴다)
  let lastPointer: { x: number; y: number } | null = null;
  const aimPoint = (): { x: number; y: number } | null => {
    if (joy && (joy.dx || joy.dy)) { const me = arena.mePosition(); return { x: me.x + joy.dx * 1000, y: me.y + joy.dy * 1000 }; }
    if (hold && moveTarget) return moveTarget;
    if (lastPointer) return arena.screenToWorld(lastPointer.x, lastPointer.y);
    return null; // 겨누지 않았으면 서버가 가던 방향으로 쓴다
  };

  return {
    aimPoint,
    detach: () => {
  window.removeEventListener('keydown', down);
  window.removeEventListener('keyup', up);
  window.removeEventListener('blur', releaseAll);
  window.removeEventListener('focusin', focusIn);
  document.removeEventListener('visibilitychange', hidden);
  clearInterval(resyncTimer);
  canvas.removeEventListener('pointerdown', pointerDown);
  canvas.removeEventListener('pointermove', pointerMove);
  canvas.removeEventListener('pointerup', pointerEnd);
  canvas.removeEventListener('pointercancel', pointerEnd);
  canvas.removeEventListener('pointerleave', pointerEnd);
  canvas.removeEventListener('contextmenu', noMenu);
  clearInterval(holdTimer);
  clearInterval(followTimer);
  if (pending !== null) clearTimeout(pending);
  if (movePending !== null) clearTimeout(movePending);
    },
  };
}
