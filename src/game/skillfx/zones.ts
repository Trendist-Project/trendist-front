import type { SkillFx } from '../protocol';
import { FX_CAP, seeded, type PosFn } from './common';
import { drawBullet, drawExplosion } from './shapes';

/**
 * 장판과 터지는 총알의 도화선 표시(4.33).
 * - 장판(zone): **시전자 원(e)을 중심으로 따라다니는** 원형 장판을 ms 동안 그린다(중심은 그리는 때마다 시전자의 지금 자리, 못 찾으면 마지막으로 본 자리). 반지름 r은 서버 판정과 같은 월드 값이다. 쓰자마자 한 번, 그 뒤 tickMs마다(피해가 들어가는 순간마다) 안쪽이 번쩍인다.
 * - 도화선(burstFuse): 터지는 총알에 맞은 원 위에 터질 때까지 머리 위에 "터지는 총알" 아이콘(폭발 + 총알) 배지를 띄우고 둘레에 줄어드는 타이머 고리와 남은 초를 그린다. 터지면(burstBoom) 서버가 보낸 자리에 파열을 그린다(BoltFx).
 */
interface Zone { e: number; x: number; y: number; r: number; at: number; ms: number; tickMs: number; seed: number }
interface Fuse { at: number; until: number }

export class ZoneFx {
  private zones: Zone[] = [];
  private fuses = new Map<number, Fuse>();

  constructor(private readonly reducedMotion: boolean) {}

  clear() { this.zones = []; this.fuses.clear(); }

  addZone(fx: Extract<SkillFx, { id: 'zone' }>, now: number) {
    if (this.zones.length >= FX_CAP) this.zones.shift();
    this.zones.push({ e: fx.e, x: fx.x, y: fx.y, r: fx.r, at: now, ms: fx.ms, tickMs: Math.max(100, fx.tickMs), seed: Math.floor(fx.x * 31 + fx.y * 17) | 1 });
  }

  /** 시전자 e의 장판이 일찍 끝났다: 지금부터 걷힌다 */
  endZone(e: number, now: number) { for (const s of this.zones) if (s.e === e && now - s.at < s.ms) s.ms = now - s.at; }

  addFuse(t: number, ms: number, now: number) { this.fuses.set(t, { at: now, until: now + ms }); }
  removeFuse(t: number) { this.fuses.delete(t); }

  /** 장판은 원 아래 깔리는 바닥 연출이라 원보다 먼저 그린다. 중심은 시전자의 지금 자리를 따라간다 */
  drawZones(ctx: CanvasRenderingContext2D, now: number, z: number, pos: PosFn) {
    this.zones = this.zones.filter((s) => now < s.at + s.ms + 300);
    for (const s of this.zones) {
      const c = pos(s.e, now);
      if (c) { s.x = c.x; s.y = c.y; } // 시전자를 찾으면 따라가고, 못 찾으면(화면 밖·은신) 마지막으로 본 자리에 그린다
      const age = now - s.at, live = age < s.ms, fade = live ? Math.min(1, age / 150) : Math.max(0, 1 - (age - s.ms) / 300);
      const pulse = this.reducedMotion ? 0 : (1 - ((age % s.tickMs) / s.tickMs)); // 피해가 들어가는 순간(0초, 1초, 2초)마다 번쩍
      ctx.save();
      const g = ctx.createRadialGradient(s.x, s.y, s.r * 0.15, s.x, s.y, s.r);
      g.addColorStop(0, `rgba(255,120,40,${(0.16 + 0.22 * pulse) * fade})`);
      g.addColorStop(1, `rgba(255,60,30,${(0.30 + 0.18 * pulse) * fade})`);
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2); ctx.fill();
      ctx.lineWidth = Math.max(2.5 / z, 4); ctx.strokeStyle = `rgba(255,150,70,${0.9 * fade})`; ctx.setLineDash([Math.max(14 / z, 18), Math.max(10 / z, 12)]);
      ctx.lineDashOffset = this.reducedMotion ? 0 : -age / 40;
      ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
      if (!this.reducedMotion && live) { // 위로 흩날리는 불씨
        const rand = seeded(s.seed);
        for (let i = 0; i < 14; i++) {
          const ang = rand() * Math.PI * 2, rad = Math.sqrt(rand()) * s.r * 0.95, ph = ((age / 900) + rand()) % 1;
          ctx.fillStyle = `rgba(255,${180 + Math.floor(rand() * 60)},90,${(1 - ph) * 0.8 * fade})`;
          ctx.beginPath(); ctx.arc(s.x + Math.cos(ang) * rad, s.y + Math.sin(ang) * rad - ph * s.r * 0.18, Math.max(2 / z, s.r * 0.018), 0, Math.PI * 2); ctx.fill();
        }
      }
      ctx.restore();
    }
  }

  /**
   * 맞은 원 머리 위의 도화선: "터지는 총알" 아이콘(별 모양 폭발 한가운데 총알) 배지와 그 둘레를 도는 타이머 고리, 아래의 남은 초.
   * 터질 때가 가까울수록 아이콘이 더 빨리 깜빡이고 커진다(원 위에 그린다)
   */
  drawFuses(ctx: CanvasRenderingContext2D, now: number, z: number, pos: PosFn) {
    for (const [e, f] of this.fuses) {
      if (now >= f.until + 150) { this.fuses.delete(e); continue; }
      const p = pos(e, now);
      if (!p) continue;
      const left = Math.max(0, (f.until - now) / Math.max(1, f.until - f.at)), secs = Math.max(0, (f.until - now) / 1000);
      const blink = this.reducedMotion ? 1 : (0.65 + 0.35 * Math.sin(now / (50 + 150 * left))), grow = this.reducedMotion ? 1 : 1 + 0.18 * (1 - left);
      ctx.save();
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      // 머리 위 아이콘 배지: 어두운 원판 안에 "터지는 총알" 아이콘(폭발 + 총알), 둘레에 터질 때까지 돌며 줄어드는 타이머 고리
      const R = Math.max(p.r * 0.46, 11 / z) * grow, Rb = R * 1.32, ix = p.x, iy = p.y - p.r - Rb * 1.25, edge = Math.max(1.4 / z, R * 0.1);
      ctx.fillStyle = 'rgba(24,12,8,0.82)'; ctx.beginPath(); ctx.arc(ix, iy, Rb, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.18)'; ctx.lineWidth = Math.max(3 / z, Rb * 0.16); ctx.beginPath(); ctx.arc(ix, iy, Rb, 0, Math.PI * 2); ctx.stroke(); // 타이머 바닥 홈
      ctx.strokeStyle = `rgba(255,${Math.floor(90 + 120 * left)},40,${0.95 * blink})`; ctx.lineWidth = Math.max(3 / z, Rb * 0.16);
      ctx.beginPath(); ctx.arc(ix, iy, Rb, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * left); ctx.stroke(); // 12시에서 시계 방향으로 남은 만큼
      drawExplosion(ctx, ix, iy, R, edge);
      drawBullet(ctx, ix, iy, -0.7, { back: -R * 0.5, neck: R * 0.04, tip: R * 0.52, w: R * 0.2 }, edge * 0.85);
      // 남은 초
      ctx.font = `900 ${Math.max(11 / z, R * 0.72)}px system-ui`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.lineWidth = Math.max(2.5 / z, R * 0.2); ctx.strokeStyle = 'rgba(30,10,4,0.9)'; ctx.fillStyle = '#fff';
      const label = secs.toFixed(1), ty = iy + Rb + R * 0.75;
      ctx.strokeText(label, ix, ty); ctx.fillText(label, ix, ty);
      ctx.restore();
    }
  }
}
