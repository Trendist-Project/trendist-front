/** 키워드 상태 배지와 남은 시간 표기. 검색 카드, 보관함, 키워드 상세 창이 같이 쓴다. */
export const STATE_BADGE: Record<string, string> = { 활성: '🔥활성', 비활성: '💤비활성', 금지: '⛔금지' };

export function remaining(iso: string) {
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return '곧 삭제';
  const h = Math.floor(ms / 3_600_000), m = Math.floor((ms % 3_600_000) / 60_000);
  return h > 0 ? `${h}시간 ${m}분 남음` : `${m}분 남음`;
}

/** "3분 전", "2시간 전", 하루가 넘으면 날짜. */
export function ago(iso: string) {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return '방금';
  if (s < 3600) return `${Math.floor(s / 60)}분 전`;
  if (s < 86400) return `${Math.floor(s / 3600)}시간 전`;
  return new Intl.DateTimeFormat('ko-KR', { month: 'short', day: 'numeric', timeZone: 'Asia/Seoul' }).format(new Date(iso));
}
