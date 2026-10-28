import { useCallback, useEffect, useRef, useState } from 'react';
import type { PlayerSummary } from '../api/types';
import { Arena } from '../game/Arena';
import { GameConnection } from '../game/connection';
import type { ServerMessage } from '../game/protocol';
import { SidePanel } from './SidePanel';

interface Props { initialPlayer: PlayerSummary }

const KEYS: Record<string, [number, number]> = {
  ArrowUp: [0, -1], KeyW: [0, -1], ArrowDown: [0, 1], KeyS: [0, 1],
  ArrowLeft: [-1, 0], KeyA: [-1, 0], ArrowRight: [1, 0], KeyD: [1, 0],
};
const MOVE_INTERVAL_MS = 200; // 이동 명령은 초당 5회까지(4.2)

/** 미니맵 켜짐 여부는 이 브라우저에만 기억한다. 저장소를 못 쓰면 기본값(켜짐). */
const MINIMAP_KEY = 'trendist.minimap';
function loadMinimapPref() {
  try { return localStorage.getItem(MINIMAP_KEY) !== '0'; } catch { return true; }
}
function saveMinimapPref(visible: boolean) {
  try { localStorage.setItem(MINIMAP_KEY, visible ? '1' : '0'); } catch { /* 무시 */ }
}

