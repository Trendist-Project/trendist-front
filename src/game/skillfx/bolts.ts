import type { SkillFx } from '../protocol';
import { FX_CAP, seeded } from './common';

/** 투사체(독·암흑·슬로우·스턴)와 맞은 자리의 파열(화염구가 맞은 자리도 같은 파열을 쓴다, 4.33) */

type BoltKind = 'poison' | 'darkness' | 'slow' | 'stun';
export type BurstKind = BoltKind | 'fireball';
/** 투사체·맞은 자리 고리의 색(꼬리, 몸통, 테두리, 고리). 종류가 늘면 여기에 한 줄 */
const BOLT_STYLE: Record<BurstKind, { tail: string; fill: string; edge: string; ring: string }> = {
  poison: { tail: 'rgba(90,220,90,0.55)', fill: '#4cd964', edge: '#c9ffd0', ring: '90,220,90' },
  darkness: { tail: 'rgba(120,70,200,0.5)', fill: '#14101c', edge: '#9b6cff', ring: '155,108,255' },
  slow: { tail: 'rgba(120,200,255,0.55)', fill: '#8fd3ff', edge: '#eaf8ff', ring: '120,200,255' },
  stun: { tail: 'rgba(255,225,80,0.55)', fill: '#ffe14d', edge: '#fff7c2', ring: '255,225,80' },
  fireball: { tail: 'rgba(255,140,40,0.55)', fill: '#ff8c2a', edge: '#ffe2a0', ring: '255,140,40' },
};
interface Bolt { kind: BoltKind; x: number; y: number; dx: number; dy: number; speed: number; range: number; radius: number; at: number }
interface Burst { x: number; y: number; kind: BurstKind; at: number }
const BURST_MS = 450;
const BOLT_MIN_SCREEN_RADIUS = 6;   // 화면에서 투사체 반지름이 이보다 작아지지 않게 그린다(px)

export class BoltFx {
  private bolts = new Map<number, Bolt>();
  private bursts: Burst[] = [];

  constructor(private readonly reducedMotion: boolean) {}

  clear() { this.bolts.clear(); this.bursts = []; }

  /** 투사체가 날아가기 시작했다 */
  add(fx: Extract<SkillFx, { id: 'bolt' }>, now: number) {
    if (this.bolts.size >= FX_CAP) this.bolts.delete(this.bolts.keys().next().value as number);
    this.bolts.set(fx.bid, { kind: fx.kind, x: fx.x, y: fx.y, dx: fx.dx, dy: fx.dy, speed: fx.speed, range: fx.range, radius: fx.radius, at: now });
  }

  /** 투사체가 원에 맞았거나 사거리 끝에서 사라졌다(맞았으면 그 자리에 파열) */
  end(fx: Extract<SkillFx, { id: 'boltEnd' }>, now: number) {
    const b = this.bolts.get(fx.bid);
    this.bolts.delete(fx.bid);
    if (b && fx.hit !== undefined && fx.x !== undefined && fx.y !== undefined) this.addBurst(fx.x, fx.y, b.kind, now);
  }

  /** 맞은 자리의 파열 */
  addBurst(x: number, y: number, kind: BurstKind, now: number) {
    if (this.bursts.length >= FX_CAP) this.bursts.shift();
    this.bursts.push({ x, y, kind, at: now });
  }

