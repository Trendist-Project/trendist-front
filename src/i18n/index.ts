import { useSyncExternalStore } from 'react';
import { getCountry, getLang, subscribeCountry, type Lang } from '../country';

/**
 * 번역. 문구는 src/i18n/ko/<영역>.ts, src/i18n/en/<영역>.ts 에 키-문구로 둔다(영역마다 파일을 따로 둬서 동시에 고쳐도 겹치지 않는다).
 * 키는 '<영역>.<이름>' (파일 이름이 영역). 문구 안의 {name}은 t(key, { name })으로 채운다.
 * 영어에 키가 없으면 한국어로 대신 보여 준다(빠진 번역을 찾기 쉽게 콘솔에 경고).
 */
type Dict = Record<string, string>;

function load(mods: Record<string, { default: Dict }>): Dict {
  const out: Dict = {};
  for (const [path, mod] of Object.entries(mods)) {
    const ns = path.split('/').pop()!.replace(/\.ts$/, '');
    for (const [k, v] of Object.entries(mod.default)) out[`${ns}.${k}`] = v;
  }
  return out;
}

const dicts: Record<Lang, Dict> = {
  ko: load(import.meta.glob('./ko/*.ts', { eager: true }) as Record<string, { default: Dict }>),
  en: load(import.meta.glob('./en/*.ts', { eager: true }) as Record<string, { default: Dict }>),
};

export function t(key: string, params?: Record<string, string | number>): string {
  const lang = getLang();
  let s = dicts[lang][key];
  if (s === undefined) {
    if (import.meta.env.DEV) console.warn(`[i18n] missing ${lang}: ${key}`);
    s = dicts.ko[key] ?? key;
  }
  if (params) s = s.replace(/\{(\w+)\}/g, (m, n) => (n in params ? String(params[n]) : m));
  return s;
}

/** 나라(언어)가 바뀌면 컴포넌트를 다시 그린다. 최상위(App)에서 한 번 부르면 아래가 모두 다시 그려진다 */
export function useLang(): Lang {
  useSyncExternalStore(subscribeCountry, getCountry);
  return getLang();
}

/** 번역이 있으면 그것을(현재 언어 → 한국어), 없으면 fallback을 돌려준다. 경고 없이 쓴다(아직 번역을 안 넣은 새 스킬 같은 데이터가 코드로 들어올 때) */
export function tOr(key: string, fallback: string): string {
  return dicts[getLang()][key] ?? dicts.ko[key] ?? fallback;
}

/** 서버 오류: 코드에 맞는 번역(errors.<CODE>)이 있으면 그것을, 없으면 서버가 준 메시지를 쓴다 */
export function errorText(code: string, fallback: string): string {
  return dicts[getLang()][`errors.${code}`] ?? fallback;
}

/** 숫자·날짜는 언어에 맞는 형식으로 */
export const fmtNumber = (n: number) => n.toLocaleString(getLang() === 'ko' ? 'ko-KR' : 'en-US');
