import { useCallback, useEffect, useState } from 'react';
import { adminApi, type Dashboard, type StatPeriod, type StatRow } from '../api/client';
import { STATE_BADGE } from '../ui/keywordFormat';
import { Sparkline } from './charts';
import { errMsg, fmt } from './format';

/**
 * 관리자 대시보드(13.11): 관리자 화면을 열면 처음 보이는 탭. 한눈에 볼 것만 항목으로 모은다.
 * 실시간 현황 → 처리할 일 → 오늘 활동(24시간 추이) → 키워드 → 사람(리더보드·새 플레이어·신고 많이 받은 사람) → 콘텐츠.
 * 항목을 누르면 자세히 보는 탭으로 간다. 30초마다 다시 읽는다.
 */
type Go = (tab: string, opts?: { userId?: number; filter?: string }) => void;

const ago = (iso: string | null) => {
  if (!iso) return '-';
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return '방금';
  if (m < 60) return `${m}분 전`;
  if (m < 1440) return `${Math.floor(m / 60)}시간 전`;
  return `${Math.floor(m / 1440)}일 전`;
};

function Compare({ now, before }: { now: number; before: number }) {
  const diff = now - before;
  if (diff === 0) return <em>어제와 같아요</em>;
  return <em className={diff > 0 ? 'up' : 'down'}>어제보다 {diff > 0 ? '▲' : '▼'}{Math.abs(diff).toLocaleString()}</em>;
}

const ACTIVITY: [keyof StatPeriod, keyof StatRow, string, string][] = [
  ['plus', 'plus', '키워드 추가', '#3fb68b'], ['search', 'search', '검색', '#f1c40f'],
  ['chat', 'chat', '채팅', '#b388ff'], ['comment', 'comment', '댓글', '#ff7eb6'],
  ['orb', 'orb', '? 구슬', '#ffb020'], ['collision', 'collision', '충돌로 잃기', '#ff6b6b'],
];

