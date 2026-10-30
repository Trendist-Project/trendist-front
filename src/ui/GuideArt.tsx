import { TurtleIcon } from './GrowthIcons';

/** 가이드 그림(4.17): 본문에 `[[이름]]` 한 줄로 넣는다. 글로 설명하기 어려운 것을 게임과 같은 모양으로 보여 준다. */

/** 시작 3단계: 찾기 → 추가 → 커지기 */
export function StartSteps() {
  const steps = [
    { icon: '🔎', title: '찾기', text: '요즘 뜨는 단어를 검색해요' },
    { icon: '➕', title: '추가', text: '보관함에 넣으면 점수가 들어와요' },
    { icon: '🐢', title: '커지기', text: '원이 커지고 부딪혀 이겨요' },
  ];
  return (
    <ol className="guide-steps" aria-label="시작 3단계">
      {steps.map((s, i) => (
        <li key={s.title}>
          <span className="guide-step-no">{i + 1}</span>
          <span className="guide-step-icon" aria-hidden="true">{s.icon}</span>
          <strong>{s.title}</strong>
          <span className="muted small">{s.text}</span>
        </li>
      ))}
    </ol>
  );
}

/** 조작: PC 키와 모바일 손동작 */
export function Controls() {
  return (
    <div className="guide-controls">
      <figure>
        <div className="keys" aria-hidden="true">
          <span className="key-row"><kbd>W</kbd></span>
          <span className="key-row"><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd></span>
        </div>
        <figcaption><strong>PC</strong><span className="muted small">방향키·WASD 또는 클릭</span></figcaption>
      </figure>
      <figure>
        <div className="joystick" aria-hidden="true"><span /></div>
        <figcaption><strong>모바일</strong><span className="muted small">누른 채 끌어서 이동</span></figcaption>
      </figure>
      <figure>
        <div className="keys" aria-hidden="true"><span className="key-row"><kbd>M</kbd><kbd>L</kbd><kbd>C</kbd></span></div>
        <figcaption><strong>단축키</strong><span className="muted small">미니맵 · 리더보드 · 채팅</span></figcaption>
      </figure>
    </div>
  );
}

/** 키워드 상태 배지(보관함·카드와 같은 모양) */
export function KeywordStates() {
  return (
    <div className="guide-badges">
      <span className="badge state-활성">🔥 활성 · 점수 있음</span>
      <span className="badge state-비활성">💤 비활성 · 0점</span>
      <span className="badge state-금지">⛔ 금지</span>
    </div>
  );
}

/** 아레나에서 보이는 것: 세이프존 두 가지, 봇, ? 구슬, 내 원 */
export function ArenaLegend() {
  return (
    <ul className="guide-legend">
      <li><span className="swatch-zone center" aria-hidden="true" />가운데 세이프존</li>
      <li><span className="swatch-zone random" aria-hidden="true" />잠깐 생기는 세이프존</li>
      <li><span className="legend-me" aria-hidden="true"><TurtleIcon level={10} size={26} /></span>나</li>
      <li><span className="legend-bot" aria-hidden="true" />봇</li>
      <li><span className="legend-orb" aria-hidden="true">?</span>? 구슬</li>
    </ul>
  );
}
