/** 서버 스냅샷(big-endian): [u8 1][u32 tick][f32 half][u16 n] + n × [u32 e][f32 x][f32 y][f32 r][f32 score][u16 level][u8 me] */
export interface EntityState { e: number; x: number; y: number; r: number; score: number; level: number; me: boolean }
export interface Snapshot { tick: number; half: number; entities: EntityState[]; receivedAt: number }

const ENTITY_SIZE = 23;

export function parseSnapshot(buf: ArrayBuffer): Snapshot | null {
  const v = new DataView(buf);
  if (v.byteLength < 11 || v.getUint8(0) !== 1) return null;
  const n = v.getUint16(9);
  if (v.byteLength < 11 + n * ENTITY_SIZE) return null;
  const entities: EntityState[] = [];
  for (let i = 0; i < n; i++) {
    const o = 11 + i * ENTITY_SIZE;
    entities.push({
      e: v.getUint32(o),
      x: v.getFloat32(o + 4),
      y: v.getFloat32(o + 8),
      r: v.getFloat32(o + 12),
      score: v.getFloat32(o + 16),
      level: v.getUint16(o + 20),
      me: v.getUint8(o + 22) === 1,
    });
  }
  return { tick: v.getUint32(1), half: v.getFloat32(5), entities, receivedAt: performance.now() };
}

/** 미니맵(1초마다): [u8 2][u8 n] + n × [u32 e][f32 x][f32 y][f32 r]. 큰 아이콘 상위 20명, 큰 순서 */
export interface MinimapEntry { e: number; x: number; y: number; r: number }

const MINIMAP_ENTRY_SIZE = 16;

export function parseMinimap(buf: ArrayBuffer): MinimapEntry[] | null {
  const v = new DataView(buf);
  if (v.byteLength < 2 || v.getUint8(0) !== 2) return null;
  const n = v.getUint8(1);
  if (v.byteLength < 2 + n * MINIMAP_ENTRY_SIZE) return null;
  const out: MinimapEntry[] = [];
  for (let i = 0; i < n; i++) {
    const o = 2 + i * MINIMAP_ENTRY_SIZE;
    out.push({ e: v.getUint32(o), x: v.getFloat32(o + 4), y: v.getFloat32(o + 8), r: v.getFloat32(o + 12) });
  }
  return out;
}

export interface Tuning {
  maxSpeed: number;
  minRadius: number;
  maxRadius: number;
  scoreCap: number;
  zoomFactor: number;
  worldSize: number;
}

/** 방에 있는 엔티티의 이름표. bot이면 NPC 봇(4.21): 키워드가 없고 점수는 서버 메모리에만 있다. */
/** title: 활성 칭호(4.10). bg·borderColor·borderWidth: 원의 꾸미기(4.9), 테두리가 null이면 기본 테두리. trail: 이동 효과 코드(4.23) */
export interface RosterEntry {
  e: number; nickname: string; level: number; bot?: boolean;
  title?: string | null; bg?: string; borderColor?: string | null; borderWidth?: number | null; trail?: string | null;
  /** 픽셀 그림 이미지 주소(4.9). 있으면 성장 캐릭터 대신 그린다 */
  art?: string | null;
  /** 테두리 효과 코드, 이름표 글자색·모양(4.9), 연속 빼앗기 콤보(4.25) */
  borderEffect?: string | null; nameColor?: string | null; nameStyle?: string | null; combo?: number;
}

/** 스킬 코드(4.33). 서버 Room.SKILLS와 같다 */
export type SkillId = string; // DB(skills)의 스킬 코드. 동작이 있는 코드는 서버 Room.SKILLS

/** skillFx: id마다 담긴 값이 다르다. 충격파 = 쓴 자리와 반지름·속도, 갈고리 = 방향·사거리·ms, hookHit = 맞은 원(t)과 끌려오는 ms, stealth = 은신(유령) 시작과 지속 ms */
export type SkillFx =
  | { id: 'shockwave'; e: number; x: number; y: number; r0: number; rMax: number; speed: number }
  | { id: 'hook'; e: number; dx: number; dy: number; range: number; ms: number }
  | { id: 'hookHit'; e: number; t: number; ms: number }
  | { id: 'hookEnd'; e: number }
  | { id: 'stealth'; e: number; ms: number }
  | { id: 'stealthEnd'; e: number }
  | { id: 'bolt'; kind: 'poison' | 'darkness'; bid: number; e: number; x: number; y: number; dx: number; dy: number; speed: number; range: number; radius: number } // 독·암흑 투사체가 날아간다
  | { id: 'boltEnd'; bid: number; hit?: number; x?: number; y?: number } // 투사체가 원(hit)에 맞았거나 사거리 끝에서 사라졌다
  | { id: 'poison'; t: number; stacks: number; ms: number } // 원(t)이 독에 걸렸다(스택 수, 다 지나가는 데 걸리는 ms)
  | { id: 'poisonEnd'; t: number }
  | { id: 'darkness'; t: number; ms: number } // 원(t)이 암흑에 걸렸다(모두에게 표시. 정화는 cleanse 신호로 지운다)
  | { id: 'cleanse'; e: number } // 정화를 썼다(초록 고리)
  | { id: 'heal'; e: number } // 회복을 썼다(그 원에 초록 + 표시. 내 것은 hp 메시지가 따로 띄우니 남의 것만 그린다)

