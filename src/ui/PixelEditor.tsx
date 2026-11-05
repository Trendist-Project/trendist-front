import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { borderLineWidth } from '../game/turtle';
import { ART_SIZE, artPose, drawArt, encodeArt } from '../game/pixelArt';
import { t } from '../i18n';

/**
 * 픽셀 그림 편집기(4.9): 32×32 칸에 직접 그린다. 투명한 칸은 원의 바탕색이 보이고, 원 밖의 칸은 아레나에서 잘려 보이지 않는다.
 * 도구: 펜·지우개·채우기·스포이드, 붓 크기 1~3, 좌우 대칭, 되돌리기·다시 하기, 한 칸씩 옮기기·전체 지우기.
 * 보는 방향: 아레나에서 그림은 "오른쪽이 앞"이라 가는 방향을 바라보게 돌고, 세로축을 넘어 왼쪽으로 가면 좌우로 뒤집힌다. 그래서 편집 칸 위에 앞(오른쪽)을
 * 가리키는 표시를 두고, 왼쪽을 보고 그렸을 때는 [↔ 좌우 반전] 한 번으로 그림 전체를 뒤집게 하며, 오른쪽·위·왼쪽·아래로 갈 때의 모습을 바로 보여 준다.
 */
type Tool = 'pen' | 'eraser' | 'fill' | 'picker';
type Cells = (string | null)[];

interface Props {
  initial: Cells;
  background: string;
  borderColor: string | null;
  borderWidth: number | null;
  presets: string[];
  maxColors: number;
  busy: boolean;
  /** 저장 가능 시각(이 시각 전에는 저장 버튼을 막는다) */
  changeableAt: string | null;
  onSave(art: { palette: string[]; pixels: string }): void;
  /** 그림을 버리고 나간다([취소]) */
  onCancel(): void;
  /** 저장 버튼 글자 */
  saveLabel?: string;
  /** 기본 안내(점선 원 밖 등) 아래에 덧붙일 안내. 버튼 바로 위 한 상자에 같이 보여 준다 */
  notes?: string[];
}

/** 이동 방향 미리 보기: 가는 방향(라디안, 0 = 오른쪽, 아래가 +)과 문구 */
const DIRS: [number, string][] = [[Math.PI, 'moveLeft'], [-Math.PI / 2, 'moveUp'], [0, 'moveRight'], [Math.PI / 2, 'moveDown']];

const N = ART_SIZE;
const VIEW = 352; // 편집 칸 화면 크기(px)
const CELL = VIEW / N;
const HISTORY = 60;
const TOOLS: [Tool, string, string, string][] = [
  ['pen', '✏️', t('pixel.pen'), 'B'], ['eraser', '🧽', t('pixel.eraser'), 'E'], ['fill', '🪣', t('pixel.fill'), 'G'], ['picker', '💧', t('pixel.picker'), 'I'],
];
/** 그림에 자주 쓰는 기본 색(프리셋 24색에 더해 검정·어두운 색) */
const EXTRA = ['#000000', '#3a3a3a', '#6b4f3a', '#1e3a8a', '#14532d', '#7f1d1d'];

const inCircle = (x: number, y: number) => {
  const cx = x + 0.5 - N / 2, cy = y + 0.5 - N / 2;
  return cx * cx + cy * cy <= (N / 2) * (N / 2);
};

