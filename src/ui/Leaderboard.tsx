import { useEffect, useState } from 'react';
import { api } from '../api/client';
import type { RankingEntry } from '../api/types';

const REFRESH_MS = 3000; // 접속자 점수는 방 메모리 값이라 자주 바뀐다. 켜져 있는 동안만 다시 읽는다

interface Props { myPlayerId: number }

/** 리더보드(4.14): 지금 이 나라 방에 접속한 사람의 현재 유행도 TOP 10. 아레나 오른쪽 위에 겹쳐 보여 준다. */
export function Leaderboard({ myPlayerId }: Props) {
  const [ranking, setRanking] = useState<RankingEntry[] | null>(null);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const r = await api.rankings();
        if (alive) setRanking(r);
      } catch { /* 다음에 다시 */ }
    };
    load();
    const t = window.setInterval(load, REFRESH_MS);
    return () => { alive = false; clearInterval(t); };
  }, []);

  return (
    <section className="leaderboard" aria-label="리더보드">
      <h3>🏆 리더보드 <span className="muted small">TOP 10</span></h3>
      {ranking === null ? <p className="muted small">불러오는 중…</p>
        : ranking.length === 0 ? <p className="muted small">아직 접속한 사람이 없어요</p>
        : (
          <ol className="list ranking">
            {ranking.map((r) => (
              <li key={r.playerId} className={r.playerId === myPlayerId ? 'me' : undefined}>
                <span className="rank">{r.rank}</span> <strong>{r.nickname}</strong>
                <span className="muted small">{r.level}레벨</span>
                <span className="score">{Number(r.score).toFixed(1)}</span>
              </li>
            ))}
          </ol>
        )}
    </section>
  );
}
