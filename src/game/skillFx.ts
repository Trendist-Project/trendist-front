import type { SkillFx } from './protocol';

/** 스킬 연출(4.33): 충격파·갈고리·은신. 상태와 그리기만 맡고, 판정은 서버(Room)가 한다. 그림은 판정과 같은 크기로 그려 보는 쪽이 피할 수 있게 한다. */

type Pos = { x: number; y: number; r: number };
export type PosFn = (e: number, now: number) => Pos | null;

const SHOCK_FADE_MS = 250;     // 끝까지 퍼진 뒤 사라지는 시간
const HOOK_WAIT_MS = 250;      // 끝까지 뻗은 뒤 서버 결과(hookHit/hookEnd)를 기다리는 최대 시간
const FX_CAP = 24;
const STEALTH_FADE_MS = 550;   // 은신에 들어갈 때 사라지고, 풀릴 때 다시 나타나는 시간(끊긴 것과 구분되게 부드럽게)
const PUFF_MS = 750;           // 은신 시작·끝에 퍼지는 고리와 반짝임

interface Shock { x: number; y: number; r0: number; rMax: number; speed: number; at: number }
interface Hook { e: number; dx: number; dy: number; range: number; ms: number; at: number; hit?: { t: number; at: number; ms: number }; endAt?: number }

export class SkillFxLayer {
  private shocks: Shock[] = [];
  private hooks: Hook[] = [];
  private stealth = new Map<number, { at: number; until: number }>();
  private stealthEnded = new Map<number, number>(); // 은신이 막 끝나 다시 나타나는 중인 원 번호 → 끝난 시각
  private puffs: { e: number; at: number; kind: 'out' | 'in' }[] = []; // 은신 시작(out)·끝(in) 연출

  /** 가장 최근에 쓴 그 원의 갈고리 중 조건에 맞는 것(같은 원의 갈고리는 하나만 남기므로 대개 하나다) */
  private latestHook(e: number, ok: (h: Hook) => boolean): Hook | undefined {
    for (let i = this.hooks.length - 1; i >= 0; i--) if (this.hooks[i].e === e && ok(this.hooks[i])) return this.hooks[i];
    return undefined;
  }

  constructor(private readonly reducedMotion: boolean) {}

  clear() { this.shocks = []; this.hooks = []; this.stealth.clear(); this.stealthEnded.clear(); this.puffs = []; }

  show(fx: SkillFx, now: number) {
    switch (fx.id) {
      case 'shockwave':
        if (this.shocks.length >= FX_CAP) this.shocks.shift();
        this.shocks.push({ x: fx.x, y: fx.y, r0: fx.r0, rMax: fx.rMax, speed: fx.speed, at: now });
        break;
      case 'hook':
        this.hooks = this.hooks.filter((h) => h.e !== fx.e);
        if (this.hooks.length >= FX_CAP) this.hooks.shift();
        this.hooks.push({ e: fx.e, dx: fx.dx, dy: fx.dy, range: fx.range, ms: fx.ms, at: now });
        break;
      case 'hookHit': {
        const h = this.latestHook(fx.e, (k) => !k.hit);
        if (h) h.hit = { t: fx.t, at: now, ms: fx.ms };
        break;
      }
      case 'hookEnd': {
        const h = this.latestHook(fx.e, (k) => !k.hit && k.endAt === undefined);
        if (h) h.endAt = now;
        break;
      }
      case 'stealth':
        this.stealthEnded.delete(fx.e);
        this.stealth.set(fx.e, { at: now, until: now + fx.ms });
        this.addPuff(fx.e, now, 'out');
        break;
      case 'stealthEnd': this.endStealth(fx.e, now); break;
    }
  }

  private addPuff(e: number, at: number, kind: 'out' | 'in') {
    if (this.puffs.length >= FX_CAP) this.puffs.shift();
    this.puffs.push({ e, at, kind });
  }

