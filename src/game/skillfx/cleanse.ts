import { FX_CAP, newSeed, type PosFn } from './common';

/** 정화(4.33)를 쓴 원의 연출. 걸려 있던 상태 표시를 지우는 일은 statuses·absorbs가 맡는다 */

const CLEANSE_MS = 900;

export class CleanseFx {
  private cleanses: { e: number; at: number; seed: number }[] = [];

  constructor(private readonly reducedMotion: boolean) {}

  clear() { this.cleanses = []; }

  /** 원 e가 정화를 썼다 */
  add(e: number, now: number) {
    if (this.cleanses.length >= FX_CAP) this.cleanses.shift();
    this.cleanses.push({ e, at: now, seed: newSeed() }); // seed: 쓸 때마다 끊어지는 모양이 다르게
  }

  /**
   * 정화: 원을 감싼 하늘색 테두리가 불규칙하게 금이 가다 여러 조각의 호로 끊어져 사방으로 튀어 나가며 돌고 떨어지는 연출.
   * 처음에는 테두리가 팽팽하게 떨리며 끊어질 자리에 금이 가고, "툭" 끊어지면 길이가 제각각인 호 조각이 바깥으로 흩어지며
   * 돌고 아래로 떨어지며 사라지고, 하늘색 충격 고리가 퍼진다. 조각 수·길이·틈·튀는 거리는 쓸 때마다 다르다(seed).
   * 줌아웃해도 보이도록 화면 기준 최소 굵기가 있고, 움직임 줄이기 설정이면 흩어지는 거리와 회전을 줄인다.
   */
  drawCleanses(ctx: CanvasRenderingContext2D, now: number, z: number, pos: PosFn) {
    this.cleanses = this.cleanses.filter((c) => now - c.at < CLEANSE_MS);
    const SNAP = 0.16, SKY = 'rgba(125,211,255,0.9)';
    for (const c of this.cleanses) {
      const o = pos(c.e, now);
      if (!o) continue;
      const t = (now - c.at) / CLEANSE_MS;
      const R = o.r * 1.06, lw = Math.max(3 / z, o.r * 0.1);
      // 같은 seed면 같은 조각이 나오는 간단한 난수(mulberry32)
      let st = c.seed >>> 0;
      const rnd = () => { st = (st + 0x6d2b79f5) >>> 0; let x = Math.imul(st ^ (st >>> 15), 1 | st); x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x; return ((x ^ (x >>> 14)) >>> 0) / 4294967296; };
      const count = 7 + Math.floor(rnd() * 4); // 7~10조각
      const weights = Array.from({ length: count }, () => 0.45 + rnd() * 1.1), sum = weights.reduce((a, w) => a + w, 0);
      const start0 = rnd() * Math.PI * 2;
      let cursor = start0;
      const pieces = weights.map((w) => {
        const span = (w / sum) * Math.PI * 2, gap = span * (0.06 + rnd() * 0.16), a0 = cursor + gap / 2, a1 = cursor + span - gap / 2;
        cursor += span;
        return { a0, a1, mid: (a0 + a1) / 2, far: 0.35 + rnd() * 1.1, spin: (rnd() - 0.5) * 6, fall: 0.6 + rnd() * 0.7, wob: rnd() * Math.PI * 2 };
      });
      ctx.save();
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      if (t < SNAP) { // 끊기기 직전: 테두리가 팽팽하게 떨리고, 끊어질 자리마다 금(밝은 짧은 선)이 점점 선명해진다
        const k = t / SNAP, shake = this.reducedMotion ? 0 : Math.sin(now / 16) * o.r * 0.02 * k;
        ctx.strokeStyle = SKY; ctx.lineWidth = lw; ctx.shadowColor = 'rgba(125,211,255,0.9)'; ctx.shadowBlur = this.reducedMotion ? 0 : 8;
        ctx.beginPath(); ctx.arc(o.x, o.y, R + shake, 0, Math.PI * 2); ctx.stroke();
        ctx.shadowBlur = 0; ctx.strokeStyle = `rgba(240,250,255,${0.95 * k})`; ctx.lineWidth = Math.max(1.6 / z, lw * 0.35);
        for (const p of pieces) {
          const a = p.a0 - 0.02;
          ctx.beginPath(); ctx.moveTo(o.x + Math.cos(a) * (R - lw * 0.9), o.y + Math.sin(a) * (R - lw * 0.9)); ctx.lineTo(o.x + Math.cos(a) * (R + lw * 0.9), o.y + Math.sin(a) * (R + lw * 0.9)); ctx.stroke();
        }
      } else { // 끊어져 흩어지는 조각들
        const u = (t - SNAP) / (1 - SNAP), ease = 1 - (1 - u) ** 3, spread = this.reducedMotion ? 0.4 : 1;
        for (const p of pieces) {
          const dist = o.r * p.far * ease * spread;
          // 조각의 가운데(원래 테두리 위의 점)가 바깥으로 흩어지고, 포물선으로 떨어지며, 제 가운데를 축으로 돈다
          const mx = o.x + Math.cos(p.mid) * (R + dist) + Math.sin(now / 90 + p.wob) * (this.reducedMotion ? 0 : o.r * 0.02);
          const my = o.y + Math.sin(p.mid) * (R + dist) + o.r * 0.9 * p.fall * u * u * spread;
          ctx.save();
          ctx.translate(mx, my); ctx.rotate(this.reducedMotion ? 0 : p.spin * u);
          ctx.globalAlpha = Math.max(0, 1 - u ** 1.6);
          ctx.strokeStyle = '#e3f5ff'; ctx.lineWidth = lw * (1 - 0.45 * u);
          ctx.shadowColor = 'rgba(125,211,255,0.9)'; ctx.shadowBlur = this.reducedMotion ? 0 : 7;
          ctx.beginPath(); ctx.arc(-Math.cos(p.mid) * R, -Math.sin(p.mid) * R, R, p.a0, p.a1); ctx.stroke();
          ctx.restore();
        }
        // 끊어지는 순간 하늘색 충격 고리와 번쩍임
        ctx.strokeStyle = `rgba(125,211,255,${0.9 * (1 - u)})`; ctx.lineWidth = Math.max(3 / z, o.r * 0.12) * (1 - u * 0.5);
        ctx.beginPath(); ctx.arc(o.x, o.y, o.r * (1.05 + 1.4 * ease), 0, Math.PI * 2); ctx.stroke();
        if (u < 0.25) {
          ctx.fillStyle = `rgba(225,245,255,${0.35 * (1 - u / 0.25)})`;
          ctx.beginPath(); ctx.arc(o.x, o.y, o.r * 1.15, 0, Math.PI * 2); ctx.fill();
        }
      }
      // 원 위에 정화 스킬 아이콘(✨)이 톡 나타났다가 위로 떠오르며 사라진다
      {
        const pop = Math.min(1, t / 0.12), fade = Math.min(1, (1 - t) / 0.35);
        const fs = Math.max(20 / z, Math.min(o.r * 0.75, 52)) * (this.reducedMotion ? 1 : 0.7 + 0.3 * pop + (t < 0.12 ? 0.25 * Math.sin(pop * Math.PI) : 0));
        const rise = this.reducedMotion ? 0 : o.r * 0.5 * t;
        ctx.save();
        ctx.globalAlpha = Math.max(0, fade); ctx.shadowColor = 'rgba(125,211,255,0.9)'; ctx.shadowBlur = this.reducedMotion ? 0 : 10;
        ctx.font = `${fs}px "Noto Color Emoji","Apple Color Emoji","Segoe UI Emoji",sans-serif`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
        ctx.fillText('✨', o.x, o.y - o.r * 1.15 - 4 / z - rise);
        ctx.restore();
      }
      ctx.restore();
    }
  }
}
