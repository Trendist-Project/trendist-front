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
import { FALLBACK, useSkills } from './useSkills';
import { isAimed } from './skillMeta';
import type { SkillLock } from './selfStatusMessages';
import { handleGameMessage, type GameMessageContext, type GameSession } from './gameMessages';
import { attachGameInput } from './gameInput';
import { actionOf, cacheSlotKeys, defaultSlotKeys, keysFromBindings, legacyChanges, loadSlotKeys, markLegacySynced, type SlotKeys } from '../game/skillKeys';
import { SkillWindow } from './SkillWindow';
import { BottomBar } from './BottomBar';
import { WheelModal } from './WheelModal';
import { successToast } from './toast';
import { loadSideHidden, saveSideHidden, loadMinimapPref, saveMinimapPref, loadLeaderboardPref, saveLeaderboardPref, loadChatView, saveChatView, loadHelpPref, saveHelpPref, pingQuality, type ChatView } from './gamePrefs';
import { LayersProvider, useLayer } from './layers';
import { useMultiTouchClicks } from './touchPress';
import { FullscreenIcon } from './FullscreenIcon';
import { canFullscreen as canFullscreenSupported, enterFullscreen, setAutoFullscreenPref } from '../fullscreen';
import { EmergencyBar, emergencyText, useEmergency } from './EmergencyBar';
import { fmtNumber, t, tOr } from '../i18n';
import { MonsterHud, MonsterNoteCard, type MonsterNote } from './MonsterHud';
import { SkillIcon } from './SkillIcon';

interface Props {
  initialPlayer: PlayerSummary;
  /** 구글이 연결되지 않은 게스트인지(4.1) */
  guest: boolean;
  onLogout(): void;
  /** 탈퇴를 마쳤다(토큰은 이미 지워졌다). 메인 화면으로 간다 */
  onWithdrawn(): void;
}


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

    // 서버 방에 들어간 뒤(welcome)부터 끊길 때까지만 ready. 메시지 처리(gameMessages)와 입력이 함께 쓴다
    const sess: GameSession = { ready: false, myEntity: -1, resyncDir: () => {} };
    arena.onView = (hw, hh) => { if (sess.ready) conn.send({ type: 'view', hw, hh }); }; // 관심 영역 전송: 내 화면 둘레의 원만 받는다
    const toLine = (m: ChatMessage): ChatLine => ({ id: m.id, e: m.e, nickname: m.nickname, text: m.text, at: m.at, mine: m.e === sess.myEntity });
    // 끌려오거나 스턴인 동안의 스킬 버튼 잠금: 끝나는 시각을 들고 있다가 시간이 지나면(조금 여유를 두고) 푼다
    const skillLock: SkillLock = {
      hold: (ms, pad, extend) => {
        const until = performance.now() + ms + pad;
        hookedUntilRef.current = extend ? Math.max(hookedUntilRef.current, until) : until; setHookedUntil(hookedUntilRef.current);
        window.setTimeout(() => setHookedUntil((u) => (u === hookedUntilRef.current ? null : u)), ms + pad + 50);
      },
      release: () => { hookedUntilRef.current = 0; setHookedUntil(null); },
    };
    const conn = new GameConnection({
      onSnapshot: (s) => arena.applySnapshot(s),
      onMinimap: (entries) => arena.setMinimap(entries),
      onStatus: (s) => {
        if (s !== 'open') { sess.ready = false; arena.clearControl(); }
        setStatus(s);
      },
      onMessage: (m: ServerMessage) => {
        handleGameMessage(m, ctx);
      },
    });
    connRef.current = conn;
    const ctx: GameMessageContext = {
      arena, conn, sess, skillLock, toLine, hookedUntilRef, myEntityRef, showReveal, showTitleAlert, showToast, applyEmergency,
      setPlayer, setOnline, setBots, setMonsterNote, setMyBossDmg, setKicked, setMyHp, setDead, setMyCombo, setHit, setDash, setSkillCd,
      setHookedUntil, setSlots, setRefreshKey, setOrbReveal, setPingMs, setChatLines,
    }; // 메시지는 연결이 열린 뒤에야 오므로 conn을 만든 다음에 묶어도 된다
    sendEmoteRef.current = (code: string) => { if (sess.ready) conn.send({ type: 'emote', code }); };
    // 대시(4.27): 쿨타임·움직이는 중인지는 서버가 보고, 시작하면 {type: 'dash'}로 알려 온다
    const sendDash = () => { if (sess.ready) conn.send({ type: 'dash' }); };
    sendDashRef.current = sendDash; // 모바일은 ⚡ 버튼으로 쓴다
    let aimPoint: () => { x: number; y: number } | null = () => null; // 입력(attachGameInput)이 붙은 뒤 바뀐다
    sendLoadoutRef.current = (s: (string | null)[]) => { if (sess.ready) conn.send({ type: 'loadout', slots: s }); };
    sendSkillRef.current = (id: string) => {
      if (!sess.ready) return;
      const aim = isAimed(id, skillsRef.current, FALLBACK) ? aimPoint() : null; // 겨누는 스킬만 겨눈 지점을 함께 보낸다(반발·충격파·흡수는 겨누지 않는다)
      conn.send(aim ? { type: 'skill', id, x: Math.round(aim.x), y: Math.round(aim.y) } : { type: 'skill', id });
    };
    conn.start();
    // 서버 왕복 시간을 2초마다 잰다(내 원 보정 허용 오차에 쓴다)
    const pingTimer = window.setInterval(() => conn.send({ type: 'ping', t: performance.now(), rtt: arenaRef.current?.rttMs() ?? 0 }), 2000);
    // 페이지를 떠날 때(구글 로그인으로 이동, 새로고침, 탭 닫기) 서버에 알려 바로 방에서 빠진다. 닫힘 신호가 늦거나 안 와도 유령으로 남지 않게
    const bye = () => conn.send({ type: 'bye' });
    window.addEventListener('pagehide', bye);

    // 키보드·마우스·터치(조이스틱) 입력(4.2, 4.11, 4.27, 4.33). 겨누는 지점(aimPoint)도 입력이 들고 있다
    const input = attachGameInput({
      arena, conn, sess, canvas: canvasRef.current!, joyEl: () => joyRef.current, sendDash, showToast,
      hookedUntilRef, slotsRef, levelRef, skillsRef, sendSkillRef, sendEmoteRef, chatOnRef, chatInputRef, emoteOpenRef,
      setMenuOpen, setEmoteOpen, setPanel, setTargetCard, setTargetTouch, setFollowUi,
      openInfo: (hit) => { setInfoBot(arena.botInfo(hit)); setInfoLook(arena.entityInfo(hit)?.look ?? null); setInfoEntity(hit); },
    });
    aimPoint = input.aimPoint;
    return () => {
      input.detach();
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
