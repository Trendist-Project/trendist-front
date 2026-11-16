import type { EntityState } from '../protocol';
import { drawDamage, type DmgKind } from '../damageText';
import { roundRectPath } from './draw';
import type { EntityPosFn } from './orbs';

/**
 * 체력(4.36)의 화면 표시: 원 위 빨간 체력바(맞으면 잠깐 하얗게 남았다 줄어든다, 25% 이하는 깜빡임)와 원 위로 떠오르는 피해 숫자·회복 +.
 * Arena는 서버의 hp·hps·hpHit을 넘기고 그릴 때 부르기만 한다. 100%인 원은 바가 없다(공개 설정이 아니면 내 것만 들어 있다).
 * 보호막(쉴드)은 롤(LoL)처럼 체력바 끝에 흰 조각으로 이어 붙는다. 체력+쉴드가 최대 체력을 넘으면 바 전체를 그 합으로 나눠 한 줄에 같이 보이고, 쉴드가 있으면 체력이 100%여도 바를 그린다.
 */
interface Bar { pct: number; ghost: number; at: number }
/** 보호막: pct는 최대 체력 대비 %(절대값, 체력이 100%여도 그 위에 쌓인다), at은 마지막으로 줄어든 시각(번쩍임) */
interface Barrier { pct: number; at: number }
interface Pop { e: number; text: string; at: number; kind?: DmgKind; heal?: { ox: number; oy: number; k: number } }

const POP_MS = 1100;
const POP_MAX = 24;

export class HpLayer {
  private bars = new Map<number, Bar>();
  private barriers = new Map<number, Barrier>();
  private pops: Pop[] = [];

  constructor(private readonly reducedMotion: boolean) {}

  /** 원 e의 체력이 pct%가 됐다. 줄었으면 줄기 전 값을 잠깐 남긴다 */
  set(e: number, pct: number) {
    const now = performance.now(), b = this.bars.get(e);
    if (pct >= 100) { this.bars.delete(e); return; }
    if (!b) { this.bars.set(e, { pct, ghost: pct, at: now }); return; }
    b.pct = b.ghost = pct; // 줄어들 때 남는 흰 잔상은 없다(깜빡여 보여서 뺐다)
  }

  /** 모두의 체력 목록으로 맞춘다. 목록에 없는 원(me 제외)은 100%라 지운다 */
  setAll(list: [number, number][], me: number) {
    const keep = new Set(list.map((l) => l[0]));
    for (const e of [...this.bars.keys()]) if (e !== me && !keep.has(e)) this.bars.delete(e);
    for (const [e, pct] of list) this.set(e, pct);
  }

  /** 원 e의 쉴드가 pct%(최대 체력 대비)가 됐다. 0 이하면 지운다. 줄었으면 번쩍인다 */
  setBarrier(e: number, pct: number) {
    if (pct <= 0) { this.barriers.delete(e); return; }
    const s = this.barriers.get(e), now = performance.now();
    if (!s) this.barriers.set(e, { pct, at: -1e9 });
    else { if (pct < s.pct) s.at = now; s.pct = pct; }
  }

  clear() { this.bars.clear(); this.barriers.clear(); }

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

  /** 원 e(그리는 위치·반지름) 위의 체력바. z는 줌. 쉴드는 롤처럼 체력 끝에 흰 조각으로 이어 붙는다 */
  drawBar(ctx: CanvasRenderingContext2D, e: EntityState, z: number, now: number) {
    const hb = this.bars.get(e.e), sh = this.barriers.get(e.e);
    if (!hb && !sh) return;
    const b = hb ?? { pct: 100, ghost: 100, at: -1e9 }; // 체력이 100%여도 쉴드가 있으면 바를 그린다
    const barrier = sh ? sh.pct : 0, total = Math.max(100, b.pct + barrier); // 합이 최대 체력을 넘으면 바 전체를 그 합으로 나눈다
    const w = Math.max(48 / z, Math.min(e.r * 1.7, 150 / z)), h = 7 / z, pad = 1.5 / z;
    const x = e.x - w / 2, y = e.y - e.r - 12 / z;
    ctx.save();
    ctx.fillStyle = 'rgba(8,12,20,0.8)';
    ctx.beginPath(); roundRectPath(ctx, x - pad, y - pad, w + pad * 2, h + pad * 2, (h + pad * 2) / 2); ctx.fill();
    const lag = Math.max(0, 1 - (now - b.at - 350) / 400); // 맞은 뒤 0.35초 동안 하얗게 남았다가 0.4초에 걸쳐 줄어든다
    const ghost = b.pct + Math.max(0, b.ghost - b.pct) * Math.max(0, Math.min(1, lag));
    if (ghost > b.pct) { ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.beginPath(); roundRectPath(ctx, x, y, w * ghost / total, h, h / 2); ctx.fill(); }
    const pulse = b.pct <= 25 && !this.reducedMotion ? 0.7 + 0.3 * Math.sin(now / 160) : 1;
    ctx.globalAlpha = pulse;
    ctx.fillStyle = '#f04a4a'; // 체력은 항상 빨강(경험치의 초록과 구별). 위급하면 깜빡인다
    ctx.beginPath(); roundRectPath(ctx, x, y, Math.max(h, w * b.pct / total), h, h / 2); ctx.fill();
    ctx.globalAlpha = 1;
    if (barrier > 0) { // 쉴드: 체력 끝에서 이어지는 흰 조각(롤). 맞으면 잠깐 번쩍한다
      const sx = x + w * b.pct / total, sw = w * barrier / total, flash = Math.max(0, 1 - (now - (sh as Barrier).at) / 220);
      ctx.save();
      ctx.beginPath(); roundRectPath(ctx, x, y, w, h, h / 2); ctx.clip();
      const g = ctx.createLinearGradient(0, y, 0, y + h);
      g.addColorStop(0, '#ffffff'); g.addColorStop(1, flash > 0 ? '#ffe6a0' : '#b9dcec');
      ctx.fillStyle = g; ctx.fillRect(sx, y, sw, h);
      ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fillRect(sx, y, Math.max(1 / z, h * 0.12), h); // 체력과 쉴드의 경계
      ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.fillRect(sx, y, sw, h * 0.28);
      ctx.restore();
    }
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
        ctx.lineWidth = 2.5 / z; ctx.strokeStyle = 'rgba(255,255,255,0.95)'; ctx.stroke();
        ctx.fillStyle = '#12a346'; ctx.fill();
        ctx.restore();
        continue;
      }
      const size = Math.max(18 / z, Math.min(o.r * 0.55, 40 / z)) * (p.kind === 'taken' ? 1.15 : 1);
      drawDamage(ctx, p.text, o.x, o.y - o.r - 14 / z, t, p.kind ?? 'other', size, this.reducedMotion);
    }
  }
}
