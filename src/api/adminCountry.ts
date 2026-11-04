/**
 * 관리자 화면이 보는 나라(KR/GLOBAL). 게임의 나라 선택(trendist.country)과는 따로 저장한다
 * (관리자가 GLOBAL을 관리해도 게임 화면 언어가 바뀌면 안 된다). 바꾸면 페이지를 새로 읽어 모든 탭이 새 값을 쓴다.
 */
export type AdminCountry = 'KR' | 'GLOBAL';
export const ADMIN_COUNTRIES: AdminCountry[] = ['KR', 'GLOBAL'];
const KEY = 'trendist.admin.country';

export function getAdminCountry(): AdminCountry {
  try {
    const v = localStorage.getItem(KEY);
    if (v === 'KR' || v === 'GLOBAL') return v;
  } catch { /* 저장소를 못 쓰면 기본값 */ }
  return 'KR';
}

export function setAdminCountry(c: AdminCountry) {
  try { localStorage.setItem(KEY, c); } catch { /* 저장 실패는 무시 */ }
}
