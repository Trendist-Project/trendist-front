import { drawComboFlames } from './skin';
import { drawDamage } from './damageText';

/** 서버가 10Hz(돌진 중에는 매 틱)로 보내는 몬스터 상태(4.35). vx·vy는 그때의 속도(px/초)다. ph: chase·dash_windup·dashing·ring_windup·ring·recover */
export interface MonsterState {
  id: number; code: string; name: string; en: string; img: string | null;
  x: number; y: number; r: number; hp: number; max: number; left: number;
  flame: boolean; rage: boolean; ph: string; tgt: number; vx?: number; vy?: number;
  /** 달토끼: air = 깡충 점프 중(몸 판정 없음), stun = 착지 뒤 무방비 */
  air?: boolean; stun?: boolean;
  tele?: { k: 'dash'; dx: number; dy: number; len: number; ms: number; total: number } | { k: 'ring'; ms: number; total: number }
    | { k: 'hop'; x: number; y: number; r: number; ms: number; total: number }
    | { k: 'mochi'; spots: MochiSpot[]; ms: number; total: number }
    | { k: 'carrot'; x: number; y: number; dir: number; spread: number; range: number; ms: number; total: number };
}
export interface MochiSpot { x: number; y: number; r: number }
export type MonsterFxMsg =
  | { fx: 'ring'; id: number; x: number; y: number; r0: number; rMax: number; speed: number }
  | { fx: 'dash'; id: number; ms: number; dx: number; dy: number }
  | { fx: 'rage'; id: number; flame: boolean }
  | { fx: 'hopMark'; id: number; x: number; y: number; r: number; ms: number }
  | { fx: 'hopJump'; id: number; x0: number; y0: number; x: number; y: number; r: number; ms: number }
  | { fx: 'hopLand'; id: number; x: number; y: number; r: number }
  | { fx: 'mochi'; id: number; spots: MochiSpot[]; ms: number }
  | { fx: 'carrot'; id: number; x: number; y: number; angles: number[]; speed: number; range: number; r: number };
export interface MonsterHitMsg { id: number; e: number; dmg: number; flame: boolean; x: number; y: number; hp: number }
/** 화면 위 보스 체력 막대에 쓰는 요약 */
export interface MonsterHud { id: number; name: string; en: string; hp: number; max: number; leftMs: number; flame: boolean; rage: boolean; ph: string; img: string | null }

/** 그림 안에서 몸 중심과 반지름(elder-turtle.svg·moon-rabbit.svg 공통, viewBox 512×600 기준). 몸(등껍질·털 몸통) 반지름이 몬스터 몸 반지름(판정)과 같다 */
const ART = { w: 512, h: 600, cx: 256, cy: 330, shell: 205 };
/** 정면을 보고 서 있는 캐릭터 그림: 돌리거나 뒤집지 않고 항상 똑바로 세워 그린다(돌리면 아래로 갈 때 거꾸로 선다). 나머지 그림은 위쪽이 앞이라 가는 쪽으로 돌린다 */
const UPRIGHT = new Set(['moon-rabbit']);
const STATE_STALE_MS = 3000;
/** 그림을 아직 못 받았을 때 대신 그리는 몸 색(그림 키별) */
const fallbackColor = (img: string | null) => (img === 'moon-rabbit' ? '#e2dbf1' : '#5f8048');
const rad = (deg: number) => deg * Math.PI / 180;
/** 초승달 모양을 그린다(R = 바깥 원 반지름). 바깥 원 안에서 안쪽 원을 뺀 부분 */
function crescent(ctx: CanvasRenderingContext2D, x: number, y: number, R: number) {
  ctx.save();
  ctx.beginPath(); ctx.arc(x, y, R, 0, Math.PI * 2); ctx.clip();
  ctx.beginPath(); ctx.arc(x, y, R, 0, Math.PI * 2); ctx.arc(x + R * 0.38, y - R * 0.08, R * 0.82, 0, Math.PI * 2);
  ctx.fill('evenodd');
  ctx.restore();
}
function star(ctx: CanvasRenderingContext2D, x: number, y: number, s: number) {
  ctx.beginPath();
  for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4 - Math.PI / 2, rr = i % 2 === 0 ? s : s * 0.4; ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
  ctx.closePath(); ctx.fill();
} // 이 시간 동안 상태가 오지 않으면(끝났는데 알림을 놓침) 지운다

