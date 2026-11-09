import type { SkillInfo } from '../api/types';

/**
 * 스킬 단축키(4.33). 스킬은 장착 칸(슬롯 4개)에 끼워 쓰고, 키는 스킬이 아니라 **칸**에 묶인다: 1번 칸 = 1, 2번 칸 = 2 … (기본).
 * 키는 서버가 저장한다(`GET/PUT/DELETE /api/me/keybindings`: 바꾼 것만 저장하고 행이 없으면 서버의 기본 키). 이 파일은 서버가 알려 준 값을 들고 있는 곳이다.
 * 접속할 때 서버 값을 받아 쓰고(applyBindings), 같은 값을 이 브라우저(localStorage trendist.slotKeys)에도 복사해 둔다: 서버에 닿기 전에 빠르게 쓰고, 오프라인이어도 키가 먹게 하려는 것이다.
 * 키는 글자(key)가 아니라 물리 키(code)라서 한글 입력 상태에서도 된다. 대시는 장착과 상관없이 늘 쓰고 키만 바꿀 수 있다. 서버가 겹침을 최종으로 검사한다.
 */
const KEY = 'trendist.slotKeys';
const SYNCED = 'trendist.slotKeys.synced'; // 서버로 옮겨 준 적이 있으면 1

export const SLOT_COUNT = 4;
export const DEFAULT_SLOT_KEYS = ['Digit1', 'Digit2', 'Digit3', 'Digit4'];
export const DEFAULT_DASH_KEY = 'Space';
/** 스킬창을 여는 키 */
export const SKILL_WINDOW_KEY = 'KeyK';

/** 스킬이 쓸 수 없는 키: 이미 다른 기능이 쓴다(이동, 이모트 E·미니맵 M·스킬창 K, 채팅 입력 Enter·Esc·Tab). 서버의 keyboard_keys.reserved와 같다 */
export const RESERVED_KEYS = new Set([
  'KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
  'KeyE', 'KeyM', SKILL_WINDOW_KEY, 'Enter', 'Escape', 'Tab', 'F5', 'F11', 'F12',
]);

/** 칸별 키와 대시 키. 서버에서 비워 둔 칸은 빈 문자열('')이다 */
export interface SlotKeys { slots: string[]; dash: string }

const DEFAULTS: SlotKeys = { slots: [...DEFAULT_SLOT_KEYS], dash: DEFAULT_DASH_KEY };

function readStored(): Partial<{ slots: (string | null)[]; dash: string | null }> {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '{}');
    return v && typeof v === 'object' ? v : {};
  } catch { return {}; }
}

let current: SlotKeys | null = null; // 서버에서 받은(또는 이 브라우저에 복사해 둔) 지금 키

/** 지금 쓰는 키. 서버 값을 받은 뒤에는 그것, 아직이면 이 브라우저에 복사해 둔 값, 없으면 기본 키 */
export function loadSlotKeys(): SlotKeys {
  if (current) return current;
  const st = readStored();
  const ok = (k: unknown): k is string => typeof k === 'string' && k !== '' && !RESERVED_KEYS.has(k);
  current = {
    slots: DEFAULT_SLOT_KEYS.map((d, i) => (ok(st.slots?.[i]) ? (st.slots![i] as string) : d)),
    dash: ok(st.dash) ? st.dash : DEFAULT_DASH_KEY,
  };
  return current;
}

/** 지금 키를 바꾸고 이 브라우저에도 복사한다 */
export function cacheSlotKeys(keys: SlotKeys) {
  current = keys;
  try { localStorage.setItem(KEY, JSON.stringify({ slots: keys.slots.map((k) => k || null), dash: keys.dash || null })); } catch { /* 복사는 못 해도 된다 */ }
}

/** 서버가 준 동작별 키(skill_slot_1~4, dash)를 칸별 키로 바꾼다. 값이 없는 동작은 기본 키, 비워 둔 동작은 '' */
export function keysFromBindings(bindings: { action: string; key: string | null }[]): SlotKeys {
  const by = new Map(bindings.map((b) => [b.action, b.key]));
  const pick = (action: string, def: string) => (by.has(action) ? by.get(action) ?? '' : def);
  return { slots: DEFAULT_SLOT_KEYS.map((d, i) => pick(`skill_slot_${i + 1}`, d)), dash: pick('dash', DEFAULT_DASH_KEY) };
}

