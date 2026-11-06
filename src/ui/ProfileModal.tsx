import { useEffect, useState, type FormEvent } from 'react';
import { api, ApiFailure } from '../api/client';
import type { PlayerSummary, ScoreHistory, ScoreRange } from '../api/types';
import { GoogleButton } from './GoogleButton';
import { Modal } from './Modal';
import { ScoreChart } from './ScoreChart';
import { CustomizeView } from './CustomizeView';
import { ShareCardView } from './ShareCardView';
import { TitlesView } from './TitlesView';
import { WithdrawDialog } from './WithdrawDialog';
import { successToast } from './toast';
import { LevelText } from './LevelText';
import { intlLocale } from './keywordFormat';
import { getLang } from '../country';
import { fmtNumber, t } from '../i18n';

const SCORE_RANGES: [ScoreRange, string][] = [['24h', t('chart.range24h')], ['7d', t('chart.range7d')], ['30d', t('chart.range30d')], ['all', t('chart.rangeAll')]];

interface Props {
  player: PlayerSummary; onChanged(player: PlayerSummary): void; onClose(): void;
  guest: boolean; onLogout(): void; onWithdrawn(): void;
  /** 처음 열 화면. 새 칭호 알림의 [칭호 보기]는 칭호함으로 바로 연다 */
  initialView?: 'main' | 'titles';
}

const timeFormat = new Intl.DateTimeFormat(intlLocale(), { hour: 'numeric', minute: '2-digit', timeZone: getLang() === 'ko' ? 'Asia/Seoul' : undefined });

