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
    const blur = () => { pressed.clear(); sendDir(); conn.send({ type: 'focus', focused: false }); };
    const focus = () => conn.send({ type: 'focus', focused: true });
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    window.addEventListener('focus', focus);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
      window.removeEventListener('focus', focus);
      if (pending !== null) clearTimeout(pending);
      conn.stop();
      arena.stop();
    };
  }, [showToast]);

  useEffect(() => {
    arenaRef.current?.setMinimapVisible(showMinimap);
    saveMinimapPref(showMinimap);
  }, [showMinimap]);

  /** 빈 바닥 더블클릭(더블탭): 그 지점으로 이동(4.2). */
  function onDoubleClick(e: React.MouseEvent) {
    const arena = arenaRef.current;
    if (!arena) return;
    const p = arena.screenToWorld(e.clientX, e.clientY);
    arena.setTarget(p.x, p.y);
    connRef.current?.send({ type: 'move', x: p.x, y: p.y });
  }

  const onPlused = useCallback((gained: number, p: PlayerSummary) => {
    setPlayer(p);
    if (gained > 0) arenaRef.current?.floatText(`+${gained.toFixed(1)}`);
  }, []);

  return (
    <div className="game">
      <div className={showMinimap ? 'arena-wrap with-minimap' : 'arena-wrap'}>
        <canvas ref={canvasRef} className="arena" onDoubleClick={onDoubleClick}
                aria-label="아레나. 방향키나 WASD로 이동하고 빈 바닥을 더블클릭하면 그곳으로 이동해요" />
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
