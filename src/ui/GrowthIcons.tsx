import { useEffect, useRef } from 'react';
import { drawTurtle, TURTLE_BASE } from '../game/turtle';

const LEVELS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
const SIZE = 56; // 아이콘 하나의 CSS 크기(px)

/** 가이드용(4.9, 4.17): 1~10레벨 성장 아이콘을 아레나와 같은 그림으로 나란히 보여 준다. */
export function GrowthIcons() {
  return (
    <figure className="growth-icons" aria-label="레벨별 성장 아이콘: 1레벨 동그라미에서 10레벨 완성된 거북이까지">
      <ol>
        {LEVELS.map((lv) => (
          <li key={lv}>
            <Icon level={lv} />
            <span>{lv}레벨</span>
          </li>
        ))}
      </ol>
    </figure>
  );
}

function Icon({ level }: { level: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current!;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = SIZE * dpr; canvas.height = SIZE * dpr;
    const ctx = canvas.getContext('2d')!;
    ctx.scale(dpr, dpr);
    const c = SIZE / 2, r = SIZE / 2 - 3;
    // 아레나의 아이콘과 같은 순서: 바탕 원 → 거북이 → 테두리
    ctx.fillStyle = TURTLE_BASE;
    ctx.beginPath(); ctx.arc(c, c, r, 0, Math.PI * 2); ctx.fill();
    drawTurtle(ctx, c, c, r, level);
    ctx.strokeStyle = '#11372a';
    ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.arc(c, c, r, 0, Math.PI * 2); ctx.stroke();
  }, [level]);
  return <canvas ref={ref} style={{ width: SIZE, height: SIZE }} aria-hidden="true" />;
}
