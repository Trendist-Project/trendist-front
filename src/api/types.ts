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
}

export interface Me { userId: number; guest: boolean; player: PlayerSummary | null }

/** 키워드 상태 이름(서버의 keyword_states.name). */
export type KeywordState = '활성' | '비활성' | '금지';

export interface KeywordCard {
  id: number | null;
  text: string;
  state: KeywordState;
  trendValue: number;
  score: number;
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
  score: number;
  plusedAt: string;
  expiresAt: string;
}

export interface RankingEntry { rank: number; playerId: number; nickname: string; level: number; score: number }

/** 게임 가이드(4.17). displayType: FAQ(아코디언) 또는 ARTICLE(문서형). */
export interface GuideCategory { code: string; name: string; displayType: 'FAQ' | 'ARTICLE' }
export interface GuideArticle { id: number; title: string; body: string; updatedAt: string }

/** 공지사항(4.16). edited: 등록 뒤 고침("수정됨"), fresh: 최근 공지(NEW). */
export interface Notice { id: number; title: string; body: string; pinned: boolean; createdAt: string; edited: boolean; fresh: boolean }

export interface ApiError { code: string; message: string }
