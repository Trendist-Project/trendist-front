import { mmss, num, type SettingMap } from './meta';

/** 켜짐/꺼짐 스위치(role="switch"): 트랙과 손잡이로 상태가 한눈에 보이고, 글자("켜짐/꺼짐")도 함께 보인다. compact는 목록 카드용 작은 모양 */
export function ScheduleSwitch({ enabled, onChange, compact = false, label = '정기 등장' }: { enabled: boolean; onChange: (on: boolean) => void; compact?: boolean; label?: string }) {
  return (
    <button type="button" role="switch" aria-checked={enabled} className={`mn-switch${enabled ? ' on' : ''}${compact ? ' compact' : ''}`} onClick={() => onChange(!enabled)}
            title={enabled ? '정해진 주기에 자동으로 나와요. 누르면 꺼요' : '자동으로 나오지 않아요. 누르면 켜요'}>
      <span className="mn-switch-track" aria-hidden="true"><i /></span>
      <span className="mn-switch-text"><b>{label}</b><small>{enabled ? '켜짐' : '꺼짐'}</small></span>
    </button>
  );
}

/** 상세 머리의 정기 등장 안내 카드: 스위치와 지금 설정에서 읽은 등장 일정 문장(주기·정각·최소 인원·제한 시간·예고)을 보여 준다 */
export function SchedulePanel({ enabled, onChange, m }: { enabled: boolean; onChange: (on: boolean) => void; m: SettingMap }) {
  const has = m.interval_minutes !== undefined;
  const every = has ? (m.interval_minutes === 60 ? '매시' : `${num(m.interval_minutes)}분마다`) : '';
  const at = has && m.interval_minutes === 60 ? (m.offset_minutes ? `${m.offset_minutes}분에` : '정각에') : has && m.offset_minutes ? `정각 +${m.offset_minutes}분 기준으로` : '';
  return (
    <div className={`mn-schedule${enabled ? ' on' : ' off'}`}>
      <ScheduleSwitch enabled={enabled} onChange={onChange} />
      <p>
        {enabled
          ? <>{has ? <><b>{every} {at}</b> 접속자 <b>{m.min_players ?? 1}명 이상</b>이면 자동으로 나와요.{m.announce_seconds ? <> {m.announce_seconds}초 전에 예고하고, </> : ' '}{m.duration_seconds ? <><b>{mmss(m.duration_seconds)}</b> 안에 처치해야 해요.</> : null}</> : '정해진 주기에 자동으로 나와요.'}</>
          : <>자동으로 나오지 않아요. <b>[즉시 소환]</b>으로만 불러낼 수 있어요. 켜면 {has ? <>{every} {at} 나와요.</> : '정해진 주기에 나와요.'}</>}
      </p>
    </div>
  );
}
