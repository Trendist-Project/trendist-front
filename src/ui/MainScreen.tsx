import { useLayoutEffect, useRef } from 'react';
import { GoogleButton } from './GoogleButton';
import { COUNTRIES, getCountry, setCountry, type Country } from '../country';
import { t } from '../i18n';

/** loggedIn: 구글 계정으로 로그인한 상태면 true(구글 버튼을 숨긴다), 확인 중이면 null */
interface Props { onStart(): void; error: string | null; loggedIn: boolean | null; onLogout(): void }

/** 배경 원: [왼쪽 %, 위 %, 크기 px, 움직임 경로 1~3, 한 바퀴 초, 시작 지연 초]. 원마다 경로·속도를 달리해 따로 떠다니게 한다. */
const BUBBLES: [number, number, number, number, number, number][] = [
  [8, 12, 120, 1, 9, 0], [70, 20, 60, 2, 6, -2], [78, 62, 180, 3, 11, -4], [20, 72, 40, 1, 5, -1],
  [45, 82, 90, 2, 8, -3], [55, 8, 30, 3, 5, -2], [5, 45, 70, 2, 7, -5], [88, 35, 50, 1, 6, -3],
  [32, 30, 26, 3, 4.5, -1], [62, 45, 110, 1, 10, -6], [15, 88, 64, 3, 7, -2], [92, 85, 36, 2, 5.5, -4],
  [38, 5, 80, 2, 9, -7], [72, 92, 24, 1, 4, -1],
];

/** 나라(방)를 바꾼다. 나라가 곧 화면 언어라 문구를 모두 바꾸려고 새로 읽는다 */
function chooseCountry(c: Country) {
  if (c === getCountry()) return;
  setCountry(c);
  location.reload();
}

export function MainScreen({ onStart, error, loggedIn, onLogout }: Props) {
  const screenRef = useRef<HTMLElement>(null);
  const cardRef = useRef<HTMLElement>(null);
  // PC·노트북: 카드가 화면 높이보다 크면 한 화면에 들어가도록 카드 전체를 줄인다(스크롤이 생기지 않게). 글이 길어 줄이 더 늘어나는 언어·창 크기·확대 비율에서도
  // 실제로 잰 높이로 맞추므로 어긋나지 않는다. 너무 작아지지 않게 60%까지만 줄이고 그 아래는 화면 안에서만 스크롤한다. 폰(너비 760px 이하)은 건드리지 않는다
  useLayoutEffect(() => {
    const screen = screenRef.current, card = cardRef.current;
    if (!screen || !card) return;
    const wide = window.matchMedia('(min-width: 761px)');
    const fit = () => {
      card.style.zoom = '1';
      if (!wide.matches) return;
      const cs = getComputedStyle(screen);
      const avail = screen.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom) - 2; // 소수점 올림으로 1~2px 넘치지 않게 여유를 둔다
      const natural = card.getBoundingClientRect().height;
      card.style.zoom = String(natural > avail && avail > 0 ? Math.max(0.6, avail / natural) : 1);
    };
    fit();
    const ro = new ResizeObserver(fit); // 창 크기(확대·축소 포함)가 바뀌면 다시 맞춘다. 카드는 보지 않는다(줄이는 것이 다시 알림을 만들지 않게)
    ro.observe(screen);
    document.fonts?.ready.then(fit).catch(() => { /* 글꼴이 늦게 와도 그대로 둔다 */ });
    return () => ro.disconnect();
  }, [loggedIn, error]);
  return (
    <main className="main-screen" ref={screenRef}>
      <div className="main-bg" aria-hidden="true">
        {BUBBLES.map(([left, top, size, path, seconds, delay], i) => (
          <span key={i} className="bubble" style={{
            left: `${left}%`, top: `${top}%`, width: size, height: size,
            animationName: `drift${path}`, animationDuration: `${seconds}s`, animationDelay: `${delay}s`,
          }} />
        ))}
      </div>
      <section className="main-card" ref={cardRef}>
        {/* 가로 모드 폰에서는 왼쪽(소개)·오른쪽(방법·시작)의 두 칸이 된다. 그 밖에서는 두 묶음이 레이아웃에 영향을 주지 않는다(CSS display: contents) */}
        <div className="main-hero">
          <img className="main-logo" src="/logo.png" alt="" width={96} height={96} />
          <h1>Trendist</h1>
          <p className="tagline">{t('main.tagline')}</p>
          <p className="muted">{t('main.intro')}</p>
          <ol className="steps">
            <li>{t('main.step1')}</li>
            <li>{t('main.step2')}</li>
            <li>{t('main.step3')}</li>
          </ol>
        </div>
        <div className="main-actions">
        <ul className="main-howto" aria-label={t('main.howtoLabel')}>
          <li>{t('main.howto1')}</li>
          <li>{t('main.howto2')}</li>
          <li>{t('main.howto3')}</li>
          <li>{t('main.howto4')}</li>
          <li>{t('main.howto5')}</li>
        </ul>
        <button className="primary big" onClick={onStart} autoFocus>{t('main.start')}</button>
        {/* 이미 로그인한 계정이면 [시작]과 그 아래 [로그아웃](그 계정으로 이어 가거나 다른 계정으로 바꾼다). 확인하는 동안에도 구글 버튼을 잠깐 띄웠다 숨기지 않게 기다린다 */}
        {loggedIn === true && <button className="big logout-btn" onClick={onLogout}>🚪 {t('main.logout')}</button>}
        {loggedIn === false && (<>
          <div className="or-divider" aria-hidden="true"><span>{t('main.or')}</span></div>
          <GoogleButton />
          <p className="muted small">{t('main.googleHint')}</p>
        </>)}
        {error && <p className="error" role="alert">{error}</p>}
        {/* 서버(나라) 선택: 기본은 브라우저 언어로 정해져 있어 대부분 건드리지 않는다. 눈에 덜 띄게 카드 맨 아래 작은 목록으로 둔다 */}
        <label className="server-select">
          <span>{t('main.serverLabel')}</span>
          <select value={getCountry()} onChange={(e) => chooseCountry(e.target.value as Country)} aria-label={t('main.countryLabel')}>
            {COUNTRIES.map((c) => (<option key={c} value={c}>{t(`main.country${c}`)}</option>))}
          </select>
        </label>
        </div>
      </section>
    </main>
  );
}
