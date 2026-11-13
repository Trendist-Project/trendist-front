import type { SkillInfo } from '../api/types';
import koSkills from '../i18n/ko/skills';
import koGame from '../i18n/ko/gamescreen';

/**
 * 스킬 메타데이터를 읽는 한 곳(4.33): 종류 → 화면 키, 한국어 이름·종류 이름(관리자 화면용), 겨누는 스킬인지.
 * 스킬 버튼·스킬창·관리자 화면·게임 화면이 같은 표를 쓰게 해서 스킬을 늘릴 때 고칠 곳을 줄인다.
 */

/** 서버의 종류(skills.category) → 화면에서 쓰는 키(CSS cat-<키>, 번역 gamescreen.skillCat_<키>) */
const CATEGORY_KEY: Record<string, string> = { ATTACK: 'attack', DEFENSE: 'defense', CC: 'cc', UTILITY: 'utility' };

/** 스킬 종류의 화면 키. 모르는 종류면 유틸로 본다 */
export function categoryKey(category: string): string { return CATEGORY_KEY[category] ?? 'utility'; }

/** 스킬의 한국어 이름(번역 파일 skills.<코드>_name). 관리자 화면은 접속한 나라와 상관없이 한국어로 보여 준다. 없으면 코드 */
export function skillNameKo(code: string): string { return koSkills[`${code}_name`] ?? code; }

/** 스킬 종류의 한국어 이름(번역 파일 gamescreen.skillCat_<키>). 모르는 종류면 받은 값 그대로 */
export function categoryNameKo(category: string): string {
  const key = CATEGORY_KEY[category];
  return (key && (koGame as Record<string, string>)[`skillCat_${key}`]) || category;
}

/**
 * 스킬을 보낼 때 겨눈 지점을 함께 보내는 스킬인지. 서버 목록(/api/skills)의 aimed를 쓰고, 그 필드가 없는 옛 서버면 기본 목록(fallback)의 값을 쓴다.
 * 화염구는 서버가 그 지점에서 가장 가까운 상대를 고르고, 반발·충격파·흡수는 겨누지 않는다.
 */
export function isAimed(code: string, skills: SkillInfo[], fallback: SkillInfo[]): boolean {
  const s = skills.find((k) => k.code === code);
  if (s?.aimed !== undefined) return s.aimed;
  return fallback.find((k) => k.code === code)?.aimed ?? false;
}
