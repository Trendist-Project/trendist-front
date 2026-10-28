import type { EntityState, MinimapEntry, Snapshot, Tuning } from './protocol';

interface Interp { prev: EntityState; cur: EntityState; at: number }

const SNAPSHOT_INTERVAL = 100; // 서버 스냅샷 10Hz
const GRID_SMALL = 50;
const GRID_BIG = 250;

/** 이동 목표 파동: 두 개의 띠가 바깥에서 안쪽으로 모여들며 사라진다. */
const RIPPLE_DURATION = 700;   // 띠 하나가 모여드는 시간(ms)
const RIPPLE_STAGGER = 180;    // 두 번째 띠가 늦게 출발하는 시간(ms)
const RIPPLE_RINGS = 2;
const RIPPLE_START_RADIUS = 46; // 화면 기준 시작 반지름(px). 줌과 관계없이 같은 크기로 보인다
const RIPPLE_BAND = 7;          // 띠 두께(px)

interface Ripple { x: number; y: number; at: number }

/** 미니맵: 오른쪽 아래, 화면 짧은 변의 24%(110~180px). */
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
  private me = { e: -1, x: 0, y: 0, r: 16, initialized: false };
  private input = { dx: 0, dy: 0 };
  private target: { x: number; y: number } | null = null;
  private zoom = 1;
  private raf = 0;
  private last = performance.now();
  private floatTexts: { text: string; at: number }[] = [];
  private ripples: Ripple[] = [];
  private minimap: MinimapEntry[] = [];
  private minimapVisible = true;
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
  setMe(entityNo: number, x: number, y: number) { this.me = { ...this.me, e: entityNo, x, y, initialized: true }; }
  setRoster(players: { e: number; nickname: string; level: number }[]) {
    this.names = new Map(players.map((p) => [p.e, { nickname: p.nickname, level: p.level }]));
  }
  setInput(dx: number, dy: number) { this.input = { dx, dy }; if (dx || dy) this.target = null; }
  setTarget(x: number, y: number) {
    this.target = { x, y };
    this.ripples.push({ x, y, at: performance.now() });
    if (this.ripples.length > 6) this.ripples.shift(); // 연타해도 쌓이지 않게
  }
  floatText(text: string) { this.floatTexts.push({ text, at: performance.now() }); }
  setMinimap(entries: MinimapEntry[]) { this.minimap = entries; }
  setMinimapVisible(visible: boolean) { this.minimapVisible = visible; }

  applySnapshot(s: Snapshot) {
    this.half = s.half;
    const seen = new Set<number>();
    for (const e of s.entities) {
      seen.add(e.e);
      const old = this.entities.get(e.e);
      this.entities.set(e.e, { prev: old ? this.current(old, s.receivedAt) : e, cur: e, at: s.receivedAt });
      if (e.me) {
        if (this.me.e !== e.e || !this.me.initialized) this.me = { e: e.e, x: e.x, y: e.y, r: e.r, initialized: true };
        this.me.r = e.r;
        // 서버 위치로 보정: 많이 어긋나면 바로 맞추고, 조금이면 30%씩 당긴다
        const dx = e.x - this.me.x, dy = e.y - this.me.y;
        if (Math.hypot(dx, dy) > 300) { this.me.x = e.x; this.me.y = e.y; }
        else { this.me.x += dx * 0.3; this.me.y += dy * 0.3; }
      }
    }
    for (const id of [...this.entities.keys()]) if (!seen.has(id)) this.entities.delete(id);
  }

  /** 화면 좌표 → 월드 좌표(더블클릭 이동). */
  screenToWorld(px: number, py: number) {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: this.me.x + (px - rect.left - rect.width / 2) / this.zoom,
      y: this.me.y + (py - rect.top - rect.height / 2) / this.zoom,
    };
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

  private predictMe(dt: number) {
    const speed = this.tuning?.maxSpeed ?? 240; // 크기와 관계없이 같다
    let vx = 0, vy = 0;
    if (this.input.dx || this.input.dy) {
      const len = Math.hypot(this.input.dx, this.input.dy);
      vx = (this.input.dx / len) * speed; vy = (this.input.dy / len) * speed;
    } else if (this.target) {
      const dx = this.target.x - this.me.x, dy = this.target.y - this.me.y, d = Math.hypot(dx, dy);
      if (d < 4) this.target = null;
      else { const s = speed * Math.min(1, d / 120); vx = (dx / d) * s; vy = (dy / d) * s; }
    }
    this.me.x += vx * dt; this.me.y += vy * dt;
    const lim = this.half - this.me.r;
    this.me.x = Math.max(-lim, Math.min(lim, this.me.x));
    this.me.y = Math.max(-lim, Math.min(lim, this.me.y));
  }

  private frame(now: number) {
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    if (this.me.initialized) this.predictMe(dt);

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
    ctx.translate(-this.me.x, -this.me.y);

    const half = this.half;
    ctx.fillStyle = '#1f2a37'; // 짙은 회청색 바닥
    ctx.fillRect(-half, -half, half * 2, half * 2);
    this.drawGrid(ctx, w, h);
    ctx.strokeStyle = 'rgba(255,255,255,0.6)';
    ctx.lineWidth = 4 / this.zoom;
    ctx.strokeRect(-half, -half, half * 2, half * 2);

    this.drawRipples(ctx, now);

    // 작은 아이콘을 위에 그리려고 큰 것부터
    const list = [...this.entities.values()].map((i) => {
      const s = this.current(i, now);
      return s.me ? { ...s, x: this.me.x, y: this.me.y } : s;
    }).sort((a, b) => b.r - a.r);
    const viewHalfW = w / 2 / this.zoom, viewHalfH = h / 2 / this.zoom;
    for (const e of list) {
      if (Math.abs(e.x - this.me.x) > viewHalfW + e.r || Math.abs(e.y - this.me.y) > viewHalfH + e.r) continue; // 화면 밖은 그리지 않는다
      this.drawEntity(ctx, e);
    }
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
    ctx.strokeRect(toX(this.me.x) - vw / 2, toY(this.me.y) - vh / 2, vw, vh);

    ctx.fillStyle = 'rgba(200,215,235,0.75)';
    for (const m of this.minimap) {
      if (m.e === this.me.e) continue; // 나는 예측 위치로 따로 그린다
      ctx.beginPath(); ctx.arc(toX(m.x), toY(m.y), Math.max(2, m.r * s), 0, Math.PI * 2); ctx.fill();
    }
    ctx.fillStyle = '#3fb68b';
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(toX(this.me.x), toY(this.me.y), Math.max(3, this.me.r * s), 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();
    ctx.restore();
  }

  private drawGrid(ctx: CanvasRenderingContext2D, w: number, h: number) {
    const half = this.half;
    const vw = w / 2 / this.zoom, vh = h / 2 / this.zoom;
    const x0 = Math.max(-half, this.me.x - vw), x1 = Math.min(half, this.me.x + vw);
    const y0 = Math.max(-half, this.me.y - vh), y1 = Math.min(half, this.me.y + vh);
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
    ctx.fillStyle = '#3fb68b'; // 성장 캐릭터(거북이)의 정해진 바탕색. 그림은 다음 단계
    ctx.beginPath(); ctx.arc(e.x, e.y, e.r, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    ctx.strokeStyle = '#11372a';
    ctx.lineWidth = Math.max(2, e.r * 0.08);
    ctx.beginPath(); ctx.arc(e.x, e.y, e.r, 0, Math.PI * 2); ctx.stroke();
    // 레벨이 오를수록 얼굴이 선명해진다(임시 표현: 눈의 진하기)
    if (lvl >= 2) {
      ctx.fillStyle = `rgba(10,30,20,${0.15 + lvl * 0.08})`;
      for (const sx of [-0.3, 0.3]) { ctx.beginPath(); ctx.arc(e.x + e.r * sx, e.y - e.r * 0.15, e.r * 0.1, 0, Math.PI * 2); ctx.fill(); }
    }
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
