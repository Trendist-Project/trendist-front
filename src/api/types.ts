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
  addCount: number;
  commentScore: number;
  /** 검색수 */
  searchCount: number;
  /** 다음에 닉네임을 바꿀 수 있는 시각. null이면 지금 바꿀 수 있다. */
  nicknameChangeableAt: string | null;
  /** 칭호·자랑하기 카드용 누적 기록: 빼앗은 횟수, 봇을 이긴 횟수, 활동한 날(4.10) */
  stealCount: number;
  botWinCount: number;
  activeDays: number;
  killCount: number; // 죽인 횟수(4.31)
  deathCount: number; // 패배한 횟수(4.31)
  popularity: number; // 인기도(4.34)
  createdAt: string; // 플레이어 생성일
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
  addCount: number;
  searchCount: number;
  /** 공개 키워드 페이지(4.28) 조회수 */
  viewCount: number;
  plusedByMe: boolean;
  myExpiresAt: string | null;
  /** AI 한 줄 설명(4.12). 아직 없으면 null. aiCommentRequested: 내가 갱신 요청을 해 둔 상태 */
  aiComment: string | null;
  aiCommentRequested: boolean;
}

/** 관리자 AI 한 줄 설명(13.12) */
export interface AiCommentRow {
  keywordId: number; text: string; state: string; comment: string | null; by: 'AI' | 'ADMIN' | null; commentedAt: string | null;
  attempts: number; openRequests: number; lastRequestedAt: string | null;
}
export interface AiCommentPage { items: AiCommentRow[]; total: number; page: number; size: number; aiEnabled: boolean }

export interface SearchResult { status: 'FOUND' | 'NEW' | 'BANNED'; keyword: KeywordCard | null }

/** gained: 이번 추가로 오른 유행도(정수). */
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
export interface Activity { range: ActivityRange; timezone: string; points: ActivityPoint[]; searchCount: number; addCount: number; holders: number }

/** 키워드 댓글(4.12). 삭제·탈퇴 댓글은 body가 안내 문구로 온다. */
export interface CommentItem {
  id: number; nickname: string; body: string; likeCount: number; dislikeCount: number;
  myVote: 'LIKE' | 'DISLIKE' | null; mine: boolean; editable: boolean; deleted: boolean; withdrawn: boolean; edited: boolean; createdAt: string;
}
export interface CommentPage { items: CommentItem[]; page: number; totalPages: number; total: number }
export interface VoteResult { myVote: 'LIKE' | 'DISLIKE' | null; likeCount: number; dislikeCount: number }

/** 내 점수 추이(4.15). 기록이 없는 칸은 직전 값, 마지막 점(live)은 지금 값. */
export type ScoreRange = '24h' | '7d' | '30d' | 'all';
export interface ScorePoint { t: string; score: number; live: boolean }
export interface ScoreHistory { range: ScoreRange; timezone: string; points: ScorePoint[] }

/** 같은 방 다른 플레이어 정보(4.11). entityNo는 방 안에서만 쓰는 번호, 키워드는 이름과 상태만. */
export interface KeywordTag { keywordId: number; text: string; state: KeywordState }
export interface PlayerCard {
  entityNo: number; nickname: string; title: string | null;
  level: number; score: number; commentScore: number; topKeywords: KeywordTag[];
  playerId: number; popularity: number; myVote: number; createdAt: string;
  /** 내 카드(자기 자신은 신고·인기도를 줄 수 없다) */
  me: boolean;
  /** 그 플레이어가 장착한 꾸미기 프로필의 원 모양(검색·채팅에서 열어 방에 그 원이 없어도 꾸민 모양을 보여 준다) */
  look?: { bg: string | null; borderColor: string | null; borderWidth: number | null; art: string | null; borderEffect: string | null } | null;
  /** 내 정보 창과 같은 구성으로 보이도록 함께 오는 기록(지금 레벨에서 모은 EXP·다음 레벨 필요량·활동·대결 횟수) */
  stats?: { exp: number; nextLevelExp: number; holdCount: number; addCount: number; searchCount: number; stealCount: number; botWinCount: number; killCount: number; deathCount: number; activeDays: number };
}
/** 플레이어 검색 결과(4.34). myVote: 오늘 내가 준 표(+1, -1, 없으면 0) */
export interface PlayerHit { playerId: number; nickname: string; level: number; score: number; popularity: number; me: boolean; myVote: number }
export interface PopularityResult { playerId: number; popularity: number; myVote: number }

export interface RankingEntry { rank: number; playerId: number; nickname: string; level: number; score: number }

/** 게임 가이드(4.17). displayType: FAQ(아코디언) 또는 ARTICLE(문서형). */
export interface GuideCategory { code: string; name: string; displayType: 'FAQ' | 'ARTICLE' }
export interface GuideArticle { id: number; title: string; body: string; updatedAt: string }

