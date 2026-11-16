import type { SkillFx } from '../protocol';
import { FX_CAP, seeded } from './common';
import { BOLT_LOOKS, BURST_STYLE, type BoltKind, type BurstKind } from './boltLooks';

/** 투사체(독·암흑·슬로우·스턴·속박·침묵·혼란)와 맞은 자리의 파열(화염구가 맞은 자리도 같은 파열을 쓴다, 4.33). 종류별 모양은 boltLooks.ts의 표에 있다 */

export type { BurstKind } from './boltLooks';
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
      const look = BOLT_LOOKS[b.kind], st = look.style, rm = this.reducedMotion;
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
          look.particle({ ctx, px, py, sz, i, z, dx: b.dx, dy: b.dy });
        }
        ctx.globalAlpha = 1;
      }
      // 몸통
      const spin = rm ? 0 : age / 260;
      look.body({ ctx, x, y, r, z, spin, dx: b.dx, dy: b.dy, now, id, rm, st });
      ctx.restore();
    }
    this.bursts = this.bursts.filter((u) => now - u.at < BURST_MS);
    for (const u of this.bursts) {
      const t = (now - u.at) / BURST_MS, ring = BURST_STYLE[u.kind].ring;
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
