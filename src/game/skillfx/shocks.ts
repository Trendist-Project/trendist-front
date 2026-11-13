import type { SkillFx } from '../protocol';
import { drawDamage } from '../damageText';
import { FX_CAP, newSeed, seeded, type PosFn } from './common';

/** 반발·충격파의 퍼지는 파문과, 충격파에 맞은 원의 표시(4.33) */

const SHOCK_FADE_MS = 250;     // 끝까지 퍼진 뒤 사라지는 시간
const QUAKE_HIT_MS = 1400;    // 충격파에 맞은 표시가 남는 시간

interface Shock { x: number; y: number; r0: number; rMax: number; speed: number; at: number; kind: 'repel' | 'quake'; seed: number }

export class ShockFx {
  private shocks: Shock[] = [];
  private quakeHits: { t: number; n: number; at: number; seed: number }[] = []; // 충격파에 맞은 원 번호 → 잃은 개수와 맞은 시각

  constructor(private readonly reducedMotion: boolean) {}

  clear() { this.shocks = []; this.quakeHits = []; }

  /** 반발(repel)·충격파(quake)가 퍼지기 시작했다 */
  add(fx: Extract<SkillFx, { id: 'repel' | 'quake' }>, now: number) {
    if (this.shocks.length >= FX_CAP) this.shocks.shift();
    this.shocks.push({ x: fx.x, y: fx.y, r0: fx.r0, rMax: fx.rMax, speed: fx.speed, at: now, kind: fx.id === 'quake' ? 'quake' : 'repel', seed: newSeed() });
  }

  /** 충격파가 원(t)에 닿았다 */
  addHit(fx: Extract<SkillFx, { id: 'quakeHit' }>, now: number) {
    if (this.quakeHits.length >= FX_CAP) this.quakeHits.shift();
    this.quakeHits.push({ t: fx.t, n: fx.n, at: now, seed: newSeed() });
  }

  drawShocks(ctx: CanvasRenderingContext2D, now: number, z: number) {
    this.shocks = this.shocks.filter((s) => now - s.at < (s.rMax - s.r0) / s.speed * 1000 + SHOCK_FADE_MS);
    for (const s of this.shocks) this.drawRepel(ctx, s, now, z);
  }

