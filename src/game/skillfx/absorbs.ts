import type { SkillFx } from '../protocol';
import { FX_CAP, newSeed, seeded, type PosFn } from './common';

/** 흡수(4.33): 쓴 원과 사거리 안의 원들을 잇는 선, 빼앗는 순간의 번쩍임, 끊길 때의 파편 */

interface Absorb { e: number; t: number; at: number; until: number; tickAt: number; o?: { x: number; y: number; r: number }; v?: { x: number; y: number; r: number } }
const ABSORB_BREAK_MS = 450;  // 선이 끊길 때 파편이 흩어지는 시간
const TICK_MS = 350;          // 키워드를 빼앗는 순간 번쩍이는 시간

export class AbsorbFx {
  private absorbs = new Map<string, Absorb>(); // 흡수 선("쓴 원:붙든 원") → 시각. 쓴 원 하나가 사거리 안의 모든 원과 선을 잇는다
  private absorbBreaks: { o: { x: number; y: number }; v: { x: number; y: number }; at: number; seed: number }[] = [];

  constructor(private readonly reducedMotion: boolean) {}

  clear() { this.absorbs.clear(); this.absorbBreaks = []; }

  /** 원 e가 원 t와 선을 이었다 */
  add(fx: Extract<SkillFx, { id: 'absorb' }>, now: number) { this.absorbs.set(`${fx.e}:${fx.t}`, { e: fx.e, t: fx.t, at: now, until: now + fx.ms, tickAt: -1e9 }); }

  /** 키워드 1개를 빼앗는 순간 */
  tick(fx: Extract<SkillFx, { id: 'absorbTick' }>, now: number) { const a = this.absorbs.get(`${fx.e}:${fx.t}`); if (a) a.tickAt = now; }

  /** 선이 끊겼다(t가 없으면 그 원이 쓴 선 모두) */
  end(fx: Extract<SkillFx, { id: 'absorbEnd' }>) {
    if (fx.t !== undefined) this.breakAbsorb(`${fx.e}:${fx.t}`);
    else for (const [k, a] of [...this.absorbs]) if (a.e === fx.e) this.breakAbsorb(k);
  }

  /** 정화: 선을 쓴 쪽이든 붙들린 쪽이든 끊긴다 */
  cleanse(e: number) {
    for (const [k, a] of [...this.absorbs]) if (a.e === e || a.t === e) this.breakAbsorb(k);
  }

  /** 흡수 선이 끊겼다: 마지막으로 그린 두 끝점에서 파편이 흩어진다 */
  private breakAbsorb(key: string) {
    const a = this.absorbs.get(key);
    this.absorbs.delete(key);
    if (!a?.o || !a.v) return;
    if (this.absorbBreaks.length >= FX_CAP) this.absorbBreaks.shift();
    this.absorbBreaks.push({ o: { x: a.o.x, y: a.o.y }, v: { x: a.v.x, y: a.v.y }, at: performance.now(), seed: newSeed() });
  }

