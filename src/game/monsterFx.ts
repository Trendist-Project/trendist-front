import { drawComboFlames } from './skin';
import { drawDamage } from './damageText';

/** 서버가 10Hz(돌진 중에는 매 틱)로 보내는 몬스터 상태(4.35). vx·vy는 그때의 속도(px/초)다. ph: chase·dash_windup·dashing·ring_windup·ring·recover */
export interface MonsterState {
  id: number; code: string; name: string; en: string; img: string | null;
  x: number; y: number; r: number; hp: number; max: number; left: number;
  flame: boolean; rage: boolean; ph: string; tgt: number; vx?: number; vy?: number;
  tele?: { k: 'dash'; dx: number; dy: number; len: number; ms: number; total: number } | { k: 'ring'; ms: number; total: number };
}
export type MonsterFxMsg =
  | { fx: 'ring'; id: number; x: number; y: number; r0: number; rMax: number; speed: number }
  | { fx: 'dash'; id: number; ms: number; dx: number; dy: number }
  | { fx: 'rage'; id: number; flame: boolean };
export interface MonsterHitMsg { id: number; e: number; dmg: number; flame: boolean; x: number; y: number; hp: number }
/** 화면 위 보스 체력 막대에 쓰는 요약 */
export interface MonsterHud { id: number; name: string; en: string; hp: number; max: number; leftMs: number; flame: boolean; rage: boolean; ph: string; img: string | null }

/** 그림 안에서 등껍질 중심과 반지름(elder-turtle.svg의 viewBox 512×600 기준). 등껍질 반지름이 몬스터 몸 반지름(판정)과 같다 */
const ART = { w: 512, h: 600, cx: 256, cy: 330, shell: 205 };
const STATE_STALE_MS = 3000; // 이 시간 동안 상태가 오지 않으면(끝났는데 알림을 놓침) 지운다

/**
 * 몬스터(보스) 그리기(4.35): 몸 그림(서버가 알려 준 몸 반지름에 등껍질을 맞춘다), 패턴 예고(돌진 길·충격고리 준비), 퍼지는 충격고리,
 * 맞은 피해 숫자. 위치는 받은 상태에 속도를 더해 다음 상태가 오기 전까지 이어서 움직이고(끊기지 않게) 부드럽게 따라가며, 머리는 가는 쪽을 본다.
 */
export class MonsterLayer {
  private mon: (MonsterState & { sx: number; sy: number; heading: number; at: number; dashDx: number; dashDy: number }) | null = null;
  private rings: { x: number; y: number; r0: number; rMax: number; speed: number; at: number }[] = [];
  private texts: { text: string; x: number; y: number; at: number; flame: boolean; mine: boolean }[] = [];
  private rageAt = -1e9;
  /** 쓰러진 보스: 몸이 천천히 흐려지며 김처럼 증발한다(vanish). 몸 그림·자리·크기만 남겨 두고 연기 알갱이는 시작할 때 한 번 정한다 */
  private dying: { x: number; y: number; r: number; heading: number; img: string | null; at: number; wisps: { a: number; d: number; delay: number; size: number; rise: number; drift: number }[] } | null = null;
  private images = new Map<string, HTMLImageElement>();
  private myE = -1;
  constructor(private reduceMotion: boolean) {}

  setMe(e: number) { this.myE = e; }