/** 내 정보(4.1): 지금 기록을 보여 주고 닉네임을 바꾼다. 변경 간격은 서버가 정하고, 화면은 다음 가능 시각만 안내한다. */
export function ProfileModal({ player, onChanged, onClose, guest, onLogout, onWithdrawn, initialView = 'main' }: Props) {
  // 칭호함·꾸미기·이동 효과·탈퇴 확인은 내 정보 창 대신 뜨는 창이다(창이 겹치면 ESC가 둘 다 닫는다)
  const [view, setView] = useState<'main' | 'titles' | 'customize' | 'share' | 'withdraw'>(initialView);
  const [activeTitle, setActiveTitle] = useState<string | null | undefined>(undefined);
  const [nickname, setNickname] = useState(player.nickname);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [range, setRange] = useState<ScoreRange>('24h');
  const [history, setHistory] = useState<ScoreHistory | null>(null);

  // 열 때 최신 기록(누적 검색 등)으로 한 번 다시 읽는다. 검색은 화면의 플레이어 요약을 바꾸지 않는다
  useEffect(() => {
    api.me().then((m) => { if (m.player) onChanged(m.player); }).catch(() => { /* 가진 값으로 보여 준다 */ });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 점수 추이(4.15): 기간을 바꾸면 다시 읽는다
  useEffect(() => {
    let alive = true;
    api.scoreHistory(range).then((h) => { if (alive) setHistory(h); }).catch(() => { if (alive) setHistory(null); });
    return () => { alive = false; };
  }, [range]);

  // 다음 변경 가능 시각이 지나면 버튼이 바로 풀리도록 30초마다 시계를 갱신한다
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  const changeableAt = player.nicknameChangeableAt ? new Date(player.nicknameChangeableAt) : null;
  const waiting = changeableAt !== null && changeableAt.getTime() > now;
  const unchanged = nickname.trim() === player.nickname;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy || waiting || unchanged) return;
    setBusy(true); setMessage(null);
    try {
      const p = await api.changeNickname(nickname);
      onChanged(p);
      setNickname(p.nickname);
      successToast(t('profile.nicknameChanged'));
    } catch (err) {
      setMessage({ text: err instanceof ApiFailure ? err.message : t('profile.nicknameFailed'), error: true });
    } finally {
      setBusy(false);
    }
  }

  // 달고 있는 칭호 이름(칭호함에서 바꾸고 돌아오면 다시 읽는다)
  useEffect(() => {
    if (view !== 'main') return;
    api.titles().then((b) => setActiveTitle(b.titles.find((t) => t.active)?.name ?? null)).catch(() => setActiveTitle(null));
  }, [view]);

  if (view === 'withdraw') return <WithdrawDialog onDone={onWithdrawn} onCancel={() => setView('main')} />;
  if (view === 'titles') return <TitlesView onBack={() => setView('main')} onClose={onClose} />;
  if (view === 'share') return <ShareCardView player={player} onBack={() => setView('main')} onClose={onClose} />;
  if (view === 'customize') return <CustomizeView level={player.level} nickname={player.nickname} onBack={() => setView('main')} onClose={onClose} />;

  return (
    <Modal title={t('profile.title')} onClose={onClose}>
      <dl className="profile-stats">
        <div><dt>{t('profile.nickname')}</dt><dd>{player.nickname}</dd></div>
        <div><dt>{t('profile.level')}</dt><dd><LevelText level={player.level} prefix={t('common.levelPrefix')} suffix={t('common.levelSuffix')} size={26} /></dd></div>
        <div><dt>EXP</dt><dd>{player.exp}{player.nextLevelExp > 0 ? ` / ${player.nextLevelExp}` : ''}</dd></div>
        <div><dt>{t('profile.myScore')}</dt><dd>{fmtNumber(Number(player.currentScore))}</dd></div>
        <div><dt>{t('profile.heldKeywords')}</dt><dd>{t('profile.countItems', { n: player.holdCount })}</dd></div>
        <div><dt>{t('profile.totalAdds')}</dt><dd>{t('profile.countTimes', { n: fmtNumber(player.totalPlusCount) })}</dd></div>
        <div><dt>{t('profile.totalSearches')}</dt><dd>{t('profile.countTimes', { n: fmtNumber(player.searchCount ?? 0) })}</dd></div>
        <div><dt>{t('profile.steals')}</dt><dd>{t('profile.countTimes', { n: fmtNumber(player.stealCount ?? 0) })}</dd></div>
        <div><dt>{t('profile.botHunts')}</dt><dd>{t('profile.countTimes', { n: fmtNumber(player.botWinCount ?? 0) })}</dd></div>
        <div><dt>{t('profile.kills')}</dt><dd>{t('profile.countTimes', { n: fmtNumber(player.killCount ?? 0) })}</dd></div>
        <div><dt>{t('profile.defeats')}</dt><dd>{t('profile.countTimes', { n: fmtNumber(player.defeatCount ?? 0) })}</dd></div>
        <div><dt>{t('profile.activeDays')}</dt><dd>{t('profile.countDays', { n: fmtNumber(player.activeDays ?? 0) })}</dd></div>
      </dl>

      <div className="profile-links">
        <button className="profile-link" onClick={() => setView('titles')}>
          <span aria-hidden="true">🏅</span>
          <span><strong>{t('profile.titles')}</strong><span className="muted small">{activeTitle === undefined ? '…' : activeTitle ?? t('profile.noTitle')}</span></span>
          <span aria-hidden="true">›</span>
        </button>
        <button className="profile-link" onClick={() => setView('customize')}>
          <span aria-hidden="true">🎨</span>
          <span><strong>{t('profile.customize')}</strong><span className="muted small">{player.level >= 10 ? t('profile.customizeOpen') : t('profile.customizeLocked')}</span></span>
          <span aria-hidden="true">›</span>
        </button>
        <button className="profile-link" onClick={() => setView('share')}>
          <span aria-hidden="true">📸</span>
          <span><strong>{t('profile.shareCard')}</strong><span className="muted small">{t('profile.shareCardDesc')}</span></span>
          <span aria-hidden="true">›</span>
        </button>
      </div>

      <section className="kw-activity" aria-label={t('profile.scoreTrend')}>
        <div className="kw-activity-head">
          <h3>{t('profile.scoreTrend')}</h3>
          <div className="chip-row" role="group" aria-label={t('keyword.period')}>
            {SCORE_RANGES.map(([r, label]) => (
              <button key={r} className={range === r ? 'chip active' : 'chip'} aria-pressed={range === r} onClick={() => setRange(r)}>{label}</button>
            ))}
          </div>
        </div>
        {history && history.range === range ? <ScoreChart history={history} />
          : <div className="chart-placeholder muted small">{t('chart.loading')}</div>}
      </section>

      <form className="profile-form" onSubmit={submit}>
        <label htmlFor="nickname-input"><strong>{t('profile.changeNickname')}</strong></label>
        <div className="search-row">
          <input id="nickname-input" value={nickname} onChange={(e) => { setNickname(e.target.value); setMessage(null); }}
                 maxLength={10} autoComplete="off" disabled={waiting} aria-describedby="nickname-hint" />
          <button className="primary" disabled={busy || waiting || unchanged || !nickname.trim()}>{t('profile.change')}</button>
        </div>
        <p id="nickname-hint" className="muted small">
          {waiting && changeableAt
            ? t('profile.changeableAt', { time: timeFormat.format(changeableAt) })
            : t('profile.nicknameHint')}
        </p>
        {message && <p className={message.error ? 'error small' : 'small'} role={message.error ? 'alert' : 'status'}>{message.text}</p>}
      </form>
      <section className="account-box" aria-label={t('profile.account')}>
        <strong>{t('profile.account')}</strong>
        {guest ? (<>
          <p className="muted small">{t('profile.guest')}</p>
          <GoogleButton label={t('profile.googleLogin')} />
        </>) : (<>
          <p className="muted small">{t('profile.googleLoggedIn')}</p>
          <div className="account-actions">
            <button onClick={onLogout}>{t('profile.logout')}</button>
            <button className="link-danger" onClick={() => setView('withdraw')}>{t('profile.withdraw')}</button>
          </div>
        </>)}
      </section>
    </Modal>
  );
}
