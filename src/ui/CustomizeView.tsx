import { useEffect, useRef, useState } from 'react';
import { api, ApiFailure } from '../api/client';
import type { Look, MyLook } from '../api/types';
import { borderLineWidth, drawTurtle } from '../game/turtle';
import { Modal } from './Modal';

interface Props { level: number; onBack(): void; onClose(): void }

const HEX = /^#[0-9a-fA-F]{6}$/;

/** 아레나와 같은 그림으로 미리 보기(4.9). 내 레벨의 성장 캐릭터 위에 고른 색과 테두리를 입힌다. */
function Preview({ look, level }: { look: Look; level: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1), size = 140;
    c.width = size * dpr; c.height = size * dpr;
    const ctx = c.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size, size);
    ctx.fillStyle = '#1f2a37'; // 아레나 바닥색
    ctx.fillRect(0, 0, size, size);
    const r = 52, x = size / 2, y = size / 2;
    ctx.fillStyle = look.background;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    drawTurtle(ctx, x, y, r, Math.min(level, 10));
    ctx.strokeStyle = look.borderColor ?? '#11372a';
    ctx.lineWidth = borderLineWidth(r, look.borderWidth);
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke();
  }, [look, level]);
  return <canvas ref={ref} className="look-preview" style={{ width: 140, height: 140 }} aria-label="원 미리 보기" />;
}

/** 색 하나 고르기: 프리셋 칩 + 직접 입력(HEX). allowDefault면 "기본" 칩을 둔다(테두리). */
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

/** 꾸미기(4.9): 11레벨(설정값)부터 원의 바탕색·테두리 색·테두리 두께를 바꾼다. 5초에 한 번 저장할 수 있다. */
export function CustomizeView({ level, onBack, onClose }: Props) {
  const [mine, setMine] = useState<MyLook | null>(null);
  const [draft, setDraft] = useState<Look | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);

  useEffect(() => {
    api.myLook().then((m) => { setMine(m); setDraft(m.look); }).catch(() => setMessage({ text: '꾸미기 정보를 불러오지 못했어요', error: true }));
  }, []);

  const dirty = !!mine && !!draft && JSON.stringify(mine.look) !== JSON.stringify(draft);

  async function save() {
    if (!draft) return;
    setBusy(true); setMessage(null);
    try {
      const m = await api.updateLook(draft);
      setMine(m); setDraft(m.look);
      setMessage({ text: '저장했어요. 아레나의 내 원이 바로 바뀌어요', error: false });
    } catch (e) {
      setMessage({ text: e instanceof ApiFailure ? e.message : '저장하지 못했어요', error: true });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title="꾸미기" onClose={onClose} titleExtra={<button className="link-back" onClick={onBack}>‹ 내 정보</button>}>
      {!mine || !draft ? <p className="muted small">{message?.text ?? '불러오는 중…'}</p> : !mine.unlocked ? (
        <div className="customize-locked">
          <Preview look={mine.look} level={level} />
          <p><strong>🔒 {mine.unlockLevel}레벨부터 꾸밀 수 있어요</strong></p>
          <p className="muted small">지금 {level}레벨이에요. 키워드를 추가할 때마다 EXP가 쌓여요. {mine.unlockLevel}레벨이 되면 원의 바탕색과 테두리를 바꿀 수 있어요.</p>
        </div>
      ) : (
        <div className="customize">
          <div className="customize-preview">
            <Preview look={draft} level={level} />
            <button type="button" onClick={() => setDraft(mine.defaults)} disabled={busy}>기본으로</button>
          </div>
          <div className="customize-controls">
            <ColorPicker label="바탕색" value={draft.background} presets={mine.presets}
                         onChange={(v) => setDraft({ ...draft, background: v ?? mine.defaults.background })} />
            <ColorPicker label="테두리 색" value={draft.borderColor} presets={mine.presets} allowDefault
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
            <p className="muted small">바닥과 비슷한 어두운 색은 아레나에서 잘 안 보여서 고를 수 없어요.</p>
            {message && <p className={message.error ? 'error small' : 'small'} role={message.error ? 'alert' : 'status'}>{message.text}</p>}
            <button className="primary" onClick={save} disabled={busy || !dirty}>{busy ? '저장하는 중…' : '저장'}</button>
          </div>
        </div>
      )}
    </Modal>
  );
}