/** 공지사항(4.16). edited: 등록 뒤 고침("수정됨"), fresh: 최근 공지(NEW). */
export interface Notice { id: number; title: string; body: string; pinned: boolean; createdAt: string; edited: boolean; fresh: boolean; popup: boolean }

export interface ApiError { code: string; message: string }

/** 칭호(4.10). METRIC은 current / target 진행도, RANK는 target위 안(current 없음). */
export interface TitleItem {
  id: number; name: string; description: string; conditionType: 'METRIC' | 'RANK'; metric: string;
  current: number; target: number; owned: boolean; acquiredAt: string | null; active: boolean;
}
/** 레벨 표시 옆 성장 아이콘의 바탕(4.9). color가 null이면 기본 거북이 색, alpha는 진하기 0~100(%), rainbow면 무지개 그라데이션 */
export interface LevelBadge { level: number; color: string | null; alpha: number; rainbow: boolean }
export interface TitleBox { activeTitleId: number | null; titles: TitleItem[] }

/**
 * 원의 모습(4.9). borderEffect·trailEffect: 테두리·이동 효과 코드, nameColor·nameStyle: 이름표 글자색과 모양(RIBBON / GLOW),
 * art: 픽셀 그림 이미지 주소. null이면 기본
 */
export interface Look {
  background: string; borderColor: string | null; borderWidth: number | null; art?: string | null;
  borderEffect?: string | null; nameColor?: string | null; nameStyle?: string | null; trailEffect?: string | null;
}
/** 픽셀 그림(4.9): palette는 #rrggbb, pixels는 32×32 = 1024글자(팔레트 번호 0-9a-v, '.' 투명) */
export interface PixelArtData { palette: string[]; pixels: string }
/** 고를 수 있는 효과 하나(이동·테두리). 잠겼으면 lockReason */
export interface EffectOption { id: number; code: string; name: string; unlocked: boolean; lockReason: string | null }
/** 꾸미기 프로필 한 칸. inner: 원 안에 그릴 것(GROWTH 성장 캐릭터 / PIXEL 내 그림) */
export interface ProfileSlot {
  slot: number; saved: boolean; equipped: boolean; inner: 'GROWTH' | 'PIXEL'; look: Look; art: PixelArtData | null;
  trailEffectId: number | null; borderEffectId: number | null; savedAt: string | null;
}
/** 내 꾸미기 프로필 1~3번 칸. unlocked: 꾸밀 수 있는 레벨인지, canDraw: 그림을 저장할 수 있는지(로그인·정지 아님) */
export interface ProfileBox {
  slots: ProfileSlot[]; equippedSlot: number; unlocked: boolean; unlockLevel: number; defaults: Look; colors: string[]; nameStyles: string[];
  canDraw: boolean; drawLockReason: string | null; artChangeableAt: string | null; artSize: number; maxColors: number;
  trails: EffectOption[]; borders: EffectOption[];
}
export interface ProfileSave {
  background: string; borderColor: string | null; borderWidth: number | null; nameColor: string | null; nameStyle: string | null;
  inner: 'GROWTH' | 'PIXEL'; art: PixelArtData | null; trailEffectId: number | null; borderEffectId: number | null; equip: boolean;
}

/** 자랑하기 카드 공유 주소(4.24). url은 공유 페이지, imageUrl은 서버가 그린 카드 이미지 */
/** totalViews·totalPlays: 내가 만든 모든 카드의 조회·[플레이 하러 가기] 클릭 합계 */
export interface ShareCardCreated { code: string; url: string; imageUrl: string; totalViews: number; totalPlays: number }

/** 긴급 안내(4.29): 모든 사용자의 게임 화면 맨 위에 흘러간다. remainingSeconds는 서버 시계 기준 남은 시간 */
export interface EmergencyNotice { id: number; message: string; messageEn: string | null; endsAt: string; remainingSeconds: number }

/** 스킬 한 개(4.33): DB(skills)에서 온다. defaultKey는 KeyboardEvent.code(Space, Digit1 …), cooldownSeconds는 DB의 쿨타임. 이름·설명은 번역 파일(skills.<코드>_name·_desc)에서 코드로 찾는다 */
/** 내 단축키(4.33): 동작마다 지금 키(KeyboardEvent.code, null이면 비움)와 기본 키를 쓰는지, 그리고 쓸 수 있는 키 목록 */
export interface KeyBindingInfo { action: string; type: string; param: number | null; key: string | null; usingDefault: boolean }
export interface KeyInfo { code: string; label: string; category: string; reserved: boolean; aliasOf: string | null }
export interface KeybindingsResponse { bindings: KeyBindingInfo[]; keys: KeyInfo[] }

export interface SkillInfo { code: string; icon: string | null; category: string; defaultKey: string; cooldownSeconds: number; requiredLevel: number }
