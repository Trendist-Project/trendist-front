import { drawComboFlames } from './skin';

/** 서버가 5Hz로 보내는 몬스터 상태(4.35). ph: chase·dash_windup·dashing·ring_windup·ring·recover */
export interface MonsterState {
  id: number; code: string; name: string; en: string; img: string | null;
  x: number; y: number; r: number; hp: number; max: number; left: number;
  flame: boolean; rage: boolean; ph: string; tgt: number;
  tele?: { k: 'dash'; dx: number; dy: number; len: number; ms: number; total: number } | { k: 'ring'; ms: number; total: number };
}
export type MonsterFxMsg =
  | { fx: 'ring'; id: number; x: number; y: number; r0: number; rMax: number; speed: number }
  | { fx: 'dash'; id: number; ms: number; dx: number; dy: number }
  | { fx: 'rage'; id: number; flame: boolean };
export interface MonsterHitMsg { id: number; e: number; dmg: number; flame: boolean; x: number; y: number; hp: number }
/** 화면 위 보스 체력 막대에 쓰는 요약 */
export interface MonsterHud { id: number; name: string; en: string; hp: number; max: number; leftMs: number; flame: boolean; rage: boolean; ph: string }

/** 그림 안에서 등껍질 중심과 반지름(elder-turtle.svg의 viewBox 512×600 기준). 등껍질 반지름이 몬스터 몸 반지름(판정)과 같다 */
const ART = { w: 512, h: 600, cx: 256, cy: 330, shell: 205 };
const STATE_STALE_MS = 3000; // 이 시간 동안 상태가 오지 않으면(끝났는데 알림을 놓침) 지운다

/**
 * 몬스터(보스) 그리기(4.35): 몸 그림(서버가 알려 준 몸 반지름에 등껍질을 맞춘다), 패턴 예고(돌진 길·충격고리 준비), 퍼지는 충격고리,
 * 맞은 피해 숫자. 위치는 5Hz 상태를 부드럽게 따라가고, 머리는 가는 쪽을 본다.
 */
export class MonsterLayer {
  private mon: (MonsterState & { sx: number; sy: number; heading: number; at: number; dashDx: number; dashDy: number }) | null = null;
  private rings: { x: number; y: number; r0: number; rMax: number; speed: number; at: number }[] = [];
  private texts: { text: string; x: number; y: number; at: number; flame: boolean; mine: boolean }[] = [];
  private rageAt = -1e9;
  private images = new Map<string, HTMLImageElement>();
  private myE = -1;
  constructor(private reduceMotion: boolean) {}

  setMe(e: number) { this.myE = e; }

  set(m: MonsterState) {
    const now = performance.now();
    if (!this.mon || this.mon.id !== m.id) { this.mon = { ...m, sx: m.x, sy: m.y, heading: 0, at: now, dashDx: 0, dashDy: -1 }; this.rings = []; return; }
    this.mon = { ...this.mon, ...m, at: now };
  }
  clear() { this.mon = null; this.rings = []; this.texts = []; }
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
    return { id: m.id, name: m.name, en: m.en, hp: m.hp, max: m.max, leftMs: Math.max(0, m.left - (performance.now() - m.at)), flame: m.flame, rage: m.rage, ph: m.ph };
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
    const k = Math.min(1, dt * 12);
    const px = m.sx, py = m.sy;
    m.sx += (m.x - m.sx) * k; m.sy += (m.y - m.sy) * k;
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
      const p = (now - t.at) / 1600, size = (t.mine ? 34 : 24) * px * (t.flame ? 1.25 : 1);
      ctx.save();
      ctx.globalAlpha = 1 - p * p;
      ctx.font = `800 ${size}px system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const y = t.y - 40 * px - p * 90 * px * 3;
      ctx.lineWidth = size * 0.18; ctx.strokeStyle = 'rgba(0,0,0,0.85)';
      const label = t.flame ? `🔥${t.text}` : t.text;
      ctx.strokeText(label, t.x, y);
      ctx.fillStyle = t.flame ? '#ffb347' : t.mine ? '#ffffff' : '#ffd9d9';
      ctx.fillText(label, t.x, y);
      ctx.restore();
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
