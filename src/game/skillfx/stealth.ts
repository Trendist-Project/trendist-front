import type { PosFn } from './common';
import { FX_CAP } from './common';

/** 은신(유령, 4.33): 진행도와 남은 시간, 내 원의 점선 고리, 시작·끝에 퍼지는 고리 */

const STEALTH_FADE_MS = 550;   // 은신에 들어갈 때 사라지고, 풀릴 때 다시 나타나는 시간(끊긴 것과 구분되게 부드럽게)
const PUFF_MS = 750;           // 은신 시작·끝에 퍼지는 고리와 반짝임

export class StealthFx {
  private stealth = new Map<number, { at: number; until: number }>();
  private stealthEnded = new Map<number, number>(); // 은신이 막 끝나 다시 나타나는 중인 원 번호 → 끝난 시각
  private puffs: { e: number; at: number; kind: 'out' | 'in' }[] = []; // 은신 시작(out)·끝(in) 연출

  constructor(private readonly reducedMotion: boolean) {}

  clear() { this.stealth.clear(); this.stealthEnded.clear(); this.puffs = []; }

  /** 원 e가 ms 동안 은신한다 */
  start(e: number, now: number, ms: number) {
    this.stealthEnded.delete(e);
    this.stealth.set(e, { at: now, until: now + ms });
    this.addPuff(e, now, 'out');
  }

  private addPuff(e: number, at: number, kind: 'out' | 'in') {
    if (this.puffs.length >= FX_CAP) this.puffs.shift();
    this.puffs.push({ e, at, kind });
  }

  endStealth(e: number, at: number) {
    if (!this.stealth.delete(e)) return;
    this.stealthEnded.set(e, at);
    this.addPuff(e, at, 'in');
  }

  /**
   * 은신(유령) 진행도: 0 = 보통, 1 = 완전히 은신. 들어갈 때와 풀릴 때 STEALTH_FADE_MS에 걸쳐 부드럽게 오르내려서
   * 렉으로 사라진 것과 구분된다. 남에게는 1에서 완전히 안 보이고, 나(와 관전)에게는 반투명으로 보인다.
   */
  stealthProgress(e: number, now: number): number {
    const st = this.stealth.get(e);
    if (st && now >= st.until) this.endStealth(e, st.until); // 시간이 다 됐다
    const cur = this.stealth.get(e);
    if (cur) return Math.min(1, (now - cur.at) / STEALTH_FADE_MS);
    const ended = this.stealthEnded.get(e);
    if (ended === undefined) return 0;
    const p = 1 - (now - ended) / STEALTH_FADE_MS;
    if (p <= 0) { this.stealthEnded.delete(e); return 0; }
    return p;
  }

  /** 은신이 끝날 때까지 남은 ms(은신 중이 아니면 0) */
  stealthLeft(e: number, now: number): number { const st = this.stealth.get(e); return st ? Math.max(0, st.until - now) : 0; }

  /** 내 은신 중인 원 둘레에 일렁이는 점선 고리: 내가 은신 중이라는 표시(남에게는 보이지 않는다) */
  drawStealthRing(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, now: number, z: number) {
    ctx.save();
    ctx.strokeStyle = 'rgba(200,190,255,0.55)';
    ctx.lineWidth = Math.max(2 / z, r * 0.06);
    ctx.setLineDash([r * 0.5, r * 0.35]);
    ctx.lineDashOffset = this.reducedMotion ? 0 : -now / 30;
    const wob = this.reducedMotion ? 0 : Math.sin(now / 160) * r * 0.04;
    ctx.beginPath(); ctx.arc(x, y, r + r * 0.12 + wob, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  }

  /**
   * 은신을 쓰고 풀릴 때 그 원 둘레의 연출(모두에게 보인다): 시작에는 보라색 고리가 원으로 모여들며 흩어진 빛이 빨려 들어가고,
   * 끝에는 고리가 퍼지며 빛이 흩어진다. 스킬을 썼다는 것을 알리는 단서다.
   */
  drawPuffs(ctx: CanvasRenderingContext2D, now: number, z: number, pos: PosFn) {
    this.puffs = this.puffs.filter((p) => now - p.at < PUFF_MS);
    for (const p of this.puffs) {
      const o = pos(p.e, now);
      if (!o) continue;
      const t = (now - p.at) / PUFF_MS, ease = 1 - (1 - t) ** 3, fade = 1 - t;
      const k = p.kind === 'out' ? 1 - ease : ease; // out: 바깥에서 안으로, in: 안에서 바깥으로
      ctx.save();
      ctx.strokeStyle = `rgba(200,185,255,${0.85 * fade})`;
      ctx.lineWidth = Math.max(3 / z, o.r * 0.1) * (0.4 + fade);
      ctx.beginPath(); ctx.arc(o.x, o.y, o.r * (1.05 + 1.1 * k), 0, Math.PI * 2); ctx.stroke();
      if (!this.reducedMotion) {
        ctx.fillStyle = `rgba(225,215,255,${0.9 * fade})`;
        const n = 12, base = p.at * 0.013;
        for (let i = 0; i < n; i++) {
          const a = base + (i / n) * Math.PI * 2, d = o.r * (1.1 + 1.5 * k), s = Math.max(2.5 / z, o.r * 0.07) * (0.6 + 0.4 * fade);
          ctx.beginPath(); ctx.arc(o.x + Math.cos(a) * d, o.y + Math.sin(a) * d, s, 0, Math.PI * 2); ctx.fill();
        }
      }
      ctx.restore();
    }
  }
}