/** 몬스터(보스, 4.35) 메시지. 상태는 5Hz, 나머지는 사건이 있을 때 온다 */
export type MonsterMessage =
  | ({ type: 'monster' } & import('./monsterFx').MonsterState)
  | { type: 'monsterAlert'; name: string; en: string; seconds: number } // 곧 나온다(나오기 전 예고)
  | { type: 'monsterSpawn'; id: number; name: string; en: string; max: number; durationMs: number }
  | ({ type: 'monsterFx' } & import('./monsterFx').MonsterFxMsg)
  | ({ type: 'monsterHit' } & import('./monsterFx').MonsterHitMsg) // 누가 보스를 쳐서 입힌 피해
  | { type: 'monsterEnd'; id: number; name: string; en: string; result: 'KILLED' | 'TIMEOUT' | 'REMOVED'; max: number; hp: number; top: { playerId: number; nickname: string; damage: number; hits: number }[] }
  | { type: 'monsterReward'; name: string; en: string; cleared: boolean; rank: number; damage: number; exp: number; keywords: string[] }; // 내 보상

export type ServerMessage =
  | MonsterMessage
  | { type: 'spectating'; country: string; spectators: number } // 관전 접속이 받아들여짐(관리자 관전, 13.13)
  | { type: 'welcome'; entityNo: number; playerId: number; x: number; y: number; score: number; level: number }
  | ({ type: 'tuning' } & Tuning)
  | { type: 'died'; by: string; byE: number; cause?: 'hp' } // 죽음(4.31): 키워드가 없는 채로 져서 죽었다(cause: hp면 체력이 모두 닳았다, 4.36). 죽인 쪽 이름
  | { type: 'hp'; e: number; hp: number; max: number; pct: number; heal?: number } // 내 체력(4.36): 바뀔 때마다. pct는 올림한 %, heal은 방금 회복한 %
  | { type: 'hps'; list: [number, number][] } // 체력바 공개(설정 hp_public)일 때 모두의 체력: [원 번호, %]. 목록에 없는 원은 100%
  | { type: 'hpHit'; e: number; by: number; dmg: number; pct: number } // 맞았다: 맞은 원, 때린 원, 깎인 %(최대 체력 기준), 남은 %
  | { type: 'kill'; target: string } // 내가 상대를 죽였다(4.31)
  | { type: 'levelFx'; e: number; level: number } // 레벨업 이펙트(4.30): 그 원에서 빛기둥이 솟는다
  | { type: 'dashFx'; e: number; ms: number } // 누군가 대시를 시작했다(4.27): 그 원에 강조 효과를 그린다
  | { type: 'dash'; ms: number; cooldownMs: number; mult: number } // 대시 시작(4.27): 지속 시간, 다시 쓸 수 있을 때까지, 속도 배수
  | { type: 'skill'; id: SkillId; cooldownMs: number } // 내가 스킬을 썼다(4.33): 다시 쓸 수 있을 때까지
  | { type: 'cooldowns'; skills: Record<string, number>; dashActiveMs: number; dashReadyMs: number; dashMult: number } // 다시 들어왔을 때 서버가 알려 주는 지금 쿨타임(남은 ms, 4.33)
  | { type: 'skillFail'; id: SkillId; reason: 'safe' | 'level' | 'unequipped' | 'hpFull'; level?: number } // 스킬을 쓸 수 없었다(세이프존 안의 공격 스킬)
  | { type: 'skillFx' } & SkillFx // 누군가 스킬을 썼다(4.33): 그 연출을 그린다
  | { type: 'loadout'; slots: (string | null)[] } // 장착한 스킬 4칸(4.33). 입장할 때와 바뀔 때마다 온다. 빈 칸은 null
  | { type: 'dark'; ms: number } // 내가 암흑에 맞았다(4.33): ms 동안 화면이 어두워진다
  | { type: 'darkEnd' } // 정화로 암흑이 풀렸다
  | { type: 'pullEnd' } // 정화로 갈고리에서 풀렸다
  | { type: 'pull'; ms: number; byE: number } // 내가 갈고리에 맞았다(4.33): 쓴 원 번호(byE)에게 ms 동안 끌려온다. 그동안 이동·스킬 불가
  | { type: 'roster'; players: RosterEntry[]; flameAt?: number }
  | { type: 'emote'; e: number; code: string } // 이모트(4.26)
  // 연속 빼앗기 콤보(4.25). event: up(+1) / start(flameAt에 닿아 불꽃이 붙음) / reset(잃어서 콤보 끝) / broken(잃어서 불꽃까지 꺼짐, by가 끈 사람)
  | { type: 'combo'; e: number; nickname: string; combo: number; event: 'up' | 'start' | 'reset' | 'broken' | 'expired'; flameAt: number; maxMs?: number; by?: string; byE?: number }
  | { type: 'emergency'; notice: import('../api/types').EmergencyNotice | null } // 긴급 안내가 올라오거나 끝났다(4.29). null이면 걷는다
  | { type: 'kicked'; message: string } // 관리자가 내보냄·계정 금지(13.10). 다시 연결하지 않는다
  | { type: 'titleGranted'; titleId: number; name: string; description: string } // 새 칭호를 받았다(4.10). titleId는 [장착하기]에 쓴다
  | { type: 'score'; score: number; exp: number; nextExp: number; level: number; holdCount: number } // exp = 지금 레벨에서 모은 EXP, nextExp = 다음 레벨에 필요한 EXP(최고 레벨이면 -1)
  | { type: 'lost'; by: string; keyword?: string; score: number; stolen?: boolean; wiped?: number; partial?: boolean; death?: boolean; poison?: boolean; monster?: boolean; count?: number } // 내가 잃음: 잃은 키워드와 점수(4.3). 독 스택으로 한 틱에 여러 개를 잃으면 count에 개수가 온다(키워드 이름은 오지 않고 score는 합계). stolen이면 상대가 빼앗아 감
  // 공격 성공: 상대가 잃은 키워드와 점수(봇은 이름 없음). 사람에게서 이기면 빼앗는다:
  // stolen ADDED = 내 보관함에 새로 들어감(gained = 늘어난 유행도), RENEWED = 이미 가진 키워드라 남은 시간만 24시간으로.
  // BOT = 봇을 이겨 🔥 키워드를 새로 얻음, BOT_RENEWED = 봇을 이겼는데 이미 가진 키워드라 남은 시간만 24시간으로
  | { type: 'hit'; target: string; keyword?: string; score: number; wiped?: number; partial?: boolean; stolen?: 'ADDED' | 'RENEWED' | 'BOT' | 'BOT_RENEWED'; gained?: number }
  | { type: 'shield'; e: number; ms: number }                         // 키워드를 잃은 원의 무적 시간(카운트다운)
  | { type: 'knock'; dx: number; dy: number; ms: number }             // 내 원이 튕김: 전체 밀려날 거리와 시간
  | { type: 'pong'; t: number }
  | { type: 'orbs'; orbs: [number, number, number, number?][] } // 마지막 값 1이면 ! 구슬
  | { type: 'orbSpawn'; id: number; x: number; y: number; prize?: boolean } // prize: ! 구슬
  | { type: 'orbEaten'; id: number; e: number }
  | { type: 'safeZones'; center: number; zones: [number, number, number, number, number][] } // 세이프존(4.22): 가운데 한 변, [번호, x, y, 한 변, 남은 ms]
  | ChatMessage
  | { type: 'chatHistory'; messages: ChatMessage[] }
  | { type: 'chatError'; code: string; message: string }
  | OrbResult;

/** 채팅 한 줄(4.13). e는 보낸 사람의 세션 엔티티 번호, at은 보낸 시각(ms). */
export interface ChatMessage { type: 'chat'; id: number; e: number; nickname: string; text: string; at: number }

/** ? 구슬을 먹은 결과(4.20). GAINED: 새로 보관함에, RENEWED: 이미 가진 키워드(만료시간만 갱신), LOST: 내 키워드 하나를 잃음(gained = 줄어든 유행도), MISS: 잃을 키워드도 없는 꽝, NONE: 🔥 키워드가 없음 */
export interface OrbResult {
  type: 'orbResult';
  status: 'GAINED' | 'RENEWED' | 'LOST' | 'MISS' | 'NONE';
  text?: string;
  state?: string;
  trendValue?: number;
  holderCount?: number;
  gained?: number;
}
