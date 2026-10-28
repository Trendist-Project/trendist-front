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

export interface ApiError { code: string; message: string }
