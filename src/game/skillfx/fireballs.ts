import type { SkillFx } from '../protocol';
import { FX_CAP, seeded, type PosFn } from './common';

/** 화염구(4.33): 대상을 쫓아가는 유도탄. 맞은 자리의 파열은 bolts가 그린다 */

interface Fireball { t: number; x: number; y: number; speed: number; at: number; last: number; trail: { x: number; y: number }[] }
const FIREBALL_LIFE_MS = 3000;   // 끝 신호를 놓쳐도 이 시간이 지나면 지운다

export class FireballFx {
  private shots = new Map<number, Fireball>();

  constructor(private readonly reducedMotion: boolean) {}

  clear() { this.shots.clear(); }

  /** 한 발을 던졌다 */
  add(fx: Extract<SkillFx, { id: 'fireball' }>, now: number) {
    if (this.shots.size >= FX_CAP) this.shots.delete(this.shots.keys().next().value as number);
    this.shots.set(fx.fid, { t: fx.t, x: fx.x, y: fx.y, speed: fx.speed, at: now, last: now, trail: [] });
  }

  /** 한 발이 끝났다. 맞았으면 파열을 그릴 자리를 돌려준다(아니면 null) */
  end(fx: Extract<SkillFx, { id: 'fireballEnd' }>): { x: number; y: number } | null {
    const f = this.shots.get(fx.fid);
    this.shots.delete(fx.fid);
    const x = fx.x ?? f?.x, y = fx.y ?? f?.y;
    return fx.hit && x !== undefined && y !== undefined ? { x, y } : null;
  }

  /**
   * 불꽃: 출발점에서 대상 원의 지금 위치를 향해 매 프레임 방향을 고쳐 날아가는 유도탄(서버도 같은 식으로 쫓는다).
   * 주황 몸통과 흰 노랑 심지, 지나온 자리를 따라 줄어드는 꼬리. 끝 신호(fireballEnd)가 없어도 FIREBALL_LIFE_MS 뒤에 사라진다.
   */
  draw(ctx: CanvasRenderingContext2D, now: number, z: number, pos: PosFn) {
    for (const [id, f] of this.shots) {
      if (now - f.at > FIREBALL_LIFE_MS) { this.shots.delete(id); continue; }
      const dt = Math.min(0.1, (now - f.last) / 1000);
      f.last = now;
      const tgt = pos(f.t, now);
      let dx = 0, dy = 0;
      if (tgt) {
        dx = tgt.x - f.x; dy = tgt.y - f.y;
        const d = Math.hypot(dx, dy), step = f.speed * dt;
        if (d > 1e-6) { const k = Math.min(1, step / d); f.x += dx * k; f.y += dy * k; }
      }
      f.trail.push({ x: f.x, y: f.y });
      if (f.trail.length > 14) f.trail.shift();
      const r = Math.max(8, 10 / z), dir = Math.atan2(dy, dx || 1e-6);
      ctx.save();
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      for (let i = 1; i < f.trail.length; i++) { // 꼬리: 오래된 쪽일수록 가늘고 투명
        const k = i / f.trail.length;
        ctx.strokeStyle = `rgba(255,${Math.round(90 + 90 * k)},30,${0.5 * k})`; ctx.lineWidth = r * 1.5 * k;
        ctx.beginPath(); ctx.moveTo(f.trail[i - 1].x, f.trail[i - 1].y); ctx.lineTo(f.trail[i].x, f.trail[i].y); ctx.stroke();
      }
      if (!this.reducedMotion) { // 불씨: 꼬리에서 흩날리는 작은 불똥
        const rand = seeded(id * 40503);
        for (let i = 0; i < 7; i++) {
          const ph = ((now - f.at) / 480 + rand()) % 1, tp = f.trail[Math.max(0, f.trail.length - 1 - Math.floor(ph * (f.trail.length - 1)))];
          const off = (rand() - 0.5) * r * 1.6 * (0.4 + ph);
          ctx.globalAlpha = 1 - ph; ctx.fillStyle = i % 2 ? '#ffd36a' : '#ff7a1c';
          ctx.beginPath(); ctx.arc(tp.x + off, tp.y - off * 0.5 - ph * r * 0.8, r * 0.2 * (1 - ph * 0.6), 0, Math.PI * 2); ctx.fill();
        }
        ctx.globalAlpha = 1;
      }
      const glow = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, r * 2.2);
      glow.addColorStop(0, 'rgba(255,170,60,0.55)'); glow.addColorStop(1, 'rgba(255,100,20,0)');
      ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(f.x, f.y, r * 2.2, 0, Math.PI * 2); ctx.fill();
      // 물방울 모양 불꽃: 날아가는 쪽이 둥글고 뒤쪽이 뾰족하게 일렁인다
      const flick = this.reducedMotion ? 0 : Math.sin(now / 45 + id) * 0.15;
      ctx.translate(f.x, f.y); ctx.rotate(dir);
      ctx.fillStyle = '#ff7a1c'; ctx.strokeStyle = '#ffd36a'; ctx.lineWidth = Math.max(1.5 / z, 2);
      ctx.beginPath(); ctx.moveTo(-r * (2.1 + flick), 0); ctx.quadraticCurveTo(-r * 0.6, -r * 1.05, r * 0.4, -r * 0.8); ctx.arc(r * 0.2, 0, r * 0.82, -Math.PI / 2, Math.PI / 2); ctx.quadraticCurveTo(-r * 0.6, r * 1.05, -r * (2.1 + flick), 0); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#fff3b0'; ctx.beginPath(); ctx.ellipse(r * 0.05, 0, r * 0.7, r * 0.38, 0, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
  }
}
