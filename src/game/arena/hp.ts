import type { EntityState } from '../protocol';
import { drawDamage, type DmgKind } from '../damageText';
import { roundRectPath } from './draw';
import type { EntityPosFn } from './orbs';

/**
 * 체력(4.36)의 화면 표시: 원 위 빨간 체력바(맞으면 잠깐 하얗게 남았다 줄어든다, 25% 이하는 깜빡임)와 원 위로 떠오르는 피해 숫자·회복 +.
 * Arena는 서버의 hp·hps·hpHit을 넘기고 그릴 때 부르기만 한다. 100%인 원은 바가 없다(공개 설정이 아니면 내 것만 들어 있다).
 */
interface Bar { pct: number; ghost: number; at: number }
interface Pop { e: number; text: string; at: number; kind?: DmgKind; heal?: { ox: number; oy: number; k: number } }

const POP_MS = 1100;
const POP_MAX = 24;

export class HpLayer {
  private bars = new Map<number, Bar>();
  private pops: Pop[] = [];

  constructor(private readonly reducedMotion: boolean) {}

  /** 원 e의 체력이 pct%가 됐다. 줄었으면 줄기 전 값을 잠깐 남긴다 */
  set(e: number, pct: number) {
    const now = performance.now(), b = this.bars.get(e);
    if (pct >= 100) { this.bars.delete(e); return; }
    if (!b) { this.bars.set(e, { pct, ghost: pct, at: now }); return; }
    if (pct < b.pct) { b.ghost = Math.max(b.ghost, b.pct); b.at = now; }
    b.pct = pct;
  }

  /** 모두의 체력 목록으로 맞춘다. 목록에 없는 원(me 제외)은 100%라 지운다 */
  setAll(list: [number, number][], me: number) {
    const keep = new Set(list.map((l) => l[0]));
    for (const e of [...this.bars.keys()]) if (e !== me && !keep.has(e)) this.bars.delete(e);
    for (const [e, pct] of list) this.set(e, pct);
  }

  clear() { this.bars.clear(); }

  /** 그 원 위로 피해 숫자를 띄운다 */
  pop(e: number, text: string, kind: DmgKind) {
    if (this.pops.length >= POP_MAX) this.pops.shift();
    this.pops.push({ e, text, at: performance.now(), kind });
  }

  /** 회복: 숫자 대신 원 안 여기저기(서로 겹치지 않는 자리)에서 작은 초록 + 가 시차를 두고 떠올랐다 사라진다 */
  healPop(e: number) {
    const now = performance.now(), n = 4, a0 = Math.random() * Math.PI * 2;
    for (let i = 0; i < n; i++) {
      if (this.pops.length >= POP_MAX) this.pops.shift();
      const ang = a0 + (i / n) * Math.PI * 2 + (Math.random() - 0.5) * 0.9, d = 0.28 + Math.random() * 0.4; // 중심에서 반지름의 28~68%
      this.pops.push({ e, text: '', at: now + i * 130 + Math.random() * 90, heal: { ox: Math.cos(ang) * d, oy: Math.sin(ang) * d, k: 0.7 + Math.random() * 0.5 } });
    }
  }

  /** 원 e(그리는 위치·반지름) 위의 체력바. z는 줌 */
  drawBar(ctx: CanvasRenderingContext2D, e: EntityState, z: number, now: number) {
    const b = this.bars.get(e.e);
    if (!b) return;
    const w = Math.max(48 / z, Math.min(e.r * 1.7, 150 / z)), h = 7 / z, pad = 1.5 / z;
    const x = e.x - w / 2, y = e.y - e.r - 12 / z;
    ctx.save();
    ctx.fillStyle = 'rgba(8,12,20,0.8)';
    ctx.beginPath(); roundRectPath(ctx, x - pad, y - pad, w + pad * 2, h + pad * 2, (h + pad * 2) / 2); ctx.fill();
    const lag = Math.max(0, 1 - (now - b.at - 350) / 400); // 맞은 뒤 0.35초 동안 하얗게 남았다가 0.4초에 걸쳐 줄어든다
    const ghost = b.pct + Math.max(0, b.ghost - b.pct) * Math.max(0, Math.min(1, lag));
    if (ghost > b.pct) { ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.beginPath(); roundRectPath(ctx, x, y, w * ghost / 100, h, h / 2); ctx.fill(); }
    const pulse = b.pct <= 25 && !this.reducedMotion ? 0.7 + 0.3 * Math.sin(now / 160) : 1;
    ctx.globalAlpha = pulse;
    ctx.fillStyle = '#f04a4a'; // 체력은 항상 빨강(경험치의 초록과 구별). 위급하면 깜빡인다
    ctx.beginPath(); roundRectPath(ctx, x, y, Math.max(h, w * b.pct / 100), h, h / 2); ctx.fill();
    ctx.restore();
  }

  /** 떠오르는 피해 숫자와 회복 +. pos가 null을 주는 원(은신 등)은 건너뛴다 */
  drawPops(ctx: CanvasRenderingContext2D, now: number, z: number, pos: EntityPosFn) {
    if (this.pops.length === 0) return;
    this.pops = this.pops.filter((p) => now - p.at < POP_MS);
    for (const p of this.pops) {
      const o = pos(p.e, now);
      if (!o) continue;
      const t = (now - p.at) / POP_MS;
      if (t < 0) continue; // 시차를 둔 + 는 차례가 오기 전에는 그리지 않는다
      if (p.heal) {
        // 힐 표시: 둥근 십자(+). 원 안의 정해진 자리에서 살짝 떠오른다(모션 줄이기면 제자리)
        ctx.save();
        ctx.globalAlpha = 1 - t * t;
        const a = Math.max(9 / z, Math.min(o.r * 0.17, 20 / z)) * p.heal.k, w = a * 0.62; // 팔 길이, 팔 굵기
        const cx = o.x + p.heal.ox * o.r, cy = o.y + p.heal.oy * o.r - (this.reducedMotion ? 0 : t * 22 / z);
        ctx.beginPath();
        roundRectPath(ctx, cx - a, cy - w / 2, a * 2, w, w / 2);
        roundRectPath(ctx, cx - w / 2, cy - a, w, a * 2, w / 2);
        ctx.lineWidth = 2.5 / z; ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.stroke();
        ctx.fillStyle = '#4ade80'; ctx.fill();
        ctx.restore();
        continue;
      }
      const size = Math.max(18 / z, Math.min(o.r * 0.55, 40 / z)) * (p.kind === 'taken' ? 1.15 : 1);
      drawDamage(ctx, p.text, o.x, o.y - o.r - 14 / z, t, p.kind ?? 'other', size, this.reducedMotion);
    }
  }
}
