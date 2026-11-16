import { useEffect, useRef } from 'react';
import { SkillFxLayer } from '../game/skillFx';
import { HpLayer } from '../game/arena/hp';
import { paintInvincible } from '../game/arena/invincible';
import type { EntityState, SkillFx } from '../game/protocol';

/**
 * 스킬 모션 미리보기(개발 미리보기 페이지와 관리자 스킬 화면이 함께 쓴다): 서버와 같은 신호(SkillFx)를 SkillFxLayer에 넣어 쓸 때·날아갈 때·맞았을 때·걸려 있을 때를 되풀이해서 보여 준다.
 * 왼쪽 초록 원(나)이 쓰고, 오른쪽 주황 원(상대)이 맞는다. 자기에게 거는 스킬은 나에게, 상대에게 거는 스킬은 상대에게 연출이 나온다.
 */
type Act = SkillFx
  | { op: 'pull'; to: number; ms: number }   // 상대 원을 to(x)까지 ms 동안 옮긴다(끌려오기, 무적 통과)
  | { op: 'reset' }                          // 두 원을 처음 자리로
  | { op: 'dash'; ms: number }               // 나의 대시(하늘색 둘레 빛·속도선·⚡)
  | { op: 'inv'; ms: number }                // 나의 무적(황금 방벽 돔)
  | { op: 'heal' }                           // 나의 회복(초록 +)
  | { op: 'view'; v: 'mine' | 'theirs'; text: string }; // 보는 쪽 바꾸기(은신: 내 화면 / 상대 화면). text는 화면 위 설명
type Step = [number, Act];

const W = 300, H = 190, Y = 100, R = 26, A0 = 70, B0 = 230;
const bolt = (kind: Extract<SkillFx, { id: 'bolt' }>['kind'], t0: number, after: Step[], bid = 1): Step[] => [
  [t0, { id: 'bolt', kind, bid, e: 1, x: A0 + R, y: Y, dx: 1, dy: 0, speed: 120, range: 140, radius: 12 }],
  [t0 + 900, { id: 'boltEnd', bid, hit: 2, x: B0 - R, y: Y }],
  ...after.map(([t, a]) => [t0 + 900 + t, a] as Step),
];

