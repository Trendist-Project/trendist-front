/**
 * 카카오톡 공유(4.24): 카카오 JavaScript SDK로 카드 이미지를 카카오 서버에 올리고, 그 이미지를 넣은 피드 메시지를 보낸다.
 * 휴대폰은 카카오톡 앱이, PC는 카카오톡 공유 창이 열린다. 키가 없으면(VITE_KAKAO_JS_KEY) 카카오 공유를 숨긴다.
 * JavaScript 키는 화면에 그대로 실리는 공개 키다(카카오 개발자 콘솔에 등록한 사이트 도메인에서만 동작한다).
 */
const KEY = (import.meta.env.VITE_KAKAO_JS_KEY as string | undefined) ?? '';
const SDK_URL = 'https://t1.kakaocdn.net/kakao_js_sdk/2.7.2/kakao.min.js';

interface KakaoSdk {
  isInitialized(): boolean;
  init(key: string): void;
  Share: {
    uploadImage(o: { file: File[] }): Promise<{ infos: { original: { url: string } } }>;
    sendDefault(o: unknown): void;
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

/** 카드 이미지를 카카오 서버에 올려 주소를 받는다. 누르는 순간 바로 공유 창을 열 수 있게 미리 해 둔다(PC 팝업 차단 방지) */
export async function uploadForKakao(file: File): Promise<string> {
  const k = await load();
  const r = await k.Share.uploadImage({ file: [file] });
  return r.infos.original.url;
}

/** 이미지 주소를 넣은 피드 메시지로 카카오톡 공유 창을 연다. 버튼을 누른 그 자리에서 불러야 한다(팝업 차단) */
export function sendKakao(o: { imageUrl: string; title: string; description: string; url: string }) {
  const k = window.Kakao;
  if (!k?.isInitialized()) throw new Error('NO_KAKAO_SDK');
  const link = { mobileWebUrl: o.url, webUrl: o.url };
  k.Share.sendDefault({
    objectType: 'feed',
    content: { title: o.title, description: o.description, imageUrl: o.imageUrl, imageWidth: 1080, imageHeight: 1350, link },
    buttons: [{ title: '나도 겨뤄 보기', link }],
  });
}
