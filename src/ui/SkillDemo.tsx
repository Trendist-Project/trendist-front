import { useEffect, useRef } from 'react';
import { SkillFxLayer } from '../game/skillFx';
import { borderLineWidth, drawTurtle, TURTLE_BASE } from '../game/turtle';
import { t } from '../i18n';
import { skillDef, type DemoSkillCode } from '../game/skills';

/**
 * 가이드의 스킬 예시(4.17, 4.33): 스킬이 어떻게 동작하고 **내 화면**과 **상대 화면**에서 어떻게 보이는지를 움직이는 그림 두 장으로 보여 준다.
 * 실제 게임의 연출(충격파 고리·갈고리 줄·은신 사라짐 등, game/skillFx.ts)을 그대로 써서 같은 모양이고, 정해진 각본을 반복해서 돈다.
 * 화면에 보일 때만 움직이고(IntersectionObserver), 모션 줄이기 설정이면 대표 장면 한 컷만 그린다.
 * 노란 테두리 원 = 스킬을 쓰는 사람(청록), 파란 원 = 다른 사람. 흰 테두리가 "이 화면의 주인(나)"이다.
 */
/** 그림이 있는 스킬(회복은 그림이 없다). 스킬 목록은 game/skills.ts */
export type DemoSkill = DemoSkillCode;

const W = 280, H = 150, R = 15;
const USER_BG = TURTLE_BASE, OTHER_BG = '#4f7fd8';

interface Pt { x: number; y: number }
interface Frame {
  user: Pt; other: Pt;
  shield: number;                // 방패 남은 ms(0이면 없음)
  dash: boolean; dashAt: number; // 대시 중
  lostAt: number | null;         // 상대가 키워드를 잃는 순간(갈고리·독) ms
  note: 'a' | 'b' | 'c' | null;  // 화면 위 안내 문구 번호
  dark?: { from: number; to: number; who: 'user' | 'other' }; // 암흑에 걸려 그 사람의 화면이 어두운 때(ms)와 그 사람
}
interface Script {
  total: number;
  events: { at: number; run: (fx: SkillFxLayer, now: number) => void }[];
  frame: (u: number) => Frame;
}

const ease = (x: number) => 1 - (1 - Math.min(1, Math.max(0, x))) ** 3;
const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));
const base: Frame = { user: { x: 0, y: 75 }, other: { x: 0, y: 75 }, shield: 0, dash: false, dashAt: 0, lostAt: null, note: null };