export const MOTION_SCRIPTS: Record<string, Step[]> = {
  dash: [[300, { op: 'dash', ms: 700 }], [1300, { op: 'reset' }]],
  invincibility: [[200, { op: 'inv', ms: 3000 }], [500, { op: 'pull', to: 20, ms: 2200 }], [3500, { op: 'reset' }]],
  hook: [[200, { id: 'hook', e: 1, dx: 1, dy: 0, range: 150, ms: 600 }], [800, { id: 'hookHit', e: 1, t: 2, ms: 800 }], [800, { op: 'pull', to: 130, ms: 800 }], [1700, { id: 'hookEnd', e: 1 }], [2300, { op: 'reset' }]],
  slow: bolt('slow', 200, [[0, { id: 'slow', t: 2, stacks: 2, ms: 2200 }], [2300, { id: 'slowEnd', t: 2 }]]),
  // 은신: 내 화면(반투명 + 점선 고리)과 상대 화면(완전히 사라지고, 상대 원 위에 빨간 ! 경고만 뜬다)을 차례로 보여 준다
  stealth: [[0, { op: 'view', v: 'mine', text: '내 화면: 반투명하게 보이고 점선 고리가 돌아요' }], [200, { id: 'stealth', e: 1, ms: 2400 }], [2700, { id: 'stealthEnd', e: 1 }],
    [3400, { op: 'view', v: 'theirs', text: '상대 화면: 완전히 사라지고 ! 경고만 떠요' }], [3600, { id: 'stealth', e: 1, ms: 2400 }], [6000, { id: 'stealthEnd', e: 1 }]],
  repel: [[300, { id: 'repel', e: 1, x: A0, y: Y, r0: R, rMax: 130, speed: 260 }], [400, { op: 'pull', to: 260, ms: 500 }], [1800, { op: 'reset' }]],
  // 정화: 독·슬로우·침묵에 걸려 있다가 정화를 쓰면 모두 풀린다. 독은 서버가 poisonEnd를 따로 보내므로 같은 시각에 함께 넣는다
  cleanse: [[100, { id: 'poison', t: 1, stacks: 2, ms: 8000 }], [250, { id: 'slow', t: 1, stacks: 1, ms: 8000 }], [400, { id: 'silence', t: 1, ms: 8000 }],
    [1900, { id: 'cleanse', e: 1 }], [1900, { id: 'poisonEnd', t: 1 }]],
  darkness: bolt('darkness', 200, [[0, { id: 'darkness', t: 2, ms: 2600 }]]),
  heal: [[300, { op: 'heal' }], [1300, { op: 'heal' }]],
  poison: bolt('poison', 200, [[0, { id: 'poison', t: 2, stacks: 2, ms: 3000 }], [3100, { id: 'poisonEnd', t: 2 }]]),
  stun: bolt('stun', 200, [[0, { id: 'stun', t: 2, ms: 2000 }], [2100, { id: 'stunEnd', t: 2 }]]),
  quake: [[300, { id: 'quake', e: 1, x: A0, y: Y, r0: R, rMax: 230, speed: 260 }], [850, { id: 'quakeHit', t: 2, n: 2 }]],
  fireball: [0, 1, 2].flatMap((i): Step[] => [
    [200 + i * 220, { id: 'fireball', fid: i + 1, e: 1, t: 2, x: A0 + R, y: Y + (i - 1) * 8, speed: 200 }],
    [200 + i * 220 + 560, { id: 'fireballEnd', fid: i + 1, hit: true, t: 2, x: B0 - R, y: Y }],
  ]),
  absorb: [[200, { id: 'absorb', e: 1, t: 2, ms: 3000, range: 220 }], [200, { id: 'absorbTick', e: 1, t: 2 }], [1200, { id: 'absorbTick', e: 1, t: 2 }], [2200, { id: 'absorbTick', e: 1, t: 2 }], [3200, { id: 'absorbEnd', e: 1, t: 2 }]],
  root: bolt('root', 200, [[0, { id: 'root', t: 2, ms: 2600 }], [2700, { id: 'rootEnd', t: 2 }]]),
  amplify: [[200, { id: 'amplify', e: 1, ms: 3500 }], [3700, { id: 'amplifyEnd', e: 1 }]],
  fortify: [[200, { id: 'fortify', e: 1, ms: 3500 }], [3700, { id: 'fortifyEnd', e: 1 }]],
  silence: bolt('silence', 200, [[0, { id: 'silence', t: 2, ms: 2400 }], [2500, { id: 'silenceEnd', t: 2 }]]),
  berserk: [[200, { id: 'berserk', e: 1, pct: 10 }], [1200, { id: 'berserk', e: 1, pct: 40 }], [2200, { id: 'berserk', e: 1, pct: 70 }], [3200, { id: 'berserk', e: 1, pct: 90 }], [3900, { id: 'berserkEnd', e: 1 }]],
  confuse: bolt('confuse', 200, [[0, { id: 'confuse', t: 2, ms: 2600 }], [2700, { id: 'confuseEnd', t: 2 }]]),
  barrier: [[200, { id: 'barrier', e: 1, ms: 10000, pct: 50, max: 50 }], [1100, { id: 'barrierHit', e: 1, pct: 38 }], [1900, { id: 'barrierHit', e: 1, pct: 22 }], [2700, { id: 'barrierHit', e: 1, pct: 8 }], [3300, { id: 'barrierEnd', e: 1, broken: true }]],
};
/** 겹쳐 쓰기(개발 미리보기 전용): 공격 증폭 + 피해 감소 + 광폭화가 한 원에 같이 걸린 모양 */
MOTION_SCRIPTS.combo = [[200, { id: 'amplify', e: 1, ms: 4500 }], [500, { id: 'fortify', e: 1, ms: 4500 }], [800, { id: 'berserk', e: 1, pct: 55 }], [1100, { id: 'silence', t: 1, ms: 3000 }], [4700, { id: 'amplifyEnd', e: 1 }], [4700, { id: 'fortifyEnd', e: 1 }], [4700, { id: 'berserkEnd', e: 1 }], [4100, { id: 'silenceEnd', t: 1 }]];
/** 실제 스킬 코드만(관리자 화면용) */
export const MOTION_CODES = Object.keys(MOTION_SCRIPTS).filter((c) => c !== 'combo');

