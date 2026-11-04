import { useEffect, useMemo, useState } from 'react';
import { api, ApiFailure } from '../api/client';
import type { EffectOption, Look, PixelArtData, ProfileBox, ProfileSlot } from '../api/types';
import { decodeArt } from '../game/pixelArt';
import { GoogleButton } from './GoogleButton';
import { LookPreview } from './LookPreview';
import { Modal } from './Modal';
import { PixelEditor } from './PixelEditor';
import { successToast } from './toast';
import { t } from '../i18n';

interface Props { level: number; nickname?: string; onBack(): void; onClose(): void }

const HEX = /^#[0-9a-fA-F]{6}$/;
const NAME_STYLE_LABEL: Record<string, string> = { RIBBON: t('customize.styleRibbon'), GLOW: t('customize.styleGlow') };

/** 고치는 중인 한 칸. art는 미리 보기·저장에 쓰는 그림, artChanged면 저장할 때 그림도 보낸다 */
interface Draft {
  background: string; borderColor: string | null; borderWidth: number | null; nameColor: string | null; nameStyle: string | null;
  inner: 'GROWTH' | 'PIXEL'; art: PixelArtData | null; artChanged: boolean; trailEffectId: number | null; borderEffectId: number | null;
}

const fromSlot = (s: ProfileSlot): Draft => ({
  background: s.look.background, borderColor: s.look.borderColor, borderWidth: s.look.borderWidth,
  nameColor: s.look.nameColor ?? null, nameStyle: s.look.nameStyle ?? null, inner: s.inner, art: s.art, artChanged: false,
  trailEffectId: s.trailEffectId, borderEffectId: s.borderEffectId,
});
const sameDraft = (a: Draft, b: Draft) => JSON.stringify({ ...a, art: null }) === JSON.stringify({ ...b, art: null }) && !a.artChanged && !b.artChanged;
const codeOf = (list: EffectOption[], id: number | null) => (id == null ? null : list.find((e) => e.id === id)?.code ?? null);

/** 미리 보기에 쓸 모습: 고른 효과 번호를 코드로 바꾸고, 원 안에 그림을 고른 경우만 그림을 넘긴다 */
function lookOf(d: Draft, box: ProfileBox): Look {
  return {
    background: d.background, borderColor: d.borderColor, borderWidth: d.borderWidth, nameColor: d.nameColor, nameStyle: d.nameStyle,
    borderEffect: codeOf(box.borders, d.borderEffectId), trailEffect: codeOf(box.trails, d.trailEffectId),
  };
}

/** 색 하나 고르기: 프리셋 칩 + 직접 입력(HEX). allowDefault면 "기본" 칩을 둔다(테두리·이름표). */
function ColorPicker({ label, value, presets, onChange, allowDefault }: {
  label: string; value: string | null; presets: string[]; onChange(v: string | null): void; allowDefault?: boolean;
}) {
  const [hex, setHex] = useState(value ?? '');
  useEffect(() => { setHex(value ?? ''); }, [value]);
  return (
    <fieldset className="color-picker">
      <legend>{label}</legend>
      <div className="swatches" role="radiogroup" aria-label={label}>
        {allowDefault && (
          <button type="button" role="radio" aria-checked={value === null} className={value === null ? 'swatch default on' : 'swatch default'}
                  onClick={() => onChange(null)} title={t('customize.default')}>{t('customize.default')}</button>
        )}
        {presets.map((c) => (
          <button key={c} type="button" role="radio" aria-checked={value === c} aria-label={c} title={c}
                  className={value === c ? 'swatch on' : 'swatch'} style={{ background: c }} onClick={() => onChange(c)} />
        ))}
      </div>
      <div className="hex-row">
        <input type="color" value={value ?? '#11372a'} onChange={(e) => onChange(e.target.value)} aria-label={t('customize.pickAria', { label })} />
        <input value={hex} maxLength={7} placeholder="#RRGGBB" aria-label={`${label} HEX`} spellCheck={false}
               onChange={(e) => { setHex(e.target.value); if (HEX.test(e.target.value)) onChange(e.target.value.toLowerCase()); }} />
      </div>
    </fieldset>
  );
}

