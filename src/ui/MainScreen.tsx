import { GoogleButton } from './GoogleButton';
import { COUNTRIES, getCountry, setCountry, type Country } from '../country';
import { t } from '../i18n';

/** loggedIn: 구글 계정으로 로그인한 상태면 true(구글 버튼을 숨긴다), 확인 중이면 null */
interface Props { onStart(): void; error: string | null; loggedIn: boolean | null }

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

export function MainScreen({ onStart, error, loggedIn }: Props) {
  return (
    <main className="main-screen">
      <div className="main-bg" aria-hidden="true">
        {BUBBLES.map(([left, top, size, path, seconds, delay], i) => (
          <span key={i} className="bubble" style={{
            left: `${left}%`, top: `${top}%`, width: size, height: size,
            animationName: `drift${path}`, animationDuration: `${seconds}s`, animationDelay: `${delay}s`,
          }} />
        ))}
      </div>
      <section className="main-card">
        <img className="main-logo" src="/logo.png" alt="" width={96} height={96} />
        <h1>Trendist</h1>
        <p className="tagline">{t('main.tagline')}</p>
        <p className="muted">{t('main.intro')}</p>
        <ol className="steps">
          <li>{t('main.step1')}</li>
          <li>{t('main.step2')}</li>
          <li>{t('main.step3')}</li>
        </ol>
        <ul className="main-howto" aria-label={t('main.howtoLabel')}>
          <li>{t('main.howto1')}</li>
          <li>{t('main.howto2')}</li>
          <li>{t('main.howto3')}</li>
          <li>{t('main.howto4')}</li>
          <li>{t('main.howto5')}</li>
        </ul>
        <button className="primary big" onClick={onStart} autoFocus>{t('main.start')}</button>
        {/* 이미 로그인한 계정이면 [시작]만(그 계정으로 이어 간다). 확인하는 동안에도 구글 버튼을 잠깐 띄웠다 숨기지 않게 기다린다 */}
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
      </section>
    </main>
  );
}
