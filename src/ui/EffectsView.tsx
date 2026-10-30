import { useEffect, useRef, useState } from 'react';
import { api, ApiFailure } from '../api/client';
import type { EffectBox, EffectItem } from '../api/types';
import { Trails } from '../game/trails';
import { drawTurtle, TURTLE_BASE } from '../game/turtle';
import { Modal } from './Modal';

interface Props { level: number; onBack(): void; onClose(): void }

const W = 260, H = 150;

/** 미리 보기(4.23): 작은 아레나에서 원이 8자로 돌며 고른 효과를 남긴다. 아레나와 같은 그림 코드다. */
function Preview({ code, level }: { code: string | null; level: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    c.width = W * dpr; c.height = H * dpr;
    const ctx = c.getContext('2d')!;
    const trails = new Trails();
    const r = 18;
    let raf = 0, last = performance.now(), heading = 0, px = 0, py = 0, first = true;
    const loop = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      const t = now / 1000 * 1.3;
      const x = W / 2 + Math.sin(t) * (W / 2 - 34), y = H / 2 + Math.sin(t * 2) * (H / 2 - 30);
      if (!first && Math.hypot(x - px, y - py) > 0.01) heading = Math.atan2(y - py, x - px) + Math.PI / 2;
      first = false; px = x; py = y;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = '#1f2a37';
      ctx.fillRect(0, 0, W, H);
      trails.update(1, code, x, y, r, now, TURTLE_BASE);
      trails.draw(ctx, now, dt);
      ctx.fillStyle = TURTLE_BASE;
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
      drawTurtle(ctx, x, y, r, Math.max(5, Math.min(level, 10)), heading);
      ctx.strokeStyle = '#11372a'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke();
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [code, level]);
  return <canvas ref={ref} className="look-preview effect-preview" style={{ width: W, height: H }} aria-label="이동 효과 미리 보기" />;
}

/**
 * 이동 효과(4.23): 움직일 때 원 뒤에 남는 효과를 하나 고른다. 지금은 모두 조건 없이 쓸 수 있고,
 * 나중에 조건(레벨·칭호·구매)이 붙은 효과는 잠금 안내만 보인다.
 */
export function EffectsView({ level, onBack, onClose }: Props) {
  const [box, setBox] = useState<EffectBox | null>(null);
  const [preview, setPreview] = useState<EffectItem | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);

  useEffect(() => {
    api.effects().then((b) => { setBox(b); setPreview(b.effects.find((e) => e.active) ?? b.effects[0] ?? null); })
      .catch(() => setMessage({ text: '효과를 불러오지 못했어요', error: true }));
  }, []);

  async function choose(id: number | null) {
    setBusy(true); setMessage(null);
    try {
      setBox(await api.setEffect(id));
      setMessage({ text: id === null ? '효과를 껐어요' : '효과를 적용했어요. 움직이면 보여요', error: false });
    } catch (e) {
      setMessage({ text: e instanceof ApiFailure ? e.message : '효과를 바꾸지 못했어요', error: true });
    } finally {
      setBusy(false);
    }
  }

  const active = box?.effects.find((e) => e.active) ?? null;

  return (
    <Modal title="이동 효과" onClose={onClose} titleExtra={<button className="link-back" onClick={onBack}>‹ 내 정보</button>}>
      {!box ? <p className="muted small">{message?.text ?? '불러오는 중…'}</p> : (<>
        <div className="customize-preview">
          <Preview code={preview?.code ?? null} level={level} />
          <span className="muted small">{preview ? `${preview.name} 미리 보기` : '효과 없음'}</span>
        </div>
        <p className="muted small">움직일 때 내 원 뒤에 남는 효과예요. 하나만 쓸 수 있고 모두에게 보여요.</p>
        {message && <p className={message.error ? 'error small' : 'small'} role={message.error ? 'alert' : 'status'}>{message.text}</p>}
        <ul className="title-list">
          <li className={active ? 'title-item' : 'title-item active'}>
            <div className="title-main"><strong>효과 없음</strong><span className="muted small">아무것도 남기지 않아요</span></div>
            {active && <button onClick={() => choose(null)} disabled={busy}>끄기</button>}
          </li>
          {box.effects.map((e) => (
            <li key={e.id} className={`title-item${e.active ? ' active' : ''}${e.unlocked ? '' : ' locked'}`}
                onMouseEnter={() => setPreview(e)}>
              <div className="title-main">
                <strong>{e.unlocked ? '✨' : '🔒'} {e.name}</strong>
                <span className="muted small">{e.unlocked ? e.description : e.lockReason}</span>
              </div>
              <div className="effect-actions">
                <button onClick={() => setPreview(e)} aria-label={`${e.name} 미리 보기`}>보기</button>
                {e.active ? <span className="muted small">사용 중</span>
                  : e.unlocked && <button className="primary" onClick={() => { setPreview(e); choose(e.id); }} disabled={busy}>쓰기</button>}
              </div>
            </li>
          ))}
        </ul>
      </>)}
    </Modal>
  );
}