/** 효과 고르기(이동·테두리): 누르면 미리 보기에만 바로 보이고, [저장]해야 프로필에 들어간다 */
function EffectPicker({ label, options, value, onChange }: { label: string; options: EffectOption[]; value: number | null; onChange(id: number | null): void }) {
  return (
    <fieldset className="color-picker">
      <legend>{label}</legend>
      <div className="effect-chips" role="radiogroup" aria-label={label}>
        <button type="button" role="radio" aria-checked={value == null} className={value == null ? 'sort-chip active' : 'sort-chip'} onClick={() => onChange(null)}>{t('customize.none')}</button>
        {options.map((e) => (
          <button key={e.id} type="button" role="radio" aria-checked={value === e.id} disabled={!e.unlocked && value !== e.id}
                  title={e.unlocked ? undefined : e.lockReason ?? undefined}
                  className={value === e.id ? 'sort-chip active' : 'sort-chip'} onClick={() => onChange(e.id)}>
            {e.unlocked ? e.name : `🔒 ${e.name}`}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

/**
 * 꾸미기(4.9): 프로필 1~3번 칸에 바탕색·테두리·이름표·원 안에 그릴 것(성장 캐릭터 / 내 그림)·테두리 효과·이동 효과를 저장하고,
 * 한 칸을 장착한다. 고르는 동안은 위의 미리 보기에만 보이고 [저장]해야 그 칸에 들어간다. 장착한 칸을 저장하면 아레나에 바로 보인다.
 * 11레벨부터, 그림과 효과는 Google로 로그인한 사용자만.
 */
export function CustomizeView({ level, nickname, onBack, onClose }: Props) {
  const [box, setBox] = useState<ProfileBox | null>(null);
  const [slot, setSlot] = useState(1);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [drawing, setDrawing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    api.profiles().then((b) => { setBox(b); setSlot(b.equippedSlot); setDraft(fromSlot(b.slots[b.equippedSlot - 1])); })
      .catch(() => setMessage(t('customize.loadFailed')));
  }, []);

  const current = box?.slots[slot - 1];
  const dirty = !!current && !!draft && !sameDraft(fromSlot(current), draft);
  const initialCells = useMemo(() => decodeArt(draft?.art ?? null), [drawing]); // eslint-disable-line react-hooks/exhaustive-deps
  const guestLocked = !!box && box.unlocked && box.trails.length > 0 && box.trails.every((e) => !e.unlocked) && !box.canDraw;

  function pickSlot(n: number) {
    if (!box || n === slot) return;
    if (dirty && !window.confirm(t('customize.confirmSwitch'))) return;
    setSlot(n); setDraft(fromSlot(box.slots[n - 1])); setDrawing(false); setMessage(null);
  }

  async function run(f: () => Promise<ProfileBox>, done: string) {
    setBusy(true); setMessage(null);
    try {
      const b = await f();
      setBox(b); setDraft(fromSlot(b.slots[slot - 1]));
      successToast(done);
    } catch (e) {
      setMessage(e instanceof ApiFailure ? e.message : t('customize.saveFailed'));
    } finally {
      setBusy(false);
    }
  }

  function save(equip: boolean) {
    if (!draft || !current) return;
    const willShow = equip || current.equipped;
    run(() => api.saveProfile(slot, {
      background: draft.background, borderColor: draft.borderColor, borderWidth: draft.borderWidth, nameColor: draft.nameColor,
      nameStyle: draft.nameStyle, inner: draft.inner, art: draft.artChanged ? draft.art : null,
      trailEffectId: draft.trailEffectId, borderEffectId: draft.borderEffectId, equip,
    }), willShow ? t('customize.savedShown', { slot }) : t('customize.saved', { slot }));
  }

  const equippedSlot = box?.slots.find((s) => s.equipped);
  const lockedPreview = equippedSlot && box ? (
    <LookPreview look={equippedSlot.look} level={level} art={equippedSlot.inner === 'PIXEL' ? equippedSlot.art : null} name={nickname} />
  ) : null;

  return (
    <Modal title={t('customize.title')} className="customize-modal" onClose={onClose} titleExtra={<button className="link-back" onClick={onBack}>{t('common.backToProfile')}</button>}>
      {!box || !draft || !current ? <p className="muted small">{message ?? t('common.loading')}</p> : !box.unlocked ? (
        <div className="customize-locked">
          {lockedPreview}
          <p><strong>{t('customize.lockedTitle', { n: box.unlockLevel })}</strong></p>
          <p className="muted small">{t('customize.lockedDesc', { level, n: box.unlockLevel })}</p>
        </div>
      ) : drawing ? (
        <div className="customize-draw">
          <PixelEditor initial={initialCells} background={draft.background} borderColor={draft.borderColor} borderWidth={draft.borderWidth}
                       presets={box.colors} maxColors={box.maxColors} busy={busy} changeableAt={box.artChangeableAt}
                       onSave={(art) => { setDraft({ ...draft, art, artChanged: true, inner: 'PIXEL' }); setDrawing(false); }}
                       onCancel={() => setDrawing(false)} />
          <p className="muted small">{t('customize.drawNote', { slot })}</p>
        </div>
      ) : (
        <div className="profile-editor">
          {/* 위: 프로필 칸과 미리 보기는 고정, 가운데 꾸밈 항목만 스크롤, 아래: 저장 버튼 고정 */}
          <div className="profile-top">
            <div className="profile-tabs" role="tablist" aria-label={t('customize.profiles')}>
              {box.slots.map((s) => (
                <button key={s.slot} role="tab" aria-selected={slot === s.slot} className={slot === s.slot ? 'profile-tab on' : 'profile-tab'}
                        onClick={() => pickSlot(s.slot)}>
                  <LookPreview look={s.look} level={level} art={s.inner === 'PIXEL' ? s.art : null} width={52} height={52} moving={false}
                               label={t('customize.slotName', { slot: s.slot })} />
                  <span className="profile-tab-text">
                    <strong>{t('customize.slotName', { slot: s.slot })}</strong>
                    {s.equipped ? <span className="badge">{t('customize.equipped')}</span> : !s.saved ? <span className="muted small">{t('customize.defaultLook')}</span> : <span className="muted small">{t('customize.savedBadge')}</span>}
                  </span>
                </button>
              ))}
            </div>

            <div className="profile-preview">
              <LookPreview look={lookOf(draft, box)} level={level} art={draft.inner === 'PIXEL' ? draft.art : null} name={nickname} width={320} height={180} />
              {dirty && <span className="profile-dirty">{t('customize.dirty')}</span>}
            </div>
          </div>

          <div className="profile-sections">
            <fieldset className="color-picker">
              <legend>{t('customize.inner')}</legend>
              <div className="effect-chips">
                <button type="button" className={draft.inner === 'GROWTH' ? 'sort-chip active' : 'sort-chip'} onClick={() => setDraft({ ...draft, inner: 'GROWTH' })}>{t('customize.growth')}</button>
                <button type="button" className={draft.inner === 'PIXEL' ? 'sort-chip active' : 'sort-chip'} disabled={!draft.art || !box.canDraw}
                        title={!box.canDraw ? box.drawLockReason ?? undefined : !draft.art ? t('customize.drawFirst') : undefined}
                        onClick={() => setDraft({ ...draft, inner: 'PIXEL' })}>{t('customize.myArt')}</button>
                <button type="button" className="sort-chip" disabled={!box.canDraw} title={box.drawLockReason ?? undefined} onClick={() => setDrawing(true)}>
                  ✏️ {draft.art ? t('customize.editArt') : t('customize.drawArt')}
                </button>
              </div>
              {!box.canDraw && <p className="muted small">🔒 {box.drawLockReason}</p>}
            </fieldset>

            <ColorPicker label={t('customize.background')} value={draft.background} presets={box.colors}
                         onChange={(v) => setDraft({ ...draft, background: v ?? box.defaults.background })} />
            <ColorPicker label={t('customize.borderColor')} value={draft.borderColor} presets={box.colors} allowDefault
                         onChange={(v) => setDraft({ ...draft, borderColor: v })} />
            <fieldset className="color-picker">
              <legend>{t('customize.borderWidth')}</legend>
              <div className="width-row">
                <button type="button" className={draft.borderWidth === null ? 'sort-chip active' : 'sort-chip'}
                        onClick={() => setDraft({ ...draft, borderWidth: null })}>{t('customize.default')}</button>
                <input type="range" min={1} max={8} step={1} value={draft.borderWidth ?? 3} aria-label={t('customize.borderWidthAria')}
                       onChange={(e) => setDraft({ ...draft, borderWidth: Number(e.target.value) })} />
                <span className="muted small">{draft.borderWidth ?? t('customize.default')}</span>
              </div>
            </fieldset>
            <ColorPicker label={t('customize.nameColor')} value={draft.nameColor} presets={box.colors} allowDefault
                         onChange={(v) => setDraft({ ...draft, nameColor: v })} />
            <fieldset className="color-picker">
              <legend>{t('customize.nameStyle')}</legend>
              <div className="effect-chips">
                <button type="button" className={draft.nameStyle === null ? 'sort-chip active' : 'sort-chip'} onClick={() => setDraft({ ...draft, nameStyle: null })}>{t('customize.default')}</button>
                {box.nameStyles.map((st) => (
                  <button key={st} type="button" className={draft.nameStyle === st ? 'sort-chip active' : 'sort-chip'}
                          onClick={() => setDraft({ ...draft, nameStyle: st })}>{NAME_STYLE_LABEL[st] ?? st}</button>
                ))}
              </div>
            </fieldset>
            <EffectPicker label={t('customize.borderEffect')} options={box.borders} value={draft.borderEffectId} onChange={(id) => setDraft({ ...draft, borderEffectId: id })} />
            <EffectPicker label={t('customize.trailEffect')} options={box.trails} value={draft.trailEffectId} onChange={(id) => setDraft({ ...draft, trailEffectId: id })} />
            {guestLocked && (
              <div className="login-gate">
                <span><strong>{t('customize.loginGate')}</strong><span className="muted small">{t('customize.loginGateDesc')}</span></span>
                <GoogleButton label={t('profile.googleLogin')} />
              </div>
            )}
            <p className="muted small">{t('customize.darkNote')}</p>
          </div>

          <div className="profile-actions">
            {message && <p className="error small" role="alert">{message}</p>}
            <button type="button" disabled={busy || !dirty} onClick={() => { setDraft(fromSlot(current)); setMessage(null); }}>{t('customize.revert')}</button>
            <button type="button" className={current.equipped ? 'primary' : undefined} disabled={busy || !dirty} onClick={() => save(false)}>
              {busy ? t('customize.saving') : t('customize.save')}
            </button>
            {!current.equipped && (
              dirty
                ? <button type="button" className="primary" disabled={busy} onClick={() => save(true)}>{t('customize.saveEquip')}</button>
                : <button type="button" className="primary" disabled={busy}
                          onClick={() => run(() => api.equipProfile(slot), t('customize.equippedToast', { slot }))}>{t('customize.equipThis')}</button>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}
