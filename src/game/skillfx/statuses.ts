import type { PosFn } from './common';

/**
 * 원에 걸린 상태 효과의 표시(4.33): 독·암흑·슬로우·스턴. 종류가 달라도 "어느 원에, 몇 겹, 언제부터 언제까지"는 같아서 한 곳(by)에 들고,
 * 걸기(apply)·풀기(remove)·만료(expire)·정화(cleanse)를 여기서 함께 처리한다. 그리는 모양만 종류마다 다르다.
 */
export type StatusKind = 'poison' | 'darkness' | 'slow' | 'stun';
interface Status { stacks: number; at: number; until: number }

/** 끝난 뒤 표시가 걷히는 데 걸리는 시간(ms). 이 시간이 지나면 지운다 */
const LINGER_MS: Record<StatusKind, number> = { poison: 400, darkness: 300, slow: 400, stun: 300 };
/** 정화 신호(skillFx cleanse)로 바로 지우는 종류. 독은 서버가 poisonEnd를 따로 보낸다 */
const CLEANSED: StatusKind[] = ['darkness', 'slow', 'stun'];

export class StatusFx {
  private by: Record<StatusKind, Map<number, Status>> = { poison: new Map(), darkness: new Map(), slow: new Map(), stun: new Map() };

  constructor(readonly reducedMotion: boolean) {}

  clear() { for (const m of Object.values(this.by)) m.clear(); }

  /** 원 e가 kind에 걸렸다(ms 동안, 겹 수 stacks). 이미 걸려 있으면 새 값으로 바꾼다 */
  apply(kind: StatusKind, e: number, now: number, ms: number, stacks = 1) { this.by[kind].set(e, { stacks, at: now, until: now + ms }); }

  /** 원 e의 kind가 풀렸다 */
  remove(kind: StatusKind, e: number) { this.by[kind].delete(e); }

  /** 원 e가 정화를 썼다: 걸려 있던 표시를 지운다 */
  cleanse(e: number) { for (const k of CLEANSED) this.by[k].delete(e); }

  /** 끝나고 걷히는 시간까지 지난 표시를 지운다(그리기 직전에 부른다) */
  private expire(kind: StatusKind, now: number) {
    const m = this.by[kind], linger = LINGER_MS[kind];
    for (const [e, s] of m) if (now >= s.until + linger) m.delete(e);
  }

  /** 별 하나: 중심 (x, y), 바깥 반지름 ro, 회전 rot. 노란 몸통에 어두운 윤곽과 밝은 심 */
  starShape(ctx: CanvasRenderingContext2D, x: number, y: number, ro: number, rot: number, z: number) {
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = rot + (Math.PI * i) / 5 - Math.PI / 2, r = i % 2 === 0 ? ro : ro * 0.46;
      if (i === 0) ctx.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r); else ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
    }
    ctx.closePath();
    ctx.fillStyle = '#ffd84a'; ctx.strokeStyle = '#7a5200'; ctx.lineWidth = Math.max(1.4 / z, ro * 0.22); ctx.lineJoin = 'round';
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#fff6c2'; ctx.beginPath(); ctx.arc(x - ro * 0.12, y - ro * 0.12, ro * 0.22, 0, Math.PI * 2); ctx.fill();
  }

  /**
   * 걸린 상태를 모두 그린다(독 → 슬로우 → 스턴 → 암흑 순서로 겹친다). 끝나고 걷히는 시간이 지난 표시는 지우고, 원 위치를 못 찾으면 건너뛴다.
   * 종류마다 다른 것은 모양(PAINT)뿐이다.
   */
  draw(ctx: CanvasRenderingContext2D, now: number, z: number, pos: PosFn) {
    for (const kind of DRAW_ORDER) {
      this.expire(kind, now);
      for (const [e, p] of this.by[kind]) {
        const o = pos(e, now);
        if (o) PAINT[kind].call(this, ctx, { e, o, p, now, z });
      }
    }
  }
}

/** 그리는 순서(뒤에 그린 것이 위에 보인다) */
const DRAW_ORDER: StatusKind[] = ['poison', 'slow', 'stun', 'darkness'];

