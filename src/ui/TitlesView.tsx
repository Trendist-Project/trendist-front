import { useEffect, useState } from 'react';
import { api, ApiFailure } from '../api/client';
import type { TitleBox, TitleItem } from '../api/types';
import { Modal } from './Modal';
import { successToast } from './toast';
import { intlLocale } from './keywordFormat';
import { getLang } from '../country';
import { fmtNumber, t as tr } from '../i18n';

interface Props { onBack(): void; onClose(): void }

const dateFormat = new Intl.DateTimeFormat(intlLocale(), { year: 'numeric', month: 'long', day: 'numeric', timeZone: getLang() === 'ko' ? 'Asia/Seoul' : undefined });

/** 진행 상황 문구. METRIC은 "37 / 100", RANK는 "현재 유행도 TOP 10 안". */
function progress(t: TitleItem) {
  if (t.conditionType === 'RANK') return t.target === 1 ? tr('titles.rank1') : tr('titles.rankTop', { n: t.target });
  return `${fmtNumber(Math.min(t.current, t.target))} / ${fmtNumber(t.target)}`;
}

/**
 * 칭호함(4.10): 받은 칭호와 획득일, 아직 못 받은 칭호의 조건과 진행도. 받은 칭호 중 하나를 장착하면 닉네임 아래에 보인다.
 * 장착한 칭호가 받은 칭호의 맨 위에 온다. 새 칭호를 받아도 자동으로 장착하지 않는다.
 */
export function TitlesView({ onBack, onClose }: Props) {
  const [box, setBox] = useState<TitleBox | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);

  useEffect(() => {
    api.titles().then(setBox).catch(() => setMessage({ text: tr('titles.loadFailed'), error: true }));
  }, []);

  async function choose(id: number | null) {
    setBusy(true); setMessage(null);
    try {
      setBox(await api.setTitle(id));
      // 장착은 목록 맨 위로 올라가 바로 보이므로 따로 알리지 않는다
      if (id === null) successToast(tr('titles.unequipped'));
    } catch (e) {
      setMessage({ text: e instanceof ApiFailure ? e.message : tr('titles.changeFailed'), error: true });
    } finally {
      setBusy(false);
    }
  }

  // 장착 중인 칭호를 맨 위에, 나머지는 칭호함 순서 그대로
  const owned = (box?.titles.filter((t) => t.owned) ?? []).sort((a, b) => Number(b.active) - Number(a.active));
  const locked = box?.titles.filter((t) => !t.owned) ?? [];

  return (
    <Modal title={tr('titles.title')} onClose={onClose} titleExtra={<button className="link-back" onClick={onBack}>{tr('common.backToProfile')}</button>}>
      {!box ? <p className="muted small">{message?.text ?? tr('common.loading')}</p> : (<>
        <p className="muted small">{tr('titles.intro')}</p>
        {message && <p className={message.error ? 'error small' : 'small'} role={message.error ? 'alert' : 'status'}>{message.text}</p>}
        <section aria-label={tr('titles.owned')}>
          <h3 className="title-group">{tr('titles.owned')} {owned.length}</h3>
          {owned.length === 0 ? <p className="muted small">{tr('titles.noneOwned')}</p> : (
            <ul className="title-list">
              {owned.map((t) => (
                <li key={t.id} className={t.active ? 'title-item active' : 'title-item'}>
                  <div className="title-main">
                    <strong>🏅 {t.name}{t.active && <span className="badge equipped">{tr('titles.equipped')}</span>}</strong>
                    <span className="muted small">{t.description}</span>
                    {t.acquiredAt && <span className="muted small">{tr('titles.acquiredOn', { date: dateFormat.format(new Date(t.acquiredAt)) })}</span>}
                  </div>
                  {t.active
                    ? <button onClick={() => choose(null)} disabled={busy}>{tr('titles.unequip')}</button>
                    : <button className="primary" onClick={() => choose(t.id)} disabled={busy}>{tr('titles.equip')}</button>}
                </li>
              ))}
            </ul>
          )}
        </section>
        <section aria-label={tr('titles.locked')}>
          <h3 className="title-group">{tr('titles.locked')} {locked.length}</h3>
          <ul className="title-list">
            {locked.map((t) => {
              const pct = t.conditionType === 'METRIC' ? Math.min(100, (t.current / Math.max(1, t.target)) * 100) : 0;
              return (
                <li key={t.id} className="title-item locked">
                  <div className="title-main">
                    <strong>🔒 {t.name}</strong>
                    <span className="muted small">{t.description}</span>
                    <div className="title-progress">
                      {t.conditionType === 'METRIC' && <div className="title-bar" aria-hidden="true"><span style={{ width: `${pct}%` }} /></div>}
                      <span className="muted small">{progress(t)}</span>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      </>)}
    </Modal>
  );
}
