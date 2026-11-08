import { useEffect, useRef } from 'react';
import { artImage, drawArt } from '../game/pixelArt';
import { drawBorderEffect, type OrbLook } from '../game/skin';
import { BOT_BASE, borderLineWidth, drawTurtle, TURTLE_BASE } from '../game/turtle';

/**
 * 한 플레이어·봇의 원 모양(아레나에서 보이는 그대로): 바탕색, 성장 거북이 또는 픽셀 그림, 테두리 색·두께, 테두리 효과.
 * 봇은 아레나처럼 빨간 바탕이다. 테두리 효과가 있거나 그림을 아직 받는 중이면 움직여 그리고, 아니면 한 번만 그린다.
 */
export function PlayerOrb({ look, level, size = 40 }: { look: OrbLook; level: number; size?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = size * dpr; canvas.height = size * dpr;
    const ctx = canvas.getContext('2d')!;
    let raf = 0;
    const draw = (now: number) => {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, size, size);
      const c = size / 2, r = size / 2 - Math.max(3, size * 0.12); // 테두리 효과가 둘레에 번질 자리를 남긴다
      const bg = look.bot ? BOT_BASE : look.bg ?? TURTLE_BASE;
      ctx.fillStyle = bg;
      ctx.beginPath(); ctx.arc(c, c, r, 0, Math.PI * 2); ctx.fill();
      const art = look.art && !look.bot ? artImage(look.art) : null;
      if (art) drawArt(ctx, art, c, c, r);
      else drawTurtle(ctx, c, c, r, Math.max(1, Math.min(level, 10)));
      const lw = borderLineWidth(r, look.borderWidth);
      ctx.strokeStyle = look.borderColor ?? '#11372a';
      ctx.lineWidth = lw;
      ctx.beginPath(); ctx.arc(c, c, r, 0, Math.PI * 2); ctx.stroke();
      if (!look.bot) drawBorderEffect(ctx, look.borderEffect, c, c, r, bg, look.borderColor ?? '#ffffff', lw, now / 1000);
      if ((look.borderEffect && !look.bot) || (look.art && !look.bot && !art)) raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [look, level, size]);
  return <canvas ref={ref} style={{ width: size, height: size, flex: 'none' }} aria-hidden="true" />;
}
