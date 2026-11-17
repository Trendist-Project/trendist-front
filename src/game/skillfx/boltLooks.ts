import { seeded } from './common';
import { drawBullet } from './shapes';

/**
 * 투사체 종류별 모양 표(4.33). 종류를 하나 더하려면 BOLT_LOOKS에 항목 하나만 넣으면 된다(bolts.ts의 그리는 순서·빛·꼬리 띠·파열은 모두 공통):
 *  - style: 빛·꼬리·파열 고리에 쓰는 색(tail 꼬리, fill 몸통, edge 테두리, ring "r,g,b" 빛과 고리)
 *  - particle: 꼬리에서 뒤로 흩날리는 입자 한 알을 그린다(px,py 자리, sz 크기, i 몇 번째)
 *  - body: 몸통을 그린다(x,y 중심, r 반지름, spin 도는 각도, dx,dy 날아가는 방향)
 */
type Ctx = CanvasRenderingContext2D;
export type BoltKind = 'poison' | 'darkness' | 'slow' | 'stun' | 'root' | 'silence' | 'confuse' | 'burst';
export type BurstKind = BoltKind | 'fireball';
export interface BoltStyle { tail: string; fill: string; edge: string; ring: string }
export interface ParticleArgs { ctx: Ctx; px: number; py: number; sz: number; i: number; z: number; dx: number; dy: number }
export interface BodyArgs { ctx: Ctx; x: number; y: number; r: number; z: number; spin: number; dx: number; dy: number; now: number; id: number; rm: boolean; st: BoltStyle }
export interface BoltLook { style: BoltStyle; particle(a: ParticleArgs): void; body(a: BodyArgs): void }

const TAU = Math.PI * 2;
const dot = (ctx: Ctx, x: number, y: number, r: number) => { ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); };

/** 공통 몸통: 빛이 한쪽에서 비치는 구체(그라데이션)와 테두리. stops는 안쪽(0)부터 바깥(1)까지 색 */
function orb(a: BodyArgs, stops: [number, string][], edge: string, edgeW = 0.14, minPx = 1.8, hi = 0.3) {
  const { ctx, x, y, r, z } = a;
  const g = ctx.createRadialGradient(x - r * hi, y - r * hi, r * 0.1, x, y, r);
  for (const [o, c] of stops) g.addColorStop(o, c);
  ctx.fillStyle = g; ctx.strokeStyle = edge; ctx.lineWidth = Math.max(minPx / z, r * edgeW);
  dot(ctx, x, y, r); ctx.fill(); ctx.stroke();
}
/** 입자: 속이 빈 동그라미 / 채운 동그라미 / 십자 */
const ringP = (color: string) => ({ ctx, px, py, sz, z }: ParticleArgs) => { ctx.strokeStyle = color; ctx.lineWidth = Math.max(1 / z, sz * 0.35); dot(ctx, px, py, sz); ctx.stroke(); };
const fillP = (color: string, k = 0.8) => ({ ctx, px, py, sz }: ParticleArgs) => { ctx.fillStyle = color; dot(ctx, px, py, sz * k); ctx.fill(); };
const crossP = (color: string) => ({ ctx, px, py, sz, z }: ParticleArgs) => { ctx.strokeStyle = color; ctx.lineWidth = Math.max(1 / z, sz * 0.35); ctx.beginPath(); ctx.moveTo(px - sz, py); ctx.lineTo(px + sz, py); ctx.moveTo(px, py - sz); ctx.lineTo(px, py + sz); ctx.stroke(); };

