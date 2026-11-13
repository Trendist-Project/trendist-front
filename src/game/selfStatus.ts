/**
 * 내 원에 걸린 상태(4.33): 암흑·슬로우·스턴(서버 StatusEffects와 같은 종류)과 갈고리에 끌려옴. 서버가 나에게만 알려 주는 값(dark·slow·stun·pull)을
 * 종류 → {남은 초, 값} 하나의 표로 들고 있고, Arena가 내 위치 예측과 화면 가림에 쓴다. 남의 원에 걸린 상태 표시는 skillFx(skillfx/statuses)가 그린다.
 * 새 효과는 SelfKind에 더하고 걸기(start)·풀기(end)를 그대로 쓴다.
 */
export type SelfKind = 'darkness' | 'slow' | 'stun';
interface SelfEffect { left: number; value: number }

export class SelfStatus {
  /** 갈고리에 맞아 끌려오는 중: 남은 시간(초)과 쓴 원 번호. 그동안 입력으로 움직이지 않고 서버처럼 쓴 원 쪽으로 당겨진다 */
  pull: { left: number; byE: number } | null = null;
  private effects = new Map<SelfKind, SelfEffect>();

  /** kind에 ms 동안 걸렸다. value는 효과의 값(슬로우: 속도 배수) */
  start(kind: SelfKind, ms: number, value = 1) { this.effects.set(kind, { left: ms / 1000, value }); }
  /** kind가 풀렸다(정화) */
  end(kind: SelfKind) { this.effects.delete(kind); }
  /** 지금 걸려 있는지 */
  has(kind: SelfKind): boolean { return (this.effects.get(kind)?.left ?? 0) > 0; }
  /** 남은 시간(초) */
  left(kind: SelfKind): number { return this.effects.get(kind)?.left ?? 0; }

  get stunned(): boolean { return this.has('stun'); }
  /** 지금 이동 속도 배수(슬로우가 없으면 1). 대시 배수와 곱해서 쓴다 */
  speedMult(): number { return this.has('slow') ? this.effects.get('slow')!.value : 1; }

  /** 시간이 dt초 흘렀다: 걸린 효과의 남은 시간을 모두 줄이고 끝난 것은 뺀다 */
  tick(dt: number) {
    for (const [k, e] of this.effects) { e.left -= dt; if (e.left <= 0) this.effects.delete(k); }
  }

  /** 새 원이다(리스폰): 걸려 있던 상태를 모두 비운다 */
  reset() { this.pull = null; this.effects.clear(); }
}
