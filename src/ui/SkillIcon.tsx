import type { ReactNode } from 'react';
import type { IconSkillCode } from '../game/skills';

/**
 * 스킬 아이콘(4.33). 스킬마다 직접 그린 SVG이고(글자 이모지는 스킬 연출의 색·모양과 맞지 않아서), 색은 게임 안 연출과 같다:
 * 대시 하늘색 번개, 무적 금빛 방패·별, 갈고리 강철, 반발 청록 파문, 은신 연보라, 암흑 보라, 정화 하늘색 반짝임, 독 초록, 회복 에메랄드 메달 속 십자,
 * 슬로우 얼음 파랑, 스턴 노랑, 불꽃 주황, 충격파 빨강(반발과 같은 모양), 흡수 자홍. 모두 글자 크기에 맞춰 1em(24×24 눈금).
 * 아직 서버에 없는 예정 스킬: 속박 갈색 뿌리, 공격 증폭 진홍 ×2, 피해 감소 남색 갑옷 ½, 침묵 잠긴 스킬 칸(붉은 자물쇠), 광폭화 불길에 휩싸인 심장, 혼란 분홍 나선, 보호막 청록 구체.
 * 그림이 없는 스킬 코드는 물음표 원을 보인다(스킬의 아이콘은 DB에 두지 않고 이 SVG가 전부다). 그라데이션 id가 겹치지 않게 색은 겹쳐 칠해서 낸다.
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

/** 그림이 있는 스킬(코드는 game/skills.ts) */
const ICONS: Record<IconSkillCode, () => ReactNode> = {
  // 대시: 하늘색 번개와 뒤로 흐르는 속도선
  dash: () => (
    <Svg>
      <path d="M2.5 8.5h5M1.5 12h4.5M3 15.5h5" stroke="#7fe3ff" strokeWidth="1.6" strokeLinecap="round" strokeOpacity="0.7" />
      <path d="M14.5 2.2L7.2 13.2h5.2L10.4 21.8l8.4-11.6h-5.4z" fill="#4dd2ff" stroke={DARK} strokeWidth="1.2" strokeLinejoin="round" />
      <path d="M14 4.8l-4.4 6.6h4.2" fill="none" stroke="#e8fbff" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  ),
  // 무적: 금빛 방패와 가운데 흰 별, 뒤로 퍼지는 빛살과 반짝임(어떤 공격도 통하지 않는 느낌)
  invincibility: () => (
    <Svg>
      <circle cx="12" cy="12" r="11" fill="#ffd34e" fillOpacity="0.2" />
      <path d="M12 .6v2.4M12 21v2.4M.6 12H3M21 12h2.4M3.9 3.9l1.7 1.7M18.4 18.4l1.7 1.7M3.9 20.1l1.7-1.7M18.4 5.6l1.7-1.7" stroke="#ffe58a" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M12 3l7.2 2.6v5.8c0 4.3-2.9 7.4-7.2 9.5-4.3-2.1-7.2-5.2-7.2-9.5V5.6z" fill="#f6b719" />
      <path d="M12 3l7.2 2.6v5.8c0 4.3-2.9 7.4-7.2 9.5z" fill="#d38a0a" />
      <path d="M12 3l7.2 2.6v5.8c0 4.3-2.9 7.4-7.2 9.5-4.3-2.1-7.2-5.2-7.2-9.5V5.6z" fill="none" stroke={DARK} strokeWidth="1.3" strokeLinejoin="round" />
      <path d="M12 5.2l5 1.8v4.4c0 3.1-2 5.4-5 7-3-1.6-5-3.9-5-7V7z" fill="#ffd95e" stroke="#fff3bf" strokeWidth="0.8" strokeLinejoin="round" />
      <path d={star(5, 4.3, 1.8, 12, 11.7)} fill="#fff" stroke="#b8760a" strokeWidth="0.9" strokeLinejoin="round" />
      <path d="M7.4 6.8l3.6-1.3" stroke="#fffbe6" strokeWidth="1.3" strokeLinecap="round" />
      <path d="M19.6 14.6q.3 1.7 1.9 2-1.6.3-1.9 2-.3-1.7-1.9-2 1.6-.3 1.9-2z" fill="#fff6c9" />
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
  repel: () => (
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
  // 불꽃(화염구): 화염구 세 개가 꼬리를 끌며 오른쪽 위로 날아간다
  fireball: () => (
    <Svg>
      <g transform="translate(10 5.2) scale(0.62)">
        <path d="M-1 -4.6C-6 -4.8-10 -3.2-13.6-1.6c3 .6 5 1 6.6 1.6-2.4 1.2-4.6 1.6-7 3.4 4 .2 7.4-.4 10.4-1.6 2 1.6 4.4 1.6 5.8.2z" fill="#ff8a1f" stroke={DARK} strokeWidth="1.5" strokeLinejoin="round" />
        <circle cx="0" cy="0" r="4.8" fill="#ff8a1f" stroke={DARK} strokeWidth="1.5" />
        <circle cx="0.6" cy="0" r="3.1" fill="#ffe14d" />
        <circle cx="1.2" cy="-.2" r="1.6" fill="#fffbe0" />
      </g>
      <g transform="translate(19.4 12) scale(0.82)">
        <path d="M-1 -4.6C-6 -4.8-10 -3.2-13.6-1.6c3 .6 5 1 6.6 1.6-2.4 1.2-4.6 1.6-7 3.4 4 .2 7.4-.4 10.4-1.6 2 1.6 4.4 1.6 5.8.2z" fill="#ff8a1f" stroke={DARK} strokeWidth="1.5" strokeLinejoin="round" />
        <circle cx="0" cy="0" r="4.8" fill="#ff8a1f" stroke={DARK} strokeWidth="1.5" />
        <circle cx="0.6" cy="0" r="3.1" fill="#ffe14d" />
        <circle cx="1.2" cy="-.2" r="1.6" fill="#fffbe0" />
      </g>
      <g transform="translate(9.6 19.6) scale(0.7)">
        <path d="M-1 -4.6C-6 -4.8-10 -3.2-13.6-1.6c3 .6 5 1 6.6 1.6-2.4 1.2-4.6 1.6-7 3.4 4 .2 7.4-.4 10.4-1.6 2 1.6 4.4 1.6 5.8.2z" fill="#ff8a1f" stroke={DARK} strokeWidth="1.5" strokeLinejoin="round" />
        <circle cx="0" cy="0" r="4.8" fill="#ff8a1f" stroke={DARK} strokeWidth="1.5" />
        <circle cx="0.6" cy="0" r="3.1" fill="#ffe14d" />
        <circle cx="1.2" cy="-.2" r="1.6" fill="#fffbe0" />
      </g>
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
  // 회복: 금테 두른 짙은 에메랄드 메달 안에 입체 십자와 반짝임
  heal: () => (
    <Svg>
      <circle cx="12" cy="12" r="10.6" fill="#05381b" stroke="#f1c75b" strokeWidth="1.6" />
      <circle cx="12" cy="12" r="8.6" fill="#0a5a2b" stroke="#1fa25a" strokeWidth="0.8" />
      <path d="M12 3.4a8.6 8.6 0 0 1 6.9 3.5" fill="none" stroke="#6fe3a0" strokeWidth="1.1" strokeLinecap="round" strokeOpacity="0.8" />
      <path d="M9.4 6h5.2v3.4H18v5.2h-3.4V18H9.4v-3.4H6V9.4h3.4z" fill="#10a346" stroke={DARK} strokeWidth="1.2" strokeLinejoin="round" />
      <path d="M9.4 6h5.2M9.4 6v3.4H6" fill="none" stroke="#7bf0a8" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M14.6 18v-3.4H18M14.6 18H9.4" fill="none" stroke="#06702c" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M10.8 8.2h1.6" stroke="#d9ffe6" strokeWidth="1.1" strokeLinecap="round" />
      <path d="M18.4 3.2q.3 1.9 2.1 2.2-1.8.3-2.1 2.2-.3-1.9-2.1-2.2 1.8-.3 2.1-2.2z" fill="#fff3bd" stroke="#c9972a" strokeWidth="0.4" strokeLinejoin="round" />
    </Svg>
  ),
  // 속박: 가운데 원을 쇠사슬 네 줄이 네 모서리의 말뚝으로 팽팽히 당겨 한자리에 묶어 둔 모양(원 둘레에는 쇠 족쇄 고리)
  root: () => (
    <Svg>
      <g stroke={DARK} strokeLinejoin="round" strokeLinecap="round">
        {/* 팽팽한 쇠사슬 네 줄: 마디가 번갈아 서 있다 */}
        {[[7.2, 7.2, 3.4, 3.4], [16.8, 7.2, 20.6, 3.4], [7.2, 16.8, 3.4, 20.6], [16.8, 16.8, 20.6, 20.6]].map(([x1, y1, x2, y2], k) => (
          <g key={k}>
            <path d={`M${x1} ${y1}L${x2} ${y2}`} strokeWidth="3.4" />
            <path d={`M${x1} ${y1}L${x2} ${y2}`} stroke="#b9c4d4" strokeWidth="2" strokeDasharray="1.7 1.1" />
          </g>
        ))}
        {/* 모서리 말뚝(박힌 쇠못: 고리 눈이 달렸다) */}
        {[[3.4, 3.4], [20.6, 3.4], [3.4, 20.6], [20.6, 20.6]].map(([x, y], k) => (
          <g key={k}>
            <circle cx={x} cy={y} r="2.5" fill="#8a5a1e" strokeWidth="1.2" />
            <circle cx={x} cy={y} r="1" fill="#e8c58a" strokeWidth="0.6" />
          </g>
        ))}
        {/* 묶인 원과 족쇄 고리 */}
        <circle cx="12" cy="12" r="5.6" fill="#4cc38a" strokeWidth="1.4" />
        <circle cx="12" cy="12" r="5.6" fill="none" stroke="#c4cedd" strokeWidth="2.2" />
        <circle cx="12" cy="12" r="5.6" fill="none" stroke="#6b7a90" strokeWidth="0.8" strokeDasharray="1.2 2.2" />
        <rect x="10.3" y="10.6" width="3.4" height="3" rx="0.7" fill="#ffd25a" strokeWidth="1" />
        <path d="M11 10.6V9.6a1 1 0 0 1 2 0v1" fill="none" strokeWidth="1.1" stroke="#c4cedd" />
      </g>
    </Svg>
  ),
  // 공격 증폭: 붉은 기운이 솟구치는 검 — 날 위로 겹쳐 오르는 두 줄 화살표(힘이 배로 커진다)
  amplify: () => (
    <Svg>
      <path d={star(12, 11.4, 7.4)} fill="#ff2f45" stroke={DARK} strokeWidth="1.3" strokeLinejoin="round" />
      <path d={star(12, 9, 6)} fill="#ff7a3c" />
      <path d="M12 1.8l2.6 3.6v9.6h-5.2V5.4z" fill="#e9eef7" stroke={DARK} strokeWidth="1.2" strokeLinejoin="round" />
      <path d="M12 1.8l2.6 3.6v9.6H12z" fill="#aeb9cc" />
      <path d="M12 4v10.4" stroke="#fff" strokeWidth="0.8" strokeLinecap="round" />
      <rect x="6.4" y="14.6" width="11.2" height="2.6" rx="1.3" fill="#ffc83a" stroke={DARK} strokeWidth="1.1" />
      <rect x="10.6" y="17.2" width="2.8" height="3.6" fill="#7a3b1c" stroke={DARK} strokeWidth="1" />
      <circle cx="12" cy="22" r="1.6" fill="#ffc83a" stroke={DARK} strokeWidth="1" />
      <path d="M3.4 11l2-2 2 2M3.4 7.6l2-2 2 2M16.6 11l2-2 2 2M16.6 7.6l2-2 2 2" fill="none" stroke={DARK} strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M3.4 11l2-2 2 2M3.4 7.6l2-2 2 2M16.6 11l2-2 2 2M16.6 7.6l2-2 2 2" fill="none" stroke="#ffe27a" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  ),
  // 피해 감소: 겹겹이 덧댄 남색 방패 — 날아오는 충격이 가운데 보석에서 튕겨 나간다
  fortify: () => (
    <Svg>
      <path d="M12 1.8l9 3v6.8c0 5-3.6 8.8-9 10.8-5.4-2-9-5.8-9-10.8V4.8z" fill="#9fb0ff" stroke={DARK} strokeWidth="1.4" strokeLinejoin="round" />
      <path d="M12 3.6l7.2 2.4v5.6c0 4-2.8 7.2-7.2 8.9-4.4-1.7-7.2-4.9-7.2-8.9V6z" fill="#4a5ce0" />
      <path d="M12 3.6l7.2 2.4v5.6c0 4-2.8 7.2-7.2 8.9z" fill="#2f3c9e" />
      <path d="M12 3.6v16.9M4.8 11.4h14.4" stroke="#aeb9ff" strokeWidth="0.9" strokeOpacity="0.7" />
      <path d="M12 3.6l7.2 2.4v5.6c0 4-2.8 7.2-7.2 8.9-4.4-1.7-7.2-4.9-7.2-8.9V6z" fill="none" stroke={DARK} strokeWidth="1.1" strokeLinejoin="round" />
      <path d="M12 7.6l3.6 2v4l-3.6 2.2-3.6-2.2v-4z" fill="#ffd54a" stroke={DARK} strokeWidth="1.1" strokeLinejoin="round" />
      <path d="M12 7.6l3.6 2L12 11.8 8.4 9.6z" fill="#fff3b0" />
      <path d="M6 5.4l5-1.4" stroke="#e6eaff" strokeWidth="1.4" strokeLinecap="round" />
    </Svg>
  ),
  // 침묵: 스킬 칸(번개가 든 둥근 사각형)에 붉은 자물쇠가 채워지고 금지 사선이 그어진 모양
  silence: () => (
    <Svg>
      <rect x="2.4" y="2.4" width="16.6" height="16.6" rx="4" fill="#242a3a" stroke="#cdd5e4" strokeWidth="1.6" />
      <path d="M11.8 5.2L6.6 11.8h3.4L8.8 17l5.2-6.8h-3.4z" fill="#7a8398" stroke={DARK} strokeWidth="0.9" strokeLinejoin="round" />
      <path d="M4.6 4.6l11 11" stroke={DARK} strokeWidth="3.4" strokeLinecap="round" />
      <path d="M4.6 4.6l11 11" stroke="#ff5a6e" strokeWidth="1.9" strokeLinecap="round" />
      <path d="M15 14.2v-1.6a3 3 0 0 1 6 0v1.6" fill="none" stroke={DARK} strokeWidth="3" strokeLinecap="round" />
      <path d="M15 14.2v-1.6a3 3 0 0 1 6 0v1.6" fill="none" stroke="#e1e7f2" strokeWidth="1.5" strokeLinecap="round" />
      <rect x="12.8" y="14" width="10.4" height="8.4" rx="2" fill="#e5384d" stroke={DARK} strokeWidth="1.3" />
      <circle cx="18" cy="17.4" r="1.2" fill={DARK} />
      <path d="M18 17.6v2.2" stroke={DARK} strokeWidth="1.2" strokeLinecap="round" />
      <path d="M14.2 15.2h2" stroke="#ffc2ca" strokeWidth="1" strokeLinecap="round" />
    </Svg>
  ),
  // 광폭화: 연쇄 폭발 — 한가운데 큰 폭발에서 충격이 번져 둘레로 작은 폭발이 잇달아 터진다
  berserk: () => (
    <Svg>
      <path d="M8 8.4L5.6 6.2M16 8.8l2-1.8M16.4 15.8l1.8 1.8M7.8 15.6l-2 1.8" stroke={DARK} strokeWidth="3.2" strokeLinecap="round" />
      <path d="M8 8.4L5.6 6.2M16 8.8l2-1.8M16.4 15.8l1.8 1.8M7.8 15.6l-2 1.8" stroke="#ff7a1c" strokeWidth="1.6" strokeLinecap="round" />
      <path d={star(9, 3.6, 2.1, 5, 5.4)} fill="#ff4a1c" stroke={DARK} strokeWidth="1.1" strokeLinejoin="round" />
      <path d={star(9, 2.23, 1.26, 5, 5.4)} fill="#ffd24a" />
      <path d={star(9, 3.4, 1.9, 19, 6)} fill="#ff4a1c" stroke={DARK} strokeWidth="1.1" strokeLinejoin="round" />
      <path d={star(9, 2.11, 1.14, 19, 6)} fill="#ffd24a" />
      <path d={star(9, 3.8, 2.2, 19.4, 18.6)} fill="#ff4a1c" stroke={DARK} strokeWidth="1.1" strokeLinejoin="round" />
      <path d={star(9, 2.36, 1.32, 19.4, 18.6)} fill="#ffd24a" />
      <path d={star(9, 3.2, 1.8, 4.6, 18)} fill="#ff4a1c" stroke={DARK} strokeWidth="1.1" strokeLinejoin="round" />
      <path d={star(9, 1.98, 1.08, 4.6, 18)} fill="#ffd24a" />
      <path d={star(11, 9.6, 5.2)} fill="#d3121f" stroke={DARK} strokeWidth="1.4" strokeLinejoin="round" />
      <path d={star(11, 8, 4.2)} fill="#ff5a1c" />
      <path d={star(11, 6, 3.2)} fill="#ffb02e" />
      <path d={star(9, 3.6, 2.2)} fill="#fff3b0" />
    </Svg>
  ),
  // 혼란: 분홍 나선과 반대로 도는 화살표, 가운데 물음표
  confuse: () => (
    <Svg>
      <circle cx="12" cy="12" r="10" fill="#ff6ec7" fillOpacity="0.16" stroke="#ff6ec7" strokeWidth="1.1" strokeOpacity="0.55" strokeDasharray="2 2.4" />
      <path d="M12 12c0-1.2 1.2-1.8 2-1.2.9.7.6 2.2-.6 2.9-1.6.9-3.6.1-4.2-1.6-.7-2.1.6-4.4 2.9-5 2.8-.7 5.5 1.1 6 3.9.5 3.3-1.9 6.2-5.1 6.7" fill="none" stroke={DARK} strokeWidth="3.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M12 12c0-1.2 1.2-1.8 2-1.2.9.7.6 2.2-.6 2.9-1.6.9-3.6.1-4.2-1.6-.7-2.1.6-4.4 2.9-5 2.8-.7 5.5 1.1 6 3.9.5 3.3-1.9 6.2-5.1 6.7" fill="none" stroke="#ff6ec7" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M18.4 15.6l-2.6 2.6 3.4.6z" fill="#ffc2ea" stroke={DARK} strokeWidth="0.9" strokeLinejoin="round" />
      <text x="12" y="13.7" textAnchor="middle" fontSize="6" fontWeight="900" fontFamily="system-ui, sans-serif" fill="#fff" stroke={DARK} strokeWidth="1.1" paintOrder="stroke" strokeLinejoin="round">?</text>
    </Svg>
  ),
  // 장판: 주황 불길이 일렁이는 점선 원 바닥과 가운데 불꽃
  zone: () => (
    <Svg>
      <circle cx="12" cy="12" r="10" fill="#ff6a2a" fillOpacity="0.22" stroke={DARK} strokeWidth="2.4" />
      <circle cx="12" cy="12" r="10" fill="none" stroke="#ff9a52" strokeWidth="1.4" strokeDasharray="3 2.2" />
      <circle cx="12" cy="12" r="6" fill="#ff6a2a" fillOpacity="0.3" />
      <path d="M12 5.6c.6 2.2 3 3.2 3 6a3 3 0 0 1-6 0c0-1.2.5-2 1.2-2.8.2 1 .8 1.5 1.3 1.6-.2-1.8-.2-3.4.5-4.8z" fill="#ffd27a" stroke={DARK} strokeWidth="0.9" strokeLinejoin="round" />
    </Svg>
  ),
  // 터지는 총알: 터지는 불꽃(별 모양 폭발) 한가운데에 총알이 박혀 있고, 탄두 조각과 불똥이 사방으로 튄다
  burst: () => (
    <Svg>
      <path d={star(10, 11.4, 6.6, 12, 12)} fill="#ff6a2a" stroke={DARK} strokeWidth="1.5" strokeLinejoin="round" />
      <path d={star(10, 8.6, 4.9, 12, 12)} fill="#ffb347" />
      <path d={star(8, 6.2, 3.4, 12, 12)} fill="#fff3b0" />
      <g transform="rotate(-40 12 12)">
        <rect x="5.6" y="9.7" width="6.6" height="4.6" rx="1" fill="#e0a23a" stroke={DARK} strokeWidth="1.2" />
        <path d="M7.4 9.9v4.2" stroke={DARK} strokeWidth="0.8" strokeOpacity="0.7" />
        <path d="M12.2 9.7c2.6 0 4.6 1.1 6.2 2.3-1.6 1.2-3.6 2.3-6.2 2.3z" fill="#ff7a35" stroke={DARK} strokeWidth="1.2" strokeLinejoin="round" />
        <path d="M6.8 10.8h4.6" stroke="#fff" strokeWidth="0.9" strokeLinecap="round" strokeOpacity="0.85" />
      </g>
      <path d="M2.6 18.4l2.8-1.2.9 2-2.3 1.7z" fill="#c9ced8" stroke={DARK} strokeWidth="1" strokeLinejoin="round" />
      <path d="M19.8 3.6l1.8 2.4-2.2 1.3z" fill="#c9ced8" stroke={DARK} strokeWidth="1" strokeLinejoin="round" />
      <path d="M20.2 18l1.9 1.1-1.1 2-1.8-.9z" fill="#8f98a8" stroke={DARK} strokeWidth="1" strokeLinejoin="round" />
      <circle cx="3.4" cy="6.6" r="0.95" fill="#ffd27a" />
      <circle cx="12" cy="2.2" r="0.85" fill="#ffd27a" />
      <circle cx="21.6" cy="12.2" r="0.85" fill="#ffd27a" />
    </Svg>
  ),
  // 보호막: 육각 격자가 비치는 청록 구체와 윗면 반사광
  barrier: () => (
    <Svg>
      <circle cx="12" cy="12" r="9.8" fill="#58e6ff" fillOpacity="0.2" stroke={DARK} strokeWidth="2.4" />
      <circle cx="12" cy="12" r="9.8" fill="none" stroke="#58e6ff" strokeWidth="1.5" />
      <path d="M12 6.4l4.2 2.4v4.8L12 16l-4.2-2.4V8.8z" fill="#58e6ff" fillOpacity="0.22" stroke="#bff6ff" strokeWidth="1.1" strokeLinejoin="round" />
      <path d="M12 6.4V2.8M16.2 8.8l3.2-1.8M16.2 13.6l3.2 1.8M12 16v3.6M7.8 13.6l-3.2 1.8M7.8 8.8L4.6 7" stroke="#bff6ff" strokeWidth="1" strokeLinecap="round" strokeOpacity="0.7" />
      <path d="M6.4 7.2A7.4 7.4 0 0 1 11 4.4" fill="none" stroke="#fff" strokeWidth="1.7" strokeLinecap="round" />
      <circle cx="9.8" cy="9.4" r="0.9" fill="#fff" />
    </Svg>
  ),
};

/** 스킬 아이콘. 그림이 있는 스킬(위 목록)은 직접 그린 SVG, 없으면 DB의 이모지 글자 */
export function SkillIcon({ code }: { code: string }) {
  const draw = ICONS[code as IconSkillCode];
  return draw ? <>{draw()}</> : <Svg><circle cx="12" cy="12" r="7" fill="#8a96a8" stroke={DARK} strokeWidth="1.4" /><path d="M10.2 10a1.9 1.9 0 1 1 2.6 1.7c-.6.3-.8.7-.8 1.3M12 15.4v.2" fill="none" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" /></Svg>; // 그림이 없는 코드는 물음표 원
}
