import type { SkillInfo } from '../api/types';

/**
 * 프론트엔드의 스킬 정의 한 곳(4.33). 스킬 코드 목록과, 서버 목록(/api/skills)을 받기 전에 쓰는 기본값(아이콘·종류·키·쿨타임·해금 레벨·겨누기),
 * 가이드 그림 이름(한·영), 맞은 원 위에 뜨는 "키워드 -N" 개수를 함께 둔다. 서버 Room.SKILLS·시더 SKILL_ROWS와 같은 코드다.
 *
 * 새 스킬을 더하려면: ① 여기 SKILL_DEFS에 한 줄 ② 번역 i18n/<언어>/skills.ts의 <코드>_name·_desc, guideArt.ts의 demo…_<코드> 문구
 * ③ 그림이 있으면 SkillIcon의 ICONS, SkillDemo의 각본, 연출이 있으면 skillfx/. SkillCode 타입이 넓어지므로 빠뜨린 곳은 타입 검사가 알려 준다.
 */
export const SKILL_CODES = ['dash', 'invincibility', 'hook', 'slow', 'stealth', 'repel', 'cleanse', 'darkness', 'heal', 'poison', 'stun', 'quake', 'fireball', 'absorb',
  'root', 'amplify', 'fortify', 'silence', 'berserk', 'confuse', 'barrier'] as const;
export type SkillCode = (typeof SKILL_CODES)[number];
/** 아이콘 그림이 있는 스킬(모든 스킬) */
export type IconSkillCode = SkillCode;
/** 가이드에 움직이는 그림이 있는 스킬(회복은 그림이 없다) */
export type DemoSkillCode = Exclude<SkillCode, 'heal'>;

interface SkillDef extends SkillInfo {
  code: SkillCode;
  /** 가이드 글에 이 스킬을 가리키는 이모지(글자). 글에서 "이모지 + 스킬 이름"을 찾아 실제 스킬 아이콘으로 바꿔 그리는 데만 쓴다(ui/SkillText.tsx). 화면의 아이콘은 SkillIcon의 SVG다 */
  emoji: string;
  /** 가이드 본문의 움직이는 그림 이름(`[[스킬 …]]`, `[[skill …]]`). 없으면 그림이 없다(회복) */
  guideKo?: string;
  guideEn?: string;
  /** 가이드 그림에서 맞은 원 위에 뜨는 잃은 키워드 수(0이면 띄우지 않는다) */
  demoLose?: number;
}

export const SKILL_DEFS: SkillDef[] = [
  { code: 'dash', emoji: '⚡', category: 'UTILITY', defaultKey: 'Space', cooldownSeconds: 10, requiredLevel: 1, aimed: false, guideKo: '대시', guideEn: 'dash' },
  { code: 'invincibility', emoji: '🛡', category: 'DEFENSE', defaultKey: 'Digit1', cooldownSeconds: 30, requiredLevel: 4, aimed: false, guideKo: '무적', guideEn: 'invincible' },
  { code: 'hook', emoji: '🪝', category: 'ATTACK', defaultKey: 'Digit2', cooldownSeconds: 30, requiredLevel: 7, aimed: true, guideKo: '쇠창살', guideEn: 'hook', demoLose: 1 },
  { code: 'slow', emoji: '🧊', category: 'CC', defaultKey: 'Digit3', cooldownSeconds: 30, requiredLevel: 10, aimed: true, guideKo: '슬로우', guideEn: 'slow' },
  { code: 'stealth', emoji: '👻', category: 'UTILITY', defaultKey: 'Digit4', cooldownSeconds: 30, requiredLevel: 13, aimed: false, guideKo: '은신', guideEn: 'stealth' },
  { code: 'repel', emoji: '🌀', category: 'DEFENSE', defaultKey: 'Digit5', cooldownSeconds: 30, requiredLevel: 16, aimed: false, guideKo: '반발', guideEn: 'repel' },
  { code: 'cleanse', emoji: '✨', category: 'UTILITY', defaultKey: 'Digit7', cooldownSeconds: 30, requiredLevel: 22, aimed: false, guideKo: '정화', guideEn: 'cleanse' },
  { code: 'darkness', emoji: '🕶️', category: 'CC', defaultKey: 'Digit8', cooldownSeconds: 30, requiredLevel: 25, aimed: true, guideKo: '암흑', guideEn: 'darkness' },
  { code: 'heal', emoji: '➕', category: 'UTILITY', defaultKey: 'Digit0', cooldownSeconds: 60, requiredLevel: 31, aimed: false },
  { code: 'poison', emoji: '☠️', category: 'ATTACK', defaultKey: '', cooldownSeconds: 30, requiredLevel: 34, aimed: true, guideKo: '독', guideEn: 'poison', demoLose: 2 },
  { code: 'stun', emoji: '💫', category: 'CC', defaultKey: '', cooldownSeconds: 30, requiredLevel: 40, aimed: true, guideKo: '스턴', guideEn: 'stun' },
  { code: 'quake', emoji: '💥', category: 'ATTACK', defaultKey: '', cooldownSeconds: 30, requiredLevel: 46, aimed: false, guideKo: '충격파 키워드', guideEn: 'quake', demoLose: 3 },
  { code: 'fireball', emoji: '🔥', category: 'ATTACK', defaultKey: '', cooldownSeconds: 30, requiredLevel: 52, aimed: true, guideKo: '불꽃', guideEn: 'fireball', demoLose: 3 },
  { code: 'absorb', emoji: '🧲', category: 'ATTACK', defaultKey: '', cooldownSeconds: 30, requiredLevel: 58, aimed: false, guideKo: '흡수', guideEn: 'absorb', demoLose: 1 },
  // 아래 7개는 나중에 더한 스킬이다(서버 규칙은 BuffSkills·StatusEffects 등). 해금 순서는 4.33
  { code: 'root', emoji: '🌿', category: 'CC', defaultKey: 'Digit9', cooldownSeconds: 30, requiredLevel: 28, aimed: true, guideKo: '속박', guideEn: 'root' },
  { code: 'amplify', emoji: '⚔️', category: 'ATTACK', defaultKey: '', cooldownSeconds: 30, requiredLevel: 55, aimed: false, guideKo: '공격 증폭', guideEn: 'amplify' },
  { code: 'fortify', emoji: '🔰', category: 'DEFENSE', defaultKey: 'Digit6', cooldownSeconds: 30, requiredLevel: 19, aimed: false, guideKo: '피해 감소', guideEn: 'damage reduction' },
  { code: 'silence', emoji: '🔇', category: 'CC', defaultKey: '', cooldownSeconds: 30, requiredLevel: 43, aimed: true, guideKo: '침묵', guideEn: 'silence' },
  { code: 'berserk', emoji: '💢', category: 'ATTACK', defaultKey: '', cooldownSeconds: 1, requiredLevel: 61, aimed: false, guideKo: '광폭화', guideEn: 'berserk' },
  { code: 'confuse', emoji: '😵‍💫', category: 'CC', defaultKey: '', cooldownSeconds: 30, requiredLevel: 49, aimed: true, guideKo: '혼란', guideEn: 'confuse' },
  { code: 'barrier', emoji: '🫧', category: 'DEFENSE', defaultKey: '', cooldownSeconds: 30, requiredLevel: 37, aimed: false, guideKo: '보호막', guideEn: 'barrier' },
];

