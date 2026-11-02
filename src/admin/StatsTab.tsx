import { useCallback, useEffect, useState } from 'react';
import { adminApi, type StatPeriod, type StatRow, type StatSummary } from '../api/client';
import { BarChart, LineChart } from './charts';
import { errMsg } from './format';

/**
 * 관리자 통계(13.9): 지금 접속, 오늘·어제 비교, 시간별 접속 추이와 활동량, 하루별 추이, 사용자 구성, 레벨 분포.
 * 접속 인원은 10초마다 센 방 인원(봇 제외), 활동 인원은 그 시간·그날 한 번이라도 방에 있던 사람이다. 1분마다 다시 읽는다.
 */
const HOUR_RANGES: [number, string][] = [[24, '24시간'], [72, '3일'], [168, '7일']];
const DAY_RANGES: [number, string][] = [[14, '14일'], [30, '30일'], [90, '90일']];
const C = { online: '#4f8cff', avg: '#38bdf8', active: '#3fb68b', plus: '#3fb68b', search: '#f1c40f', chat: '#b388ff', orb: '#ffb020', collision: '#ff6b6b', comment: '#ff7eb6', share: '#22d3ee', fresh: '#a6e04a' };

const KST = 'Asia/Seoul';
const hourLabel = (iso: string, multiDay: boolean) => {
  const d = new Date(iso);
  const h = d.toLocaleString('ko-KR', { timeZone: KST, hour: 'numeric', hour12: false }).replace('시', '');
  if (!multiDay) return `${h}시`;
  const md = d.toLocaleString('ko-KR', { timeZone: KST, month: 'numeric', day: 'numeric' }).replace(/\s/g, '').replace(/\.$/, '');
  return `${md} ${h}시`;
};
const dayLabel = (date: string) => { const [, m, d] = date.split('-'); return `${Number(m)}/${Number(d)}`; };

function Delta({ now, before }: { now: number; before: number }) {
  if (before === 0 && now === 0) return <em>어제와 같아요</em>;
  const diff = now - before;
  const cls = diff > 0 ? 'up' : diff < 0 ? 'down' : '';
  return <em className={cls}>어제 {before.toLocaleString()} · {diff > 0 ? '▲' : diff < 0 ? '▼' : ''}{Math.abs(diff).toLocaleString()}</em>;
}

function Kpi({ label, value, children }: { label: string; value: number | string; children?: React.ReactNode }) {
  return <div className="admin-stat"><span>{label}</span><strong>{typeof value === 'number' ? value.toLocaleString() : value}</strong>{children}</div>;
}

const PERIOD_KPIS: [keyof StatPeriod, string][] = [
  ['activePlayers', '오늘 활동 인원'], ['peakOnline', '오늘 최고 동시 접속'], ['newPlayers', '오늘 새 플레이어'],
  ['plus', '키워드 추가'], ['search', '검색'], ['chat', '채팅'], ['comment', '댓글'], ['orb', '? 구슬'], ['collision', '충돌로 잃기'], ['share', '자랑하기 카드'],
];