/** 칸 번호(0부터) 또는 'dash'의 서버 동작 코드 */
export function actionOf(target: number | 'dash'): string { return target === 'dash' ? 'dash' : `skill_slot_${target + 1}`; }

/** 기본 키(서버의 기본 키와 같다). 되돌리기 직후 서버 응답을 기다리는 동안 보여 준다 */
export function defaultSlotKeys(): SlotKeys { return { slots: [...DEFAULTS.slots], dash: DEFAULTS.dash }; }

/**
 * 서버로 옮겨야 할 옛 설정: 이 브라우저에만 저장돼 있던 키가 서버 값과 다르면 그 동작들을 돌려준다. 한 번 옮기면 다시 부르지 않게 표시한다.
 * (서버에 저장하는 방식으로 바뀌기 전에 바꾼 키를 잃지 않게, 처음 접속할 때 한 번만 올린다)
 */
export function legacyChanges(server: SlotKeys): { action: string; key: string }[] {
  try { if (localStorage.getItem(SYNCED) === '1') return []; } catch { return []; }
  const st = readStored();
  const out: { action: string; key: string }[] = [];
  DEFAULT_SLOT_KEYS.forEach((_, i) => { const k = st.slots?.[i]; if (k && !RESERVED_KEYS.has(k) && k !== server.slots[i]) out.push({ action: actionOf(i), key: k }); });
  if (st.dash && !RESERVED_KEYS.has(st.dash) && st.dash !== server.dash) out.push({ action: 'dash', key: st.dash });
  return out;
}
export function markLegacySynced() { try { localStorage.setItem(SYNCED, '1'); } catch { /* 무시 */ } }

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

/**
 * 이 키를 칸(slot 번호) 또는 대시('dash')에 묶어도 되는지. 예약된 키면 'reserved', 다른 칸이나 대시가 이미 쓰면 그 칸 번호(또는 'dash'), 괜찮으면 null.
 * 키 설정 화면에서 저장하기 전에 확인한다.
 */
export function conflictOf(target: number | 'dash', code: string, keys: SlotKeys = loadSlotKeys()): number | 'dash' | 'reserved' | null {
  if (RESERVED_KEYS.has(code)) return 'reserved';
  const mine = new Set(keyAliases(code));
  for (let i = 0; i < SLOT_COUNT; i++) {
    if (target !== i && keys.slots[i] && keyAliases(keys.slots[i]).some((a) => mine.has(a))) return i;
  }
  if (target !== 'dash' && keys.dash && keyAliases(keys.dash).some((a) => mine.has(a))) return 'dash';
  return null;
}

/** 눌린 키(code)가 가리키는 것: 칸 번호, 'dash', 아니면 null */
export function targetOfKey(code: string, keys: SlotKeys = loadSlotKeys()): number | 'dash' | null {
  for (let i = 0; i < SLOT_COUNT; i++) if (keys.slots[i] && keyAliases(keys.slots[i]).includes(code)) return i;
  return keys.dash && keyAliases(keys.dash).includes(code) ? 'dash' : null;
}

// 가이드 표처럼 칸 밖에서 "이 스킬은 무슨 키인가"를 보여 줄 때 쓴다. 게임 화면이 지금 장착을 알려 준다
let currentSlots: (string | null)[] = [null, null, null, null];
export function setCurrentSlots(slots: (string | null)[]) { currentSlots = slots; }

/** 이 스킬이 장착된 칸의 키(장착 안 했으면 null). 대시는 대시 키 */
export function effectiveKey(skill: Pick<SkillInfo, 'code'>): string | null {
  const keys = loadSlotKeys();
  if (skill.code === 'dash') return keys.dash;
  const i = currentSlots.indexOf(skill.code);
  return i >= 0 ? keys.slots[i] : null;
}