// 독·암흑·정화는 아래에서 이어서 더한다(투사체 도우미가 필요해서)
const BASE_SCRIPTS: Record<'dash' | 'shield' | 'hook' | 'repel' | 'stealth', Script> = {
  // 대시: 같은 속도로 걷다가 쓰면 2배 속도로 멀어진다. 쫓아가던 사람은 점점 뒤처진다
  dash: {
    total: 3600,
    events: [],
    frame: (u) => {
      const dur = clamp(u - 700, 0, 1200);
      const x = 70 + 45 * (u / 1000) + 45 * (dur / 1000);
      return { ...base, user: { x, y: 75 }, other: { x: 28 + 45 * (u / 1000), y: 75 }, dash: u >= 700 && u <= 1900, dashAt: 700, note: u > 700 && u < 3000 ? 'a' : null };
    },
  },
  // 방패: 방패를 쓰면 다가오는 원이 부딪히지 않고 그대로 통과한다
  shield: {
    total: 4600,
    events: [],
    frame: (u) => ({ ...base, user: { x: 140, y: 75 }, other: { x: 20 + 70 * (u / 1000), y: 75 }, shield: u >= 600 ? clamp(3000 - (u - 600), 0, 3000) : 0, note: u > 1200 && u < 3300 ? 'a' : null }),
  },
  // 갈고리: 겨눈 방향으로 던져 맞으면 키워드 1개를 잃고 끌려온다
  hook: {
    total: 4400,
    events: [
      { at: 700, run: (fx, now) => fx.show({ id: 'hook', e: 1, dx: 1, dy: 0, range: R * 5, ms: 450 }, now) },
      { at: 1060, run: (fx, now) => fx.show({ id: 'hookHit', e: 1, t: 2, ms: 700 }, now) },
    ],
    frame: (u) => {
      const pulled = ease((u - 1060) / 700);
      const touch = 70 + (R + R) * 0.98;
      const ox = u < 1060 ? 150 : 150 + (touch - 150) * pulled;
      return { ...base, user: { x: 70, y: 75 }, other: { x: ox, y: 75 }, lostAt: u >= 1060 ? 1060 : null, note: u > 1000 && u < 3600 ? 'a' : null };
    },
  },
  // 반발(코드 repel): 내 원 둘레로 방어막 파문이 퍼져서 닿은 원을 밀어낸다(키워드는 안 잃음)
  repel: {
    total: 4000,
    events: [{ at: 700, run: (fx, now) => fx.show({ id: 'repel', e: 1, x: 110, y: 75, r0: R, rMax: R * 5, speed: 120 }, now) }],
    frame: (u) => {
      const hitAt = 700 + ((65 - R) / 120) * 1000; // 고리 앞쪽이 상대 가장자리에 닿는 때
      const push = ease((u - hitAt) / 600);
      return { ...base, user: { x: 110, y: 75 }, other: { x: 175 + 70 * push, y: 75 }, note: u > 900 && u < 3200 ? 'a' : null };
    },
  },
  // 은신: 쓰면 서서히 사라져 상대 눈에는 안 보인다. 가까이 오면 상대 화면에는 빨간 !가 뜬다
  stealth: {
    total: 6200,
    events: [{ at: 600, run: (fx, now) => fx.show({ id: 'stealth', e: 1, ms: 4200 }, now) }],
    frame: (u) => {
      const k = clamp((u - 800) / 3600, 0, 1);
      return { ...base, user: { x: 40 + 200 * k, y: 108 }, other: { x: 160, y: 46 }, note: u > 1300 && u < 4600 ? 'a' : null };
    },
  },
};

// 독·암흑 투사체: 쓰는 사람(왼쪽)이 상대(오른쪽)에게 던진다. 투사체 위치는 시작점 + 속도 × 시간으로 그려져(실제 게임과 같다) 맞는 때에 맞춰 boltEnd를 보낸다
const BOLT_FROM = 60 + R, BOLT_TO = 200 - R, BOLT_SPEED = 300, BOLT_HIT_MS = ((BOLT_TO - BOLT_FROM) / BOLT_SPEED) * 1000;
const boltAt = (at: number, bid: number, kind: 'poison' | 'darkness' | 'slow' | 'stun') => ({
  at, run: (fx: SkillFxLayer, now: number) => fx.show({ id: 'bolt', kind, bid, e: 1, x: BOLT_FROM, y: 75, dx: 1, dy: 0, speed: BOLT_SPEED, range: 200, radius: 5 }, now),
});
const boltHit = (at: number, bid: number) => ({ at, run: (fx: SkillFxLayer, now: number) => fx.show({ id: 'boltEnd', bid, hit: 2, x: BOLT_TO, y: 75 }, now) });

