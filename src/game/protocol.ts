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

export type ServerMessage =
  | { type: 'welcome'; entityNo: number; playerId: number; x: number; y: number; score: number; level: number }
  | ({ type: 'tuning' } & Tuning)
  | { type: 'roster'; players: { e: number; nickname: string; level: number }[] }
  | { type: 'score'; score: number; exp: number; level: number; holdCount: number }
  | { type: 'lost'; keyword: string; by: string };
