/** 스킬 연출(4.33) 공통: 좌표 타입, 한 종류의 연출을 한꺼번에 들고 있을 수 있는 개수, 씨앗 난수. 효과별 모듈(이 폴더)이 함께 쓴다. */

export type Pos = { x: number; y: number; r: number };
export type PosFn = (e: number, now: number) => Pos | null;

export const FX_CAP = 24;

/** 씨앗 하나로 같은 순서의 난수를 만든다(균열·파편 모양이 프레임마다 흔들리지 않게) */
export function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/** 연출 하나에 붙이는 씨앗(쓸 때마다 모양이 다르게) */
export function newSeed(): number { return Math.floor(Math.random() * 2 ** 31); }
