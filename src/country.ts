/**
 * 나라(방) 선택(4.18). KR=한국어, GLOBAL=영어. 나라가 곧 화면 언어다.
 * 선택은 브라우저에 저장한다. 처음이면 브라우저 언어가 한국어일 때 KR, 아니면 GLOBAL.
 */
export type Country = 'KR' | 'GLOBAL';
export type Lang = 'ko' | 'en';

export const COUNTRIES: Country[] = ['KR', 'GLOBAL'];
const KEY = 'trendist.country';
const listeners = new Set<() => void>();

function detect(): Country {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved === 'KR' || saved === 'GLOBAL') return saved;
  } catch { /* 저장소를 못 쓰면 브라우저 언어로 */ }
  return (navigator.language || '').toLowerCase().startsWith('ko') ? 'KR' : 'GLOBAL';
}

let current: Country = detect();
if (typeof document !== 'undefined') document.documentElement.lang = current === 'KR' ? 'ko' : 'en';

export const getCountry = (): Country => current;
export const langOf = (c: Country): Lang => (c === 'KR' ? 'ko' : 'en');
/** 관리자 화면은 선택한 나라와 상관없이 한국어로 고정한다(13절). 관리자 진입점에서만 부른다 */
let langOverride: Lang | null = null;
export const forceLang = (l: Lang) => { langOverride = l; document.documentElement.lang = l; };
export const getLang = (): Lang => langOverride ?? langOf(current);

export function setCountry(c: Country) {
  if (c === current) return;
  current = c;
  try { localStorage.setItem(KEY, c); } catch { /* 저장 실패는 무시 */ }
  document.documentElement.lang = langOf(c);
  listeners.forEach((l) => l());
}

export function subscribeCountry(l: () => void) {
  listeners.add(l);
  return () => { listeners.delete(l); };
}
