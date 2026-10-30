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
export interface RosterEntry { e: number; nickname: string; level: number; bot?: boolean }

export type ServerMessage =
  | { type: 'welcome'; entityNo: number; playerId: number; x: number; y: number; score: number; level: number }
  | ({ type: 'tuning' } & Tuning)
  | { type: 'roster'; players: RosterEntry[] }
  | { type: 'score'; score: number; exp: number; level: number; holdCount: number }
  | { type: 'lost'; by: string; keyword: string; score: number; stolen?: boolean } // 내가 잃음: 잃은 키워드와 점수(4.3). stolen이면 상대가 빼앗아 감
  // 공격 성공: 상대가 잃은 키워드와 점수(봇은 이름 없음). 사람에게서 이기면 빼앗는다:
  // stolen ADDED = 내 보관함에 새로 들어감(gained = 늘어난 유행도), RENEWED = 이미 가진 키워드라 남은 시간만 24시간으로
  | { type: 'hit'; target: string; keyword?: string; score: number; stolen?: 'ADDED' | 'RENEWED' | 'BOT'; gained?: number }
  | { type: 'shield'; e: number; ms: number }                         // 키워드를 잃은 원의 무적 시간(카운트다운)
  | { type: 'knock'; dx: number; dy: number; ms: number }             // 내 원이 튕김: 전체 밀려날 거리와 시간
  | { type: 'pong'; t: number }
  | { type: 'orbs'; orbs: [number, number, number][] }
  | { type: 'orbSpawn'; id: number; x: number; y: number }
  | { type: 'orbEaten'; id: number; e: number }
  | { type: 'safeZones'; center: number; zones: [number, number, number, number, number][] } // 세이프존(4.22): 가운데 한 변, [번호, x, y, 한 변, 남은 ms]
  | ChatMessage
  | { type: 'chatHistory'; messages: ChatMessage[] }
  | { type: 'chatError'; code: string; message: string }
  | OrbResult;

/** 채팅 한 줄(4.13). e는 보낸 사람의 세션 엔티티 번호, at은 보낸 시각(ms). */
export interface ChatMessage { type: 'chat'; id: number; e: number; nickname: string; text: string; at: number }

/** ? 구슬을 먹은 결과(4.20). GAINED: 새로 보관함에, DUPLICATE: 이미 가진 키워드(변화 없음), MISS: 꽝, NONE: 🔥 키워드가 없음 */
export interface OrbResult {
  type: 'orbResult';
  status: 'GAINED' | 'DUPLICATE' | 'MISS' | 'NONE';
  text?: string;
  state?: string;
  trendValue?: number;
  holderCount?: number;
  gained?: number;
}
