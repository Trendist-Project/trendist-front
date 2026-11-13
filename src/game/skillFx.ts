import type { SkillFx } from './protocol';
import type { PosFn } from './skillfx/common';
import { ShockFx } from './skillfx/shocks';
import { HookFx } from './skillfx/hooks';
import { BoltFx } from './skillfx/bolts';
import { StatusFx } from './skillfx/statuses';
import { FireballFx } from './skillfx/fireballs';
import { AbsorbFx } from './skillfx/absorbs';
import { StealthFx } from './skillfx/stealth';
import { CleanseFx } from './skillfx/cleanse';

export type { PosFn } from './skillfx/common';

/**
 * 스킬 연출(4.33): 반발·충격파·갈고리·은신·슬로우·스턴·화염구·흡수 등. 상태와 그리기만 맡고, 판정은 서버(Room)가 한다. 그림은 판정과 같은 크기로 그려 보는 쪽이 피할 수 있게 한다.
 * 이 클래스는 서버 신호(skillFx)를 효과별 모듈(skillfx 폴더)로 나눠 주고 정해진 순서로 그리게 하는 창구다. 효과의 상태와 그림은 모듈마다 따로 있다.
 */
export class SkillFxLayer {
  private readonly shocks: ShockFx;
  private readonly hooks: HookFx;
  private readonly bolts: BoltFx;
  private readonly statuses: StatusFx;
  private readonly fireballs: FireballFx;
  private readonly absorbs: AbsorbFx;
  private readonly stealth: StealthFx;
  private readonly cleanses: CleanseFx;

  constructor(reducedMotion: boolean) {
    this.shocks = new ShockFx(reducedMotion); this.hooks = new HookFx(reducedMotion); this.bolts = new BoltFx(reducedMotion);
    this.statuses = new StatusFx(reducedMotion); this.fireballs = new FireballFx(reducedMotion); this.absorbs = new AbsorbFx(reducedMotion);
    this.stealth = new StealthFx(reducedMotion); this.cleanses = new CleanseFx(reducedMotion);
  }

  clear() {
    this.shocks.clear(); this.hooks.clear(); this.stealth.clear(); this.bolts.clear(); this.statuses.clear();
    this.cleanses.clear(); this.fireballs.clear(); this.absorbs.clear();
  }

  show(fx: SkillFx, now: number) {
    switch (fx.id) {
      case 'repel': case 'quake': this.shocks.add(fx, now); break;
      case 'quakeHit': this.shocks.addHit(fx, now); break;
      case 'hook': this.hooks.add(fx, now); break;
      case 'hookHit': this.hooks.hit(fx, now); break;
      case 'hookEnd': this.hooks.end(fx, now); break;
      case 'stealth': this.stealth.start(fx.e, now, fx.ms); break;
      case 'stealthEnd': this.stealth.endStealth(fx.e, now); break;
      case 'bolt': this.bolts.add(fx, now); break;
      case 'boltEnd': this.bolts.end(fx, now); break;
      case 'poison': this.statuses.apply('poison', fx.t, now, fx.ms, fx.stacks); break;
      case 'poisonEnd': this.statuses.remove('poison', fx.t); break;
      case 'darkness': this.statuses.apply('darkness', fx.t, now, fx.ms); break;
      case 'slow': this.statuses.apply('slow', fx.t, now, fx.ms, fx.stacks); break;
      case 'slowEnd': this.statuses.remove('slow', fx.t); break;
      case 'stun': this.statuses.apply('stun', fx.t, now, fx.ms); break;
      case 'stunEnd': this.statuses.remove('stun', fx.t); break;
      case 'fireball': this.fireballs.add(fx, now); break;
      case 'fireballEnd': { const hit = this.fireballs.end(fx); if (hit) this.bolts.addBurst(hit.x, hit.y, 'fireball', now); break; }
      case 'absorb': this.absorbs.add(fx, now); break;
      case 'absorbTick': this.absorbs.tick(fx, now); break;
      case 'absorbEnd': this.absorbs.end(fx); break;
      case 'cleanse':
        this.statuses.cleanse(fx.e);
        this.absorbs.cleanse(fx.e);
        this.cleanses.add(fx.e, now);
        break;
    }
  }

  /** 은신(유령) 진행도: 0 = 보통, 1 = 완전히 은신(자세한 설명은 StealthFx.stealthProgress) */
  stealthProgress(e: number, now: number): number { return this.stealth.stealthProgress(e, now); }

  /** 은신이 끝날 때까지 남은 ms(은신 중이 아니면 0) */
  stealthLeft(e: number, now: number): number { return this.stealth.stealthLeft(e, now); }

  /** 내 은신 중인 원 둘레에 일렁이는 점선 고리: 내가 은신 중이라는 표시(남에게는 보이지 않는다) */
  drawStealthRing(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, now: number, z: number) { this.stealth.drawStealthRing(ctx, x, y, r, now, z); }

  /** 반발·충격파·갈고리·투사체·상태 표시: 원 위에 그린다(순서가 겹치는 순서다) */
  drawActive(ctx: CanvasRenderingContext2D, now: number, z: number, pos: PosFn) {
    this.shocks.drawShocks(ctx, now, z);
    this.hooks.drawHooks(ctx, now, z, pos);
    this.stealth.drawPuffs(ctx, now, z, pos);
    this.bolts.drawBolts(ctx, now, z);
    this.fireballs.draw(ctx, now, z, pos);
    this.absorbs.drawAbsorbs(ctx, now, z, pos);
    this.statuses.draw(ctx, now, z, pos); // 독·슬로우·스턴·암흑
    this.cleanses.drawCleanses(ctx, now, z, pos);
    this.shocks.drawQuakeHits(ctx, now, z, pos);
  }
}