export function StatsTab() {
  const [summary, setSummary] = useState<StatSummary | null>(null);
  const [hours, setHours] = useState(24);
  const [hourly, setHourly] = useState<StatRow[] | null>(null);
  const [days, setDays] = useState(30);
  const [daily, setDaily] = useState<StatRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadedAt, setLoadedAt] = useState<Date | null>(null);

  const load = useCallback(() => {
    Promise.all([adminApi.statsSummary(), adminApi.statsHourly(hours), adminApi.statsDaily(days)])
      .then(([s, h, d]) => { setSummary(s); setHourly(h); setDaily(d); setError(null); setLoadedAt(new Date()); })
      .catch((e) => setError(errMsg(e)));
  }, [hours, days]);
  useEffect(() => {
    load();
    const t = setInterval(load, 60_000);
    return () => clearInterval(t);
  }, [load]);

  const multiDay = hours > 24;
  const hLabels = hourly?.map((r) => hourLabel(r.t, multiDay)) ?? [];
  const dLabels = daily?.map((r) => dayLabel(r.t)) ?? [];
  const pick = (rows: StatRow[] | null, k: keyof StatRow) => rows?.map((r) => Number(r[k])) ?? [];
  const t = summary?.totals;

  return (
    <section className="admin-panel admin-stats">
      <div className="admin-stats-head">
        <div className="admin-live"><span className="dot" aria-hidden="true" />지금 접속 <strong>{summary?.onlineNow.toLocaleString() ?? '-'}</strong>명</div>
        <span className="muted small">{loadedAt ? `${loadedAt.toLocaleTimeString('ko-KR')} 기준 · 1분마다 새로 읽어요` : ''}</span>
        <button onClick={load}>새로고침</button>
      </div>
      {error && <p className="error">{error}</p>}

      <div className="admin-stat-row wide">
        {PERIOD_KPIS.map(([k, label]) => (
          <Kpi key={k} label={label} value={summary?.today[k] ?? '-'}>
            {summary && <Delta now={summary.today[k]} before={summary.yesterday[k]} />}
          </Kpi>
        ))}
      </div>

      <div className="admin-card">
        <div className="admin-card-head">
          <h2>시간별 접속 추이</h2>
          <div className="admin-filters">
            {HOUR_RANGES.map(([v, l]) => <button key={v} className={hours === v ? 'on' : undefined} onClick={() => setHours(v)}>{l}</button>)}
          </div>
        </div>
        <LineChart labels={hLabels} liveLast series={[
          { key: 'peak', label: '최고 동시 접속', color: C.online, values: pick(hourly, 'peakOnline') },
          { key: 'avg', label: '평균 동시 접속', color: C.avg, dashed: true, values: pick(hourly, 'avgOnline') },
          { key: 'active', label: '활동 인원', color: C.active, values: pick(hourly, 'activePlayers') },
        ]} />
        <p className="muted small">동시 접속은 10초마다 센 방 인원(봇 제외), 활동 인원은 그 시간에 한 번이라도 방에 있던 사람이에요. 마지막 점선은 지금 시간(집계 중)이에요.</p>
      </div>

      <div className="admin-card">
        <h2>시간별 활동량</h2>
        <LineChart labels={hLabels} liveLast series={[
          { key: 'plus', label: '키워드 추가', color: C.plus, values: pick(hourly, 'plus') },
          { key: 'search', label: '검색', color: C.search, values: pick(hourly, 'search') },
          { key: 'chat', label: '채팅', color: C.chat, values: pick(hourly, 'chat') },
          { key: 'orb', label: '? 구슬', color: C.orb, dashed: true, values: pick(hourly, 'orb') },
          { key: 'collision', label: '충돌로 잃기', color: C.collision, dashed: true, values: pick(hourly, 'collision') },
          { key: 'comment', label: '댓글', color: C.comment, values: pick(hourly, 'comment') },
          { key: 'newPlayers', label: '새 플레이어', color: C.fresh, dashed: true, values: pick(hourly, 'newPlayers') },
        ]} />
        <p className="muted small">범례를 누르면 그 선을 숨기거나 다시 보여요.</p>
      </div>

      <div className="admin-card">
        <div className="admin-card-head">
          <h2>하루별 추이</h2>
          <div className="admin-filters">
            {DAY_RANGES.map(([v, l]) => <button key={v} className={days === v ? 'on' : undefined} onClick={() => setDays(v)}>{l}</button>)}
          </div>
        </div>
        <LineChart labels={dLabels} liveLast series={[
          { key: 'dau', label: '활동 인원(DAU)', color: C.active, values: pick(daily, 'activePlayers') },
          { key: 'peak', label: '최고 동시 접속', color: C.online, values: pick(daily, 'peakOnline') },
          { key: 'new', label: '새 플레이어', color: C.fresh, dashed: true, values: pick(daily, 'newPlayers') },
        ]} />
        <LineChart labels={dLabels} liveLast height={180} series={[
          { key: 'plus', label: '키워드 추가', color: C.plus, values: pick(daily, 'plus') },
          { key: 'search', label: '검색', color: C.search, values: pick(daily, 'search') },
          { key: 'chat', label: '채팅', color: C.chat, values: pick(daily, 'chat') },
          { key: 'comment', label: '댓글', color: C.comment, values: pick(daily, 'comment') },
          { key: 'share', label: '자랑하기 카드', color: C.share, dashed: true, values: pick(daily, 'share') },
        ]} />
        <p className="muted small">날짜는 한국 시간 기준이에요. 서버를 다시 켜면 그날 활동 인원이 조금 덜 셀 수 있어요.</p>
      </div>

      <div className="admin-grid-2">
        <div className="admin-card">
          <h2>사용자</h2>
          <div className="admin-stat-row">
            <Kpi label="전체 계정" value={t?.users ?? '-'} />
            <Kpi label="Google 계정" value={t?.google ?? '-'}>{t && t.users > 0 && <em>{((t.google / t.users) * 100).toFixed(1)}%</em>}</Kpi>
            <Kpi label="게스트" value={t?.guests ?? '-'} />
            <Kpi label="최근 7일 활동" value={t?.wau ?? '-'}><em>WAU</em></Kpi>
            <Kpi label="최근 30일 활동" value={t?.mau ?? '-'}><em>MAU</em></Kpi>
            <Kpi label="플레이어(KR)" value={t?.players ?? '-'} />
            <Kpi label="관리자" value={t?.admins ?? '-'} />
            <Kpi label="금지 중" value={t?.banned ?? '-'} />
            <Kpi label="탈퇴" value={t?.withdrawn ?? '-'} />
          </div>
        </div>
        <div className="admin-card">
          <h2>운영</h2>
          <div className="admin-stat-row">
            <Kpi label="처리 대기 신고" value={summary?.pendingReports ?? '-'} />
            {Object.entries(summary?.keywordStates ?? {}).map(([k, v]) => <Kpi key={k} label={`키워드 ${k}`} value={v} />)}
          </div>
          <h3>레벨 분포</h3>
          <BarChart labels={summary?.levels.map((b) => b.label) ?? []} values={summary?.levels.map((b) => b.count) ?? []} />
        </div>
      </div>
    </section>
  );
}
