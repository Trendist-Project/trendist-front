import { useCallback, useEffect, useRef, useState } from 'react';
import type { Notice, PlayerSummary } from '../api/types';
import { Arena } from '../game/Arena';
import { GameConnection } from '../game/connection';
import type { ChatMessage, OrbResult, ServerMessage } from '../game/protocol';
import { ChatPanel, type ChatLine } from './ChatPanel';
import { GuideModal } from './GuideModal';
import { KeywordModal } from './KeywordModal';
import { startGoogleLogin } from '../googleAuth';
import { adminApi, api } from '../api/client';
import { PlayerInfoModal } from './PlayerInfoModal';
import { Leaderboard } from './Leaderboard';
import { hasUnread, markNoticesRead, NoticeModal, NoticePopup, popupNotices } from './NoticeModal';
import { ProfileModal } from './ProfileModal';
import { ORB_REVEAL_MS, OrbReveal } from './OrbReveal';
import { SidePanel } from './SidePanel';

interface Props {
  initialPlayer: PlayerSummary;
  /** 구글이 연결되지 않은 게스트인지(4.1) */
  guest: boolean;
  onLogout(): void;
  /** 탈퇴를 마쳤다(토큰은 이미 지워졌다). 메인 화면으로 간다 */
  onWithdrawn(): void;
}

const KEYS: Record<string, [number, number]> = {
  ArrowUp: [0, -1], KeyW: [0, -1], ArrowDown: [0, 1], KeyS: [0, 1],
  ArrowLeft: [-1, 0], KeyA: [-1, 0], ArrowRight: [1, 0], KeyD: [1, 0],
};
const KEY_INTERVAL_MS = 16;    // 방향키는 누르고 뗄 때마다 바로 보낸다. 한 프레임(16ms) 안의 변화만 하나로 합친다(4.2)
const CLICK_INTERVAL_MS = 100; // 클릭 이동은 초당 10회까지(4.2). 세밀하게 방향을 바꿀 수 있게
const INPUT_RESYNC_MS = 1000;  // 방향키를 누르고 있는 동안 지금 방향을 다시 보내는 간격(서버와 어긋남 방지)
const CHAT_KEEP = 200;         // 화면에 쌓아 두는 채팅 줄 수
const JOY_RADIUS = 56;         // 조이스틱 판 반지름(px). 이만큼 끌면 최대 속도
const JOY_DEAD = 8;            // 이보다 덜 끌면 멈춘 것으로 본다(손가락 떨림)
const JOY_INTERVAL_MS = 50;    // 조이스틱 방향은 초당 20회까지 보낸다(끄는 동안 계속 바뀌므로 방향키보다 넉넉하게 묶는다)

/** 작은 화면(모바일). 저장된 선택이 없을 때의 기본값을 화면을 덜 가리는 쪽으로 정하는 데 쓴다. */
function isSmallScreen() {
  try { return window.matchMedia('(max-width: 760px)').matches; } catch { return false; }
}

/** 미니맵 켜짐 여부는 이 브라우저에만 기억한다. 저장소를 못 쓰면 기본값(켜짐). */
const MINIMAP_KEY = 'trendist.minimap';
function loadMinimapPref() {
  try { return localStorage.getItem(MINIMAP_KEY) !== '0'; } catch { return true; }
}
function saveMinimapPref(visible: boolean) {
  try { localStorage.setItem(MINIMAP_KEY, visible ? '1' : '0'); } catch { /* 무시 */ }
}

/** 리더보드 켜짐 여부도 이 브라우저에만 기억한다. 기본값은 켜짐, 모바일은 화면을 가리지 않게 꺼짐. */
const LEADERBOARD_KEY = 'trendist.leaderboard';
function loadLeaderboardPref() {
  try { const v = localStorage.getItem(LEADERBOARD_KEY); return v === null ? !isSmallScreen() : v !== '0'; } catch { return !isSmallScreen(); }
}
function saveLeaderboardPref(visible: boolean) {
  try { localStorage.setItem(LEADERBOARD_KEY, visible ? '1' : '0'); } catch { /* 무시 */ }
}

/** 채팅 켜짐·접힘 여부도 이 브라우저에만 기억한다. 기본은 켜짐·펼침. */
const CHAT_KEY = 'trendist.chat';
type ChatView = 'open' | 'collapsed' | 'off';
function loadChatView(): ChatView {
  const fallback: ChatView = isSmallScreen() ? 'collapsed' : 'open'; // 모바일은 처음에 접힌 채로(한 줄 + 입력창)
  try { const v = localStorage.getItem(CHAT_KEY); return v === 'open' || v === 'collapsed' || v === 'off' ? v : fallback; } catch { return fallback; }
}
function saveChatView(v: ChatView) {
  try { localStorage.setItem(CHAT_KEY, v); } catch { /* 무시 */ }
}

