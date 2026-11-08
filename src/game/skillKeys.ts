import type { SkillInfo } from '../api/types';

/**
 * 스킬 단축키(4.33). 기본 키는 DB(skills.default_key)가 정하고, 사용자가 바꾼 키는 이 브라우저에 덧씌워 기억한다(`{스킬 코드: KeyboardEvent.code}`).
 * 지금은 바꾸는 화면이 없고 이 저장소만 읽는다. 키 설정 화면을 만들 때는 setKeyOverride로 저장하고 conflictOf로 겹침을 먼저 확인한다.
 * 키는 글자(key)가 아니라 물리 키(code)라서 한글 입력 상태에서도 된다.
 */
const KEY = 'trendist.skillKeys';

/** 스킬이 쓸 수 없는 키: 이미 다른 기능이 쓴다(이동, 이모트 E·미니맵 크게 보기 M, 채팅 입력 Enter·Esc·Tab) */
export const RESERVED_KEYS = new Set([
  'KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
  'KeyE', 'KeyM', 'Enter', 'Escape', 'Tab',
]);

export function loadKeyOverrides(): Record<string, string> {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '{}');
    return v && typeof v === 'object' ? v : {};
  } catch { return {}; }
}

/** 한 스킬의 키를 바꿔 저장한다(null이면 기본 키로 되돌린다) */
export function setKeyOverride(skillCode: string, code: string | null) {
  const cur = loadKeyOverrides();
  if (code === null) delete cur[skillCode]; else cur[skillCode] = code;
  try { localStorage.setItem(KEY, JSON.stringify(cur)); } catch { /* 이 브라우저에만 기억한다 */ }
}

/** 이 스킬을 쓰는 키(사용자가 바꾼 것이 있으면 그것, 없으면 DB 기본 키). 쓸 수 없는 키면 null */
export function effectiveKey(skill: Pick<SkillInfo, 'code' | 'defaultKey'>, overrides: Record<string, string> = loadKeyOverrides()): string | null {
  const key = overrides[skill.code] ?? skill.defaultKey;
  return key && !RESERVED_KEYS.has(key) ? key : null;
}

/** 숫자 줄의 키는 숫자패드로도 쓴다(Digit1 ↔ Numpad1) */
export function keyAliases(code: string): string[] {
  const m = /^Digit(\d)$/.exec(code);
  return m ? [code, `Numpad${m[1]}`] : [code];
}

/** 키 이름(버튼·툴팁에 보이는 글자): Digit1 → 1, KeyQ → Q, Space → ␣ */
export function keyLabel(code: string | null): string {
  if (!code) return '';
  if (code === 'Space') return '␣';
  const d = /^(?:Digit|Numpad)(\d)$/.exec(code);
  if (d) return d[1];
  const k = /^Key([A-Z])$/.exec(code);
  if (k) return k[1];
  return code.replace(/^Arrow/, '');
}

/** 같은 키를 두 스킬이 쓰거나 예약된 키를 고르면 겹치는 스킬 코드(또는 'reserved')를 돌려준다. 키 설정 화면에서 저장 전에 확인한다 */
export function conflictOf(skills: SkillInfo[], skillCode: string, code: string, overrides: Record<string, string> = loadKeyOverrides()): string | null {
  if (RESERVED_KEYS.has(code)) return 'reserved';
  const mine = new Set(keyAliases(code));
  for (const s of skills) {
    if (s.code === skillCode) continue;
    const k = effectiveKey(s, overrides);
    if (k && keyAliases(k).some((a) => mine.has(a))) return s.code;
  }
  return null;
}
