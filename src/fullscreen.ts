/**
 * 전체 화면(주소창 가리기). 브라우저는 사용자가 누르는 순간(제스처)이 아니면 전체 화면을 허락하지 않아서, 페이지를 열자마자 바꿀 수는 없고
 * 모바일에서 [시작]을 누르는 순간 켠다. 컴퓨터는 켜지 않는다(기본값). 아이폰 사파리는 전체 화면 기능이 없어 아무 일도 없다(홈 화면에 추가하면 주소창 없이 열린다).
 * 사용자가 ☰ 메뉴나 위쪽의 전체 화면 버튼으로 한 번 끄면 그 선택을 기억해서 다음부터 자동으로 켜지 않는다.
 */
const PREF_KEY = 'trendist.autoFullscreen';

/** 손가락으로 쓰는 기기(휴대폰·태블릿)인지. 마우스가 주 입력이면 false */
export const isTouchDevice = () => typeof window !== 'undefined' && !!window.matchMedia?.('(pointer: coarse)').matches;

export const canFullscreen = () => typeof document !== 'undefined' && !!document.fullscreenEnabled && !!document.documentElement.requestFullscreen;

export const autoFullscreenPref = (): boolean => { try { return localStorage.getItem(PREF_KEY) !== '0'; } catch { return true; } };
export const setAutoFullscreenPref = (on: boolean) => { try { localStorage.setItem(PREF_KEY, on ? '1' : '0'); } catch { /* 저장 못 해도 된다 */ } };

export function enterFullscreen() {
  if (!canFullscreen() || document.fullscreenElement) return;
  void document.documentElement.requestFullscreen({ navigationUI: 'hide' }).catch(() => { /* 거절돼도 게임은 그대로 한다 */ });
}

/** [시작]을 누르는 순간 부른다(제스처 안에서). 모바일이고 사용자가 끄지 않았을 때만 전체 화면으로 */
export function enterFullscreenOnStart() {
  if (isTouchDevice() && autoFullscreenPref()) enterFullscreen();
}
