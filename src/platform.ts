/**
 * 실행 환경 구분. 웹(기본)과 토스 미니앱(toss/ 폴더 빌드, VITE_PLATFORM=toss)이 같은 코드를 쓴다.
 * 웹은 게임과 같은 주소의 /api, /ws를 쓰고(Nginx·Vite가 백엔드로 넘긴다), 토스는 토스가 연 페이지라서
 * VITE_API_BASE(예: https://trendist.kr)의 절대 주소로 백엔드를 부른다.
 */
export const IS_TOSS = import.meta.env.VITE_PLATFORM === 'toss';

const API_BASE = ((import.meta.env.VITE_API_BASE as string | undefined) ?? '').replace(/\/+$/, '');

/** 백엔드 HTTP 주소. 웹은 path 그대로(같은 출처) */
export const apiUrl = (path: string) => API_BASE + path;

/** 백엔드 WebSocket 주소 */
export function wsUrl(path: string) {
  if (API_BASE) return API_BASE.replace(/^http/, 'ws') + path;
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  return `${proto}://${location.host}${path}`;
}

/**
 * 구글 로그인을 보여 줄지. 토스 웹뷰에서는 구글이 로그인을 막고(disallowed_useragent),
 * 방문자 ID·갱신 토큰 쿠키도 다른 출처라 오가지 않아서 토스에서는 게스트로만 플레이한다.
 */
export const loginEnabled = !IS_TOSS;
