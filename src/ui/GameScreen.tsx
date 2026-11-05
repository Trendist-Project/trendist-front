import { useCallback, useEffect, useRef, useState } from 'react';
import type { Notice, PlayerSummary } from '../api/types';
import { Arena } from '../game/Arena';
import { GameConnection } from '../game/connection';
import type { ChatMessage, OrbResult, ServerMessage } from '../game/protocol';
import { ChatPanel, type ChatLine } from './ChatPanel';
import { GuideModal } from './GuideModal';
import { KeywordModal } from './KeywordModal';
import { startGoogleLogin } from '../googleAuth';
import { adminApi, api, ApiFailure } from '../api/client';
import { PlayerInfoModal } from './PlayerInfoModal';
import { Leaderboard } from './Leaderboard';
import { hasUnread, markNoticesRead, NoticeModal, NoticePopup, popupNotices } from './NoticeModal';
import { ProfileModal } from './ProfileModal';
import { ORB_REVEAL_MS, OrbReveal } from './OrbReveal';
import { SidePanel } from './SidePanel';
import { LevelText } from './LevelText';
import { DashChip, type DashState } from './DashChip';
import { EMOTES } from '../game/skin';
import { successToast } from './toast';
import { EmergencyBar, emergencyText, useEmergency } from './EmergencyBar';
import { fmtNumber, t } from '../i18n';

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
const DASH_HINT_KEY = 'trendist.dashHint'; // 대시 사용법 안내를 이미 보여 줬는지
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
  const { notice: emergency, apply: applyEmergency } = useEmergency(); // 긴급 안내(4.29): 맨 위 한 줄. 서버 알림은 apply로 바로 반영
  const [bots, setBots] = useState(0);
  const [status, setStatus] = useState<'connecting' | 'open' | 'closed'>('connecting');
  const [toast, setToast] = useState<string | null>(null);
  const [kicked, setKicked] = useState<string | null>(null); // 관리자가 내보냄(13.10)
  const [myCombo, setMyCombo] = useState<{ combo: number; flameAt: number; key: number }>({ combo: 0, flameAt: 5, key: 0 }); // 4.25
  const [emoteOpen, setEmoteOpen] = useState(false); // 이모트 고르기(4.26)
  const emoteOpenRef = useRef(false); // 키 입력 처리(한 번만 등록)에서 최신 값을 본다
  emoteOpenRef.current = emoteOpen;
  const sendEmoteRef = useRef<(code: string) => void>(() => {});
  const [hit, setHit] = useState<{ text: string; key: number } | null>(null);
  const [dash, setDash] = useState<DashState | null>(null); // 대시 남은 시간·쿨타임(4.27)
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
  const [titleAlerts, setTitleAlerts] = useState<{ titleId: number; name: string; description: string; key: number }[]>([]);
  const titleAlert = titleAlerts[0] ?? null;
  const showTitleAlert = useCallback((titleId: number, name: string, description: string) => {
    setTitleAlerts((q) => [...q, { titleId, name, description, key: Date.now() + Math.random() }]);
  }, []);
  const dismissTitleAlert = useCallback(() => setTitleAlerts((q) => q.slice(1)), []);
  useEffect(() => {
    if (!titleAlert) return;
    const t = window.setTimeout(dismissTitleAlert, 6000);
    return () => clearTimeout(t);
  }, [titleAlert, dismissTitleAlert]);
  const [profileView, setProfileView] = useState<'main' | 'titles'>('main');
  /** 알림의 [장착하기]: 받은 칭호를 바로 활성 칭호로 바꾼다(4.10). 이름표 아래 칭호는 서버가 방에 알려 바뀐다 */
  const equipTitle = useCallback(async (titleId: number, name: string) => {
    dismissTitleAlert();
    try {
      await api.setTitle(titleId);
      successToast(t('gamescreen.equipped', { name }));
    } catch (e) {
      showToast(e instanceof ApiFailure ? e.message : t('gamescreen.equipFailed'));
    }
  }, [dismissTitleAlert]);

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
          case 'emergency': applyEmergency(m.notice); break;
          case 'titleGranted': showTitleAlert(m.titleId, m.name, m.description); break;
          case 'roster': arena.setRoster(m.players, m.flameAt); setOnline(m.players.filter((p) => !p.bot).length); setBots(m.players.filter((p) => p.bot).length); break;
          case 'score':
            setPlayer((p) => ({ ...p, currentScore: m.score, exp: m.exp, level: m.level, holdCount: m.holdCount }));
            break;
          case 'pong': arena.updateRtt(performance.now() - m.t); break;
          case 'orbs': arena.setOrbs(m.orbs); break;
          case 'orbSpawn': arena.addOrb(m.id, m.x, m.y, m.prize); break;
          case 'orbEaten': arena.eatOrb(m.id, m.e); break;
          case 'safeZones': arena.setSafeZones(m.center, m.zones); break;
          case 'orbResult': {
            // 구슬이 원 안으로 빨려 들어간 뒤에 결과 카드를 띄운다
            const key = performance.now();
            window.setTimeout(() => setOrbReveal({ result: m, key }), 250);
            window.setTimeout(() => setOrbReveal((cur) => (cur?.key === key ? null : cur)), 250 + ORB_REVEAL_MS);
            if (m.status === 'GAINED') arena.floatText(`+${m.gained ?? 0}`);
            if (m.status === 'LOST' && m.gained) arena.floatText(`-${m.gained}`);
            if (m.status === 'GAINED' || m.status === 'RENEWED' || m.status === 'LOST') setRefreshKey((k) => k + 1); // 보관함 목록 새로고침(새 키워드, 또는 바뀐 만료 시각)
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
          case 'kicked': conn.stop(); setKicked(m.message); break;
          case 'emote': arena.showEmote(m.e, m.code); break;
          case 'combo': {
            // 연속 빼앗기 콤보와 불꽃(4.25). 콤보 수는 화면 위 카드로만 보이고, 원 위로 떠오르는 글자는 띄우지 않는다(점수 글자와 겹치지 않게)
            arena.setCombo(m.e, m.combo, m.flameAt);
            const mine = m.e === myEntity;
            if (mine) setMyCombo((c) => ({ combo: m.combo, flameAt: m.flameAt, key: c.key + (m.event === 'up' || m.event === 'start' ? 1 : 0) }));
            // 다른 사람이 불꽃을 얻었다는 안내는 띄우지 않는다(불꽃은 그 원 둘레로 보인다)
            if (m.event === 'broken') {
              if (mine) showToast(t('gamescreen.flameOut', { by: m.by ?? t('gamescreen.someone') }));
            }
            break;
          }
          case 'lost':
            // 어떤 키워드를 몇 점짜리로 잃었는지 보여 준다(4.3)
            showToast(m.wiped ? t('gamescreen.lostWiped', { n: m.wiped })
              : m.stolen ? t('gamescreen.lostStolen', { by: m.by ?? '', kw: m.keyword ?? '', score: m.score })
              : t('gamescreen.lostHit', { by: m.by ?? '', kw: m.keyword ?? '', score: m.score }));
            if (m.score > 0) arena.floatText(`-${m.score}`, '#ff8a8a');
            setRefreshKey((k) => k + 1);
            break;
          case 'hit': {
            // 공격 성공: 상대가 잃은 키워드와 점수를 내 화면에 보여 준다.
            // 사람에게서 이기면 그 키워드를 빼앗는다: 없던 키워드는 보관함에 추가, 이미 있던 키워드는 남은 시간 갱신(4.3)
            // 봇을 이기면 봇의 키워드 대신 무작위 🔥 키워드를 얻는다. 이미 가진 키워드면 남은 시간 갱신(4.21)
            const key = performance.now();
            const hp = { target: m.target ?? '', kw: m.keyword ?? '', score: m.score ?? 0, n: m.wiped ?? 0 };
            const text = m.wiped ? t('gamescreen.hitWiped', hp)
              : m.stolen === 'BOT' ? t('gamescreen.hitBot', hp)
              : m.stolen === 'BOT_RENEWED' ? t('gamescreen.hitBotRenewed', hp)
              : m.stolen === 'ADDED' ? t('gamescreen.hitAdded', hp)
              : m.stolen === 'RENEWED' ? t('gamescreen.hitRenewed', hp)
              : m.keyword ? t('gamescreen.hitDropped', hp) : t('gamescreen.hitWon', hp);
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
          case 'dashFx': arena.showDashFx(m.e, m.ms); break; // 누군가 대시를 시작했다: 그 원에 강조 효과(4.27)
          case 'dash': {
            // 대시 시작(4.27): 예측을 같은 속도로 올리고 아래 표시줄에 남은 시간·쿨타임을 보여 준다
            arena.startDash(m.ms, m.mult);
            const t = performance.now();
            setDash({ until: t + m.ms, readyAt: t + m.cooldownMs });
            break;
          }
        }
      },
    });
    connRef.current = conn;
    sendEmoteRef.current = (code: string) => { if (ready) conn.send({ type: 'emote', code }); };
    // 대시(4.27): 쿨타임·움직이는 중인지는 서버가 보고, 시작하면 {type: 'dash'}로 알려 온다
    const sendDash = () => { if (ready) conn.send({ type: 'dash' }); };
    conn.start();
    // 터치 기기에는 대시 방법을 처음 한 번만 알려 준다(조이스틱을 쥔 채 다른 손가락 탭)
    let dashHint: number | null = null;
    try {
      if (window.matchMedia('(pointer: coarse)').matches && !localStorage.getItem(DASH_HINT_KEY)) {
        dashHint = window.setTimeout(() => { showToast(t('gamescreen.dashHint')); try { localStorage.setItem(DASH_HINT_KEY, '1'); } catch { /* 저장 못 해도 된다 */ } }, 5000);
      }
    } catch { /* 저장소를 못 쓰면 안내만 건너뛴다 */ }
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
      // 이미 한 손가락으로 조이스틱(또는 터치 이동)을 쥐고 있을 때 다른 손가락으로 화면 어디든 탭하면 대시(4.27). 오른손·왼손 어느 쪽이든 쓸 수 있다
      if (e.pointerType === 'touch' && (joy || hold)) { sendDash(); return; }
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
      // 스페이스바: 대시(4.27). 쿨타임과 움직이는 중인지는 서버가 본다. 버튼에 포커스가 있어도 눌리지 않게 막는다
      if (e.code === 'Space') {
        if (!e.ctrlKey && !e.metaKey && !e.altKey) { e.preventDefault(); if (!e.repeat) sendDash(); }
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
      if (dashHint !== null) window.clearTimeout(dashHint);
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
  const touchControlLabel = touchControl === 'joystick' ? t('gamescreen.joystick') : t('gamescreen.tapMove');
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
    if (!connRef.current?.send({ type: 'chat', text: tag })) { showToast(t('gamescreen.shareAfterConnect')); return; }
    setChatView((v) => (v === 'off' ? 'open' : v));
  }, [showToast]);
  const searchKeyword = useCallback((text: string) => setSearchRequest({ text, key: performance.now() }), []);
  const closeKeyword = useCallback(() => setOpenKeyword(null), []);

  return (
    <div className="game-shell">
      {emergency && <EmergencyBar text={emergencyText(emergency)} />}
    <div className="game">
      {kicked && (
        <div className="modal-backdrop kicked-backdrop" role="alertdialog" aria-labelledby="kicked-title">
          <div className="modal kicked-box">
            <h2 id="kicked-title">{t('gamescreen.kickedTitle')}</h2>
            <p>{kicked}</p>
            <button className="primary" onClick={() => { location.href = '/'; }}>{t('gamescreen.toStart')}</button>
          </div>
        </div>
      )}
      <div className={showMinimap ? 'arena-wrap with-minimap' : 'arena-wrap'}>
        <canvas ref={canvasRef} className="arena"
                aria-label={t('gamescreen.arenaAria')} />
        <div className="hud">
          {/* 모바일은 짧게(👥 3 · 🤖 7), PC는 글자로 */}
          <span className="hud-online" aria-label={bots > 0 ? t('gamescreen.onlineAriaBots', { online, bots }) : t('gamescreen.onlineAria', { online })}>
            <span className="hud-long">{t('gamescreen.onlineLong', { online })}</span><span className="hud-short">👥 {online}</span>
            {bots > 0 && <span className="muted"><span className="hud-long">{t('gamescreen.botsLong', { bots })}</span><span className="hud-short"> · 🤖 {bots}</span></span>}
          </span>
          {status !== 'open' && <span className="warn">{status === 'connecting' ? t('gamescreen.connecting') : t('gamescreen.reconnecting')}</span>}
        </div>
        <div className="emote-dock">
          {emoteOpen && (
            <div className="emote-palette" role="menu" aria-label={t('gamescreen.emote')}>
              {EMOTES.map(([code, ch, label], i) => (
                <button key={code} role="menuitem" title={`${label} (${i + 1})`} aria-label={label}
                        onClick={() => { sendEmoteRef.current(code); setEmoteOpen(false); }}>{ch}<kbd>{i + 1}</kbd></button>
              ))}
            </div>
          )}
          <div className="emote-row">
            <DashChip dash={dash} />
            <button className="emote-toggle" aria-expanded={emoteOpen} aria-label={t('gamescreen.emote')} title={t('gamescreen.emoteTitle')} onClick={() => setEmoteOpen((v) => !v)}>😀</button>
          </div>
        </div>
        <div className="hud-bottom">
          <span><LevelText level={player.level} prefix="Lv." /></span>
          <button className="hud-name" onClick={() => setPanel('profile')} title={t('gamescreen.myInfo')}>{player.nickname}</button>
          <span>{t('gamescreen.score', { n: fmtNumber(Number(player.currentScore)) })}</span>
          <span className="muted hud-extra">EXP {player.exp}{player.nextLevelExp > 0 ? ` / ${player.nextLevelExp}` : ''}</span>
          <span className="muted hud-extra">{t('gamescreen.keywordCount', { n: player.holdCount })}</span>
        </div>
        <div className="arena-tools">
          <div className="tool-row">
            {/* 모바일은 글자를 숨기고 아이콘만 보인다(.tool-label) */}
            {guest ? (
              // 누르면 바로 구글 계정 선택 페이지로(매번 계정을 고른다). 돌아오면 지금 기록에 연결된 채로 다시 게임에 들어온다
              <button className="login-toggle" onClick={startGoogleLogin} aria-label={t('gamescreen.loginGoogle')} title={t('gamescreen.loginGoogle')}>
                🔑 <span className="tool-label">{t('gamescreen.login')}</span>
              </button>
            ) : (
              // 로그아웃: 서버가 갱신 토큰과 JWT를 무효로 하고 시작 화면으로 돌아간다
              <button className="logout-toggle" onClick={onLogout} aria-label={t('gamescreen.logout')} title={t('gamescreen.logout')}>
                🚪 <span className="tool-label">{t('gamescreen.logout')}</span>
              </button>
            )}
            <button onClick={() => setPanel('profile')} aria-label={t('gamescreen.myInfo')}>👤 <span className="tool-label">{t('gamescreen.myInfo')}</span></button>
            {isAdmin && <button onClick={openAdmin} aria-label={t('gamescreen.adminPage')} title={t('gamescreen.adminTitle')}>🛠 <span className="tool-label">{t('gamescreen.admin')}</span></button>}
            <button className="notice-toggle-button" onClick={() => setPanel('notice')} aria-label={noticeDot ? t('gamescreen.noticesAriaNew') : t('gamescreen.notices')}>
              📢 <span className="tool-label">{t('gamescreen.notices')}</span>{noticeDot && <span className="dot-badge" aria-hidden="true" />}
            </button>
            <button onClick={() => setPanel('guide')} aria-label={t('gamescreen.guide')}>📖 <span className="tool-label">{t('gamescreen.guide')}</span></button>
            <button className="minimap-toggle" aria-label={t('gamescreen.minimap')} aria-pressed={showMinimap} onClick={() => setShowMinimap((v) => !v)}
                    title={t('gamescreen.minimapTitle')}>🗺 <span className="tool-label">{t('gamescreen.minimap')}</span> <kbd>M</kbd></button>
            <button className="leaderboard-toggle" aria-label={t('gamescreen.leaderboard')} aria-pressed={showLeaderboard} onClick={() => setShowLeaderboard((v) => !v)}
                    title={t('gamescreen.leaderboardTitle')}>🏆 <span className="tool-label">{t('gamescreen.leaderboard')}</span> <kbd>L</kbd></button>
            <button className="inspect-toggle" aria-label={t('gamescreen.inspectAria')} aria-pressed={inspect}
                    onClick={() => setInspect((v) => !v)} title={t('gamescreen.inspectTitle')}>🔍</button>
            <button className="control-toggle" aria-label={t('gamescreen.moveMode', { label: touchControlLabel })} onClick={toggleTouchControl}
                    title={t('gamescreen.moveModeTitle')}>{touchControl === 'joystick' ? '🕹' : '👆'} <span className="tool-label">{touchControlLabel}</span></button>
            <button className="chat-toggle" aria-label={t('gamescreen.chat')} aria-pressed={chatView !== 'off'} onClick={() => setChatView((v) => (v === 'off' ? 'open' : 'off'))}
                    title={t('gamescreen.chatTitle')}>💬 <span className="tool-label">{t('gamescreen.chat')}</span> <kbd>C</kbd></button>
            <button className="icon-button help-toggle" aria-expanded={showHelp} aria-controls="controls-help"
                    onClick={() => setShowHelp((v) => !v)} title={showHelp ? t('gamescreen.helpClose') : t('gamescreen.helpOpen')}
                    aria-label={showHelp ? t('gamescreen.helpClose') : t('gamescreen.helpOpen')}>?</button>
            {/* 모바일: 위 버튼들은 숨기고(🔍만 남김) 이 메뉴에 이름과 함께 모은다 */}
            <button className="menu-toggle" aria-label={noticeDot ? t('gamescreen.menuAriaNew') : t('gamescreen.menu')} aria-expanded={menuOpen} aria-controls="mobile-menu"
                    onClick={() => setMenuOpen((v) => !v)}>{menuOpen ? '✕' : '☰'}{noticeDot && !menuOpen && <span className="dot-badge" aria-hidden="true" />}</button>
          </div>
          {menuOpen && (
            <nav id="mobile-menu" className="mobile-menu" aria-label={t('gamescreen.menu')}>
              {([
                ['👤', t('gamescreen.myInfo'), () => setPanel('profile')],
                ['📢', t('gamescreen.notices'), () => setPanel('notice')],
                ['📖', t('gamescreen.guide'), () => setPanel('guide')],
              ] as const).map(([icon, label, act]) => (
                <button key={label} onClick={() => { setMenuOpen(false); act(); }}>
                  <span aria-hidden="true">{icon}</span>{label}{label === t('gamescreen.notices') && noticeDot && <span className="dot-badge inline" aria-hidden="true" />}
                </button>
              ))}
              <div className="mobile-menu-sep" />
              {([
                ['🗺', t('gamescreen.minimap'), showMinimap, () => setShowMinimap((v) => !v)],
                ['🏆', t('gamescreen.leaderboard'), showLeaderboard, () => setShowLeaderboard((v) => !v)],
                ['💬', t('gamescreen.chat'), chatView !== 'off', () => setChatView((v) => (v === 'off' ? 'open' : 'off'))],
                ['❔', t('gamescreen.help'), showHelp, () => setShowHelp((v) => !v)],
              ] as const).map(([icon, label, on, act]) => (
                <button key={label} role="menuitemcheckbox" aria-checked={on} onClick={() => { setMenuOpen(false); act(); }}>
                  <span aria-hidden="true">{icon}</span>{label}<span className={on ? 'menu-state on' : 'menu-state'}>{on ? t('gamescreen.on') : t('gamescreen.off')}</span>
                </button>
              ))}
              <button onClick={() => { setMenuOpen(false); toggleTouchControl(); }}>
                <span aria-hidden="true">{touchControl === 'joystick' ? '🕹' : '👆'}</span>{t('gamescreen.moveModeLabel')}<span className="menu-state on">{touchControlLabel}</span>
              </button>
              {isAdmin && <button onClick={() => { setMenuOpen(false); openAdmin(); }}><span aria-hidden="true">🛠</span>{t('gamescreen.adminPage')}</button>}
              <div className="mobile-menu-sep" />
              {guest
                ? <button className="menu-login" onClick={() => { setMenuOpen(false); startGoogleLogin(); }}><span aria-hidden="true">🔑</span>{t('gamescreen.loginGoogle')}</button>
                : <button onClick={() => { setMenuOpen(false); onLogout(); }}><span aria-hidden="true">🚪</span>{t('gamescreen.logout')}</button>}
            </nav>
          )}
          {showLeaderboard && <Leaderboard myPlayerId={player.id} />}
          {/* 내 콤보(4.25): 위쪽 가운데는 구슬 결과와 겹쳐서 오른쪽 도구 줄, 리더보드 아래에 둔다 */}
          {myCombo.combo >= 1 && (
            <div key={myCombo.key} className={myCombo.combo >= myCombo.flameAt ? 'combo-hud on-fire' : 'combo-hud'} role="status" aria-live="polite">
              <strong>{myCombo.combo >= myCombo.flameAt ? '🔥' : '⚔️'} {myCombo.combo} Combo</strong>
            </div>
          )}
          {showHelp && (
            <section id="controls-help" className="help-card" aria-label={t('gamescreen.help')}>
              <h3>{t('gamescreen.helpTitle')}</h3>
              <ul>
                <li><strong>{t('gamescreen.help1k')}</strong> {t('gamescreen.help1')}</li>
                <li><strong>{t('gamescreen.help2k')}</strong> {t('gamescreen.help2')}</li>
                <li><strong>{t('gamescreen.help3k')}</strong> {t('gamescreen.help3')}</li>
                <li><strong>{t('gamescreen.help4k')}</strong> {t('gamescreen.help4')}</li>
                <li><strong>{t('gamescreen.help5k')}</strong> {t('gamescreen.help5')}</li>
                <li><strong>{t('gamescreen.help6k')}</strong> {t('gamescreen.help6')}</li>
                <li><strong>{t('gamescreen.help7k')}</strong> {t('gamescreen.help7')}</li>
                <li><strong>{t('gamescreen.help8k')}</strong> {t('gamescreen.help8')}</li>
                <li><strong>{t('gamescreen.help9k')}</strong> {t('gamescreen.help9')}</li>
                <li><strong>{t('gamescreen.help10k')}</strong> {t('gamescreen.help10')}</li>
                <li><strong>{t('gamescreen.help11k')}</strong> {t('gamescreen.help11')}</li>
                <li><strong>{t('gamescreen.help12k')}</strong> {t('gamescreen.help12')}</li>
              </ul>
              <div className="help-actions">
                <button onClick={() => setPanel('guide')}>{t('gamescreen.guideMore')}</button>
                <button onClick={() => setShowHelp(false)}>{t('gamescreen.fold')}</button>
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
        {inspect && <div className="inspect-hint" role="status">{t('gamescreen.inspectHint')}</div>}
        {toast && <div className="toast" role="status">{toast}</div>}
        {titleAlert && (
          <div key={titleAlert.key} className="title-alert" role="status" aria-live="polite">
            <span className="title-alert-icon" aria-hidden="true">🏅</span>
            <div className="title-alert-text">
              <span className="title-alert-kicker">{t('gamescreen.newTitle')}</span>
              <strong>{titleAlert.name}</strong>
              <span className="muted small">{titleAlert.description}</span>
            </div>
            <div className="title-alert-actions">
              <button className="primary" onClick={() => equipTitle(titleAlert.titleId, titleAlert.name)}>{t('gamescreen.equip')}</button>
              <button className="icon-button" onClick={dismissTitleAlert} aria-label={t('gamescreen.dismissAria')}>✕</button>
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
    </div>
  );
}
