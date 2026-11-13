import type { SkillFx } from '../protocol';
import { FX_CAP, type PosFn } from './common';

/** 갈고리(4.33): 뻗는 쇠사슬과 창끝, 붙잡힌 원 표시 */

const HOOK_WAIT_MS = 250;      // 끝까지 뻗은 뒤 서버 결과(hookHit/hookEnd)를 기다리는 최대 시간

interface Hook { e: number; dx: number; dy: number; range: number; ms: number; at: number; hit?: { t: number; at: number; ms: number }; endAt?: number }

export class HookFx {
  private hooks: Hook[] = [];

  constructor(private readonly reducedMotion: boolean) {}

  clear() { this.hooks = []; }

  /** 가장 최근에 쓴 그 원의 갈고리 중 조건에 맞는 것(같은 원의 갈고리는 하나만 남기므로 대개 하나다) */
  private latestHook(e: number, ok: (h: Hook) => boolean): Hook | undefined {
    for (let i = this.hooks.length - 1; i >= 0; i--) if (this.hooks[i].e === e && ok(this.hooks[i])) return this.hooks[i];
    return undefined;
  }

  /** 갈고리를 던졌다(같은 원의 갈고리는 하나만 남긴다) */
  add(fx: Extract<SkillFx, { id: 'hook' }>, now: number) {
    this.hooks = this.hooks.filter((h) => h.e !== fx.e);
    if (this.hooks.length >= FX_CAP) this.hooks.shift();
    this.hooks.push({ e: fx.e, dx: fx.dx, dy: fx.dy, range: fx.range, ms: fx.ms, at: now });
  }

  /** 갈고리가 원(t)에 맞았다 */
  hit(fx: Extract<SkillFx, { id: 'hookHit' }>, now: number) {
    const h = this.latestHook(fx.e, (k) => !k.hit);
    if (h) h.hit = { t: fx.t, at: now, ms: fx.ms };
  }

  /** 빗나가서 거둔다 */
  end(fx: Extract<SkillFx, { id: 'hookEnd' }>, now: number) {
    const h = this.latestHook(fx.e, (k) => !k.hit && k.endAt === undefined);
    if (h) h.endAt = now;
  }

