import type { SkillFx } from './protocol';

/** 스킬 연출(4.33): 충격파·갈고리·은신. 상태와 그리기만 맡고, 판정은 서버(Room)가 한다. 그림은 판정과 같은 크기로 그려 보는 쪽이 피할 수 있게 한다. */

type Pos = { x: number; y: number; r: number };
export type PosFn = (e: number, now: number) => Pos | null;

const SHOCK_FADE_MS = 250;     // 끝까지 퍼진 뒤 사라지는 시간
const HOOK_WAIT_MS = 250;      // 끝까지 뻗은 뒤 서버 결과(hookHit/hookEnd)를 기다리는 최대 시간
const FX_CAP = 24;
const STEALTH_FADE_MS = 550;   // 은신에 들어갈 때 사라지고, 풀릴 때 다시 나타나는 시간(끊긴 것과 구분되게 부드럽게)
const PUFF_MS = 750;           // 은신 시작·끝에 퍼지는 고리와 반짝임

interface Bolt { kind: 'poison' | 'darkness'; x: number; y: number; dx: number; dy: number; speed: number; range: number; radius: number; at: number }
interface Burst { x: number; y: number; kind: 'poison' | 'darkness'; at: number }
const BURST_MS = 450;
const BOLT_MIN_SCREEN_RADIUS = 6;   // 화면에서 투사체 반지름이 이보다 작아지지 않게 그린다(px)
const CLEANSE_MS = 900;

interface Shock { x: number; y: number; r0: number; rMax: number; speed: number; at: number }
interface Hook { e: number; dx: number; dy: number; range: number; ms: number; at: number; hit?: { t: number; at: number; ms: number }; endAt?: number }

export class SkillFxLayer {
  private shocks: Shock[] = [];
  private hooks: Hook[] = [];
  private stealth = new Map<number, { at: number; until: number }>();
  private bolts = new Map<number, Bolt>();
  private bursts: Burst[] = [];
  private poisons = new Map<number, { stacks: number; at: number; until: number }>();
  private cleanses: { e: number; at: number }[] = [];
  private stealthEnded = new Map<number, number>(); // 은신이 막 끝나 다시 나타나는 중인 원 번호 → 끝난 시각
  private puffs: { e: number; at: number; kind: 'out' | 'in' }[] = []; // 은신 시작(out)·끝(in) 연출

  /** 가장 최근에 쓴 그 원의 갈고리 중 조건에 맞는 것(같은 원의 갈고리는 하나만 남기므로 대개 하나다) */
  private latestHook(e: number, ok: (h: Hook) => boolean): Hook | undefined {
    for (let i = this.hooks.length - 1; i >= 0; i--) if (this.hooks[i].e === e && ok(this.hooks[i])) return this.hooks[i];
    return undefined;
  }

  constructor(private readonly reducedMotion: boolean) {}

