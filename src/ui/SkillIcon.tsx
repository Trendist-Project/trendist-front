import type { ReactNode } from 'react';

/**
 * 스킬 아이콘(4.33). 스킬마다 직접 그린 SVG이고(글자 이모지는 스킬 연출의 색·모양과 맞지 않아서), 색은 게임 안 연출과 같다:
 * 대시 하늘색 번개, 방패 초록, 갈고리 강철, 반발 청록 파문, 은신 연보라, 암흑 보라, 정화 하늘색 반짝임, 독 초록, 회복 초록 +,
 * 슬로우 얼음 파랑, 스턴 노랑, 불꽃 주황, 충격파 빨강(반발과 같은 모양), 흡수 자홍. 모두 글자 크기에 맞춰 1em(24×24 눈금).
 * 그림이 없는 스킬 코드는 DB의 이모지 글자를 그대로 쓴다. 그라데이션 id가 겹치지 않게 색은 겹쳐 칠해서 낸다.
 */
const DARK = '#1d222c';

function Svg({ children }: { children: ReactNode }) {
  return <svg className="skill-svg" viewBox="0 0 24 24" aria-hidden="true" focusable="false">{children}</svg>;
}

/** 별 경로(꼭짓점 n개, 바깥 반지름 ro, 안쪽 반지름 ri) */
function star(n: number, ro: number, ri: number, cx = 12, cy = 12): string {
  const pts: string[] = [];
  for (let i = 0; i < n * 2; i++) {
    const a = (Math.PI * i) / n - Math.PI / 2, r = i % 2 === 0 ? ro : ri;
    pts.push(`${(cx + Math.cos(a) * r).toFixed(2)},${(cy + Math.sin(a) * r).toFixed(2)}`);
  }
  return `M${pts.join('L')}Z`;
}
const STUN_BACK = star(5, 3.4, 1.55, 12, 8.4);                         // 고리 뒤쪽 별
const STUN_SIDE = star(5, 3.6, 1.65, 3.2, 13.4) + star(5, 3.6, 1.65, 20.8, 13.4); // 고리 양옆 별
const STUN_FRONT = star(5, 4.6, 2.1, 12, 17.2);                        // 고리 앞쪽 별(가장 크다)
const SNOW_ARMS = [0, 60, 120].map((deg) => {
  const a = (deg * Math.PI) / 180, dx = Math.cos(a), dy = Math.sin(a);
  const p = (d: number) => `${(12 + dx * d).toFixed(2)} ${(12 + dy * d).toFixed(2)}`;
  const side = (d: number, s: number, sign: number) => `M${p(d)}L${(12 + dx * (d + s) - dy * s * sign).toFixed(2)} ${(12 + dy * (d + s) + dx * s * sign).toFixed(2)}`;
  return `M${p(-9.4)}L${p(9.4)}${side(6, 2.4, 1)}${side(6, 2.4, -1)}${side(-6, -2.4, 1)}${side(-6, -2.4, -1)}`;
}).join('');

