/**
 * 구글 로그인(9.3): 구글 계정 선택 페이지로 갔다가 돌아오는 방식.
 * prompt=select_account로 매번 계정 선택 화면을 띄워서, 브라우저에 로그인된 계정이 자동으로 쓰이지 않고 고르거나 다른 계정을 추가할 수 있다.
 * scope는 openid만 요청한다(이름·이메일은 받지 않는다). 돌아오면 public/oauth/google-callback.html이 ID 토큰을 탭 저장소에 두고 / 로 보낸다.
 */
const CLIENT_ID = (import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined)
  ?? '241731311282-45is2ai9skpf33gmgljlv423r1f2j2vt.apps.googleusercontent.com';
const STATE_KEY = 'trendist.oauth.state';
const NONCE_KEY = 'trendist.oauth.nonce';
const RESULT_KEY = 'trendist.oauth.result';

function randomString() {
  const b = new Uint8Array(24);
  crypto.getRandomValues(b);
  return Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
}

/** 구글 계정 선택 페이지로 이동한다. 지금 페이지는 떠나고, 로그인을 마치면 / 로 돌아온다. */
export function startGoogleLogin() {
  const state = randomString(), nonce = randomString();
  sessionStorage.setItem(STATE_KEY, state);
  sessionStorage.setItem(NONCE_KEY, nonce);
  const q = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: `${location.origin}/oauth/google-callback.html`,
    response_type: 'id_token',
    scope: 'openid',
    prompt: 'select_account', // 매번 계정 선택(다른 계정 추가 가능)
    state,
    nonce,
  });
  location.assign(`https://accounts.google.com/o/oauth2/v2/auth?${q}`);
}

export type GoogleResult = { idToken: string; nonce: string | null } | { error: string };

/** 구글에서 돌아온 결과가 있으면 꺼내고 지운다(한 번만). 없으면 null. */
export function takeGoogleResult(): GoogleResult | null {
  try {
    const raw = sessionStorage.getItem(RESULT_KEY);
    if (!raw) return null;
    sessionStorage.removeItem(RESULT_KEY);
    return JSON.parse(raw) as GoogleResult;
  } catch {
    return null;
  }
}
