import { useEffect, useState } from 'react';
import { api } from '../api/client';
import type { SkillInfo } from '../api/types';

/**
 * 스킬 목록(4.33). 서버(DB skills)에서 받아 기억해 둔다(이름·설명은 번역 파일이라 언어와 무관하다). 못 받으면(오프라인·서버 오류) 기본 목록으로 게임이 돌아가게 한다.
 * 쿨타임은 서버가 판정하므로 여기 값은 툴팁에 보여 주는 용도다.
 */
const FALLBACK: SkillInfo[] = [
  { code: 'dash', icon: '⚡', category: 'UTILITY', defaultKey: 'Space', cooldownSeconds: 30, requiredLevel: 1 },
  { code: 'shield', icon: '🛡', category: 'DEFENSE', defaultKey: 'Digit1', cooldownSeconds: 30, requiredLevel: 5 },
  { code: 'hook', icon: '🪝', category: 'ATTACK', defaultKey: 'Digit2', cooldownSeconds: 30, requiredLevel: 10 },
  { code: 'slow', icon: '🧊', category: 'CC', defaultKey: 'Digit9', cooldownSeconds: 30, requiredLevel: 15 },
  { code: 'stealth', icon: '👻', category: 'UTILITY', defaultKey: 'Digit4', cooldownSeconds: 30, requiredLevel: 20 },
  { code: 'shockwave', icon: '🌀', category: 'DEFENSE', defaultKey: 'Digit3', cooldownSeconds: 30, requiredLevel: 25 },
  { code: 'cleanse', icon: '✨', category: 'UTILITY', defaultKey: 'Digit6', cooldownSeconds: 30, requiredLevel: 30 },
  { code: 'darkness', icon: '🕶️', category: 'CC', defaultKey: 'Digit5', cooldownSeconds: 30, requiredLevel: 35 },
  { code: 'heal', icon: '➕', category: 'UTILITY', defaultKey: 'Digit8', cooldownSeconds: 60, requiredLevel: 40 },
  { code: 'poison', icon: '☠️', category: 'ATTACK', defaultKey: 'Digit7', cooldownSeconds: 30, requiredLevel: 45 },
  { code: 'stun', icon: '💫', category: 'CC', defaultKey: 'Digit0', cooldownSeconds: 30, requiredLevel: 50 },
  { code: 'quake', icon: '💥', category: 'ATTACK', defaultKey: 'KeyX', cooldownSeconds: 30, requiredLevel: 55 },
  { code: 'flame', icon: '🔥', category: 'ATTACK', defaultKey: 'KeyZ', cooldownSeconds: 30, requiredLevel: 60 },
  { code: 'absorb', icon: '🧲', category: 'ATTACK', defaultKey: 'KeyC', cooldownSeconds: 30, requiredLevel: 65 },
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
