import { useEffect, useState } from 'react';
import { api } from '../api/client';
import type { SkillInfo } from '../api/types';

/**
 * 스킬 목록(4.33). 서버(DB skills)에서 받아 기억해 둔다(이름·설명은 번역 파일이라 언어와 무관하다). 못 받으면(오프라인·서버 오류) 기본 목록으로 게임이 돌아가게 한다.
 * 쿨타임은 서버가 판정하므로 여기 값은 툴팁에 보여 주는 용도다.
 */
const FALLBACK: SkillInfo[] = [
  { code: 'shield', icon: '🛡', category: 'DEFENSE', defaultKey: 'Digit1', cooldownSeconds: 30, requiredLevel: 10 },
  { code: 'hook', icon: '🪝', category: 'ATTACK', defaultKey: 'Digit2', cooldownSeconds: 30, requiredLevel: 15 },
  { code: 'shockwave', icon: '💥', category: 'ATTACK', defaultKey: 'Digit3', cooldownSeconds: 30, requiredLevel: 20 },
  { code: 'stealth', icon: '👻', category: 'STEALTH', defaultKey: 'Digit4', cooldownSeconds: 30, requiredLevel: 25 },
  { code: 'dash', icon: '⚡', category: 'MOVE', defaultKey: 'Space', cooldownSeconds: 30, requiredLevel: 1 },
];
let cache: SkillInfo[] | null = null;
let pending: Promise<SkillInfo[]> | null = null;

function load(): Promise<SkillInfo[]> {
  if (cache) return Promise.resolve(cache);
  pending ??= api.skills().then((list) => { if (list.length) cache = list; return list.length ? list : FALLBACK; })
    .catch(() => FALLBACK).finally(() => { pending = null; });
  return pending;
}

export function useSkills(): SkillInfo[] {
  const [skills, setSkills] = useState<SkillInfo[]>(() => cache ?? FALLBACK);
  useEffect(() => {
    let alive = true;
    load().then((l) => { if (alive) setSkills(l); });
    return () => { alive = false; };
  }, []);
  return skills;
}