const POISON_SCRIPT: Script = {
  // 독: 맞으면 머리 위에 ☠ ×스택과 남은 초가 뜨고, 한 번 더 맞으면 스택이 올라 틱마다 더 많이 잃는다(한꺼번에 잃으면 개수만 알려 준다)
  total: 7600,
  events: [
    boltAt(600, 1, 'poison'), boltHit(600 + BOLT_HIT_MS, 1),
    { at: 600 + BOLT_HIT_MS, run: (fx, now) => fx.show({ id: 'poison', t: 2, stacks: 1, ms: 6000 }, now) },
    boltAt(2100, 2, 'poison'), boltHit(2100 + BOLT_HIT_MS, 2),
    { at: 2100 + BOLT_HIT_MS, run: (fx, now) => fx.show({ id: 'poison', t: 2, stacks: 2, ms: 5000 }, now) },
    { at: 7000, run: (fx, now) => fx.show({ id: 'poisonEnd', t: 2 }, now) },
  ],
  frame: (u) => ({ ...base, user: { x: 60, y: 75 }, other: { x: 200, y: 75 }, lostAt: u >= 4600 ? 4600 : null, note: u > 1100 && u < 6800 ? 'a' : null }),
};
const DARKNESS_SCRIPT: Script = {
  // 암흑: 맞은 사람은 3초 동안 자기 원 둘레만 보이고 나머지는 어두워진다. 걸린 원은 모두에게 안개·🕶️·남은 시간 링이 보인다
  total: 6400,
  events: [
    boltAt(600, 1, 'darkness'), boltHit(600 + BOLT_HIT_MS, 1),
    { at: 600 + BOLT_HIT_MS, run: (fx, now) => fx.show({ id: 'darkness', t: 2, ms: 3000 }, now) },
  ],
  frame: (u) => ({ ...base, user: { x: 60, y: 75 }, other: { x: 200, y: 75 }, dark: { from: 600 + BOLT_HIT_MS, to: 600 + BOLT_HIT_MS + 3000, who: 'other' }, note: u > 1100 && u < 5200 ? 'a' : null }),
};
const CLEANSE_SCRIPT: Script = {
  // 정화: 독과 암흑에 걸린 원이 쓰면 둘 다 한꺼번에 풀리고 초록 테두리가 끊어져 떨어져 나간다
  total: 7000,
  events: [
    { at: 200, run: (fx, now) => fx.show({ id: 'poison', t: 1, stacks: 2, ms: 9000 }, now) },
    { at: 200, run: (fx, now) => fx.show({ id: 'darkness', t: 1, ms: 9000 }, now) },
    { at: 2800, run: (fx, now) => fx.show({ id: 'poisonEnd', t: 1 }, now) },
    { at: 2800, run: (fx, now) => fx.show({ id: 'cleanse', e: 1 }, now) },
  ],
  frame: (u) => ({ ...base, user: { x: 110, y: 75 }, other: { x: 215, y: 75 }, dark: { from: 200, to: 2800, who: 'user' }, note: u > 600 && u < 5600 ? 'a' : null }),
};