  drawHooks(ctx: CanvasRenderingContext2D, now: number, z: number, pos: PosFn) {
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
        // 붙잡힘: 내 원 가장자리에서 붙잡힌 원 가장자리까지 팽팽한 쇠사슬, 끝에는 갈고리 날이 박혀 있다
        const dx = v.x - o.x, dy = v.y - o.y, d = Math.hypot(dx, dy) || 1, ux = dx / d, uy = dy / d;
        const tipX = v.x - ux * v.r * 0.8, tipY = v.y - uy * v.r * 0.8;
        this.drawChain(ctx, o.x + ux * o.r * 0.8, o.y + uy * o.r * 0.8, tipX, tipY, width, 0, now);
        this.drawClaw(ctx, tipX, tipY, ux, uy, width);
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
      // 던질 때는 팽팽하게, 거둘 때는 늘어진 사슬이 출렁인다
      const slack = h.endAt !== undefined ? Math.sin(Math.min(1, Math.max(0, frac)) * Math.PI) : 0;
      this.drawChain(ctx, o.x + h.dx * o.r * 0.8, o.y + h.dy * o.r * 0.8, hx, hy, width, slack, now);
      this.drawClaw(ctx, hx, hy, h.dx, h.dy, width);
      keep.push(h);
      ctx.restore();
    }
    this.hooks = keep;
  }

  /** 쇠사슬: 고리가 번갈아 정면(타원 고리)과 옆면(가는 막대)으로 보이며 겹쳐 이어진다. slack > 0이면 늘어져 출렁인다. 판정은 중심선 기준이라 굵기는 보기만 바꾼다. */
  private drawChain(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, width: number, slack: number, now: number) {
    const len = Math.hypot(x2 - x1, y2 - y1);
    if (len < 1) return;
    const ux = (x2 - x1) / len, uy = (y2 - y1) / len, nx = -uy, ny = ux, ang = Math.atan2(uy, ux);
    const thick = width * 1.15;                              // 고리 폭
    const pitch = Math.max(thick * 1.45, len / 90);          // 고리 간격(너무 길면 개수 상한)
    const linkLen = pitch * 1.6, wire = thick * 0.3;         // 고리 길이(이웃과 겹침), 철사 굵기
    const n = Math.max(1, Math.floor(len / pitch));
    const wob = this.reducedMotion ? 0 : now / 90;
    const at = (i: number) => {
      const u = (i + 0.5) / n, off = slack * thick * 2.2 * Math.sin(u * Math.PI) * Math.sin(u * 7 + wob);
      return { x: x1 + (x2 - x1) * u + nx * off, y: y1 + (y2 - y1) * u + ny * off };
    };
    ctx.save();
    ctx.lineCap = 'round';
    // 바깥 붉은 빛: 이 줄이 공격이라는 표시(스킬 색)
    ctx.strokeStyle = 'rgba(255,70,100,0.28)';
    ctx.lineWidth = thick * 1.9;
    ctx.beginPath(); ctx.moveTo(x1, y1);
    for (let i = 0; i < n; i++) { const p = at(i); ctx.lineTo(p.x, p.y); }
    ctx.lineTo(x2, y2); ctx.stroke();
    for (let i = 0; i < n; i++) {
      const { x, y } = at(i), ring = i % 2 === 0;
      const rx = linkLen / 2, ry = thick / 2;
      ctx.beginPath();
      if (ring) ctx.ellipse(x, y, rx, ry, ang, 0, Math.PI * 2);
      else { ctx.moveTo(x - ux * rx * 0.92, y - uy * rx * 0.92); ctx.lineTo(x + ux * rx * 0.92, y + uy * rx * 0.92); }
      ctx.strokeStyle = '#1d222c'; ctx.lineWidth = wire * 1.9; ctx.stroke();   // 어두운 윤곽
      ctx.strokeStyle = ring ? '#aab4c4' : '#8a94a6'; ctx.lineWidth = wire; ctx.stroke(); // 강철 몸통(옆면은 살짝 어둡게)
      ctx.beginPath();
      if (ring) ctx.ellipse(x - nx * ry * 0.22, y - ny * ry * 0.22, rx * 0.88, ry * 0.78, ang, Math.PI * 1.05, Math.PI * 1.85);
      else { ctx.moveTo(x - ux * rx * 0.6 - nx * wire * 0.2, y - uy * rx * 0.6 - ny * wire * 0.2); ctx.lineTo(x + ux * rx * 0.6 - nx * wire * 0.2, y + uy * rx * 0.6 - ny * wire * 0.2); }
      ctx.strokeStyle = 'rgba(245,249,255,0.9)'; ctx.lineWidth = wire * 0.32; ctx.stroke(); // 윗면 반사광
    }
    ctx.restore();
  }

  /** 갈고리 날: (x, y)가 사슬이 걸리는 고리 자리이고 (dx, dy) 쪽으로 뻗는다. 단일 창끝처럼 길쭉하고 뾰족한 삼각 날 하나와 목 부분, 사슬 고리. */
  private drawClaw(ctx: CanvasRenderingContext2D, x: number, y: number, dx: number, dy: number, width: number) {
    const s = width * 2.4; // 날 크기
    ctx.save();
    ctx.translate(x, y); ctx.rotate(Math.atan2(dy, dx)); ctx.scale(s, s);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    // 창날: 목에서 넓어졌다가 끝으로 갈수록 좁아지는 길쭉한 삼각형(앞 끝이 뾰족하다)
    const blade = () => { ctx.beginPath(); ctx.moveTo(0.02, 0); ctx.lineTo(0.38, -0.3); ctx.lineTo(1.5, 0); ctx.lineTo(0.38, 0.3); ctx.closePath(); };
    blade(); ctx.fillStyle = '#b4bdcc'; ctx.fill();
    // 면 나누기: 위쪽 면은 밝게, 아래쪽 면은 어둡게 해서 가운데 능선이 선 입체 날로 보이게 한다
    ctx.beginPath(); ctx.moveTo(0.02, 0); ctx.lineTo(0.38, -0.3); ctx.lineTo(1.5, 0); ctx.closePath(); ctx.fillStyle = '#e6ecf6'; ctx.fill();
    ctx.beginPath(); ctx.moveTo(0.02, 0); ctx.lineTo(0.38, 0.3); ctx.lineTo(1.5, 0); ctx.closePath(); ctx.fillStyle = '#8791a4'; ctx.fill();
    blade(); ctx.strokeStyle = '#1d222c'; ctx.lineWidth = 0.08; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0.1, 0); ctx.lineTo(1.4, 0); ctx.strokeStyle = 'rgba(29,34,44,0.55)'; ctx.lineWidth = 0.03; ctx.stroke(); // 가운데 능선
    // 목(날과 사슬을 잇는 짧은 대)과 사슬이 걸리는 고리
    ctx.beginPath(); ctx.moveTo(-0.3, 0); ctx.lineTo(0.05, 0);
    ctx.strokeStyle = '#1d222c'; ctx.lineWidth = 0.26; ctx.stroke();
    ctx.strokeStyle = '#b4bdcc'; ctx.lineWidth = 0.14; ctx.stroke();
    ctx.beginPath(); ctx.arc(-0.42, 0, 0.17, 0, Math.PI * 2);
    ctx.strokeStyle = '#1d222c'; ctx.lineWidth = 0.17; ctx.stroke();
    ctx.strokeStyle = '#b4bdcc'; ctx.lineWidth = 0.09; ctx.stroke();
    ctx.restore();
  }
}
