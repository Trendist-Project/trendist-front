import { useState, type FormEvent } from 'react';
import { api, ApiFailure } from '../api/client';
import type { PlayerHit } from '../api/types';
import { fmtNumber, t } from '../i18n';
import { PlayerInfoModal } from './PlayerInfoModal';

/** 닉네임으로 같은 나라 플레이어를 찾고 인기도를 올리거나 내린다(4.34). 접속 중이 아니어도 찾는다. */
export function PlayerSearch({ onOpenKeyword, onShare }: { onOpenKeyword(keywordId: number): void; onShare?(playerId: number, nickname: string): void }) {
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<PlayerHit[] | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState<number | null>(null);

  async function search(e: FormEvent) {
    e.preventDefault();
    const text = q.trim();
    if (!text || busy) return;
    setBusy(true); setMsg(null);
    try { setHits(await api.searchPlayers(text)); }
    catch (err) { setMsg(err instanceof ApiFailure ? err.message : t('side.searchFailed')); }
    finally { setBusy(false); }
  }

  return (
    <div className="tab-body">
      <form onSubmit={search} className="search-row">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('player.searchPlaceholder')} maxLength={40}
               aria-label={t('player.searchAria')} autoComplete="off" />
        <button className="primary" disabled={busy}>{t('side.searchBtn')}</button>
      </form>
      {msg && <p className="muted">{msg}</p>}
      {hits === null && !msg && <p className="muted small">{t('player.searchHint')}</p>}
      {hits !== null && hits.length === 0 && <p className="muted">{t('player.searchNone')}</p>}
      {hits !== null && hits.length > 0 && (
        <ul className="list player-hits">
          {hits.map((h) => (
            <li key={h.playerId} className="player-hit">
              <button className="player-hit-main" onClick={() => setOpen(h.playerId)} aria-label={t('player.detailOf', { name: h.nickname })}>
                <span><strong>{h.nickname}</strong>{h.me && <span className="badge">{t('player.me')}</span>}</span>
                <span className="muted small">{t('common.levelPrefix')}{h.level}{t('common.levelSuffix')} · {fmtNumber(h.score)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {open !== null && (
        <PlayerInfoModal entityNo={-1} playerId={open} onClose={() => setOpen(null)} onOpenKeyword={onOpenKeyword} onNotice={setMsg} onShare={onShare} />
      )}
    </div>
  );
}
