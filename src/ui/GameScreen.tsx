import { useCallback, useEffect, useRef, useState } from 'react';
import type { Notice, PlayerSummary } from '../api/types';
import { Arena } from '../game/Arena';
import { GameConnection } from '../game/connection';
import type { ChatMessage, ServerMessage } from '../game/protocol';
import { ChatPanel, type ChatLine } from './ChatPanel';
import { GuideModal } from './GuideModal';
import { KeywordModal } from './KeywordModal';
import { startGoogleLogin } from '../googleAuth';
import { adminApi, api, ApiFailure } from '../api/client';
import { PlayerInfoModal } from './PlayerInfoModal';
import { Leaderboard } from './Leaderboard';
import { hasUnread, markNoticesRead, NoticeModal, NoticePopup, popupNotices } from './NoticeModal';
import { ProfileModal } from './ProfileModal';
import { ORB_REVEAL_MS, OrbReveal, type RevealResult } from './OrbReveal';
import { SidePanel } from './SidePanel';
import { ComboTimer } from './ComboTimer';
import { TargetCard } from './TargetCard';
import type { OrbLook } from '../game/skin';
import type { DashState, SkillCooldowns } from './SkillBar';
import type { KeybindingsResponse, SkillInfo } from '../api/types';
import { useSkills } from './useSkills';
import { actionOf, cacheSlotKeys, defaultSlotKeys, keysFromBindings, legacyChanges, loadSlotKeys, markLegacySynced, setCurrentSlots, SKILL_WINDOW_KEY, targetOfKey, type SlotKeys } from '../game/skillKeys';
import { SkillWindow } from './SkillWindow';
import { BottomBar } from './BottomBar';
import { WheelModal } from './WheelModal';
import { EMOTES } from '../game/skin';
import { successToast } from './toast';
import { LayersProvider, useLayer } from './layers';
import { useMultiTouchClicks } from './touchPress';
import { FullscreenIcon } from './FullscreenIcon';
import { canFullscreen as canFullscreenSupported, enterFullscreen, setAutoFullscreenPref } from '../fullscreen';
import { EmergencyBar, emergencyText, useEmergency } from './EmergencyBar';
import { fmtNumber, t, tOr } from '../i18n';
import { MonsterHud, MonsterNoteCard, type MonsterNote } from './MonsterHud';
import { getLang } from '../country';
import { SkillIcon } from './SkillIcon';

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

/** 작은 화면(모바일, 가로 모드 폰 포함). 저장된 선택이 없을 때의 기본값을 화면을 덜 가리는 쪽으로 정하는 데 쓴다. */
function isSmallScreen() {
  try { return window.matchMedia('(max-width: 760px), (orientation: landscape) and (max-height: 520px) and (pointer: coarse)').matches; } catch { return false; }
}

/** 미니맵 켜짐 여부는 이 브라우저에만 기억한다. 저장소를 못 쓰면 기본값(켜짐). */
const MINIMAP_KEY = 'trendist.minimap';
/** PC에서 오른쪽 검색·보관함·플레이어 영역을 숨겼는지(이 브라우저에 기억한다). 모바일은 하단 시트라 이 값을 쓰지 않는다 */
const SIDE_HIDDEN_KEY = 'trendist.sideHidden';
function loadSideHidden() {
  try { return localStorage.getItem(SIDE_HIDDEN_KEY) === '1'; } catch { return false; }
}
function saveSideHidden(hidden: boolean) {
  try { localStorage.setItem(SIDE_HIDDEN_KEY, hidden ? '1' : '0'); } catch { /* 무시 */ }
}

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

