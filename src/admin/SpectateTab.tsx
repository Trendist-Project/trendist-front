import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Arena } from '../game/Arena';
import { GameConnection } from '../game/connection';
import type { ChatMessage, ServerMessage } from '../game/protocol';

const COUNTRY = 'KR';
const CHAT_KEEP = 100;
const LIST_LIMIT = 300;

type Row = ReturnType<Arena['spectatorList']>[number];
type Status = 'connecting' | 'open' | 'closed';

/**
 * 아레나 관전(13.13): 원 없이 관리자가 방을 지켜본다. 서버는 이 접속을 플레이어로 세지 않아 랭킹·접속 인원·충돌에 영향이 없고,
 * 방이 모두에게 보내는 스냅샷만 받는다. 휠·버튼으로 확대·축소, 끌어서 이동, 원을 눌러 따라가기, 미니맵을 눌러 이동.
 */
export function SpectateTab() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const arenaRef = useRef<Arena | null>(null);
  const [status, setStatus] = useState<Status>('connecting');
  const [rows, setRows] = useState<Row[]>([]);
  const [view, setView] = useState({ zoom: 0, follow: null as number | null, fit: true });
  const [chat, setChat] = useState<ChatMessage[]>([]);
  const [query, setQuery] = useState('');
  const [showBots, setShowBots] = useState(true);
  const [spectators, setSpectators] = useState(1);
  const [full, setFull] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const arena = new Arena(canvas);
    arena.enableSpectator();
    arenaRef.current = arena;
    arena.start();
    const conn = new GameConnection({
      onSnapshot: (s) => arena.applySnapshot(s),
      onMinimap: (m) => arena.setMinimap(m),
      onStatus: setStatus,
      onMessage: (m: ServerMessage) => {
        switch (m.type) {
          case 'spectating': setSpectators(m.spectators); setFull(false); break;
          case 'tuning': arena.setTuning(m); break;
          case 'roster': arena.setRoster(m.players, m.flameAt); break;
          case 'orbs': arena.setOrbs(m.orbs); break;
          case 'orbSpawn': arena.addOrb(m.id, m.x, m.y, m.prize); break;
          case 'orbEaten': arena.eatOrb(m.id, m.e); break;
          case 'safeZones': arena.setSafeZones(m.center, m.zones); break;
          case 'shield': arena.showShield(m.e, m.ms); break;
          case 'emote': arena.showEmote(m.e, m.code); break;
          case 'combo': arena.setCombo(m.e, m.combo, m.flameAt); break;
          case 'chat':
            arena.showBubble(m.e, m.text);
            setChat((c) => [...c, m].slice(-CHAT_KEEP));
            break;
          case 'chatHistory':
            setChat((c) => {
              const seen = new Set(c.map((x) => x.id));
              return [...c, ...m.messages.filter((x) => !seen.has(x.id))].sort((a, b) => a.id - b.id).slice(-CHAT_KEEP);
            });
            break;
        }
      },
    }, { country: COUNTRY });
    conn.start();
    // 서버가 90초 동안 아무 신호가 없으면 관전도 정리한다. 2초마다 살아 있음을 알린다
    const ping = window.setInterval(() => conn.send({ type: 'ping', t: performance.now() }), 2000);
    const bye = () => conn.send({ type: 'bye' });
    window.addEventListener('pagehide', bye);
    // 목록·배율 표시는 0.5초마다 새로 읽는다(그림은 따로 매 프레임 그린다)
    const refresh = window.setInterval(() => {
      setRows(arena.spectatorList());
      const st = arena.spectatorState();
      setView((v) => (v.zoom === st.zoom && v.follow === st.follow && v.fit === st.fit ? v : { zoom: st.zoom, follow: st.follow, fit: st.fit }));
    }, 500);
    return () => {
      window.clearInterval(ping); window.clearInterval(refresh);
      window.removeEventListener('pagehide', bye);
      conn.send({ type: 'bye' });
      conn.stop(); arena.stop();
      arenaRef.current = null;
    };
  }, []);

  // 방이 가득 찬 경우(관전자 10명)를 알린다: 끊기고 다시 붙지 못하는 상태가 계속되면 안내
  useEffect(() => {
    if (status !== 'closed') return;
    const t = window.setTimeout(() => setFull(true), 8000);
    return () => window.clearTimeout(t);
  }, [status]);

  // ---- 손·마우스 조작: 끌기(이동), 휠(확대·축소), 두 손가락 벌리기(확대·축소), 짧게 누르기(원 따라가기·미니맵 이동)
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef({ moved: 0, pinch: 0 });

  const follow = useCallback((e: number | null) => {
    const a = arenaRef.current;
    if (!a) return;
    if (e !== null && a.spectatorState().zoom < 0.4) a.spectatorSetZoom(0.6); // 멀리서 골랐으면 알아볼 만큼 당긴다
    a.spectatorFollow(e);
  }, []);

  const onPointerDown = (ev: React.PointerEvent) => {
    (ev.currentTarget as HTMLElement).setPointerCapture(ev.pointerId);
    pointers.current.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
    gesture.current = { moved: 0, pinch: pointers.current.size === 2 ? pinchDistance(pointers.current) : 0 };
  };
  const onPointerMove = (ev: React.PointerEvent) => {
    const a = arenaRef.current, prev = pointers.current.get(ev.pointerId);
    if (!a || !prev) return;
    const cur = { x: ev.clientX, y: ev.clientY };
    pointers.current.set(ev.pointerId, cur);
    if (pointers.current.size === 2) {
      const d = pinchDistance(pointers.current);
      if (gesture.current.pinch > 0 && d > 0) {
        const c = pinchCenter(pointers.current);
        a.spectatorZoomBy(d / gesture.current.pinch, c.x, c.y);
      }
      gesture.current.pinch = d; gesture.current.moved = 99;
      return;
    }
    const dx = cur.x - prev.x, dy = cur.y - prev.y;
    gesture.current.moved += Math.abs(dx) + Math.abs(dy);
    if (gesture.current.moved > 6) a.spectatorPan(dx, dy);
  };
  const onPointerUp = (ev: React.PointerEvent) => {
    const a = arenaRef.current;
    const wasClick = pointers.current.size === 1 && gesture.current.moved <= 6;
    pointers.current.delete(ev.pointerId);
    gesture.current.pinch = 0;
    if (!a || !wasClick) return;
    if (a.spectatorJumpFromMinimap(ev.clientX, ev.clientY)) return;
    const hit = a.entityAt(ev.clientX, ev.clientY);
    if (hit !== null) follow(hit === a.spectatorState().follow ? null : hit);
  };
  // 휠은 페이지 스크롤과 겹치지 않게 passive가 아닌 리스너로 직접 단다
  useEffect(() => {
    const el = canvasRef.current!;
    const onWheel = (ev: WheelEvent) => {
      ev.preventDefault();
      arenaRef.current?.spectatorZoomBy(Math.exp(-ev.deltaY * 0.0015), ev.clientX, ev.clientY);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);
  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      const t = ev.target as HTMLElement;
      if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA') return;
      const a = arenaRef.current;
      if (!a) return;
      if (ev.key === '+' || ev.key === '=') a.spectatorZoomBy(1.25);
      else if (ev.key === '-' || ev.key === '_') a.spectatorZoomBy(0.8);
      else if (ev.key === '0') a.spectatorFit();
      else if (ev.key === 'Escape') a.spectatorFollow(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const humans = rows.filter((r) => !r.bot).length, bots = rows.length - humans;
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => (showBots || !r.bot) && (!q || r.nickname.toLowerCase().includes(q))).slice(0, LIST_LIMIT);
  }, [rows, query, showBots]);
  const followed = rows.find((r) => r.e === view.follow) ?? null;
  const zoomPct = view.zoom > 0 ? `${Math.round(view.zoom * 100)}%` : '-';

  return (
    <section className="admin-panel">
      <header className="ap-head">
        <div>
          <h2>아레나 관전</h2>
          <p>원 없이 지금 방을 지켜봐요. 랭킹·접속 인원·충돌에는 아무 영향이 없어요(관리자만 볼 수 있어요).</p>
        </div>
        <span className={`mon-status ${status}`} role="status">
          {status === 'open' ? '연결됨' : status === 'connecting' ? '연결 중…' : full ? '연결하지 못했어요(관전자가 가득 찼을 수 있어요)' : '끊김 · 다시 연결 중'}
        </span>
      </header>

      <div className="mon-layout">
        <div className="mon-stage">
          <canvas ref={canvasRef} className="arena mon-canvas" aria-label="아레나 관전 화면"
                  onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp} />
          <div className="mon-tools">
            <button onClick={() => arenaRef.current?.spectatorZoomBy(0.8)} aria-label="축소" title="축소 (-)">−</button>
            <span className="mon-zoom" aria-live="off">{view.fit ? '전체' : zoomPct}</span>
            <button onClick={() => arenaRef.current?.spectatorZoomBy(1.25)} aria-label="확대" title="확대 (+)">+</button>
            <button onClick={() => arenaRef.current?.spectatorFit()} className={view.fit ? 'on' : undefined} title="아레나 전체 보기 (0)">전체</button>
            <button onClick={() => arenaRef.current?.spectatorSetZoom(1)} title="실제 크기">100%</button>
            {view.follow !== null && <button onClick={() => arenaRef.current?.spectatorFollow(null)} title="따라가기 해제 (Esc)">따라가기 해제</button>}
          </div>
          <p className="mon-hint">휠·두 손가락: 확대·축소 · 끌기: 이동 · 원을 누르면 따라가기 · 미니맵을 누르면 이동</p>
        </div>

        <aside className="mon-side">
          <div className="mon-counts">
            <span><b>{humans}</b>명</span><span><b>{bots}</b> 봇</span><span>관전 <b>{spectators}</b></span>
          </div>
          {followed && (
            <div className="mon-follow">
              <strong>{followed.nickname}</strong>
              <span>Lv.{followed.level} · {followed.score.toLocaleString()}점 · 크기 {followed.r}{followed.combo > 0 ? ` · 🔥${followed.combo}콤보` : ''}</span>
            </div>
          )}
          <div className="mon-search">
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="닉네임으로 찾기" aria-label="플레이어 찾기" />
            <label className="mon-check"><input type="checkbox" checked={showBots} onChange={(e) => setShowBots(e.target.checked)} />봇</label>
          </div>
          <ul className="mon-list">
            {shown.map((r) => (
              <li key={r.e}>
                <button className={r.e === view.follow ? 'on' : undefined} onClick={() => follow(r.e === view.follow ? null : r.e)}>
                  <span className="mon-name">{r.bot ? '🤖 ' : ''}{r.nickname}{r.combo >= 5 ? ' 🔥' : ''}</span>
                  <span className="mon-lv">Lv.{r.level}</span>
                  <span className="mon-score">{r.score.toLocaleString()}</span>
                </button>
              </li>
            ))}
            {rows.length > 0 && shown.length === 0 && <li className="mon-empty">찾는 플레이어가 없어요</li>}
            {rows.length === 0 && <li className="mon-empty">{status === 'open' ? '지금 방이 비어 있어요' : '연결하는 중…'}</li>}
          </ul>
          <h3 className="mon-chat-title">채팅</h3>
          <ul className="mon-chat">
            {chat.length === 0 && <li className="mon-empty">아직 채팅이 없어요</li>}
            {[...chat].reverse().map((c) => (
              <li key={c.id}><time>{new Date(c.at).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}</time><b>{c.nickname}</b> {c.text}</li>
            ))}
          </ul>
        </aside>
      </div>
    </section>
  );
}

function pinchDistance(m: Map<number, { x: number; y: number }>) {
  const [a, b] = [...m.values()];
  return Math.hypot(a.x - b.x, a.y - b.y);
}
function pinchCenter(m: Map<number, { x: number; y: number }>) {
  const [a, b] = [...m.values()];
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}