const SLOW_SCRIPT: Script = {
  // 슬로우: 맞으면 머리 위에 🧊 ×겹 수와 남은 초가 뜨고, 3초 안에 다시 맞으면 한 겹 더 쌓인다
  total: 7000,
  events: [
    boltAt(600, 1, 'slow'), boltHit(600 + BOLT_HIT_MS, 1),
    { at: 600 + BOLT_HIT_MS, run: (fx, now) => fx.show({ id: 'slow', t: 2, stacks: 1, ms: 3000 }, now) },
    boltAt(2200, 2, 'slow'), boltHit(2200 + BOLT_HIT_MS, 2),
    { at: 2200 + BOLT_HIT_MS, run: (fx, now) => fx.show({ id: 'slow', t: 2, stacks: 2, ms: 3000 }, now) },
    { at: 2200 + BOLT_HIT_MS + 3000, run: (fx, now) => fx.show({ id: 'slowEnd', t: 2 }, now) },
  ],
  frame: (u) => ({ ...base, user: { x: 60, y: 75 }, other: { x: 200, y: 75 }, note: u > 1100 && u < 5600 ? 'a' : null }),
};
const STUN_SCRIPT: Script = {
  // 스턴: 맞은 원은 머리 위에 별이 돌며 1초 동안 꼼짝 못 한다
  total: 5000,
  events: [
    boltAt(600, 1, 'stun'), boltHit(600 + BOLT_HIT_MS, 1),
    { at: 600 + BOLT_HIT_MS, run: (fx, now) => fx.show({ id: 'stun', t: 2, ms: 1000 }, now) },
  ],
  frame: (u) => ({ ...base, user: { x: 60, y: 75 }, other: { x: 200, y: 75 }, note: u > 1100 && u < 3800 ? 'a' : null }),
};
const FIREBALL_AT = [600, 750, 900], FIREBALL_FLY_MS = ((BOLT_TO - BOLT_FROM) / 300) * 1000;
const FIREBALL_SCRIPT: Script = {
  // 불꽃: 가장 가까운 상대를 노려 3발이 차례로 날아가 반드시 맞는다. 한 발마다 키워드 1개, 총 3개
  total: 5000,
  events: FIREBALL_AT.flatMap((at, i) => [
    { at, run: (fx: SkillFxLayer, now: number) => fx.show({ id: 'fireball', fid: i + 1, e: 1, t: 2, x: BOLT_FROM, y: 75, speed: 300 }, now) },
    { at: at + FIREBALL_FLY_MS, run: (fx: SkillFxLayer, now: number) => fx.show({ id: 'fireballEnd', fid: i + 1, hit: true, t: 2, x: BOLT_TO, y: 75 }, now) },
  ]),
  frame: (u) => ({ ...base, user: { x: 60, y: 75 }, other: { x: 200, y: 75 }, lostAt: u >= FIREBALL_AT[2] + FIREBALL_FLY_MS ? FIREBALL_AT[2] + FIREBALL_FLY_MS : null, note: u > 1300 && u < 3800 ? 'a' : null }),
};
const QUAKE_SCRIPT: Script = {
  // 충격파: 내 원 둘레로 붉은 충격파가 퍼져 닿은 원이 키워드 3개를 잃는다(밀어내지는 않는다)
  total: 4000,
  events: [{ at: 700, run: (fx, now) => fx.show({ id: 'quake', e: 1, x: 110, y: 75, r0: R, rMax: R * 5, speed: 120 }, now) }],
  frame: (u) => {
    const hitAt = 700 + ((65 - R) / 120) * 1000; // 고리 앞쪽이 상대 가장자리에 닿는 때
    return { ...base, user: { x: 110, y: 75 }, other: { x: 175, y: 75 }, lostAt: u >= hitAt ? hitAt : null, note: u > 900 && u < 3200 ? 'a' : null };
  },
};
const ABSORB_TICKS = [600, 1600, 2600]; // 이은 순간 1개, 1초 뒤 1개, 또 1초 뒤 1개
const ABSORB_SCRIPT: Script = {
  // 흡수: 사거리 안의 모든 원과 선이 이어지고, 이은 순간 1개, 이후 1초마다 1개씩 모두 3개를 빼앗는다
  total: 5600,
  events: [
    { at: 600, run: (fx, now) => fx.show({ id: 'absorb', e: 1, t: 2, ms: 3000, range: 200 }, now) },
    ...ABSORB_TICKS.map((at) => ({ at, run: (fx: SkillFxLayer, now: number) => fx.show({ id: 'absorbTick', e: 1, t: 2 }, now) })),
    { at: 3650, run: (fx, now) => fx.show({ id: 'absorbEnd', e: 1, t: 2 }, now) },
  ],
  frame: (u) => {
    const last = [...ABSORB_TICKS].reverse().find((at) => u >= at) ?? null;
    return { ...base, user: { x: 80, y: 75 }, other: { x: 190, y: 75 }, lostAt: last, note: u > 1000 && u < 4200 ? 'a' : null };
  },
};

const SCRIPTS: Record<DemoSkill, Script> = {
  ...BASE_SCRIPTS, poison: POISON_SCRIPT, darkness: DARKNESS_SCRIPT, cleanse: CLEANSE_SCRIPT,
  slow: SLOW_SCRIPT, stun: STUN_SCRIPT, fireball: FIREBALL_SCRIPT, quake: QUAKE_SCRIPT, absorb: ABSORB_SCRIPT,
};

type View = 'mine' | 'theirs';