/**
 * 모바일(터치) 이동 방식(4.2). 조이스틱: 누른 자리에 조이스틱이 생기고 끄는 방향으로 움직인다(기본).
 * 터치 이동: 누른 지점으로 가고 누르고 있으면 계속 따라간다(마우스 클릭과 같다). 이 브라우저에 기억한다.
 */
const TOUCH_CONTROL_KEY = 'trendist.touchControl';
type TouchControl = 'joystick' | 'tap';
function loadTouchControl(): TouchControl {
  try { return localStorage.getItem(TOUCH_CONTROL_KEY) === 'tap' ? 'tap' : 'joystick'; } catch { return 'joystick'; }
}
function saveTouchControl(v: TouchControl) {
  try { localStorage.setItem(TOUCH_CONTROL_KEY, v); } catch { /* 무시 */ }
}

/** 조작 설명은 처음 들어오면 펼쳐 두고, 접으면 이 브라우저에 기억해서 다음부터는 접힌 채로 시작한다. */
const HELP_KEY = 'trendist.help';
function loadHelpPref() {
  // 모바일은 조작 설명 카드가 화면을 많이 가려서 처음에도 접어 둔다([?]로 펼친다)
  try { const v = localStorage.getItem(HELP_KEY); return v === null ? !isSmallScreen() : v !== '0'; } catch { return !isSmallScreen(); }
}
function saveHelpPref(open: boolean) {
  try { localStorage.setItem(HELP_KEY, open ? '1' : '0'); } catch { /* 무시 */ }
}

