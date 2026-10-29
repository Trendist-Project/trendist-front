export interface TokenResponse { accessToken: string; expiresIn: number }

export interface PlayerSummary {
  id: number;
  nickname: string;
  countryCode: string;
  level: number;
  exp: number;
  nextLevelExp: number;
  currentScore: number;
  holdCount: number;
  totalPlusCount: number;
  commentScore: number;
  /** 다음에 닉네임을 바꿀 수 있는 시각. null이면 지금 바꿀 수 있다. */
  nicknameChangeableAt: string | null;
}

export interface Me { userId: number; guest: boolean; player: PlayerSummary | null }

/** 키워드 상태 이름(서버의 keyword_states.name). */
export type KeywordState = '활성' | '비활성' | '금지';

export interface KeywordCard {
  id: number | null;
  text: string;
  state: KeywordState;
  trendValue: number;
  holderCount: number;
  totalPlusCount: number;
  searchCount: number;
  plusedByMe: boolean;
  myExpiresAt: string | null;
}

export interface SearchResult { status: 'FOUND' | 'NEW' | 'BANNED'; keyword: KeywordCard | null }

export interface PlusResult { keyword: KeywordCard; gained: number; player: PlayerSummary }

export interface MyKeyword {
  keywordId: number;
  text: string;
  state: KeywordState;
  trendValue: number;
  plusedAt: string;
  expiresAt: string;
}

/** 활동 그래프의 점(9.9). t는 구간 시작, search·plus는 구간 증분, holders는 구간 끝의 가진 사람 수. live면 집계 중. */
export interface ActivityPoint { t: string; search: number; plus: number; holders: number; live: boolean }
export type ActivityRange = '24h' | '7d' | '30d' | '180d';
export interface Activity { range: ActivityRange; timezone: string; points: ActivityPoint[]; totalSearch: number; totalPlus: number; holders: number }

/** 키워드 댓글(4.12). 삭제·탈퇴 댓글은 body가 안내 문구로 온다. */
export interface CommentItem {
  id: number; nickname: string; body: string; likeCount: number; dislikeCount: number;
  myVote: 'LIKE' | 'DISLIKE' | null; mine: boolean; editable: boolean; deleted: boolean; withdrawn: boolean; edited: boolean; createdAt: string;
}
export interface CommentPage { items: CommentItem[]; page: number; totalPages: number; total: number }
export interface VoteResult { myVote: 'LIKE' | 'DISLIKE' | null; likeCount: number; dislikeCount: number }

export interface RankingEntry { rank: number; playerId: number; nickname: string; level: number; score: number }

/** 게임 가이드(4.17). displayType: FAQ(아코디언) 또는 ARTICLE(문서형). */
export interface GuideCategory { code: string; name: string; displayType: 'FAQ' | 'ARTICLE' }
export interface GuideArticle { id: number; title: string; body: string; updatedAt: string }

/** 공지사항(4.16). edited: 등록 뒤 고침("수정됨"), fresh: 최근 공지(NEW). */
export interface Notice { id: number; title: string; body: string; pinned: boolean; createdAt: string; edited: boolean; fresh: boolean }

export interface ApiError { code: string; message: string }
