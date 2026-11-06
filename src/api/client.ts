import { getCountry, getLang } from '../country';
import { errorText } from '../i18n';
import { getAdminCountry } from './adminCountry';
import type {
  Activity, ActivityRange, PlayerCard, ScoreHistory, ScoreRange, CommentItem, CommentPage, GuideArticle, GuideCategory, KeywordCard, Me, MyKeyword, Notice, PlayerSummary, 
  AiCommentPage, AiCommentRow, EmergencyNotice, Look, LevelBadge, PixelArtData, ProfileBox, ProfileSave, ShareCardCreated, PlusResult, RankingEntry, SearchResult, TitleBox, TokenResponse, VoteResult,
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
  const headers: Record<string, string> = { 'Accept-Language': getLang() };
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
  if (!res.ok) {
    const code = data?.code ?? `HTTP_${res.status}`;
    throw new ApiFailure(res.status, code, errorText(code, data?.message ?? errorText('REQUEST_FAILED', '요청에 실패했어요')));
  }
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

/**
 * 세션을 이어 간다: 계정은 갱신 토큰 쿠키(회전), 게스트는 방문자 ID 쿠키로. 둘 다 없으면 false(메인 화면을 보여 준다).
 * 이미 진행 중이면 그 결과를 같이 쓴다. 갱신 토큰은 한 번 쓰면 바뀌므로, 동시에 두 번 보내면 서버가 재사용(탈취)으로 보고 로그아웃시킨다(9.3).
 */
let resuming: Promise<boolean> | null = null;
export function resumeSession(): Promise<boolean> {
  if (resuming) return resuming;
  resuming = (async () => {
    try {
      accessToken = (await raw<TokenResponse>('POST', '/api/auth/session', undefined, false)).accessToken;
      return true;
    } catch {
      accessToken = null;
      return false;
    }
  })().finally(() => { resuming = null; });
  return resuming;
}

export type GoogleLoginResult = 'LINKED' | 'EXISTING' | 'CREATED' | 'WITHDRAWN';

export const api = {
  async startGuest() {
    accessToken = (await raw<TokenResponse>('POST', '/api/auth/guest', undefined, false)).accessToken;
  },
  /**
   * 구글 로그인(9.3): 구글이 준 ID 토큰을 보내면 서버가 검증하고 이 사이트의 JWT를 준다(갱신 토큰은 HttpOnly 쿠키).
   * result: LINKED(게스트 기록에 연결) / EXISTING(기존 계정으로 들어감) / CREATED(새 계정)
   * / WITHDRAWN(탈퇴한 계정이라 로그인하지 않음. 복구할지 물어본 뒤 googleRestore를 부른다)
   */
  async googleLogin(idToken: string, nonce: string | null): Promise<GoogleLoginResult> {
    const r = await raw<{ accessToken: string | null; expiresIn: number; result: GoogleLoginResult }>('POST', '/api/auth/google', { idToken, nonce }, false);
    if (r.accessToken) accessToken = r.accessToken;
    return r.result;
  },
  /** 탈퇴한 계정 복구(4.1): 같은 구글 ID 토큰으로 복구하고 바로 로그인한다. */
  async googleRestore(idToken: string, nonce: string | null) {
    accessToken = (await raw<{ accessToken: string }>('POST', '/api/auth/google/restore', { idToken, nonce }, false)).accessToken;
  },
  /** 탈퇴(4.1): 확인 문구를 그대로 보낸다. 서버가 갱신 토큰을 폐기하고 쿠키를 지운다. */
  async withdraw(phrase: string) {
    await request<void>('POST', '/api/auth/withdraw', { phrase });
    accessToken = null;
  },
  /** 로그아웃: 서버가 갱신 토큰을 폐기하고 지금까지 발급한 JWT도 바로 무효로 한다. 브라우저에 든 JWT도 지운다. */
  async logout() {
    try { await raw<void>('POST', '/api/auth/logout', undefined, true); } finally { accessToken = null; }
  },
  me: (country = getCountry()) => request<Me>('GET', `/api/me?country=${country}`),
  createPlayer: (nickname: string) => request<PlayerSummary>('POST', '/api/players', { nickname, countryCode: getCountry() }),
  changeNickname: (nickname: string) => request<PlayerSummary>('PATCH', '/api/me/nickname', { nickname }),
  titles: () => request<TitleBox>('GET', '/api/me/titles'),
  levelBadges: () => request<LevelBadge[]>('GET', '/api/levels/badges'),
  setTitle: (titleId: number | null) => request<TitleBox>('PUT', '/api/me/title', { titleId }),
  /** 꾸미기 프로필(4.9): 1~3번 칸 저장(equip이면 저장 후 장착)과 장착 */
  profiles: () => request<ProfileBox>('GET', '/api/me/profiles'),
  saveProfile: (slot: number, body: ProfileSave) => request<ProfileBox>('PUT', `/api/me/profiles/${slot}`, body),
  equipProfile: (slot: number) => request<ProfileBox>('PUT', '/api/me/profiles/equipped', { slot }),
  search: (q: string) => request<SearchResult>('GET', `/api/keywords/search?q=${encodeURIComponent(q)}`),
  plus: (text: string) => request<PlusResult>('POST', '/api/keywords/plus', { text }),
  myKeywords: () => request<MyKeyword[]>('GET', '/api/me/keywords'),
  /** 자랑하기 카드 공유 주소(4.24). 서버가 지금 값으로 저장하고 주소를 준다. 같은 값이면 같은 주소 */
  createShareCard: () => request<ShareCardCreated>('POST', '/api/share-cards'),
  keyword: (id: number) => request<KeywordCard>('GET', `/api/keywords/${id}`),
  /** AI 한 줄 설명이 맞지 않다는 갱신 요청(4.12) */
  requestAiComment: (id: number) => request<void>('POST', `/api/keywords/${id}/ai-comment/request`),
  activity: (id: number, range: ActivityRange) => request<Activity>('GET', `/api/keywords/${id}/activity?range=${range}`),
  topComments: (id: number) => request<CommentItem[]>('GET', `/api/keywords/${id}/comments/top`),
  comments: (id: number, page: number) => request<CommentPage>('GET', `/api/keywords/${id}/comments?page=${page}&size=20`),
  writeComment: (id: number, body: string) => request<CommentItem>('POST', `/api/keywords/${id}/comments`, { body }),
  editComment: (commentId: number, body: string) => request<CommentItem>('PATCH', `/api/comments/${commentId}`, { body }),
  deleteComment: (commentId: number) => request<void>('DELETE', `/api/comments/${commentId}`),
  report: (target: 'KEYWORD' | 'COMMENT' | 'CHAT' | 'PLAYER', targetId: number, reason: string) =>
    request<void>('POST', '/api/reports', { target, targetId, reason }),
  vote: (commentId: number, vote: 'LIKE' | 'DISLIKE') => request<VoteResult>('POST', `/api/comments/${commentId}/vote`, { vote }),
  scoreHistory: (range: ScoreRange) => request<ScoreHistory>('GET', `/api/me/score-history?range=${range}`),
  roomPlayer: (entityNo: number) => request<PlayerCard>('GET', `/api/room/players/${entityNo}`),
  roomPlayerHistory: (entityNo: number) => request<ScoreHistory>('GET', `/api/room/players/${entityNo}/score-history?range=7d`),
  rankings: () => request<RankingEntry[]>('GET', `/api/rankings?country=${getCountry()}`),
  notices: () => request<Notice[]>('GET', '/api/notices'),
  /** 지금 보여 줄 긴급 안내(4.29). 없으면 notice가 null */
  emergency: () => request<{ notice: EmergencyNotice | null }>('GET', '/api/emergency'),
  guideCategories: () => request<GuideCategory[]>('GET', '/api/guide/categories'),
  guideArticles: (code: string) => request<GuideArticle[]>('GET', `/api/guide/categories/${encodeURIComponent(code)}/articles`),
};

// ---------------------------------------------------------------- 관리자(13): /api/admin/**는 ROLE_ADMIN만

export interface AdminStatus { admin: boolean }
/** 관리자 긴급 안내 목록의 한 줄(4.29). status: ACTIVE(보이는 중) / ENDED(시간이 끝남) / CANCELED(관리자가 끝냄) */
export interface AdminIntegration { code: string; label: string; url: string }
export interface AdminEmergency { id: number; message: string; messageEn: string | null; createdAt: string; endsAt: string; canceledAt: string | null; status: 'ACTIVE' | 'ENDED' | 'CANCELED'; minutes: number }
export interface AdminKeywordRow {
  id: number; text: string; normalized: string; state: string; source: string; trendValue: number; holderCount: number;
  totalPlusCount: number; searchCount: number; viewCount: number; externalUntil: string | null; activatedAt: string | null;
  bannedAt: string | null; createdAt: string;
}
/** 키워드 한 개 조회(13.6): 등록 전이라도 규칙에 맞는지(valid, reason)와 기존 행(keyword, 없으면 null) */
export interface AdminKeywordLookup { text: string; normalized: string; valid: boolean; reason: string | null; keyword: AdminKeywordRow | null }
export interface AdminKeywordPage { items: AdminKeywordRow[]; total: number; page: number; size: number; stateCounts: Record<string, number> }
export interface AdminAdded { id: number; text: string; state: string; trendValue: number; holderCount: number; externalUntil: string; created: boolean }
export interface AdminReport {
  id: number; type: string; targetId: number; reason: string | null; status: string; createdAt: string; updatedAt: string;
  reporterNickname: string; targetNickname: string | null; content: string | null; keywordText: string | null; sameTargetCount: number;
  /** 신고된 사람의 사용자 번호(없어진 대상이면 null), 댓글이 이미 지워졌는지, 지금 걸린 제재("채팅 정지 11월 9일 12:00까지") */
  targetUserId: number | null; contentDeleted: boolean; targetSanctions: string[];
}
export interface AdminReportPage { items: AdminReport[]; total: number; page: number; size: number }
export interface AdminSetting {
  name: string; value: string; type: string; min: number | null; max: number | null; description: string | null;
  defaultValue: string | null; updatedAt: string;
  group: string; // 관리자 화면에서 묶어 보여 주는 그룹(13.3)
}
/** state·source는 여러 개를 고를 수 있다(비어 있으면 전체) */
export interface AdminKeywordQuery { state?: string[]; source?: string[]; q?: string; sort: string; dir: 'asc' | 'desc'; page: number }

const qs = (o: Record<string, string | number | undefined>) =>
  new URLSearchParams(Object.entries(o).filter(([, v]) => v !== undefined && v !== '').map(([k, v]) => [k, String(v)])).toString();

/** 관리자 공지(4.16). popupDays는 등록 시각부터 팝업 기간(1~90일) */
export interface AdminNoticeInput { title: string; body: string; titleEn: string | null; bodyEn: string | null; pinned: boolean; popupEnabled: boolean; popupDays: number | null }
export interface AdminNotice extends AdminNoticeInput { id: number; popupUntil: string | null; createdAt: string; updatedAt: string; edited: boolean }

/** 관리자 가이드(4.17, 13.4). code는 만들 때만, displayType은 FAQ(아코디언)·ARTICLE(문서형) */
export interface AdminGuideCategoryInput { code?: string; name: string; nameEn: string | null; displayType: 'FAQ' | 'ARTICLE'; enabled: boolean }
export interface AdminGuideCategory { id: number; code: string; name: string; nameEn: string | null; displayType: 'FAQ' | 'ARTICLE'; enabled: boolean; sortOrder: number; articleCount: number }
export interface AdminGuideArticleInput { title: string; body: string; titleEn: string | null; bodyEn: string | null }
export interface AdminGuideArticle extends AdminGuideArticleInput { id: number; categoryId: number; sortOrder: number; createdAt: string; updatedAt: string }

/** 관리자 공유 통계(13.8) */
export interface AdminShareItem { code: string; url: string; nickname: string; views: number; plays: number; createdAt: string }
export interface AdminShareStats { cards: number; cardsToday: number; views: number; plays: number; items: AdminShareItem[]; total: number; page: number; size: number }

/** 관리자 통계(13.9). Row의 t는 시간별이면 그 시간의 시작(UTC ISO), 하루별이면 현지 날짜. live면 아직 집계 중 */
export interface StatPeriod { peakOnline: number; activePlayers: number; newPlayers: number; plus: number; search: number; orb: number; collision: number; chat: number; comment: number; share: number }
export interface StatTotals { users: number; guests: number; google: number; admins: number; withdrawn: number; banned: number; players: number; wau: number; mau: number }
export interface StatSummary {
  onlineNow: number; today: StatPeriod; yesterday: StatPeriod; totals: StatTotals;
  keywordStates: Record<string, number>; pendingReports: number; levels: { label: string; count: number }[];
}
export interface StatRow extends StatPeriod { t: string; avgOnline: number; live: boolean }

/** 관리자 사용자 관리(13.10) */
export interface AdminUserRow {
  userId: number; playerId: number; nickname: string; type: 'GUEST' | 'GOOGLE'; admin: boolean; withdrawn: boolean;
  bannedUntil: string | null; uploadBannedUntil: string | null; commentBannedUntil: string | null;
  level: number; score: number; holdCount: number; totalPlusCount: number; reportCount: number;
  createdAt: string; lastSeenAt: string | null; online: boolean; chatBannedUntil: string | null;
}
export interface AdminUserPage { items: AdminUserRow[]; total: number; page: number; size: number }
export interface AdminUserDetail {
  user: AdminUserRow; lastLoginAt: string | null; deletedAt: string | null; nicknameChangedAt: string | null; lastPlayedAt: string | null;
  stats: {
    exp: number; level: number; score: number; holdCount: number; totalPlusCount: number; searchCount: number; commentScore: number;
    stealCount: number; botWinCount: number; orbCount: number; loseCount: number; activeDays: number; killCount: number; defeatCount: number;
    titleCount: number; title: string | null; commentCount: number; chatCount: number;
  };
  look: Look; art: PixelArtData | null;
  keywords: MyKeyword[];
  comments: { id: number; keyword: string; body: string; likes: number; dislikes: number; deleted: boolean; createdAt: string }[];
  chats: { id: number; body: string; createdAt: string }[];
  reports: { id: number; type: string; reason: string | null; status: string; reporter: string; content: string | null; createdAt: string }[];
  sanctions: { id: number; type: string; reason: string; createdAt: string; expiresAt: string; releasedAt: string | null; active: boolean }[];
}
export type SanctionKind = 'BAN' | 'UPLOAD' | 'COMMENT' | 'CHAT';

/** 관리자 대시보드(13.11). todo.level: danger / warn / ok, tab: 눌렀을 때 열 탭 */
export interface DashboardTodo { key: string; label: string; count: number; level: 'danger' | 'warn' | 'ok'; detail: string | null; tab: string | null; filter: string | null }
export interface Dashboard {
  at: string; onlineNow: number; today: StatPeriod; yesterday: StatPeriod; totals: StatTotals; hourly: StatRow[];
  todos: DashboardTodo[]; reported: { userId: number; playerId: number; nickname: string; reports: number }[];
  keywordStates: Record<string, number>; hotKeywords: { id: number; text: string; holderCount: number; trendValue: number; source: string }[];
  newKeywordsToday: number; googleEnabled: boolean; googleFetchedAt: string | null;
  leaderboard: { rank: number; playerId: number; nickname: string; level: number; score: number }[];
  newPlayers: { userId: number; playerId: number; nickname: string; type: 'GUEST' | 'GOOGLE'; level: number; createdAt: string }[];
  notices: { id: number; title: string; pinned: boolean; popup: boolean; createdAt: string }[];
  share: { today: number; cards: number; views: number; plays: number };
}

export const adminApi = {
  dashboard: () => request<Dashboard>('GET', `/api/admin/dashboard?country=${getAdminCountry()}`),
  statsSummary: () => request<StatSummary>('GET', `/api/admin/stats/summary?country=${getAdminCountry()}`),
  statsHourly: (hours: number) => request<StatRow[]>('GET', `/api/admin/stats/hourly?${qs({ country: getAdminCountry(), hours })}`),
  statsDaily: (days: number) => request<StatRow[]>('GET', `/api/admin/stats/daily?${qs({ country: getAdminCountry(), days })}`),
  users: (q: { q?: string; filter: string; sort: string; dir: 'asc' | 'desc'; page: number }) => request<AdminUserPage>('GET', `/api/admin/users?${qs({ country: getAdminCountry(), ...q })}`),
  user: (userId: number) => request<AdminUserDetail>('GET', `/api/admin/users/${userId}?country=${getAdminCountry()}`),
  sanction: (userId: number, type: SanctionKind, days: number | null, reason: string) =>
    request<AdminUserDetail>('POST', `/api/admin/users/${userId}/sanctions?country=${getAdminCountry()}`, { type, days, reason }),
  releaseSanction: (sanctionId: number) => request<AdminUserDetail>('POST', `/api/admin/users/sanctions/${sanctionId}/release?country=${getAdminCountry()}`),
  renameUser: (userId: number, nickname: string) => request<AdminUserDetail>('PATCH', `/api/admin/users/${userId}/nickname?country=${getAdminCountry()}`, { nickname }),
  resetUserLook: (userId: number) => request<AdminUserDetail>('POST', `/api/admin/users/${userId}/look/reset?country=${getAdminCountry()}`),
  setUserAdmin: (userId: number, admin: boolean) => request<AdminUserDetail>('PATCH', `/api/admin/users/${userId}/role?country=${getAdminCountry()}`, { admin }),
  kickUser: (userId: number) => request<void>('POST', `/api/admin/users/${userId}/kick?country=${getAdminCountry()}`),
  shareStats: (sort: string, page: number) => request<AdminShareStats>('GET', `/api/admin/share-cards?${qs({ sort, page })}`),
  status: () => request<AdminStatus>('GET', '/api/me/admin'),
  aiComments: (filter: string, page: number) => request<AiCommentPage>('GET', `/api/admin/ai-comments?${qs({ country: getAdminCountry(), filter, page })}`),
  aiRegenerate: (id: number) => request<AiCommentRow>('POST', `/api/admin/ai-comments/${id}/regenerate`),
  aiEdit: (id: number, comment: string) => request<AiCommentRow>('PUT', `/api/admin/ai-comments/${id}`, { comment }),
  aiDismiss: (id: number) => request<AiCommentRow>('POST', `/api/admin/ai-comments/${id}/dismiss`),
  keywords: (q: AdminKeywordQuery) => request<AdminKeywordPage>('GET', `/api/admin/keywords?${qs({ country: getAdminCountry(), size: 50, ...q, state: q.state?.join(','), source: q.source?.join(',') })}`),
  addKeyword: (text: string) => request<AdminAdded>('POST', '/api/admin/keywords', { text, country: getAdminCountry() }),
  lookupKeyword: (text: string) => request<AdminKeywordLookup>('GET', `/api/admin/keywords/lookup?${qs({ country: getAdminCountry(), text })}`),
  /** 등록 전 단어도 바로 금지한다(없으면 금지 상태로 새로 등록) */
  banKeywordText: (text: string) => request<AdminKeywordRow>('POST', '/api/admin/keywords/ban-text', { text, country: getAdminCountry() }),
  ban: (id: number, banned: boolean) => request<AdminKeywordRow>('POST', `/api/admin/keywords/${id}/${banned ? 'ban' : 'unban'}`),
  reports: (status: string, page: number) => request<AdminReportPage>('GET', `/api/admin/reports?${qs({ status, page })}`),
  setReportStatus: (id: number, status: string, sameTarget: boolean) =>
    request<{ changed: number }>('PATCH', `/api/admin/reports/${id}`, { status, sameTarget }),
  /** 신고에서 바로 조치: 제재(없으면 null)·댓글 삭제 후 조치함으로(13.5) */
  actReport: (id: number, a: { sanction: SanctionKind | null; days: number | null; reason: string; deleteContent: boolean; sameTarget: boolean }) =>
    request<{ changed: number; report: AdminReport }>('POST', `/api/admin/reports/${id}/act`, a),
  settings: () => request<AdminSetting[]>('GET', '/api/admin/settings'),
  integrations: () => request<AdminIntegration[]>('GET', '/api/admin/integrations'),
  updateIntegration: (code: string, url: string) => request<AdminIntegration>('PATCH', `/api/admin/integrations/${code}`, { url }),
  emergencyList: () => request<AdminEmergency[]>('GET', '/api/admin/emergency'),
  createEmergency: (r: { message: string; messageEn: string | null; minutes: number }) => request<AdminEmergency>('POST', '/api/admin/emergency', r),
  cancelEmergency: (id: number) => request<AdminEmergency>('POST', `/api/admin/emergency/${id}/cancel`),
  notices: () => request<AdminNotice[]>('GET', '/api/admin/notices'),
  createNotice: (n: AdminNoticeInput) => request<AdminNotice>('POST', '/api/admin/notices', n),
  updateNotice: (id: number, n: AdminNoticeInput) => request<AdminNotice>('PUT', `/api/admin/notices/${id}`, n),
  deleteNotice: (id: number) => request<void>('DELETE', `/api/admin/notices/${id}`),
  guideCategories: () => request<AdminGuideCategory[]>('GET', '/api/admin/guide/categories'),
  createGuideCategory: (c: AdminGuideCategoryInput) => request<AdminGuideCategory>('POST', '/api/admin/guide/categories', c),
  updateGuideCategory: (id: number, c: AdminGuideCategoryInput) => request<AdminGuideCategory>('PUT', `/api/admin/guide/categories/${id}`, c),
  moveGuideCategory: (id: number, direction: -1 | 1) => request<AdminGuideCategory[]>('POST', `/api/admin/guide/categories/${id}/move`, { direction }),
  deleteGuideCategory: (id: number) => request<void>('DELETE', `/api/admin/guide/categories/${id}`),
  guideArticles: (categoryId: number) => request<AdminGuideArticle[]>('GET', `/api/admin/guide/categories/${categoryId}/articles`),
  createGuideArticle: (categoryId: number, a: AdminGuideArticleInput) => request<AdminGuideArticle>('POST', `/api/admin/guide/categories/${categoryId}/articles`, a),
  updateGuideArticle: (id: number, a: AdminGuideArticleInput) => request<AdminGuideArticle>('PUT', `/api/admin/guide/articles/${id}`, a),
  moveGuideArticle: (id: number, direction: -1 | 1) => request<AdminGuideArticle[]>('POST', `/api/admin/guide/articles/${id}/move`, { direction }),
  deleteGuideArticle: (id: number) => request<void>('DELETE', `/api/admin/guide/articles/${id}`),
  updateSetting: (name: string, value: string) => request<AdminSetting>('PATCH', `/api/admin/settings/${name}`, { value }),
};