  private endStealth(e: number, at: number) {
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

  /** 충격파와 갈고리: 원 위에 그린다 */
  drawActive(ctx: CanvasRenderingContext2D, now: number, z: number, pos: PosFn) {
    this.drawShocks(ctx, now, z);
    this.drawHooks(ctx, now, z, pos);
    this.drawPuffs(ctx, now, z, pos);
  }

  /**
   * 은신을 쓰고 풀릴 때 그 원 둘레의 연출(모두에게 보인다): 시작에는 보라색 고리가 원으로 모여들며 흩어진 빛이 빨려 들어가고,
   * 끝에는 고리가 퍼지며 빛이 흩어진다. 스킬을 썼다는 것을 알리는 단서다.
   */
  private drawPuffs(ctx: CanvasRenderingContext2D, now: number, z: number, pos: PosFn) {
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


  private drawShocks(ctx: CanvasRenderingContext2D, now: number, z: number) {
    this.shocks = this.shocks.filter((s) => now - s.at < (s.rMax - s.r0) / s.speed * 1000 + SHOCK_FADE_MS);
    for (const s of this.shocks) {
      const age = now - s.at, travelMs = Math.max(1, (s.rMax - s.r0) / s.speed * 1000);
      const radius = Math.min(s.rMax, s.r0 + (s.speed * age) / 1000);
      const alpha = 1 - Math.max(0, (age - travelMs) / SHOCK_FADE_MS);
      ctx.save();
      // 닿는 최대 범위(판정과 같다)를 옅은 점선으로 미리 보여 준다
      ctx.setLineDash([10 / z, 8 / z]);
      ctx.strokeStyle = `rgba(255,110,130,${0.35 * alpha})`;
      ctx.lineWidth = Math.max(2 / z, 3 / z);
      ctx.beginPath(); ctx.arc(s.x, s.y, s.rMax, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);
      const band = Math.max(5 / z, s.r0 * 0.22);
      const grad = ctx.createRadialGradient(s.x, s.y, Math.max(0, radius - band * 3), s.x, s.y, radius);
      grad.addColorStop(0, 'rgba(255,90,110,0)');
      grad.addColorStop(1, `rgba(255,90,110,${0.28 * alpha})`);
      ctx.fillStyle = grad;
      ctx.beginPath(); ctx.arc(s.x, s.y, radius, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = `rgba(255,225,230,${0.95 * alpha})`;
      ctx.lineWidth = band * 0.5;
      ctx.beginPath(); ctx.arc(s.x, s.y, radius, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = `rgba(255,70,100,${0.9 * alpha})`;
      ctx.lineWidth = band * 0.3;
      ctx.beginPath(); ctx.arc(s.x, s.y, Math.max(0, radius - band * 0.4), 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    }
  }

  private drawHooks(ctx: CanvasRenderingContext2D, now: number, z: number, pos: PosFn) {
    const keep: Hook[] = [];
    for (const h of this.hooks) {
      const o = pos(h.e, now);
      if (!o) continue;
      const age = now - h.at;
      if (h.endAt === undefined && !h.hit && age > h.ms + HOOK_WAIT_MS) h.endAt = h.at + h.ms; // 서버 결과가 안 오면 빗나간 것으로 거둔다
      const width = Math.max(4 / z, o.r * 0.12);
      ctx.save();
      ctx.lineCap = 'round';
      if (h.hit) {
        const v = pos(h.hit.t, now);
        if (!v || now - h.hit.at > h.hit.ms + 120) { ctx.restore(); continue; }
        ctx.strokeStyle = 'rgba(255,70,100,0.95)';
        ctx.lineWidth = width * 1.2;
        ctx.beginPath(); ctx.moveTo(o.x, o.y); ctx.lineTo(v.x, v.y); ctx.stroke();
        ctx.strokeStyle = 'rgba(255,230,235,0.9)';
        ctx.lineWidth = width * 0.4;
        ctx.beginPath(); ctx.moveTo(o.x, o.y); ctx.lineTo(v.x, v.y); ctx.stroke();
        ctx.lineWidth = Math.max(3 / z, v.r * 0.1);
        ctx.strokeStyle = 'rgba(255,70,100,0.9)';
        ctx.beginPath(); ctx.arc(v.x, v.y, v.r + 5 / z, 0, Math.PI * 2); ctx.stroke(); // 붙잡힌 원
        keep.push(h); ctx.restore(); continue;
      }
      let frac = Math.min(1, age / h.ms);
      if (h.endAt !== undefined) {
        // 서버는 끝까지 뻗은 뒤에 빗나갔다고 알리므로, 알림이 일러도 사거리 끝까지 뻗은 다음에 거둔다
        const start = Math.max(h.endAt, h.at + h.ms), t2 = (now - start) / h.ms; // 거두는 데도 뻗을 때와 같은 시간
        if (t2 >= 1) { ctx.restore(); continue; }
        frac = t2 <= 0 ? Math.min(1, age / h.ms) : 1 - t2;
      } else {
        // 사거리(판정과 같다)를 옅은 점선으로 미리 보여 준다
        ctx.setLineDash([8 / z, 8 / z]);
        ctx.strokeStyle = 'rgba(255,110,130,0.3)';
        ctx.lineWidth = Math.max(2 / z, width * 0.4);
        ctx.beginPath(); ctx.moveTo(o.x, o.y); ctx.lineTo(o.x + h.dx * h.range, o.y + h.dy * h.range); ctx.stroke();
        ctx.setLineDash([]);
      }
      const hx = o.x + h.dx * h.range * frac, hy = o.y + h.dy * h.range * frac;
      ctx.strokeStyle = 'rgba(255,70,100,0.95)';
      ctx.lineWidth = width;
      ctx.beginPath(); ctx.moveTo(o.x, o.y); ctx.lineTo(hx, hy); ctx.stroke();
      // 갈고리 끝: 뾰족한 쐐기
      const tip = Math.max(9 / z, o.r * 0.3), nx = -h.dy, ny = h.dx;
      ctx.fillStyle = '#ffe3e8';
      ctx.strokeStyle = '#ff4664';
      ctx.lineWidth = Math.max(2 / z, width * 0.4);
      ctx.beginPath();
      ctx.moveTo(hx + h.dx * tip, hy + h.dy * tip);
      ctx.lineTo(hx + nx * tip * 0.6, hy + ny * tip * 0.6);
      ctx.lineTo(hx - nx * tip * 0.6, hy - ny * tip * 0.6);
      ctx.closePath(); ctx.fill(); ctx.stroke();
      keep.push(h);
      ctx.restore();
    }
    this.hooks = keep;
  }
}