const ease = (t: number) => 1 - (1 - Math.min(1, Math.max(0, t))) ** 3;

export function SkillMotion({ code, width = W }: { code: string; width?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current;
    const script = MOTION_SCRIPTS[code];
    if (!cv || !script) return;
    const ctx = cv.getContext('2d')!, dpr = window.devicePixelRatio || 1;
    cv.width = W * dpr; cv.height = H * dpr;
    const fx = new SkillFxLayer(false), hp = new HpLayer(false), steps = script.slice().sort((u, v) => u[0] - v[0]);
    const loop = Math.max(4200, ...steps.map((s) => s[0] + 800));
    const fixed = new URLSearchParams(location.search).get('at'); // ?at=1500 이면 그 시각(ms)의 한 장면만 그린다(캡처용)
    let t0 = performance.now(), done = 0, raf = 0;
    let view: 'mine' | 'theirs' = 'mine', caption = '';
    let ax = A0, bx = B0, bFrom = B0, bTo = B0, bAt = 0, bMs = 1, dash: { at: number; ms: number } | null = null, inv: { at: number; ms: number } | null = null;
    const reset = () => { view = 'mine'; caption = ''; fx.clear(); hp.clear(); ax = A0; bx = B0; bFrom = B0; bTo = B0; dash = null; inv = null; };
    const pos = (e: number) => (e === 1 ? (view === 'theirs' ? null : { x: ax, y: Y, r: R }) : e === 2 ? { x: bx, y: Y, r: R } : null);
    const run = (a: Act, at: number) => {
      if ('op' in a) {
        if (a.op === 'pull') { bFrom = bx; bTo = a.to; bAt = at; bMs = a.ms; }
        else if (a.op === 'reset') { ax = A0; bx = B0; bFrom = B0; bTo = B0; dash = null; inv = null; }
        else if (a.op === 'dash') dash = { at, ms: a.ms };
        else if (a.op === 'inv') inv = { at, ms: a.ms };
        else if (a.op === 'heal') hp.healPop(1);
        else if (a.op === 'view') { view = a.v; caption = a.text; }
        return;
      }
      if (a.id === 'barrier' || a.id === 'barrierHit') hp.setBarrier(a.e, a.pct); else if (a.id === 'barrierEnd') hp.setBarrier(a.e, 0);
      fx.show(a, at);
    };
    const circle = (x: number, fill: string, edge: string, label: string, alpha = 1) => {
      ctx.globalAlpha = alpha; ctx.beginPath(); ctx.arc(x, Y, R, 0, Math.PI * 2); ctx.fillStyle = fill; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = edge; ctx.stroke();
      ctx.fillStyle = '#fff'; ctx.font = '700 14px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(label, x, Y); ctx.globalAlpha = 1;
    };
    const frame = (realNow: number) => {
      const now = fixed !== null ? t0 + Number(fixed) : realNow;
      let el = now - t0;
      if (el > loop) { t0 = now; el = 0; done = 0; reset(); }
      while (done < steps.length && steps[done][0] <= el) { run(steps[done][1], fixed !== null ? t0 + steps[done][0] : now); done++; }
      if (bMs > 0 && bTo !== bFrom) bx = bFrom + (bTo - bFrom) * ease((now - bAt) / bMs);
      if (dash) { const t = now - dash.at; ax = A0 + 150 * ease(t / (dash.ms * 0.8)); }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = '#243148'; for (let i = 0; i < W; i += 30) ctx.fillRect(i, 0, 1, H); for (let j = 0; j < H; j += 30) ctx.fillRect(0, j, W, 1);
      // 대시: 둘레 빛과 뒤로 늘어나는 속도선, ⚡
      if (dash && now - dash.at < dash.ms + 400) {
        const t = now - dash.at, k = Math.max(0, 1 - Math.max(0, t - dash.ms) / 400);
        ctx.strokeStyle = `rgba(127,219,255,${0.5 * k})`; ctx.lineWidth = 8; ctx.beginPath(); ctx.arc(ax, Y, R + 4, 0, Math.PI * 2); ctx.stroke();
        ctx.strokeStyle = `rgba(220,245,255,${0.8 * k})`; ctx.lineWidth = 2; ctx.lineCap = 'round';
        for (let i = -2; i <= 2; i++) { const len = 40 + 25 * Math.abs(i % 2), yy = Y + i * 9; ctx.beginPath(); ctx.moveTo(ax - R - 4, yy); ctx.lineTo(ax - R - 4 - len * Math.min(1, t / 250), yy); ctx.stroke(); }
        if (t < 700) { ctx.globalAlpha = 1 - (t / 700) ** 2; ctx.font = '22px system-ui'; ctx.fillStyle = '#fff'; ctx.fillText('⚡', ax, Y - R - 10 - 26 * ease(t / 700)); ctx.globalAlpha = 1; }
      }
      const theirs = view === 'theirs', sp = fx.stealthProgress(1, now);
      if (theirs) circle(bx, '#2f9e6f', '#0f3d2b', '나'); else circle(bx, '#c9794a', '#5a2f12', '상대');
      if (!theirs) circle(ax, '#2f9e6f', '#0f3d2b', '나', 1 - 0.8 * sp); // 상대 화면에서는 은신한 원이 아예 안 그려진다
      if (!theirs && sp >= 1) fx.drawStealthRing(ctx, ax, Y, R, now, 1);
      if (theirs && sp >= 0.6) { // 보이지 않는 적이 가까이 있으면 내 원 위에 빨간 ! 경고만 뜬다
        const pr = 13 * (1 + Math.sin(now / 130) * 0.12), px = bx + R * 0.8 + 16, py = Y - R * 0.8 - 16;
        ctx.fillStyle = '#e5322d'; ctx.strokeStyle = '#fff'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(px, py, pr, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#fff'; ctx.font = `900 ${pr * 1.6}px system-ui`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('!', px, py + pr * 0.06);
      }
      if (inv) { const left = inv.ms - (now - inv.at); if (left > 0) { ctx.save(); ctx.globalAlpha = Math.min(1, left / 300) * 0.95; paintInvincible(ctx, ax, Y, R + 6, now, 1); ctx.restore(); } }
      if (code === 'barrier' || code === 'heal') hp.drawBar(ctx, { e: 1, x: ax, y: Y, r: R } as unknown as EntityState, 1, now);
      fx.drawActive(ctx, now, 1, (e) => pos(e));
      hp.drawPops(ctx, now, 1, (e) => pos(e));
      if (caption) { // 보는 쪽 설명(위쪽 가운데)
        ctx.font = '700 12px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        const w = ctx.measureText(caption).width + 16; ctx.fillStyle = 'rgba(8,12,20,0.78)'; ctx.fillRect(W / 2 - w / 2, 8, w, 22);
        ctx.fillStyle = '#dbe7ff'; ctx.fillText(caption, W / 2, 19);
      }
      if (fixed === null) raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [code]);
  return <canvas ref={ref} style={{ width, maxWidth: '100%', aspectRatio: `${W} / ${H}`, height: 'auto', display: 'block', borderRadius: 10 }} />;
}