/** 서버 목록을 못 받았을 때(오프라인·서버 오류) 쓰는 기본 목록(해금 순서) */
export const FALLBACK_SKILLS: SkillInfo[] = [...SKILL_DEFS].sort((a, b) => a.requiredLevel - b.requiredLevel)
  .map(({ code, category, defaultKey, cooldownSeconds, requiredLevel, aimed }) => ({ code, category, defaultKey, cooldownSeconds, requiredLevel, aimed }));

/**
 * 바꾸기 전의 스킬 코드 → 지금 코드(서버 V63, Room.LEGACY_SKILL_CODES와 같다). 서버가 아직 옛 코드를 보내도(백엔드를 나중에 배포)
 * 이름·설명·아이콘·연출을 찾을 수 있게 서버에서 받은 코드는 모두 이것으로 바꿔 읽는다.
 */
const LEGACY_CODES: Record<string, SkillCode> = { shockwave: 'repel', flame: 'fireball' };
export function normalizeSkillCode<T extends string | null>(code: T): T {
  return (code !== null && LEGACY_CODES[code] ? LEGACY_CODES[code] : code) as T;
}

/** 옛 서버의 연출 id(shockwave·flame·flameEnd)를 지금 id로 바꾼다(필드는 같다) */
const LEGACY_FX: Record<string, string> = { shockwave: 'repel', flame: 'fireball', flameEnd: 'fireballEnd' };
export function normalizeFxId<T extends { id: string }>(fx: T): T {
  const id = LEGACY_FX[fx.id];
  return id ? { ...fx, id } : fx;
}

export function skillDef(code: string): SkillDef | undefined { return SKILL_DEFS.find((d) => d.code === code); }

/**
 * 가이드 그림 이름 → 스킬 코드. 한국어 `[[스킬 …]]`, 영어 `[[skill …]]` 둘 다 쓴다. 옛 본문 호환:
 * `[[스킬 충격파]]`·`[[skill shockwave]]`는 지금의 반발이고, `[[skill flame]]`은 화염구다.
 */
export const GUIDE_DEMOS: Record<string, DemoSkillCode> = (() => {
  const m: Record<string, DemoSkillCode> = { '[[스킬 충격파]]': 'repel', '[[skill shockwave]]': 'repel', '[[skill flame]]': 'fireball', '[[스킬 갈고리]]': 'hook' }; // 쇠창살은 이름을 바꾸기 전(갈고리) 표기도 받는다
  for (const d of SKILL_DEFS) {
    if (d.code === 'heal') continue;
    if (d.guideKo) m[`[[스킬 ${d.guideKo}]]`] = d.code as DemoSkillCode;
    if (d.guideEn) m[`[[skill ${d.guideEn}]]`] = d.code as DemoSkillCode;
  }
  return m;
})();
