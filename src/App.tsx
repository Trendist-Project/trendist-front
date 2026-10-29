import { useEffect, useRef, useState } from 'react';
import { api, ApiFailure, resumeSession } from './api/client';
import { takeGoogleResult } from './googleAuth';
import type { PlayerSummary } from './api/types';
import { MainScreen } from './ui/MainScreen';
import { NicknameScreen } from './ui/NicknameScreen';
import { GameScreen } from './ui/GameScreen';

type Phase = { kind: 'main' } | { kind: 'nickname' } | { kind: 'game'; player: PlayerSummary; guest: boolean; key: number };

export function App() {
  // 새로고침해도 항상 메인 화면부터 시작한다(3.1). 재방문 게스트는 [시작]을 누르면 쿠키의 방문자 ID로 같은 계정에 들어간다.
  const [phase, setPhase] = useState<Phase>({ kind: 'main' });
  const [error, setError] = useState<string | null>(null);
  // 메인 화면에서 이미 구글 계정으로 로그인한 상태인지(갱신 토큰). 맞으면 구글 버튼 없이 [시작]만 보여 준다. 확인 전에는 null
  const [account, setAccount] = useState<boolean | null>(null);
  const googlePending = useRef(false);

  /** 토큰이 있는 상태에서 플레이어 유무로 다음 화면을 정한다. */
  async function route() {
    const me = await api.me();
    setPhase(me.player ? { kind: 'game', player: me.player, guest: me.guest, key: Date.now() } : { kind: 'nickname' });
  }

  async function start() {
    setError(null);
    try {
      // 로그인한 계정(갱신 토큰)이나 재방문 게스트(방문자 ID)면 그대로 이어 가고, 처음이면 새 게스트로 시작한다
      if (!(await resumeSession())) await api.startGuest();
      await route();
    } catch (e) {
      setError(e instanceof ApiFailure ? e.message : '서버에 연결할 수 없어요');
    }
  }

  // 구글 계정 선택을 마치고 돌아왔으면(9.3) 그 ID 토큰으로 로그인하고 바로 게임으로 들어간다.
  // 게스트로 하던 중이었다면 방문자 ID 쿠키로 그 기록에 연결된다
  useEffect(() => {
    const r = takeGoogleResult();
    if (!r) return;
    googlePending.current = true;
    if ('error' in r) {
      if (r.error !== 'access_denied') setError('구글 로그인에 실패했어요. 다시 시도해 주세요'); // 사용자가 취소한 경우는 조용히
      googlePending.current = false;
      setAccount(false);
      return;
    }
    api.googleLogin(r.idToken, r.nonce)
      .then(route)
      .catch((e) => { setError(e instanceof ApiFailure ? e.message : '구글 로그인에 실패했어요'); setAccount(false); })
      .finally(() => { googlePending.current = false; });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (phase.kind !== 'main') return;
    // 구글 로그인에서 막 돌아와 처리하는 중이면 확인하지 않는다(갱신 토큰 회전과 겹치지 않게). 실패하면 그때 버튼을 보여 준다
    if (googlePending.current) return;
    let alive = true;
    setAccount(null);
    // 세션만 이어 보고(새 게스트 행은 만들지 않는다) 게스트가 아닌 계정이면 로그인한 상태로 본다
    resumeSession()
      .then((ok) => (ok ? api.me().then((me) => !me.guest) : false))
      .catch(() => false)
      .then((v) => { if (alive) setAccount(v); });
    return () => { alive = false; };
  }, [phase.kind]);

  async function logout() {
    await api.logout().catch(() => { /* 서버에 못 닿아도 화면은 나간다 */ });
    setPhase({ kind: 'main' });
  }

  async function createPlayer(nickname: string) {
    const player = await api.createPlayer(nickname);
    const me = await api.me();
    setPhase({ kind: 'game', player, guest: me.guest, key: Date.now() });
  }

  switch (phase.kind) {
    case 'main':
      return <MainScreen onStart={start} error={error} loggedIn={account} />;
    case 'nickname':
      return <NicknameScreen onSubmit={createPlayer} />;
    case 'game':
      return <GameScreen key={phase.key} initialPlayer={phase.player} guest={phase.guest} onLogout={logout} />;
  }
}
