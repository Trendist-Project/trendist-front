import type { EntityState, MinimapEntry, Snapshot, Tuning } from './protocol';
import { drawTurtle, TURTLE_BASE } from './turtle';

interface Interp { prev: EntityState; cur: EntityState; at: number }

const SNAPSHOT_INTERVAL = 100; // 서버 스냅샷 10Hz
// 목표 속도로 다가가는 빠르기: 50ms마다 차이가 절반이 된다(서버 Room.ACCEL_RATE와 같은 값)
const ACCEL_RATE = Math.LN2 / 0.05;

/**
 * 내 아이콘 보정(떨림 방지). 서버 위치는 항상 조금 늦은 과거 위치라서, 매 스냅샷마다 당기면 움직이는 동안 계속 뒤로 끌려 떨린다.
 * 그래서 예측과 서버가 실제로 어긋났을 때만 맞추고, 화면 위치는 순간 이동 없이 부드럽게 따라가게 한다.
 */
const CORRECT_WHEN_STOPPED = 3;   // 둘 다 멈춰 있을 때 허용 오차(px). 네트워크 지연이 들쭉날쭉해 생기는 1~2px 차이로 멈춘 원이 다시 미끄러지지 않게
// 움직이는 중에는 최대 속도로 (이 시간 + 왕복 시간)만큼 간 거리까지는 지연으로 보고 그대로 둔다.
// 서버 위치는 왕복 시간만큼 늦게 도착하므로, 왕복 시간을 넣지 않으면 먼 곳에서 접속할수록 보정이 잦아진다.
const MOVING_TOLERANCE_SEC = 0.25;
const SNAP_DISTANCE = 300;        // 이보다 멀면(입장·순간 이동) 바로 맞춘다
const SMOOTH_TAU = 0.12;          // 화면 위치가 보정된 위치로 따라가는 시간 상수(초)
// 멈춰 있을 때 생긴 작은 보정은 화면에 바로 보여 주지 않고 다음에 움직일 때 섞어서 따라간다(멈춘 원이 혼자 움직여 보이지 않게).
// 이보다 크게 어긋나면 멈춰 있어도 따라간다
const HIDDEN_OFFSET_LIMIT = 12;
const GRID_SMALL = 50;
const GRID_BIG = 250;

/** 이동 목표 파동: 두 개의 띠가 바깥에서 안쪽으로 모여들며 사라진다. */
const RIPPLE_DURATION = 700;   // 띠 하나가 모여드는 시간(ms)
const RIPPLE_STAGGER = 180;    // 두 번째 띠가 늦게 출발하는 시간(ms)
const RIPPLE_RINGS = 2;
const RIPPLE_START_RADIUS = 46; // 화면 기준 시작 반지름(px). 줌과 관계없이 같은 크기로 보인다
const RIPPLE_BAND = 7;          // 띠 두께(px)

interface Ripple { x: number; y: number; at: number }

/** ? 구슬(4.20). 서버 반지름 14px, 화면에서는 위아래로 살짝 떠다닌다. */
const ORB_RADIUS = 14;
const ORB_GROW_MS = 350;   // 생길 때 커지는 시간
const ORB_EAT_MS = 380;    // 먹힐 때 원 안으로 빨려 들어가는 시간
const GULP_MS = 320;       // 먹은 원이 한 번 부풀었다 돌아오는 시간
interface Orb { x: number; y: number; born: number; phase: number }
interface EatenOrb { x: number; y: number; e: number; at: number }

/** 미니맵: 오른쪽 아래, 화면 짧은 변의 24%(110~180px). */
const BUBBLE_MS = 3000;
const MINIMAP_MIN = 110;
const MINIMAP_MAX = 180;
const MINIMAP_MARGIN = 12;

/**
 * 캔버스 아레나 렌더러(8절). 스냅샷은 React state가 아니라 이 객체에 둔다.
 * 내 아이콘은 입력으로 미리 움직이고(클라이언트 예측) 서버 위치로 부드럽게 보정한다. 다른 아이콘은 스냅샷 사이를 보간한다.
 */
