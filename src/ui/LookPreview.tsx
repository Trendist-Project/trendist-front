import { useEffect, useMemo, useRef } from 'react';
import type { Look, PixelArtData } from '../api/types';
import { artCanvas, drawArt } from '../game/pixelArt';
import { drawBorderEffect, drawNameTag } from '../game/skin';
import { Trails } from '../game/trails';
import { borderLineWidth, drawTurtle } from '../game/turtle';

/**
 * 꾸미기 미리 보기(4.9): 작은 아레나에서 원이 8자로 돌며 고른 이동 효과를 남기고, 바탕색·테두리·테두리 효과·이름표·그림을
 * 아레나와 같은 그림 코드로 보여 준다. moving이 false면 가운데에 멈춘 원(작은 칸 미리 보기).
 * 모션 줄이기 설정(prefers-reduced-motion)은 따르지 않는다: 갤럭시 등에서 '애니메이션 효과 제거'·절전 모드가 켜져 있으면 이 값이 켜져
 * 이동 효과를 볼 수 없게 되는데, 이 화면은 효과를 확인하려고 일부러 여는 작은 미리 보기라서 항상 움직인다.
 */
export function LookPreview({ look, level, art, name, width = 300, height = 170, moving = true, label = '꾸미기 미리 보기' }: {
  look: Look; level: number; art?: PixelArtData | null; name?: string; width?: number; height?: number; moving?: boolean; label?: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const artImg = useMemo(() => (art ? artCanvas(art.palette, art.pixels) : null), [art]);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    c.width = width * dpr; c.height = height * dpr;
    const ctx = c.getContext('2d')!;
    const still = !moving;
    const trails = new Trails();
    const r = moving ? Math.min(width, height) * 0.13 : Math.min(width, height) * 0.3;
    let raf = 0, last = performance.now(), heading = 0, px = 0, py = 0, first = true;
    const frame = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      const t = now / 1000;
      let x = width / 2, y = height / 2 - (name ? 10 : 0);
      if (!still) {
        x = width / 2 + Math.sin(t * 1.2) * (width / 2 - r - 16);
        y = height / 2 - 6 + Math.sin(t * 2.4) * (height / 2 - r - 22);
        if (!first && Math.hypot(x - px, y - py) > 0.01) heading = Math.atan2(y - py, x - px) + Math.PI / 2;
        first = false; px = x; py = y;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = '#1f2a37'; // 아레나 바닥색
      ctx.fillRect(0, 0, width, height);
      if (!still) {
        trails.update(1, look.trailEffect ?? null, x, y, r, now, look.background);
        trails.draw(ctx, now, dt);
      }
      ctx.fillStyle = look.background;
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
      if (artImg) drawArt(ctx, artImg, x, y, r);
      else drawTurtle(ctx, x, y, r, Math.max(1, Math.min(level, 10)), heading);
      const lw = borderLineWidth(r, look.borderWidth);
      ctx.strokeStyle = look.borderColor ?? '#11372a';
      ctx.lineWidth = lw;
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke();
      drawBorderEffect(ctx, look.borderEffect, x, y, r, look.background, look.borderColor ?? '#ffffff', lw, still ? 0.6 : t);
      if (name) drawNameTag(ctx, name, x, y + r + 5, Math.max(11, Math.min(15, r * 0.55)), look.nameColor, look.nameStyle, look.borderColor ?? '#11372a');
      if (!still || look.borderEffect && moving) raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [look, level, artImg, name, width, height, moving]);
  return <canvas ref={ref} className="look-preview" style={{ width, height }} aria-label={label} />;
}
