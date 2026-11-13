/** 게임 화면(GameScreen)의 이 브라우저에만 기억하는 선택(미니맵·리더보드·채팅·조작 설명·오른쪽 영역)과 연결 품질 단계. */

/** 작은 화면(모바일, 가로 모드 폰 포함). 저장된 선택이 없을 때의 기본값을 화면을 덜 가리는 쪽으로 정하는 데 쓴다. */
function isSmallScreen() {
  try { return window.matchMedia('(max-width: 760px), (orientation: landscape) and (max-height: 520px) and (pointer: coarse)').matches; } catch { return false; }
}

/** 미니맵 켜짐 여부는 이 브라우저에만 기억한다. 저장소를 못 쓰면 기본값(켜짐). */
const MINIMAP_KEY = 'trendist.minimap';
/** PC에서 오른쪽 검색·보관함·플레이어 영역을 숨겼는지(이 브라우저에 기억한다). 모바일은 하단 시트라 이 값을 쓰지 않는다 */
const SIDE_HIDDEN_KEY = 'trendist.sideHidden';
export function loadSideHidden() {
  try { return localStorage.getItem(SIDE_HIDDEN_KEY) === '1'; } catch { return false; }
}
export function saveSideHidden(hidden: boolean) {
  try { localStorage.setItem(SIDE_HIDDEN_KEY, hidden ? '1' : '0'); } catch { /* 무시 */ }
}

export function loadMinimapPref() {
  try { return localStorage.getItem(MINIMAP_KEY) !== '0'; } catch { return true; }
}
export function saveMinimapPref(visible: boolean) {
  try { localStorage.setItem(MINIMAP_KEY, visible ? '1' : '0'); } catch { /* 무시 */ }
}

/** 리더보드 켜짐 여부도 이 브라우저에만 기억한다. 기본값은 켜짐, 모바일은 화면을 가리지 않게 꺼짐. */
const LEADERBOARD_KEY = 'trendist.leaderboard';
export function loadLeaderboardPref() {
  try { const v = localStorage.getItem(LEADERBOARD_KEY); return v === null ? !isSmallScreen() : v !== '0'; } catch { return !isSmallScreen(); }
}
export function saveLeaderboardPref(visible: boolean) {
  try { localStorage.setItem(LEADERBOARD_KEY, visible ? '1' : '0'); } catch { /* 무시 */ }
}

/** 채팅 켜짐·접힘 여부도 이 브라우저에만 기억한다. 처음 접속하면 PC·모바일 모두 접힌 채로 시작한다(한 줄 + 입력창). */
const CHAT_KEY = 'trendist.chat';
export type ChatView = 'open' | 'collapsed' | 'off';
export function loadChatView(): ChatView {
  const fallback: ChatView = 'collapsed'; // 처음 접속은 접힌 채로. 한 번 바꾸면 그 선택을 기억한다
  try { const v = localStorage.getItem(CHAT_KEY); return v === 'open' || v === 'collapsed' || v === 'off' ? v : fallback; } catch { return fallback; }
}
export function saveChatView(v: ChatView) {
  try { localStorage.setItem(CHAT_KEY, v); } catch { /* 무시 */ }
}

/** 조작 설명은 처음 들어오면 펼쳐 두고, 접으면 이 브라우저에 기억해서 다음부터는 접힌 채로 시작한다. */
const HELP_KEY = 'trendist.help';
export function loadHelpPref() {
  // 모바일은 조작 설명 카드가 화면을 많이 가려서 처음에도 접어 둔다([?]로 펼친다)
  try { const v = localStorage.getItem(HELP_KEY); return v === null ? !isSmallScreen() : v !== '0'; } catch { return !isSmallScreen(); }
}
export function saveHelpPref(open: boolean) {
  try { localStorage.setItem(HELP_KEY, open ? '1' : '0'); } catch { /* 무시 */ }
}

/**
 * 서버와의 왕복 시간(ms)을 네 단계로 나눈다. 서버가 초당 20번(50ms) 상태를 보내고 클라이언트가 내 움직임을 미리 그리며 보정하는 구조라
 * 80ms 안쪽은 차이를 못 느끼고, 150ms까지는 보정으로 자연스럽고, 250ms부터는 스킬·충돌 반응이 눈에 띄게 늦는다.
 */
export type PingQuality = 'good' | 'ok' | 'slow' | 'bad';
export const pingQuality = (ms: number): PingQuality => (ms <= 80 ? 'good' : ms <= 150 ? 'ok' : ms <= 250 ? 'slow' : 'bad');
