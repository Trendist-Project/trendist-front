import type {
  GuideArticle, GuideCategory, Me, MyKeyword, Notice, PlayerSummary, PlusResult, RankingEntry, SearchResult, TokenResponse,
} from './types';

export class ApiFailure extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

/** 액세스 토큰은 브라우저 메모리에만 둔다(9.3). 방문자 ID는 HttpOnly 쿠키라 JS에서 보이지 않는다. */
let accessToken: string | null = null;
export const getToken = () => accessToken;

async function raw<T>(method: string, path: string, body?: unknown, auth = true): Promise<T> {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (auth && accessToken) headers['Authorization'] = `Bearer ${accessToken}`;
  const res = await fetch(path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    credentials: 'same-origin',
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) throw new ApiFailure(res.status, data?.code ?? `HTTP_${res.status}`, data?.message ?? '요청에 실패했어요');
  return data as T;
}

/** 토큰이 만료되면(401) 방문자 ID로 한 번 다시 발급받고 재시도한다. */
async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  try {
    return await raw<T>(method, path, body);
  } catch (e) {
    if (e instanceof ApiFailure && e.status === 401 && (await resumeSession())) return raw<T>(method, path, body);
    throw e;
  }
}

/** 쿠키의 방문자 ID로 세션을 이어 간다. 없으면 false(메인 화면을 보여 준다). */
export async function resumeSession(): Promise<boolean> {
  try {
    accessToken = (await raw<TokenResponse>('POST', '/api/auth/session', undefined, false)).accessToken;
    return true;
  } catch {
    accessToken = null;
    return false;
  }
}

export const api = {
  async startGuest() {
    accessToken = (await raw<TokenResponse>('POST', '/api/auth/guest', undefined, false)).accessToken;
  },
  me: () => request<Me>('GET', '/api/me'),
  createPlayer: (nickname: string) => request<PlayerSummary>('POST', '/api/players', { nickname, countryCode: 'KR' }),
  changeNickname: (nickname: string) => request<PlayerSummary>('PATCH', '/api/me/nickname', { nickname }),
  search: (q: string) => request<SearchResult>('GET', `/api/keywords/search?q=${encodeURIComponent(q)}`),
  plus: (text: string) => request<PlusResult>('POST', '/api/keywords/plus', { text }),
  myKeywords: () => request<MyKeyword[]>('GET', '/api/me/keywords'),
  rankings: () => request<RankingEntry[]>('GET', '/api/rankings?country=KR'),
  notices: () => request<Notice[]>('GET', '/api/notices'),
  guideCategories: () => request<GuideCategory[]>('GET', '/api/guide/categories'),
  guideArticles: (code: string) => request<GuideArticle[]>('GET', `/api/guide/categories/${encodeURIComponent(code)}/articles`),
};