export function PixelEditor({ initial, background, borderColor, borderWidth, presets, maxColors, busy, changeableAt, onSave, onCancel, saveLabel = t('pixel.save'), notes = [] }: Props) {
  const [cells, setCells] = useState<Cells>(initial);
  const [tool, setTool] = useState<Tool>('pen');
  const [color, setColor] = useState(presets[0] ?? '#ffffff');
  const [size, setSize] = useState(1);
  const [mirror, setMirror] = useState(false);
  const [grid, setGrid] = useState(true);
  const [recent, setRecent] = useState<string[]>([]);
  const undo = useRef<Cells[]>([]);
  const redo = useRef<Cells[]>([]);
  const [, bump] = useState(0); // 되돌리기 버튼 상태를 다시 그리려고
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef<{ last: [number, number] | null; base: Cells } | null>(null);
  const [now, setNow] = useState(Date.now());
  useEffect(() => { setCells(initial); undo.current = []; redo.current = []; }, [initial]);
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 15_000); return () => clearInterval(t); }, []);

  const colorsUsed = useMemo(() => new Set(cells.filter(Boolean)).size, [cells]);
  const empty = colorsUsed === 0;
  const waitMs = changeableAt ? new Date(changeableAt).getTime() - now : 0;

  // ------------------------------------------------------------ 그리기(편집 칸)
  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    c.width = VIEW * dpr; c.height = VIEW * dpr;
    const ctx = c.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // 원 밖은 체크무늬(아레나에서 보이지 않는 곳), 원 안은 바탕색(투명한 칸에 보이는 색)
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const v = cells[y * N + x];
      if (v) ctx.fillStyle = v;
      else if (inCircle(x, y)) ctx.fillStyle = background;
      else ctx.fillStyle = (x + y) % 2 === 0 ? '#2a3442' : '#222b37';
      ctx.fillRect(x * CELL, y * CELL, CELL, CELL);
      if (v && !inCircle(x, y)) { ctx.fillStyle = 'rgba(15,20,28,0.55)'; ctx.fillRect(x * CELL, y * CELL, CELL, CELL); }
    }
    if (grid) {
      ctx.strokeStyle = 'rgba(255,255,255,0.12)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let i = 1; i < N; i++) {
        ctx.moveTo(i * CELL + 0.5, 0); ctx.lineTo(i * CELL + 0.5, VIEW);
        ctx.moveTo(0, i * CELL + 0.5); ctx.lineTo(VIEW, i * CELL + 0.5);
      }
      ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.28)'; // 가운데 십자선
      ctx.beginPath(); ctx.moveTo(VIEW / 2, 0); ctx.lineTo(VIEW / 2, VIEW); ctx.moveTo(0, VIEW / 2); ctx.lineTo(VIEW, VIEW / 2); ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(255,255,255,0.75)';
    ctx.setLineDash([6, 4]);
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(VIEW / 2, VIEW / 2, VIEW / 2 - 1, 0, Math.PI * 2); ctx.stroke();
    ctx.setLineDash([]);
  }, [cells, background, grid]);

  // ------------------------------------------------------------ 편집
  const pushHistory = useCallback((before: Cells) => {
    undo.current.push(before);
    if (undo.current.length > HISTORY) undo.current.shift();
    redo.current = [];
    bump((n) => n + 1);
  }, []);

  const change = useCallback((next: Cells) => { pushHistory(cells); setCells(next); }, [cells, pushHistory]);

  const doUndo = useCallback(() => {
    const prev = undo.current.pop();
    if (!prev) return;
    redo.current.push(cells);
    setCells(prev);
    bump((n) => n + 1);
  }, [cells]);
  const doRedo = useCallback(() => {
    const next = redo.current.pop();
    if (!next) return;
    undo.current.push(cells);
    setCells(next);
    bump((n) => n + 1);
  }, [cells]);

  /** 붓 크기만큼(대칭이면 반대쪽도) 칠한다. */
  const paint = (arr: Cells, x: number, y: number, value: string | null) => {
    const r0 = -Math.floor((size - 1) / 2), r1 = r0 + size - 1;
    for (let dy = r0; dy <= r1; dy++) for (let dx = r0; dx <= r1; dx++) {
      const px = x + dx, py = y + dy;
      if (px < 0 || py < 0 || px >= N || py >= N) continue;
      arr[py * N + px] = value;
      if (mirror) arr[py * N + (N - 1 - px)] = value;
    }
  };

  /** 두 칸 사이를 빠짐없이 잇는다(빨리 끌어도 끊기지 않게). */
  const line = (arr: Cells, a: [number, number], b: [number, number], value: string | null) => {
    let [x0, y0] = a;
    const [x1, y1] = b;
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      paint(arr, x0, y0, value);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
  };

  const fill = (arr: Cells, x: number, y: number, value: string | null) => {
    const target = arr[y * N + x];
    if (target === value) return;
    const stack: [number, number][] = [[x, y]];
    while (stack.length) {
      const [cx, cy] = stack.pop()!;
      if (cx < 0 || cy < 0 || cx >= N || cy >= N || arr[cy * N + cx] !== target) continue;
      arr[cy * N + cx] = value;
      stack.push([cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]);
    }
  };

  const pickColor = (c: string) => {
    setColor(c);
    setRecent((r) => [c, ...r.filter((x) => x !== c)].slice(0, 10));
    if (tool === 'eraser' || tool === 'picker') setTool('pen');
  };

  const cellAt = (e: React.PointerEvent<HTMLCanvasElement>): [number, number] => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = Math.floor(((e.clientX - rect.left) / rect.width) * N);
    const y = Math.floor(((e.clientY - rect.top) / rect.height) * N);
    return [Math.max(0, Math.min(N - 1, x)), Math.max(0, Math.min(N - 1, y))];
  };

  const onDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const [x, y] = cellAt(e);
    const v = cells[y * N + x];
    if (tool === 'picker') { if (v) pickColor(v); return; }
    if (tool === 'fill') {
      const next = cells.slice();
      if (mirror) { fill(next, x, y, color); fill(next, N - 1 - x, y, color); } else fill(next, x, y, color);
      change(next);
      return;
    }
    e.currentTarget.setPointerCapture(e.pointerId);
    const next = cells.slice();
    paint(next, x, y, tool === 'eraser' ? null : color);
    drawing.current = { last: [x, y], base: cells };
    setCells(next);
  };
  const onMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const d = drawing.current;
    if (!d) return;
    const p = cellAt(e);
    if (d.last && d.last[0] === p[0] && d.last[1] === p[1]) return;
    setCells((cur) => {
      const next = cur.slice();
      line(next, d.last ?? p, p, tool === 'eraser' ? null : color);
      return next;
    });
    d.last = p;
  };
  const onUp = () => {
    const d = drawing.current;
    if (!d) return;
    drawing.current = null;
    pushHistory(d.base);
  };

  const shift = (dx: number, dy: number) => {
    const next: Cells = new Array(N * N).fill(null);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const nx = x + dx, ny = y + dy;
      if (nx >= 0 && ny >= 0 && nx < N && ny < N) next[ny * N + nx] = cells[y * N + x];
    }
    change(next);
  };
  const flip = () => {
    const next = cells.slice();
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) next[y * N + x] = cells[y * N + (N - 1 - x)];
    change(next);
  };

  // 단축키: Ctrl+Z / Ctrl+Shift+Z·Ctrl+Y, B·E·G·I(입력창에서는 무시)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
      const k = e.key.toLowerCase();
      if ((e.ctrlKey || e.metaKey) && k === 'z') { e.preventDefault(); if (e.shiftKey) doRedo(); else doUndo(); return; }
      if ((e.ctrlKey || e.metaKey) && k === 'y') { e.preventDefault(); doRedo(); return; }
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const t = TOOLS.find(([, , , key]) => key.toLowerCase() === k);
      if (t) setTool(t[0]);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [doUndo, doRedo]);

  const palette = useMemo(() => [...new Set([...presets, ...EXTRA])], [presets]);
  const tooMany = colorsUsed > maxColors;
  const canSave = !busy && !empty && !tooMany && waitMs <= 0;

  return (
    <div className="pixel-editor">
      <div className="pixel-toolbar" role="toolbar" aria-label={t('pixel.tools')}>
        {TOOLS.map(([id, icon, label, key]) => (
          <button key={id} type="button" className={tool === id ? 'pixel-tool on' : 'pixel-tool'} aria-pressed={tool === id}
                  title={`${label} (${key})`} onClick={() => setTool(id)}>
            <span aria-hidden="true">{icon}</span><span className="pixel-tool-label">{label}</span>
          </button>
        ))}
        <span className="pixel-sep" />
        <div className="pixel-size" role="radiogroup" aria-label={t('pixel.brushSize')}>
          {[1, 2, 3].map((s) => (
            <button key={s} type="button" role="radio" aria-checked={size === s} className={size === s ? 'on' : undefined}
                    title={t('pixel.brushSizeN', { n: s })} onClick={() => setSize(s)}>
              <span style={{ width: 4 + s * 3, height: 4 + s * 3 }} />
            </button>
          ))}
        </div>
        <button type="button" className={mirror ? 'pixel-tool on' : 'pixel-tool'} aria-pressed={mirror} title={t('pixel.mirrorTitle')}
                onClick={() => setMirror((m) => !m)}>
          <span aria-hidden="true">🪞</span><span className="pixel-tool-label">{t('pixel.mirror')}</span>
        </button>
        <span className="pixel-sep" />
        <button type="button" className="pixel-tool" onClick={doUndo} disabled={undo.current.length === 0} title={t('pixel.undo')}>↶</button>
        <button type="button" className="pixel-tool" onClick={doRedo} disabled={redo.current.length === 0} title={t('pixel.redo')}>↷</button>
      </div>

      <div className="pixel-main">
        <div className="pixel-canvas-wrap">
          <div className="pixel-facing" aria-hidden="true">
            <span className="pixel-facing-front">{t('pixel.facingFront')}</span>
            <span className="pixel-facing-line" />
            <span className="pixel-facing-back">{t('pixel.facingBack')}</span>
          </div>
          <canvas ref={canvasRef} className={`pixel-canvas tool-${tool}`} style={{ width: VIEW, height: VIEW }}
                  onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}
                  aria-label={t('pixel.canvasAria')} />
          <div className="pixel-facing-help">
            <p>{t('pixel.facingNote')}</p>
            <button type="button" className="pixel-flip" onClick={flip} title={t('pixel.flipAllTitle')}>{t('pixel.flipAll')}</button>
          </div>
          <div className="pixel-under">
            <div className="pixel-moves" aria-label={t('pixel.moveArt')}>
              <button type="button" onClick={() => shift(0, -1)} title={t('pixel.up')}>↑</button>
              <button type="button" onClick={() => shift(0, 1)} title={t('pixel.down')}>↓</button>
              <button type="button" onClick={() => shift(-1, 0)} title={t('pixel.left')}>←</button>
              <button type="button" onClick={() => shift(1, 0)} title={t('pixel.right')}>→</button>
            </div>
            <label className="pixel-check"><input type="checkbox" checked={grid} onChange={(e) => setGrid(e.target.checked)} /> {t('pixel.grid')}</label>
            <button type="button" className="link-danger" onClick={() => change(new Array(N * N).fill(null))} disabled={empty}>{t('pixel.clearAll')}</button>
          </div>
        </div>

        <div className="pixel-side">
          <div className="pixel-current">
            <span className="pixel-swatch big" style={{ background: tool === 'eraser' ? 'transparent' : color }} />
            <div>
              <strong>{tool === 'eraser' ? t('pixel.eraser') : color}</strong>
              <label className="pixel-custom">
                <input type="color" value={color} onChange={(e) => pickColor(e.target.value)} aria-label={t('pixel.pickColor')} /> {t('pixel.pickColor')}
              </label>
            </div>
          </div>
          <div className="pixel-palette" role="radiogroup" aria-label={t('pixel.color')}>
            {palette.map((c) => (
              <button key={c} type="button" role="radio" aria-checked={color === c && tool !== 'eraser'} aria-label={c} title={c}
                      className={color === c && tool !== 'eraser' ? 'pixel-swatch on' : 'pixel-swatch'} style={{ background: c }}
                      onClick={() => pickColor(c)} />
            ))}
          </div>
          {recent.length > 0 && (
            <>
              <p className="muted small">{t('pixel.recent')}</p>
              <div className="pixel-palette">
                {recent.map((c) => (
                  <button key={c} type="button" aria-label={c} title={c} className="pixel-swatch" style={{ background: c }} onClick={() => pickColor(c)} />
                ))}
              </div>
            </>
          )}
          <div className="pixel-previews" aria-label={t('pixel.arenaLook')}>
            {[96, 44, 20].map((s) => <ArtPreview key={s} cells={cells} size={s} background={background} borderColor={borderColor} borderWidth={borderWidth} />)}
          </div>
          <div className="pixel-dirs" role="group" aria-label={t('pixel.dirPreview')}>
            {DIRS.map(([theta, key]) => (
              <figure key={key}><ArtPreview cells={cells} size={52} background={background} borderColor={borderColor} borderWidth={borderWidth} theta={theta} />
                <figcaption>{t(`pixel.${key}`)}</figcaption></figure>
            ))}
          </div>
          <p className={tooMany ? 'error small' : 'muted small'}>{t('pixel.colorsUsed', { used: colorsUsed, max: maxColors })}{tooMany ? t('pixel.tooMany') : ''}</p>
        </div>
      </div>

      <ul className="pixel-notes">
        {[t('pixel.note'), ...notes].map((n) => <li key={n}>{n}</li>)}
      </ul>
      <div className="pixel-actions">
        {waitMs > 0 && <span className="muted small">{t('pixel.wait', { n: Math.ceil(waitMs / 60000) })}</span>}
        <button type="button" className="pixel-cancel" disabled={busy} onClick={onCancel}>{t('pixel.cancel')}</button>
        <button type="button" className="primary" disabled={!canSave} onClick={() => onSave(encodeArt(cells))}>
          {busy ? t('pixel.saving') : saveLabel}
        </button>
      </div>
    </div>
  );
}