/** 임시 캔버스에 그린 뒤 투명하게 올린다(거북이 그림이 알파를 직접 바꾸므로) */
let tmp: HTMLCanvasElement | null = null;
let darkTmp: HTMLCanvasElement | null = null; // 암흑 막을 따로 그려 구멍을 뚫는 임시 캔버스
function drawActor(ctx: CanvasRenderingContext2D, p: Pt, bg: string, alpha: number, ring: boolean, label: string, angle: number, labelAlpha = 1) {
  if (alpha <= 0.01) return;
  const size = 96, c = size / 2;
  tmp ??= document.createElement('canvas');
  if (tmp.width !== size * 2) { tmp.width = size * 2; tmp.height = size * 2; }
  const tc = tmp.getContext('2d')!;
  tc.setTransform(2, 0, 0, 2, 0, 0);
  tc.clearRect(0, 0, size, size);
  tc.fillStyle = bg;
  tc.beginPath(); tc.arc(c, c, R, 0, Math.PI * 2); tc.fill();
  drawTurtle(tc, c, c, R, 10, angle);
  tc.strokeStyle = '#11372a'; tc.lineWidth = borderLineWidth(R, null);
  tc.beginPath(); tc.arc(c, c, R, 0, Math.PI * 2); tc.stroke();
  if (ring) { tc.strokeStyle = '#ffffff'; tc.lineWidth = 2; tc.beginPath(); tc.arc(c, c, R + 4, 0, Math.PI * 2); tc.stroke(); }
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.drawImage(tmp, p.x - c, p.y - c, size, size);
  ctx.restore();
  if (label) {
    ctx.save();
    ctx.globalAlpha = Math.min(alpha, labelAlpha);
    ctx.font = '700 11px "Noto Sans KR", system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,0.75)'; ctx.strokeText(label, p.x, p.y + R + 6);
    ctx.fillStyle = '#eaf0f8'; ctx.fillText(label, p.x, p.y + R + 6);
    ctx.restore();
  }
}