const ICONS: Record<string, () => ReactNode> = {
  // 대시: 하늘색 번개와 뒤로 흐르는 속도선
  dash: () => (
    <Svg>
      <path d="M2.5 8.5h5M1.5 12h4.5M3 15.5h5" stroke="#7fe3ff" strokeWidth="1.6" strokeLinecap="round" strokeOpacity="0.7" />
      <path d="M14.5 2.2L7.2 13.2h5.2L10.4 21.8l8.4-11.6h-5.4z" fill="#4dd2ff" stroke={DARK} strokeWidth="1.2" strokeLinejoin="round" />
      <path d="M14 4.8l-4.4 6.6h4.2" fill="none" stroke="#e8fbff" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  ),
  // 방패: 초록 방패와 가운데 능선, 윗면 반사광
  shield: () => (
    <Svg>
      <path d="M12 2.4l7.6 2.8v6.2c0 4.6-3.1 8-7.6 10.2-4.5-2.2-7.6-5.6-7.6-10.2V5.2z" fill="#34c759" stroke={DARK} strokeWidth="1.3" strokeLinejoin="round" />
      <path d="M12 2.4l7.6 2.8v6.2c0 4.6-3.1 8-7.6 10.2z" fill="#1f9d43" />
      <path d="M12 2.4l7.6 2.8v6.2c0 4.6-3.1 8-7.6 10.2-4.5-2.2-7.6-5.6-7.6-10.2V5.2z" fill="none" stroke={DARK} strokeWidth="1.3" strokeLinejoin="round" />
      <path d="M7 6.6l5-1.9" stroke="#d6ffe0" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M12 8.2v8.2M8.6 11.6h6.8" stroke="#eaffee" strokeWidth="1.6" strokeLinecap="round" />
    </Svg>
  ),
  // 갈고리: 강철 창끝과 이어진 쇠사슬(정면 고리와 옆면 막대가 번갈아)
  hook: () => (
    <Svg>
      <g stroke={DARK} strokeWidth="3" strokeLinecap="round" fill="none">
        <ellipse cx="5.2" cy="18.8" rx="2.6" ry="1.8" transform="rotate(-45 5.2 18.8)" />
        <path d="M8.6 14.7l1.7-1.7" />
        <ellipse cx="11.6" cy="12.4" rx="2.6" ry="1.8" transform="rotate(-45 11.6 12.4)" />
      </g>
      <g stroke="#b4bdcc" strokeWidth="1.4" strokeLinecap="round" fill="none">
        <ellipse cx="5.2" cy="18.8" rx="2.6" ry="1.8" transform="rotate(-45 5.2 18.8)" />
        <path d="M8.6 14.7l1.7-1.7" />
        <ellipse cx="11.6" cy="12.4" rx="2.6" ry="1.8" transform="rotate(-45 11.6 12.4)" />
      </g>
      <path d="M21.6 2.4L13.4 5.2l5.4 5.4z" fill="#e6ecf6" stroke={DARK} strokeWidth="1.2" strokeLinejoin="round" />
      <path d="M21.6 2.4l-8.2 2.8 2.7 2.7z" fill="#aab4c4" />
      <path d="M21.6 2.4l-8.2 2.8 5.4 5.4z" fill="none" stroke={DARK} strokeWidth="1.2" strokeLinejoin="round" />
      <path d="M13.8 10.6l1.8-1.8" stroke="#ff4664" strokeWidth="1.6" strokeLinecap="round" />
    </Svg>
  ),
  // 반발: 청록 파문(가운데에서 퍼져 나가는 매끄러운 고리)
  shockwave: () => (
    <Svg>
      <circle cx="12" cy="12" r="10.4" fill="none" stroke="#3ee0d0" strokeWidth="1.3" strokeOpacity="0.45" strokeDasharray="2.2 2.4" />
      <circle cx="12" cy="12" r="6.9" fill="#3ee0d0" fillOpacity="0.14" stroke="#3ee0d0" strokeWidth="2" strokeOpacity="0.9" />
      <circle cx="12" cy="12" r="3.1" fill="#e9fffc" stroke="#3ee0d0" strokeWidth="1.6" />
    </Svg>
  ),
  // 은신: 점선 윤곽의 유령(배경에 녹아드는 모양)
  stealth: () => (
    <Svg>
      <path d="M12 2.6c-4 0-6.5 3-6.5 7v10.4l2.5-2 2 2.4 2-2.4 2 2.4 2-2.4 2.5 2V9.6c0-4-2.5-7-6.5-7z" fill="#b9a8ff" fillOpacity="0.28" stroke="#b9a8ff" strokeWidth="1.6" strokeLinejoin="round" strokeDasharray="3 2" />
      <ellipse cx="9.4" cy="10.2" rx="1.3" ry="1.8" fill="#efe9ff" />
      <ellipse cx="14.6" cy="10.2" rx="1.3" ry="1.8" fill="#efe9ff" />
    </Svg>
  ),
  // 암흑: 어두운 구체와 보라 테두리, 가운데 선글라스
  darkness: () => (
    <Svg>
      <circle cx="12" cy="12" r="9.6" fill="#1b1030" stroke="#9a6bff" strokeWidth="1.6" />
      <circle cx="12" cy="12" r="9.6" fill="none" stroke="#9a6bff" strokeOpacity="0.4" strokeWidth="3" strokeDasharray="1.5 3" />
      <path d="M5.2 10.4h5.2c.3 2.8-.6 4.4-2.6 4.4s-3-1.7-2.6-4.4zM13.6 10.4h5.2c.4 2.7-.6 4.4-2.6 4.4s-2.9-1.6-2.6-4.4z" fill="#07030f" stroke="#c7a8ff" strokeWidth="1.2" strokeLinejoin="round" />
      <path d="M10.4 11.3q1.6-1 3.2 0" fill="none" stroke="#c7a8ff" strokeWidth="1.2" strokeLinecap="round" />
      <path d="M6.6 11.4l2 .3" stroke="#e9dcff" strokeWidth="0.9" strokeLinecap="round" />
    </Svg>
  ),
  // 정화: 하늘색 큰 반짝임과 작은 반짝임 둘
  cleanse: () => (
    <Svg>
      <path d="M11 2.6Q12 10.6 20 11.6Q12 12.6 11 20.6Q10 12.6 2 11.6Q10 10.6 11 2.6z" fill="#7fdcff" stroke={DARK} strokeWidth="1" strokeLinejoin="round" />
      <path d="M11 6.4Q11.6 10.8 15.6 11.6Q11.6 12.4 11 16.8Q10.4 12.4 6.4 11.6Q10.4 10.8 11 6.4z" fill="#effcff" />
      <path d="M18.6 14.6Q18.9 17.1 21.2 17.5Q18.9 17.9 18.6 20.4Q18.3 17.9 16 17.5Q18.3 17.1 18.6 14.6z" fill="#bfeeff" stroke="#3aa8d8" strokeWidth="0.6" strokeLinejoin="round" />
      <path d="M18 2.4Q18.2 4 19.8 4.2Q18.2 4.4 18 6Q17.8 4.4 16.2 4.2Q17.8 4 18 2.4z" fill="#effcff" />
    </Svg>
  ),
  // 독: 초록 해골
  poison: () => (
    <Svg>
      <path d="M12 2.8c-4.4 0-7 3-7 6.8 0 2.5 1.2 4.1 3 5.1V19h8v-3.3c1.8-1 3-2.6 3-5.1 0-3.8-2.6-6.8-7-6.8z" fill="#4cd964" stroke={DARK} strokeWidth="1.3" strokeLinejoin="round" />
      <path d="M12 2.8c4.4 0 7 3 7 6.8 0 2.5-1.2 4.1-3 5.1V19h-4z" fill="#2eab45" />
      <path d="M12 2.8c-4.4 0-7 3-7 6.8 0 2.5 1.2 4.1 3 5.1V19h8v-3.3c1.8-1 3-2.6 3-5.1 0-3.8-2.6-6.8-7-6.8z" fill="none" stroke={DARK} strokeWidth="1.3" strokeLinejoin="round" />
      <ellipse cx="9" cy="10.6" rx="2" ry="2.3" fill={DARK} />
      <ellipse cx="15" cy="10.6" rx="2" ry="2.3" fill={DARK} />
      <path d="M12 13.3l-1 1.9h2zM10.4 16.2v2.2M13.6 16.2v2.2" stroke={DARK} strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M7.4 5.6q1.6-1.6 3.6-1.8" stroke="#d6ffe0" strokeWidth="1.2" strokeLinecap="round" fill="none" />
    </Svg>
  ),
  // 슬로우: 얼음 결정(눈꽃)과 바깥 육각 고리
  slow: () => (
    <Svg>
      <path d={star(6, 10.6, 9.4)} fill="#7ec8ff" fillOpacity="0.18" stroke="#7ec8ff" strokeWidth="1.1" strokeLinejoin="round" />
      <path d={SNOW_ARMS} fill="none" stroke={DARK} strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
      <path d={SNOW_ARMS} fill="none" stroke="#a9deff" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="12" cy="12" r="2" fill="#f2fbff" stroke="#4aa8e8" strokeWidth="1" />
    </Svg>
  ),
  // 스턴: 별 셋이 타원 고리를 따라 도는 모양(머리 위에서 도는 그 별 고리만 남겨 단순하게)
  stun: () => (
    <Svg>
      <ellipse cx="12" cy="12.4" rx="9.6" ry="4.4" fill="none" stroke={DARK} strokeWidth="3.4" />
      <ellipse cx="12" cy="12.4" rx="9.6" ry="4.4" fill="none" stroke="#ffd84a" strokeWidth="1.7" />
      <path d={STUN_BACK} fill="#ffe97a" stroke={DARK} strokeWidth="1" strokeLinejoin="round" />
      <path d={STUN_SIDE} fill="#ffd84a" stroke={DARK} strokeWidth="1.1" strokeLinejoin="round" />
      <path d={STUN_FRONT} fill="#ffe14d" stroke={DARK} strokeWidth="1.2" strokeLinejoin="round" />
    </Svg>
  ),
  // 불꽃: 주황 불꽃 안에 노란 불꽃
  flame: () => (
    <Svg>
      <path d="M12.4 1.8c.6 3.6 5.6 5.6 5.6 11.4 0 4.6-2.7 8-6 8s-6-3-6-6.6c0-2.6 1.4-4.2 2.4-6 1 1.4 1.4 2.4 1.8 3.2.6-2.8.2-6.2 2.2-10z" fill="#ff8a1f" stroke={DARK} strokeWidth="1.3" strokeLinejoin="round" />
      <path d="M12 8.4c.4 2.4 3.4 3.8 3.4 7.4 0 2.6-1.6 4.6-3.4 4.6s-3.4-1.8-3.4-3.8c0-1.6.8-2.6 1.4-3.6.6 1 .9 1.6 1.2 2.1.4-1.8.1-4 .8-6.7z" fill="#ffe14d" />
      <path d="M12 14.6c.2 1.2 1.3 1.8 1.3 3.1 0 1-.6 1.8-1.3 1.8s-1.3-.7-1.3-1.5c0-.7.3-1.1.6-1.6.3.5.4.7.5.9.2-.7 0-1.6.2-2.7z" fill="#fffbe0" />
    </Svg>
  ),
  // 충격파: 반발과 같은 모양의 빨간 파문(안쪽은 비어 있다)
  quake: () => (
    <Svg>
      <circle cx="12" cy="12" r="10.4" fill="none" stroke="#ff4664" strokeWidth="1.3" strokeOpacity="0.45" strokeDasharray="2.2 2.4" />
      <circle cx="12" cy="12" r="6.9" fill="none" stroke="#ff4664" strokeWidth="2" strokeOpacity="0.9" />
      <circle cx="12" cy="12" r="3.1" fill="none" stroke="#ffe3e8" strokeWidth="1.6" />
    </Svg>
  ),
  // 흡수: 가운데 자홍 구체로 빨려 드는 화살표 넷과 점선 고리
  absorb: () => (
    <Svg>
      <circle cx="12" cy="12" r="10" fill="none" stroke="#d05cff" strokeWidth="1.2" strokeOpacity="0.5" strokeDasharray="2 2.6" />
      <path d="M12 2.6v4.2M12 21.4v-4.2M2.6 12h4.2M21.4 12h-4.2" stroke="#d05cff" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M9.9 4.6L12 7l2.1-2.4M9.9 19.4L12 17l2.1 2.4M4.6 9.9L7 12l-2.4 2.1M19.4 9.9L17 12l2.4 2.1" fill="none" stroke="#f1c4ff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="12" cy="12" r="3.9" fill="#a02bd6" stroke={DARK} strokeWidth="1.2" />
      <circle cx="12" cy="12" r="1.7" fill="#f6dcff" />
    </Svg>
  ),
};

/** 스킬 아이콘. 그림이 있는 스킬(위 목록)은 직접 그린 SVG, 없으면 DB의 이모지 글자(회복은 굵은 초록 + 모양을 CSS로 그린다) */
export function SkillIcon({ code, icon }: { code: string; icon: string | null | undefined }) {
  if (code === 'heal') return <i className="heal-plus" aria-hidden="true" />;
  const draw = ICONS[code];
  return draw ? <>{draw()}</> : <>{icon}</>;
}
