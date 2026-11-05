import { useEffect, useState } from 'react';
import { adminApi, ApiFailure } from '../api/client';

/** 관리자 화면 공통: 날짜는 "26. 10. 30. 오후 5:30"처럼 짧게, 오류는 서버 문구 그대로 */
export const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleString('ko-KR', { dateStyle: 'short', timeStyle: 'short' }) : '-');
export const errMsg = (e: unknown) => (e instanceof ApiFailure ? e.message : '요청에 실패했어요');

/** 관리자가 넣은 키워드의 유지 기간(설정 external_hold_hours, 시간). 한 번만 읽어 모든 화면이 나눠 쓴다 */
let holdHours: Promise<number | null> | null = null;
const loadHoldHours = () => (holdHours ??= adminApi.settings()
  .then((all) => { const n = Number(all.find((s) => s.name === 'external_hold_hours')?.value); return Number.isFinite(n) && n > 0 ? n : null; })
  .catch(() => { holdHours = null; return null; }));

/** 짧게 "7일" / "36시간", 길게 "7일(168시간)" / "36시간". 아직 못 읽었으면 "설정된 기간" */
export function useHoldText(): { short: string; long: string } {
  const [h, setH] = useState<number | null>(null);
  useEffect(() => { let on = true; loadHoldHours().then((v) => { if (on) setH(v); }); return () => { on = false; }; }, []);
  if (h === null) return { short: '설정된 기간', long: '설정된 기간' };
  const days = h % 24 === 0 ? h / 24 : null;
  return { short: days !== null ? `${days}일` : `${h}시간`, long: days !== null ? `${days}일(${h}시간)` : `${h}시간` };
}
