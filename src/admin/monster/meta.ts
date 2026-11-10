import type { AdminMonsterSetting } from '../../api/client';

/** 몬스터 분류(monster_types.kind) 표시. 모르는 분류는 코드 그대로 보인다 */
export const KIND_LABEL: Record<string, string> = { BOSS: '보스', ELITE: '정예', NORMAL: '일반', EVENT: '이벤트' };
export const KIND_ICON: Record<string, string> = { BOSS: '👑', ELITE: '⭐', NORMAL: '👾', EVENT: '🎉' };
export const kindLabel = (k: string) => KIND_LABEL[k] ?? k;
export const kindIcon = (k: string) => KIND_ICON[k] ?? '👾';

export const num = (n: number) => n.toLocaleString('ko-KR');
export const fmtVal = (n: number) => String(Number(n.toFixed(4)));
export const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

export type SettingMap = Record<string, number>;
export const settingMap = (items: AdminMonsterSetting[]): SettingMap => Object.fromEntries(items.map((s) => [s.name, s.value]));

/**
 * 패턴(공격 기술) 표시 정보. **약속**: 패턴 `<코드>`는 설정 `<코드>_weight`(선택 가중치)와 `<코드>_cooldown`(쿨타임)을 가지고, 그 설정의 그룹이 패턴 이름이다.
 * 예고 `<코드>_windup`, 지속 `<코드>_seconds` 같은 이름이 있으면 타임라인에 함께 그린다. 이 약속만 지키면 새 몬스터의 패턴이 코드 수정 없이 이 화면에 나타난다.
 * 아래 표는 그림(도식)과 아이콘을 고르는 선택 사항이다(없으면 ⚔️와 기본 그림).
 */
export const PATTERN_META: Record<string, { icon: string; diagram: 'line' | 'ring' | 'generic'; hint: string }> = {
  dash: { icon: '💨', diagram: 'line', hint: '대상을 향해 일직선으로 돌진' },
  ring: { icon: '🌊', diagram: 'ring', hint: '몸에서 맵 전체로 퍼지는 충격파' },
};

export interface Pattern { code: string; name: string; icon: string; diagram: 'line' | 'ring' | 'generic'; hint: string; settings: AdminMonsterSetting[] }

export function derivePatterns(settings: AdminMonsterSetting[]): Pattern[] {
  const names = new Set(settings.map((s) => s.name));
  const out: Pattern[] = [];
  for (const s of settings) {
    if (!s.name.endsWith('_weight')) continue;
    const code = s.name.slice(0, -'_weight'.length);
    if (!names.has(`${code}_cooldown`)) continue; // 체력 계산의 hp_top_weight 같은 것은 패턴이 아니다
    const meta = PATTERN_META[code];
    out.push({ code, name: s.group, icon: meta?.icon ?? '⚔️', diagram: meta?.diagram ?? 'generic', hint: meta?.hint ?? '', settings: settings.filter((x) => x.group === s.group) });
  }
  return out;
}

export interface Seg { label: string; seconds: number | null; tone: 'warn' | 'act' | 'rest'; note?: string }

/** 패턴 하나의 시간 흐름: 예고 → 실행 → 경직(공통). 모르는 칸은 건너뛴다 */
export function timelineOf(code: string, m: SettingMap): Seg[] {
  const segs: Seg[] = [];
  if (m[`${code}_windup`] !== undefined) segs.push({ label: '예고', seconds: m[`${code}_windup`], tone: 'warn' });
  if (m[`${code}_seconds`] !== undefined) segs.push({ label: '실행', seconds: m[`${code}_seconds`], tone: 'act' });
  else if (m[`${code}_range_px`] !== undefined && m[`${code}_speed`]) {
    const range = m[`${code}_range_px`];
    segs.push({ label: '확산', seconds: range > 0 ? range / m[`${code}_speed`] : null, tone: 'act', note: range > 0 ? undefined : '맵 끝까지' });
  }
  if (m.recover_seconds !== undefined) segs.push({ label: '경직', seconds: m.recover_seconds, tone: 'rest' });
  return segs;
}

/** 서버 체력 공식(ElderTurtle.spawn)과 같은 식으로 미리 계산한다. 필요한 설정이 없으면 null */
export function previewHp(m: SettingMap, players: number, avg: number, top: number): number | null {
  const need = ['hp_participation_rate', 'hp_hits_per_player', 'hp_flame_ratio', 'hp_top_weight', 'hp_margin', 'hp_min_players', 'hp_min', 'hp_max', 'flame_damage_mult'];
  if (need.some((k) => m[k] === undefined)) return null;
  const n = Math.max(players, m.hp_min_players);
  const ref = avg * (1 - m.hp_top_weight) + top * m.hp_top_weight;
  const perHit = m.hp_flame_ratio * m.flame_damage_mult + (1 - m.hp_flame_ratio);
  const raw = n * m.hp_participation_rate * m.hp_hits_per_player * ref * perHit * m.hp_margin;
  return Math.round(Math.min(m.hp_max, Math.max(m.hp_min, raw)));
}