/** 한 원의 상태 하나를 그릴 때 받는 것: 원 번호, 화면 위치, 걸린 상태, 시각, 줌 */
interface PaintArgs { e: number; o: { x: number; y: number; r: number }; p: Status; now: number; z: number }
type Painter = (this: StatusFx, ctx: CanvasRenderingContext2D, a: PaintArgs) => void;

/** 종류마다 모양. this는 StatusFx(움직임 줄이기 설정·별 그리기를 쓴다) */
const PAINT: Record<StatusKind, Painter> = {
  /** 독에 걸린 원: 초록 고리와 떠오르는 방울, 머리 위 ☠×스택 수(모두에게 보인다) */
  poison(ctx, { e, o, p, now, z }) {
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
  },
  /** 슬로우에 걸린 원: 얼음 고리와 떨어지는 눈송이, 머리 위 🧊×겹 수와 남은 초 */
  slow(ctx, { e, o, p, now, z }) {
    const fade = Math.min(1, (now - p.at) / 150, (p.until + 400 - now) / 400);
    ctx.save();
    ctx.globalAlpha = fade;
    ctx.strokeStyle = 'rgba(140,215,255,0.9)'; ctx.lineWidth = Math.max(3 / z, o.r * 0.09);
    ctx.beginPath(); ctx.arc(o.x, o.y, o.r * 1.1, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = 'rgba(235,250,255,0.9)'; ctx.lineWidth = Math.max(1.5 / z, o.r * 0.03);
    ctx.beginPath(); ctx.arc(o.x, o.y, o.r * 1.2, 0, Math.PI * 2); ctx.stroke();
    if (!this.reducedMotion) {
      ctx.fillStyle = 'rgba(220,245,255,0.85)';
      for (let i = 0; i < 7; i++) {
        const ph = ((now / 1500) + i / 7) % 1, ang = i * 2.4 + e, sz = Math.max(2 / z, o.r * 0.07) * (1 - ph * 0.5);
        const x = o.x + Math.cos(ang) * o.r * 0.9, y = o.y - o.r * 1.0 + ph * o.r * 1.8;
        ctx.beginPath(); ctx.moveTo(x, y - sz * 1.4); ctx.lineTo(x + sz, y); ctx.lineTo(x, y + sz * 1.4); ctx.lineTo(x - sz, y); ctx.closePath(); ctx.fill();
      }
    }
    const fs = Math.max(14 / z, Math.min(o.r * 0.5, 36)), left = Math.max(0, Math.ceil((p.until - now) / 1000));
    ctx.font = `700 ${fs}px "Noto Sans KR", system-ui, sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    ctx.lineWidth = Math.max(2 / z, fs * 0.15); ctx.strokeStyle = 'rgba(8,30,50,0.9)'; ctx.fillStyle = '#d6f1ff';
    const label = `🧊 ×${p.stacks}  ${left}s`;
    ctx.strokeText(label, o.x, o.y - o.r * 1.2 - 6 / z); ctx.fillText(label, o.x, o.y - o.r * 1.2 - 6 / z);
    ctx.restore();
  },
  /**
   * 스턴에 걸린 원: 머리 위에서 별들이 타원 궤도로 빙글 도는 "어지러움" 고리(만화에서 기절한 머리 위의 그 모양). 앞쪽 별은 크고 선명하게,
   * 뒤쪽 별은 작고 흐리게 그려 입체로 보이고, 뒤쪽 별은 원 뒤에 가려지는 느낌을 위해 먼저 그린다. 원 둘레에는 노란 번쩍이는 고리가 있다.
   */
  stun(ctx, { o, p, now, z }) {
    const fade = Math.min(1, (now - p.at) / 100, (p.until + 300 - now) / 300);
    ctx.save();
    ctx.globalAlpha = fade;
    ctx.strokeStyle = `rgba(255,225,80,${this.reducedMotion ? 0.8 : 0.5 + 0.35 * Math.sin(now / 70)})`; ctx.lineWidth = Math.max(3 / z, o.r * 0.07);
    ctx.beginPath(); ctx.arc(o.x, o.y, o.r * 1.1, 0, Math.PI * 2); ctx.stroke();
    const cy = o.y - o.r * 1.12, rx = Math.max(o.r * 0.78, 16 / z), ry = rx * 0.3, star = Math.max(o.r * 0.24, 7 / z);
    // 궤도 고리(옅은 타원)
    ctx.strokeStyle = 'rgba(255,225,80,0.35)'; ctx.lineWidth = Math.max(1.5 / z, star * 0.25);
    ctx.beginPath(); ctx.ellipse(o.x, cy, rx, ry, 0, 0, Math.PI * 2); ctx.stroke();
    const n = 4, spin = this.reducedMotion ? 0 : now / 420;
    const items = Array.from({ length: n }, (_, i) => { const a = spin + (i * Math.PI * 2) / n; return { a, depth: (Math.sin(a) + 1) / 2, x: o.x + Math.cos(a) * rx, y: cy + Math.sin(a) * ry }; })
      .sort((u, v) => u.depth - v.depth); // 뒤쪽(depth 작음)부터 그린다
    for (const it of items) {
      ctx.globalAlpha = fade * (0.45 + 0.55 * it.depth);
      this.starShape(ctx, it.x, it.y, star * (0.65 + 0.45 * it.depth), this.reducedMotion ? 0 : -spin * 1.6, z);
    }
    ctx.restore();
  },
  /**
   * 암흑에 걸린 원(모두에게 보인다): 원 위에 보라빛 어두운 안개, 둘레를 도는 연기 조각, 머리 위 🕶️와 남은 시간 링.
   * 독(초록 점선 고리·방울)과 색뿐 아니라 모양(안개·연기·🕶️)으로도 구별된다. 줌아웃해도 보이도록 화면 기준 최소 크기가 있다.
   */
  darkness(ctx, { e, o, p, now, z }) {
    const total = Math.max(1, p.until - p.at), left = Math.max(0, p.until - now);
    const fade = Math.min(1, (now - p.at) / 200, (left + 300) / 300); // 걸릴 때 빠르게 덮이고 끝날 때 부드럽게 걷힌다
    const pulse = this.reducedMotion ? 0 : Math.sin(now / 220) * 0.06;
    ctx.save();
    // 안개: 가운데는 짙고 가장자리는 번지는 보라·검정
    const fog = ctx.createRadialGradient(o.x, o.y, o.r * 0.2, o.x, o.y, o.r * 1.15);
    fog.addColorStop(0, `rgba(10,6,20,${(0.62 + pulse) * fade})`);
    fog.addColorStop(0.75, `rgba(40,20,80,${(0.5 + pulse) * fade})`);
    fog.addColorStop(1, 'rgba(60,30,110,0)');
    ctx.fillStyle = fog;
    ctx.beginPath(); ctx.arc(o.x, o.y, o.r * 1.15, 0, Math.PI * 2); ctx.fill();
    // 둘레를 도는 연기 조각
    if (!this.reducedMotion) {
      ctx.fillStyle = `rgba(30,16,56,${0.55 * fade})`; ctx.strokeStyle = `rgba(155,108,255,${0.6 * fade})`;
      ctx.lineWidth = Math.max(1.5 / z, o.r * 0.03);
      const wisp = Math.max(5 / z, o.r * 0.14);
      for (let i = 0; i < 4; i++) {
        const a = now / 700 * (i % 2 ? -1 : 1) + (i / 4) * Math.PI * 2 + e, dist = o.r * (1.0 + 0.12 * Math.sin(now / 300 + i));
        ctx.beginPath(); ctx.arc(o.x + Math.cos(a) * dist, o.y + Math.sin(a) * dist, wisp * (0.8 + 0.3 * Math.sin(now / 200 + i * 2)), 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      }
    }
    // 남은 시간 링(위에서 시계 방향으로 줄어든다)
    ctx.strokeStyle = `rgba(155,108,255,${0.9 * fade})`; ctx.lineWidth = Math.max(3 / z, o.r * 0.07); ctx.lineCap = 'round';
    ctx.beginPath(); ctx.arc(o.x, o.y, o.r * 1.1, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (left / total)); ctx.stroke();
    // 머리 위 🕶️
    const fs = Math.max(18 / z, Math.min(o.r * 0.6, 44));
    ctx.globalAlpha = fade; ctx.font = `${fs}px "Noto Color Emoji","Apple Color Emoji","Segoe UI Emoji",sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    ctx.fillText('🕶️', o.x, o.y - o.r * 1.1 - 4 / z);
    ctx.restore();
  },
};