function drawScene(ctx: CanvasRenderingContext2D, view: View, skill: DemoSkill, f: Frame, u: number, fx: SkillFxLayer, now: number) {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  const dpr = ctx.canvas.width / W;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = '#1f2a37'; ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = 'rgba(255,255,255,0.05)'; ctx.lineWidth = 1;
  for (let x = 0; x <= W; x += 28) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
  for (let y = 0; y <= H; y += 28) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }

  const userIsMe = view === 'mine';
  const userLabel = userIsMe ? t('guideArt.demoMe') : t('guideArt.demoFoe');
  const otherLabel = userIsMe ? t('guideArt.demoFoe') : t('guideArt.demoMe');
  const pos = (e: number) => (e === 1 ? { x: f.user.x, y: f.user.y, r: R } : { x: f.other.x, y: f.other.y, r: R });

  // 스킬을 쓰는 사람의 은신 진행도: 내 화면에는 반투명, 상대 화면에는 점점 사라진다
  const sp = skill === 'stealth' ? fx.stealthProgress(1, now) : 0;
  const userAlpha = sp <= 0 ? 1 : 1 + ((userIsMe ? 0.5 : 0) - 1) * sp;

  // 대시: 지나온 길을 따라 하늘색 꼬리와 빛
  if (skill === 'dash' && f.dash) {
    const age = u - f.dashAt, a = Math.min(1, age / 200) * Math.min(1, (1900 - u) / 300);
    ctx.save();
    ctx.strokeStyle = `rgba(127,219,255,${0.55 * a})`; ctx.lineWidth = R * 1.1; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(f.user.x - Math.min(70, age * 0.09 + 10), f.user.y); ctx.lineTo(f.user.x - 6, f.user.y); ctx.stroke();
    ctx.strokeStyle = `rgba(127,219,255,${0.4 * a})`; ctx.lineWidth = 5; ctx.beginPath(); ctx.arc(f.user.x, f.user.y, R + 7, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  }

  // 다른 원(밑)과 스킬 쓰는 원: 큰 원이 위로 오도록 순서는 고정
  drawActor(ctx, f.other, OTHER_BG, 1, !userIsMe, otherLabel, 0);
  drawActor(ctx, f.user, USER_BG, userAlpha, userIsMe, userLabel, 0, userAlpha < 1 ? 0 : 1);

  // 방패: 점선 고리와 남은 초
  if (f.shield > 0) {
    ctx.save();
    ctx.globalAlpha = Math.min(1, f.shield / 300) * 0.9;
    ctx.strokeStyle = '#4ade80'; ctx.lineWidth = 5.5; ctx.setLineDash([12, 7]); ctx.lineDashOffset = -now / 40;
    ctx.beginPath(); ctx.arc(f.user.x, f.user.y, R + 6, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(74,222,128,0.12)'; ctx.fill();
    ctx.globalAlpha = 1; ctx.font = '800 14px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,0.75)'; const lb = `🛡 ${Math.ceil(f.shield / 1000)}`;
    ctx.strokeText(lb, f.user.x, f.user.y - R - 8); ctx.fillStyle = '#fff'; ctx.fillText(lb, f.user.x, f.user.y - R - 8);
    ctx.restore();
  }

  // 실제 게임과 같은 충격파·갈고리·은신 고리 연출
  fx.drawActive(ctx, now, 1, (e) => pos(e));

  // 은신: 내 화면에는 점선 고리와 남은 초, 상대 화면에는 내(보는 사람) 원 위에 빨간 !
  if (skill === 'stealth') {
    const left = fx.stealthLeft(1, now);
    if (userIsMe && sp >= 1) {
      ctx.save(); ctx.strokeStyle = 'rgba(200,190,255,0.55)'; ctx.lineWidth = 2; ctx.setLineDash([7, 5]); ctx.lineDashOffset = -now / 30;
      ctx.beginPath(); ctx.arc(f.user.x, f.user.y, R + 5, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
      ctx.font = '800 13px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'; ctx.fillStyle = '#d8ccff';
      ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,0.75)'; const lb = `👻 ${Math.ceil(left / 1000)}`; ctx.strokeText(lb, f.user.x, f.user.y - R - 8); ctx.fillText(lb, f.user.x, f.user.y - R - 8);
      ctx.restore();
    }
    if (!userIsMe && sp >= 0.6) {
      const bx = f.other.x + R * 0.8 + 14, by = f.other.y - R * 0.8 - 14, br = 11 * (1 + Math.sin(now / 130) * 0.1);
      ctx.save(); ctx.fillStyle = '#e5322d'; ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(bx, by, br, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#fff'; ctx.font = `900 ${br * 1.6}px system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('!', bx, by + 1); ctx.restore();
    }
  }

  // 암흑에 걸린 사람의 화면: 자기 원 둘레(반지름 1.5배)만 보이고 나머지는 어두워진다(실제 게임의 drawDarkness와 같은 모양)
  if (f.dark && ((f.dark.who === 'user') === userIsMe) && u >= f.dark.from && u <= f.dark.to + 250) {
    const who = f.dark.who === 'user' ? f.user : f.other, k = Math.min(1, (u - f.dark.from) / 250, (f.dark.to + 250 - u) / 250);
    const hole = R * 1.5;
    // 어두운 막은 따로 그려 구멍을 뚫은 뒤 얹는다(그림 위에서 직접 뚫으면 아래 장면까지 지워진다)
    darkTmp ??= document.createElement('canvas');
    if (darkTmp.width !== ctx.canvas.width || darkTmp.height !== ctx.canvas.height) { darkTmp.width = ctx.canvas.width; darkTmp.height = ctx.canvas.height; }
    const dc = darkTmp.getContext('2d')!;
    dc.setTransform(1, 0, 0, 1, 0, 0); dc.clearRect(0, 0, darkTmp.width, darkTmp.height);
    dc.setTransform(dpr, 0, 0, dpr, 0, 0);
    dc.fillStyle = `rgba(8,5,16,${0.94 * k})`; dc.fillRect(0, 0, W, H);
    const g = dc.createRadialGradient(who.x, who.y, hole * 0.7, who.x, who.y, hole * 1.35);
    g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    dc.globalCompositeOperation = 'destination-out'; dc.fillStyle = g;
    dc.beginPath(); dc.arc(who.x, who.y, hole * 1.35, 0, Math.PI * 2); dc.fill();
    dc.globalCompositeOperation = 'source-over';
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(darkTmp, 0, 0); ctx.restore();
    // 구멍 안의 원은 다시 또렷하게
    ctx.save(); ctx.globalAlpha = k; ctx.beginPath(); ctx.arc(who.x, who.y, hole, 0, Math.PI * 2); ctx.clip();
    drawActor(ctx, who, f.dark.who === 'user' ? USER_BG : OTHER_BG, 1, who === f.user ? userIsMe : !userIsMe, who === f.user ? userLabel : otherLabel, 0); ctx.restore();
  }

  // 키워드를 잃게 하는 스킬(갈고리·독·화염구·충격파·흡수): 맞은 원 위로 "키워드 -N"(독·불꽃은 한꺼번에 잃어 개수만 보여 준다)
  const lose = skillDef(skill)?.demoLose ?? 0; // 잃는 개수(스킬 정의 game/skills.ts)
  if (lose > 0 && f.lostAt !== null) {
    const age = u - f.lostAt;
    if (age < 1800) {
      ctx.save(); ctx.globalAlpha = Math.min(1, age / 150) * Math.min(1, (1800 - age) / 400);
      ctx.font = '800 13px "Noto Sans KR", system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
      ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,0.8)'; ctx.fillStyle = '#ff8a8a';
      const txt = t(lose === 1 ? 'guideArt.demoLose' : `guideArt.demoLose${lose}`), y = f.other.y - R - 8 - age * 0.012;
      ctx.strokeText(txt, f.other.x, y); ctx.fillText(txt, f.other.x, y); ctx.restore();
    }
  }

  // 화면 위 안내 한 줄
  if (f.note) {
    const txt = t(`guideArt.demo_${skill}_${view}`);
    ctx.save(); ctx.font = '600 11.5px "Noto Sans KR", system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    const w = ctx.measureText(txt).width + 18;
    ctx.fillStyle = 'rgba(11,15,23,0.78)'; ctx.fillRect(W / 2 - w / 2, 6, w, 20);
    ctx.fillStyle = '#e8eefb'; ctx.fillText(txt, W / 2, 10); ctx.restore();
  }
  // 반복할 때 부드럽게 이어지도록 처음·끝은 어둡게
  const fade = Math.min(1, u / 250, (SCRIPTS[skill].total - u) / 300);
  if (fade < 1) { ctx.fillStyle = `rgba(31,42,55,${1 - fade})`; ctx.fillRect(0, 0, W, H); }
}

function Panel({ skill, view }: { skill: DemoSkill; view: View }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = W * dpr; canvas.height = H * dpr;
    const ctx = canvas.getContext('2d')!;
    const script = SCRIPTS[skill];
    const still = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    let fx = new SkillFxLayer(false);
    let start = performance.now(), fired = new Set<number>(), raf = 0, visible = true, lastLoop = 0;
    const reset = () => { start = performance.now(); fx = new SkillFxLayer(false); fired = new Set(); lastLoop = 0; };
    const render = (now: number) => {
      const elapsed = still ? 1700 : now - start;
      const u = still ? 1700 : elapsed % script.total;
      const loop = still ? 0 : Math.floor(elapsed / script.total);
      if (loop !== lastLoop) { lastLoop = loop; fx = new SkillFxLayer(false); fired = new Set(); } // 한 바퀴 돌면 연출 상태를 비우고 처음부터
      script.events.forEach((ev, i) => {
        const at = loop * script.total + ev.at;
        if (!fired.has(i) && elapsed >= at) { fired.add(i); ev.run(fx, at); }
      });
      drawScene(ctx, view, skill, script.frame(u), u, fx, elapsed);
    };
    const tick = (now: number) => { if (visible && !document.hidden) render(now); raf = requestAnimationFrame(tick); };
    if (still) render(performance.now()); // 모션 줄이기: 대표 장면 한 컷(이벤트가 지난 뒤)
    else raf = requestAnimationFrame(tick);
    const io = new IntersectionObserver((es) => { const v = es[0]?.isIntersecting ?? true; if (v && !visible) reset(); visible = v; });
    io.observe(canvas);
    return () => { cancelAnimationFrame(raf); io.disconnect(); };
  }, [skill, view]);
  return <canvas ref={ref} className="skill-demo-canvas" width={W} height={H} style={{ aspectRatio: `${W} / ${H}` }} aria-hidden="true" />;
}

/** 스킬 하나의 예시: 내 화면 / 상대 화면 두 장과 각각의 설명 */
export function SkillDemo({ skill }: { skill: DemoSkill }) {
  return (
    <div className="skill-demo" role="group" aria-label={t(`guideArt.demoAria_${skill}`)}>
      {(['mine', 'theirs'] as const).map((view) => (
        <figure key={view}>
          <Panel skill={skill} view={view} />
          <figcaption>
            <strong>{view === 'mine' ? t('guideArt.demoMine') : t('guideArt.demoTheirs')}</strong>
            <span className="muted small">{t(`guideArt.demoCap_${skill}_${view}`)}</span>
          </figcaption>
        </figure>
      ))}
    </div>
  );
}
