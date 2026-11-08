/**
 * 전체 화면 켜기·끄기 아이콘. 글자(⛶·🗗)는 폰마다 글꼴에 없어 □나 ×로 깨져 보여서, 글꼴과 상관없이 그려지는 SVG로 그린다.
 * 켜기는 네 모서리가 바깥으로, 끄기는 안쪽으로 향한다. 색은 버튼 글자색(currentColor)을 따른다.
 */
export function FullscreenIcon({ exit = false, size = 20 }: { exit?: boolean; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      {exit
        ? <path d="M9 4v3a2 2 0 0 1-2 2H4M15 4v3a2 2 0 0 0 2 2h3M9 20v-3a2 2 0 0 0-2-2H4M15 20v-3a2 2 0 0 1 2-2h3" />
        : <path d="M4 9V6a2 2 0 0 1 2-2h3M20 9V6a2 2 0 0 0-2-2h-3M4 15v3a2 2 0 0 0 2 2h3M20 15v3a2 2 0 0 1-2 2h-3" />}
    </svg>
  );
}
