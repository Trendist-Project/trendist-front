import { ApiFailure } from '../api/client';

/** 관리자 화면 공통: 날짜는 "26. 10. 30. 오후 5:30"처럼 짧게, 오류는 서버 문구 그대로 */
export const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleString('ko-KR', { dateStyle: 'short', timeStyle: 'short' }) : '-');
export const errMsg = (e: unknown) => (e instanceof ApiFailure ? e.message : '요청에 실패했어요');
