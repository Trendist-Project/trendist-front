/**
 * 카카오톡 공유(4.24): 공유 주소(링크)만 카카오톡으로 보낸다. 이미지는 올리지 않는다.
 * 카카오가 그 주소의 OG 태그(카드 이미지·제목·설명)를 읽어 메시지를 만든다(스크랩).
 * 카카오 서버가 접속할 수 없는 로컬 주소(localhost)에서는 링크만 든 글 메시지로 보낸다.
 * 휴대폰은 카카오톡 앱이, PC는 카카오톡 공유 창이 열린다. 키가 없으면(VITE_KAKAO_JS_KEY) 카카오 공유를 숨긴다.
 * JavaScript 키는 화면에 그대로 실리는 공개 키다(카카오 개발자 콘솔에 등록한 사이트 도메인에서만 동작한다).
 */
const KEY = (import.meta.env.VITE_KAKAO_JS_KEY as string | undefined) ?? '';
const SDK_URL = 'https://t1.kakaocdn.net/kakao_js_sdk/2.7.2/kakao.min.js';

interface KakaoSdk {
  isInitialized(): boolean;
  init(key: string): void;
  Share: {
    sendDefault(o: unknown): void;
    sendScrap(o: { requestUrl: string }): void;
  };
}
declare global { interface Window { Kakao?: KakaoSdk } }

export const kakaoEnabled = KEY !== '';

let loading: Promise<KakaoSdk> | null = null;

function load(): Promise<KakaoSdk> {
  if (!kakaoEnabled) return Promise.reject(new Error('NO_KAKAO_KEY'));
  loading ??= new Promise<KakaoSdk>((resolve, reject) => {
    const ready = () => {
      const k = window.Kakao;
      if (!k) { reject(new Error('NO_KAKAO_SDK')); return; }
      if (!k.isInitialized()) k.init(KEY);
      resolve(k);
    };
    if (window.Kakao) { ready(); return; }
    const s = document.createElement('script');
    s.src = SDK_URL;
    s.crossOrigin = 'anonymous';
    s.onload = ready;
    s.onerror = () => { loading = null; reject(new Error('NO_KAKAO_SDK')); };
    document.head.appendChild(s);
  });
  return loading;
}

/** SDK를 미리 불러 둔다. 누르는 순간 바로 공유 창을 열어야 하기 때문이다(PC 팝업 차단) */
export function prepareKakao(): Promise<void> {
  return load().then(() => undefined);
}

/** 카카오 서버가 이 주소에 접속할 수 있는지(localhost·사설 주소는 스크랩 불가) */
export function canScrap(url: string): boolean {
  const h = new URL(url).hostname;
  return !(h === 'localhost' || h.endsWith('.local') || /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(h));
}

/** 링크를 카카오톡으로 보낸다. 버튼을 누른 그 자리에서 불러야 한다(팝업 차단). text는 로컬 주소용 글 메시지 */
export function sendKakaoLink(url: string, text: string) {
  const k = window.Kakao;
  if (!k?.isInitialized()) throw new Error('NO_KAKAO_SDK');
  if (canScrap(url)) {
    k.Share.sendScrap({ requestUrl: url });
  } else {
    const link = { mobileWebUrl: url, webUrl: url };
    k.Share.sendDefault({ objectType: 'text', text, link, buttonTitle: '카드 보기' });
  }
}
