import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { api } from '../api/client';
import type { EmergencyNotice } from '../api/types';
import { getLang } from '../country';
import { t } from '../i18n';

/** 글자가 흘러가는 속도(화면 px/초). 천천히 읽을 수 있는 정도 */
const SPEED = 60;
const POLL_MS = 60_000;

/** 보여 줄 글: 영어 화면이고 영어판이 있으면 영어판, 아니면 한국어 */
export const emergencyText = (n: EmergencyNotice) => (getLang() === 'en' && n.messageEn ? n.messageEn : n.message);

/**
 * 긴급 안내 한 줄(4.29). 맨 위에 붙어 글이 오른쪽에서 왼쪽으로 천천히 흘러가고, 다 지나가면 처음부터 다시 흐른다.
 * 마우스를 올리면 멈춘다. 모션 줄이기 설정이면 흐르지 않고 가만히 보여 준다(길면 줄바꿈). 화면 낭독기는 흐르는 글자 대신 한 번만 읽는다.
 */
export function EmergencyBar({ text, preview = false }: { text: string; preview?: boolean }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);
  // preview: 관리자 화면의 미리 보기(낭독 알림을 띄우지 않는다)
  const [run, setRun] = useState<{ from: number; to: number; dur: number } | null>(null);
  const still = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

  // 칸 너비와 글자 너비를 재서, 오른쪽 끝에서 들어와 왼쪽 끝으로 완전히 나가는 거리와 시간을 정한다
  const measure = useCallback(() => {
    const wrap = wrapRef.current, span = textRef.current;
    if (!wrap || !span) return;
    const from = wrap.clientWidth, to = -span.scrollWidth;
    setRun({ from, to, dur: Math.max(10, (from - to) / SPEED) });
  }, []);
  useLayoutEffect(() => { if (!still) measure(); }, [text, still, measure]);
  useEffect(() => {
    if (still || !wrapRef.current) return;
    const ro = new ResizeObserver(measure);
    ro.observe(wrapRef.current);
    return () => ro.disconnect();
  }, [still, measure]);

  return (
    <div className={`emergency-bar${still ? ' still' : ''}${preview ? ' preview' : ''}`} role={preview ? undefined : 'alert'}>
      <span className="emergency-label" aria-hidden="true">🚨 {t('gamescreen.emergencyLabel')}</span>
      <span className="sr-only">{t('gamescreen.emergencyLabel')}: {text}</span>
      <div className="emergency-track" ref={wrapRef} aria-hidden="true">
        <span ref={textRef} className="emergency-text"
              style={run ? ({ '--from': `${run.from}px`, '--to': `${run.to}px`, animationDuration: `${run.dur}s` } as React.CSSProperties) : { visibility: 'hidden' }}>{text}</span>
      </div>
    </div>
  );
}

/**
 * 지금 보여 줄 긴급 안내를 들고 있는다. 열릴 때와 1분마다 서버에서 읽고(연결이 끊겼다 와도 맞춰진다), 서버가 올리거나 끝낼 때
 * 보내는 WebSocket 알림은 apply로 바로 반영한다. 끝나는 때는 서버가 준 남은 시간으로 정해(내 시계가 틀려도 맞다) 저절로 걷는다.
 */
export function useEmergency() {
  const [notice, setNotice] = useState<EmergencyNotice | null>(null);
  const timer = useRef(0);

  const apply = useCallback((n: EmergencyNotice | null) => {
    window.clearTimeout(timer.current);
    if (!n || n.remainingSeconds <= 0) { setNotice(null); return; }
    setNotice(n);
    timer.current = window.setTimeout(() => setNotice(null), n.remainingSeconds * 1000);
  }, []);

  useEffect(() => {
    let alive = true;
    const load = () => api.emergency().then((r) => { if (alive) apply(r.notice); }).catch(() => { /* 못 읽으면 지금 값을 그대로 둔다 */ });
    load();
    const poll = window.setInterval(load, POLL_MS);
    const onVisible = () => { if (document.visibilityState === 'visible') load(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { alive = false; window.clearInterval(poll); window.clearTimeout(timer.current); document.removeEventListener('visibilitychange', onVisible); };
  }, [apply]);

  return { notice, apply };
}