export class Arena {
  private ctx: CanvasRenderingContext2D;
  private entities = new Map<number, Interp>();
  private names = new Map<number, { nickname: string; level: number }>();
  private half = 1500;
  private tuning: Tuning | null = null;
  private me = { e: -1, x: 0, y: 0, vx: 0, vy: 0, r: 16, initialized: false };
  /** 보정 때 생긴 화면 오프셋. 화면에는 me + offset을 그리고, offset은 0으로 줄어든다. */
  private offset = { x: 0, y: 0 };
  /** 카메라 중심 = 화면에 그리는 내 위치. */
  private view = { x: 0, y: 0 };
  private lastServerMe: { x: number; y: number } | null = null;
  /** 서버 쪽 내 원이 움직이는 중인지(튕김처럼 내가 조작하지 않아도 움직일 수 있다). */
  private serverMoving = false;
  /** 서버와의 왕복 시간(초). ping으로 재고 부드럽게 갱신한다. */
  private rtt = 0.1;
  private input = { dx: 0, dy: 0 };
  private target: { x: number; y: number } | null = null;
  private zoom = 1;
  private raf = 0;
  private last = performance.now();
  /** 내 위치 예측이 계산된 시각(ms). 조작이 바뀌는 순간까지 먼저 움직여 두고 바꿔서, 프레임 경계로 반올림되지 않게 한다. */
  private predictedAt = performance.now();
  private floatTexts: { text: string; at: number }[] = [];
  /** 채팅 말풍선(4.13): 보낸 사람 아이콘 위에 3초 */
  private bubbles = new Map<number, { text: string; at: number }>();
  private ripples: Ripple[] = [];
  private orbs = new Map<number, Orb>();
  private eatenOrbs: EatenOrb[] = [];
  private gulps = new Map<number, number>(); // 엔티티 번호 → 구슬을 먹은 시각
  private minimap: MinimapEntry[] = [];
  private minimapVisible = true;
  private bubblesVisible = true;
  private readonly reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

  constructor(private canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('canvas 2d not supported');
    this.ctx = ctx;
  }