  /**
   * 반발·충격파: 내 원 둘레로 퍼지는 파문. 매끈한 이중 고리와 고리를 따라 천천히 도는 판 조각으로 단단한 느낌을 낸다.
   * 둘은 모양이 같고 색만 다르다. 반발은 청록이고 안쪽을 채운 반투명 돔이 있으며, 충격파는 붉고 안쪽이 비어 있다(고리만 퍼진다). 그림은 판정 반지름(radius) 안에만 그린다.
   */
  private drawRepel(ctx: CanvasRenderingContext2D, s: Shock, now: number, z: number) {
    const age = now - s.at, travelMs = Math.max(1, (s.rMax - s.r0) / s.speed * 1000);
    const radius = Math.min(s.rMax, s.r0 + (s.speed * age) / 1000);
    const alpha = 1 - Math.max(0, (age - travelMs) / SHOCK_FADE_MS);
    const band = Math.max(5 / z, s.r0 * 0.2);
    const quake = s.kind === 'quake';
    const c = quake
      ? { range: '255,110,130', outer: '255,228,232', inner: '255,70,100', plate: '255,240,243' }
      : { range: '90,220,235', outer: '225,252,255', inner: '40,190,215', plate: '255,255,255' };
    ctx.save();
    ctx.setLineDash([12 / z, 8 / z]);
    ctx.strokeStyle = `rgba(${c.range},${0.4 * alpha})`;
    ctx.lineWidth = Math.max(2 / z, 3 / z);
    ctx.beginPath(); ctx.arc(s.x, s.y, s.rMax, 0, Math.PI * 2); ctx.stroke();
    ctx.setLineDash([]);
    // 돔(반발만): 가운데는 거의 투명, 가장자리로 갈수록 짙은 청록. 충격파는 안쪽을 비워 두고 고리만 그린다
    if (!quake) {
      const dome = ctx.createRadialGradient(s.x, s.y, Math.max(0, radius * 0.35), s.x, s.y, radius);
      dome.addColorStop(0, 'rgba(120,235,245,0)');
      dome.addColorStop(0.7, `rgba(90,215,235,${0.16 * alpha})`);
      dome.addColorStop(1, `rgba(150,240,255,${0.34 * alpha})`);
      ctx.fillStyle = dome;
      ctx.beginPath(); ctx.arc(s.x, s.y, radius, 0, Math.PI * 2); ctx.fill();
    }
    // 이중 고리: 바깥은 밝고 굵게, 안쪽은 진하고 얇게
    ctx.strokeStyle = `rgba(${c.outer},${0.95 * alpha})`; ctx.lineWidth = band * 0.42;
    ctx.beginPath(); ctx.arc(s.x, s.y, Math.max(0, radius - band * 0.21), 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = `rgba(${c.inner},${0.9 * alpha})`; ctx.lineWidth = band * 0.24;
    ctx.beginPath(); ctx.arc(s.x, s.y, Math.max(0, radius - band * 0.62), 0, Math.PI * 2); ctx.stroke();
    // 방패 판 조각: 안쪽 고리 둘레를 천천히 도는 짧은 호
    const plates = Math.max(6, Math.min(16, Math.round((Math.PI * 2 * radius * z) / 110))), spin = this.reducedMotion ? 0 : age / 900;
    ctx.strokeStyle = `rgba(${c.plate},${0.75 * alpha})`; ctx.lineWidth = band * 0.16; ctx.lineCap = 'round';
    for (let i = 0; i < plates; i++) {
      const a0 = spin + (i / plates) * Math.PI * 2, span = (Math.PI * 2 / plates) * 0.45;
      ctx.beginPath(); ctx.arc(s.x, s.y, Math.max(0, radius - band * 1.0), a0, a0 + span); ctx.stroke();
    }
    ctx.restore();
  }

  /**
   * 충격파에 맞은 원: 붉은 파열 고리가 퍼지고, 키워드 이름표 조각이 사방으로 튀어 흩어지며, 원 둘레가 붉게 번쩍이고 "-N"이 떠오른다.
   * 누가 맞았는지 멀리서도 보이도록 크기는 화면 기준 최소값을 둔다.
   */
  drawQuakeHits(ctx: CanvasRenderingContext2D, now: number, z: number, pos: PosFn) {
    this.quakeHits = this.quakeHits.filter((h) => now - h.at < QUAKE_HIT_MS);
    for (const h of this.quakeHits) {
      const o = pos(h.t, now);
      if (!o) continue;
      const p = (now - h.at) / QUAKE_HIT_MS, burst = Math.min(1, (now - h.at) / 520), rnd = seeded(h.seed);
      const r = Math.max(o.r, 14 / z);
      ctx.save();
      // 원 둘레 붉은 번쩍임(처음 0.25초가 가장 진하다)
      const flash = Math.max(0, 1 - (now - h.at) / 260);
      if (flash > 0) {
        ctx.fillStyle = `rgba(255,70,100,${0.45 * flash})`;
        ctx.beginPath(); ctx.arc(o.x, o.y, r * 1.05, 0, Math.PI * 2); ctx.fill();
      }
      // 퍼지는 파열 고리 두 겹
      for (let k = 0; k < 2; k++) {
        const bk = Math.max(0, burst - k * 0.18), a = (1 - bk) * (k === 0 ? 0.95 : 0.6);
        if (bk <= 0 || a <= 0) continue;
        ctx.strokeStyle = `rgba(255,${k === 0 ? 225 : 70},${k === 0 ? 230 : 100},${a})`;
        ctx.lineWidth = Math.max(2 / z, r * (0.2 - 0.12 * bk));
        ctx.beginPath(); ctx.arc(o.x, o.y, r * (1 + 1.3 * bk), 0, Math.PI * 2); ctx.stroke();
      }
      // 키워드 조각: 둥근 이름표 모양 조각이 사방으로 튀며 돌고 옅어진다
      const pieces = 5 + h.n;
      for (let i = 0; i < pieces; i++) {
        const ang = rnd() * Math.PI * 2, dist = r * (1.2 + rnd() * 1.6) * (this.reducedMotion ? 0.6 : Math.min(1, burst * 1.4)), spin = (rnd() - 0.5) * 8 * burst;
        const w = r * (0.34 + rnd() * 0.3), ht = w * 0.42, a = Math.max(0, 1 - Math.max(0, p - 0.25) / 0.75);
        ctx.save();
        ctx.translate(o.x + Math.cos(ang) * dist, o.y + Math.sin(ang) * dist + (this.reducedMotion ? 0 : burst * r * 0.5));
        ctx.rotate(ang + spin);
        ctx.globalAlpha = a;
        ctx.fillStyle = '#ffe3e8'; ctx.strokeStyle = '#ff4664'; ctx.lineWidth = Math.max(1.5 / z, ht * 0.28);
        ctx.beginPath(); ctx.roundRect(-w / 2, -ht / 2, w, ht, ht / 2); ctx.fill(); ctx.stroke();
        ctx.restore();
      }
      // "-N": 맞은 원 위로 떠오르는 붉은 숫자
      drawDamage(ctx, `-${h.n}`, o.x, o.y - o.r * 0.9, p, 'lose', Math.max(16 / z, o.r * 0.8), this.reducedMotion);
      ctx.restore();
    }
  }
}