  clear() { this.shocks = []; this.hooks = []; this.stealth.clear(); this.stealthEnded.clear(); this.puffs = []; this.bolts.clear(); this.bursts = []; this.poisons.clear(); this.cleanses = []; }

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
      case 'bolt':
        if (this.bolts.size >= FX_CAP) this.bolts.delete(this.bolts.keys().next().value as number);
        this.bolts.set(fx.bid, { kind: fx.kind, x: fx.x, y: fx.y, dx: fx.dx, dy: fx.dy, speed: fx.speed, range: fx.range, radius: fx.radius, at: now });
        break;
      case 'boltEnd': {
        const b = this.bolts.get(fx.bid);
        this.bolts.delete(fx.bid);
        if (b && fx.hit !== undefined && fx.x !== undefined && fx.y !== undefined) {
          if (this.bursts.length >= FX_CAP) this.bursts.shift();
          this.bursts.push({ x: fx.x, y: fx.y, kind: b.kind, at: now });
        }
        break;
      }
      case 'poison': this.poisons.set(fx.t, { stacks: fx.stacks, at: now, until: now + fx.ms }); break;
      case 'poisonEnd': this.poisons.delete(fx.t); break;
      case 'cleanse':
        if (this.cleanses.length >= FX_CAP) this.cleanses.shift();
        this.cleanses.push({ e: fx.e, at: now });
        break;
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
    this.drawBolts(ctx, now, z);
    this.drawPoisons(ctx, now, z, pos);
    this.drawCleanses(ctx, now, z, pos);
  }

  /** 독(초록)·암흑(검정 + 보라 테두리) 투사체와 맞은 자리의 퍼지는 고리. 위치는 시작점에서 속도 × 지난 시간으로 구해 서버와 같은 곳에 그린다 */
  private drawBolts(ctx: CanvasRenderingContext2D, now: number, z: number) {
    for (const [id, b] of this.bolts) {
      const traveled = Math.min(b.range, b.speed * (now - b.at) / 1000);
      if (now - b.at > (b.range / b.speed) * 1000 + 400) { this.bolts.delete(id); continue; } // 끝 신호를 놓쳐도 사라진다
      const x = b.x + b.dx * traveled, y = b.y + b.dy * traveled;
      const r = Math.max(b.radius, BOLT_MIN_SCREEN_RADIUS / z); // 판정은 월드 반지름 그대로이고, 줌아웃해도 화면에서 이만큼은 보이게 그린다
      const poison = b.kind === 'poison';
      ctx.save();
      const len = r * 7; // 꼬리 길이도 투사체 크기에 맞춘다
      const tail = ctx.createLinearGradient(x, y, x - b.dx * len, y - b.dy * len);
      tail.addColorStop(0, poison ? 'rgba(90,220,90,0.55)' : 'rgba(120,70,200,0.5)');
      tail.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.strokeStyle = tail; ctx.lineWidth = r * 1.6; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - b.dx * len, y - b.dy * len); ctx.stroke();
      ctx.fillStyle = poison ? '#4cd964' : '#14101c';
      ctx.strokeStyle = poison ? '#c9ffd0' : '#9b6cff'; ctx.lineWidth = Math.max(2 / z, 2.5);
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.restore();
    }
    this.bursts = this.bursts.filter((u) => now - u.at < BURST_MS);
    for (const u of this.bursts) {
      const t = (now - u.at) / BURST_MS;
      ctx.save();
      ctx.strokeStyle = u.kind === 'poison' ? `rgba(90,220,90,${1 - t})` : `rgba(155,108,255,${1 - t})`;
      ctx.lineWidth = Math.max(3 / z, 5) * (1 - t * 0.6);
      ctx.beginPath(); ctx.arc(u.x, u.y, 14 + 60 * t, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    }
  }

  /** 독에 걸린 원: 초록 고리와 떠오르는 방울, 머리 위 ☠×스택 수(모두에게 보인다) */
  private drawPoisons(ctx: CanvasRenderingContext2D, now: number, z: number, pos: PosFn) {
    for (const [e, p] of this.poisons) {
      if (now >= p.until + 400) { this.poisons.delete(e); continue; }
      const o = pos(e, now);
      if (!o) continue;
      ctx.save();
      ctx.strokeStyle = 'rgba(90,220,90,0.8)'; ctx.lineWidth = Math.max(3 / z, o.r * 0.08);
      ctx.setLineDash([o.r * 0.35, o.r * 0.25]); ctx.lineDashOffset = this.reducedMotion ? 0 : now / 40;
      ctx.beginPath(); ctx.arc(o.x, o.y, o.r * 1.1, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);
      if (!this.reducedMotion) {
        ctx.fillStyle = 'rgba(120,235,110,0.65)';
        for (let i = 0; i < 6; i++) {
          const ph = ((now / 1200) + i / 6) % 1, ang = i * 2.1 + e;
          ctx.beginPath(); ctx.arc(o.x + Math.cos(ang) * o.r * 0.7, o.y - o.r * 0.4 - ph * o.r * 0.9, Math.max(2 / z, o.r * 0.08) * (1 - ph), 0, Math.PI * 2); ctx.fill();
        }
      }
      const fs = Math.max(14 / z, Math.min(o.r * 0.5, 36)), left = Math.max(0, Math.ceil((p.until - now) / 1000));
      ctx.font = `700 ${fs}px "Noto Sans KR", system-ui, sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
      ctx.lineWidth = Math.max(2 / z, fs * 0.15); ctx.strokeStyle = 'rgba(10,40,10,0.9)'; ctx.fillStyle = '#b8ffb0';
      const label = `☠ ×${p.stacks}  ${left}s`;
      ctx.strokeText(label, o.x, o.y - o.r - 6 / z); ctx.fillText(label, o.x, o.y - o.r - 6 / z);
      ctx.restore();
    }
  }

  /**
   * 정화: 몸을 묶고 있던 사슬(CC)을 끊어 던지는 연출. 처음에 원을 사슬 고리가 감고 있다가 "툭" 끊어지며,
   * 사슬 조각이 사방으로 튀어 나가 빙글 돌며 떨어지고, 초록빛 충격 고리가 퍼진다. 줌아웃해도 조각이 보이도록 화면 기준 최소 크기가 있다.
   */
  private drawCleanses(ctx: CanvasRenderingContext2D, now: number, z: number, pos: PosFn) {
    this.cleanses = this.cleanses.filter((c) => now - c.at < CLEANSE_MS);
    const LINKS = 14, SNAP = 0.16;
    for (const c of this.cleanses) {
      const o = pos(c.e, now);
      if (!o) continue;
      const t = (now - c.at) / CLEANSE_MS;
      const link = Math.max(o.r * 0.17, 9 / z), lw = Math.max(2.2 / z, link * 0.28);
      ctx.save();
      ctx.lineJoin = 'round';
      for (let i = 0; i < LINKS; i++) {
        const base = (i / LINKS) * Math.PI * 2;
        let px: number, py: number, rot: number, alpha: number;
        if (t < SNAP) { // 끊기기 직전: 원을 감은 사슬이 팽팽하게 떨린다
          const shake = this.reducedMotion ? 0 : Math.sin(now / 18 + i) * o.r * 0.02;
          px = o.x + Math.cos(base) * (o.r * 1.06 + shake); py = o.y + Math.sin(base) * (o.r * 1.06 + shake);
          rot = base + Math.PI / 2; alpha = 1;
        } else { // 끊어져 사방으로 튀어 나가며 돌고 떨어진다
          const u = (t - SNAP) / (1 - SNAP), ease = 1 - (1 - u) ** 3;
          const spread = this.reducedMotion ? 0.5 : 1;
          const dist = o.r * 1.06 + o.r * (1.1 + 0.5 * ((i * 7) % 5) / 4) * ease * spread;
          px = o.x + Math.cos(base) * dist; py = o.y + Math.sin(base) * dist + o.r * 0.9 * u * u * spread; // 아래로 떨어진다
          rot = base + Math.PI / 2 + (this.reducedMotion ? 0 : u * (i % 2 ? 5 : -5));
          alpha = 1 - u ** 2;
        }
        ctx.save();
        ctx.translate(px, py); ctx.rotate(rot + (i % 2 ? Math.PI / 2 : 0));
        ctx.globalAlpha = Math.max(0, alpha);
        ctx.lineWidth = lw;
        ctx.strokeStyle = '#d9ffe6'; ctx.shadowColor = 'rgba(110,255,160,0.9)'; ctx.shadowBlur = this.reducedMotion ? 0 : 6;
        ctx.beginPath(); ctx.ellipse(0, 0, link * (i % 2 ? 0.55 : 0.8), link * 0.4, 0, 0, Math.PI * 2); ctx.stroke();
        ctx.restore();
      }
      if (t >= SNAP) { // 끊어지는 순간 초록빛 충격 고리와 번쩍임
        const u = (t - SNAP) / (1 - SNAP), ease = 1 - (1 - u) ** 3;
        ctx.strokeStyle = `rgba(110,255,160,${0.9 * (1 - u)})`; ctx.lineWidth = Math.max(3 / z, o.r * 0.12) * (1 - u * 0.5);
        ctx.beginPath(); ctx.arc(o.x, o.y, o.r * (1.05 + 1.4 * ease), 0, Math.PI * 2); ctx.stroke();
        if (u < 0.25) {
          ctx.fillStyle = `rgba(220,255,235,${0.35 * (1 - u / 0.25)})`;
          ctx.beginPath(); ctx.arc(o.x, o.y, o.r * 1.15, 0, Math.PI * 2); ctx.fill();
        }
      }
      ctx.restore();
    }
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