export function GameScreen({ initialPlayer, guest, onLogout, onWithdrawn }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const arenaRef = useRef<Arena | null>(null);
  const connRef = useRef<GameConnection | null>(null);
  const [player, setPlayer] = useState(initialPlayer);
  const [online, setOnline] = useState(0);
  const [bots, setBots] = useState(0);
  const [status, setStatus] = useState<'connecting' | 'open' | 'closed'>('connecting');
  const [toast, setToast] = useState<string | null>(null);
  const [hit, setHit] = useState<{ text: string; key: number } | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [showMinimap, setShowMinimap] = useState(loadMinimapPref);
  const [showLeaderboard, setShowLeaderboard] = useState(loadLeaderboardPref);
  const [showHelp, setShowHelp] = useState(loadHelpPref);
  const [panel, setPanel] = useState<'notice' | 'guide' | 'profile' | null>(null);
  const [orbReveal, setOrbReveal] = useState<{ result: OrbResult; key: number } | null>(null);
  const [openKeyword, setOpenKeyword] = useState<number | null>(null);
  const [infoEntity, setInfoEntity] = useState<number | null>(null);
  const [infoBot, setInfoBot] = useState<{ nickname: string; level: number; score: number } | null>(null);
  // 정보 보기 모드(모바일): 켜져 있으면 다음 탭은 이동이 아니라 그 원의 정보를 연다
  const [inspect, setInspect] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false); // 모바일 ☰ 메뉴
  const inspectRef = useRef(false);
  inspectRef.current = inspect;
  const [searchRequest, setSearchRequest] = useState<{ text: string; key: number } | null>(null);
  const [chatLines, setChatLines] = useState<ChatLine[]>([]);
  const [chatView, setChatView] = useState<ChatView>(loadChatView);
  const chatOnRef = useRef(chatView !== 'off');
  chatOnRef.current = chatView !== 'off';
  const chatInputRef = useRef<HTMLInputElement>(null);
  const [touchControl, setTouchControl] = useState<TouchControl>(loadTouchControl);
  const touchControlRef = useRef(touchControl);
  touchControlRef.current = touchControl;
  const joyRef = useRef<HTMLDivElement>(null);
  // 공지(4.16): 들어올 때 아직 안 본 팝업 공지를 띄우고, 목록에서 못 본 새 공지가 있으면 [공지사항]에 빨간 점을 켠다.
  // 게임 중에 올라온 공지는 팝업 없이 점만 켠다(5분마다 다시 읽는다)
  const [noticePopup, setNoticePopup] = useState<Notice[] | null>(null);
  const [noticeDot, setNoticeDot] = useState(false);
  const noticesRef = useRef<Notice[]>([]);
  useEffect(() => {
    let first = true;
    const load = () => api.notices().then((ns) => {
      noticesRef.current = ns;
      setNoticeDot(hasUnread(ns));
      if (first) { const p = popupNotices(ns); if (p.length) setNoticePopup(p); }
      first = false;
    }).catch(() => { /* 다음에 다시 */ });
    load();
    const t = window.setInterval(load, 5 * 60_000);
    return () => clearInterval(t);
  }, []);
  // 관리자 계정이면 관리자 페이지(/admin/, 13절)로 가는 버튼을 보여 준다. 다른 사람에게는 버튼이 없다
  const [isAdmin, setIsAdmin] = useState(false);
  useEffect(() => {
    if (guest) return;
    adminApi.status().then((s) => setIsAdmin(s.admin)).catch(() => setIsAdmin(false));
  }, [guest]);
  const openAdmin = useCallback(() => { window.open('/admin/', '_blank', 'noopener'); }, []);

  // 새 칭호 알림(4.10): 화면 위에 카드로 띄우고 6초 뒤 저절로 사라진다. 한꺼번에 여러 개 받으면 차례로 보여 준다
  const [titleAlerts, setTitleAlerts] = useState<{ name: string; description: string; key: number }[]>([]);
  const titleAlert = titleAlerts[0] ?? null;
  const showTitleAlert = useCallback((name: string, description: string) => {
    setTitleAlerts((q) => [...q, { name, description, key: Date.now() + Math.random() }]);
  }, []);
  const dismissTitleAlert = useCallback(() => setTitleAlerts((q) => q.slice(1)), []);
  useEffect(() => {
    if (!titleAlert) return;
    const t = window.setTimeout(dismissTitleAlert, 6000);
    return () => clearTimeout(t);
  }, [titleAlert, dismissTitleAlert]);
  const [profileView, setProfileView] = useState<'main' | 'titles'>('main');

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast((t) => (t === msg ? null : t)), 3500);
  }, []);

  useEffect(() => {
    const arena = new Arena(canvasRef.current!);
    arenaRef.current = arena;
    arena.start();
    // 서버 방에 들어간 뒤(welcome)부터 끊길 때까지만 이동 입력이 서버에 닿는다. 그 밖의 입력은 예측에도 넣지 않는다
    let ready = false;
    let resyncDir = () => {};
    let myEntity = -1;
    const toLine = (m: ChatMessage): ChatLine => ({ id: m.id, e: m.e, nickname: m.nickname, text: m.text, at: m.at, mine: m.e === myEntity });
    const conn = new GameConnection({
      onSnapshot: (s) => arena.applySnapshot(s),
      onMinimap: (entries) => arena.setMinimap(entries),
      onStatus: (s) => {
        if (s !== 'open') { ready = false; arena.clearControl(); }
        setStatus(s);
      },
      onMessage: (m: ServerMessage) => {
        switch (m.type) {
          case 'welcome':
            arena.setMe(m.entityNo, m.x, m.y);
            myEntity = m.entityNo;
            ready = true;
            resyncDir(); // 다시 연결됐을 때 아직 누르고 있는 방향키가 있으면 서버와 예측에 함께 다시 넣는다
            conn.send({ type: 'ping', t: performance.now() });
            break;
          case 'tuning': arena.setTuning(m); break;
          case 'titleGranted': showTitleAlert(m.name, m.description); break;
          case 'roster': arena.setRoster(m.players); setOnline(m.players.filter((p) => !p.bot).length); setBots(m.players.filter((p) => p.bot).length); break;
          case 'score':
            setPlayer((p) => ({ ...p, currentScore: m.score, exp: m.exp, level: m.level, holdCount: m.holdCount }));
            break;
          case 'pong': arena.updateRtt(performance.now() - m.t); break;
          case 'orbs': arena.setOrbs(m.orbs); break;
          case 'orbSpawn': arena.addOrb(m.id, m.x, m.y); break;
          case 'orbEaten': arena.eatOrb(m.id, m.e); break;
          case 'safeZones': arena.setSafeZones(m.center, m.zones); break;
          case 'orbResult': {
            // 구슬이 원 안으로 빨려 들어간 뒤에 결과 카드를 띄운다
            const key = performance.now();
            window.setTimeout(() => setOrbReveal({ result: m, key }), 250);
            window.setTimeout(() => setOrbReveal((cur) => (cur?.key === key ? null : cur)), 250 + ORB_REVEAL_MS);
            if (m.status === 'GAINED') {
              arena.floatText(`+${m.gained ?? 0}`);
              setRefreshKey((k) => k + 1); // 보관함 목록 새로고침
            }
            break;
          }
          case 'chat':
            arena.showBubble(m.e, m.text);
            setChatLines((lines) => [...lines, toLine(m)].slice(-CHAT_KEEP));
            break;
          case 'chatHistory':
            // 다시 연결되면 최근 채팅이 다시 오므로 번호로 합친다
            setChatLines((lines) => {
              const seen = new Set(lines.map((l) => l.id));
              return [...lines, ...m.messages.filter((x) => !seen.has(x.id)).map(toLine)].sort((a, b) => a.id - b.id).slice(-CHAT_KEEP);
            });
            break;
          case 'chatError': showToast(m.message); break;
          case 'lost':
            // 어떤 키워드를 몇 점짜리로 잃었는지 보여 준다(4.3)
            showToast(m.stolen ? `${m.by}에게 '${m.keyword}' ${m.score}점짜리 키워드를 빼앗겼어요`
              : `${m.by}와 부딪혀 '${m.keyword}' ${m.score}점짜리 키워드를 잃었어요`);
            if (m.score > 0) arena.floatText(`-${m.score}`, '#ff8a8a');
            setRefreshKey((k) => k + 1);
            break;
          case 'hit': {
            // 공격 성공: 상대가 잃은 키워드와 점수를 내 화면에 보여 준다.
            // 사람에게서 이기면 그 키워드를 빼앗는다: 없던 키워드는 보관함에 추가, 이미 있던 키워드는 남은 시간 갱신(4.3)
            // 봇을 이기면 봇의 키워드 대신 무작위 🔥 키워드를 얻는다. 이미 가진 키워드면 남은 시간 갱신(4.21)
            const key = performance.now();
            const text = m.stolen === 'BOT' ? `${m.target}을 이겨 '${m.keyword}' ${m.score}점 키워드를 얻었어요!`
              : m.stolen === 'BOT_RENEWED' ? `${m.target}을 이겨 '${m.keyword}'의 남은 시간을 24시간으로 늘렸어요!`
              : m.stolen === 'ADDED' ? `${m.target}의 '${m.keyword}' ${m.score}점을 빼앗아 보관함에 넣었어요!`
              : m.stolen === 'RENEWED' ? `${m.target}의 '${m.keyword}'를 빼앗아 남은 시간을 24시간으로 늘렸어요!`
              : m.keyword ? `${m.target}의 '${m.keyword}' ${m.score}점을 떨어뜨렸어요!` : `${m.target}을 이겼어요!`;
            setHit({ text, key });
            if (m.stolen) {
              if (m.gained) arena.floatText(`+${m.gained}`);
              setRefreshKey((k) => k + 1); // 보관함 목록 새로고침
            }
            window.setTimeout(() => setHit((h) => (h?.key === key ? null : h)), 3000);
            break;
          }
          case 'shield': arena.showShield(m.e, m.ms); break;
          case 'knock': arena.applyKnock(m.dx, m.dy, m.ms); break;
        }
      },
    });
    connRef.current = conn;
    conn.start();
    // 서버 왕복 시간을 2초마다 잰다(내 원 보정 허용 오차에 쓴다)
    const pingTimer = window.setInterval(() => conn.send({ type: 'ping', t: performance.now() }), 2000);
    // 페이지를 떠날 때(구글 로그인으로 이동, 새로고침, 탭 닫기) 서버에 알려 바로 방에서 빠진다. 닫힘 신호가 늦거나 안 와도 유령으로 남지 않게
    const bye = () => conn.send({ type: 'bye' });
    window.addEventListener('pagehide', bye);

    // 방향키·WASD 입력. 입력창에 쓰는 중이면 무시한다.
    const pressed = new Set<string>();
    let lastSent = 0, pending: number | null = null;
    // 터치 조이스틱(4.2): 누른 자리가 중심이고, 끈 방향·거리가 방향키처럼 서버로 가는 방향(-1~1)이 된다
    let joy: { pointerId: number; ox: number; oy: number; dx: number; dy: number } | null = null;
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
      if (ready && conn.send({ type: 'input', dx, dy })) arena.setInput(dx, dy);
    };
    const sendDir = () => {
      const now = performance.now();
      const interval = joy ? JOY_INTERVAL_MS : KEY_INTERVAL_MS;
      if (now - lastSent >= interval) fire();
      else if (pending === null) pending = window.setTimeout(() => { pending = null; sendDir(); }, interval - (now - lastSent));
    };
    const steering = () => pressed.size > 0 || joy !== null;
    resyncDir = () => { if (steering()) fire(); };
    // 누르고 있는 동안에는 1초마다 지금 방향을 다시 보낸다. 중간에 메시지 하나가 빠져도 서버가 곧 같은 상태로 돌아온다
    const resyncTimer = window.setInterval(() => { if (steering() && pending === null) fire(); }, INPUT_RESYNC_MS);
    // 조이스틱 그림은 React state 대신 직접 옮긴다(끄는 동안 매 프레임 바뀌어서)
    const drawJoy = () => {
      const el = joyRef.current;
      if (!el) return;
      if (!joy) { el.hidden = true; return; }
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
        if (ready && conn.send({ type: 'move', x: moveTarget.x, y: moveTarget.y })) arena.setTarget(moveTarget.x, moveTarget.y);
      } else if (movePending === null) {
        movePending = window.setTimeout(() => { movePending = null; sendMove(); }, CLICK_INTERVAL_MS - (now - lastMoveSent));
      }
    };
    const canvas = canvasRef.current!;
    // 다른 플레이어 정보(4.11): PC는 우클릭, 모바일은 [🔍]을 누른 뒤 원을 탭한다. 왼쪽 클릭·터치·드래그는 언제나 이동이라 겹치지 않는다
    const openInfo = (hit: number) => { setInfoBot(arena.botInfo(hit)); setInfoEntity(hit); };
    // 누르고 있는 동안에는 손가락·마우스가 있는 곳으로 계속 따라간다(4.2). 화면이 같이 움직이므로 가만히 누르고 있어도 주기적으로 다시 찍는다
    let hold: { pointerId: number; x: number; y: number } | null = null;
    const followHold = () => {
      if (!hold || !ready) return;
      moveTarget = arena.screenToWorld(hold.x, hold.y);
      sendMove();
    };
    const holdTimer = window.setInterval(followHold, CLICK_INTERVAL_MS);
    const pointerDown = (e: PointerEvent) => {
      if (e.button !== 0 || !ready) return; // 왼쪽 버튼(터치·펜도 0)
      setMenuOpen(false); // 아레나를 누르면 열린 메뉴는 닫는다
      if (inspectRef.current) {
        // 정보 보기 모드: 이동하지 않고, 누른 원의 정보를 연다. 원이 아닌 곳을 누르면 모드만 끈다
        const hit = arena.entityAt(e.clientX, e.clientY);
        if (hit !== null) openInfo(hit);
        setInspect(false);
        return;
      }
      try { canvas.setPointerCapture(e.pointerId); } catch { /* 이미 뗐다 */ }
      if (e.pointerType === 'touch' && touchControlRef.current === 'joystick') {
        // 조이스틱: 누른 자리에 판이 생기고, 끌기 전까지는 움직이지 않는다. 두 번째 손가락은 무시한다
        if (joy) return;
        hold = null;
        moveTarget = null;
        pressed.clear();
        joy = { pointerId: e.pointerId, ox: e.clientX, oy: e.clientY, dx: 0, dy: 0 };
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
      if (joy && e.pointerId === joy.pointerId) {
        const vx = e.clientX - joy.ox, vy = e.clientY - joy.oy, d = Math.hypot(vx, vy);
        // 판 반지름만큼 끌면 최대 속도. 소수 둘째 자리로 묶어 같은 방향을 거듭 보내지 않는다
        const k = d < JOY_DEAD ? 0 : Math.min(d, JOY_RADIUS) / JOY_RADIUS / d;
        const dx = Math.round(vx * k * 100) / 100, dy = Math.round(vy * k * 100) / 100;
        if (dx === joy.dx && dy === joy.dy) return;
        joy.dx = dx; joy.dy = dy;
        drawJoy();
        sendDir();
        return;
      }
      if (hold && e.pointerId === hold.pointerId) { hold.x = e.clientX; hold.y = e.clientY; followHold(); }
    };
    const pointerEnd = (e: PointerEvent) => {
      if (joy && e.pointerId === joy.pointerId) { endJoy(); sendDir(); return; } // 떼면 그 자리에서 감속해 멈춘다
      if (hold && e.pointerId === hold.pointerId) hold = null;
    };
    // 우클릭: 브라우저 메뉴 대신 그 자리 원의 정보. 모바일의 길게 누르기 메뉴도 막는다
    const noMenu = (e: MouseEvent) => {
      e.preventDefault();
      if (!ready) return;
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
      // M: 미니맵, L: 리더보드, C: 채팅 켜기/끄기. 한글 입력 상태(ㅡ, ㅣ, ㅊ)에서도 되도록 key가 아니라 code로 본다.
      // Ctrl·Cmd와 함께 누른 C(복사)는 단축키로 쓰지 않는다
      if ((e.code === 'KeyM' || e.code === 'KeyL' || e.code === 'KeyC') && !e.repeat && !e.ctrlKey && !e.metaKey && !e.altKey) {
        if (e.code === 'KeyC') setChatView((v) => (v === 'off' ? 'open' : 'off'));
        else (e.code === 'KeyM' ? setShowMinimap : setShowLeaderboard)((v) => !v);
        return;
      }
      if (!(e.code in KEYS)) return;
      // Ctrl·Alt·Cmd와 함께 누른 키는 단축키다. 이때는 떼는 신호가 오지 않는 브라우저가 있어 이동으로 쓰지 않는다
      if (e.ctrlKey || e.metaKey || e.altKey) { releaseAll(); return; }
      e.preventDefault();
      if (pressed.has(e.code)) return; // 길게 눌러 반복되는 신호
      pressed.add(e.code); sendDir();
    };
    const up = (e: KeyboardEvent) => {
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
    return () => {
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
      if (pending !== null) clearTimeout(pending);
      if (movePending !== null) clearTimeout(movePending);
      clearInterval(pingTimer);
      window.removeEventListener('pagehide', bye);
      bye(); // 로그아웃 등으로 게임 화면을 나갈 때도
      conn.stop();
      arena.stop();
    };
  }, [showToast]);

  useEffect(() => {
    arenaRef.current?.setMinimapVisible(showMinimap);
    saveMinimapPref(showMinimap);
  }, [showMinimap]);

  useEffect(() => { saveLeaderboardPref(showLeaderboard); }, [showLeaderboard]);
  useEffect(() => {
    arenaRef.current?.setBubblesVisible(chatView !== 'off');
    saveChatView(chatView);
  }, [chatView]);
  useEffect(() => { saveHelpPref(showHelp); }, [showHelp]);
  useEffect(() => { saveTouchControl(touchControl); }, [touchControl]);
  const toggleTouchControl = useCallback(() => setTouchControl((v) => (v === 'joystick' ? 'tap' : 'joystick')), []);
  const touchControlLabel = touchControl === 'joystick' ? '조이스틱' : '터치 이동';
  const closePanel = useCallback(() => { setPanel(null); setProfileView('main'); }, []);


  const onPlused = useCallback((gained: number, p: PlayerSummary) => {
    setPlayer(p);
    if (gained > 0) arenaRef.current?.floatText(`+${gained}`);
  }, []);
  // 키워드 상세 창에서 +하면 보관함도 새로 읽는다
  const onPlusedInModal = useCallback((gained: number, p: PlayerSummary) => {
    onPlused(gained, p);
    setRefreshKey((k) => k + 1);
  }, [onPlused]);
  const sendChat = useCallback((text: string) => { connRef.current?.send({ type: 'chat', text }); }, []);
  // 키워드 상세 창의 [공유]: 채팅에 #키워드로 바로 보낸다. 채팅 태그는 공백 없는 글자만 이어지므로 공백을 뺀다
  // (검색은 공백을 무시하므로 누른 사람도 같은 키워드를 찾는다, 4.18). 채팅을 꺼 두었으면 켠다
  const shareKeyword = useCallback((text: string) => {
    const tag = `#${text.replace(/\s+/g, '')}`;
    if (!connRef.current?.send({ type: 'chat', text: tag })) { showToast('연결된 뒤에 다시 공유해 주세요'); return; }
    setChatView((v) => (v === 'off' ? 'open' : v));
  }, [showToast]);
  const searchKeyword = useCallback((text: string) => setSearchRequest({ text, key: performance.now() }), []);
  const closeKeyword = useCallback(() => setOpenKeyword(null), []);

  return (
    <div className="game">
      <div className={showMinimap ? 'arena-wrap with-minimap' : 'arena-wrap'}>
        <canvas ref={canvasRef} className="arena"
                aria-label="아레나. 방향키나 WASD로 이동하고 빈 바닥을 클릭하면 그곳으로 이동해요" />
        <div className="hud">
          {/* 모바일은 짧게(👥 3 · 🤖 7), PC는 글자로 */}
          <span className="hud-online" aria-label={`현재 접속 ${online}명${bots > 0 ? `, 봇 ${bots}` : ''}`}>
            <span className="hud-long">현재 접속 {online}명</span><span className="hud-short">👥 {online}</span>
            {bots > 0 && <span className="muted"><span className="hud-long"> · 봇 {bots}</span><span className="hud-short"> · 🤖 {bots}</span></span>}
          </span>
          {status !== 'open' && <span className="warn">{status === 'connecting' ? '연결 중…' : '연결이 끊겼어요. 다시 연결하는 중…'}</span>}
        </div>
        <div className="hud-bottom">
          <button className="hud-name" onClick={() => setPanel('profile')} title="내 정보">{player.nickname}</button>
          <span>내 유행도 {Number(player.currentScore).toLocaleString()}</span>
          <span>🐢 {player.level}레벨</span>
          <span className="muted hud-extra">EXP {player.exp}{player.nextLevelExp > 0 ? ` / ${player.nextLevelExp}` : ''}</span>
          <span className="muted hud-extra">키워드 {player.holdCount}개</span>
        </div>
        <div className="arena-tools">
          <div className="tool-row">
            {/* 모바일은 글자를 숨기고 아이콘만 보인다(.tool-label) */}
            {guest ? (
              // 누르면 바로 구글 계정 선택 페이지로(매번 계정을 고른다). 돌아오면 지금 기록에 연결된 채로 다시 게임에 들어온다
              <button className="login-toggle" onClick={startGoogleLogin} aria-label="Google로 로그인" title="Google로 로그인">
                🔑 <span className="tool-label">로그인</span>
              </button>
            ) : (
              // 로그아웃: 서버가 갱신 토큰과 JWT를 무효로 하고 시작 화면으로 돌아간다
              <button className="logout-toggle" onClick={onLogout} aria-label="로그아웃" title="로그아웃">
                🚪 <span className="tool-label">로그아웃</span>
              </button>
            )}
            <button onClick={() => setPanel('profile')} aria-label="내 정보">👤 <span className="tool-label">내 정보</span></button>
            {isAdmin && <button onClick={openAdmin} aria-label="관리자 페이지" title="관리자 페이지(새 탭)">🛠 <span className="tool-label">관리자</span></button>}
            <button className="notice-toggle-button" onClick={() => setPanel('notice')} aria-label={noticeDot ? '공지사항(새 공지 있음)' : '공지사항'}>
              📢 <span className="tool-label">공지사항</span>{noticeDot && <span className="dot-badge" aria-hidden="true" />}
            </button>
            <button onClick={() => setPanel('guide')} aria-label="가이드·FAQ">📖 <span className="tool-label">가이드·FAQ</span></button>
            <button className="minimap-toggle" aria-label="미니맵" aria-pressed={showMinimap} onClick={() => setShowMinimap((v) => !v)}
                    title="미니맵 켜기/끄기 (M)">🗺 <span className="tool-label">미니맵</span> <kbd>M</kbd></button>
            <button className="leaderboard-toggle" aria-label="리더보드" aria-pressed={showLeaderboard} onClick={() => setShowLeaderboard((v) => !v)}
                    title="리더보드 켜기/끄기 (L)">🏆 <span className="tool-label">리더보드</span> <kbd>L</kbd></button>
            <button className="inspect-toggle" aria-label="다른 플레이어 정보 보기" aria-pressed={inspect}
                    onClick={() => setInspect((v) => !v)} title="누른 뒤 원을 탭하면 그 사람 정보를 봐요">🔍</button>
            <button className="control-toggle" aria-label={`이동 방식: ${touchControlLabel}`} onClick={toggleTouchControl}
                    title="터치 이동 방식 바꾸기(조이스틱 / 터치 이동)">{touchControl === 'joystick' ? '🕹' : '👆'} <span className="tool-label">{touchControlLabel}</span></button>
            <button className="chat-toggle" aria-label="채팅" aria-pressed={chatView !== 'off'} onClick={() => setChatView((v) => (v === 'off' ? 'open' : 'off'))}
                    title="채팅 켜기/끄기 (C)">💬 <span className="tool-label">채팅</span> <kbd>C</kbd></button>
            <button className="icon-button help-toggle" aria-expanded={showHelp} aria-controls="controls-help"
                    onClick={() => setShowHelp((v) => !v)} title={showHelp ? '조작 설명 접기' : '조작 설명 보기'}
                    aria-label={showHelp ? '조작 설명 접기' : '조작 설명 보기'}>?</button>
            {/* 모바일: 위 버튼들은 숨기고(🔍만 남김) 이 메뉴에 이름과 함께 모은다 */}
            <button className="menu-toggle" aria-label={noticeDot ? '메뉴(새 공지 있음)' : '메뉴'} aria-expanded={menuOpen} aria-controls="mobile-menu"
                    onClick={() => setMenuOpen((v) => !v)}>{menuOpen ? '✕' : '☰'}{noticeDot && !menuOpen && <span className="dot-badge" aria-hidden="true" />}</button>
          </div>
          {menuOpen && (
            <nav id="mobile-menu" className="mobile-menu" aria-label="메뉴">
              {([
                ['👤', '내 정보', () => setPanel('profile')],
                ['📢', '공지사항', () => setPanel('notice')],
                ['📖', '가이드·FAQ', () => setPanel('guide')],
              ] as const).map(([icon, label, act]) => (
                <button key={label} onClick={() => { setMenuOpen(false); act(); }}>
                  <span aria-hidden="true">{icon}</span>{label}{label === '공지사항' && noticeDot && <span className="dot-badge inline" aria-hidden="true" />}
                </button>
              ))}
              <div className="mobile-menu-sep" />
              {([
                ['🗺', '미니맵', showMinimap, () => setShowMinimap((v) => !v)],
                ['🏆', '리더보드', showLeaderboard, () => setShowLeaderboard((v) => !v)],
                ['💬', '채팅', chatView !== 'off', () => setChatView((v) => (v === 'off' ? 'open' : 'off'))],
                ['❔', '조작 설명', showHelp, () => setShowHelp((v) => !v)],
              ] as const).map(([icon, label, on, act]) => (
                <button key={label} role="menuitemcheckbox" aria-checked={on} onClick={() => { setMenuOpen(false); act(); }}>
                  <span aria-hidden="true">{icon}</span>{label}<span className={on ? 'menu-state on' : 'menu-state'}>{on ? '켜짐' : '꺼짐'}</span>
                </button>
              ))}
              <button onClick={() => { setMenuOpen(false); toggleTouchControl(); }}>
                <span aria-hidden="true">{touchControl === 'joystick' ? '🕹' : '👆'}</span>이동 방식<span className="menu-state on">{touchControlLabel}</span>
              </button>
              {isAdmin && <button onClick={() => { setMenuOpen(false); openAdmin(); }}><span aria-hidden="true">🛠</span>관리자 페이지</button>}
              <div className="mobile-menu-sep" />
              {guest
                ? <button className="menu-login" onClick={() => { setMenuOpen(false); startGoogleLogin(); }}><span aria-hidden="true">🔑</span>Google로 로그인</button>
                : <button onClick={() => { setMenuOpen(false); onLogout(); }}><span aria-hidden="true">🚪</span>로그아웃</button>}
            </nav>
          )}
          {showLeaderboard && <Leaderboard myPlayerId={player.id} />}
          {showHelp && (
            <section id="controls-help" className="help-card" aria-label="조작 설명">
              <h3>이렇게 놀아요</h3>
              <ul>
                <li><strong>클릭</strong> 빈 바닥을 누르면 그곳으로 가요. 누르고 있으면 계속 따라가요.</li>
                <li><strong>모바일</strong> 누른 자리에 생기는 조이스틱을 끌어서 움직여요. 메뉴의 [이동 방식]에서 누른 곳으로 가는 터치 이동으로 바꿀 수 있어요.</li>
                <li><strong>다른 사람 정보</strong> PC는 그 원을 우클릭, 모바일은 [🔍]을 누른 뒤 원을 탭해요. </li>
                <li><strong>방향키·WASD</strong> 누르는 방향으로 움직여요.</li>
                <li><strong>세이프존</strong> 파란 칸(가운데, 항상 있음)과 연두색 칸(5분 동안) 안에서는 부딪히지 않고 키워드도 잃지 않아요.</li>
                <li><strong>검색 → 추가</strong> 뜨는 키워드를 찾아 추가하면 내 원이 커져요.</li>
                <li><strong>M</strong> 미니맵을 켜고 꺼요.</li>
                <li><strong>L</strong> 리더보드(접속 중인 사람 순위)를 켜고 꺼요.</li>
                <li><strong>Enter</strong> 채팅을 써요. Esc를 누르면 다시 움직여요. ▾로 접고, C로 끄고 켤 수 있어요.</li>
              </ul>
              <div className="help-actions">
                <button onClick={() => setPanel('guide')}>가이드 더 보기</button>
                <button onClick={() => setShowHelp(false)}>접기</button>
              </div>
            </section>
          )}
        </div>
        {chatView !== 'off' && (
          <ChatPanel ref={chatInputRef} lines={chatLines} disabled={status !== 'open'} onSend={sendChat} onKeyword={searchKeyword}
                     onNotice={showToast} collapsed={chatView === 'collapsed'}
                     onToggleCollapsed={() => setChatView((v) => (v === 'collapsed' ? 'open' : 'collapsed'))} />
        )}
        <div ref={joyRef} className="joystick" hidden aria-hidden="true"><div className="joystick-knob" /></div>
        {inspect && <div className="inspect-hint" role="status">정보를 볼 원을 누르세요 · 빈 곳을 누르면 취소</div>}
        {toast && <div className="toast" role="status">{toast}</div>}
        {titleAlert && (
          <div key={titleAlert.key} className="title-alert" role="status" aria-live="polite">
            <span className="title-alert-icon" aria-hidden="true">🏅</span>
            <div className="title-alert-text">
              <span className="title-alert-kicker">새 칭호를 받았어요!</span>
              <strong>{titleAlert.name}</strong>
              <span className="muted small">{titleAlert.description}</span>
            </div>
            <div className="title-alert-actions">
              <button className="primary" onClick={() => { dismissTitleAlert(); setProfileView('titles'); setPanel('profile'); }}>칭호 보기</button>
              <button className="icon-button" onClick={dismissTitleAlert} aria-label="알림 닫기">✕</button>
            </div>
            <span className="title-alert-timer" aria-hidden="true" />
          </div>
        )}
        {hit && <div key={hit.key} className="toast hit-toast" role="status">🎯 {hit.text}</div>}
        {orbReveal && <OrbReveal key={orbReveal.key} result={orbReveal.result} />}
      </div>
      <SidePanel onPlused={onPlused} refreshKey={refreshKey} onError={showToast}
                 onOpenKeyword={setOpenKeyword} searchRequest={searchRequest} />
      {infoEntity !== null && (
        <PlayerInfoModal entityNo={infoEntity} bot={infoBot} onClose={() => setInfoEntity(null)}
                         onOpenKeyword={(id) => { setInfoEntity(null); setOpenKeyword(id); }} onNotice={showToast} />
      )}
      {openKeyword !== null && (
        <KeywordModal keywordId={openKeyword} onClose={closeKeyword} onPlused={onPlusedInModal} onError={showToast} onShare={shareKeyword} />
      )}
      {panel === 'notice' && <NoticeModal onClose={closePanel} onRead={() => setNoticeDot(false)} />}
      {noticePopup && panel === null && (
        // 팝업으로 본 공지는 목록에서도 읽은 것으로 친다
        <NoticePopup notices={noticePopup} onClose={() => {
          markNoticesRead(noticePopup); setNoticeDot(hasUnread(noticesRef.current)); setNoticePopup(null);
        }} />
      )}
      {panel === 'guide' && <GuideModal onClose={closePanel} />}
      {panel === 'profile' && (
        <ProfileModal key={profileView} player={player} onChanged={setPlayer} onClose={closePanel} guest={guest}
                      onLogout={onLogout} onWithdrawn={onWithdrawn} initialView={profileView} />
      )}

    </div>
  );
}