  /**
   * 투사체(독·암흑·슬로우·스턴)와 맞은 자리의 파열. 위치는 시작점에서 속도 × 지난 시간으로 구해 서버와 같은 곳에 그린다.
   * 공통: 몸 둘레의 부드러운 빛, 끝으로 갈수록 가늘어지는 꼬리 띠, 꼬리에서 흩날리는 입자. 몸통은 종류마다 다르다 —
   * 독은 방울이 맺힌 초록 구체, 암흑은 보라 테두리가 도는 검은 구체와 연기, 슬로우는 돌며 반짝이는 얼음 결정과 눈 알갱이,
   * 스턴은 사방으로 튀는 번개 줄기가 달린 노란 구체. 판정 반지름(radius)은 그대로이고 입자·빛은 그 둘레에만 그린다.
   */
  drawBolts(ctx: CanvasRenderingContext2D, now: number, z: number) {
    for (const [id, b] of this.bolts) {
      const age = now - b.at, traveled = Math.min(b.range, b.speed * age / 1000);
      if (age > (b.range / b.speed) * 1000 + 400) { this.bolts.delete(id); continue; } // 끝 신호를 놓쳐도 사라진다
      const x = b.x + b.dx * traveled, y = b.y + b.dy * traveled, nx = -b.dy, ny = b.dx;
      const r = Math.max(b.radius, BOLT_MIN_SCREEN_RADIUS / z); // 판정은 월드 반지름 그대로이고, 줌아웃해도 화면에서 이만큼은 보이게 그린다
      const st = BOLT_STYLE[b.kind], rm = this.reducedMotion;
      ctx.save();
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      // 빛
      const glow = ctx.createRadialGradient(x, y, r * 0.3, x, y, r * 3.4);
      glow.addColorStop(0, `rgba(${st.ring},0.5)`); glow.addColorStop(1, `rgba(${st.ring},0)`);
      ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(x, y, r * 3.4, 0, Math.PI * 2); ctx.fill();
      // 꼬리 띠: 머리에서 넓고 끝에서 점이 되는 삼각 띠(막 쏜 직후에는 지나온 길이만큼만)
      const len = Math.min(r * 9, traveled + r * 2);
      const tail = ctx.createLinearGradient(x, y, x - b.dx * len, y - b.dy * len);
      tail.addColorStop(0, `rgba(${st.ring},0.7)`); tail.addColorStop(1, `rgba(${st.ring},0)`);
      ctx.fillStyle = tail;
      ctx.beginPath(); ctx.moveTo(x + nx * r * 0.95, y + ny * r * 0.95); ctx.lineTo(x - b.dx * len, y - b.dy * len); ctx.lineTo(x - nx * r * 0.95, y - ny * r * 0.95); ctx.closePath(); ctx.fill();
      // 꼬리 입자: 뒤로 흘러가며 작아지고 옅어진다(투사체마다 다른 모양, 프레임마다 흔들리지 않는다)
      if (!rm) {
        const rand = seeded(id * 2654435761);
        for (let i = 0; i < 9; i++) {
          const ph = (age / 560 + rand()) % 1, off = (rand() - 0.5) * 2 * r * (0.5 + ph * 1.1), sz = r * (0.2 + rand() * 0.22) * (1 - ph * 0.7);
          const px = x - b.dx * ph * len + nx * off, py = y - b.dy * ph * len + ny * off;
          ctx.globalAlpha = (1 - ph) * 0.95;
          if (b.kind === 'poison') { ctx.strokeStyle = '#c9ffd0'; ctx.lineWidth = Math.max(1 / z, sz * 0.35); ctx.beginPath(); ctx.arc(px, py, sz, 0, Math.PI * 2); ctx.stroke(); }
          else if (b.kind === 'darkness') { ctx.fillStyle = 'rgba(30,18,50,0.8)'; ctx.beginPath(); ctx.arc(px, py, sz * 1.5, 0, Math.PI * 2); ctx.fill(); }
          else if (b.kind === 'slow') { ctx.strokeStyle = '#eaf8ff'; ctx.lineWidth = Math.max(1 / z, sz * 0.35); ctx.beginPath(); ctx.moveTo(px - sz, py); ctx.lineTo(px + sz, py); ctx.moveTo(px, py - sz); ctx.lineTo(px, py + sz); ctx.stroke(); }
          else { ctx.fillStyle = '#fff7c2'; ctx.beginPath(); ctx.arc(px, py, sz * 0.8, 0, Math.PI * 2); ctx.fill(); }
        }
        ctx.globalAlpha = 1;
      }
      // 몸통
      const spin = rm ? 0 : age / 260;
      if (b.kind === 'poison') {
        const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, r * 0.1, x, y, r);
        g.addColorStop(0, '#e6ffe8'); g.addColorStop(0.45, '#4cd964'); g.addColorStop(1, '#1b8a33');
        ctx.fillStyle = g; ctx.strokeStyle = st.edge; ctx.lineWidth = Math.max(1.8 / z, r * 0.14);
        ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.beginPath(); ctx.ellipse(x - r * 0.35, y - r * 0.4, r * 0.28, r * 0.17, -0.6, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = 'rgba(230,255,235,0.8)'; ctx.lineWidth = Math.max(1 / z, r * 0.07);
        ctx.beginPath(); ctx.arc(x + r * 0.32, y + r * 0.22, r * 0.17, 0, Math.PI * 2); ctx.stroke();
        ctx.beginPath(); ctx.arc(x - r * 0.1, y + r * 0.45, r * 0.1, 0, Math.PI * 2); ctx.stroke();
      } else if (b.kind === 'darkness') {
        const g = ctx.createRadialGradient(x, y, r * 0.1, x, y, r);
        g.addColorStop(0, '#000'); g.addColorStop(0.7, '#150c25'); g.addColorStop(1, '#2a1650');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#9b6cff'; ctx.lineWidth = Math.max(2 / z, r * 0.16);
        for (let i = 0; i < 3; i++) { const a0 = -spin * 1.4 + (i * Math.PI * 2) / 3; ctx.beginPath(); ctx.arc(x, y, r * 1.02, a0, a0 + 1.3); ctx.stroke(); }
        ctx.strokeStyle = 'rgba(200,170,255,0.5)'; ctx.lineWidth = Math.max(1 / z, r * 0.06);
        ctx.beginPath(); ctx.arc(x, y, r * 0.55, spin, spin + Math.PI); ctx.stroke();
      } else if (b.kind === 'slow') {
        const hex = (rad: number) => { ctx.beginPath(); for (let i = 0; i < 6; i++) { const a = spin + (i * Math.PI) / 3; const px = x + Math.cos(a) * rad, py = y + Math.sin(a) * rad; if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py); } ctx.closePath(); };
        const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, r * 0.1, x, y, r * 1.2);
        g.addColorStop(0, '#f4fcff'); g.addColorStop(0.6, '#9bd8ff'); g.addColorStop(1, '#4aa8e8');
        hex(r * 1.2); ctx.fillStyle = g; ctx.fill(); ctx.strokeStyle = '#e8f8ff'; ctx.lineWidth = Math.max(1.8 / z, r * 0.14); ctx.stroke();
        hex(r * 0.62); ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = Math.max(1.2 / z, r * 0.08); ctx.stroke();
        ctx.beginPath(); for (let i = 0; i < 3; i++) { const a = spin + (i * Math.PI) / 3; ctx.moveTo(x + Math.cos(a) * r * 1.0, y + Math.sin(a) * r * 1.0); ctx.lineTo(x - Math.cos(a) * r * 1.0, y - Math.sin(a) * r * 1.0); } ctx.stroke();
      } else {
        const g = ctx.createRadialGradient(x, y, r * 0.1, x, y, r);
        g.addColorStop(0, '#ffffff'); g.addColorStop(0.5, '#fff08a'); g.addColorStop(1, '#ffc800');
        // 번개 줄기: 약 70ms마다 모양이 바뀌며 사방으로 뻗는다
        const rand = seeded(Math.floor(rm ? 0 : now / 70) * 131 + id);
        ctx.strokeStyle = '#fff7b0'; ctx.lineWidth = Math.max(1.6 / z, r * 0.14);
        for (let k = 0; k < 5; k++) {
          let a = rand() * Math.PI * 2, px = x + Math.cos(a) * r * 0.9, py = y + Math.sin(a) * r * 0.9;
          ctx.beginPath(); ctx.moveTo(px, py);
          for (let j = 0; j < 3; j++) { a += (rand() - 0.5) * 1.2; px += Math.cos(a) * r * 0.55; py += Math.sin(a) * r * 0.55; ctx.lineTo(px, py); }
          ctx.stroke();
        }
        ctx.fillStyle = g; ctx.strokeStyle = '#fff7c2'; ctx.lineWidth = Math.max(1.8 / z, r * 0.14);
        ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.strokeStyle = '#8a6200'; ctx.lineWidth = Math.max(1.8 / z, r * 0.16);
        ctx.beginPath(); ctx.moveTo(x + r * 0.2, y - r * 0.65); ctx.lineTo(x - r * 0.3, y + r * 0.05); ctx.lineTo(x + r * 0.28, y + r * 0.05); ctx.lineTo(x - r * 0.2, y + r * 0.65); ctx.stroke();
      }
      ctx.restore();
    }
    this.bursts = this.bursts.filter((u) => now - u.at < BURST_MS);
    for (const u of this.bursts) {
      const t = (now - u.at) / BURST_MS, ring = BOLT_STYLE[u.kind].ring;
      ctx.save(); ctx.lineCap = 'round';
      const R = Math.max(14, 16 / z);
      // 순간 번쩍임
      if (t < 0.35) { const k = 1 - t / 0.35, g = ctx.createRadialGradient(u.x, u.y, 0, u.x, u.y, R * 2.2); g.addColorStop(0, `rgba(255,255,255,${0.85 * k})`); g.addColorStop(0.4, `rgba(${ring},${0.6 * k})`); g.addColorStop(1, `rgba(${ring},0)`); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(u.x, u.y, R * 2.2, 0, Math.PI * 2); ctx.fill(); }
      // 퍼지는 고리 두 겹
      for (let k = 0; k < 2; k++) {
        const tk = Math.max(0, t - k * 0.15) / (1 - k * 0.15);
        if (tk <= 0) continue;
        ctx.strokeStyle = `rgba(${ring},${(1 - tk) * (k ? 0.6 : 1)})`; ctx.lineWidth = Math.max(3 / z, 5) * (1 - tk * 0.6);
        ctx.beginPath(); ctx.arc(u.x, u.y, R * (0.8 + 4 * tk) * (k ? 0.7 : 1), 0, Math.PI * 2); ctx.stroke();
      }
      // 튀는 입자
      if (!this.reducedMotion) {
        const rand = seeded(Math.floor(u.at) | 1);
        ctx.strokeStyle = `rgba(${ring},${1 - t})`; ctx.lineWidth = Math.max(2 / z, 3);
        for (let i = 0; i < 10; i++) {
          const a = rand() * Math.PI * 2, d0 = R * (0.8 + t * 3.2) * (0.7 + rand() * 0.6), d1 = d0 + R * 0.6 * (1 - t);
          ctx.beginPath(); ctx.moveTo(u.x + Math.cos(a) * d0, u.y + Math.sin(a) * d0); ctx.lineTo(u.x + Math.cos(a) * d1, u.y + Math.sin(a) * d1); ctx.stroke();
        }
      }
      ctx.restore();
    }
  }
}
