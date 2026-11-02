import { useEffect, useMemo, useState } from 'react';
import { api, ApiFailure } from '../api/client';
import type { EffectOption, Look, PixelArtData, ProfileBox, ProfileSlot } from '../api/types';
import { decodeArt } from '../game/pixelArt';
import { GoogleButton } from './GoogleButton';
import { LookPreview } from './LookPreview';
import { Modal } from './Modal';
import { PixelEditor } from './PixelEditor';
import { successToast } from './toast';

interface Props { level: number; nickname?: string; onBack(): void; onClose(): void }

const HEX = /^#[0-9a-fA-F]{6}$/;
const NAME_STYLE_LABEL: Record<string, string> = { RIBBON: '리본', GLOW: '빛' };

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
                  onClick={() => onChange(null)} title="기본">기본</button>
        )}
        {presets.map((c) => (
          <button key={c} type="button" role="radio" aria-checked={value === c} aria-label={c} title={c}
                  className={value === c ? 'swatch on' : 'swatch'} style={{ background: c }} onClick={() => onChange(c)} />
        ))}
      </div>
      <div className="hex-row">
        <input type="color" value={value ?? '#11372a'} onChange={(e) => onChange(e.target.value)} aria-label={`${label} 직접 고르기`} />
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
        <button type="button" role="radio" aria-checked={value == null} className={value == null ? 'sort-chip active' : 'sort-chip'} onClick={() => onChange(null)}>없음</button>
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
      .catch(() => setMessage('꾸미기 정보를 불러오지 못했어요'));
  }, []);

  const current = box?.slots[slot - 1];
  const dirty = !!current && !!draft && !sameDraft(fromSlot(current), draft);
  const initialCells = useMemo(() => decodeArt(draft?.art ?? null), [drawing]); // eslint-disable-line react-hooks/exhaustive-deps
  const guestLocked = !!box && box.unlocked && box.trails.length > 0 && box.trails.every((e) => !e.unlocked) && !box.canDraw;

  function pickSlot(n: number) {
    if (!box || n === slot) return;
    if (dirty && !window.confirm('저장하지 않은 내용이 있어요. 다른 프로필로 넘어갈까요?')) return;
    setSlot(n); setDraft(fromSlot(box.slots[n - 1])); setDrawing(false); setMessage(null);
  }

  async function run(f: () => Promise<ProfileBox>, done: string) {
    setBusy(true); setMessage(null);
    try {
      const b = await f();
      setBox(b); setDraft(fromSlot(b.slots[slot - 1]));
      successToast(done);
    } catch (e) {
      setMessage(e instanceof ApiFailure ? e.message : '저장하지 못했어요');
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
    }), willShow ? `${slot}번 프로필을 저장했어요. 아레나의 내 원에 바로 보여요` : `${slot}번 프로필을 저장했어요`);
  }

  const equippedSlot = box?.slots.find((s) => s.equipped);
  const lockedPreview = equippedSlot && box ? (
    <LookPreview look={equippedSlot.look} level={level} art={equippedSlot.inner === 'PIXEL' ? equippedSlot.art : null} name={nickname} />
  ) : null;

  return (
    <Modal title="꾸미기" className="customize-modal" onClose={onClose} titleExtra={<button className="link-back" onClick={onBack}>‹ 내 정보</button>}>
      {!box || !draft || !current ? <p className="muted small">{message ?? '불러오는 중…'}</p> : !box.unlocked ? (
        <div className="customize-locked">
          {lockedPreview}
          <p><strong>🔒 {box.unlockLevel}레벨부터 꾸밀 수 있어요</strong></p>
          <p className="muted small">지금 {level}레벨이에요. 키워드를 추가할 때마다 EXP가 쌓여요. {box.unlockLevel}레벨이 되면 프로필 3개에 원의 색, 테두리, 이름표, 직접 그린 그림, 테두리 효과, 이동 효과를 저장해 골라 쓸 수 있어요. 그림과 효과는 Google로 로그인한 사람만 쓸 수 있어요.</p>
        </div>
      ) : drawing ? (
        <div className="customize-draw">
          <button className="link-back" onClick={() => setDrawing(false)}>‹ {slot}번 프로필로 돌아가기</button>
          <PixelEditor initial={initialCells} background={draft.background} borderColor={draft.borderColor} borderWidth={draft.borderWidth}
                       presets={box.colors} maxColors={box.maxColors} busy={busy} changeableAt={box.artChangeableAt} saveLabel="이 그림 쓰기"
                       onSave={(art) => { setDraft({ ...draft, art, artChanged: true, inner: 'PIXEL' }); setDrawing(false); }} />
          <p className="muted small">[이 그림 쓰기]를 누른 뒤 프로필을 [저장]해야 그림이 저장돼요. 남의 얼굴이나 캐릭터, 불쾌한 그림은 그리지 마세요.</p>
        </div>
      ) : (
        <div className="profile-editor">
          <div className="profile-tabs" role="tablist" aria-label="꾸미기 프로필">
            {box.slots.map((s) => (
              <button key={s.slot} role="tab" aria-selected={slot === s.slot} className={slot === s.slot ? 'profile-tab on' : 'profile-tab'}
                      onClick={() => pickSlot(s.slot)}>
                <LookPreview look={s.look} level={level} art={s.inner === 'PIXEL' ? s.art : null} width={52} height={52} moving={false}
                             label={`${s.slot}번 프로필`} />
                <span className="profile-tab-text">
                  <strong>{s.slot}번 프로필</strong>
                  {s.equipped ? <span className="badge">장착 중</span> : !s.saved ? <span className="muted small">기본 모습</span> : <span className="muted small">저장됨</span>}
                </span>
              </button>
            ))}
          </div>

          <div className="profile-preview">
            <LookPreview look={lookOf(draft, box)} level={level} art={draft.inner === 'PIXEL' ? draft.art : null} name={nickname} width={320} height={180} />
            {dirty && <span className="profile-dirty">저장하지 않은 변경이 있어요</span>}
          </div>

          <div className="profile-sections">
            <fieldset className="color-picker">
              <legend>원 안에 그릴 것</legend>
              <div className="effect-chips">
                <button type="button" className={draft.inner === 'GROWTH' ? 'sort-chip active' : 'sort-chip'} onClick={() => setDraft({ ...draft, inner: 'GROWTH' })}>🐢 성장 캐릭터</button>
                <button type="button" className={draft.inner === 'PIXEL' ? 'sort-chip active' : 'sort-chip'} disabled={!draft.art || !box.canDraw}
                        title={!box.canDraw ? box.drawLockReason ?? undefined : !draft.art ? '먼저 그림을 그려 주세요' : undefined}
                        onClick={() => setDraft({ ...draft, inner: 'PIXEL' })}>🎨 내 그림</button>
                <button type="button" className="sort-chip" disabled={!box.canDraw} title={box.drawLockReason ?? undefined} onClick={() => setDrawing(true)}>
                  ✏️ {draft.art ? '그림 고치기' : '그림 그리기'}
                </button>
              </div>
              {!box.canDraw && <p className="muted small">🔒 {box.drawLockReason}</p>}
            </fieldset>

            <ColorPicker label="바탕색" value={draft.background} presets={box.colors}
                         onChange={(v) => setDraft({ ...draft, background: v ?? box.defaults.background })} />
            <ColorPicker label="테두리 색" value={draft.borderColor} presets={box.colors} allowDefault
                         onChange={(v) => setDraft({ ...draft, borderColor: v })} />
            <fieldset className="color-picker">
              <legend>테두리 두께</legend>
              <div className="width-row">
                <button type="button" className={draft.borderWidth === null ? 'sort-chip active' : 'sort-chip'}
                        onClick={() => setDraft({ ...draft, borderWidth: null })}>기본</button>
                <input type="range" min={1} max={8} step={1} value={draft.borderWidth ?? 3} aria-label="테두리 두께 1~8단계"
                       onChange={(e) => setDraft({ ...draft, borderWidth: Number(e.target.value) })} />
                <span className="muted small">{draft.borderWidth ?? '기본'}</span>
              </div>
            </fieldset>
            <ColorPicker label="이름표 글자색" value={draft.nameColor} presets={box.colors} allowDefault
                         onChange={(v) => setDraft({ ...draft, nameColor: v })} />
            <fieldset className="color-picker">
              <legend>이름표 모양</legend>
              <div className="effect-chips">
                <button type="button" className={draft.nameStyle === null ? 'sort-chip active' : 'sort-chip'} onClick={() => setDraft({ ...draft, nameStyle: null })}>기본</button>
                {box.nameStyles.map((st) => (
                  <button key={st} type="button" className={draft.nameStyle === st ? 'sort-chip active' : 'sort-chip'}
                          onClick={() => setDraft({ ...draft, nameStyle: st })}>{NAME_STYLE_LABEL[st] ?? st}</button>
                ))}
              </div>
            </fieldset>
            <EffectPicker label="테두리 효과" options={box.borders} value={draft.borderEffectId} onChange={(id) => setDraft({ ...draft, borderEffectId: id })} />
            <EffectPicker label="이동 효과" options={box.trails} value={draft.trailEffectId} onChange={(id) => setDraft({ ...draft, trailEffectId: id })} />
            {guestLocked && (
              <div className="login-gate">
                <span><strong>🔒 그림과 효과는 Google로 로그인하면 쓸 수 있어요</strong><span className="muted small">처음 쓰는 Google 계정이면 지금 기록이 그대로 이어져요.</span></span>
                <GoogleButton label="Google로 로그인" />
              </div>
            )}
            <p className="muted small">바닥과 비슷한 어두운 색은 아레나에서 잘 안 보여서 고를 수 없어요. 바탕색은 그림의 빈 칸에도 보여요.</p>
          </div>

          <div className="profile-actions">
            {message && <p className="error small" role="alert">{message}</p>}
            <button type="button" disabled={busy || !dirty} onClick={() => { setDraft(fromSlot(current)); setMessage(null); }}>되돌리기</button>
            <button type="button" className={current.equipped ? 'primary' : undefined} disabled={busy || !dirty} onClick={() => save(false)}>
              {busy ? '저장하는 중…' : '저장'}
            </button>
            {!current.equipped && (
              dirty
                ? <button type="button" className="primary" disabled={busy} onClick={() => save(true)}>저장하고 장착</button>
                : <button type="button" className="primary" disabled={busy}
                          onClick={() => run(() => api.equipProfile(slot), `${slot}번 프로필을 장착했어요`)}>이 프로필 장착</button>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}