  /**
   * 흡수: 쓴 원에서 붙든 원까지 이어지는 에너지 선. 갈고리의 쇠사슬과 달리 보라·자홍으로 맥동하는 빛줄기이고,
   * 붙든 원에서 쓴 원 쪽으로 빨려 드는 빛 알갱이가 흐른다. 매 프레임 두 원의 현재 위치를 이어 그리므로 움직여도 따라간다.
   * 키워드를 빼앗는 순간(absorbTick)에는 붙든 원이 번쩍이고, 끊기면 파편이 흩어진다.
   */
  drawAbsorbs(ctx: CanvasRenderingContext2D, now: number, z: number, pos: PosFn) {
    for (const [key, a] of this.absorbs) {
      if (now >= a.until + 600) { this.absorbs.delete(key); continue; }
      const o = pos(a.e, now), v = pos(a.t, now);
      if (!o || !v) continue;
      a.o = o; a.v = v;
      const dx = v.x - o.x, dy = v.y - o.y, d = Math.hypot(dx, dy) || 1, ux = dx / d, uy = dy / d;
      const x1 = o.x + ux * o.r * 0.7, y1 = o.y + uy * o.r * 0.7, x2 = v.x - ux * v.r * 0.7, y2 = v.y - uy * v.r * 0.7;
      const fade = Math.min(1, (now - a.at) / 150, (a.until + 600 - now) / 600);
      const pulse = this.reducedMotion ? 0.5 : (Math.sin(now / 110) + 1) / 2;
      const w = Math.max(4 / z, o.r * 0.12);
      ctx.save();
      ctx.globalAlpha = fade; ctx.lineCap = 'round';
      const g = ctx.createLinearGradient(x1, y1, x2, y2);
      g.addColorStop(0, 'rgba(255,90,220,0.95)'); g.addColorStop(1, 'rgba(150,90,255,0.95)');
      ctx.strokeStyle = 'rgba(190,90,255,0.22)'; ctx.lineWidth = w * (2.6 + pulse);
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
      ctx.strokeStyle = g; ctx.lineWidth = w * (0.8 + pulse * 0.5);
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,240,255,0.9)'; ctx.lineWidth = Math.max(1.5 / z, w * 0.25);
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
      // 빨려 드는 알갱이: 붙든 원 → 쓴 원. 선이 길수록 알갱이도 늘어난다
      const dots = this.reducedMotion ? 0 : Math.max(5, Math.min(24, Math.round(Math.hypot(x2 - x1, y2 - y1) * z / 40)));
      ctx.fillStyle = '#ffd8ff';
      for (let i = 0; i < dots; i++) {
        const ph = ((now / 650) + i / dots) % 1, px = x2 + (x1 - x2) * ph, py = y2 + (y1 - y2) * ph, sz = Math.max(2 / z, w * 0.5) * (0.5 + 0.7 * (1 - ph));
        ctx.beginPath(); ctx.arc(px + (-uy) * Math.sin(ph * 14 + i) * w * 0.9, py + ux * Math.sin(ph * 14 + i) * w * 0.9, sz, 0, Math.PI * 2); ctx.fill();
      }
      // 양 끝의 작은 빛
      for (const [bx, by, c] of [[x1, y1, '255,120,230'], [x2, y2, '160,100,255']] as const) {
        const rg = ctx.createRadialGradient(bx, by, 0, bx, by, w * 2.6);
        rg.addColorStop(0, `rgba(${c},0.9)`); rg.addColorStop(1, `rgba(${c},0)`);
        ctx.fillStyle = rg; ctx.beginPath(); ctx.arc(bx, by, w * 2.6, 0, Math.PI * 2); ctx.fill();
      }
      // 키워드를 빼앗는 순간: 붙든 원 둘레 번쩍임과 −1
      const tk = (now - a.tickAt) / TICK_MS;
      if (tk >= 0 && tk < 1) {
        ctx.globalAlpha = (1 - tk) * fade;
        ctx.strokeStyle = '#ffd8ff'; ctx.lineWidth = Math.max(3 / z, v.r * 0.12);
        ctx.beginPath(); ctx.arc(v.x, v.y, v.r * (1.05 + tk * 0.5), 0, Math.PI * 2); ctx.stroke();
        const fs = Math.max(14 / z, Math.min(v.r * 0.5, 34));
        ctx.font = `800 ${fs}px "Noto Sans KR", system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
        ctx.lineWidth = Math.max(2 / z, fs * 0.15); ctx.strokeStyle = 'rgba(40,10,50,0.9)'; ctx.fillStyle = '#ffb3f5';
        const ty = v.y - v.r - 6 / z - tk * v.r * 0.6;
        ctx.strokeText('−1', v.x, ty); ctx.fillText('−1', v.x, ty);
      }
      ctx.restore();
    }
    // 끊어진 선: 두 끝점 사이를 쪼갠 조각이 양쪽으로 튀며 사라진다
    this.absorbBreaks = this.absorbBreaks.filter((b) => now - b.at < ABSORB_BREAK_MS);
    for (const b of this.absorbBreaks) {
      const t = (now - b.at) / ABSORB_BREAK_MS, rand = seeded(b.seed), pieces = 7;
      ctx.save(); ctx.lineCap = 'round'; ctx.strokeStyle = `rgba(230,130,255,${1 - t})`; ctx.lineWidth = Math.max(3 / z, 4) * (1 - t * 0.5);
      for (let i = 0; i < pieces; i++) {
        const u0 = i / pieces, u1 = u0 + 0.6 / pieces, side = (rand() - 0.5) * 2, off = side * 28 * t;
        const ax = b.o.x + (b.v.x - b.o.x) * u0, ay = b.o.y + (b.v.y - b.o.y) * u0, bx = b.o.x + (b.v.x - b.o.x) * u1, by = b.o.y + (b.v.y - b.o.y) * u1;
        const nx = -(b.v.y - b.o.y), ny = b.v.x - b.o.x, nl = Math.hypot(nx, ny) || 1;
        ctx.beginPath(); ctx.moveTo(ax + (nx / nl) * off, ay + (ny / nl) * off); ctx.lineTo(bx + (nx / nl) * off, by + (ny / nl) * off); ctx.stroke();
      }
      ctx.restore();
    }
  }
}