/** 채팅 켜짐·접힘 여부도 이 브라우저에만 기억한다. 처음 접속하면 PC·모바일 모두 접힌 채로 시작한다(한 줄 + 입력창). */
const CHAT_KEY = 'trendist.chat';
type ChatView = 'open' | 'collapsed' | 'off';
function loadChatView(): ChatView {
  const fallback: ChatView = 'collapsed'; // 처음 접속은 접힌 채로. 한 번 바꾸면 그 선택을 기억한다
  try { const v = localStorage.getItem(CHAT_KEY); return v === 'open' || v === 'collapsed' || v === 'off' ? v : fallback; } catch { return fallback; }
}
function saveChatView(v: ChatView) {
  try { localStorage.setItem(CHAT_KEY, v); } catch { /* 무시 */ }
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

/**
 * 서버와의 왕복 시간(ms)을 네 단계로 나눈다. 서버가 초당 20번(50ms) 상태를 보내고 클라이언트가 내 움직임을 미리 그리며 보정하는 구조라
 * 80ms 안쪽은 차이를 못 느끼고, 150ms까지는 보정으로 자연스럽고, 250ms부터는 스킬·충돌 반응이 눈에 띄게 늦는다.
 */
export type PingQuality = 'good' | 'ok' | 'slow' | 'bad';
export const pingQuality = (ms: number): PingQuality => (ms <= 80 ? 'good' : ms <= 150 ? 'ok' : ms <= 250 ? 'slow' : 'bad');

/** 겹치는 덩어리는 마지막에 손댄 것이 맨 위에 보인다(layers.tsx) */
export function GameScreen(props: Props) {
  return <LayersProvider><GameScreenInner {...props} /></LayersProvider>;
}

function GameScreenInner({ initialPlayer, guest, onLogout, onWithdrawn }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const arenaRef = useRef<Arena | null>(null);
  const connRef = useRef<GameConnection | null>(null);
  const [player, setPlayer] = useState(initialPlayer);
  const [online, setOnline] = useState(0);
  const [monsterNote, setMonsterNote] = useState<MonsterNote | null>(null); // 보스가 끝났을 때 순위·내 보상 카드(4.35)
  const [myBossDmg, setMyBossDmg] = useState({ dmg: 0, hits: 0 }); // 이번 보스에 내가 입힌 피해(4.35)
  const { notice: emergency, apply: applyEmergency } = useEmergency(); // 긴급 안내(4.29): 맨 위 한 줄. 서버 알림은 apply로 바로 반영
  const [bots, setBots] = useState(0);
  const [status, setStatus] = useState<'connecting' | 'open' | 'closed'>('connecting');
  const [toast, setToast] = useState<string | null>(null);
  const [kicked, setKicked] = useState<string | null>(null); // 관리자가 내보냄(13.10)
  const [myHp, setMyHp] = useState<{ pct: number; flash: { kind: 'hit' | 'heal'; key: number } | null }>({ pct: -1, flash: null }); // 내 체력(4.36). -1은 서버에서 아직 못 받은 상태: 체력바를 숨겨 100에서 줄어드는 모션을 막는다
  const [dead, setDead] = useState<{ by: string; waiting: boolean; hp?: boolean } | null>(null); // 죽음(4.31): 흑백 화면에 머물며 리스폰을 기다린다
  const myEntityRef = useRef(-1); // 내 원 번호(콤보 시간이 끝났을 때 불꽃을 지우는 데 쓴다)
  const [myCombo, setMyCombo] = useState<{ combo: number; flameAt: number; key: number; until: number | null }>({ combo: 0, flameAt: 5, key: 0, until: null }); // 4.25. until: 콤보가 사라질 시각(performance.now 기준 ms, 제한 없으면 null)
  const [emoteOpen, setEmoteOpen] = useState(false); // 이모트 고르기(4.26)
  const emoteOpenRef = useRef(false); // 키 입력 처리(한 번만 등록)에서 최신 값을 본다
  emoteOpenRef.current = emoteOpen;
  const sendEmoteRef = useRef<(code: string) => void>(() => {});
  const [hit, setHit] = useState<{ text: string; key: number } | null>(null);
  const [dash, setDash] = useState<DashState | null>(null); // 대시 남은 시간·쿨타임(4.27)
  const [skillCd, setSkillCd] = useState<SkillCooldowns>({}); // 스킬마다 다시 쓸 수 있는 시각(4.33)
  const skills = useSkills(); // 스킬 목록·기본 키·쿨타임(DB, 4.33)
  const [hookedUntil, setHookedUntil] = useState<number | null>(null);
  const hookedUntilRef = useRef(0);
  const skillsRef = useRef(skills);
  skillsRef.current = skills;
  const levelRef = useRef(player.level);
  levelRef.current = player.level;
  const sendSkillRef = useRef<(id: string) => void>(() => {});
  // 장착한 스킬 4칸(서버가 알려 준다, 4.33)과 칸의 단축키(이 브라우저에 저장). 장착해야만 쓸 수 있다
  const [slots, setSlots] = useState<(string | null)[]>([null, null, null, null]);
  const slotsRef = useRef(slots);
  slotsRef.current = slots;
  const [slotKeys, setSlotKeys] = useState<SlotKeys>(loadSlotKeys);
  const sendLoadoutRef = useRef<(s: (string | null)[]) => void>(() => {});
  // 단축키는 서버가 저장한다(4.33). 접속하면 받아 쓰고, 바꿀 때마다 저장한다. 같은 값을 이 브라우저에도 복사해 두어 서버에 닿기 전에도 키가 먹는다
  const applyKeys = useCallback((res: KeybindingsResponse) => { const k = keysFromBindings(res.bindings); cacheSlotKeys(k); setSlotKeys(k); return k; }, []);
  useEffect(() => {
    let alive = true;
    api.keybindings().then(async (res) => {
      if (!alive) return;
      let k = applyKeys(res);
      const legacy = legacyChanges(k); // 서버에 저장하기 전에 이 브라우저에서 바꿔 둔 키가 있으면 한 번 올려 준다
      if (legacy.length) {
        try { k = applyKeys(await api.saveKeybindings(legacy)); } catch { /* 겹치는 옛 설정은 올리지 않고 서버 값을 쓴다 */ }
      }
      markLegacySynced();
    }).catch(() => { /* 서버에 못 닿으면 이 브라우저에 복사해 둔 키로 쓴다 */ });
    return () => { alive = false; };
  }, [applyKeys]);
  const setKey = useCallback(async (target: number | 'dash', code: string) => {
    const prev = loadSlotKeys();
    const next: SlotKeys = target === 'dash' ? { ...prev, dash: code } : { ...prev, slots: prev.slots.map((k, i) => (i === target ? code : k)) };
    cacheSlotKeys(next); setSlotKeys(next); // 바로 쓰이게 먼저 바꾼다
    try { applyKeys(await api.saveKeybindings([{ action: actionOf(target), key: code }])); }
    catch (e) {
      showToast(e instanceof ApiFailure && (e.status === 409 || e.status === 400) ? t('gamescreen.keyReserved') : t('gamescreen.keySaveFailed'));
      try { applyKeys(await api.keybindings()); } catch { cacheSlotKeys(prev); setSlotKeys(prev); }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [applyKeys]);
  const resetKeys = useCallback(async () => {
    const d = defaultSlotKeys(); cacheSlotKeys(d); setSlotKeys(d);
    try { applyKeys(await api.resetKeybindings()); } catch { showToast(t('gamescreen.keySaveFailed')); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [applyKeys]);
  const sendDashRef = useRef<() => void>(() => {});
  const [refreshKey, setRefreshKey] = useState(0);
  const [showMinimap, setShowMinimap] = useState(loadMinimapPref);
  const [sideHidden, setSideHidden] = useState(loadSideHidden);
  const setSide = useCallback((hidden: boolean) => { setSideHidden(hidden); saveSideHidden(hidden); }, []);
  const [showLeaderboard, setShowLeaderboard] = useState(loadLeaderboardPref);
  const [showHelp, setShowHelp] = useState(loadHelpPref);
  const [panel, setPanel] = useState<'notice' | 'guide' | 'profile' | 'skills' | 'wheel' | null>(null);
  const [wheelReady, setWheelReady] = useState(false); // 오늘 돌림판을 아직 안 돌렸다(메뉴에 빨간 점)
  const [orbReveal, setOrbReveal] = useState<{ result: RevealResult; key: number } | null>(null);
  // 키워드를 얻거나 잃은 결과 카드(구슬·빼앗기·빼앗김·봇)는 모두 이 한 곳으로 띄운다
  const showReveal = useCallback((result: RevealResult) => {
    const key = performance.now();
    setOrbReveal({ result, key });
    window.setTimeout(() => setOrbReveal((cur) => (cur?.key === key ? null : cur)), ORB_REVEAL_MS);
  }, []);
  const [openKeyword, setOpenKeyword] = useState<number | null>(null);
  const [infoEntity, setInfoEntity] = useState<number | null>(null);
  const [infoPlayerId, setInfoPlayerId] = useState<number | null>(null); // 채팅의 닉네임·검색으로 연 플레이어 상세
  const [infoLook, setInfoLook] = useState<OrbLook | null>(null); // 정보 창에 보여 줄 그 원의 모양
  const [targetCard, setTargetCard] = useState<number | null>(null); // 클릭한 플레이어의 작은 정보 카드(왼쪽 위)
  const [followUi, setFollowUi] = useState<number | null>(null); // 지금 따라가는 원(카드에 "따라가는 중"을 보이고 10초 닫힘을 멈춘다)
  const [targetTouch, setTargetTouch] = useState(0); // 원을 누를 때마다 올라가서 카드의 10초를 다시 시작한다
  const [infoBot, setInfoBot] = useState<{ nickname: string; level: number; score: number } | null>(null);
  // 정보 보기 모드(모바일): 켜져 있으면 다음 탭은 이동이 아니라 그 원의 정보를 연다
  const [sideRequest, setSideRequest] = useState<{ tab: 'search' | 'mine'; key: number } | null>(null); // 모바일 메뉴에서 시트를 여는 요청
  const [menuOpen, setMenuOpen] = useState(false); // 모바일 ☰ 메뉴
  const [pingMs, setPingMs] = useState<number | null>(null); // 서버와의 왕복 시간(ms, 부드럽게). 연결이 없으면 null
  useEffect(() => { if (status !== 'open') setPingMs(null); }, [status]); // 끊기면 옛 값을 버린다
  // 전체 화면(안드로이드 크롬 등): 주소창을 가리고 화면을 넓힌다. 아이폰 사파리는 지원하지 않아 메뉴에 안 보인다(홈 화면에 추가하면 주소창 없이 열린다)
  const canFullscreen = canFullscreenSupported();
  const [isFullscreen, setIsFullscreen] = useState(() => typeof document !== 'undefined' && !!document.fullscreenElement);
  useEffect(() => {
    const on = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', on);
    return () => document.removeEventListener('fullscreenchange', on);
  }, []);
  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) { setAutoFullscreenPref(false); void document.exitFullscreen().catch(() => {}); } // 직접 끄면 다음부터 자동으로 켜지 않는다
    else { setAutoFullscreenPref(true); enterFullscreen(); }
  }, []);
  const toolsLayer = useLayer('tools');
  useMultiTouchClicks(); // 조이스틱을 쥔 채 다른 손가락으로 누르는 모든 화면 버튼이 눌리게
  // 메뉴·리더보드·조작 설명을 열면 도구 덩어리를 맨 위로(채팅·이모트보다 앞)
  useEffect(() => { if (menuOpen || showHelp || showLeaderboard) toolsLayer.front(); }, [menuOpen, showHelp, showLeaderboard]); // eslint-disable-line react-hooks/exhaustive-deps
  const [searchRequest, setSearchRequest] = useState<{ text: string; key: number } | null>(null);
  const [chatLines, setChatLines] = useState<ChatLine[]>([]);
  const [chatView, setChatView] = useState<ChatView>(loadChatView);
  const chatOnRef = useRef(chatView !== 'off');
  chatOnRef.current = chatView !== 'off';
  const chatInputRef = useRef<HTMLInputElement>(null);
  const joyRef = useRef<HTMLDivElement>(null);
  // 공지(4.16): 들어올 때 아직 안 본 팝업 공지를 띄우고, 목록에서 못 본 새 공지가 있으면 [공지사항]에 빨간 점을 켠다.
  // 게임 중에 올라온 공지는 팝업 없이 점만 켠다(5분마다 다시 읽는다)
  const [noticePopup, setNoticePopup] = useState<Notice[] | null>(null);
  const [noticeDot, setNoticeDot] = useState(false);
  const noticesRef = useRef<Notice[]>([]);
  useEffect(() => { // 오늘 돌림판을 아직 안 돌렸으면 메뉴에 점을 띄운다(5분마다 다시 확인: 자정이 지나면 다시 돌릴 수 있다)
    const load = () => api.wheelStatus().then((s) => setWheelReady(s.enabled && s.available)).catch(() => {});
    load();
    const id = window.setInterval(load, 5 * 60_000);
    return () => window.clearInterval(id);
  }, []);
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
    arena.onView = (hw, hh) => { if (ready) conn.send({ type: 'view', hw, hh }); }; // 관심 영역 전송: 내 화면 둘레의 원만 받는다
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
            setDead(null); arena.setDead(false); // 처음 들어왔거나 리스폰했다
            setDash(null); arena.resetDash(); // 새 원이라 대시 남은 시간·쿨타임 표시도 지운다(서버는 이미 초기화)
            setSkillCd({}); arena.resetSkills(); hookedUntilRef.current = 0; setHookedUntil(null); // 스킬 쿨타임과 연출도(4.33)
            arena.setMe(m.entityNo, m.x, m.y);
            arena.resendView(); // 다시 들어왔으니 보이는 범위를 서버에 다시 알린다
            myEntity = m.entityNo;
            myEntityRef.current = m.entityNo;
            ready = true;
            resyncDir(); // 다시 연결됐을 때 아직 누르고 있는 방향키가 있으면 서버와 예측에 함께 다시 넣는다
            conn.send({ type: 'ping', t: performance.now() });
            break;
          case 'monster': arena.setMonster(m); break; // 보스 상태(5Hz, 4.35)
          case 'monsterFx': arena.monsterFx(m); break;
          case 'monsterAlert': showToast(t('monster.alert', { name: getLang() === 'en' && m.en ? m.en : m.name, sec: Math.max(1, Math.round(m.seconds)) })); break;
          case 'monsterSpawn':
            setMyBossDmg({ dmg: 0, hits: 0 }); setMonsterNote(null);
            showToast(t('monster.spawn', { name: getLang() === 'en' && m.en ? m.en : m.name, min: Math.max(1, Math.round(m.durationMs / 60000)) }));
            break;
          case 'monsterHit':
            arena.monsterHit(m);
            if (m.e === myEntity) { // 내가 입힌 피해는 보스 위 숫자로만 보인다(내 원 위 글씨는 중복이라 뺐다)
              setMyBossDmg((d) => ({ dmg: d.dmg + m.dmg, hits: d.hits + 1 }));
            }
            break;
          case 'monsterEnd':
            if (m.result === 'KILLED') arena.vanishMonster(); else arena.clearMonster(); // 처치하면 증발 연출, 시간이 다 되면 그냥 사라진다
            setMonsterNote({ key: performance.now(), kind: 'end', result: m.result, name: m.name, en: m.en, top: m.top });
            window.setTimeout(() => setMonsterNote((n) => (n && n.kind === 'end' ? null : n)), 12000);
            break;
          case 'monsterReward':
            setMonsterNote({ key: performance.now(), kind: 'reward', name: m.name, en: m.en, cleared: m.cleared, rank: m.rank, damage: m.damage, exp: m.exp, levelPercent: m.levelPercent ?? 0, keywords: m.keywords });
            window.setTimeout(() => setMonsterNote((n) => (n && n.kind === 'reward' ? null : n)), 15000);
            setRefreshKey((k) => k + 1);
            break;
          case 'tuning': arena.setTuning(m); break;
          case 'emergency': applyEmergency(m.notice); break;
          case 'titleGranted': showTitleAlert(m.titleId, m.name, m.description); break;
          case 'roster': arena.setRoster(m.players, m.flameAt); setOnline(m.players.filter((p) => !p.bot).length); setBots(m.players.filter((p) => p.bot).length); break;
          case 'score':
            setPlayer((p) => ({ ...p, currentScore: m.score, exp: m.exp, nextLevelExp: m.nextExp, level: m.level, holdCount: m.holdCount }));
            break;
          case 'pong': {
            const ms = performance.now() - m.t;
            arena.updateRtt(ms);
            if (Number.isFinite(ms) && ms >= 0 && ms < 5000) setPingMs((p) => (p === null ? Math.round(ms) : Math.round(p * 0.6 + ms * 0.4))); // 튀는 값에 깜빡이지 않게 조금씩 따라간다
            break;
          }
          case 'orbs': arena.setOrbs(m.orbs); break;
          case 'orbSpawn': arena.addOrb(m.id, m.x, m.y, m.prize); break;
          case 'orbEaten': arena.eatOrb(m.id, m.e); break;
          case 'safeZones': arena.setSafeZones(m.center, m.zones); break;
          case 'orbResult': {
            // 구슬이 원 안으로 빨려 들어간 뒤에 결과 카드를 띄운다
            const key = performance.now();
            const kind = m.status === 'GAINED' || m.status === 'RENEWED' ? 'GAIN' : m.status === 'LOST' ? 'LOSE' : undefined;
            window.setTimeout(() => setOrbReveal({ result: { ...m, kind }, key }), 250);
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
            if (mine) {
              // 콤보가 오를 때마다 유지시간이 다시 시작되므로(4.25) 그때 사라질 시각을 새로 잡는다
              const rose = m.event === 'up' || m.event === 'start';
              setMyCombo((c) => ({ combo: m.combo, flameAt: m.flameAt, key: c.key + (rose ? 1 : 0),
                until: rose ? (m.maxMs ? performance.now() + m.maxMs : null) : c.until }));
            }
            // 다른 사람이 불꽃을 얻었다는 안내는 띄우지 않는다(불꽃은 그 원 둘레로 보인다)
            if (m.event === 'broken') {
              if (mine) showToast(t('gamescreen.flameOut', { by: m.by ?? t('gamescreen.someone') }));
            }
            break;
          }
          case 'lost':
            // 어떤 키워드를 몇 점짜리로 잃었는지 보여 준다(4.3)
            if (m.wiped && m.partial) showReveal({ type: 'orbResult', status: 'LOST', wipe: m.wiped, who: m.by || undefined, lostLabel: t(m.death ? 'gamescreen.lostPartDeath' : 'gamescreen.lostPartFlame') }); // 일부만 잃었다(4.36)
            else if (m.wiped) showReveal({ type: 'orbResult', status: 'LOST', wipe: m.wiped, who: m.by || undefined });
            else showReveal({ type: 'orbResult', status: 'LOST', text: m.keyword ?? '', gained: m.score, kind: m.poison || m.monster ? 'LOSE' : 'STOLEN', who: m.by || undefined, lostCount: m.count, lostLabel: m.monster ? t('monster.lostBy', { by: m.by, n: m.count ?? 1 }) : undefined }); // 독·보스로 여러 개를 잃은 것은 아무도 가져가지 않으므로 '뺏김'이 아니라 '잃음'
            if (m.score > 0) arena.floatText(`-${m.score}`, '#ff8a8a');
            setRefreshKey((k) => k + 1);
            break;
          case 'hit': {
            // 공격 성공: 상대가 잃은 키워드와 점수를 내 화면에 보여 준다.
            // 사람에게서 이기면 그 키워드를 빼앗는다: 없던 키워드는 보관함에 추가, 이미 있던 키워드는 남은 시간 갱신(4.3)
            // 봇을 이기면 봇의 키워드 대신 무작위 🔥 키워드를 얻는다. 이미 가진 키워드면 남은 시간 갱신(4.21)
            const key = performance.now();
            const hp = { target: m.target ?? '', kw: m.keyword ?? '', score: m.score ?? 0, n: m.wiped ?? 0 };
            const gainedBy = m.stolen && !m.wiped; // 키워드를 얻었다(빼앗음·봇을 이겨 획득): 구슬과 같은 결과 카드로 보여 준다
            if (gainedBy) {
              showReveal({ type: 'orbResult', status: m.stolen === 'ADDED' || m.stolen === 'BOT' ? 'GAINED' : 'RENEWED', text: m.keyword ?? '', gained: m.gained,
                           kind: 'STEAL', who: m.target || undefined });
            }
            const text = m.wiped && m.partial ? t('gamescreen.hitPart', hp) : m.wiped ? t('gamescreen.hitWiped', hp)
              : m.stolen === 'BOT' ? t('gamescreen.hitBot', hp)
              : m.stolen === 'BOT_RENEWED' ? t('gamescreen.hitBotRenewed', hp)
              : m.stolen === 'ADDED' ? t('gamescreen.hitAdded', hp)
              : m.stolen === 'RENEWED' ? t('gamescreen.hitRenewed', hp)
              : m.keyword ? t('gamescreen.hitDropped', hp) : t('gamescreen.hitWon', hp);
            if (m.wiped) showReveal({ type: 'orbResult', status: 'GAINED', wipe: m.wiped, who: m.target || undefined, lostLabel: m.partial ? t('gamescreen.hitPartTitle') : undefined });
            else if (!gainedBy) setHit({ text, key });
            if (m.stolen) {
              if (m.gained) arena.floatText(`+${m.gained}`);
              setRefreshKey((k) => k + 1); // 보관함 목록 새로고침
            }
            if (!gainedBy && !m.wiped) window.setTimeout(() => setHit((h) => (h?.key === key ? null : h)), 3000);
            break;
          }
          case 'died':
            // 죽음(4.31): 입력을 끊고 마지막 장면을 흑백으로 두며, 누가 죽였는지 알려 준다
            ready = false; arena.clearControl();
            setDead({ by: m.by, waiting: false, hp: m.cause === 'hp' }); arena.setDead(true);
            arena.clearHp(); setMyHp({ pct: 100, flash: null }); // 다시 들어오면 체력은 가득이다(4.36)
            break;
          case 'hp': { // 내 체력(4.36)
            if (myEntity !== -1 && m.e !== myEntity) break; // hp는 본인에게만 온다. 접속 직후엔 welcome보다 먼저 와서 myEntity가 아직 -1이니 버리면 안 된다
            arena.setHp(m.e, m.pct);
            setMyHp((h) => ({ pct: m.pct, flash: m.heal ? { kind: 'heal', key: performance.now() } : h.flash }));
            if (m.heal) arena.healPop(m.e);
            break;
          }
          case 'hps': arena.setHps(m.list); break; // 체력바 공개 설정일 때 모두의 체력
          case 'hpHit': { // 누가 맞았다: 그 원 위에 깎인 %를 띄운다. 내 체력바는 바로 줄인다
            arena.hpPop(m.e, `-${Math.max(1, m.pct > 0 ? Math.min(99, Math.round(m.dmg)) : Math.round(m.dmg))}%`, m.e === myEntity ? 'taken' : arena.isFlaming(m.by) ? 'crit' : 'other'); // 내가 입은 피해는 보라, 불꽃으로 때린 피해는 분홍 크리티컬, 나머지는 주황
            if (m.e === myEntity) {
              arena.setHp(m.e, m.pct);
              setMyHp({ pct: m.pct, flash: { kind: 'hit', key: performance.now() } });
            }
            break;
          }
          case 'kill': { // 내가 죽였다(4.31)
            showReveal({ type: 'orbResult', status: 'GAINED', kill: m.target });
            break;
          }
          case 'shield': arena.showShield(m.e, m.ms); break;
          case 'knock': arena.applyKnock(m.dx, m.dy, m.ms); break;
          case 'levelFx': arena.showLevelFx(m.e, m.level); break; // 레벨업 이펙트(4.30)
          case 'dashFx': arena.showDashFx(m.e, m.ms); break; // 누군가 대시를 시작했다: 그 원에 강조 효과(4.27)
          case 'skill': { // 내가 스킬을 썼다(4.33): 쿨타임 표시
            const at = performance.now() + m.cooldownMs;
            setSkillCd((c) => ({ ...c, [m.id]: at }));
            break;
          }
          case 'cooldowns': { // 새로고침하고 다시 들어왔다: 서버가 들고 있는 스킬·대시 쿨타임을 다시 보여 준다(welcome 뒤에 온다)
            const t0 = performance.now();
            setSkillCd(Object.fromEntries(Object.entries(m.skills).map(([id, ms]) => [id, t0 + ms])));
            if (m.dashReadyMs > 0) {
              setDash({ until: t0 + m.dashActiveMs, readyAt: t0 + m.dashReadyMs });
              if (m.dashActiveMs > 0) arena.startDash(m.dashActiveMs, m.dashMult);
            }
            break;
          }
          case 'loadout': setSlots(m.slots); setCurrentSlots(m.slots); break; // 장착한 스킬 4칸(4.33)
          case 'skillFail': showToast(m.reason === 'level' ? t('gamescreen.skillLockedToast', { n: m.level ?? 0 }) : m.reason === 'unequipped' ? t('gamescreen.skillUnequippedToast') : m.reason === 'hpFull' ? t('gamescreen.skillHpFull') : t('gamescreen.skillSafe')); break;
          case 'skillFx': arena.showSkillFx(m); break; // 누군가 스킬을 썼다: 그 연출(4.33)
          case 'dark': arena.setDark(m.ms); showToast(t('gamescreen.darkened')); break; // 암흑에 맞았다(4.33)
          case 'darkEnd': arena.clearDark(); break; // 정화로 암흑이 풀렸다
          case 'pullEnd': arena.endPull(); hookedUntilRef.current = 0; setHookedUntil(null); break; // 정화로 갈고리에서 풀렸다
          case 'pull': // 갈고리에 끌려온다(4.33): 끌려오는 동안 스킬 버튼을 잠깐 못 쓰는 모양으로 바꾼다
            arena.startPull(m.ms, m.byE); showToast(t('gamescreen.hooked'));
            hookedUntilRef.current = performance.now() + m.ms + 150; setHookedUntil(hookedUntilRef.current);
            window.setTimeout(() => setHookedUntil((u) => (u === hookedUntilRef.current ? null : u)), m.ms + 200);
            break;
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
    sendDashRef.current = sendDash; // 모바일은 ⚡ 버튼으로 쓴다
    // 스킬(4.33): 쿨타임·세이프존은 서버가 본다. 갈고리는 겨눈 지점(PC는 마우스, 모바일은 조이스틱·이동 방향)을 함께 보낸다
    let lastPointer: { x: number; y: number } | null = null;
    const aimPoint = (): { x: number; y: number } | null => {
      if (joy && (joy.dx || joy.dy)) { const me = arena.mePosition(); return { x: me.x + joy.dx * 1000, y: me.y + joy.dy * 1000 }; }
      if (hold && moveTarget) return moveTarget;
      if (lastPointer) return arena.screenToWorld(lastPointer.x, lastPointer.y);
      return null; // 겨누지 않았으면 서버가 가던 방향으로 쓴다
    };
    sendLoadoutRef.current = (s: (string | null)[]) => { if (ready) conn.send({ type: 'loadout', slots: s }); };
    sendSkillRef.current = (id: string) => {
      if (!ready) return;
      const aim = id === 'hook' || id === 'poison' || id === 'darkness' ? aimPoint() : null;
      conn.send(aim ? { type: 'skill', id, x: Math.round(aim.x), y: Math.round(aim.y) } : { type: 'skill', id });
    };
    conn.start();
    // 서버 왕복 시간을 2초마다 잰다(내 원 보정 허용 오차에 쓴다)
    const pingTimer = window.setInterval(() => conn.send({ type: 'ping', t: performance.now(), rtt: arenaRef.current?.rttMs() ?? 0 }), 2000);
    // 페이지를 떠날 때(구글 로그인으로 이동, 새로고침, 탭 닫기) 서버에 알려 바로 방에서 빠진다. 닫힘 신호가 늦거나 안 와도 유령으로 남지 않게
    const bye = () => conn.send({ type: 'bye' });
    window.addEventListener('pagehide', bye);

    // 방향키·WASD 입력. 입력창에 쓰는 중이면 무시한다.
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
        if (ready && conn.send({ type: 'move', x: moveTarget.x, y: moveTarget.y })) arena.setTarget(moveTarget.x, moveTarget.y);
      } else if (movePending === null) {
        movePending = window.setTimeout(() => { movePending = null; sendMove(); }, CLICK_INTERVAL_MS - (now - lastMoveSent));
      }
    };
    const canvas = canvasRef.current!;
    // 다른 플레이어 정보(4.11): PC는 우클릭, 모바일은 [🔍]을 누른 뒤 원을 탭한다. 왼쪽 클릭·터치·드래그는 언제나 이동이라 겹치지 않는다
    const openInfo = (hit: number) => { setInfoBot(arena.botInfo(hit)); setInfoLook(arena.entityInfo(hit)?.look ?? null); setInfoEntity(hit); };
    // 누르고 있는 동안에는 손가락·마우스가 있는 곳으로 계속 따라간다(4.2). 화면이 같이 움직이므로 가만히 누르고 있어도 주기적으로 다시 찍는다
    let hold: { pointerId: number; x: number; y: number } | null = null;
    const followHold = () => {
      if (!hold || !ready) return;
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
      const p = ready ? arena.followPosition(followE) : null;
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
      if (!ready) return;
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
      if (!ready) return;
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
      clearInterval(followTimer);
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
  // 콤보 유지시간(5분)이 끝나면 서버 알림을 기다리지 않고 화면에서도 바로 지운다: 콤보 카드와 내 원의 불꽃. 서버가 곧 같은 사실을 알려 주고, 그 사이 콤보가 올랐으면 새 시각으로 다시 센다
  useEffect(() => {
    if (myCombo.until === null || myCombo.combo < 1) return;
    const until = myCombo.until, flameAt = myCombo.flameAt;
    const id = window.setTimeout(() => {
      setMyCombo((c) => (c.until === until ? { ...c, combo: 0, until: null } : c));
      arenaRef.current?.setCombo(myEntityRef.current, 0, flameAt);
    }, Math.max(0, until - performance.now()) + 200);
    return () => window.clearTimeout(id);
  }, [myCombo.until, myCombo.combo, myCombo.flameAt]);
  // 레벨이 올라서 새로 쓸 수 있게 된 스킬이 있으면 안내 팝업(4.33). 처음 불러온 레벨은 기준일 뿐이라 알리지 않고, 올랐을 때만 (이전 레벨, 지금 레벨] 사이에 해금되는 스킬을 알린다
  const [unlockAlert, setUnlockAlert] = useState<{ key: number; level: number; skills: SkillInfo[] } | null>(null);
  const prevLevelRef = useRef<number | null>(null);
  useEffect(() => {
    const lv = player.level, prev = prevLevelRef.current;
    prevLevelRef.current = lv;
    if (prev === null || lv <= prev) return;
    const gained = skillsRef.current.filter((k) => k.requiredLevel > prev && k.requiredLevel <= lv);
    if (gained.length) setUnlockAlert({ key: Date.now(), level: lv, skills: gained });
  }, [player.level]);
  useEffect(() => {
    if (!unlockAlert) return;
    const id = window.setTimeout(() => setUnlockAlert((a) => (a?.key === unlockAlert.key ? null : a)), 9000);
    return () => window.clearTimeout(id);
  }, [unlockAlert]);
  const readMonster = useCallback(() => arenaRef.current?.monsterHud() ?? null, []);
  const readMeLook = useCallback(() => arenaRef.current?.meLook() ?? null, []);
  const readTarget = useCallback((e: number) => arenaRef.current?.entityInfo(e) ?? null, []);
  const closeTargetCard = useCallback(() => setTargetCard(null), []);
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
  // 플레이어 상세의 [공유]: 채팅에 @[닉네임](p번호)로 바로 보낸다. 채팅의 닉네임을 누르면 그 플레이어 상세가 열린다
  const sharePlayer = useCallback((playerId: number, nickname: string) => {
    if (!connRef.current?.send({ type: 'chat', text: `@[${nickname}](p${playerId})` })) { showToast(t('gamescreen.shareAfterConnect')); return; }
    setChatView((v) => (v === 'off' ? 'open' : v));
  }, [showToast]);
  const searchKeyword = useCallback((text: string) => setSearchRequest({ text, key: performance.now() }), []);
  const closeKeyword = useCallback(() => setOpenKeyword(null), []);

  return (
    <div className="game-shell">
      {emergency && <EmergencyBar text={emergencyText(emergency)} />}
    <div className={sideHidden ? 'game side-hidden' : 'game'}>
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
        {sideHidden && (
          <button type="button" className="side-show" onClick={() => setSide(false)} aria-label={t('gamescreen.sideShow')} title={t('gamescreen.sideShow')}>
            <span aria-hidden="true">◀</span><span className="side-show-label">{t('gamescreen.sideShowShort')}</span>
          </button>
        )}
        <canvas ref={canvasRef} className={dead ? 'arena dead' : 'arena'}
                aria-label={t('gamescreen.arenaAria')} />
        {dead && (
          <div className="death-overlay" role="alertdialog" aria-labelledby="death-title">
            <div className="death-box">
              <h2 id="death-title" className="death-bar">{t('gamescreen.diedTitle')}</h2>
              <div className="death-body">
                <div className="death-tomb" aria-hidden="true">🪦</div>
                <p>{t(dead.hp ? 'gamescreen.diedByHp' : 'gamescreen.diedBy', { by: dead.by })}</p>
                <button className="death-btn" autoFocus disabled={dead.waiting || status !== 'open'}
                        onClick={() => { setDead({ by: dead.by, waiting: true }); connRef.current?.send({ type: 'respawn' }); }}>
                  {dead.waiting ? t('gamescreen.respawning') : t('gamescreen.respawn')}
                </button>
              </div>
            </div>
          </div>
        )}
        <MonsterHud read={readMonster} mine={myBossDmg} />
        {monsterNote && <MonsterNoteCard note={monsterNote} onClose={() => setMonsterNote(null)} />}
        <div className="hud">
          {/* 모바일은 짧게(👥 3 · 🤖 7), PC는 글자로 */}
          <span className="hud-online" aria-label={bots > 0 ? t('gamescreen.onlineAriaBots', { online, bots }) : t('gamescreen.onlineAria', { online })}>
            <span className="hud-long">{t('gamescreen.onlineLong', { online })}</span><span className="hud-short">👥 {online}</span>
            {bots > 0 && <span className="muted"><span className="hud-long">{t('gamescreen.botsLong', { bots })}</span><span className="hud-short"> · 🤖 {bots}</span></span>}
          </span>
          {pingMs !== null && status === 'open' && (() => {
            const q = pingQuality(pingMs);
            return <span className={`hud-ping ping-${q}`} title={t(`gamescreen.ping_${q}`, { ms: pingMs })} aria-label={t(`gamescreen.ping_${q}`, { ms: pingMs })}><i aria-hidden="true" />{pingMs}ms</span>;
          })()}
          <span className="hud-me">{t('gamescreen.score', { n: fmtNumber(Number(player.currentScore)) })}</span>
          {status !== 'open' && <span className="warn">{status === 'connecting' ? t('gamescreen.connecting') : t('gamescreen.reconnecting')}</span>}
        </div>
        {targetCard !== null && (
          <TargetCard entityNo={targetCard} following={followUi === targetCard} touchKey={targetTouch} read={readTarget} onClose={closeTargetCard}
                      onDetail={() => { const e = targetCard; setInfoBot(arenaRef.current?.botInfo(e) ?? null); setInfoLook(arenaRef.current?.entityInfo(e)?.look ?? null); setInfoEntity(e); }}
                      onOpenKeyword={setOpenKeyword} />
        )}
        <BottomBar me={player} hp={!dead && status === 'open' && myHp.pct >= 0 ? myHp : null} skills={skills} slots={slots} keys={slotKeys} onOpenSkills={() => setPanel('skills')} readLook={readMeLook} cooldowns={skillCd} dash={dash} lockedUntil={hookedUntil}
                   onUse={(id) => sendSkillRef.current(id)} onDash={() => sendDashRef.current()} onProfile={() => setPanel('profile')}
                   emoteOpen={emoteOpen} onToggleEmote={() => setEmoteOpen((v) => !v)}
                   onEmote={(code) => { sendEmoteRef.current(code); setEmoteOpen(false); }} />
        <div className="arena-tools" {...toolsLayer.props}>
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
            <button onClick={() => setPanel('skills')} aria-label={t('gamescreen.skillWindowTitle')} title={t('gamescreen.skillWindowTitle')}>⚔️ <span className="tool-label">{t('gamescreen.skills')}</span></button>
            <button onClick={() => setPanel('guide')} aria-label={t('gamescreen.guide')}>📖 <span className="tool-label">{t('gamescreen.guide')}</span></button>
            <button className="minimap-toggle" aria-label={t('gamescreen.minimap')} aria-pressed={showMinimap} onClick={() => setShowMinimap((v) => !v)}
                    title={t('gamescreen.minimapTitle')}>🗺 <span className="tool-label">{t('gamescreen.minimap')}</span> </button>
            <button className="leaderboard-toggle" aria-label={t('gamescreen.leaderboard')} aria-pressed={showLeaderboard} onClick={() => setShowLeaderboard((v) => !v)}
                    title={t('gamescreen.leaderboardTitle')}>🏆 <span className="tool-label">{t('gamescreen.leaderboard')}</span> </button>
            <button className="chat-toggle" aria-label={t('gamescreen.chat')} aria-pressed={chatView !== 'off'} onClick={() => setChatView((v) => (v === 'off' ? 'open' : 'off'))}
                    title={t('gamescreen.chatTitle')}>💬 <span className="tool-label">{t('gamescreen.chat')}</span> </button>
            <button className="icon-button help-toggle" aria-expanded={showHelp} aria-controls="controls-help"
                    onClick={() => setShowHelp((v) => !v)} title={showHelp ? t('gamescreen.helpClose') : t('gamescreen.helpOpen')}
                    aria-label={showHelp ? t('gamescreen.helpClose') : t('gamescreen.helpOpen')}>?</button>
            {/* 모바일: 위 버튼들은 숨기고(🔍만 남김) 이 메뉴에 이름과 함께 모은다 */}
 {/* 모바일: 메뉴 왼쪽에 검색·보관함 버튼(PC는 오른쪽 패널이 있어서 숨김) */}
            {canFullscreen && (
              <button className="fs-toggle" onClick={toggleFullscreen} aria-pressed={isFullscreen}
                      aria-label={isFullscreen ? t('gamescreen.fullscreenExit') : t('gamescreen.fullscreen')} title={isFullscreen ? t('gamescreen.fullscreenExit') : t('gamescreen.fullscreen')}><FullscreenIcon exit={isFullscreen} /></button>
            )}
            <button className="side-toggle" onClick={() => setSideRequest({ tab: 'search', key: Date.now() })} aria-label={t('side.tabSearch')} title={t('side.tabSearch')}>🔍</button>
            <button className="side-toggle" onClick={() => setSideRequest({ tab: 'mine', key: Date.now() })} aria-label={t('side.tabMine')} title={t('side.tabMine')}>📦</button>
            <button className="menu-toggle" aria-label={noticeDot ? t('gamescreen.menuAriaNew') : t('gamescreen.menu')} aria-expanded={menuOpen} aria-controls="mobile-menu"
                    onClick={() => setMenuOpen((v) => !v)}>{menuOpen ? '✕' : '☰'}{(noticeDot || wheelReady) && !menuOpen && <span className="dot-badge" aria-hidden="true" />}</button>
          </div>
          {menuOpen && (
            <nav id="mobile-menu" className="mobile-menu" aria-label={t('gamescreen.menu')}>
              {([
                ['👤', t('gamescreen.myInfo'), () => setPanel('profile')],
                ['⚔️', t('gamescreen.skills'), () => setPanel('skills')],
                ['📢', t('gamescreen.notices'), () => setPanel('notice')],
                ['📖', t('gamescreen.guide'), () => setPanel('guide')],
                ['🎡', t('wheel.menu'), () => setPanel('wheel')],
              ] as const).map(([icon, label, act]) => (
                <button key={label} onClick={() => { setMenuOpen(false); act(); }}>
                  <span aria-hidden="true">{icon}</span>{label}{((label === t('gamescreen.notices') && noticeDot) || (label === t('wheel.menu') && wheelReady)) && <span className="dot-badge inline" aria-hidden="true" />}
                </button>
              ))}
              <div className="mobile-menu-sep" />
              {([
                ['🗺', t('gamescreen.minimap'), showMinimap, () => setShowMinimap((v) => !v)],
                ['🏆', t('gamescreen.leaderboard'), showLeaderboard, () => setShowLeaderboard((v) => !v)],
                ['💬', t('gamescreen.chat'), chatView !== 'off', () => setChatView((v) => (v === 'off' ? 'open' : 'off'))],
                ['❔', t('gamescreen.help'), showHelp, () => setShowHelp((v) => !v)],
                ...(canFullscreen ? [[<FullscreenIcon size={18} />, t('gamescreen.fullscreen'), isFullscreen, toggleFullscreen] as const] : []),
              ] as const).map(([icon, label, on, act]) => (
                <button key={label} role="menuitemcheckbox" aria-checked={on} onClick={() => { setMenuOpen(false); act(); }}>
                  <span aria-hidden="true">{icon}</span>{label}<span className={on ? 'menu-state on' : 'menu-state'}>{on ? t('gamescreen.on') : t('gamescreen.off')}</span>
                </button>
              ))}
              {isAdmin && <button onClick={() => { setMenuOpen(false); openAdmin(); }}><span aria-hidden="true">🛠</span>{t('gamescreen.adminPage')}</button>}
              <div className="mobile-menu-sep" />
              {guest
                ? <button className="menu-login" onClick={() => { setMenuOpen(false); startGoogleLogin(); }}><span aria-hidden="true">🔑</span>{t('gamescreen.loginGoogle')}</button>
                : <button className="menu-logout" onClick={() => { setMenuOpen(false); onLogout(); }}><span aria-hidden="true">🚪</span>{t('gamescreen.logout')}</button>}
            </nav>
          )}
          {showLeaderboard && <Leaderboard myPlayerId={player.id} />}
          {/* 내 콤보(4.25): 위쪽 가운데는 구슬 결과와 겹쳐서 오른쪽 도구 줄, 리더보드 아래에 둔다 */}
          {myCombo.combo >= 1 && (
            <div key={myCombo.key} className={myCombo.combo >= myCombo.flameAt ? 'combo-hud on-fire' : 'combo-hud'} role="status" aria-live="polite">
              <strong>{myCombo.combo >= myCombo.flameAt ? '🔥' : '⚔️'} {myCombo.combo} Combo</strong>
              <ComboTimer until={myCombo.until} />
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
          <ChatPanel ref={chatInputRef} lines={chatLines} disabled={status !== 'open'} onSend={sendChat} onKeyword={searchKeyword} onPlayer={setInfoPlayerId}
                     onNotice={showToast} collapsed={chatView === 'collapsed'}
                     onToggleCollapsed={() => setChatView((v) => (v === 'collapsed' ? 'open' : 'collapsed'))} />
        )}
        <div ref={joyRef} className="joystick" hidden aria-hidden="true"><div className="joystick-knob" /></div>
        {/* 칭호·스킬 해금 알림은 같은 자리(아래쪽)에 차례로 쌓는다: 레벨이 오르면 둘이 함께 뜰 수 있어서 서로 겹치지 않게 */}
        <div className="alert-stack">
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
          {unlockAlert && (
            <div key={unlockAlert.key} className="title-alert unlock-alert" role="status" aria-live="polite">
              <span className="title-alert-icon" aria-hidden="true"><SkillIcon code={unlockAlert.skills[0].code} icon={unlockAlert.skills[0].icon} /></span>
              <div className="title-alert-text">
                <span className="title-alert-kicker">{t('gamescreen.skillUnlockKicker', { n: unlockAlert.level })}</span>
                <strong>{unlockAlert.skills.map((k) => tOr(`skills.${k.code}_name`, k.code)).join(', ')}</strong>
                <span className="muted small">{t('gamescreen.skillUnlockEquip')}</span>
              </div>
              <div className="title-alert-actions">
                <button className="icon-button" onClick={() => setUnlockAlert(null)} aria-label={t('gamescreen.dismissAria')}>✕</button>
              </div>
              <span className="title-alert-timer" aria-hidden="true" style={{ animationDuration: '9s' }} />
            </div>
          )}
        </div>
        {/* 알림은 한 줄로 쌓는다(구슬 결과 → 공격 성공 → 잃음·일반): 서로 다른 자리에 겹쳐 뜨던 것을 한 묶음으로 */}
        <div className="notify-stack">
          {orbReveal && <OrbReveal key={orbReveal.key} result={orbReveal.result} />}
          {hit && <div key={hit.key} className="toast hit-toast" role="status">🎯 {hit.text}</div>}
          {toast && <div className="toast" role="status">{toast}</div>}
        </div>
      </div>
      <SidePanel onPlused={onPlused} refreshKey={refreshKey} onError={showToast} onHide={() => setSide(true)}
                 onOpenKeyword={setOpenKeyword} onSharePlayer={sharePlayer} searchRequest={searchRequest} openRequest={sideRequest} />
      {infoEntity !== null && (
        <PlayerInfoModal entityNo={infoEntity} bot={infoBot} look={infoLook} onClose={() => setInfoEntity(null)}
                         onOpenKeyword={(id) => { setInfoEntity(null); setOpenKeyword(id); }} onNotice={showToast} onShare={sharePlayer} />
      )}
      {infoPlayerId !== null && (
        <PlayerInfoModal entityNo={-1} playerId={infoPlayerId} onClose={() => setInfoPlayerId(null)}
                         onOpenKeyword={(id) => { setInfoPlayerId(null); setOpenKeyword(id); }} onNotice={showToast} onShare={sharePlayer} />
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
      {panel === 'wheel' && <WheelModal onClose={closePanel} onChange={setWheelReady} onSpun={() => setRefreshKey((k) => k + 1)} />}
      {panel === 'skills' && (
        <SkillWindow skills={skills} slots={slots} keys={slotKeys} level={player.level} onClose={closePanel} onNotice={showToast}
                     onChangeSlots={(next) => sendLoadoutRef.current(next)} onSetKey={setKey} onResetKeys={resetKeys} />
      )}
      {panel === 'profile' && (
        <ProfileModal key={profileView} player={player} onChanged={setPlayer} onClose={closePanel} guest={guest}
                      onLogout={onLogout} onWithdrawn={onWithdrawn} initialView={profileView} look={arenaRef.current?.meLook() ?? null} />
      )}

    </div>
    </div>
  );
}