export const BOLT_LOOKS: Record<BoltKind, BoltLook> = {
  // 독: 방울이 맺힌 초록 구체
  poison: {
    style: { tail: 'rgba(90,220,90,0.55)', fill: '#4cd964', edge: '#c9ffd0', ring: '90,220,90' },
    particle: ringP('#c9ffd0'),
    body(a) {
      const { ctx, x, y, r, z } = a;
      orb(a, [[0, '#e6ffe8'], [0.45, '#4cd964'], [1, '#1b8a33']], a.st.edge);
      ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.beginPath(); ctx.ellipse(x - r * 0.35, y - r * 0.4, r * 0.28, r * 0.17, -0.6, 0, TAU); ctx.fill();
      ctx.strokeStyle = 'rgba(230,255,235,0.8)'; ctx.lineWidth = Math.max(1 / z, r * 0.07);
      dot(ctx, x + r * 0.32, y + r * 0.22, r * 0.17); ctx.stroke();
      dot(ctx, x - r * 0.1, y + r * 0.45, r * 0.1); ctx.stroke();
    },
  },
  // 암흑: 보라 테두리가 도는 검은 구체
  darkness: {
    style: { tail: 'rgba(120,70,200,0.5)', fill: '#14101c', edge: '#9b6cff', ring: '155,108,255' },
    particle({ ctx, px, py, sz }) { ctx.fillStyle = 'rgba(30,18,50,0.8)'; dot(ctx, px, py, sz * 1.5); ctx.fill(); },
    body({ ctx, x, y, r, z, spin }) {
      const g = ctx.createRadialGradient(x, y, r * 0.1, x, y, r);
      g.addColorStop(0, '#000'); g.addColorStop(0.7, '#150c25'); g.addColorStop(1, '#2a1650');
      ctx.fillStyle = g; dot(ctx, x, y, r); ctx.fill();
      ctx.strokeStyle = '#9b6cff'; ctx.lineWidth = Math.max(2 / z, r * 0.16);
      for (let i = 0; i < 3; i++) { const a0 = -spin * 1.4 + (i * TAU) / 3; ctx.beginPath(); ctx.arc(x, y, r * 1.02, a0, a0 + 1.3); ctx.stroke(); }
      ctx.strokeStyle = 'rgba(200,170,255,0.5)'; ctx.lineWidth = Math.max(1 / z, r * 0.06);
      ctx.beginPath(); ctx.arc(x, y, r * 0.55, spin, spin + Math.PI); ctx.stroke();
    },
  },
  // 슬로우: 돌며 반짝이는 얼음 결정과 눈 알갱이
  slow: {
    style: { tail: 'rgba(120,200,255,0.55)', fill: '#8fd3ff', edge: '#eaf8ff', ring: '120,200,255' },
    particle: crossP('#eaf8ff'),
    body({ ctx, x, y, r, z, spin }) {
      const hex = (rad: number) => { ctx.beginPath(); for (let i = 0; i < 6; i++) { const a = spin + (i * Math.PI) / 3; const px = x + Math.cos(a) * rad, py = y + Math.sin(a) * rad; if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py); } ctx.closePath(); };
      const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, r * 0.1, x, y, r * 1.2);
      g.addColorStop(0, '#f4fcff'); g.addColorStop(0.6, '#9bd8ff'); g.addColorStop(1, '#4aa8e8');
      hex(r * 1.2); ctx.fillStyle = g; ctx.fill(); ctx.strokeStyle = '#e8f8ff'; ctx.lineWidth = Math.max(1.8 / z, r * 0.14); ctx.stroke();
      hex(r * 0.62); ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = Math.max(1.2 / z, r * 0.08); ctx.stroke();
      ctx.beginPath(); for (let i = 0; i < 3; i++) { const a = spin + (i * Math.PI) / 3; ctx.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r); ctx.lineTo(x - Math.cos(a) * r, y - Math.sin(a) * r); } ctx.stroke();
    },
  },
  // 스턴: 사방으로 튀는 번개 줄기가 달린 노란 구체
  stun: {
    style: { tail: 'rgba(255,225,80,0.55)', fill: '#ffe14d', edge: '#fff7c2', ring: '255,225,80' },
    particle: fillP('#fff7c2'),
    body({ ctx, x, y, r, z, now, id, rm }) {
      const g = ctx.createRadialGradient(x, y, r * 0.1, x, y, r);
      g.addColorStop(0, '#ffffff'); g.addColorStop(0.5, '#fff08a'); g.addColorStop(1, '#ffc800');
      // 번개 줄기: 약 70ms마다 모양이 바뀌며 사방으로 뻗는다
      const rand = seeded(Math.floor(rm ? 0 : now / 70) * 131 + id);
      ctx.strokeStyle = '#fff7b0'; ctx.lineWidth = Math.max(1.6 / z, r * 0.14);
      for (let k = 0; k < 5; k++) {
        let a = rand() * TAU, px = x + Math.cos(a) * r * 0.9, py = y + Math.sin(a) * r * 0.9;
        ctx.beginPath(); ctx.moveTo(px, py);
        for (let j = 0; j < 3; j++) { a += (rand() - 0.5) * 1.2; px += Math.cos(a) * r * 0.55; py += Math.sin(a) * r * 0.55; ctx.lineTo(px, py); }
        ctx.stroke();
      }
      ctx.fillStyle = g; ctx.strokeStyle = '#fff7c2'; ctx.lineWidth = Math.max(1.8 / z, r * 0.14);
      dot(ctx, x, y, r); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = '#8a6200'; ctx.lineWidth = Math.max(1.8 / z, r * 0.16);
      ctx.beginPath(); ctx.moveTo(x + r * 0.2, y - r * 0.65); ctx.lineTo(x - r * 0.3, y + r * 0.05); ctx.lineTo(x + r * 0.28, y + r * 0.05); ctx.lineTo(x - r * 0.2, y + r * 0.65); ctx.stroke();
    },
  },
  // 속박: 가시 돋친 쇠공(사슬 달린 못). 쇠 가시가 천천히 돌고, 앞에는 사슬을 거는 고리 눈이 있으며 뒤에서 사슬 마디가 흩어진다
  root: {
    style: { tail: 'rgba(170,185,210,0.55)', fill: '#9aa8bd', edge: '#eef3fa', ring: '170,185,210' },
    particle({ ctx, px, py, sz, i, z, dx, dy }) {
      ctx.save(); ctx.translate(px, py); ctx.rotate(Math.atan2(dy, dx));
      ctx.strokeStyle = '#d6deea'; ctx.lineWidth = Math.max(1 / z, sz * 0.5);
      ctx.beginPath(); if (i % 2) { ctx.moveTo(-sz, 0); ctx.lineTo(sz, 0); } else ctx.ellipse(0, 0, sz * 1.3, sz * 0.7, 0, 0, TAU); ctx.stroke(); ctx.restore();
    },
    body(a) {
      const { ctx, x, y, r, z, spin, dx, dy } = a;
      ctx.fillStyle = '#6b7a90'; ctx.strokeStyle = '#1f2733'; ctx.lineWidth = Math.max(1.2 / z, r * 0.08);
      for (let i = 0; i < 6; i++) {
        const t = spin * 0.6 + (i * Math.PI) / 3;
        ctx.beginPath(); ctx.moveTo(x + Math.cos(t - 0.26) * r * 0.85, y + Math.sin(t - 0.26) * r * 0.85);
        ctx.lineTo(x + Math.cos(t) * r * 1.5, y + Math.sin(t) * r * 1.5); ctx.lineTo(x + Math.cos(t + 0.26) * r * 0.85, y + Math.sin(t + 0.26) * r * 0.85); ctx.closePath(); ctx.fill(); ctx.stroke();
      }
      orb(a, [[0, '#f4f8fd'], [0.5, '#a6b3c6'], [1, '#4a566b']], '#1f2733', 0.12, 1.6, 0.35);
      ctx.strokeStyle = '#d6deea'; ctx.lineWidth = Math.max(1.4 / z, r * 0.2); // 사슬 고리 눈(진행 방향 앞쪽)
      dot(ctx, x + dx * r * 0.2, y + dy * r * 0.2, r * 0.42); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.beginPath(); ctx.ellipse(x - r * 0.4, y - r * 0.45, r * 0.24, r * 0.14, -0.6, 0, TAU); ctx.fill();
    },
  },
  // 침묵: 붉은 구체에 흰 금지 표시(원과 사선)
  silence: {
    style: { tail: 'rgba(255,90,110,0.55)', fill: '#e5384d', edge: '#ffc2ca', ring: '255,90,110' },
    particle: fillP('#fff7c2'),
    body(a) {
      const { ctx, x, y, r, z } = a;
      orb(a, [[0, '#ffb3bd'], [0.55, '#e5384d'], [1, '#8a1426']], a.st.edge);
      ctx.strokeStyle = '#fff'; ctx.lineWidth = Math.max(1.6 / z, r * 0.16);
      ctx.beginPath(); ctx.arc(x, y, r * 0.58, 0, TAU); ctx.moveTo(x - r * 0.41, y + r * 0.41); ctx.lineTo(x + r * 0.41, y - r * 0.41); ctx.stroke();
    },
  },
  // 터지는 총알: 날아가는 방향을 향한 탄환(황동 탄피 + 주황빛 탄두)과 뒤로 흩날리는 불똥. 곧 터질 것처럼 탄두가 달아올라 깜빡인다
  burst: {
    style: { tail: 'rgba(255,150,60,0.6)', fill: '#e0a23a', edge: '#fff0b8', ring: '255,150,60' },
    particle: fillP('#ffd27a'),
    body({ ctx, x, y, r, z, dx, dy, now, rm }) {
      const len = r * 1.7, glow = rm ? 0.8 : 0.6 + 0.4 * Math.sin(now / 70); // 탄두가 달아올라 깜빡인다
      drawBullet(ctx, x, y, Math.atan2(dy, dx), { back: -len * 0.9, neck: len * 0.1, tip: len * 1.15, w: r * 0.78 }, Math.max(1.4 / z, r * 0.12), glow, true);
    },
  },
  // 혼란: 분홍 구체 안에서 도는 나선
  confuse: {
    style: { tail: 'rgba(255,110,199,0.55)', fill: '#ff6ec7', edge: '#ffd2ef', ring: '255,110,199' },
    particle: fillP('#fff7c2'),
    body(a) {
      const { ctx, x, y, r, z, spin } = a;
      orb(a, [[0, '#ffe3f5'], [0.55, '#ff6ec7'], [1, '#a8197a']], a.st.edge);
      ctx.strokeStyle = '#fff'; ctx.lineWidth = Math.max(1.4 / z, r * 0.13);
      ctx.beginPath();
      for (let k = 0; k <= 24; k++) { const t = -spin * 1.6 + k * 0.4, rad = r * 0.12 + (k / 24) * r * 0.62; const px = x + Math.cos(t) * rad, py = y + Math.sin(t) * rad; if (k === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py); }
      ctx.stroke();
    },
  },
};

/** 화염구가 맞은 자리의 파열도 같은 고리 모양을 쓴다(색만 따로) */
export const BURST_STYLE: Record<BurstKind, BoltStyle> = {
  ...Object.fromEntries(Object.entries(BOLT_LOOKS).map(([k, v]) => [k, v.style])) as Record<BoltKind, BoltStyle>,
  fireball: { tail: 'rgba(255,140,40,0.55)', fill: '#ff8c2a', edge: '#ffe2a0', ring: '255,140,40' },
};
