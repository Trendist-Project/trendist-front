import { useEffect, useRef } from 'react';
import type { LevelBadge } from '../api/types';
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
            <TurtleIcon level={lv} />
            <span>{lv}레벨</span>
          </li>
        ))}
      </ol>
    </figure>
  );
}

const RAINBOW = ['#ff4d4d', '#ff9f1c', '#ffe14d', '#4cd964', '#3fa9ff', '#7b61ff', '#d65cff'];

/**
 * 성장 아이콘 한 개(아레나와 같은 그림). 가이드와 정보 팝업이 쓴다.
 * badge가 있으면 바탕을 그 색·진하기로(rainbow면 무지개 그라데이션) 칠한다. 레벨 표시 옆 아이콘용(4.9).
 */
export function TurtleIcon({ level, size = SIZE, badge }: { level: number; size?: number; badge?: LevelBadge | null }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current!;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = size * dpr; canvas.height = size * dpr;
    const ctx = canvas.getContext('2d')!;
    ctx.scale(dpr, dpr);
    const c = size / 2, r = size / 2 - 3;
    // 아레나의 아이콘과 같은 순서: 바탕 원 → 거북이 → 테두리
    if (badge?.rainbow) {
      const g = ctx.createLinearGradient(c - r, c - r, c + r, c + r);
      RAINBOW.forEach((col, i) => g.addColorStop(i / (RAINBOW.length - 1), col));
      ctx.fillStyle = g;
    } else {
      ctx.fillStyle = badge?.color ?? TURTLE_BASE;
      ctx.globalAlpha = Math.max(0, Math.min(100, badge?.color ? badge.alpha : 100)) / 100;
    }
    ctx.beginPath(); ctx.arc(c, c, r, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;
    drawTurtle(ctx, c, c, r, level);
    ctx.strokeStyle = '#11372a';
    ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.arc(c, c, r, 0, Math.PI * 2); ctx.stroke();
  }, [level, size, badge]);
  return <canvas ref={ref} style={{ width: size, height: size, flex: 'none' }} aria-hidden="true" />;
}