  start() {
    const loop = (t: number) => {
      this.frame(t);
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  stop() { cancelAnimationFrame(this.raf); }

  setTuning(t: Tuning) { this.tuning = t; }
  /** 방에 (다시) 들어왔다. 서버의 새 멤버는 입력·목표가 없으므로 예측도 비우고 시작한다. */
  setMe(entityNo: number, x: number, y: number) {
    this.resetMe(entityNo, x, y);
    this.clearControl();
  }
  /** 입력·목표를 비운다. 연결이 끊기면 서버도 더 이상 움직이지 않으므로 예측도 멈춘다. */
  clearControl() { this.input = { dx: 0, dy: 0 }; this.target = null; }
  setRoster(players: { e: number; nickname: string; level: number }[]) {
    this.names = new Map(players.map((p) => [p.e, { nickname: p.nickname, level: p.level }]));
  }
  /**
   * 예측에 쓰는 입력. 서버로 보내는 순간에 같이 불러야 예측과 서버가 같은 입력으로 움직인다(서버 Room.setInput과 같게).
   */
  setInput(dx: number, dy: number) {
    this.predictUntil(performance.now());
    this.input = { dx, dy };
    if (dx || dy) this.target = null;
  }
  /** 새 목표가 이전 목표와 방향키 입력을 모두 대신한다(서버 Room.setTarget과 같게). 서버로 보낼 때 부른다. */
  setTarget(x: number, y: number) {
    this.predictUntil(performance.now());
    this.target = { x, y };
    this.input = { dx: 0, dy: 0 };
  }
  /** 클릭한 지점의 물결 효과. 서버 전송과 관계없이 클릭하는 즉시 보여 준다. */
  showRipple(x: number, y: number) {
    this.ripples.push({ x, y, at: performance.now() });
    if (this.ripples.length > 6) this.ripples.shift(); // 연타해도 쌓이지 않게
  }
  /** 입장할 때 받은 구슬 전체 목록. */
  setOrbs(list: [number, number, number][]) {
    const now = performance.now();
    this.orbs = new Map(list.map(([id, x, y]) => [id, { x, y, born: now - ORB_GROW_MS, phase: Math.random() * Math.PI * 2 }]));
  }
  addOrb(id: number, x: number, y: number) {
    this.orbs.set(id, { x, y, born: performance.now(), phase: Math.random() * Math.PI * 2 });
  }
  /** 누가(e) 구슬을 먹었다. e가 0이면 영역 밖으로 사라진 것이라 그냥 지운다. */
  eatOrb(id: number, e: number) {
    const o = this.orbs.get(id);
    this.orbs.delete(id);
    if (!o || e === 0) return;
    const now = performance.now();
    this.eatenOrbs.push({ x: o.x, y: o.y, e, at: now });
    this.gulps.set(e, now);
  }
  floatText(text: string) { this.floatTexts.push({ text, at: performance.now() }); }

  /** 채팅 말풍선을 그 엔티티 위에 띄운다. 같은 사람이 또 말하면 새 말로 바꾼다. */
  showBubble(e: number, text: string) { if (this.bubblesVisible) this.bubbles.set(e, { text, at: performance.now() }); }
  setMinimap(entries: MinimapEntry[]) { this.minimap = entries; }
  setMinimapVisible(visible: boolean) { this.minimapVisible = visible; }
  /** 채팅을 끄면 말풍선도 그리지 않는다. */
  setBubblesVisible(visible: boolean) { this.bubblesVisible = visible; if (!visible) this.bubbles.clear(); }
  /** ping 왕복 시간(ms)을 반영한다. 튀는 값에 흔들리지 않게 조금씩 따라간다. */
  updateRtt(ms: number) {
    if (!Number.isFinite(ms) || ms < 0 || ms > 5000) return;
    this.rtt += (ms / 1000 - this.rtt) * 0.2;
  }

  applySnapshot(s: Snapshot) {
    this.half = s.half;
    const seen = new Set<number>();
    for (const e of s.entities) {
      seen.add(e.e);
      const old = this.entities.get(e.e);
      this.entities.set(e.e, { prev: old ? this.current(old, s.receivedAt) : e, cur: e, at: s.receivedAt });
      if (e.me) this.reconcileMe(e);
    }
    for (const id of [...this.entities.keys()]) if (!seen.has(id)) this.entities.delete(id);
  }

  /** 화면 좌표 → 월드 좌표(클릭 이동). 화면에 보이는 위치 기준이다. */
  screenToWorld(px: number, py: number) {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: this.view.x + (px - rect.left - rect.width / 2) / this.zoom,
      y: this.view.y + (py - rect.top - rect.height / 2) / this.zoom,
    };
  }

  private resetMe(entityNo: number, x: number, y: number) {
    this.me = { ...this.me, e: entityNo, x, y, vx: 0, vy: 0, initialized: true };
    this.offset = { x: 0, y: 0 };
    this.view = { x, y };
    this.lastServerMe = null;
  }

  /** 서버가 보낸 내 위치와 예측을 맞춘다. 실제로 어긋났을 때만, 화면은 튀지 않게 고친다. */
  private reconcileMe(e: EntityState) {
    if (this.me.e !== e.e || !this.me.initialized) this.resetMe(e.e, e.x, e.y);
    this.me.r = e.r;
    const ex = e.x - this.me.x, ey = e.y - this.me.y, err = Math.hypot(ex, ey);
    const prev = this.lastServerMe;
    this.lastServerMe = { x: e.x, y: e.y };
    const serverMoving = prev !== null && Math.hypot(e.x - prev.x, e.y - prev.y) > 0.5;
    this.serverMoving = serverMoving;
    const meMoving = this.isMeMoving();
    const speed = this.tuning?.maxSpeed ?? 240;
    const tolerance = serverMoving || meMoving ? speed * (MOVING_TOLERANCE_SEC + this.rtt) : CORRECT_WHEN_STOPPED;
    if (err > SNAP_DISTANCE) {
      this.resetMe(e.e, e.x, e.y);
    } else if (err > tolerance) {
      // 예측 위치는 서버 위치로 옮기고, 화면에 그리는 위치는 그대로 둔 채 오프셋으로 천천히 따라간다
      this.me.x = e.x; this.me.y = e.y;
      this.offset.x -= ex; this.offset.y -= ey;
      if (import.meta.env.DEV) console.debug('[보정]', { err: +err.toFixed(2), serverMoving, meMoving });
    }
  }

  private isMeMoving() {
    return this.target !== null || this.input.dx !== 0 || this.input.dy !== 0 || Math.hypot(this.me.vx, this.me.vy) > 1;
  }

  private current(i: Interp, now: number): EntityState {
    const t = Math.min(1, (now - i.at) / SNAPSHOT_INTERVAL);
    return {
      ...i.cur,
      x: i.prev.x + (i.cur.x - i.prev.x) * t,
      y: i.prev.y + (i.cur.y - i.prev.y) * t,
      r: i.prev.r + (i.cur.r - i.prev.r) * t,
    };
  }

  /** 서버 Room.move와 같은 규칙으로 내 위치를 미리 움직인다(속도·감속·가속이 같아야 보정이 생기지 않는다). */
  private predictMe(dt: number) {
    const speed = this.tuning?.maxSpeed ?? 240; // 크기와 관계없이 같다
    let wantX = 0, wantY = 0;
    if (this.input.dx || this.input.dy) {
      const len = Math.hypot(this.input.dx, this.input.dy);
      const k = len > 1 ? 1 / len : 1;
      wantX = this.input.dx * k * speed; wantY = this.input.dy * k * speed;
    } else if (this.target) {
      const dx = this.target.x - this.me.x, dy = this.target.y - this.me.y, d = Math.hypot(dx, dy);
      if (d < 4) this.target = null;
      else { const s = speed * Math.min(1, d / 120); wantX = (dx / d) * s; wantY = (dy / d) * s; }
    }
    // 속도 차이가 지수로 줄어드는 식을 정확히 푼다. 서버와 같은 식이라 프레임 간격·틱 간격과 관계없이 같은 곳에 간다
    const e = Math.exp(-ACCEL_RATE * dt), moved = (1 - e) / ACCEL_RATE;
    this.me.x += wantX * dt + (this.me.vx - wantX) * moved; this.me.y += wantY * dt + (this.me.vy - wantY) * moved;
    this.me.vx = wantX + (this.me.vx - wantX) * e; this.me.vy = wantY + (this.me.vy - wantY) * e;
    const lim = this.half - this.me.r;
    this.me.x = Math.max(-lim, Math.min(lim, this.me.x));
    this.me.y = Math.max(-lim, Math.min(lim, this.me.y));
  }

  /** 예측을 now(ms)까지 진행한다. 탭이 멈췄다 돌아온 경우처럼 간격이 길면 0.1초까지만 움직인다. */
  private predictUntil(now: number) {
    const dt = Math.min(0.1, (now - this.predictedAt) / 1000);
    if (dt <= 0) return;
    this.predictedAt = now;
    if (this.me.initialized) this.predictMe(dt);
  }

  private frame(rafTime: number) {
    const dt = Math.min(0.1, (rafTime - this.last) / 1000);
    this.last = rafTime;
    const now = rafTime;
    this.predictUntil(performance.now()); // 조작 시각과 같은 시계로 잰다
    // 보정 오프셋은 움직이는 동안(또는 크게 어긋났을 때)만 줄인다. 멈춘 상태에서 작은 보정이 눈에 보이지 않게 하려는 것이다
    if (this.isMeMoving() || this.serverMoving || Math.hypot(this.offset.x, this.offset.y) > HIDDEN_OFFSET_LIMIT) {
      const decay = Math.exp(-dt / SMOOTH_TAU);
      this.offset.x *= decay; this.offset.y *= decay;
    }
    this.view = { x: this.me.x + this.offset.x, y: this.me.y + this.offset.y };

    const dpr = window.devicePixelRatio || 1;
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    if (this.canvas.width !== w * dpr || this.canvas.height !== h * dpr) {
      this.canvas.width = w * dpr; this.canvas.height = h * dpr;
    }
    const ctx = this.ctx;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // 줌: 1 / (1 + (r − 16) / 계수), 0.5초에 걸쳐 부드럽게(4.2)
    const minR = this.tuning?.minRadius ?? 16;
    const targetZoom = 1 / (1 + Math.max(0, this.me.r - minR) / (this.tuning?.zoomFactor ?? 170));
    this.zoom += (targetZoom - this.zoom) * Math.min(1, dt * 6);

    // 아레나 바깥은 어둡게
    ctx.fillStyle = '#0b0f17';
    ctx.fillRect(0, 0, w, h);
    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.scale(this.zoom, this.zoom);
    ctx.translate(-this.view.x, -this.view.y);

    const half = this.half;
    ctx.fillStyle = '#1f2a37'; // 짙은 회청색 바닥
    ctx.fillRect(-half, -half, half * 2, half * 2);
    this.drawGrid(ctx, w, h);
    ctx.strokeStyle = 'rgba(255,255,255,0.6)';
    ctx.lineWidth = 4 / this.zoom;
    ctx.strokeRect(-half, -half, half * 2, half * 2);

    this.drawRipples(ctx, now);
    this.drawOrbs(ctx, now, w, h);

    // 작은 아이콘을 위에 그리려고 큰 것부터
    const list = [...this.entities.values()].map((i) => {
      const s = this.current(i, now);
      const r = s.r * this.gulpScale(s.e, now);
      return s.me ? { ...s, x: this.view.x, y: this.view.y, r } : { ...s, r };
    }).sort((a, b) => b.r - a.r);
    const viewHalfW = w / 2 / this.zoom, viewHalfH = h / 2 / this.zoom;
    for (const e of list) {
      if (Math.abs(e.x - this.view.x) > viewHalfW + e.r || Math.abs(e.y - this.view.y) > viewHalfH + e.r) continue; // 화면 밖은 그리지 않는다
      this.drawEntity(ctx, e);
    }
    this.drawEatenOrbs(ctx, now);
    this.drawBubbles(ctx, now);
    ctx.restore();
    this.drawFloatTexts(ctx, w, h, now);
    if (this.minimapVisible && this.me.initialized) this.drawMinimap(ctx, w, h);
  }

  /** 미니맵(4.2): 활동 영역 전체에 큰 아이콘 상위 20명, 내 위치, 지금 화면에 보이는 범위를 그린다. */
  private drawMinimap(ctx: CanvasRenderingContext2D, w: number, h: number) {
    const size = Math.round(Math.max(MINIMAP_MIN, Math.min(MINIMAP_MAX, Math.min(w, h) * 0.24)));
    const x0 = w - size - MINIMAP_MARGIN, y0 = h - size - MINIMAP_MARGIN;
    const s = size / (this.half * 2);
    const toX = (wx: number) => x0 + (wx + this.half) * s;
    const toY = (wy: number) => y0 + (wy + this.half) * s;

    ctx.save();
    ctx.fillStyle = 'rgba(11,15,23,0.72)';
    ctx.fillRect(x0, y0, size, size);
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x0 + 0.5, y0 + 0.5, size - 1, size - 1);
    ctx.beginPath(); ctx.rect(x0, y0, size, size); ctx.clip();

    // 지금 화면에 보이는 범위
    const vw = (w / this.zoom) * s, vh = (h / this.zoom) * s;
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.strokeRect(toX(this.view.x) - vw / 2, toY(this.view.y) - vh / 2, vw, vh);

    // ? 구슬은 작은 금색 점으로
    ctx.fillStyle = 'rgba(255,200,74,0.9)';
    for (const o of this.orbs.values()) {
      ctx.beginPath(); ctx.arc(toX(o.x), toY(o.y), 1.6, 0, Math.PI * 2); ctx.fill();
    }
    ctx.fillStyle = 'rgba(200,215,235,0.75)';
    for (const m of this.minimap) {
      if (m.e === this.me.e) continue; // 나는 예측 위치로 따로 그린다
      ctx.beginPath(); ctx.arc(toX(m.x), toY(m.y), Math.max(2, m.r * s), 0, Math.PI * 2); ctx.fill();
    }
    ctx.fillStyle = '#3fb68b';
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(toX(this.view.x), toY(this.view.y), Math.max(3, this.me.r * s), 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();
    ctx.restore();
  }

  private drawGrid(ctx: CanvasRenderingContext2D, w: number, h: number) {
    const half = this.half;
    const vw = w / 2 / this.zoom, vh = h / 2 / this.zoom;
    const x0 = Math.max(-half, this.view.x - vw), x1 = Math.min(half, this.view.x + vw);
    const y0 = Math.max(-half, this.view.y - vh), y1 = Math.min(half, this.view.y + vh);
    for (const [step, width] of [[GRID_SMALL, 1], [GRID_BIG, 2]] as const) {
      if (step * this.zoom < 6) continue; // 너무 촘촘하면 생략
      ctx.strokeStyle = 'rgba(220,230,255,0.15)';
      ctx.lineWidth = width / this.zoom;
      ctx.beginPath();
      for (let x = Math.ceil(x0 / step) * step; x <= x1; x += step) { ctx.moveTo(x, y0); ctx.lineTo(x, y1); }
      for (let y = Math.ceil(y0 / step) * step; y <= y1; y += step) { ctx.moveTo(x0, y); ctx.lineTo(x1, y); }
      ctx.stroke();
    }
  }

  private drawEntity(ctx: CanvasRenderingContext2D, e: EntityState) {
    const lvl = Math.min(e.level, 10);
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.45)';
    ctx.shadowBlur = 8 / this.zoom;
    ctx.fillStyle = TURTLE_BASE; // 성장 캐릭터(거북이)의 정해진 바탕색
    ctx.beginPath(); ctx.arc(e.x, e.y, e.r, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    // 레벨이 오를수록 거북이 부위가 하나씩 생기고 선명해진다(4.9). 테두리를 그 위에 그려 가장자리를 깔끔하게 덮는다
    drawTurtle(ctx, e.x, e.y, e.r, lvl);
    ctx.strokeStyle = '#11372a';
    ctx.lineWidth = Math.max(2, e.r * 0.08);
    ctx.beginPath(); ctx.arc(e.x, e.y, e.r, 0, Math.PI * 2); ctx.stroke();
    if (e.me) {
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = Math.max(2, 3 / this.zoom);
      ctx.beginPath(); ctx.arc(e.x, e.y, e.r + 4 / this.zoom, 0, Math.PI * 2); ctx.stroke();
    }
    const info = this.names.get(e.e);
    if (info) {
      const fs = Math.max(12 / this.zoom, Math.min(e.r * 0.45, 40));
      ctx.font = `600 ${fs}px "Noto Sans KR", system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.lineWidth = fs / 5;
      ctx.strokeStyle = 'rgba(0,0,0,0.7)';
      ctx.fillStyle = '#ffffff';
      const label = info.nickname; // 닉네임은 항상 텍스트로만 그린다
      ctx.strokeText(label, e.x, e.y + e.r + 4 / this.zoom);
      ctx.fillText(label, e.x, e.y + e.r + 4 / this.zoom);
    }
  }

  /** 클릭한 지점의 파동. 띠 두 개가 시차를 두고 바깥에서 안쪽으로 모이며 옅어진다. */
  private drawRipples(ctx: CanvasRenderingContext2D, now: number) {
    const total = RIPPLE_DURATION + RIPPLE_STAGGER * (RIPPLE_RINGS - 1);
    this.ripples = this.ripples.filter((r) => now - r.at < total);
    const z = this.zoom;
    for (const r of this.ripples) {
      if (this.reducedMotion) {
        // 움직임을 줄이는 설정이면 모여드는 대신 제자리에서 옅어지는 링 하나만 보여 준다
        const t = (now - r.at) / total;
        ctx.strokeStyle = `rgba(255,255,255,${0.6 * (1 - t)})`;
        ctx.lineWidth = 2 / z;
        ctx.beginPath(); ctx.arc(r.x, r.y, 14 / z, 0, Math.PI * 2); ctx.stroke();
        continue;
      }
      for (let i = 0; i < RIPPLE_RINGS; i++) {
        const t = (now - r.at - i * RIPPLE_STAGGER) / RIPPLE_DURATION;
        if (t < 0 || t >= 1) continue;
        const ease = 1 - (1 - t) ** 3;                 // 처음엔 빠르게, 중심에 가까울수록 천천히
        const radius = (RIPPLE_START_RADIUS * (1 - ease)) / z;
        const band = (RIPPLE_BAND * (1 - t * 0.7)) / z; // 모일수록 띠가 얇아진다
        const alpha = Math.sin(Math.PI * Math.min(1, t * 1.15)) * 0.85; // 나타났다가 사라진다
        if (radius <= band / 2 || alpha <= 0) continue;
        // 바깥쪽이 진하고 안쪽이 옅은 물결 띠
        const inner = Math.max(0, radius - band), outer = radius + band / 2;
        const g = ctx.createRadialGradient(r.x, r.y, inner, r.x, r.y, outer);
        g.addColorStop(0, 'rgba(180,235,255,0)');
        g.addColorStop(0.65, `rgba(200,240,255,${alpha * 0.55})`);
        g.addColorStop(0.85, `rgba(255,255,255,${alpha})`);
        g.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(r.x, r.y, outer, 0, Math.PI * 2);
        ctx.arc(r.x, r.y, inner, 0, Math.PI * 2, true);
        ctx.fill('evenodd');
      }
      // 마지막에 중심에 작은 점이 맺혔다가 사라진다
      const tc = (now - r.at - (total - 160)) / 160;
      if (tc > 0 && tc < 1) {
        ctx.fillStyle = `rgba(255,255,255,${0.7 * (1 - tc)})`;
        ctx.beginPath(); ctx.arc(r.x, r.y, (3 * (1 - tc * 0.5)) / z, 0, Math.PI * 2); ctx.fill();
      }
    }
  }

  /** 구슬을 먹은 원은 잠깐 부풀었다 돌아온다(삼키는 느낌). */
  private gulpScale(e: number, now: number) {
    const at = this.gulps.get(e);
    if (at === undefined) return 1;
    const t = (now - at - ORB_EAT_MS * 0.6) / GULP_MS; // 구슬이 거의 들어갔을 때 부푼다
    if (t >= 1) { this.gulps.delete(e); return 1; }
    if (t <= 0 || this.reducedMotion) return 1;
    return 1 + 0.12 * Math.sin(Math.PI * t);
  }

  /** 채팅 말풍선: 아이콘 바로 위, 화면 기준 일정한 글자 크기. 3초 뒤 사라지고 마지막 0.4초에 옅어진다. */
  private drawBubbles(ctx: CanvasRenderingContext2D, now: number) {
    const z = this.zoom;
    for (const [e, b] of this.bubbles) {
      const age = now - b.at;
      if (age > BUBBLE_MS) { this.bubbles.delete(e); continue; }
      const pos = this.entityPos(e, now);
      if (!pos) continue;
      const lines = wrapText(b.text, 18, 3);
      const fs = 13 / z, lh = fs * 1.35, padX = 9 / z, padY = 6 / z;
      ctx.font = `500 ${fs}px "Noto Sans KR", system-ui, sans-serif`;
      const tw = Math.max(...lines.map((l) => ctx.measureText(l).width));
      const bw = tw + padX * 2, bh = lines.length * lh + padY * 2;
      const bx = pos.x - bw / 2, by = pos.y - pos.r - 10 / z - bh;
      ctx.save();
      ctx.globalAlpha = Math.min(1, (BUBBLE_MS - age) / 400, age / 120);
      ctx.fillStyle = 'rgba(255,255,255,0.95)';
      ctx.beginPath();
      ctx.roundRect(bx, by, bw, bh, 8 / z);
      ctx.moveTo(pos.x - 6 / z, by + bh); ctx.lineTo(pos.x, by + bh + 7 / z); ctx.lineTo(pos.x + 6 / z, by + bh);
      ctx.fill();
      ctx.fillStyle = '#0b0f17';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      lines.forEach((l, i) => ctx.fillText(l, pos.x, by + padY + i * lh)); // 채팅은 항상 텍스트로만 그린다
      ctx.restore();
    }
  }

  /** 지금 화면에 그려지는 엔티티 위치(나는 예측 위치). */
  private entityPos(e: number, now: number) {
    if (e === this.me.e) return { x: this.view.x, y: this.view.y, r: this.me.r };
    const i = this.entities.get(e);
    return i ? this.current(i, now) : null;
  }

  private drawOrbs(ctx: CanvasRenderingContext2D, now: number, w: number, h: number) {
    if (this.orbs.size === 0) return;
    const z = this.zoom;
    const viewHalfW = w / 2 / z, viewHalfH = h / 2 / z;
    for (const o of this.orbs.values()) {
      if (Math.abs(o.x - this.view.x) > viewHalfW + 40 || Math.abs(o.y - this.view.y) > viewHalfH + 40) continue;
      const grow = Math.min(1, (now - o.born) / ORB_GROW_MS);
      const pop = grow < 1 ? 1 - (1 - grow) ** 3 : 1;
      const bob = this.reducedMotion ? 0 : Math.sin(now / 520 + o.phase) * 4; // 둥실둥실
      const pulse = this.reducedMotion ? 1 : 1 + Math.sin(now / 300 + o.phase) * 0.06;
      const r = Math.max(ORB_RADIUS, 9 / z) * pop * pulse; // 멀리서 봐도 보이게
      this.drawOrbBall(ctx, o.x, o.y + bob, r, 1);
    }
  }

  private drawOrbBall(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, alpha: number) {
    ctx.globalAlpha = alpha;
    const glow = ctx.createRadialGradient(x, y, r * 0.4, x, y, r * 2.2);
    glow.addColorStop(0, 'rgba(255,209,102,0.55)');
    glow.addColorStop(1, 'rgba(255,209,102,0)');
    ctx.fillStyle = glow;
    ctx.beginPath(); ctx.arc(x, y, r * 2.2, 0, Math.PI * 2); ctx.fill();
    const body = ctx.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r);
    body.addColorStop(0, '#fff3c4');
    body.addColorStop(0.55, '#ffc84a');
    body.addColorStop(1, '#e08a00');
    ctx.fillStyle = body;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    ctx.lineWidth = Math.max(1.5, r * 0.12);
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.stroke();
    ctx.fillStyle = '#5a3200';
    ctx.font = `800 ${Math.round(r * 1.25)}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('?', x, y + r * 0.06);
    ctx.textBaseline = 'alphabetic';
    ctx.globalAlpha = 1;
  }

  /** 먹힌 구슬: 먹은 원 가운데로 빨려 들어가며 작아지고, 반짝이는 고리가 퍼진다. */
  private drawEatenOrbs(ctx: CanvasRenderingContext2D, now: number) {
    this.eatenOrbs = this.eatenOrbs.filter((o) => now - o.at < ORB_EAT_MS + 260);
    const z = this.zoom;
    for (const o of this.eatenOrbs) {
      const target = this.entityPos(o.e, now);
      const t = Math.min(1, (now - o.at) / ORB_EAT_MS);
      if (t < 1) {
        const ease = t * t * (3 - 2 * t);
        const tx = target ? target.x : o.x, ty = target ? target.y : o.y;
        const x = this.reducedMotion ? o.x : o.x + (tx - o.x) * ease;
        const y = this.reducedMotion ? o.y : o.y + (ty - o.y) * ease;
        this.drawOrbBall(ctx, x, y, Math.max(ORB_RADIUS, 9 / z) * (1 - ease * 0.85), 1 - t * 0.5);
      }
      // 먹은 원 둘레에서 금빛 고리가 퍼지며 사라진다
      const tr = (now - o.at - ORB_EAT_MS * 0.6) / 420;
      if (target && tr > 0 && tr < 1) {
        ctx.strokeStyle = `rgba(255,209,102,${0.9 * (1 - tr)})`;
        ctx.lineWidth = (4 * (1 - tr) + 1) / z;
        ctx.beginPath(); ctx.arc(target.x, target.y, target.r + (8 + 26 * tr) / z, 0, Math.PI * 2); ctx.stroke();
        if (!this.reducedMotion) {
          ctx.fillStyle = `rgba(255,240,180,${1 - tr})`;
          for (let k = 0; k < 8; k++) {
            const a = (k / 8) * Math.PI * 2 + o.at;
            const d = target.r + (6 + 34 * tr) / z;
            ctx.beginPath(); ctx.arc(target.x + Math.cos(a) * d, target.y + Math.sin(a) * d, (2.5 * (1 - tr) + 0.5) / z, 0, Math.PI * 2); ctx.fill();
          }
        }
      }
    }
  }

  private drawFloatTexts(ctx: CanvasRenderingContext2D, w: number, h: number, now: number) {
    this.floatTexts = this.floatTexts.filter((f) => now - f.at < 1200);
    for (const f of this.floatTexts) {
      const t = (now - f.at) / 1200;
      ctx.globalAlpha = 1 - t;
      ctx.font = '700 22px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#ffd166';
      ctx.fillText(f.text, w / 2, h / 2 - this.me.r * this.zoom - 20 - t * 40);
      ctx.globalAlpha = 1;
    }
  }
}

/** 말풍선 줄바꿈: 글자 수 기준으로 자르고 maxLines를 넘으면 말줄임표. */
function wrapText(text: string, perLine: number, maxLines: number) {
  const chars = [...text], lines: string[] = [];
  for (let i = 0; i < chars.length && lines.length < maxLines; i += perLine) lines.push(chars.slice(i, i + perLine).join(''));
  if (chars.length > perLine * maxLines) lines[maxLines - 1] = lines[maxLines - 1].slice(0, -1) + '…';
  return lines;
}