/** 원 안에 칸이 또렷하게 보이는 작은 미리 보기(아레나와 같은 그림) */
function ArtPreview({ cells, size, background, borderColor, borderWidth, theta = 0 }: {
  cells: Cells; size: number; background: string; borderColor: string | null; borderWidth: number | null; theta?: number; // theta: 가는 방향(0 = 오른쪽). 그 방향을 바라보게 돌린 모습
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1), box = size + 8;
    c.width = box * dpr; c.height = box * dpr;
    const ctx = c.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#1f2a37';
    ctx.fillRect(0, 0, box, box);
    const r = size / 2, x = box / 2, y = box / 2;
    ctx.fillStyle = background;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    const art = document.createElement('canvas');
    art.width = N; art.height = N;
    const actx = art.getContext('2d')!;
    cells.forEach((v, i) => { if (v) { actx.fillStyle = v; actx.fillRect(i % N, Math.floor(i / N), 1, 1); } });
    const pose = artPose(theta);
    drawArt(ctx, art, x, y, r, pose.scaleX, pose.rotation);
    ctx.strokeStyle = borderColor ?? '#11372a';
    ctx.lineWidth = borderLineWidth(r, borderWidth);
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke();
  }, [cells, size, background, borderColor, borderWidth, theta]);
  return <canvas ref={ref} style={{ width: size + 8, height: size + 8 }} aria-hidden="true" />;
}
