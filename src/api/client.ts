import type {
  Activity, ActivityRange, PlayerCard, ScoreHistory, ScoreRange, CommentItem, CommentPage, GuideArticle, GuideCategory, KeywordCard, Me, MyKeyword, Notice, PlayerSummary,
  PlusResult, RankingEntry, SearchResult, TokenResponse, VoteResult,
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

/** 세션을 이어 간다: 계정은 갱신 토큰 쿠키(회전), 게스트는 방문자 ID 쿠키로. 둘 다 없으면 false(메인 화면을 보여 준다). */
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
  /**
   * 구글 로그인(9.3): 구글이 준 ID 토큰을 보내면 서버가 검증하고 이 사이트의 JWT를 준다(갱신 토큰은 HttpOnly 쿠키).
   * result: LINKED(게스트 기록에 연결) / EXISTING(기존 계정으로 들어감) / CREATED(새 계정)
   */
  async googleLogin(idToken: string, nonce: string | null): Promise<'LINKED' | 'EXISTING' | 'CREATED'> {
    const r = await raw<{ accessToken: string; expiresIn: number; result: 'LINKED' | 'EXISTING' | 'CREATED' }>('POST', '/api/auth/google', { idToken, nonce }, false);
    accessToken = r.accessToken;
    return r.result;
  },
  /** 로그아웃: 서버가 갱신 토큰을 폐기하고 지금까지 발급한 JWT도 바로 무효로 한다. 브라우저에 든 JWT도 지운다. */
  async logout() {
    try { await raw<void>('POST', '/api/auth/logout', undefined, true); } finally { accessToken = null; }
  },
  me: () => request<Me>('GET', '/api/me'),
  createPlayer: (nickname: string) => request<PlayerSummary>('POST', '/api/players', { nickname, countryCode: 'KR' }),
  changeNickname: (nickname: string) => request<PlayerSummary>('PATCH', '/api/me/nickname', { nickname }),
  search: (q: string) => request<SearchResult>('GET', `/api/keywords/search?q=${encodeURIComponent(q)}`),
  plus: (text: string) => request<PlusResult>('POST', '/api/keywords/plus', { text }),
  myKeywords: () => request<MyKeyword[]>('GET', '/api/me/keywords'),
  keyword: (id: number) => request<KeywordCard>('GET', `/api/keywords/${id}`),
  activity: (id: number, range: ActivityRange) => request<Activity>('GET', `/api/keywords/${id}/activity?range=${range}`),
  topComments: (id: number) => request<CommentItem[]>('GET', `/api/keywords/${id}/comments/top`),
  comments: (id: number, page: number) => request<CommentPage>('GET', `/api/keywords/${id}/comments?page=${page}&size=20`),
  writeComment: (id: number, body: string) => request<CommentItem>('POST', `/api/keywords/${id}/comments`, { body }),
  editComment: (commentId: number, body: string) => request<CommentItem>('PATCH', `/api/comments/${commentId}`, { body }),
  deleteComment: (commentId: number) => request<void>('DELETE', `/api/comments/${commentId}`),
  report: (target: 'COMMENT' | 'CHAT' | 'PLAYER', targetId: number, reason: string) =>
    request<void>('POST', '/api/reports', { target, targetId, reason }),
  vote: (commentId: number, vote: 'LIKE' | 'DISLIKE') => request<VoteResult>('POST', `/api/comments/${commentId}/vote`, { vote }),
  scoreHistory: (range: ScoreRange) => request<ScoreHistory>('GET', `/api/me/score-history?range=${range}`),
  roomPlayer: (entityNo: number) => request<PlayerCard>('GET', `/api/room/players/${entityNo}`),
  roomPlayerHistory: (entityNo: number) => request<ScoreHistory>('GET', `/api/room/players/${entityNo}/score-history?range=7d`),
  rankings: () => request<RankingEntry[]>('GET', '/api/rankings?country=KR'),
  notices: () => request<Notice[]>('GET', '/api/notices'),
  guideCategories: () => request<GuideCategory[]>('GET', '/api/guide/categories'),
  guideArticles: (code: string) => request<GuideArticle[]>('GET', `/api/guide/categories/${encodeURIComponent(code)}/articles`),
};

// ---------------------------------------------------------------- 관리자(13): /api/admin/**는 ROLE_ADMIN만

export interface AdminStatus { admin: boolean }
export interface AdminKeywordRow {
  id: number; text: string; state: string; source: string; trendValue: number; holderCount: number;
  totalPlusCount: number; searchCount: number; externalUntil: string | null; activatedAt: string | null;
  bannedAt: string | null; createdAt: string;
}
export interface AdminKeywordPage { items: AdminKeywordRow[]; total: number; page: number; size: number }
export interface AdminAdded { id: number; text: string; state: string; trendValue: number; holderCount: number; externalUntil: string; created: boolean }
export interface AdminReport {
  id: number; type: string; targetId: number; reason: string | null; status: string; createdAt: string; updatedAt: string;
  reporterNickname: string; targetNickname: string | null; content: string | null; keywordText: string | null; sameTargetCount: number;
}
export interface AdminReportPage { items: AdminReport[]; total: number; page: number; size: number }
export interface AdminSetting {
  name: string; value: string; type: string; min: number | null; max: number | null; description: string | null;
  defaultValue: string | null; updatedAt: string;
}
export interface AdminKeywordQuery { state?: string; source?: string; q?: string; sort: string; dir: 'asc' | 'desc'; page: number }

const qs = (o: Record<string, string | number | undefined>) =>
  new URLSearchParams(Object.entries(o).filter(([, v]) => v !== undefined && v !== '').map(([k, v]) => [k, String(v)])).toString();

export const adminApi = {
  status: () => request<AdminStatus>('GET', '/api/me/admin'),
  keywords: (q: AdminKeywordQuery) => request<AdminKeywordPage>('GET', `/api/admin/keywords?${qs({ country: 'KR', size: 50, ...q })}`),
  addKeyword: (text: string) => request<AdminAdded>('POST', '/api/admin/keywords', { text, country: 'KR' }),
  ban: (id: number, banned: boolean) => request<AdminKeywordRow>('POST', `/api/admin/keywords/${id}/${banned ? 'ban' : 'unban'}`),
  reports: (status: string, page: number) => request<AdminReportPage>('GET', `/api/admin/reports?${qs({ status, page })}`),
  setReportStatus: (id: number, status: string, sameTarget: boolean) =>
    request<{ changed: number }>('PATCH', `/api/admin/reports/${id}`, { status, sameTarget }),
  settings: () => request<AdminSetting[]>('GET', '/api/admin/settings'),
  updateSetting: (name: string, value: string) => request<AdminSetting>('PATCH', `/api/admin/settings/${name}`, { value }),
};