  set(m: MonsterState) {
    const now = performance.now();
    if (!this.mon || this.mon.id !== m.id) { this.mon = { ...m, sx: m.x, sy: m.y, heading: 0, at: now, dashDx: 0, dashDy: -1 }; this.rings = []; return; }
    this.mon = { ...this.mon, ...m, tele: m.tele, at: now }; // 예고(tele)는 예고 중에만 오니 합치지 말고 매번 덮어쓴다(안 그러면 돌진이 끝나도 사거리 표시가 남는다)
  }
  clear() { this.mon = null; this.rings = []; this.texts = []; }
  /** 보스를 처치했다: 지우지 않고 그 자리에서 증발하는 연출로 넘긴다(피해 숫자는 그대로 남겨 끝까지 보인다) */
  vanish() {
    const m = this.mon;
    this.mon = null; this.rings = [];
    if (!m) return;
    const wisps = Array.from({ length: this.reduceMotion ? 0 : 26 }, () => ({
      a: Math.random() * Math.PI * 2, d: Math.sqrt(Math.random()) * 0.85, delay: Math.random() * 0.45,
      size: 0.1 + Math.random() * 0.16, rise: 0.5 + Math.random() * 0.9, drift: (Math.random() - 0.5) * 0.5,
    }));
    this.dying = { x: m.sx, y: m.sy, r: m.r, heading: m.heading, img: m.img, at: performance.now(), wisps };
  }
  fx(m: MonsterFxMsg) {
    const now = performance.now();
    if (m.fx === 'ring') this.rings.push({ x: m.x, y: m.y, r0: m.r0, rMax: m.rMax, speed: m.speed, at: now });
    else if (m.fx === 'rage') this.rageAt = now;
    else if (m.fx === 'dash' && this.mon) { this.mon.dashDx = m.dx; this.mon.dashDy = m.dy; }
  }
  hit(m: MonsterHitMsg) {
    this.texts.push({ text: `-${m.dmg.toLocaleString()}`, x: m.x, y: m.y, at: performance.now(), flame: m.flame, mine: m.e === this.myE });
    if (this.mon && this.mon.id === m.id) this.mon.hp = m.hp;
    if (this.texts.length > 40) this.texts.splice(0, this.texts.length - 40);
  }
  active() { return !!this.mon; }
  position(): { x: number; y: number; r: number } | null { return this.mon ? { x: this.mon.sx, y: this.mon.sy, r: this.mon.r } : null; }

  hud(): MonsterHud | null {
    const m = this.mon;
    if (!m) return null;
    return { id: m.id, name: m.name, en: m.en, hp: m.hp, max: m.max, leftMs: Math.max(0, m.left - (performance.now() - m.at)), flame: m.flame, rage: m.rage, ph: m.ph, img: m.img };
  }

  private image(key: string | null): HTMLImageElement | null {
    if (!key) return null;
    let img = this.images.get(key);
    if (!img) { img = new Image(); img.src = `/monsters/${key}.svg`; this.images.set(key, img); }
    return img.complete && img.naturalWidth > 0 ? img : null;
  }

  /** 프레임마다 위치를 부드럽게 따라가고 머리 방향을 돌린다 */
  update(dt: number) {
    const m = this.mon;
    if (!m) return;
    if (performance.now() - m.at > STATE_STALE_MS) { this.clear(); return; }
    const k = Math.min(1, dt * 14);
    const px = m.sx, py = m.sy;
    // 서버 위치에 속도를 더해 앞으로 내다본다(상태 사이에도 계속 가고, 상태가 늦어도 0.25초까지만)
    const age = Math.min(0.25, (performance.now() - m.at) / 1000);
    const tx = m.x + (m.vx ?? 0) * age, ty = m.y + (m.vy ?? 0) * age;
    m.sx += (tx - m.sx) * k; m.sy += (ty - m.sy) * k;
    let ang: number | null = null;
    if (m.tele && m.tele.k === 'dash') ang = Math.atan2(m.tele.dx, -m.tele.dy); // 돌진 예고 중에는 그쪽을 본다
    else if (m.ph === 'dashing') ang = Math.atan2(m.dashDx, -m.dashDy);
    else if (Math.hypot(m.sx - px, m.sy - py) > 0.05) ang = Math.atan2(m.sx - px, -(m.sy - py));
    if (ang !== null) {
      let d = ang - m.heading;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      m.heading += d * Math.min(1, dt * 6);
    }
  }