export function GameScreen({ initialPlayer }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const arenaRef = useRef<Arena | null>(null);
  const connRef = useRef<GameConnection | null>(null);
  const [player, setPlayer] = useState(initialPlayer);
  const [online, setOnline] = useState(0);
  const [status, setStatus] = useState<'connecting' | 'open' | 'closed'>('connecting');
  const [toast, setToast] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [showMinimap, setShowMinimap] = useState(loadMinimapPref);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast((t) => (t === msg ? null : t)), 3500);
  }, []);

  useEffect(() => {
    const arena = new Arena(canvasRef.current!);
    arenaRef.current = arena;
    arena.start();
    const conn = new GameConnection({
      onSnapshot: (s) => arena.applySnapshot(s),
      onMinimap: (entries) => arena.setMinimap(entries),
      onStatus: setStatus,
      onMessage: (m: ServerMessage) => {
        switch (m.type) {
          case 'welcome': arena.setMe(m.entityNo, m.x, m.y); break;
          case 'tuning': arena.setTuning(m); break;
          case 'roster': arena.setRoster(m.players); setOnline(m.players.length); break;
          case 'score':
            setPlayer((p) => ({ ...p, currentScore: m.score, exp: m.exp, level: m.level, holdCount: m.holdCount }));
            break;
          case 'lost':
            showToast(`${m.by}와 부딪혀 '${m.keyword}'을(를) 잃었어요`);
            setRefreshKey((k) => k + 1);
            break;
        }
      },
    });
    connRef.current = conn;
    conn.start();

    // 방향키·WASD 입력. 입력창에 쓰는 중이면 무시한다.
    const pressed = new Set<string>();
    let lastSent = 0, pending: number | null = null;
    const sendDir = () => {
      let dx = 0, dy = 0;
      pressed.forEach((k) => { dx += KEYS[k][0]; dy += KEYS[k][1]; });
      arena.setInput(dx, dy);
      const now = performance.now();
      const fire = () => { lastSent = performance.now(); pending = null; conn.send({ type: 'input', dx, dy }); };
      if (now - lastSent >= MOVE_INTERVAL_MS) fire();
      else if (pending === null) pending = window.setTimeout(() => { pending = null; sendDir(); }, MOVE_INTERVAL_MS - (now - lastSent));
    };
    // 빈 바닥 클릭(탭): 그 지점으로 이동(4.2). 이동 중에 다시 찍으면 이전 목표를 버리고 새 지점으로 바로 바꾼다.
    // 서버에는 초당 5회까지만 보내되, 그 사이에 찍은 지점은 버리지 않고 마지막 지점을 이어서 보낸다.
    let moveTarget: { x: number; y: number } | null = null;
    let lastMoveSent = 0, movePending: number | null = null;
    const sendMove = () => {
      if (!moveTarget) return;
      const now = performance.now();
      if (now - lastMoveSent >= MOVE_INTERVAL_MS) {
        lastMoveSent = now;
        conn.send({ type: 'move', x: moveTarget.x, y: moveTarget.y });
      } else if (movePending === null) {
        movePending = window.setTimeout(() => { movePending = null; sendMove(); }, MOVE_INTERVAL_MS - (now - lastMoveSent));
      }
    };
    const canvas = canvasRef.current!;
    const pointerDown = (e: PointerEvent) => {
      if (e.button !== 0) return; // 왼쪽 버튼(터치·펜도 0)
      const p = arena.screenToWorld(e.clientX, e.clientY);
      pressed.clear(); // 방향키 이동 중이었다면 목표 이동으로 바꾼다(서버도 목표를 받으면 방향 입력을 지운다)
      arena.setTarget(p.x, p.y);
      moveTarget = p;
      sendMove();
    };
    canvas.addEventListener('pointerdown', pointerDown);

    const typing = (e: KeyboardEvent) => e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement;
    const down = (e: KeyboardEvent) => {
      if (typing(e)) return;
      // M: 미니맵 켜기/끄기. 한글 입력 상태(ㅡ)에서도 되도록 key가 아니라 code로 본다
      if (e.code === 'KeyM' && !e.repeat && !e.ctrlKey && !e.metaKey && !e.altKey) {
        setShowMinimap((v) => !v);
        return;
      }
      if (!(e.code in KEYS) || pressed.has(e.code)) return;
      e.preventDefault(); pressed.add(e.code); sendDir();
    };
    const up = (e: KeyboardEvent) => { if (pressed.delete(e.code)) sendDir(); };
    const blur = () => { pressed.clear(); sendDir(); }; // 창을 벗어나면 누르던 방향키를 놓은 것으로 본다
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
      canvas.removeEventListener('pointerdown', pointerDown);
      if (pending !== null) clearTimeout(pending);
      if (movePending !== null) clearTimeout(movePending);
      conn.stop();
      arena.stop();
    };
  }, [showToast]);

  useEffect(() => {
    arenaRef.current?.setMinimapVisible(showMinimap);
    saveMinimapPref(showMinimap);
  }, [showMinimap]);

  const onPlused = useCallback((gained: number, p: PlayerSummary) => {
    setPlayer(p);
    if (gained > 0) arenaRef.current?.floatText(`+${gained.toFixed(1)}`);
  }, []);

  return (
    <div className="game">
      <div className={showMinimap ? 'arena-wrap with-minimap' : 'arena-wrap'}>
        <canvas ref={canvasRef} className="arena"
                aria-label="아레나. 방향키나 WASD로 이동하고 빈 바닥을 클릭하면 그곳으로 이동해요" />
        <div className="hud">
          <span>현재 접속 {online}명</span>
          {status !== 'open' && <span className="warn">{status === 'connecting' ? '연결 중…' : '연결이 끊겼어요. 다시 연결하는 중…'}</span>}
        </div>
        <div className="hud-bottom">
          <strong>{player.nickname}</strong>
          <span>내 유행도 {Number(player.currentScore).toFixed(1)}</span>
          <span>🐢 {player.level}레벨</span>
          <span className="muted">EXP {player.exp}{player.nextLevelExp > 0 ? ` / ${player.nextLevelExp}` : ''}</span>
          <span className="muted">키워드 {player.holdCount}개</span>
        </div>
        <button className="minimap-toggle" aria-pressed={showMinimap} onClick={() => setShowMinimap((v) => !v)}
                title="미니맵 켜기/끄기 (M)">🗺 미니맵 <kbd>M</kbd></button>
        {toast && <div className="toast" role="status">{toast}</div>}
      </div>
      <SidePanel onPlused={onPlused} refreshKey={refreshKey} onError={showToast} />
    </div>
  );
}
