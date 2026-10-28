import { useState } from 'react';
import { api, ApiFailure } from './api/client';
import type { PlayerSummary } from './api/types';
import { MainScreen } from './ui/MainScreen';
import { NicknameScreen } from './ui/NicknameScreen';
import { GameScreen } from './ui/GameScreen';

type Phase = { kind: 'main' } | { kind: 'nickname' } | { kind: 'game'; player: PlayerSummary };

export function App() {
  // 새로고침해도 항상 메인 화면부터 시작한다(3.1). 재방문 게스트는 [시작]을 누르면 쿠키의 방문자 ID로 같은 계정에 들어간다.
  const [phase, setPhase] = useState<Phase>({ kind: 'main' });
  const [error, setError] = useState<string | null>(null);

  /** 토큰이 있는 상태에서 플레이어 유무로 다음 화면을 정한다. */
  async function route() {
    const me = await api.me();
    setPhase(me.player ? { kind: 'game', player: me.player } : { kind: 'nickname' });
  }

  async function start() {
    setError(null);
    try {
      await api.startGuest();
      await route();
    } catch (e) {
      setError(e instanceof ApiFailure ? e.message : '서버에 연결할 수 없어요');
    }
  }

  async function createPlayer(nickname: string) {
    const player = await api.createPlayer(nickname);
    setPhase({ kind: 'game', player });
  }

  switch (phase.kind) {
    case 'main':
      return <MainScreen onStart={start} error={error} />;
    case 'nickname':
      return <NicknameScreen onSubmit={createPlayer} />;
    case 'game':
      return <GameScreen initialPlayer={phase.player} />;
  }
}