/**
 * 몬스터(보스) 그리기(4.35): 몸 그림(서버가 알려 준 몸 반지름에 등껍질을 맞춘다), 패턴 예고(돌진 길·충격고리 준비), 퍼지는 충격고리,
 * 맞은 피해 숫자. 위치는 받은 상태에 속도를 더해 다음 상태가 오기 전까지 이어서 움직이고(끊기지 않게) 부드럽게 따라가며, 머리는 가는 쪽을 본다.
 */
export class MonsterLayer {
  private mon: (MonsterState & { sx: number; sy: number; heading: number; at: number; dashDx: number; dashDy: number }) | null = null;
  private rings: { x: number; y: number; r0: number; rMax: number; speed: number; at: number }[] = [];
  /** 달토끼 연출: 연속 깡충의 다음 착지 그림자, 점프(그림자·크기), 착지 충격, 남아 있는 달떡 장판, 날아가는 당근. 모두 시작 시각(at)과 값만 들고 매 프레임 계산한다 */
  private hopMarks: { x: number; y: number; r: number; ms: number; at: number }[] = [];
  private hopJumps: { x0: number; y0: number; x: number; y: number; r: number; ms: number; at: number }[] = [];
  private hopLands: { x: number; y: number; r: number; at: number }[] = [];
  private mochis: { spots: MochiSpot[]; ms: number; at: number }[] = [];
  private carrots: { x: number; y: number; angles: number[]; speed: number; range: number; r: number; at: number }[] = [];
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
    if (!this.mon || this.mon.id !== m.id) { this.mon = { ...m, sx: m.x, sy: m.y, heading: 0, at: now, dashDx: 0, dashDy: -1 }; this.rings = []; this.clearRabbit(); return; }
    this.mon = { ...this.mon, ...m, tele: m.tele, at: now }; // 예고(tele)는 예고 중에만 오니 합치지 말고 매번 덮어쓴다(안 그러면 돌진이 끝나도 사거리 표시가 남는다)
  }
  clear() { this.mon = null; this.rings = []; this.texts = []; this.clearRabbit(); }
  private clearRabbit() { this.hopMarks = []; this.hopJumps = []; this.hopLands = []; this.mochis = []; this.carrots = []; }
  /** 보스를 처치했다: 지우지 않고 그 자리에서 증발하는 연출로 넘긴다(피해 숫자는 그대로 남겨 끝까지 보인다) */
  vanish() {
    const m = this.mon;
    this.mon = null; this.rings = []; this.clearRabbit();
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
    else if (m.fx === 'hopMark') this.hopMarks.push({ x: m.x, y: m.y, r: m.r, ms: m.ms, at: now });
    else if (m.fx === 'hopJump') { this.hopMarks = []; this.hopJumps.push({ x0: m.x0, y0: m.y0, x: m.x, y: m.y, r: m.r, ms: m.ms, at: now }); }
    else if (m.fx === 'hopLand') { this.hopLands.push({ x: m.x, y: m.y, r: m.r, at: now }); }
    else if (m.fx === 'mochi') this.mochis.push({ spots: m.spots, ms: m.ms, at: now });
    else if (m.fx === 'carrot') this.carrots.push({ x: m.x, y: m.y, angles: m.angles, speed: m.speed, range: m.range, r: m.r, at: now });
    for (const a of [this.hopMarks, this.hopJumps, this.hopLands, this.mochis, this.carrots]) if (a.length > 24) a.splice(0, a.length - 24);
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
    else if (m.tele && m.tele.k === 'carrot') ang = m.tele.dir + Math.PI / 2; // 당근 부채: 쏠 쪽을 노려본다(위쪽이 앞이라 +90°)
    else if (m.tele && m.tele.k === 'hop') ang = Math.atan2(m.tele.x - m.sx, -(m.tele.y - m.sy)); // 깡충: 내려앉을 자리를 본다
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
    this.drawRabbitGround(ctx, m, now, px);
    // 몸(그림): 몸통을 판정 반지름에 맞춘다. 머리는 가는 쪽. 깡충 점프 중(air)에는 위로 떠올라 커지고 흐려지며 바닥에 그림자가 남는다
    const img = this.image(m.img);
    let lift = 0, grow = 1, alpha = 1;
    if (m.air) {
      const j = this.hopJumps.length ? this.hopJumps[this.hopJumps.length - 1] : null;
      const u = j ? Math.min(1, Math.max(0, (now - j.at) / Math.max(1, j.ms))) : 0.5, h = Math.sin(Math.PI * u);
      if (this.reduceMotion) alpha = 0.6; else { lift = m.r * 0.45 * h; grow = 1 + 0.22 * h; alpha = 0.85; }
      ctx.fillStyle = `rgba(20,14,40,${0.3 - 0.1 * h})`;
      ctx.beginPath(); ctx.ellipse(m.sx, m.sy + m.r * 0.08, m.r * (1 - 0.2 * h), m.r * (0.9 - 0.2 * h), 0, 0, Math.PI * 2); ctx.fill();
    }
    ctx.save();
    ctx.globalAlpha = alpha;
    const upright = !!m.img && UPRIGHT.has(m.img);
    if (upright && !m.air && !this.reduceMotion && Math.hypot(m.vx ?? 0, m.vy ?? 0) > 40) lift += Math.abs(Math.sin(now / 110)) * m.r * 0.05; // 걸을 때 폴짝폴짝
    ctx.translate(m.sx, m.sy - lift);
    if (!upright) ctx.rotate(m.heading);
    const sc = (m.r / ART.shell) * grow;
    if (img) ctx.drawImage(img, -ART.cx * sc, -ART.cy * sc, ART.w * sc, ART.h * sc);
    else { ctx.fillStyle = fallbackColor(m.img); ctx.beginPath(); ctx.arc(0, 0, m.r * grow, 0, Math.PI * 2); ctx.fill(); }
    ctx.restore();
    if (m.air) return; // 공중에는 몸 판정이 없다: 판정 범위 테두리와 불꽃은 그리지 않는다
    // 판정 범위 테두리(분노하면 붉게)
    ctx.strokeStyle = m.rage ? 'rgba(255,80,60,0.85)' : 'rgba(255,255,255,0.28)';
    ctx.lineWidth = (m.rage ? 10 : 5) * px;
    ctx.setLineDash(m.flame ? [] : [40 * px * 3, 30 * px * 3]);
    ctx.beginPath(); ctx.arc(m.sx, m.sy, m.r, 0, Math.PI * 2); ctx.stroke();
    ctx.setLineDash([]);
    if (m.flame) drawComboFlames(ctx, m.sx, m.sy, m.r, now / 1000, px); // 불꽃 상태
    if (m.stun) this.drawStunStars(ctx, m, now);
  }

  /** 착지 뒤 무방비: 머리 위에서 별이 빙글 돈다(모션 줄이기면 멈춘 별) */
  private drawStunStars(ctx: CanvasRenderingContext2D, m: { sx: number; sy: number; r: number }, now: number) {
    const cy = m.sy - m.r * 1.08, rx = m.r * 0.5, ry = m.r * 0.14, size = m.r * 0.13;
    ctx.save();
    ctx.fillStyle = '#ffe98a'; ctx.strokeStyle = '#b9801c'; ctx.lineWidth = size * 0.18;
    for (let i = 0; i < 4; i++) {
      const a = (this.reduceMotion ? 0 : now / 420) + i * Math.PI / 2;
      const x = m.sx + Math.cos(a) * rx, y = cy + Math.sin(a) * ry;
      ctx.globalAlpha = 0.65 + 0.35 * Math.sin(a);
      star(ctx, x, y, size * (0.85 + 0.25 * Math.sin(a)));
    }
    ctx.restore();
  }

  /** 달토끼의 바닥 연출(몸 아래): 깡충 착지 그림자(예고·연속 깡충·점프 중), 달떡 낙하 예고, 남아 있는 달떡 장판, 당근 부채 예고 */
  private drawRabbitGround(ctx: CanvasRenderingContext2D, m: MonsterState & { sx: number; sy: number }, now: number, px: number) {
    const t = m.tele;
    if (t && t.k === 'hop') this.hopShadow(ctx, t.x, t.y, t.r, 1 - t.ms / Math.max(1, t.total), now, px);
    this.hopMarks = this.hopMarks.filter((h) => now - h.at < h.ms + 150);
    for (const h of this.hopMarks) this.hopShadow(ctx, h.x, h.y, h.r, Math.min(1, (now - h.at) / Math.max(1, h.ms)), now, px);
    this.hopJumps = this.hopJumps.filter((j) => now - j.at < j.ms + 200);
    for (const j of this.hopJumps) { // 점프 중: 내려앉을 자리에 그림자가 가장 짙다
      const u = Math.min(1, (now - j.at) / Math.max(1, j.ms));
      this.hopShadow(ctx, j.x, j.y, j.r, 1, now, px, 1 - u * 0.3);
    }
    if (t && t.k === 'mochi') {
      const prog = 1 - t.ms / Math.max(1, t.total);
      for (const sp of t.spots) {
        ctx.save();
        ctx.fillStyle = `rgba(255,190,215,${0.08 + 0.2 * prog})`;
        ctx.beginPath(); ctx.arc(sp.x, sp.y, sp.r, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = `rgba(255,170,205,${0.45 + 0.45 * prog})`; ctx.lineWidth = 6 * px * 2; ctx.setLineDash([50 * px * 2, 34 * px * 2]);
        ctx.lineDashOffset = this.reduceMotion ? 0 : -now / 30;
        ctx.beginPath(); ctx.arc(sp.x, sp.y, sp.r * (1 - 0.15 * (1 - prog)), 0, Math.PI * 2); ctx.stroke();
        ctx.restore();
      }
    }
    this.mochis = this.mochis.filter((g) => now - g.at < g.ms);
    for (const g of this.mochis) for (let i = 0; i < g.spots.length; i++) this.mochiPatch(ctx, g.spots[i], i, now - g.at, g.ms, now, px);
    if (t && t.k === 'carrot') {
      const prog = 1 - t.ms / Math.max(1, t.total), half = rad(t.spread) / 2;
      ctx.save();
      ctx.translate(t.x, t.y);
      const grad = ctx.createRadialGradient(0, 0, m.r * 0.5, 0, 0, t.range);
      grad.addColorStop(0, `rgba(255,150,40,${0.12 + 0.3 * prog})`); grad.addColorStop(1, `rgba(255,150,40,${0.03 + 0.1 * prog})`);
      ctx.fillStyle = grad;
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, t.range, t.dir - half, t.dir + half); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = `rgba(255,170,70,${0.4 + 0.5 * prog})`; ctx.lineWidth = 6 * px * 2; ctx.setLineDash([60 * px * 2, 40 * px * 2]);
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, t.range, t.dir - half, t.dir + half); ctx.closePath(); ctx.stroke();
      ctx.restore();
    }
  }

  /** 깡충 착지 그림자: 어두운 보랏빛 원 + 안쪽 초승달 + 바깥에서 오므라드는 고리. prog 0→1로 짙어진다 */
  private hopShadow(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, prog: number, now: number, px: number, fade = 1) {
    const pulse = this.reduceMotion ? 0 : Math.sin(now / 90) * 0.04 * prog;
    ctx.save();
    ctx.globalAlpha = fade;
    ctx.fillStyle = `rgba(40,24,80,${0.12 + 0.3 * prog + pulse})`;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = `rgba(190,170,255,${0.45 + 0.45 * prog})`; ctx.lineWidth = 8 * px * 2; ctx.setLineDash([60 * px * 2, 36 * px * 2]);
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = `rgba(255,226,120,${0.25 + 0.5 * prog})`;
    crescent(ctx, x, y, r * 0.55);
    ctx.strokeStyle = `rgba(255,240,170,${0.2 + 0.6 * prog})`; ctx.lineWidth = 6 * px * 2; // 바깥에서 오므라드는 고리: 닿는 순간 가장자리와 만난다
    ctx.beginPath(); ctx.arc(x, y, r * (1 - 0.35 * (1 - prog)) * 0.98, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  }

  /** 달떡 장판 한 개: 낙하 때 튀며 커지고, 가장자리가 출렁이고 거품이 오르내린다. 사라지기 전 0.8초는 깜빡이며 흐려진다 */
  private mochiPatch(ctx: CanvasRenderingContext2D, sp: MochiSpot, idx: number, age: number, ms: number, now: number, px: number) {
    // 낙하(0.35초): 작게 시작해 커지며 떨어지고, 닿은 뒤에는 출렁이다 가라앉는다
    const drop = Math.min(1, age / 350);
    const pop = this.reduceMotion ? 1 : drop < 1 ? 0.3 + 0.8 * drop : 1 + 0.06 * Math.sin((age - 350) / 140) * Math.exp(-(age - 350) / 500);
    // 사라지기 직전 0.8초: 깜빡이며 점점 흐려진다(모션 줄이기면 깜빡임 없이 흐려지기만)
    const left = ms - age, k = Math.max(0, left) / 800;
    const fade = left >= 800 ? 1 : (this.reduceMotion ? 0.2 + 0.6 * k : (0.2 + 0.6 * k) * (0.7 + 0.3 * Math.sin(now / 55)));
    const R = sp.r * pop, n = 32;
    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, fade));
    ctx.beginPath();
    for (let i = 0; i <= n; i++) {
      const a = i / n * Math.PI * 2, w = this.reduceMotion ? 0 : 0.035 * Math.sin(a * 5 + now / 380 + idx) + 0.02 * Math.sin(a * 3 - now / 520);
      const rr = R * (0.96 + w);
      if (i === 0) ctx.moveTo(sp.x + Math.cos(a) * rr, sp.y + Math.sin(a) * rr); else ctx.lineTo(sp.x + Math.cos(a) * rr, sp.y + Math.sin(a) * rr);
    }
    ctx.closePath();
    const g = ctx.createRadialGradient(sp.x - R * 0.2, sp.y - R * 0.25, R * 0.1, sp.x, sp.y, R);
    g.addColorStop(0, 'rgba(255,250,252,0.95)'); g.addColorStop(0.7, 'rgba(255,214,230,0.9)'); g.addColorStop(1, 'rgba(244,160,196,0.9)');
    ctx.fillStyle = g; ctx.fill();
    ctx.strokeStyle = 'rgba(214,110,160,0.9)'; ctx.lineWidth = 7 * px * 2; ctx.stroke();
    // 거품: 자리마다 정해진 점들이 천천히 부풀었다 줄어든다
    for (let i = 0; i < 6; i++) {
      const a = (i * 2.399 + idx * 1.7), d = 0.2 + 0.55 * ((i * 37 + idx * 11) % 10) / 10, ph = this.reduceMotion ? 0.5 : (Math.sin(now / 600 + i * 1.9 + idx) + 1) / 2;
      const bx = sp.x + Math.cos(a) * R * d, by = sp.y + Math.sin(a) * R * d, br = R * (0.05 + 0.04 * ph);
      ctx.fillStyle = 'rgba(255,255,255,0.65)'; ctx.beginPath(); ctx.arc(bx, by, br, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(214,110,160,0.55)'; ctx.lineWidth = 3 * px * 2; ctx.stroke();
    }
    if (age < 500 && !this.reduceMotion) { // 떨어질 때 튀는 고리
      const u = age / 500;
      ctx.strokeStyle = `rgba(255,255,255,${0.7 * (1 - u)})`; ctx.lineWidth = 10 * px * 2 * (1 - u);
      ctx.beginPath(); ctx.arc(sp.x, sp.y, sp.r * (0.8 + 0.5 * u), 0, Math.PI * 2); ctx.stroke();
    }
    ctx.restore();
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
    ctx.translate(d.x, d.y - (this.reduceMotion ? 0 : d.r * 0.3 * e));
    if (!(d.img && UPRIGHT.has(d.img))) ctx.rotate(d.heading);
    const sc = (d.r / ART.shell) * (this.reduceMotion ? 1 : 1 + 0.08 * e);
    if (img) ctx.drawImage(img, -ART.cx * sc, -ART.cy * sc, ART.w * sc, ART.h * sc);
    else { ctx.fillStyle = fallbackColor(d.img); ctx.beginPath(); ctx.arc(0, 0, d.r * (sc * ART.shell / d.r), 0, Math.PI * 2); ctx.fill(); }
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
    this.drawHopLands(ctx, now, px);
    this.drawCarrots(ctx, now, px);
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

  /** 깡충 착지 충격(0.5초): 퍼지는 고리 + 달 파편(모션 줄이기면 고리만) */
  private drawHopLands(ctx: CanvasRenderingContext2D, now: number, px: number) {
    this.hopLands = this.hopLands.filter((l) => now - l.at < 500);
    for (const l of this.hopLands) {
      const u = (now - l.at) / 500;
      ctx.save();
      ctx.strokeStyle = `rgba(255,236,150,${0.9 * (1 - u)})`; ctx.lineWidth = Math.max(10 * px * 2, l.r * 0.05) * (1 - u * 0.6);
      ctx.beginPath(); ctx.arc(l.x, l.y, l.r * (0.35 + 0.65 * Math.sqrt(u)), 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = `rgba(255,255,255,${0.7 * (1 - u)})`; ctx.lineWidth *= 0.35;
      ctx.beginPath(); ctx.arc(l.x, l.y, l.r * (0.3 + 0.65 * Math.sqrt(u)), 0, Math.PI * 2); ctx.stroke();
      if (!this.reduceMotion) {
        for (let i = 0; i < 12; i++) { // 먼지와 달 파편: 정해진 각도로 흩어진다(저장하지 않고 i로 계산)
          const a = i * 2.399, d = l.r * (0.2 + 0.7 * u) * (0.7 + 0.3 * ((i * 7) % 5) / 4), s = l.r * (i % 3 === 0 ? 0.06 : 0.04) * (1 - u);
          ctx.fillStyle = i % 3 === 0 ? `rgba(255,226,120,${0.9 * (1 - u)})` : `rgba(235,228,250,${0.7 * (1 - u)})`;
          if (i % 3 === 0) crescent(ctx, l.x + Math.cos(a) * d, l.y + Math.sin(a) * d - u * l.r * 0.12, s * 1.6);
          else { ctx.beginPath(); ctx.arc(l.x + Math.cos(a) * d, l.y + Math.sin(a) * d - u * l.r * 0.12, s, 0, Math.PI * 2); ctx.fill(); }
        }
      }
      ctx.restore();
    }
  }

  /** 날아가는 당근: 발마다 시작점에서 각도 방향으로 speed로 range까지 직선, 진행 방향으로 회전(주황 몸통 + 초록 잎) */
  private drawCarrots(ctx: CanvasRenderingContext2D, now: number, px: number) {
    this.carrots = this.carrots.filter((c) => (now - c.at) / 1000 * c.speed < c.range + c.r * 2);
    for (const c of this.carrots) {
      const d = Math.min(c.range, (now - c.at) / 1000 * c.speed), fade = c.range - d < c.r * 2 ? Math.max(0, (c.range - d) / (c.r * 2)) : 1;
      for (const a of c.angles) {
        const x = c.x + Math.cos(a) * d, y = c.y + Math.sin(a) * d, L = c.r * 2.4, W = c.r * 1.05;
        ctx.save();
        ctx.globalAlpha = fade;
        ctx.translate(x, y); ctx.rotate(a);
        // 잎(뒤쪽): 초록 두 장
        ctx.fillStyle = '#4fae4a'; ctx.strokeStyle = '#2d6e2c'; ctx.lineWidth = Math.max(2 * px, c.r * 0.06);
        for (const sg of [-1, 1]) { ctx.beginPath(); ctx.moveTo(-L * 0.42, 0); ctx.quadraticCurveTo(-L * 0.72, sg * W * 0.55, -L * 0.82, sg * W * 0.12); ctx.quadraticCurveTo(-L * 0.62, sg * W * 0.1, -L * 0.42, 0); ctx.fill(); ctx.stroke(); }
        // 몸통: 앞이 뾰족한 당근
        const g = ctx.createLinearGradient(-L * 0.45, 0, L * 0.55, 0);
        g.addColorStop(0, '#ffa63a'); g.addColorStop(1, '#e8641a');
        ctx.fillStyle = g; ctx.strokeStyle = '#a84410'; ctx.lineWidth = Math.max(3 * px, c.r * 0.08);
        ctx.beginPath(); ctx.moveTo(L * 0.55, 0); ctx.quadraticCurveTo(L * 0.05, -W * 0.62, -L * 0.45, -W * 0.38); ctx.lineTo(-L * 0.45, W * 0.38); ctx.quadraticCurveTo(L * 0.05, W * 0.62, L * 0.55, 0); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.strokeStyle = 'rgba(168,68,16,0.55)'; ctx.lineWidth = Math.max(2 * px, c.r * 0.05); // 주름
        for (const k of [-0.1, 0.15]) { ctx.beginPath(); ctx.moveTo(L * k, -W * 0.3); ctx.lineTo(L * k - L * 0.05, -W * 0.08); ctx.moveTo(L * k, W * 0.3); ctx.lineTo(L * k - L * 0.05, W * 0.08); ctx.stroke(); }
        ctx.restore();
      }
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
