import type { Arena } from '../game/Arena';
import type { ServerMessage } from '../game/protocol';
import { t } from '../i18n';

/**
 * 내가 스킬에 걸렸을 때 서버가 나에게만 보내는 메시지(4.33): 암흑·슬로우·스턴·갈고리(끌려옴)와 그 해제, 스킬을 쓰지 못한 이유.
 * 게임 화면(GameScreen)의 메시지 처리에서 이 묶음만 떼어 둔 것이다. 아레나의 예측·가림을 바꾸고 안내를 띄우며, 스킬 버튼 잠금을 걸거나 푼다.
 */
export type SelfStatusMessage = Extract<ServerMessage, { type: 'dark' | 'darkEnd' | 'slow' | 'slowEnd' | 'stun' | 'stunEnd' | 'pull' | 'pullEnd' | 'skillFail' }>;

/** 스킬 버튼 잠금: 끌려오거나 스턴인 동안 스킬 버튼을 못 쓰는 모양으로 바꾼다 */
export interface SkillLock {
  /** ms + pad 동안 잠근다. extend면 이미 걸린 잠금보다 짧아지지 않게 한다 */
  hold(ms: number, pad: number, extend: boolean): void;
  /** 바로 푼다(정화) */
  release(): void;
}

export function handleSelfStatus(m: SelfStatusMessage, arena: Arena, lock: SkillLock, showToast: (msg: string) => void) {
  switch (m.type) {
    case 'skillFail': showToast(m.reason === 'level' ? t('gamescreen.skillLockedToast', { n: m.level ?? 0 }) : m.reason === 'unequipped' ? t('gamescreen.skillUnequippedToast') : m.reason === 'hpFull' ? t('gamescreen.skillHpFull') : m.reason === 'noTarget' ? t('gamescreen.skillNoTarget') : t('gamescreen.skillSafe')); break;
    case 'dark': arena.setDark(m.ms); showToast(t('gamescreen.darkened')); break; // 암흑에 맞았다(4.33)
    case 'darkEnd': arena.clearDark(); break; // 정화로 암흑이 풀렸다
    case 'slow': arena.startSlow(m.ms, m.mult); showToast(t('gamescreen.slowed')); break; // 슬로우에 맞았다: 예측도 같이 느려진다
    case 'slowEnd': arena.endSlow(); break; // 정화로 슬로우가 풀렸다
    case 'stun': // 스턴에 맞았다: 움직이지도 스킬을 쓰지도 못한다. 갈고리에 잡힌 때와 같이 스킬 버튼을 잠근다
      arena.startStun(m.ms); showToast(t('gamescreen.stunned'));
      lock.hold(m.ms, 100, true);
      break;
    case 'stunEnd': arena.endStun(); lock.release(); break; // 정화로 스턴이 풀렸다
    case 'pullEnd': arena.endPull(); lock.release(); break; // 정화로 갈고리에서 풀렸다
    case 'pull': // 갈고리에 끌려온다(4.33): 끌려오는 동안 스킬 버튼을 잠깐 못 쓰는 모양으로 바꾼다
      arena.startPull(m.ms, m.byE); showToast(t('gamescreen.hooked'));
      lock.hold(m.ms, 150, false);
      break;
  }
}