  /** 모든 원 아래: 패턴 예고와 몸 */
  drawBody(ctx: CanvasRenderingContext2D, now: number, zoom: number) {
    this.drawDying(ctx, now, zoom);
    const m = this.mon;
    if (!m) return;
    const px = 1 / zoom;
    // 돌진 예고: 보스에서 뻗는 붉은 길(폭은 몸 지름). 예고가 진행될수록 짙어진다
    if (m.tele && m.tele.k === 'dash') {
      const prog = 1 - m.tele.ms / Math.max(1, m.tele.total), len = m.tele.len + m.r;
      ctx.save();
      ctx.translate(m.sx, m.sy); ctx.rotate(Math.atan2(m.tele.dy, m.tele.dx));
      ctx.fillStyle = `rgba(255,60,60,${0.1 + 0.22 * prog})`;
      ctx.fillRect(0, -m.r, len, m.r * 2);
      ctx.strokeStyle = `rgba(255,110,110,${0.5 + 0.4 * prog})`; ctx.lineWidth = 6 * px; ctx.setLineDash([60 * px * 4, 40 * px * 4]);
      ctx.strokeRect(0, -m.r, len, m.r * 2);
      ctx.setLineDash([]);
      ctx.fillStyle = `rgba(255,200,200,${0.35 + 0.4 * prog})`;
      for (let i = 1; i <= 5; i++) { // 가는 방향을 보여 주는 화살표
        const ax = m.r + (len - m.r) * (i / 6), s = Math.max(m.r * 0.16, 30 * px);
        ctx.beginPath(); ctx.moveTo(ax + s, 0); ctx.lineTo(ax - s * 0.6, -s * 0.8); ctx.lineTo(ax - s * 0.6, s * 0.8); ctx.closePath(); ctx.fill();
      }
      ctx.restore();
    }
    // 충격고리 예고: 몸 둘레가 붉게 맥동하며 차오른다
    if (m.tele && m.tele.k === 'ring') {
      const prog = 1 - m.tele.ms / Math.max(1, m.tele.total), pulse = this.reduceMotion ? 0 : Math.sin(now / 90) * 0.04;
      const grad = ctx.createRadialGradient(m.sx, m.sy, m.r * 0.6, m.sx, m.sy, m.r * (1.18 + prog * 0.3 + pulse));
      grad.addColorStop(0, `rgba(255,70,70,${0.05 + 0.25 * prog})`); grad.addColorStop(1, 'rgba(255,70,70,0)');
      ctx.fillStyle = grad;
      ctx.beginPath(); ctx.arc(m.sx, m.sy, m.r * (1.18 + prog * 0.3 + pulse), 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = `rgba(255,120,120,${0.4 + 0.5 * prog})`; ctx.lineWidth = (6 + 10 * prog) * px;
      ctx.beginPath(); ctx.arc(m.sx, m.sy, m.r * (1.02 + 0.1 * prog), 0, Math.PI * 2); ctx.stroke();
    }
    // 몸(그림): 등껍질을 판정 반지름에 맞춘다. 머리는 가는 쪽
    const img = this.image(m.img);
    ctx.save();
    ctx.translate(m.sx, m.sy); ctx.rotate(m.heading);
    const sc = m.r / ART.shell;
    if (img) ctx.drawImage(img, -ART.cx * sc, -ART.cy * sc, ART.w * sc, ART.h * sc);
    else { ctx.fillStyle = '#5f8048'; ctx.beginPath(); ctx.arc(0, 0, m.r, 0, Math.PI * 2); ctx.fill(); }
    ctx.restore();
    // 판정 범위 테두리(분노하면 붉게)
    ctx.strokeStyle = m.rage ? 'rgba(255,80,60,0.85)' : 'rgba(255,255,255,0.28)';
    ctx.lineWidth = (m.rage ? 10 : 5) * px;
    ctx.setLineDash(m.flame ? [] : [40 * px * 3, 30 * px * 3]);
    ctx.beginPath(); ctx.arc(m.sx, m.sy, m.r, 0, Math.PI * 2); ctx.stroke();
    ctx.setLineDash([]);
    if (m.flame) drawComboFlames(ctx, m.sx, m.sy, m.r, now / 1000, px); // 불꽃 상태
  }

  /**
   * 증발 연출(약 2.4초, 모션 줄이기면 0.7초 페이드): ① 몸이 서서히 흐려지고(블러 ↑ · 채도 ↓ · 밝기 ↑) 살짝 부풀며 위로 떠오른다
   * ② 몸 둘레에서 얇은 흰 고리가 퍼져 나가 사라진다 ③ 몸 안에서 푸른 기운 알갱이들이 시차를 두고 피어올라 흩어진다
   */
  private drawDying(ctx: CanvasRenderingContext2D, now: number, zoom: number) {
    const d = this.dying;
    if (!d) return;
    const total = this.reduceMotion ? 700 : 2400, t = (now - d.at) / total;
    if (t >= 1) { this.dying = null; return; }
    const px = 1 / zoom, e = t * t * (3 - 2 * t);
    const img = this.image(d.img);
    ctx.save();
    ctx.globalAlpha = Math.pow(1 - t, 1.5);
    if (!this.reduceMotion && 'filter' in ctx) ctx.filter = `blur(${(0.4 + 5 * e).toFixed(1)}px) brightness(${(1 + 0.7 * e).toFixed(2)}) saturate(${(1 - 0.6 * e).toFixed(2)})`;
    ctx.translate(d.x, d.y - (this.reduceMotion ? 0 : d.r * 0.3 * e)); ctx.rotate(d.heading);
    const sc = (d.r / ART.shell) * (this.reduceMotion ? 1 : 1 + 0.08 * e);
    if (img) ctx.drawImage(img, -ART.cx * sc, -ART.cy * sc, ART.w * sc, ART.h * sc);
    else { ctx.fillStyle = '#5f8048'; ctx.beginPath(); ctx.arc(0, 0, d.r * (sc * ART.shell / d.r), 0, Math.PI * 2); ctx.fill(); }
    ctx.restore();
    if (this.reduceMotion) return;
    // 퍼지는 얇은 고리
    ctx.save();
    ctx.strokeStyle = `rgba(235,248,255,${0.45 * (1 - t)})`; ctx.lineWidth = Math.max(4 * px, d.r * 0.025 * (1 - t));
    ctx.beginPath(); ctx.arc(d.x, d.y, d.r * (0.95 + 0.55 * e), 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
    // 피어오르는 기운 알갱이
    for (const w of d.wisps) {
      const u = (t - w.delay) / (1 - w.delay);
      if (u <= 0 || u >= 1) continue;
      const x = d.x + Math.cos(w.a) * d.r * w.d + w.drift * d.r * u, y = d.y + Math.sin(w.a) * d.r * w.d * 0.8 - w.rise * d.r * 0.9 * u;
      const rr = d.r * w.size * (0.7 + 0.9 * u), al = Math.sin(u * Math.PI) * 0.55;
      const g = ctx.createRadialGradient(x, y, 0, x, y, rr);
      g.addColorStop(0, `rgba(235,250,255,${al})`); g.addColorStop(0.5, `rgba(170,215,255,${al * 0.5})`); g.addColorStop(1, 'rgba(170,215,255,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, rr, 0, Math.PI * 2); ctx.fill();
    }
  }

  /** 모든 원 위: 퍼지는 충격고리, 분노 번쩍임, 피해 숫자 */
  drawOver(ctx: CanvasRenderingContext2D, now: number, zoom: number) {
    const px = 1 / zoom;
    this.rings = this.rings.filter((g) => (now - g.at) / 1000 * g.speed < g.rMax - g.r0 + 200);
    for (const g of this.rings) {
      const r = g.r0 + ((now - g.at) / 1000) * g.speed, fade = Math.max(0, Math.min(1, (g.rMax - r) / Math.max(1, g.rMax - g.r0) * 4 + 0.3));
      const w = Math.max(60, 9 * px);
      ctx.save();
      ctx.globalAlpha = Math.min(1, fade);
      ctx.strokeStyle = 'rgba(255,70,70,0.9)'; ctx.lineWidth = w;
      ctx.beginPath(); ctx.arc(g.x, g.y, r, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = w * 0.3;
      ctx.beginPath(); ctx.arc(g.x, g.y, r + w * 0.25, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    }
    const m = this.mon;
    if (m && now - this.rageAt < 700 && !this.reduceMotion) { // 분노: 몸 둘레가 한 번 번쩍인다
      const t = (now - this.rageAt) / 700;
      ctx.strokeStyle = `rgba(255,60,40,${0.8 * (1 - t)})`; ctx.lineWidth = (20 + 120 * t) * px * 2;
      ctx.beginPath(); ctx.arc(m.sx, m.sy, m.r * (1 + 0.25 * t), 0, Math.PI * 2); ctx.stroke();
    }
    this.texts = this.texts.filter((t) => now - t.at < 1600);
    for (const t of this.texts) {
      const p = (now - t.at) / 1600, size = (t.mine ? 40 : 30) * px * (t.flame ? 1.3 : 1);
      // 불꽃 타격은 분홍 크리티컬, 일반 타격은 주황 노랑(메이플 키우기 같은 데미지 스킨, damageText.ts)
      drawDamage(ctx, t.text, t.x, t.y - 30 * px, p, t.flame ? 'crit' : 'hit', size, this.reduceMotion);
    }
  }

  /** 미니맵에 보스 몸 크기의 붉은 원 */
  drawMinimap(ctx: CanvasRenderingContext2D, toX: (wx: number) => number, toY: (wy: number) => number, s: number, big: boolean) {
    const m = this.mon;
    if (!m) return;
    const r = Math.max(big ? 6 : 3, m.r * s);
    ctx.fillStyle = m.rage ? 'rgba(255,70,50,0.42)' : 'rgba(255,170,60,0.32)';
    ctx.strokeStyle = m.rage ? 'rgba(255,80,60,0.95)' : 'rgba(255,190,90,0.9)';
    ctx.lineWidth = big ? 2 : 1.4;
    ctx.beginPath(); ctx.arc(toX(m.sx), toY(m.sy), r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  }
}
