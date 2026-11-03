import { useId } from 'react';

/** 제미나이 로고(네 갈래 반짝이 별, 파랑→보라→분홍 그라데이션). 크기는 글자 높이에 맞춘다 */
export function GeminiIcon({ size = 16 }: { size?: number }) {
  const id = useId();
  return (
    <svg className="gemini-icon" width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id={id} x1="3" y1="20" x2="21" y2="4" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#4285f4" />
          <stop offset="0.55" stopColor="#9b72cb" />
          <stop offset="1" stopColor="#d96570" />
        </linearGradient>
      </defs>
      <path fill={`url(#${id})`} d="M12 24A14.3 14.3 0 0 0 0 12 14.3 14.3 0 0 0 12 0a14.3 14.3 0 0 0 12 12 14.3 14.3 0 0 0-12 12" />
    </svg>
  );
}
