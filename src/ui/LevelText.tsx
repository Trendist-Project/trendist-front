import { Fragment, useEffect, useState } from 'react';
import { api } from '../api/client';
import type { LevelBadge } from '../api/types';
import { TurtleIcon } from './GrowthIcons';

/** 레벨별 아이콘 바탕은 DB(levels)에서 받아 한 번만 불러 둔다(4.9). 실패하면 다음에 다시 시도한다 */
let badges: Map<number, LevelBadge> | null = null;
let loading: Promise<void> | null = null;
function loadBadges() {
  if (!loading) {
    loading = api.levelBadges()
      .then((list) => { badges = new Map(list.map((b) => [b.level, b])); })
      .catch(() => { loading = null; });
  }
  return loading;
}

/** 레벨별 아이콘 바탕(DB). 아직 못 받았으면 null */
export function useLevelBadges() {
  const [, setReady] = useState(badges !== null);
  useEffect(() => {
    if (badges) return;
    let alive = true;
    loadBadges().then(() => { if (alive) setReady(true); });
    return () => { alive = false; };
  }, []);
  return badges;
}

/** 레벨 표시: 그 레벨의 성장 거북이 아이콘(바탕색은 레벨 구간별, 100레벨은 무지개) + "prefix+숫자+suffix"(예: Lv.6). */
export function LevelText({ level, prefix = '', suffix = '', size = 32 }: { level: number; prefix?: string; suffix?: string; size?: number }) {
  const map = useLevelBadges();
  return (
    <span className="level-text">
      <TurtleIcon level={level} size={size} badge={map?.get(level) ?? null} />
      {prefix}{level}{suffix}
    </span>
  );
}

const TENS = [10, 20, 30, 40, 50, 60, 70, 80, 90];

/**
 * 가이드용(4.9, 4.17): 레벨 표시 옆 아이콘의 바탕이 레벨마다 어떻게 바뀌는지 10~99레벨 전체와 100레벨을 보여 준다.
 * 가로는 일의 자리(0~9), 세로는 10레벨 구간. 실제 값은 DB(levels)에서 받아 그린다.
 */
export function LevelIconGallery() {
  const map = useLevelBadges();
  return (
    <figure className="level-gallery" aria-label="레벨별 아이콘 바탕: 10레벨 구간마다 색이 바뀌고 일의 자리가 클수록 진해지며, 100레벨은 무지개">
      <div className="lg-grid">
        <span />
        {Array.from({ length: 10 }, (_, d) => <span key={d} className="lg-head">{d}</span>)}
        {TENS.map((t) => (
          <Fragment key={t}>
            <span className="lg-row">{t}~{t + 9}</span>
            {Array.from({ length: 10 }, (_, d) => {
              const lv = t + d;
              return (
                <span key={d} title={`${lv}레벨`}>
                  <TurtleIcon level={lv} size={26} badge={map?.get(lv) ?? null} />
                </span>
              );
            })}
          </Fragment>
        ))}
      </div>
      <div className="lg-top">
        <TurtleIcon level={100} size={34} badge={map?.get(100) ?? null} />
        <span><strong>100레벨</strong> 무지개 그라데이션</span>
      </div>
    </figure>
  );
}