export function DashboardTab({ onGo }: { onGo: Go }) {
  const [d, setD] = useState<Dashboard | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    adminApi.dashboard().then((x) => { setD(x); setError(null); }).catch((e) => setError(errMsg(e)));
  }, []);
  useEffect(() => {
    load();
    const t = setInterval(load, 30_000);
    return () => clearInterval(t);
  }, [load]);

  if (!d) return <section className="admin-panel">{error ? <p className="error">{error}</p> : <p className="muted">불러오는 중…</p>}</section>;
  const series = (k: keyof StatRow) => d.hourly.map((r) => Number(r[k]));
  const t = d.totals;
  const alerts = d.todos.filter((x) => x.level !== 'ok').length;

  return (
    <section className="admin-panel admin-dash">
      <div className="admin-stats-head">
        <h2>대시보드</h2>
        <span className="muted small">{new Date(d.at).toLocaleTimeString('ko-KR')} 기준 · 30초마다 새로 읽어요</span>
        <button onClick={load}>새로고침</button>
      </div>
      {error && <p className="error">{error}</p>}

      {/* 1. 실시간 현황 */}
      <div className="dash-row">
        <button className="dash-tile live" onClick={() => onGo('stats')}>
          <span>지금 접속</span>
          <strong><i className="dot" aria-hidden="true" />{d.onlineNow.toLocaleString()}</strong>
          <em>오늘 최고 동시 접속 {d.today.peakOnline.toLocaleString()}</em>
        </button>
        <button className="dash-tile" onClick={() => onGo('stats')}>
          <span>오늘 활동 인원</span><strong>{d.today.activePlayers.toLocaleString()}</strong>
          <Compare now={d.today.activePlayers} before={d.yesterday.activePlayers} />
        </button>
        <button className="dash-tile" onClick={() => onGo('users', { filter: 'all' })}>
          <span>오늘 새 플레이어</span><strong>{d.today.newPlayers.toLocaleString()}</strong>
          <Compare now={d.today.newPlayers} before={d.yesterday.newPlayers} />
        </button>
        <button className="dash-tile" onClick={() => onGo('stats')}>
          <span>최근 7일 / 30일 활동</span><strong>{t.wau.toLocaleString()} <small>/ {t.mau.toLocaleString()}</small></strong>
          <em>전체 계정 {t.users.toLocaleString()} · Google {t.google.toLocaleString()}</em>
        </button>
      </div>

      {/* 2. 처리할 일 */}
      <div className="admin-card">
        <div className="admin-card-head">
          <h2>처리할 일</h2>
          <span className={alerts > 0 ? 'dash-badge warn' : 'dash-badge ok'}>{alerts > 0 ? `살펴볼 것 ${alerts}개` : '모두 괜찮아요'}</span>
        </div>
        <ul className="dash-todos">
          {d.todos.map((x) => (
            <li key={x.key} className={`lv-${x.level}`}>
              <button disabled={!x.tab} onClick={() => x.tab && onGo(x.tab, { filter: x.filter ?? undefined })}>
                <i aria-hidden="true">{x.level === 'danger' ? '🔴' : x.level === 'warn' ? '🟡' : '🟢'}</i>
                <span className="dash-todo-label">{x.label}{x.detail && <small>{x.detail}</small>}</span>
                {x.key !== 'google' && <strong>{x.count.toLocaleString()}</strong>}
                {x.tab && <span className="dash-go" aria-hidden="true">›</span>}
              </button>
            </li>
          ))}
        </ul>
        {d.reported.length > 0 && (
          <>
            <h3>최근 7일 신고를 많이 받은 사람</h3>
            <ol className="dash-list">
              {d.reported.map((r) => (
                <li key={r.playerId}>
                  <button onClick={() => onGo('users', { userId: r.userId })}>
                    <span>{r.nickname} <span className="muted small">#{r.userId}</span></span><strong className={r.reports >= 3 ? 'warn' : undefined}>{r.reports}건</strong>
                  </button>
                </li>
              ))}
            </ol>
          </>
        )}
      </div>

      {/* 3. 오늘 활동(최근 24시간 추이) */}
      <div className="admin-card">
        <div className="admin-card-head">
          <h2>오늘 활동</h2>
          <button className="link-like" onClick={() => onGo('stats')}>자세히 ›</button>
        </div>
        <div className="dash-activity">
          {ACTIVITY.map(([pk, rk, label, color]) => (
            <div key={pk} className="dash-spark">
              <span>{label}</span>
              <strong>{d.today[pk].toLocaleString()}</strong>
              <Compare now={d.today[pk]} before={d.yesterday[pk]} />
              <Sparkline values={series(rk)} color={color} />
            </div>
          ))}
        </div>
        <p className="muted small">그래프는 최근 24시간(시간별)이고 마지막 점은 지금 시간(집계 중)이에요.</p>
      </div>

      <div className="admin-grid-2">
        {/* 4. 키워드 */}
        <div className="admin-card">
          <div className="admin-card-head">
            <h2>키워드</h2>
            <button className="link-like" onClick={() => onGo('keywords')}>키워드 탭 ›</button>
          </div>
          <div className="dash-chips">
            {Object.entries(d.keywordStates).map(([k, v]) => <span key={k} className="chip">{STATE_BADGE[k] ?? k} <strong>{v.toLocaleString()}</strong></span>)}
            <span className="chip">오늘 새 키워드 <strong>{d.newKeywordsToday.toLocaleString()}</strong></span>
          </div>
          {d.googleEnabled && (
            <p className="small">구글 실시간 인기: {d.googleFetchedAt ? `${ago(d.googleFetchedAt)}에 읽음` : <span className="warn">아직 읽지 못함</span>}</p>
          )}
          <h3>가장 많이 가진 🔥 키워드</h3>
          <ol className="dash-list">
            {d.hotKeywords.map((k) => (
              <li key={k.id}><span>{k.text} <span className="muted small">{k.source}</span></span><strong>👥 {k.holderCount.toLocaleString()} · {k.trendValue}점</strong></li>
            ))}
            {d.hotKeywords.length === 0 && <li className="muted">🔥 키워드가 없어요</li>}
          </ol>
        </div>

        {/* 5. 사람 */}
        <div className="admin-card">
          <h2>지금 리더보드</h2>
          <ol className="dash-list">
            {d.leaderboard.map((r) => (
              <li key={r.playerId}><span>{r.rank}. {r.nickname} <span className="muted small">Lv.{r.level}</span></span><strong>{r.score.toLocaleString()}</strong></li>
            ))}
            {d.leaderboard.length === 0 && <li className="muted">지금 접속한 사람이 없어요</li>}
          </ol>
          <div className="admin-card-head">
            <h3>새로 들어온 플레이어</h3>
            <button className="link-like" onClick={() => onGo('users', { filter: 'all' })}>사용자 탭 ›</button>
          </div>
          <ol className="dash-list">
            {d.newPlayers.map((p) => (
              <li key={p.playerId}>
                <button onClick={() => onGo('users', { userId: p.userId })}>
                  <span>{p.nickname} <span className="muted small">{p.type === 'GOOGLE' ? 'Google' : '게스트'} · Lv.{p.level}</span></span>
                  <span className="muted small">{ago(p.createdAt)}</span>
                </button>
              </li>
            ))}
          </ol>
        </div>
      </div>

      {/* 6. 콘텐츠 */}
      <div className="admin-grid-2">
        <div className="admin-card">
          <div className="admin-card-head">
            <h2>공지</h2>
            <button className="link-like" onClick={() => onGo('notices')}>공지 탭 ›</button>
          </div>
          <ol className="dash-list">
            {d.notices.map((n) => (
              <li key={n.id}>
                <span>{n.pinned && '📌 '}{n.title}</span>
                <span className="muted small">{n.popup && <span className="dash-badge ok">🔔 팝업 중</span>} {fmt(n.createdAt).slice(0, 10)}</span>
              </li>
            ))}
            {d.notices.length === 0 && <li className="muted">공지가 없어요</li>}
          </ol>
        </div>
        <button className="admin-card dash-card-button" onClick={() => onGo('share')}>
          <h2>자랑하기 카드</h2>
          <div className="dash-chips">
            <span className="chip">오늘 만든 카드 <strong>{d.share.today.toLocaleString()}</strong></span>
            <span className="chip">전체 카드 <strong>{d.share.cards.toLocaleString()}</strong></span>
            <span className="chip">조회 <strong>{d.share.views.toLocaleString()}</strong></span>
            <span className="chip">게임으로 들어옴 <strong>{d.share.plays.toLocaleString()}</strong></span>
            <span className="chip">클릭률 <strong>{d.share.views > 0 ? `${((d.share.plays / d.share.views) * 100).toFixed(1)}%` : '-'}</strong></span>
          </div>
        </button>
      </div>
    </section>
  );
}
